import type { Transaction } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { AdminLoginState } from './login-policy.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(AUTH_REPOSITORY 인터페이스 · 기대 해시 조건부 교체)
// 바꾼 점: 사용자 쪽 다섯 메서드만이다(스펙 ⑤ A1) — 세션은 패키지 코어 장(0007)이라 컬럼 차이가 없어 패키지 내부
//   AdminSessionStore 가 맡는다. `isActive` 대신 `resignAt`(효력 시각, 스펙 ④ R1). `touchLastLogin` 은 코어 컬럼이 없어
//   뺐다(쓰는 쪽은 login.success 이벤트로 남긴다).

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
   * 🔴 원자적으로 바꾼다 — 현재 행을 잠그고(SELECT … FOR UPDATE) `next(current)` 를 써서 그 결과를 돌려준다. 호출부가
   * 비밀번호 검증 전에 읽은 스냅숏으로 다음 상태를 셈하면 동시 요청이 같은 값을 읽어 덜 센다(최종 리뷰 F2).
   * 교체 구현도 원자성을 지킨다(행 잠금 또는 compare-and-set 재시도). 행이 없으면 쓰지 않고 next({ 0, null }) 를 돌려준다.
   * 🔴 argon2 를 이 안에서 부르지 않는다 — 호출부가 검증을 끝낸 뒤에 부른다.
   */
  updateLoginState(
    userNo: bigint,
    next: (current: AdminLoginState) => AdminLoginState,
  ): Promise<AdminLoginState>
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
