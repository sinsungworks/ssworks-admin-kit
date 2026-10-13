import { isSessionExpired } from './account-policy.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/refresh-policy.ts(유예창 · 시계 오차 하한) + auth.service.ts
//       `isWithinGrace`(후계 생존 · 같은 사용자 불변식)
// 바꾼 점:
//  - 창 길이가 옵션이다(기본 30 000, 0 이면 끈다 — 스펙 ③ W1). 시계 오차 하한은 상수 그대로.
//  - 🔴 `replacedBySessionNo` 가 null 이면 후계가 없는 것으로 본다(스펙 B4). gise 는 폐기와 링크가 두 문장이라 그 사이
//    구간에 유예를 줬다 — 우리 회전은 같은 트랜잭션에서 링크하므로 null 은 이상 상태다.
//  - 판정을 순수 함수 하나(judgeRotatedReuse)로 모았다 — 경합 0행(P1)과 읽기 시점 rotated(P2)가 같은 답을 낸다.

/**
 * 🔴 음수 방향 하한. 경과가 음수인 유일한 실제 원인은 복제본 간 시계 오차다(gise 실측 — 저장은 절삭이라 과거 방향).
 *    하한 없이 두면 시계가 앞선 서버가 쓴 행은 오차만큼 재사용 탐지가 꺼진다. 옵션이 아니다 — 배포자가 조용히 넓히지
 *    못하게 하고, 테스트가 값을 고정한다(gise 픽스 라운드 2).
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5_000

/** 회전으로 폐기된 세션이 아직 유예창 안인가. `revokedAt` null · `graceMs` 0 은 창 밖이다. */
export function isWithinRefreshGrace(revokedAt: Date | null, now: Date, graceMs: number): boolean {
  if (graceMs <= 0 || revokedAt == null) return false
  const elapsed = now.getTime() - revokedAt.getTime()
  return elapsed >= -CLOCK_SKEW_TOLERANCE_MS && elapsed <= graceMs
}

export interface RotatedSessionView {
  userNo: bigint
  revokedAt: Date | null
  replacedBySessionNo: bigint | null
}

export interface SuccessorSessionView {
  sessionNo: bigint
  userNo: bigint
  isRevoked: boolean
  expireAt: Date
}

/**
 * 이미 'rotated' 인 refresh 가 다시 왔을 때의 판정 한 곳(P1 · P2 공용).
 * - `'grace'` — 다른 탭이 늦게 낸 같은 토큰이다. 새 세션을 하나 더 준다(이긴 탭의 세션은 건드리지 않는다).
 * - `'reuse'` — 그 값을 가진 다른 주체가 있다. 누가 진짜인지 알 수 없으니 그 사용자의 살아 있는 세션을 전부 끊는다.
 */
export function judgeRotatedReuse(
  rotated: RotatedSessionView,
  successor: SuccessorSessionView | null,
  now: Date,
  graceMs: number,
): 'grace' | 'reuse' {
  if (!isWithinRefreshGrace(rotated.revokedAt, now, graceMs)) return 'reuse'
  if (rotated.replacedBySessionNo == null || successor == null) return 'reuse'
  if (successor.sessionNo !== rotated.replacedBySessionNo) return 'reuse'
  // 🔴 불변식을 코드에 박는다 — replacedBySessionNo 는 FK 가 아니라 DB 가 같은 사용자임을 보장하지 않는다(gise P4).
  if (successor.userNo !== rotated.userNo) return 'reuse'
  // 🔴 후계가 로그아웃 · 강제 종료로 죽었으면 교차 탭 경쟁이 아니다 — 재사용으로 판정한다(gise).
  if (successor.isRevoked || isSessionExpired(successor.expireAt, now)) return 'reuse'
  return 'grace'
}
