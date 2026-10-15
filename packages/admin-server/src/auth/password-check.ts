import type { Kysely } from 'kysely'
import { runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import type { AdminAuthRepository, AdminCredential } from './auth.repository.js'
import { nextLoginState, type AdminLoginState, type LoginLockout } from './login-policy.js'
import { verifyPassword } from './password.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.service.ts login(틀리면 카운터) · admin-password.service.ts
//       (비밀번호 변경도 셈)
// 바꾼 점: 로그인 · 비밀번호 변경 · 재인증 세 자리가 이 함수 하나로 같은 카운터를 쓴다(스펙 B2 — gise 는 재인증을 세지
//   않았다). 세션을 쥔 사람이 재인증 붙은 쓰기를 비밀번호 대입 경로로 쓰지 못하게 한다.
//   2f-2a(스펙 A10): 원자적 카운터 쓰기(updateLoginState)를 리포지토리에서 이리로 옮겼다 — 리포지토리는 트랜잭션을 받는 원시만 낸다.

export type PasswordCheck = { ok: true } | { ok: false; state: AdminLoginState }

/**
 * 🔴 실패 카운터를 원자적으로 바꾼다 — 행을 잠그고(`lockCredential` 'update') 현재 값에서 `next` 를 셈해 바뀌었을 때만 쓴다.
 * 호출부가 검증 전에 읽은 스냅숏으로 셈하면 병렬 요청이 덜 센다(2b 최종 리뷰 F2). 행이 없으면 쓰지 않고 `next({ 0, null })` 를
 * 돌려준다. 🔴 argon2 를 이 안에서 부르지 않는다 — 호출부가 검증을 끝낸 뒤에 부른다.
 */
export function updateLoginState(
  db: Kysely<AdminDatabase>,
  repo: AdminAuthRepository,
  userNo: bigint,
  next: (current: AdminLoginState) => AdminLoginState,
): Promise<AdminLoginState> {
  return runWriteTransaction(db, async (trx) => {
    const locked = await repo.lockCredential(trx, userNo, 'update')
    if (locked == null) return next({ loginFailCount: 0, lockUntil: null })
    const current = { loginFailCount: locked.loginFailCount, lockUntil: locked.lockUntil }
    const state = next(current)
    // 바뀌지 않으면 쓰지 않는다 — 카운터가 이미 { 0, null } 인 정상 경로가 매번 UPDATE 를 치르지 않게(2b 스펙 §14 R8).
    if (!isSameLoginState(state, current)) await repo.writeLoginState(trx, userNo, state)
    return state
  })
}

/**
 * 🔴 트랜잭션 밖에서 부른다(argon2 — 스펙 Global Constraints). 틀리면 실패 상태를 저장하고 그 상태를 돌려준다.
 * 맞았을 때 카운터를 되돌리는 것은 호출부 몫이다 — 로그인은 확정 트랜잭션에서 잠근 행으로(2f-2a 스펙 A2), 재인증은 남아
 * 있을 때만(needsReset), 비밀번호 변경은 changePassword 가 함께 쓴다.
 */
export async function checkPasswordWithCounter(
  db: Kysely<AdminDatabase>,
  repo: AdminAuthRepository,
  credential: AdminCredential,
  password: string,
  now: Date,
  lockout: LoginLockout,
): Promise<PasswordCheck> {
  if (await verifyPassword(credential.passwordHash, password)) return { ok: true }
  // 🔴 원자적으로 센다(최종 리뷰 F2) — credential 은 검증 전 스냅숏이라 다음 상태를 거기서 셈하지 않는다.
  const state = await updateLoginState(db, repo, credential.userNo, (current) =>
    nextLoginState(current, 'fail', now, lockout),
  )
  return { ok: false, state }
}

/** 같은 순간을 담은 다른 Date 객체도 같다고 본다 — `next` 가 잠금 시각을 새로 만들어 돌려줄 수 있다. */
function isSameLoginState(a: AdminLoginState, b: AdminLoginState): boolean {
  return a.loginFailCount === b.loginFailCount && a.lockUntil?.getTime() === b.lockUntil?.getTime()
}
