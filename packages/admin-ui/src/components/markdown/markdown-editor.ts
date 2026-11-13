// 마크다운 편집기의 타입 · 기본 문구 · 상수. `MarkdownEditor.vue` 와 `MarkdownLinkDialog.vue` 가 쓴다(스펙 W13 · ③).

/** 편집 방식 — 서식(WYSIWYG) · 원문(Markdown textarea) */
export type MarkdownEditorMode = 'wysiwyg' | 'source'

export interface MarkdownEditorMessages {
  bold: string
  italic: string
  strike: string
  heading2: string
  heading3: string
  blockquote: string
  bulletList: string
  orderedList: string
  link: string
  horizontalRule: string
  undo: string
  redo: string
  /** 그림 단추 — `attachments` 를 줄 때만 보인다 */
  image: string
  /** 모드 토글의 두 단추 */
  modeWysiwyg: string
  modeSource: string
  /** 모드 토글의 접근 이름 */
  modeToggle: string
  /** 도구 막대의 접근 이름 — `label` 을 받는다 */
  toolbar: (label: string) => string
  linkTitle: string
  linkHref: string
  linkApply: string
  linkRemove: string
  linkCancel: string
  /** 링크 확장이 주소를 거부했을 때(`javascript:` 등) */
  linkInvalid: string
}

/** 기본 문구 — 공개(3i E1). 🔴 얼린다(E3) — 앱이 펼쳐 일부만 덮는다 */
export const DEFAULT_MARKDOWN_EDITOR_MESSAGES: Readonly<MarkdownEditorMessages> =
  Object.freeze<MarkdownEditorMessages>({
    bold: '굵게',
    italic: '기울임',
    strike: '취소선',
    heading2: '제목 2',
    heading3: '제목 3',
    blockquote: '인용',
    bulletList: '글머리 목록',
    orderedList: '번호 목록',
    link: '링크',
    horizontalRule: '구분선',
    undo: '되돌리기',
    redo: '다시 실행',
    image: '이미지 넣기',
    modeWysiwyg: '서식',
    modeSource: '원문',
    modeToggle: '편집 방식',
    toolbar: (label) => `${label} 서식`,
    linkTitle: '링크',
    linkHref: '주소',
    linkApply: '적용',
    linkRemove: '링크 지우기',
    linkCancel: '취소',
    linkInvalid: '사용할 수 없는 주소입니다.',
  })

/**
 * 서식 모드 `update:modelValue` 디바운스(ms — 스펙 결정 ③ · W3). 입력마다 `getMarkdown()` 전체 직렬화 + 부모 재렌더가
 * O(n) 이라 큰 본문(약관 상한 1,000,000자)에서 키 경로에서 뺀다. 버스트의 **첫 변경은 즉시**(부모의 더티 판정 · 이탈 확인이 바로
 * 선다 — 리뷰 중요 #2), 이어지는 변경은 이만큼 멈추면 나간다. 포커스를 잃으면 · 원문으로 전환하면 · readonly 가 켜지면 · 언마운트 ·
 * `pagehide` 때 바로 flush 한다. 🔴 prop 이 아니다 — 0 을 줄 수 있으면 D3(같은 값 echo) 전제가 다시 성능과 충돌한다.
 */
export const MARKDOWN_EDITOR_EMIT_DELAY_MS = 200

/** 쉼 없이 계속 쳐도 이만큼마다는 한 번 나간다(ms) — 부모 값이 무한정 뒤처지지 않게 */
export const MARKDOWN_EDITOR_EMIT_MAX_WAIT_MS = 1000
