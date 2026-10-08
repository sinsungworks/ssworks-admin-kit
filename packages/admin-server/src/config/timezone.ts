// 정본: hangang-home apps/api/src/core/config/timezone.ts(최종 수정 A4 — 환경변수가 아니라 실효 타임존을 잰다)
// 바꾼 점: 오류 문구의 사내 문서 참조(부록 C · §6-1)를 뺐다.
//
// 🔴 환경변수 `TZ` 가 아니라 **실효 오프셋**을 잰다. `TZ` 를 보면 `.env` 를 먼저 읽었는지에 따라 가드가 자기가 방금 심은
//    값을 읽는다. Node 는 `process.env.TZ` 런타임 대입을 즉시 반영한다(hangang 실측, Node 24 / Windows).
// 🔴 세 시점(지금 · 1월 1일 · 7월 1일)을 잰다. 한 시점이면 `Europe/London` 이 겨울에 통과하고 여름에 한 시간 어긋난다.
// 🔴 DB 를 만지는 모든 진입점(앱 · 마이그레이션 러너 · 시드)이 이 한 함수를 부른다. 커넥터 `timezone` 옵션으로는 안
//    막힌다 — 러너가 KST 로 돌면 시드가 9시간 어긋난 바이트를 남긴다(hangang).

function effectiveOffsets(now: Date): number[] {
  const year = now.getUTCFullYear()
  return [
    now.getTimezoneOffset(),
    new Date(Date.UTC(year, 0, 1)).getTimezoneOffset(),
    new Date(Date.UTC(year, 6, 1)).getTimezoneOffset(),
  ]
}

/** 이 프로세스가 연중 UTC 로 도는가. 🔴 환경변수가 아니라 동작을 본다. */
export function isEffectiveUtc(now: Date = new Date()): boolean {
  return effectiveOffsets(now).every((offset) => offset === 0)
}

/** UTC 가 아니면 던진다. `context` 는 진입점 이름이다 — 메시지에만 쓴다. */
export function assertUtcTimezone(context: string): void {
  if (isEffectiveUtc()) return
  const observed = effectiveOffsets(new Date()).join(', ')
  throw new Error(
    `${context}: 프로세스 실효 타임존이 UTC 가 아니다 (getTimezoneOffset: ${observed}). ` +
      "TZ=UTC 로 실행한다(PowerShell: $env:TZ = 'UTC')",
  )
}
