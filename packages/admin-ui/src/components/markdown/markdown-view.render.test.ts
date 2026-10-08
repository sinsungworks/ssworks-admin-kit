// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { vuetify } from '../../test/setup.js'
import MarkdownView from './MarkdownView.vue'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function view(props: Record<string, unknown>, slots: Record<string, () => string> = {}) {
  wrapper = mount(MarkdownView, {
    props,
    slots,
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  return wrapper
}

/** 링크를 눌러 본다. 문서 끝에서 기본 이동을 막아 happy-dom 이 실제로 이동하지 않게 하고, 그 전에 컴포넌트가 막았는지 기록한다 */
function clickLink(anchor: Element): boolean {
  let preventedByComponent = false
  const guard = (event: Event) => {
    preventedByComponent = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', guard)
  try {
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  } finally {
    document.removeEventListener('click', guard)
  }
  return preventedByComponent
}

describe('MarkdownView', () => {
  it('마크다운을 요소로 그린다', () => {
    const w = view({ source: '# 제1조\n\n- 가\n- 나\n\n[도움말](https://example.com/help)' })
    expect(w.find('h1').text()).toBe('제1조')
    expect(w.findAll('li').map((li) => li.text())).toEqual(['가', '나'])
    expect(w.find('a').attributes('href')).toBe('https://example.com/help')
  })

  it('🔴 원문 HTML 은 실행되지 않는다 — script 요소 · onerror 속성이 없다', () => {
    const w = view({ source: '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>' })
    expect(w.element.querySelector('script')).toBeNull()
    expect(w.element.querySelector('[onerror]')).toBeNull()
    expect(w.text()).toContain('<script>alert(1)</script>')
  })

  it('🔴 javascript: 링크는 링크가 되지 않는다', () => {
    const w = view({ source: '[x](javascript:alert(1))' })
    expect(w.element.querySelector('a')).toBeNull()
  })

  it.each([null, '', undefined])('빈 값(%s)이면 #empty 를 보인다', (source) => {
    const w = view({ source }, { empty: () => '미리 볼 내용이 없습니다.' })
    expect(w.text()).toBe('미리 볼 내용이 없습니다.')
    expect(w.classes()).toContain('markdown-view--empty')
  })

  it("linkTarget '_blank' — 링크 클릭의 기본 이동을 막고 새 탭으로 연다", () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const w = view({ source: '[도움말](https://example.com/help)', linkTarget: '_blank' })
    expect(clickLink(w.find('a').element)).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/help', '_blank', 'noopener,noreferrer')
  })

  it("linkTarget '_blank' — 링크 밖을 누르면 개입하지 않는다", () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const w = view({ source: '본문 [도움말](https://example.com/help)', linkTarget: '_blank' })
    w.find('p').element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
  })

  it("linkTarget '_self'(기본) — 클릭에 개입하지 않는다", () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const w = view({ source: '[도움말](https://example.com/help)' })
    expect(clickLink(w.find('a').element)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
