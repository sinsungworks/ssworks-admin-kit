// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { vuetify } from '../../test/setup.js'
import EmptyState from './EmptyState.vue'

// 정본: hangang-home empty-state.render.test.ts
// 🔴 「두 상태가 갈린다」를 지킨다. 뭉뚱그리면 필터를 켜 둔 관리자가 이미 있는 항목을 다시 만든다.

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mountState(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  wrapper = mount(EmptyState, { props, global: { plugins: [vuetify] } })
  await flushPromises()
  return wrapper
}

function buttonByText(w: VueWrapper, text: string) {
  return w.findAll('button').find((b) => b.text().trim() === text)
}

describe('EmptyState — 「아직 없다」와 「검색이 0건이다」는 다른 상태다', () => {
  it('기본은 「아직 없습니다」다', async () => {
    expect((await mountState()).text()).toContain('아직 없습니다')
  })

  it('🔴 filtered 면 다른 문구를 내고 「아직 없습니다」와 안 겹친다', async () => {
    const w = await mountState({ filtered: true })
    expect(w.text()).toContain('검색 결과가 없습니다')
    expect(w.text()).not.toContain('아직 없습니다')
  })

  it('filtered 면 다음 행동(필터 풀기)을 함께 적는다', async () => {
    expect((await mountState({ filtered: true })).text()).toContain('필터를 풀면')
  })

  it('두 문구 모두 화면이 갈아끼울 수 있다', async () => {
    const empty = await mountState({ title: '게시글이 아직 없습니다' })
    expect(empty.text()).toContain('게시글이 아직 없습니다')
    empty.unmount()
    const filtered = await mountState({
      filtered: true,
      filteredTitle: '조건에 맞는 글이 없습니다',
    })
    expect(filtered.text()).toContain('조건에 맞는 글이 없습니다')
  })
})

describe('EmptyState — 만들기 버튼은 권한이 있을 때만', () => {
  it('🔴 canCreate 면 만들기 버튼이 있다', async () => {
    expect(
      buttonByText(await mountState({ canCreate: true, createLabel: '글쓰기' }), '글쓰기'),
    ).toBeTruthy()
  })

  it('🔴 canCreate 가 아니면 만들기 버튼이 없다', async () => {
    const w = await mountState({ canCreate: false, createLabel: '글쓰기' })
    expect(w.text(), '가드 — 빈 상태 문구가 그려졌다').toContain('아직 없습니다')
    expect(buttonByText(w, '글쓰기')).toBeUndefined()
  })

  it('🔴 filtered 면 권한이 있어도 만들기 버튼을 안 낸다', async () => {
    const w = await mountState({ filtered: true, canCreate: true, createLabel: '글쓰기' })
    expect(w.text(), '가드 — 검색 0건 문구가 그려졌다').toContain('검색 결과가 없습니다')
    expect(buttonByText(w, '글쓰기')).toBeUndefined()
  })

  it('만들기 버튼을 누르면 create 가 나간다', async () => {
    const w = await mountState({ canCreate: true, createLabel: '글쓰기' })
    await buttonByText(w, '글쓰기')!.trigger('click')
    expect(w.emitted('create')).toHaveLength(1)
  })
})
