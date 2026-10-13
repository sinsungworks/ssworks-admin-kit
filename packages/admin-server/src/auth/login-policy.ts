// 정본: ssworks-gise-home apps/api/src/modules/auth/login-policy.ts (= hangang-home modules/auth/login-policy.ts — 필드
//       이름만 다른 같은 알고리즘)
// 바꾼 점: 횟수 · 시간이 옵션이다(기본값 같음, 스펙 §4-1). 필드 이름은 코어 users 컬럼(loginFailCount · lockUntil —
//   hangang). 성공 때 쓰기를 아끼는 needsReset 을 더했다.

export interface LoginLockout {
  maxFailures: number
  lockMs: number
}

export const DEFAULT_LOCKOUT: LoginLockout = { maxFailures: 5, lockMs: 15 * 60 * 1000 }

/** users 의 잠금 두 컬럼. 리포지토리가 그대로 읽고 쓴다(`AdminAuthRepository.saveLoginState`). */
export interface AdminLoginState {
  loginFailCount: number
  lockUntil: Date | null
}

/** 같은 순간이면 풀린 것이다(스펙 §5-5). */
export function isLocked(lockUntil: Date | null, now: Date): boolean {
  return lockUntil != null && lockUntil.getTime() > now.getTime()
}

/**
 * 비밀번호 확인 한 번의 결과로 다음 잠금 상태를 낸다. 로그인 · 비밀번호 변경 · 재인증이 같은 카운터를 쓴다(스펙 B2).
 */
export function nextLoginState(
  current: AdminLoginState,
  outcome: 'success' | 'fail',
  now: Date,
  lockout: LoginLockout = DEFAULT_LOCKOUT,
): AdminLoginState {
  if (outcome === 'success') return { loginFailCount: 0, lockUntil: null }

  const locked = isLocked(current.lockUntil, now)
  // 🔴 ① 잠금이 이미 끝났으면 카운터도 0부터 다시 센다. 안 그러면 카운터가 maxFailures 아래로 내려오지 않아, 만료 직후의
  //    실패 한 번이 곧바로 다시 잠금이 되어 사실상 영구 잠금이 된다(gise).
  const base = current.lockUntil != null && !locked ? 0 : current.loginFailCount
  const loginFailCount = base + 1

  // 🔴 ② 잠긴 동안에는 시각을 늘리지 않는다. 늘리면 풀리기 직전마다 오답 하나로 다시 lockMs 가 붙어, 유일한 관리자 계정을
  //    무기한 잠그는 DoS 가 maxFailures 회가 아니라 1회 비용이 된다(gise).
  const lockUntil = locked
    ? current.lockUntil
    : loginFailCount >= lockout.maxFailures
      ? new Date(now.getTime() + lockout.lockMs)
      : null

  return { loginFailCount, lockUntil }
}

/** 성공 뒤 되돌릴 것이 있는가 — 이미 { 0, null } 이면 쓰기를 아낀다. */
export function needsReset(state: AdminLoginState): boolean {
  return state.loginFailCount !== 0 || state.lockUntil != null
}
