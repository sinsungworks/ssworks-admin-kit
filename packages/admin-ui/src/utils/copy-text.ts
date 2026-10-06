// 클립보드에 글자를 쓴다 — 결과를 세 갈래로 돌려주고 던지지 않는다.
//
// 정본: hangang-home apps/admin/src/pages/org/users.vue(복사 3분기) · users-messages.ts(COPY_*)
// 바꾼 점: 페이지 안 분기를 함수로. 문구는 부르는 쪽(TemporaryPasswordDialog)이 고른다.
//
// 🔴 보안 컨텍스트가 아니면(사내 http 주소) 브라우저가 `navigator.clipboard` 를 아예 주지 않는다. 그때 "복사했습니다"
//    를 내면 관리자는 빈 값을 붙여넣고, 그 시점에는 임시 비밀번호를 다시 볼 수 없다(axion 사고). 성공 문구는
//    `'done'` 일 때만 낸다.
// 🔴 `execCommand('copy')` 대체 경로를 두지 않는다 — 화면에 글자로 찍힌 값이 정본이고, 복사는 편의다.

export type CopyResult = 'done' | 'failed' | 'unavailable'

export async function copyText(text: string): Promise<CopyResult> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (clipboard == null || typeof clipboard.writeText !== 'function') return 'unavailable'
  try {
    await clipboard.writeText(text)
    return 'done'
  } catch {
    return 'failed'
  }
}
