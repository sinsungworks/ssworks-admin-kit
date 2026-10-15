import { BusinessError, CommonErrorCodes, applicableIpLayer } from '@ssworks/admin-shared'
import { sql, type SqlBool, type Transaction } from 'kysely'
import { lockGuardRow } from '../database/guard-locks.js'
import type { AdminDatabase } from '../database/types.js'
import { ipRuleSetQuery } from '../ip-access/rule-set.js'
import { ACCOUNT_MESSAGES } from './errors.js'

// 정본: hangang-home apps/api/src/core/permissions/monotonicity.ts lockSuperAdminGuard · countReachableSuperAdmins ·
//       assertSuperAdminSurvives
// 바꾼 점:
//  - 셈은 재직(resignAt IS NULL) ∧ 역할에 '*'. IP 접근 제어 모듈이 있으면(표시 토큰) 그 위에 적용 층이 global(2f-1 스펙 ② R1 ·
//    P4 — hangang countReachableSuperAdmins · A1). user · team 층에 묶인 전권자는 "어디서든 로그인해 권한을 되돌린다" 를
//    보증하지 못한다. CIDR 이 그 사람의 주소를 통과시키는지는 보지 않는다 — "주소로 좁혀졌는가" 만 본다.
//  - '*' 판정은 JSON_CONTAINS — hangang 의 LIKE '%"*"%' 는 문자열 매칭이라 '*' 를 품은 키에 오탐한다(2d 스펙 §14 R1-2).
//  - 잠금 · 잠금 단계 · 전 셈 · 쓰기 · 후 셈 · 판정을 withSuperAdminSurvival 하나로 묶는다 — 부르는 쪽이 순서를 틀리지 않게.
//  - 셈을 대상 잠금 뒤로 옮겼다(잠금 단계 콜백 — 2d-3 스펙 ① A). hangang 은 센티넬 → 셈 → 대상 잠금이었다 — 셈이 연 읽기
//    뷰가 대상 잠금을 기다린 사이의 커밋을 못 봐 감사 before · item 이 낡고(OFF), ON 은 1020 이었다(2d-3 스펙 §14 R1).
// 🔴 센티넬 잠금은 트랜잭션의 첫 문장이어야 한다 — InnoDB REPEATABLE READ 는 첫 **비잠금** SELECT 에서 읽기 뷰를 만든다.
//    그보다 먼저 셈을 읽으면 앞서 이 행을 쥐었던 트랜잭션의 커밋을 못 본다(2d §14 R1-3a 실측).
// 🔴 셈은 잠금 단계 뒤다 — 이 트랜잭션의 첫 비잠금 읽기라 읽기 뷰가 여기서 열린다. 잠금 단계에 비잠금 SELECT 를 두면 뷰가
//    먼저 열려 재배치가 무너진다(2d-3 스펙 C2). 센티넬이 셈을 줄이는 쓰기를 모두 줄 세우므로 센티넬 뒤 · 셈 전에 커밋될 수
//    있는 것은 셈을 늘리거나 셈과 무관한 쓰기뿐이다 — 전 셈은 그대로 맞다.
// 🔴 셈에 FOR UPDATE 를 붙이지 않는다 — 대상 행 잠금과 전 행 스캔이 엇갈려 교착한다(hangang).
// 🔴 한 트랜잭션은 guardLocks 행을 둘 이상 잡지 않는다. 이 함수들은 Transaction 만 받는다 — 트랜잭션 밖에서 부를 수 없게.
// 셈을 늘리기만 하는 쓰기(역할 · 사용자 만들기 · 재입사)는 잠그지 않는다 — 늘어나는 것은 놓쳐도 안전하다.

/** 장 0009 의 시드 행 이름 — 장은 리터럴로 넣는다(같은 값인지는 DB 테스트가 잰다) */
export const GUARD_LOCK_SUPER_ADMIN = 'superAdminSurvival'

/**
 * 잔존으로 감쌀 수 있는 쓰기의 두 단계(2d-3 스펙 C1).
 * - `lock` — 🔴 잠금 읽기(`FOR UPDATE`)와 판정 · revision · 상태 검사만. 남이 대상 행 잠금 없이 바꿀 수 있는 결정 행(대상
 *   users ⋈ roles · 줄 역할 · 팀 · 다른 기본 역할)을 모두 여기서 잠근다(C3). 비잠금 SELECT(보기 읽기 · 쓰는 중 검사 · 셈)를
 *   두지 않는다(C2).
 * - `write` — 셈 뒤. 보기 읽기 · 대상 아래 행(그 사용자의 소속 · 재직 이력)의 잠금 읽기 · 쓰기 · 세션 폐기(C5).
 * 잔존이 필요 없는 갈래는 `steps.write(await steps.lock())` 로 같은 순서를 부른다.
 */
