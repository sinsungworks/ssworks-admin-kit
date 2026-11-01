// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import { DEFAULT_MARKDOWN_EDITOR_MESSAGES } from './markdown-editor.js'
import MarkdownLinkDialog from './MarkdownLinkDialog.vue'

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')
const input = () => dialog()!.querySelector<HTMLInputElement>('input')!

async function open(
  props: { href?: string; hasLink?: boolean; apply?: (href: string) => boolean } = {},
) {
  const apply = props.apply ?? vi.fn(() => true)
  const remove = vi.fn()
  wrapper = mount(MarkdownLinkDialog, {
    props: {
      modelValue: true,
      href: props.href ?? '',
      hasLink: props.hasLink ?? false,
      apply,
      remove,
      messages: DEFAULT_MARKDOWN_EDITOR_MESSAGES,
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return { apply, remove }
}

function typeHref(value: string): void {
  input().value = value
  input().dispatchEvent(new Event('input'))
}

describe('MarkdownLinkDialog', () => {
  it('열면 제목 · 주소 칸(열 때의 href) · 단추 셋', async () => {
    await open({ href: 'https://a.example' })
    expect(dialog()!.textContent).toContain('링크')
    expect(input().value).toBe('https://a.example')
    for (const text of ['링크 지우기', '취소', '적용']) {
      expect(buttonByText(text, dialog()!), text).toBeTruthy()
    }
  })

  it('적용 → apply(입력값) 가 참이면 닫힌다', async () => {
    const { apply } = await open()
    typeHref('example.com')
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    expect(apply).toHaveBeenCalledWith('example.com')
    expect(dialog()).toBeNull()
  })

  it('Enter 도 적용이다', async () => {
    const { apply } = await open()
    typeHref('example.com')
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(apply).toHaveBeenCalledWith('example.com')
  })

  it('apply 가 거짓이면 닫히지 않고 「사용할 수 없는 주소입니다.」 — 다시 치면 사라진다', async () => {
    await open({ apply: vi.fn(() => false) })
    typeHref('javascript:alert(1)')
    buttonByText('적용', dialog()!)!.click()
    await flushPromises()
    expect(dialog()).toBeTruthy()
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain(
      '사용할 수 없는 주소입니다.',
    )
    typeHref('https://ok.example')
    await flushPromises()
    expect(dialog()!.textContent).not.toContain('사용할 수 없는 주소입니다.')
  })

  it('링크 지우기는 hasLink 일 때만 켜지고, 누르면 remove 뒤 닫힌다', async () => {
    const first = await open({ hasLink: false })
    expect(buttonByText('링크 지우기', dialog()!)!.disabled).toBe(true)
    wrapper!.unmount()
    wrapper = null
    document.body.innerHTML = ''
    const { remove } = await open({ hasLink: true, href: 'https://a.example' })
    expect(first.remove).not.toHaveBeenCalled()
    buttonByText('링크 지우기', dialog()!)!.click()
    await flushPromises()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
  })

  it('취소는 아무것도 부르지 않고 닫는다', async () => {
    const { apply, remove } = await open()
    buttonByText('취소', dialog()!)!.click()
    await flushPromises()
    expect(apply).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('🔴 다시 열면 그때의 href 로 채운다 — 열린 채로는 바깥 href 가 바뀌어도 치던 글자를 지우지 않는다', async () => {
    await open({ href: 'https://a.example' })
    typeHref('https://typing')
    await wrapper!.setProps({ href: 'https://changed.example' })
    expect(input().value).toBe('https://typing')
    await wrapper!.setProps({ modelValue: false })
    await flushPromises()
    await wrapper!.setProps({ modelValue: true })
    await flushPromises()
    expect(input().value).toBe('https://changed.example')
  })
})
