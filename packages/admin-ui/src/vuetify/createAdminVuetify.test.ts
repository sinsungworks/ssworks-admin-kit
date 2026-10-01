import { describe, expect, it } from 'vitest'
import {
  ADMIN_VUETIFY_FIELD_DEFAULTS,
  buildAdminVuetifyOptions,
  createAdminVuetify,
} from './createAdminVuetify.js'

describe('buildAdminVuetifyOptions — 프리셋 병합', () => {
  it('기본값: ko 로케일 · system 테마 · compact/auto · outlined 필드 10종 · flat primary 버튼', () => {
    const options = buildAdminVuetifyOptions()
    expect(options.locale?.locale).toBe('ko')
    expect(options.theme).toMatchObject({ defaultTheme: 'system' })
    expect(options.defaults?.global).toEqual({ density: 'compact', hideDetails: 'auto' })
    for (const name of Object.keys(ADMIN_VUETIFY_FIELD_DEFAULTS)) {
      expect(options.defaults?.[name], name).toEqual({ variant: 'outlined' })
    }
    expect(options.defaults?.VBtn).toEqual({
      color: 'primary',
      density: 'default',
      variant: 'flat',
    })
  })

  // 🔴 `true` 면 Vuetify 가 details 영역을 아예 안 그려 검증 실패 문구가 화면에 안 나온다.
  it("🔴 hideDetails 는 'auto' 다 — true 로 되돌리면 검증 문구가 사라진다", () => {
    expect(buildAdminVuetifyOptions().defaults?.global?.hideDetails).toBe('auto')
  })

  it('프로젝트 테마·defaults 가 프리셋 위에 얹힌다 — global 은 깊게, 컴포넌트는 이름 단위로', () => {
    const options = buildAdminVuetifyOptions({
      theme: {
        defaultTheme: 'dark',
        themes: { dark: { dark: true, colors: { primary: '#000' } } },
      },
      defaults: { global: { density: 'default' }, VBtn: { variant: 'text' } },
    })
    expect(options.theme).toMatchObject({ defaultTheme: 'dark' })
    expect(options.defaults?.global).toEqual({ density: 'default', hideDetails: 'auto' })
    expect(options.defaults?.VBtn).toEqual({ variant: 'text' })
    expect(options.defaults?.VTextField).toEqual({ variant: 'outlined' })
  })

  it('createAdminVuetify 는 설치 가능한 플러그인을 낸다', () => {
    const vuetify = createAdminVuetify()
    expect(typeof vuetify.install).toBe('function')
    expect(vuetify.locale.current.value).toBe('ko')
  })
})