export interface LockedWrite<L, T> {
  lock: () => Promise<L>
  write: (locked: L) => Promise<T>
}

export async function lockSuperAdminGuard(trx: Transaction<AdminDatabase>): Promise<void> {
  await lockGuardRow(trx, GUARD_LOCK_SUPER_ADMIN)
}

/**
 * 셈의 갈래(2f-1 스펙 P3 · P4). `ipAware` 는 IP 접근 제어 모듈의 표시 토큰(IP_ACCESS_ENABLED)이 있을 때만 참이다.
 * 🔴 규칙 표의 유무로 가르지 않는다 — 장은 모두 필수라 표는 늘 있다. 모듈을 안 쓰는 소비자가 시드를 지워도 셈이 0 으로
 *    떨어져 잔존이 조용히 꺼지면 안 된다.
 */
export interface SurvivalCount {
  ipAware: boolean
}

/** 재직(퇴사 예정도 뺀다) · 역할에 '*' 가 있는 사용자 수 — ipAware 면 그중 적용 층이 global 인 사람만 */
export async function countSuperAdmins(
  trx: Transaction<AdminDatabase>,
  count: SurvivalCount,
): Promise<number> {
  if (!count.ipAware) {
    const row = await trx
      .selectFrom('users as u')
      .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
      .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
      .where('u.resignAt', 'is', null)
      .where(sql<SqlBool>`json_contains(${sql.ref('r.permissions')}, '"*"')`)
      .executeTakeFirstOrThrow()
    return Number(row.n)
  }
  // 🔴 대표 팀 = 가장 작은 teamNo — 인증(kysely-auth.repository findPrincipal)과 같은 규칙이다. 정책이 고르는 층과 셈이 고르는
  //    층이 갈리면 보증한 사람과 실제로 로그인하는 사람이 달라진다. LEFT JOIN — 무소속 전권자도 센다(팀 층이 안 걸릴 뿐).
  const rows = await trx
    .selectFrom('users as u')
    .innerJoin('roles as r', 'r.roleNo', 'u.roleNo')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('teamUserMap')
          .select((sub) => ['teamUserMap.userNo', sub.fn.min('teamUserMap.teamNo').as('teamNo')])
          .groupBy('teamUserMap.userNo')
          .as('primaryTeam'),
      (join) => join.onRef('primaryTeam.userNo', '=', 'u.userNo'),
    )
    .select(['u.userNo', 'primaryTeam.teamNo'])
    .where('u.resignAt', 'is', null)
    .where(sql<SqlBool>`json_contains(${sql.ref('r.permissions')}, '"*"')`)
    .execute()
  if (rows.length === 0) return 0
  // 🔴 비잠금 — 셈과 같은 읽기 뷰다. IP 쓰기는 모두 이 센티넬을 잡으므로 뷰 뒤에 바뀌는 규칙이 없다(2f-1 스펙 §5-3).
  const rules = await ipRuleSetQuery(trx).execute()
  return rows.filter(
    (row) =>
      applicableIpLayer(rules, {
        userNo: row.userNo,
        teamNos: row.teamNo == null ? [] : [row.teamNo],
      }) === 'global',
  ).length
}

/** "0 이면 거부" 가 아니라 "있었는데 0 이 되면 거부" — 이미 0 인 저장소를 마비시키지 않는다 */
export function assertSuperAdminSurvives(before: number, after: number): void {
  if (before >= 1 && after < 1) {
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, ACCOUNT_MESSAGES.lastSuperAdmin)
  }
}

/**
 * 잔존을 줄일 수 있는 쓰기를 감싼다 — 센티넬(첫 문장) → lock() → 전 셈 → write(locked) → 후 셈 → 판정(던지면 롤백)
 * 🔴 호출자는 트랜잭션의 첫 호출로 부른다 — 앞선 SELECT(revision 확인 등)가 읽기 뷰를 먼저 열면 셈이 낡는다
 * 🔴 count 는 부르는 쪽이 정한다 — 역할 · 사용자는 표시 토큰 유무, IP 쓰기는 늘 { ipAware: true }(2f-1 스펙 P3)
 */
export async function withSuperAdminSurvival<L, T>(
  trx: Transaction<AdminDatabase>,
  steps: LockedWrite<L, T>,
  count: SurvivalCount,
): Promise<T> {
  await lockSuperAdminGuard(trx)
  const locked = await steps.lock()
  const before = await countSuperAdmins(trx, count)
  const result = await steps.write(locked)
  assertSuperAdminSurvives(before, await countSuperAdmins(trx, count))
  return result
}
