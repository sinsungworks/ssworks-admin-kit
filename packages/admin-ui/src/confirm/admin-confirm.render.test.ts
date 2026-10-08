// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import AdminConfirm from './AdminConfirm.vue'
import { createConfirm, type ConfirmPlugin } from './confirm.js'

installVisualViewport()

let wrapper: VueWrapper | null = null
const original = window.confirm
beforeEach(() => {
  window.confirm = () => true
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  window.confirm = original
  vi.restoreAllMocks()
})

async function setup(): Promise<ConfirmPlugin> {
  const confirm = createConfirm()
  wrapper = mount(AdminConfirm as Component, {
    attachTo: document.body,
    global: { plugins: [vuetify, confirm] },
  })
  await flushPromises()
  return confirm
}

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')

describe('AdminConfirm', () => {
  it('물으면 ConfirmDialog 로 그린다 — 제목 · 문구 · 되돌림 안내 · 두 버튼, 확정은 true', async () => {
    const confirm = await setup()
    const answer = confirm.ask({
      title: '화면 떠나기',
      message: '저장하지 않은 변경 사항이 있습니다.',
      reversible: false,
      confirmLabel: '떠나기',
      cancelLabel: '머물기',
    })
    await flushPromises()
    const text = dialog()?.textContent ?? ''
    expect(text).toContain('화면 떠나기')
    expect(text).toContain('저장하지 않은 변경 사항이 있습니다.')
    expect(text).toContain('이 작업은 되돌릴 수 없습니다.')
    buttonByText('떠나기', dialog()!)!.click()
    await expect(answer).resolves.toBe(true)
    await flushPromises()
    expect(confirm.state.open).toBe(false)
  })

  it('취소 버튼은 false 로 답하고 창을 닫는다', async () => {
    const confirm = await setup()
    const answer = confirm.ask({
      title: '확인',
      message: '할까요?',
      reversible: true,
      cancelLabel: '머물기',
    })
    await flushPromises()
    buttonByText('머물기', dialog()!)!.click()
    await expect(answer).resolves.toBe(false)
    expect(confirm.state.open).toBe(false)
  })

  it('🔴 화면에 붙어 있는 동안만 자리로 센다 — 떼면 다음 물음은 브라우저 기본 창', async () => {
    const native = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const confirm = await setup()
    void confirm.ask({ title: '확인', message: '첫 물음', reversible: true })
    expect(native).not.toHaveBeenCalled()
    confirm.answer(false)
    wrapper!.unmount()
    wrapper = null
    await confirm.ask({ title: '확인', message: '둘째 물음', reversible: true })
    expect(native).toHaveBeenCalledWith('둘째 물음')
  })

  it('🔴 플러그인 없이 그리면 던진다', () => {
    expect(() => mount(AdminConfirm as Component, { global: { plugins: [vuetify] } })).toThrow(
      /createConfirm/,
    )
  })
})
