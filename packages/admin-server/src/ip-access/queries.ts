import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts activeAdminsQuery · activeSessionsQuery ·
//       teamMappingsQuery · findAll
// 바꾼 점:
//  - 재직 조건은 resignAt IS NULL OR resignAt > now — 우리 resignAt 은 효력 시각이다(2b ④ R1). hangang 은 날짜 cutoff.
//  - 🔴 팀 배정 조건(EXISTS teamUserMap)을 뺐다 — 우리 인증은 무소속 계정도 통과시킨다(빈 teamNos, 2f-1 스펙 P12).
//  - 목록은 대상 이름을 범위별 LEFT JOIN 으로 싣는다(P13).
// 🔴 모듈 수준 함수다 — DB 없이 컴파일된 SQL 을 단위 테스트가 잰다. 🔴 모두 비잠금이다(ipAccessRules 를 잠그는 곳은 IP 쓰기의
//    대상 행뿐 — rule-locks lockRule).

/** 목록 · 단건 보기. 정렬 scopeType(문자 순 = global · team · user) → ruleNo */
export function ruleViewQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules as r')
    .leftJoin('teams as t', (join) =>
      join.onRef('t.teamNo', '=', 'r.scopeRefNo').on('r.scopeType', '=', 'team'),
    )
    .leftJoin('users as u', (join) =>
      join.onRef('u.userNo', '=', 'r.scopeRefNo').on('r.scopeType', '=', 'user'),
    )
    .select([
      'r.ruleNo',
      'r.scopeType',
      'r.scopeRefNo',
      't.teamName',
      'u.userName',
      'u.userId',
      'r.cidr',
      'r.description',
      'r.revision',
      'r.createAt',
      'r.updateAt',
    ])
    .orderBy('r.scopeType')
    .orderBy('r.ruleNo')
}

/** 미리보기의 지금 규칙 — 시뮬레이션이 대상을 지목하는 ruleNo 포함. 🔴 잠금 없음(화면이 칠 때마다 부른다) */
export function identifiedRulesQuery(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules')
    .select(['ruleNo', 'scopeType', 'scopeRefNo', 'cidr'])
    .orderBy('ruleNo')
}

/** 오늘 로그인할 수 있는 사용자 전원. 🔴 전권자만이 아니다 — 일반 관리자가 잠기는 것을 막는 서버 가드는 없다 */
export function activeUsersQuery(db: Kysely<AdminDatabase>, now: Date) {
  return db
    .selectFrom('users')
    .select(['userNo', 'userId', 'userName'])
    .where((eb) => eb.or([eb('resignAt', 'is', null), eb('resignAt', '>', now)]))
    .orderBy('userId')
}

/** 팀 배정 전량 — 대표 팀(가장 작은 teamNo)은 buildLockoutCandidates 가 고른다. 🔴 빈 userNos 로 부르지 않는다(IN () 구문 오류) */
export function teamMappingsQuery(db: Kysely<AdminDatabase>, userNos: readonly bigint[]) {
  return db.selectFrom('teamUserMap').select(['userNo', 'teamNo']).where('userNo', 'in', userNos)
}

/** 활성 세션 — 폐기 안 됨 ∧ 만료 안 됨. ipAddress 가 null 이면 "판정 불가" 다. 🔴 빈 userNos 로 부르지 않는다 */
export function activeSessionsQuery(
  db: Kysely<AdminDatabase>,
  userNos: readonly bigint[],
  now: Date,
) {
  return db
    .selectFrom('sessions')
    .select(['userNo', 'ipAddress'])
    .where('userNo', 'in', userNos)
    .where('isRevoked', '=', false)
    .where('expireAt', '>', now)
}
