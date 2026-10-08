// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import BaseDialog from './BaseDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ReauthDialog from './ReauthDialog.vue'

// 킷 대화상자의 포커스 — 열면 첫 칸(재인증), 닫으면 연 버튼으로(브라우저 확인 P6 · G4).
// 🔴 Vuetify VDialog 는 activator 슬롯이 있을 때만 닫힐 때 포커스를 돌려준다. 킷 대화상자는 v-model 로 연다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/** 버튼 "열기" 로 여는 부모 — 실제 화면처럼 연 버튼에 포커스가 있는 채로 연다 */
async function harness(Dialog: Component, props: Record<string, unknown> = {}) {
  const open = ref(false)
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h('div', [
          h('button', { type: 'button', onClick: () => (open.value = true) }, '열기'),
          h(Dialog, {
            ...props,
            modelValue: open.value,
            'onUpdate:modelValue': (value: boolean) => (open.value = value),
          }),
        ]),
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  const opener = buttonByText('열기')!
  return {
    opener,
    async openByButton() {
      opener.focus()
      opener.click()
      await flushPromises()
    },
  }
}

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')
const passwordInput = () =>
  document.querySelector<HTMLInputElement>('input[name="currentPassword"]')

/**
 * 실제 브라우저처럼 누르는 버튼에 포커스가 간 채로 누른다 — 그래야 닫힌 뒤 포커스가 사라진 버튼(대화상자 안)에 남는
 * 상황이 재현된다. happy-dom 은 Vuetify 가 열린 뒤 포커스를 대화상자 안으로 옮기는 단계(afterEnter)를 돌리지 않는다.
 */
async function clickInDialog(text: string) {
  const button = buttonByText(text, dialog()!)
  expect(button, `가드 — 대화상자에 "${text}" 버튼이 있다`).toBeTruthy()
  button!.focus()
  button!.click()
  await flushPromises()
}

describe('ReauthDialog — 포커스', () => {
  it('🔴 열면 비밀번호 칸에 포커스 — 누르지 않고 바로 친다(P6)', async () => {
    const { openByButton } = await harness(ReauthDialog as Component)
    await openByButton()
    expect(document.activeElement).toBe(passwordInput())
  })

  it('닫았다 다시 열어도 비밀번호 칸에 포커스', async () => {
    const { openByButton } = await harness(ReauthDialog as Component)
    await openByButton()
    await clickInDialog('취소')
    await openByButton()
    expect(document.activeElement).toBe(passwordInput())
  })

  it('🔴 닫으면 연 버튼으로 포커스가 돌아온다(G4)', async () => {
    const { opener, openByButton } = await harness(ReauthDialog as Component)
    await openByButton()
    await clickInDialog('취소')
    expect(document.activeElement).toBe(opener)
  })
})

describe('ConfirmDialog · BaseDialog — 포커스 복귀', () => {
  it('🔴 ConfirmDialog 를 닫으면 연 버튼으로 돌아온다(G4)', async () => {
    const { opener, openByButton } = await harness(ConfirmDialog as Component, {
      title: '삭제',
      message: '지웁니다.',
      reversible: false,
    })
    await openByButton()
    expect(dialog(), '가드 — 열렸다').not.toBeNull()
    await clickInDialog('취소')
    expect(document.activeElement).toBe(opener)
  })

  it('🔴 BaseDialog 를 닫으면 연 버튼으로 돌아온다(G4)', async () => {
    const { opener, openByButton } = await harness(BaseDialog as Component, {
      title: '안내',
      message: '본문',
      type: 'yesno',
    })
    await openByButton()
    await clickInDialog('취소')
    expect(document.activeElement).toBe(opener)
  })

  it('연 곳이 그사이 문서에서 사라졌으면 포커스를 옮기지 않는다', async () => {
    const { opener, openByButton } = await harness(ConfirmDialog as Component, {
      title: '삭제',
      message: '지웁니다.',
      reversible: false,
    })
    await openByButton()
    opener.remove()
    await clickInDialog('취소')
    expect(document.activeElement).not.toBe(opener)
  })
})
