import type { Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { AdminLoginState } from './login-policy.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(AUTH_REPOSITORY 인터페이스 · 기대 해시 조건부 교체)
// 바꾼 점: 사용자 쪽 다섯 메서드만이다(스펙 ⑤ A1) — 세션은 패키지 코어 장(0007)이라 컬럼 차이가 없어 패키지 내부
//   AdminSessionStore 가 맡는다. `isActive` 대신 `resignAt`(효력 시각, 스펙 ④ R1). `touchLastLogin` 은 코어 컬럼이 없어
//   뺐다(쓰는 쪽은 login.success 이벤트로 남긴다).
// 2f-2a(스펙 ③ P1 · A9 · A10): updateLoginState 를 지우고 트랜잭션을 받는 원시 둘(lockCredential · writeLoginState)을 더했다 —
//   로그인 확정 · 회전이 users 를 세션보다 먼저 같은 트랜잭션에서 잠가야 한다(2d R10-3 · 로그인 TOCTOU). 카운터 원자성은 패키지
//   도우미(password-check.ts updateLoginState)가 맡는다.

export type { AdminLoginState }

/** 비밀번호 확인 세 자리(로그인 · 변경 · 재인증)가 읽는 행 */
export interface AdminCredential {
  userNo: bigint
  passwordHash: string
  /** 🔴 효력 시각 — 이 시각부터 로그인 · 요청이 막힌다. null = 재직(스펙 ④ R1) */
  resignAt: Date | null
  loginFailCount: number
  lockUntil: Date | null
  isPasswordChangeRequired: boolean
}

/** 매 요청 · `/me` 가 읽는 행 */
export interface AdminPrincipalRecord {
  userNo: bigint
  userId: string
  userName: string
  roleNo: bigint
  roleName: string
  /** 대표 팀 — teamNo 오름차순 첫 행(hangang R34). 팀이 없으면 null */
  teamNo: bigint | null
  teamName: string | null
  /** 역할 권한(검증 전 문자열). 강제 변경 계정이어도 그대로 — 비우는 것은 서비스다 */
  permissions: string[]
  isPasswordChangeRequired: boolean
  resignAt: Date | null
}

/**
 * 사용자 테이블 컬럼이 코어(`users.userId` · `password` · `userName` · `resignAt` …)와 다른 프로젝트는 이 인터페이스를
 * 구현해 `AdminAuthModule.withRepository(MyRepo)` 로 바꾼다. 🔴 컬럼 매핑 옵션은 만들지 않는다(2a §1-4 #5).
 */
export interface AdminAuthRepository {
  findCredentialByUserId(userId: string): Promise<AdminCredential | null>
  findCredentialByNo(userNo: bigint): Promise<AdminCredential | null>
  findPrincipal(userNo: bigint): Promise<AdminPrincipalRecord | null>
  /**
   * 🔴 받은 트랜잭션 위의 **잠금 읽기** — `'update'` = `FOR UPDATE`, `'share'` = `LOCK IN SHARE MODE`(MariaDB 는 `FOR SHARE` 를
   * 받지 않는다 — Kysely `.forShare()` 를 쓰지 않는다). 잠그는 행은 sessions FK(`fkSessionsUser`)가 가리키는 그 users 행이다 —
   * 로그인 확정 · 토큰 회전이 이 잠금을 세션보다 먼저 잡아 퇴사 · 초기화와 교착하지 않는다(2f-2a 스펙 §5-3). 없으면 null.
   * 🔴 교체 구현의 규칙: (a) 반드시 받은 `trx` 위에서 — 다른 연결(`this.db`)이면 R10-3 교착 · 로그인 TOCTOU 가 돌아온다.
   * (b) 돌려주는 `passwordHash` 는 `findCredentialByUserId` 와 같은 컬럼 · 같은 값(정규화 없음) — 로그인 확정이 둘을 비교하고,
   * 다르면 모든 로그인이 "낡음" 401(`login.fail`)이 된다. (c) 그 트랜잭션에서 이 잠금 앞에 비잠금 SELECT 를 두지 않는다
   * (스냅샷 격리 ON 이면 1020).
   */
  lockCredential(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    mode: 'share' | 'update',
  ): Promise<AdminCredential | null>
  /**
   * 잠금 두 컬럼(`loginFailCount` · `lockUntil`)만 쓴다. 🔴 패키지가 같은 트랜잭션에서 먼저 `lockCredential(…, 'update')` 로
   * 잠근다 — 카운터의 원자성은 패키지가 맡는다(2b 스펙 §14 R8 · 2f-2a 스펙 A10).
   * 🔴 반드시 받은 `trx` 위에서 쓴다 — 다른 연결이면 자기 요청이 쥔 X 잠금을 기다려 잠금 대기 초과가 되고, 카운터가 오르지 않아
   * 무차별 대입 잠금이 조용히 꺼진다.
   */
  writeLoginState(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    state: AdminLoginState,
  ): Promise<void>
  /**
   * 🔴 기대 해시(`expectedHash`)가 그대로일 때만 바꾼다 — 바꿀 때 `isPasswordChangeRequired = false` · `loginFailCount = 0`
   * · `lockUntil = null` 을 함께 쓴다. 바뀐 행 수(0 = 검증 뒤 다른 쓰기가 먼저 커밋). 받은 트랜잭션 위에서만 쓴다.
   */
  changePassword(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    expectedHash: string,
    newHash: string,
  ): Promise<number>
}
