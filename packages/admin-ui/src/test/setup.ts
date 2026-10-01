// 렌더 테스트 공용 — 각 테스트 파일은 머리에 `// @vitest-environment happy-dom` 을 단다.
//
// 🔴 happy-dom 은 Vuetify 스타일시트를 안 싣는다. 그래서 렌더 테스트가 재는 것은 **구조·클래스·
//    문구·속성** 이고 색·높이·스크롤은 원리적으로 못 잰다.
import { createAdminVuetify } from '../vuetify/createAdminVuetify.js'

/** 프리셋 그대로의 Vuetify 인스턴스. 소비 프로젝트가 받는 기본값과 같다. */
export const vuetify = createAdminVuetify()

/**
 * 🔴 happy-dom 에 `visualViewport` 가 없다. 안 심으면 `VDialog`·`VMenu` 를 여는 테스트가 전부
 *    `ReferenceError: visualViewport is not defined` 로 죽는다(Vuetify `VOverlay/locationStrategies`).
 *    `mount()` 보다 먼저 서야 한다 — 모듈 최상단에서 부른다.
 */
export function installVisualViewport(): void {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { addEventListener: () => {}, removeEventListener: () => {} },
  })
}

/** 테스트 전용 훅을 심지 않는다 — 사람이 읽는 글자로 찾는다. */
export function buttonByText(text: string, root: ParentNode = document.body) {
  return [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === text) as
    HTMLButtonElement | undefined
}
