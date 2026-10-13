// 정본: 없음(새 판정). hangang `isResignEffective` 는 날짜 + 기준 시간대로 "퇴사일 당일까지 근무" 를 셌다 — 패키지는
//   `resignAt` 을 효력 시각으로 정했다(스펙 ④ R1). 날짜 → 시각 변환은 2d 가 쓸 때 한다.

/** 🔴 `resignAt` 은 효력 시각 — 같은 순간부터 퇴사다. null 은 재직. */
export function isResigned(resignAt: Date | null, now: Date): boolean {
  return resignAt != null && resignAt.getTime() <= now.getTime()
}

/** refresh 세션 만료 — 같은 순간이면 만료(스펙 §5-5). */
export function isSessionExpired(expireAt: Date, now: Date): boolean {
  return expireAt.getTime() <= now.getTime()
}
