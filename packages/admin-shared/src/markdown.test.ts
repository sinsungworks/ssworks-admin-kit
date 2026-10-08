import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown.js'

// 🔴 이 파일이 곧 계약이다(gise `test/content-markdown.test.ts` 와 같은 뜻) — XSS 묶음을 지우면 `html: true` 로
//    바꿔도 아무도 모른다. 관리자 미리보기 · 서버 공개 렌더 · 공개 웹이 모두 이 함수를 쓴다(3e 스펙 D1).

describe('renderMarkdown — 🔴 원문 HTML · 위험한 링크를 막는다', () => {
  it('원문 <script> 는 이스케이프된다', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('원문 <img onerror> 는 이스케이프된다', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it.each([
    ['링크 javascript:', '[x](javascript:alert(1))'],
    ['이미지 javascript:', '![x](javascript:alert(1))'],
    ['링크 data:text/html', '[x](data:text/html,<script>alert(1)</script>)'],
  ])('%s 는 href · src 가 되지 않는다', (_label, source) => {
    const html = renderMarkdown(source)
    expect(html).not.toMatch(/href="javascript:|src="javascript:|href="data:/i)
    expect(html).not.toContain('<script')
  })
})

describe('renderMarkdown — 렌더', () => {
  it('제목 · 목록을 그린다', () => {
    expect(renderMarkdown('# 제1조')).toBe('<h1>제1조</h1>\n')
    expect(renderMarkdown('- 가\n- 나')).toBe('<ul>\n<li>가</li>\n<li>나</li>\n</ul>\n')
  })

  it('평문 URL 을 링크로 만든다(linkify)', () => {
    expect(renderMarkdown('문의: https://example.com/help')).toContain(
      '<a href="https://example.com/help">https://example.com/help</a>',
    )
  })

  it('줄 하나 바꿈은 <br> 이 아니다(breaks: false)', () => {
    expect(renderMarkdown('첫 줄\n둘째 줄')).toBe('<p>첫 줄\n둘째 줄</p>\n')
  })

  it.each([null, undefined, ''])('%s 는 빈 문자열', (source) => {
    expect(renderMarkdown(source)).toBe('')
  })

  it('같은 입력이면 같은 출력이다', () => {
    const source = '# 제1조\n\n본문 [도움말](https://example.com)'
    expect(renderMarkdown(source)).toBe(renderMarkdown(source))
  })
})
