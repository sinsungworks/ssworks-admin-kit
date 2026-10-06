// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { definePasswordPolicy } from '@ssworks/admin-shared'
import { buttonByText, vuetify } from '../../test/setup.js'
import PasswordChangeForm from './PasswordChangeForm.vue'

// 정본: ssworks-gise-home apps/admin/test/password-page.test.ts(칸 · 검증 · 이중 제출 · readonly · 필드 오류 ·
//       포커스)를 화면 위치와 무관한 폼 컴포넌트로 다시 잰다.

const policy = definePasswordPolicy()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function setup(props: Record<string, unknown> = {}) {
  const errors = ref<Record<string, string[]>>({})
  const submit =
    (props.submit as ((body: unknown) => Promise<boolean>) | undefined) ?? vi.fn(async () => true)
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(PasswordChangeForm as Component, { policy, submit, ...props, errors: errors.value }),
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return { errors, submit }
}

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!

/** `.value` 대입만으로는 `v-model` 이 안 먹는다 — `input` 이벤트를 손으로 낸다 */
async function typeInto(name: string, value: string) {
  const el = input(name)
  el.value = value
  el.dispatchEvent(new Event('input'))
  await flushPromises()
}

/** Vuetify 가 오류 문구가 있는 칸에 붙이는 상태 클래스 */
const hasError = (name: string) =>
  input(name).closest('.v-input')?.classList.contains('v-input--error') ?? false

async function fill(current = 'old-pass-1', next = 'new-pass-1', confirm = next) {
  await typeInto('currentPassword', current)
  await typeInto('newPassword', next)
  await typeInto('confirmPassword', confirm)
}

const submitButton = () => buttonByText('비밀번호 변경')!
const form = () => document.querySelector('form')!

describe('PasswordChangeForm — 칸', () => {
  it('세 칸의 이름 · autocomplete 와 정책 문구 도움말', async () => {
    await setup()
    expect(input('currentPassword').getAttribute('autocomplete')).toBe('current-password')
    expect(input('newPassword').getAttribute('autocomplete')).toBe('new-password')
    expect(input('confirmPassword').getAttribute('autocomplete')).toBe('new-password')
    expect(document.body.textContent).toContain(policy.lengthMessage)
  })

  it('userId 를 주면 숨은 username 칸을 둔다 — 비밀번호 관리자가 계정을 알아본다', async () => {
    await setup({ userId: 'hong' })
    const username = document.querySelector<HTMLInputElement>('input[autocomplete="username"]')
    expect(username?.value).toBe('hong')
    expect(username?.hidden).toBe(true)
  })
})

describe('PasswordChangeForm — 검증', () => {
  it('검증 오류는 그 칸에 입력한 뒤에만 — 처음부터 빨간 칸으로 시작하지 않는다', async () => {
    await setup()
    // 새 비밀번호 칸의 도움말이 정책 문구와 같은 글자라, 오류 여부는 글자가 아니라 오류 상태로 잰다.
    expect(hasError('newPassword')).toBe(false)
    expect(hasError('confirmPassword')).toBe(false)
    expect(document.body.textContent).not.toContain('새 비밀번호가 서로 다릅니다.')
    await typeInto('newPassword', 'short')
    expect(hasError('newPassword')).toBe(true)
    await typeInto('confirmPassword', 'other')
    expect(hasError('confirmPassword')).toBe(true)
    expect(document.body.textContent).toContain('새 비밀번호가 서로 다릅니다.')
  })

  it('새 = 현재면 정책의 같음 문구', async () => {
    await setup()
    await fill('same-pass-1', 'same-pass-1')
    expect(document.body.textContent).toContain(policy.sameAsCurrentMessage)
    expect(submitButton().disabled).toBe(true)
  })

  it('조건을 다 채우기 전에는 버튼이 잠기고, 다 채우면 풀린다', async () => {
    await setup()
    expect(submitButton().disabled).toBe(true)
    await fill('old-pass-1', 'new-pass-1', 'new-pass-2')
    expect(submitButton().disabled).toBe(true)
    await typeInto('confirmPassword', 'new-pass-1')
    expect(submitButton().disabled).toBe(false)
  })
})

describe('PasswordChangeForm — 제출', () => {
  it('🔴 Enter 두 번에도 submit 은 한 번 — 처리 중에는 세 칸이 readonly(disabled 아님)', async () => {
    let release!: (ok: boolean) => void
    const submit = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)))
    await setup({ submit })
    await fill()
    form().dispatchEvent(new Event('submit'))
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith({
      currentPassword: 'old-pass-1',
      newPassword: 'new-pass-1',
    })
    expect(input('currentPassword').readOnly).toBe(true)
    expect(input('currentPassword').disabled).toBe(false)
    release(true)
    await flushPromises()
    expect(input('currentPassword').readOnly).toBe(false)
  })

  it('submit 이 true 면 세 칸을 비운다', async () => {
    await setup({ submit: vi.fn(async () => true) })
    await fill()
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(input('currentPassword').value).toBe('')
    expect(input('newPassword').value).toBe('')
    expect(input('confirmPassword').value).toBe('')
  })

  it('submit 이 false 면 값을 둔다', async () => {
    await setup({ submit: vi.fn(async () => false) })
    await fill()
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(input('newPassword').value).toBe('new-pass-1')
  })
})

describe('PasswordChangeForm — 서버 오류', () => {
  it('🔴 errors 를 칸 옆에 내고 첫 오류 칸(현재 우선)으로 포커스를 옮긴다', async () => {
    const { errors } = await setup()
    await fill()
    errors.value = {
      newPassword: ['새 비밀번호가 현재 비밀번호와 같습니다.'],
      currentPassword: ['현재 비밀번호가 올바르지 않습니다.'],
    }
    await flushPromises()
    expect(document.body.textContent).toContain('현재 비밀번호가 올바르지 않습니다.')
    expect(document.activeElement).toBe(input('currentPassword'))
  })

  it('새 비밀번호 오류만 있으면 새 칸으로 포커스', async () => {
    const { errors } = await setup()
    await fill()
    errors.value = { newPassword: ['서버가 거부한 이유'] }
    await flushPromises()
    expect(document.activeElement).toBe(input('newPassword'))
  })

  it('그 칸을 고치면 그 칸의 서버 오류를 숨긴다', async () => {
    const { errors } = await setup()
    await fill()
    errors.value = { currentPassword: ['현재 비밀번호가 올바르지 않습니다.'] }
    await flushPromises()
    await typeInto('currentPassword', 'old-pass-2')
    expect(document.body.textContent).not.toContain('현재 비밀번호가 올바르지 않습니다.')
  })

  it('submit 이 던지면 처리 중 표시를 풀고 오류를 다시 던진다', async () => {
    const boom = new Error('boom')
    const errorHandler = vi.fn()
    const submit = vi.fn(async () => {
      throw boom
    })
    wrapper = mount(
      defineComponent({
        setup: () => () => h(PasswordChangeForm as Component, { policy, submit }),
      }),
      { attachTo: document.body, global: { plugins: [vuetify], config: { errorHandler } } },
    )
    await flushPromises()
    await fill()
    form().dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(errorHandler).toHaveBeenCalledWith(boom, expect.anything(), expect.anything())
    expect(input('currentPassword').readOnly).toBe(false)
  })
})
