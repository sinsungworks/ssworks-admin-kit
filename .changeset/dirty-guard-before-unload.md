---
'@ssworks/admin-ui': minor
---

`useDirtyGuard` 옵션 `beforeUnload`(기본 `true`) — `false` 면 새로고침 · 탭 닫기 · 주소창 이동 때 브라우저 기본 경고(「사이트를 새로고침하시겠습니까?」)를 띄우지 않는다(`beforeunload` 수신기를 달지 않는다). 브라우저가 이 창의 문구 · 모양을 바꾸지 못하게 막아, 기본 창을 원하지 않는 앱의 길은 끄는 것뿐이다. 라우트 이탈 확인(킷 확인 창 · `window.confirm`)은 그대로다.

**쓰는 쪽이 할 일:** 없다 — 기본값이 지금과 같다. 끄려면 `useDirtyGuard(isDirty, { beforeUnload: false })`(저장하지 않은 변경은 새로고침 때 묻지 않고 버려진다).
