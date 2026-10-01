import { createVuetify, type VuetifyOptions } from 'vuetify'
import { ko } from 'vuetify/locale'

/**
 * Vuetify 프리셋.
 *
 * 정본: hangang-home apps/admin/src/plugins/vuetify.ts 의 `defaults`(outlined 10종 ·
 * `hideDetails: 'auto'`) + gise 의 테마 구조(light/dark 를 프로젝트가 넘긴다).
 *
 * 🔴 **테마 색은 여기서 지어내지 않는다.** 네 프로젝트의 팔레트가 전부 달랐다. 색을 안 넘기면
 *    Vuetify 기본 팔레트다. 프로젝트의 `plugins/vuetify.ts` 가 `themes` 를 넘긴다.
 *
 * 🔴 **CSS 는 여기서 import 하지 않는다.** `import 'vuetify/styles'` 와
 *    `import '@mdi/font/css/materialdesignicons.css'` 는 앱의 `plugins/vuetify.ts` 가 한다 — 라이브러리
 *    함수가 전역 CSS 를 끌어오면 테스트와 SSR 에서 부작용이 된다.
 */

/**
 * 🔴 `hideDetails` 는 `'auto'` 다. `true` 면 Vuetify 가 details 영역을 아예 안 그려 `:rules` 검증
 *    실패 문구가 화면에 안 나온다(테두리만 빨개진다). `'auto'` 는 내용이 있을 때만 자리를 차지한다.
 */
export const ADMIN_VUETIFY_GLOBAL_DEFAULTS = {
  density: 'compact',
  hideDetails: 'auto',
} as const

/**
 * 🔴 `VField` 전역 기본값은 다른 필드 컴포넌트에 닿지 않는다. 필드 컴포넌트들은 자기 props 에
 *    `variant`(기본 `'filled'`)를 갖고 아래로 명시 전달하므로 **하나하나** 적어야 한다. 같은 폼에
 *    외곽선 필드와 채움 필드가 섞이는 사고를 막는 목록이다. `VOtpInput` 은 Vuetify 자신이 이미
 *    outlined 라 뺐고, `VCheckbox`·`VSwitch`·`VSlider` 는 `variant` 가 없다.
 * 🔴 Vuetify 를 올릴 때 이 목록을 다시 세라.
 */
export const ADMIN_VUETIFY_FIELD_DEFAULTS = {
  VField: { variant: 'outlined' },
  VTextField: { variant: 'outlined' },
  VTextarea: { variant: 'outlined' },
  VSelect: { variant: 'outlined' },
  VAutocomplete: { variant: 'outlined' },
  VCombobox: { variant: 'outlined' },
  VFileInput: { variant: 'outlined' },
  VNumberInput: { variant: 'outlined' },
  VDateInput: { variant: 'outlined' },
  VColorInput: { variant: 'outlined' },
} as const

export const ADMIN_VUETIFY_BUTTON_DEFAULTS = {
  VBtn: { color: 'primary', density: 'default', variant: 'flat' },
} as const

export const ADMIN_VUETIFY_DEFAULTS = {
  global: ADMIN_VUETIFY_GLOBAL_DEFAULTS,
  ...ADMIN_VUETIFY_FIELD_DEFAULTS,
  ...ADMIN_VUETIFY_BUTTON_DEFAULTS,
}

type VuetifyDefaults = NonNullable<VuetifyOptions['defaults']>
type VuetifyTheme = NonNullable<VuetifyOptions['theme']>

export interface AdminVuetifyOptions extends Omit<VuetifyOptions, 'defaults' | 'theme'> {
  /** 프로젝트 팔레트. `{ light: { dark: false, colors: {...} }, dark: {...} }` */
  theme?: VuetifyTheme
  /** 프리셋 위에 얕게 덮어쓴다 — 컴포넌트 이름 단위로 교체된다. */
  defaults?: VuetifyDefaults
}

/** `createVuetify()` 에 넘길 옵션만 만든다. 테스트나 커스텀 조립이 필요할 때. */
export function buildAdminVuetifyOptions(options: AdminVuetifyOptions = {}): VuetifyOptions {
  const { theme, defaults, locale, ...rest } = options
  return {
    ...rest,
    locale: { locale: 'ko', messages: { ko }, ...locale },
    theme: { defaultTheme: 'system', ...theme },
    defaults: {
      ...ADMIN_VUETIFY_DEFAULTS,
      ...defaults,
      global: { ...ADMIN_VUETIFY_GLOBAL_DEFAULTS, ...defaults?.global },
    },
  }
}

/**
 * 프리셋이 적용된 Vuetify 인스턴스.
 *
 * ```ts
 * // plugins/vuetify.ts (프로젝트 소유)
 * import 'vuetify/styles'
 * import '@mdi/font/css/materialdesignicons.css'
 * export default createAdminVuetify({ theme: { themes: { light, dark } } })
 * ```
 */
export function createAdminVuetify(options: AdminVuetifyOptions = {}) {
  return createVuetify(buildAdminVuetifyOptions(options))
}
