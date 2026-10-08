// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createConfirm, useConfirm, type ConfirmRequest } from './confirm.js'

const ASK: ConfirmRequest = {
  title: '화면 떠나기',
  message: '바뀐 것이 있습니다.',
  reversible: false,
}

// 🔴 happy-dom 에 window.confirm 이 없다 — spyOn 이 되도록 심고, 끝나면 되돌린다.
const original = window.confirm
beforeEach(() => {
  window.confirm = () => true
})
afterEach(() => {
  window.confirm = original
  vi.restoreAllMocks()
})

describe('createConfirm — 묻고 답하기', () => {
  it('자리가 붙어 있으면 상태를 열고, 확정은 true 로 답한다', async () => {
    const confirm = createConfirm()
    const detach = confirm.attach()
    const answer = confirm.ask(ASK)
    expect(confirm.state.open).toBe(true)
    expect(confirm.state.request).toEqual(ASK)
    confirm.answer(true)
    await expect(answer).resolves.toBe(true)
    expect(confirm.state.open).toBe(false)
    detach()
  })

  it('취소는 false 로 답한다', async () => {
    const confirm = createConfirm()
    confirm.attach()
    const answer = confirm.ask(ASK)
    confirm.answer(false)
    await expect(answer).resolves.toBe(false)
  })

  it('🔴 열린 채 또 물으면 앞의 물음은 false(머물기)로 끝나고 새 물음이 열린다', async () => {
    const confirm = createConfirm()
    confirm.attach()
    const first = confirm.ask(ASK)
    const second = confirm.ask({ ...ASK, message: '두 번째' })
    await expect(first).resolves.toBe(false)
    expect(confirm.state.request?.message).toBe('두 번째')
    confirm.answer(true)
    await expect(second).resolves.toBe(true)
  })

  it('🔴 자리가 없으면 브라우저 기본 창으로 묻는다 — 답할 창이 없어 멈추지 않게', async () => {
    const native = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const confirm = createConfirm()
    await expect(confirm.ask(ASK)).resolves.toBe(true)
    expect(native).toHaveBeenCalledWith('바뀐 것이 있습니다.')
    expect(confirm.state.open).toBe(false)
  })

  it('🔴 열린 채 마지막 자리가 떠나면 물음은 false 로 끝나고, 다음 물음은 기본 창으로', async () => {
    const native = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const confirm = createConfirm()
    const detach = confirm.attach()
    const answer = confirm.ask(ASK)
    detach()
    await expect(answer).resolves.toBe(false)
    expect(confirm.state.open).toBe(false)
    await confirm.ask(ASK)
    expect(native).toHaveBeenCalledTimes(1)
  })

  it('열려 있지 않으면 answer 는 아무것도 하지 않는다', () => {
    const confirm = createConfirm()
    confirm.attach()
    expect(() => confirm.answer(true)).not.toThrow()
    expect(confirm.state.open).toBe(false)
  })
})

describe('useConfirm', () => {
  const Consumer = defineComponent({
    setup() {
      const confirm = useConfirm()
      return () => h('button', { onClick: () => void confirm.ask(ASK) }, '묻기')
    },
  })

  it('플러그인이 provide 한 것을 받는다', async () => {
    const confirm = createConfirm()
    confirm.attach()
    const wrapper = mount(Consumer, { global: { plugins: [confirm] } })
    await wrapper.get('button').trigger('click')
    expect(confirm.state.open).toBe(true)
    wrapper.unmount()
  })

  it('🔴 플러그인 없이 부르면 던진다 — 조용히 아무것도 안 묻는 상태를 막는다', () => {
    expect(() => mount(Consumer)).toThrow(/createConfirm/)
  })
})
