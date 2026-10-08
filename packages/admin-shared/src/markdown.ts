import MarkdownItConstructor from 'markdown-it'

// 마크다운 → 안전한 HTML. 관리자 미리보기(admin-ui `MarkdownView`) · 서버(공개 `bodyHtml`) · 공개 웹이 이 함수
// 하나를 쓴다.
//
// 정본: ssworks-gise-home packages/shared/src/content/markdown.ts
//       (ssworks-axion-admin packages/frontend/src/components/common/markdown-view.util.ts 와 같은 옵션)
// 바꾼 점:
//  - 인스턴스를 처음 부를 때 만든다 — import 만으로는 아무 일도 일어나지 않게(3e 스펙 D2). markdown-it 이
//    `sideEffects` 를 선언하지 않아, 안 쓰는 소비자 번들에서 실제로 빠지는지는 번들러가 판단한다.
//
// 🔴 이 파일이 admin-shared 에 있는 이유: 관리자 미리보기와 공개 렌더가 **같은 함수**를 써야 "관리자가 본 미리보기" 와
//    "사용자가 동의한 원문" 이 갈리지 않는다(gise). 렌더러가 두 벌이면 한쪽만 고쳐진다.
// 🔴 보안 표면 전체가 아래 옵션이다. 별도 sanitizer 도, markdown-it 플러그인도 없다.
//    - `html: false` — 원문 HTML 을 통째로 이스케이프한다. **저장형 XSS 방어의 전부다.** true 로 바꾸지 않는다.
//    - `javascript:` · `vbscript:` · `file:` · `data:`(이미지 제외) 링크는 markdown-it 기본 `validateLink` 가 막는다.
//    그래서 `markdown.test.ts` 가 곧 계약이다.

// markdown-it 15 의 default export 는 값이라 타입으로 못 쓴다 — 생성자에서 인스턴스 타입을 뽑는다(3e 스펙 §12 R1). 되돌리지 않는다.
let md: ReturnType<typeof MarkdownItConstructor> | undefined

/** 마크다운 원문 → 안전한 HTML. null · undefined · '' 은 '' */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  md ??= new MarkdownItConstructor({ html: false, linkify: true, breaks: false })
  return md.render(source)
}
