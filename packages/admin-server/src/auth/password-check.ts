import type { AdminAuthRepository, AdminCredential } from './auth.repository.js'
import { nextLoginState, type AdminLoginState, type LoginLockout } from './login-policy.js'
import { verifyPassword } from './password.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.service.ts login(틀리면 카운터) · admin-password.service.ts
//       (비밀번호 변경도 셈)
// 바꾼 점: 로그인 · 비밀번호 변경 · 재인증 세 자리가 이 함수 하나로 같은 카운터를 쓴다(스펙 B2 — gise 는 재인증을 세지
//   않았다). 세션을 쥔 사람이 재인증 붙은 쓰기를 비밀번호 대입 경로로 쓰지 못하게 한다.

export type PasswordCheck = { ok: true } | { ok: false; state: AdminLoginState }

/**
 * 🔴 트랜잭션 밖에서 부른다(argon2 — 스펙 Global Constraints). 틀리면 실패 상태를 저장하고 그 상태를 돌려준다.
 * 맞았을 때 카운터를 되돌리는 것은 호출부 몫이다 — 로그인은 잠근 행으로 잠김을 판정하며 함께 되돌리고(updateLoginState,
 * 스펙 §14 R7 · R8), 재인증은 남아 있을 때만(needsReset), 비밀번호 변경은 changePassword 가 함께 쓴다.
 */
export async function checkPasswordWithCounter(
  repo: AdminAuthRepository,
  credential: AdminCredential,
  password: string,
  now: Date,
  lockout: LoginLockout,
): Promise<PasswordCheck> {
  if (await verifyPassword(credential.passwordHash, password)) return { ok: true }
  // 🔴 원자적으로 센다(최종 리뷰 F2) — credential 은 검증 전 스냅숏이라 다음 상태를 거기서 셈하지 않는다.
  const state = await repo.updateLoginState(credential.userNo, (current) =>
    nextLoginState(current, 'fail', now, lockout),
  )
  return { ok: false, state }
}
