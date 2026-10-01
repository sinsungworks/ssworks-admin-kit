// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import BaseDialog from './BaseDialog.vue'

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountDialog(
  props: Record<string, unknown> = {},
  slots: Record<string, string> = {},
): Promise<VueWrapper> {
  wrapper = mount(BaseDialog, {
    props: { modelValue: true, title: '제목', message: '본문', ...props },
    slots,
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

describe('BaseDialog — 기본 모양', () => {
  it('제목·본문·확인 버튼 하나 (type=ok)', async () => {
    await mountDialog()
    expect(document.body.textContent).toContain('제목')
    expect(document.body.textContent).toContain('본문')
    expect(buttonByText('확인')).toBeTruthy()
    expect(buttonByText('취소')).toBeUndefined()
  })

  it('🔴 type=ok 에서 확인을 누르면 confirm 이 나가고 닫힌다', async () => {
    const w = await mountDialog()
    buttonByText('확인')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('🔴 type=yesno 는 두 버튼이고 확인을 눌러도 닫지 않는다 — 부모가 비동기 작업 뒤에 닫는다', async () => {
    const w = await mountDialog({ type: 'yesno' })
    expect(buttonByText('취소')).toBeTruthy()
    buttonByText('확인')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('closeOnConfirm 으로 그 기본을 뒤집을 수 있다', async () => {
    const w = await mountDialog({ type: 'yesno', closeOnConfirm: true })
    buttonByText('확인')!.click()
    await flushPromises()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('취소·X 는 cancel 을 내고 닫는다', async () => {
    const w = await mountDialog({ type: 'yesno' })
    buttonByText('취소')!.click()
    await flushPromises()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('🔴 submitting 중에는 확인이 disabled 고 눌러도 confirm 이 안 나간다', async () => {
    const w = await mountDialog({ submitting: true })
    expect(buttonByText('확인')!.hasAttribute('disabled')).toBe(true)
    buttonByText('확인')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('type=none 이면 기본 버튼이 없고 #actions 슬롯이 그대로 그려진다', async () => {
    await mountDialog({ type: 'none' }, { actions: '<button>저장</button>' })
    expect(buttonByText('확인')).toBeUndefined()
    expect(buttonByText('저장')).toBeTruthy()
  })

  it('persistent 가 기본값이다 — 바깥 클릭으로 안 닫힌다', async () => {
    const w = await mountDialog()
    const dialog = w.findComponent({ name: 'VDialog' })
    expect(dialog.props('persistent')).toBe(true)
  })
})
