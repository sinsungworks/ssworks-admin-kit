import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { AdminObjectStorage } from '../storage/object-storage.js'

// 정본: ssworks-ringside packages/db/src/uploads/cleanup.ts(markExpiredUploads · purgeDeletedUploads)
// 바꾼 점(스펙 U11): 지운 글 30일 유예 · 고아 객체 대조가 없다(비범위 §11). 묶음 100. 저장소 호출은 트랜잭션 밖(문장 하나씩).
//   READ COMMITTED 트랜잭션을 두지 않는다 — 문장 하나가 autocommit 이라 갭 잠금이 문장 안에서만 산다.
// 🔴 객체를 먼저 지우고 행을 지운다 — 행을 먼저 지우면 실패한 객체가 영영 남는다(고아 대조가 없다).
// 🔴 멱등 — 여러 인스턴스가 같은 주기로 돌아도 된다(이미 없는 객체의 delete 는 성공, 이미 지운 행은 0건).
// 🔴 실패한 행은 남아 다음 회차에 uploadNo 순 맨 앞에서 다시 잡힌다 — 실패한 행이 limit 개 이상 쌓이면 뒤 행이 밀린다.
//   저장소 장애가 길면 운영자가 저장소를 고친 뒤 정리가 따라잡는다(서비스 sweep 이 가득 지운 묶음이면 한 회차에
//   SWEEP_MAX_BATCHES 묶음까지 잇는다). 실패한 행을 건너뛰는 커서를 두지 않는다 — 회차 사이 상태가 없어야 멱등이 단순하다.

export const SWEEP_BATCH = 100
/** 한 회차에 purge 를 잇는 최대 묶음 수 — 밀린 행이 많아도 한 틱이 끝없이 돌지 않게 */
export const SWEEP_MAX_BATCHES = 10

export interface SweepResult {
  marked: number
  deleted: number
  failed: number
}

const HOUR_MS = 3_600_000

/** 미첨부 · 미삭제 · 보관 초과를 지움 표시 — 돌아온 값은 바뀐 행 수 */
export async function markExpiredUploads(
  db: Kysely<AdminDatabase>,
  ttlHours: number,
  now: Date,
): Promise<number> {
  const before = new Date(now.getTime() - ttlHours * HOUR_MS)
  const result = await db
    .updateTable('adminUploads')
    .set({ deletedAt: now })
    .where('refType', 'is', null)
    .where('deletedAt', 'is', null)
    .where('createdAt', '<', before)
    .executeTakeFirst()
  return Number(result.numUpdatedRows)
}

/** 지움 표시 행을 uploadNo 순 limit 개 — 객체 delete(멱등) → 성공한 행만 DELETE. 저장소 오류 행은 세고 남긴다 */
export async function purgeDeletedUploads(
  db: Kysely<AdminDatabase>,
  storage: AdminObjectStorage,
  onFailure: (key: string, reason: unknown) => void,
  limit: number = SWEEP_BATCH,
): Promise<{ deleted: number; failed: number }> {
  const rows = await db
    .selectFrom('adminUploads')
    .select(['uploadNo', 'storageKey'])
    .where('deletedAt', 'is not', null)
    .orderBy('uploadNo')
    .limit(limit)
    .execute()
  const done: bigint[] = []
  let failed = 0
  for (const row of rows) {
    try {
      await storage.delete(row.storageKey)
      done.push(row.uploadNo)
    } catch (error) {
      failed += 1
      onFailure(row.storageKey, error)
    }
  }
  if (done.length === 0) return { deleted: 0, failed }
  const result = await db
    .deleteFrom('adminUploads')
    .where('uploadNo', 'in', done)
    .where('deletedAt', 'is not', null)
    .executeTakeFirst()
  return { deleted: Number(result.numDeletedRows), failed }
}
