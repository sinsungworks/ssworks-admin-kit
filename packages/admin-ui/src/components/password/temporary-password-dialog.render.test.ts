// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Component } from 'vue'
import { VDialog } from 'vuetify/components'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import TemporaryPasswordDialog from './TemporaryPasswordDialog.vue'

// 정본: ssworks-gise-home apps/admin/test/accounts-users-page.test.ts(닫으면 값이 남지 않음 · 복사 결과) +
//       hangang-home users.render.test.ts(글자로 표시 · 복사 3갈래 · 자동으로 닫지 않음).

installVisualViewport()

const TEMP = 'Ab3dEf7hJk9mNp2q'
const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

async function setup(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const value = ref<string | null>(TEMP)
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          TemporaryPasswordDialog as Component,
          {
            ...props,
            modelValue: value.value,
            'onUpdate:modelValue': (next: string | null) => {
              value.value = next
            },
          },
          slots,
        ),
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return value
}

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')

/** 값 칸 오른쪽의 복사 버튼 — 접근 이름으로 찾는다 */
const copyButton = () =>
  dialog()?.querySelector<HTMLButtonElement>('button[aria-label="임시 비밀번호 복사"]') ?? null

async function clickCopy() {
  const button = copyButton()
  expect(button, '가드 — 값 칸에 복사 버튼이 있다').toBeTruthy()
  button!.click()
  await flushPromises()
}

async function click(text: string) {
  const button = buttonByText(text, dialog() ?? document.body)
  expect(button, `가드 — "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

describe('TemporaryPasswordDialog — 표시', () => {
  it('값이 있으면 열리고, 🔴 값은 입력칸이 아니라 code 글자다', async () => {
    await setup()
    expect(dialog()).not.toBeNull()
    expect(dialog()?.querySelector('code')?.textContent).toBe(TEMP)
    const inputs = [...document.querySelectorAll('input')]
    expect(inputs.some((input) => input.value === TEMP)).toBe(false)
  })

  it('복사 버튼은 값 칸 오른쪽에 있고, 아래 동작 줄에는 닫기만 있다(브라우저 확인 C8)', async () => {
    await setup()
    const field = copyButton()?.closest('.v-input')
    expect(field, '가드 — 복사 버튼이 값 칸 안에 있다').toBeTruthy()
    expect(field!.querySelector('code')?.textContent).toBe(TEMP)
    const actions = [...dialog()!.querySelectorAll('.v-card-actions button')].map((b) =>
      (b.textContent ?? '').trim(),
    )
    expect(actions).toEqual(['닫기'])
  })

  it('값이 null 이면 열리지 않는다', async () => {
    const value = await setup()
    value.value = null
    await flushPromises()
    expect(dialog()).toBeNull()
  })

  it('제목은 mode 로 갈리고 title 로 바꿀 수 있다', async () => {
    await setup()
    expect(document.body.textContent).toContain('비밀번호를 초기화했습니다')
    wrapper?.unmount()
    await setup({ mode: 'create' })
    expect(document.body.textContent).toContain('계정을 만들었습니다')
    wrapper?.unmount()
    await setup({ title: '임시 비밀번호 발급' })
    expect(document.body.textContent).toContain('임시 비밀번호 발급')
  })

  it('"한 번만" 경고와 첫 로그인 안내를 보이고, target · sessionsRevoked · 슬롯을 더한다', async () => {
    await setup(
      { target: '홍길동(hong)', sessionsRevoked: true },
      { default: () => h('p', '추가 안내') },
    )
    const text = document.body.textContent ?? ''
    expect(text).toContain(
      '이 값은 지금 한 번만 보입니다. 창을 닫으면 다시 볼 수 없고, 잃어버리면 다시 발급해야 합니다.',
    )
    expect(text).toContain('처음 로그인하면 새 비밀번호를 정하게 됩니다.')
    expect(text).toContain('「홍길동(hong)」의 임시 비밀번호')
    expect(text).toContain('이 계정의 접속 세션은 서버가 함께 끊었습니다.')
    expect(text).toContain('추가 안내')
  })

  it('세션 안내는 sessionsRevoked 일 때만', async () => {
    await setup()
    expect(document.body.textContent).not.toContain('이 계정의 접속 세션은 서버가 함께 끊었습니다.')
  })
})

describe('TemporaryPasswordDialog — 복사', () => {
  it('성공하면 값 아래에 "복사했습니다" — 값 그대로 쓴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    await setup()
    await clickCopy()
    expect(writeText).toHaveBeenCalledWith(TEMP)
    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '임시 비밀번호를 복사했습니다.',
    )
  })

  it('🔴 클립보드 API 가 없으면 "복사했습니다" 를 내지 않는다', async () => {
    setClipboard(undefined)
    await setup()
    await clickCopy()
    const notice = dialog()?.querySelector('[aria-live="polite"]')?.textContent ?? ''
    expect(notice).toContain(
      '이 브라우저에서는 복사 기능을 쓸 수 없습니다. 위 값을 직접 선택해 복사하세요.',
    )
    expect(notice).not.toContain('복사했습니다')
  })

  it('거부되면 실패 문구', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    await setup()
    await clickCopy()
    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '복사하지 못했습니다. 위 값을 직접 선택해 복사하세요.',
    )
  })

  it('복사 중에는 복사 버튼이 잠긴다', async () => {
    let release!: () => void
    setClipboard({ writeText: vi.fn(() => new Promise<void>((resolve) => (release = resolve))) })
    await setup()
    await clickCopy()
    expect(copyButton()?.disabled).toBe(true)
    release()
    await flushPromises()
    expect(copyButton()?.disabled).toBe(false)
  })

  it('🔴 복사 중에 값이 바뀌면 옛 결과를 새 값에 붙이지 않고, 버튼 잠금도 바로 풀린다', async () => {
    let release!: () => void
    setClipboard({ writeText: vi.fn(() => new Promise<void>((resolve) => (release = resolve))) })
    const value = await setup()
    await clickCopy()
    value.value = 'Zz9yXw8vUt7sRq6p'
    await flushPromises()
    expect(copyButton()?.disabled).toBe(false)
    release()
    await flushPromises()
    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('')
  })

  it('값이 바뀌면 이전 복사 결과 문구를 지운다', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) })
    const value = await setup()
    await clickCopy()
    value.value = 'Zz9yXw8vUt7sRq6p'
    await flushPromises()
    expect(dialog()?.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('')
  })
})

describe('TemporaryPasswordDialog — 닫기', () => {
  it('🔴 닫기는 null 을 내보내 부모의 값을 비우고, 값이 DOM 에 남지 않는다', async () => {
    const value = await setup()
    await click('닫기')
    expect(value.value).toBeNull()
    await nextTick()
    expect(document.body.innerHTML).not.toContain(TEMP)
  })

  it('🔴 스스로 닫지 않는다 — persistent 이고 제목 줄 X 가 없다', async () => {
    const value = await setup()
    expect(wrapper!.findComponent(VDialog).props('persistent')).toBe(true)
    expect(document.querySelector('button[aria-label="닫기"]')).toBeNull()
    expect(value.value).toBe(TEMP)
  })
})
