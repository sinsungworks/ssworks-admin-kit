import { Inject, Injectable } from '@nestjs/common'
import type {
  AdminLegalDocument,
  AdminLegalHistoryItem,
  AdminLegalPublish,
  AdminLegalPublishResult,
} from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { GUARD_LOCK_LEGAL_PUBLISH, lockGuardRow } from '../database/guard-locks.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { legalContentHash } from './content-hash.js'
import { legalNotFound, legalRevisionConflict, legalSameContent } from './errors.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/legal.service.ts · legal.repository.ts(두 정렬 키 · LEFT JOIN · 이력
//       본문 제외 · toISOString · 같은 본문 409) + ssworks-axion-admin legal.service.ts(발행 응답 { legalDocNo, contentHash })
// 바꾼 점:
//  - 미발행 현재본은 404 가 아니라 { item: null }(3e D15 — 두 정본은 404). 단건은 문서 그대로(3e §9).
//  - 🔴 발행은 한 트랜잭션이다 — guardLocks 행 legalPublish 가 첫 문장(⑩ L1), 시행본 잠금 읽기(B15), 기준 판 검사(3e ⑤ V2 —
//    두 정본에 없었다) → 같은 본문 검사 → INSERT. gise 는 트랜잭션 없이 검사 · 삽입이라 동시 발행 둘이 모두 들어갔다.
//  - 리포지토리 층을 두지 않는다(팀 · 역할 서비스와 같은 모양) — 테이블 교체 지점이 필요 없다.
// 🔴 append-only — 수정 · 삭제 메서드를 만들지 않는다(legal-append-only.test.ts 가 소스 전체를 본다).
// 🔴 시행본 = 종류별 (publishedAt DESC, legalDocNo DESC) 첫 행. publishedAt 은 초 단위라 같은 초 발행이 실제로 난다 — 두 키 중
//    하나라도 빠지면 "현재본" 이 요청마다 달라진다(gise). 현재본 · 이력 · 발행의 읽기가 같은 두 키다.

type HistoryRow = {
  legalDocNo: bigint
  kind: string
  contentHash: string
  publishedAt: Date
  publishedByUserNo: bigint | null
  publishedByUserName: string | null
}

type DocumentRow = HistoryRow & { body: string }

@Injectable()
export class AdminLegalService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  /** 시행본 — 미발행이면 { item: null }(3e D15) */
  async current(kind: string): Promise<{ item: AdminLegalDocument | null }> {
    const row = await runQuery(() =>
      this.documents()
        .select('d.body')
        .where('d.kind', '=', kind)
        .orderBy('d.publishedAt', 'desc')
        .orderBy('d.legalDocNo', 'desc')
        .limit(1)
        .executeTakeFirst(),
    )
    return { item: row === undefined ? null : toDocument(row) }
  }

  /** 발행 이력 최신순 전량 — 🔴 본문 없음(목록이 문서 전량을 끌어오지 않게. 발행은 드물어 페이지가 없다 — 3e §9) */
  async history(kind: string): Promise<{ items: AdminLegalHistoryItem[] }> {
    const rows = await runQuery(() =>
      this.documents()
        .where('d.kind', '=', kind)
        .orderBy('d.publishedAt', 'desc')
        .orderBy('d.legalDocNo', 'desc')
        .execute(),
    )
    return { items: rows.map(toHistoryItem) }
  }

  /** 판 하나(본문 포함) — 옛 판도 */
  async findOne(legalDocNo: bigint): Promise<AdminLegalDocument> {
    const row = await runQuery(() =>
      this.documents().select('d.body').where('d.legalDocNo', '=', legalDocNo).executeTakeFirst(),
    )
    if (row === undefined) throw legalNotFound()
    return toDocument(row)
  }

  /**
   * 새 판을 낸다 — 기준 판이 지금 시행본이 아니면 409 REVISION_CONFLICT, 시행본과 본문이 같으면 409 CONFLICT(3e §9 의 순서).
   * 🔴 해시는 서버만 셈한다 — 클라이언트 해시를 믿으면 동의 기록의 스냅샷을 위조할 수 있다.
   */
  async publish(body: AdminLegalPublish, actorUserNo: bigint): Promise<AdminLegalPublishResult> {
    // 트랜잭션 밖에서 — 1,000,000자 본문의 sha256 이 가드를 쥔 채 돌지 않게
    const contentHash = legalContentHash(body.body)
    return runWriteTransaction(this.db, async (trx) => {
      // 🔴 첫 문장(⑩ L1) — 같은 종류 동시 발행을 한 줄로 세운다. 앞에 비잠금 SELECT 를 두면 읽기 뷰가 먼저 열려 스냅샷 격리
      //    ON 에서 INSERT 의 FK 검사(발행자 users 행)가 1020 을 만난다(§14 R5-5). 가드가 없으면 진 쪽이 기준 판 409 가 아니라
      //    교착 409 가 된다(§14 R5-1).
      await lockGuardRow(trx, GUARD_LOCK_LEGAL_PUBLISH)
      // 🔴 잠금 읽기(B15) — 가드 아래라 비잠금이어도 최신이지만, 비잠금 읽기는 읽기 뷰를 열어 위 1020 의 길을 낸다
      const current = await trx
        .selectFrom('legalDocuments')
        .select(['legalDocNo', 'contentHash'])
        .where('kind', '=', body.kind)
        .orderBy('publishedAt', 'desc')
        .orderBy('legalDocNo', 'desc')
        .limit(1)
        .forUpdate()
        .executeTakeFirst()
      // 🔴 기준 판이 먼저 — 남이 먼저 발행한 것이 진짜 원인이다(3e §9). 같은 본문이어도 낡은 기준이면 REVISION_CONFLICT
      if ((current?.legalDocNo ?? null) !== body.baseLegalDocNo) throw legalRevisionConflict()
      if (current?.contentHash === contentHash) throw legalSameContent()
      const inserted = await trx
        .insertInto('legalDocuments')
        .values({
          kind: body.kind,
          body: body.body,
          contentHash,
          publishedByUserNo: actorUserNo,
        })
        .executeTakeFirstOrThrow()
      const legalDocNo = inserted.insertId
      if (legalDocNo === undefined) {
        throw new Error('legalDocuments INSERT 가 insertId 를 돌려주지 않았다.')
      }
      return { legalDocNo, contentHash }
    })
  }

  /**
   * 발행자 이름은 users 조인으로 파생한다 — 🔴 LEFT JOIN(발행자 SET NULL 이면 이름도 null). INNER 면 지운 계정이 낸 판이
   * 이력에서 통째로 사라진다(gise — axion 은 NOT NULL 이라 INNER 였다).
   */
  private documents() {
    return this.db
      .selectFrom('legalDocuments as d')
      .leftJoin('users as u', 'u.userNo', 'd.publishedByUserNo')
      .select([
        'd.legalDocNo',
        'd.kind',
        'd.contentHash',
        'd.publishedAt',
        'd.publishedByUserNo',
        'u.userName as publishedByUserName',
      ])
  }
}

function toHistoryItem(row: HistoryRow): AdminLegalHistoryItem {
  return {
    legalDocNo: row.legalDocNo,
    kind: row.kind,
    contentHash: row.contentHash,
    // 🔴 계약은 ISO 문자열이다(B16 — gise). 변환은 서비스 경계에서 한다
    publishedAt: row.publishedAt.toISOString(),
    publishedByUserNo: row.publishedByUserNo,
    publishedByUserName: row.publishedByUserName ?? null,
  }
}

function toDocument(row: DocumentRow): AdminLegalDocument {
  return { ...toHistoryItem(row), body: row.body }
}
