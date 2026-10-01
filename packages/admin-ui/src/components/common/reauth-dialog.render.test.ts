// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import ReauthDialog from './ReauthDialog.vue'

// 정본: hangang-home reauth-dialog.render.test.ts
//
// 🔴 함정 둘이 주석으로만 적혀 있었다 — ① `:loading` 은 클릭을 안 막는다 ② `VDialog` 를 닫아도
//    `password` ref 는 안 사라진다. 여기서 계약으로 못박는다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountDialog(
  props: { modelValue?: boolean; message?: string; submitting?: boolean; error?: string } = {},
): Promise<VueWrapper> {
  wrapper = mount(ReauthDialog, {
    props: { modelValue: true, ...props },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

function passwordInput(): HTMLInputElement | null {
  return document.body.querySelector('input[name="currentPassword"]')
}

/** `.value` 대입만으로는 `v-model` 이 안 먹는다 — `input` 이벤트를 손으로 낸다. */
async function type(value: string) {
  const input = passwordInput()
  expect(input, '가드 — 비밀번호 입력이 문서에 있다').not.toBeNull()
  input!.value = value
  input!.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('ReauthDialog — 필드 이름은 계약이다', () => {
  it('🔴 비밀번호 입력에 name="currentPassword" 가 있다 — data-testid 를 안 쓰므로 이것이 유일한 잡이다', async () => {
    await mountDialog()
    expect(passwordInput()).toBeTruthy()
  })

  it('🔴 닫혀 있으면 입력이 문서에 아예 없다 — 열림 판정의 기준이다', async () => {
    await mountDialog({ modelValue: false })
    expect(wrapper!.exists(), '가드 — 컴포넌트가 마운트됐다').toBe(true)
    expect(passwordInput()).toBeNull()
  })

  it('무엇을 하려는지와 다음 행동을 함께 적는다', async () => {
    await mountDialog({ message: '스토리지 설정을 저장합니다.' })
    expect(document.body.textContent).toContain('스토리지 설정을 저장합니다.')
    expect(document.body.textContent).toContain('현재 비밀번호를 입력하세요.')
  })
})

describe('ReauthDialog — 확인 버튼은 제출 중 다시 안 눌린다', () => {
  it('🔴 확인 버튼이 submitting 중에 disabled 다', async () => {
    await mountDialog({ submitting: true })
    await type('pw')
    expect(buttonByText('확인')!.hasAttribute('disabled')).toBe(true)
  })

  it('🔴 비밀번호를 채우고 제출 중이 아니면 확인이 열린다 — 방어가 기능을 죽이지 않았다', async () => {
    await mountDialog()
    await type('pw')
    expect(buttonByText('확인')!.hasAttribute('disabled')).toBe(false)
  })

  it('🔴 비밀번호가 비어 있으면 확인이 disabled 다', async () => {
    await mountDialog()
    expect(buttonByText('확인')!.hasAttribute('disabled')).toBe(true)
  })

  it('🔴 확인을 누르면 입력한 비밀번호가 confirm 으로 나간다', async () => {
    const w = await mountDialog()
    await type('pw')
    buttonByText('확인')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toEqual([['pw']])
  })

  it('Enter 로도 확인된다 — 단 빈 값이면 아니다', async () => {
    const w = await mountDialog()
    passwordInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(w.emitted('confirm')).toBeUndefined()
    await type('pw')
    passwordInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(w.emitted('confirm')).toEqual([['pw']])
  })

  it('🔴 제출이 시작된 뒤 다시 눌러도 confirm 이 두 번 안 나간다', async () => {
    const w = await mountDialog()
    await type('pw')
    buttonByText('확인')!.click()
    await flushPromises()
    await w.setProps({ submitting: true })
    buttonByText('확인')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toHaveLength(1)
  })
})

describe('ReauthDialog — 틀린 비밀번호로 닫지 않는다', () => {
  it('🔴 오류 문구를 그 자리에서 낸다 — 대화상자를 닫지 않는다', async () => {
    await mountDialog({ error: '현재 비밀번호가 올바르지 않습니다' })
    expect(document.body.textContent).toContain('현재 비밀번호가 올바르지 않습니다')
    expect(passwordInput(), '오류가 있는데 대화상자가 닫혔다').toBeTruthy()
  })

  it('🔴 취소를 누르면 닫힘을 부모에게 알린다', async () => {
    const w = await mountDialog()
    buttonByText('취소')!.click()
    await flushPromises()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})

describe('ReauthDialog — 여닫으면 비밀번호가 비워진다', () => {
  it('🔴 닫았다 다시 열면 비밀번호 칸이 비어 있다 — VDialog 를 닫아도 ref 는 안 사라진다', async () => {
    const w = await mountDialog()
    await type('앞사람이-친-비밀번호')
    expect(passwordInput()!.value).toBe('앞사람이-친-비밀번호')

    await w.setProps({ modelValue: false })
    await flushPromises()
    await w.setProps({ modelValue: true })
    await flushPromises()

    expect(passwordInput(), '가드 — 다시 열려 입력이 문서에 있다').toBeTruthy()
    expect(passwordInput()!.value).toBe('')
  })
})
