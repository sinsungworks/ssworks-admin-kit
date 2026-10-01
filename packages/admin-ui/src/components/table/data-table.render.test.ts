// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { VDataTableServer } from 'vuetify/components'
import { installVisualViewport, vuetify } from '../../test/setup.js'
import {
  ADMIN_LIST_MAX_PAGE_SIZE,
  DEFAULT_ITEMS_PER_PAGE_OPTIONS,
  formatSortLabel,
  type AdminTableHeader,
  type AdminTableSort,
} from './data-table.js'
import DataTableBody from './DataTableBody.vue'
import DataTablePanel from './DataTablePanel.vue'

// 정본: hangang-home data-table-panel.render.test.ts + data-table-body.render.test.ts
//
// 지키는 것 셋: ① 서버 페이지네이션의 모양(`items` 와 `itemsLength` 가 갈려서 표에 닿는가)
// ② 기본 정렬이 화면에 보이는가 ③ 슬롯이 2단을 지나 표에 닿는가.

installVisualViewport()

const HEADERS: AdminTableHeader[] = [
  { title: '제목', key: 'title' },
  { title: '발행일', key: 'publishAt' },
]

const ITEMS = [
  { title: '첫 글', publishAt: '2026-08-01' },
  { title: '둘째 글', publishAt: '2026-08-02' },
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountPanel(
  props: Record<string, unknown> = {},
  slots: Record<string, string> = {},
): Promise<VueWrapper> {
  wrapper = mount(DataTablePanel, {
    props: {
      title: '게시글',
      headers: HEADERS,
      items: ITEMS,
      itemsLength: 137,
      sortBy: [{ key: 'publishAt', order: 'desc' }] as AdminTableSort[],
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
    slots,
  })
  await flushPromises()
  return wrapper
}

describe('formatSortLabel — 기본 정렬을 사람이 읽는 문장으로', () => {
  it('열 이름과 방향을 함께 낸다', () => {
    expect(formatSortLabel(HEADERS, [{ key: 'publishAt', order: 'desc' }])).toBe(
      '정렬: 발행일 내림차순',
    )
    expect(formatSortLabel(HEADERS, [{ key: 'title', order: 'asc' }])).toBe('정렬: 제목 오름차순')
  })

  it('정렬이 없으면 없다고 적는다', () => {
    expect(formatSortLabel(HEADERS, [])).toBe('정렬 없음')
  })

  it('🔴 헤더에 없는 키로 정렬 중이면 키를 그대로 보여 준다 — 빈칸으로 떨어뜨리지 않는다', () => {
    expect(formatSortLabel(HEADERS, [{ key: 'createAt', order: 'desc' }])).toBe(
      '정렬: createAt 내림차순',
    )
  })

  it('문구를 바꿀 수 있다', () => {
    expect(
      formatSortLabel(HEADERS, [{ key: 'title', order: 'asc' }], { prefix: 'Sort', asc: 'ASC' }),
    ).toBe('Sort: 제목 ASC')
  })
})

describe('DataTablePanel — 서버 페이지네이션의 모양', () => {
  it('🔴 itemsLength(서버 총수)와 items(이 페이지분)가 갈려서 표에 닿는다', async () => {
    const w = await mountPanel()
    const table = w.findComponent(VDataTableServer)
    expect(table.exists(), '가드 — 서버 표가 그려졌다').toBe(true)
    expect(table.props('itemsLength')).toBe(137)
    expect(table.props('items')).toHaveLength(2)
  })

  it('페이지·쪽당 개수·정렬이 표로 내려간다', async () => {
    const w = await mountPanel({ page: 3, itemsPerPage: 50 })
    const table = w.findComponent(VDataTableServer)
    expect(table.props('page')).toBe(3)
    expect(table.props('itemsPerPage')).toBe(50)
    expect(table.props('sortBy')).toEqual([{ key: 'publishAt', order: 'desc' }])
  })

  it('🔴 표가 페이지를 바꾸면 부모에게 그대로 올라간다', async () => {
    const w = await mountPanel()
    w.findComponent(VDataTableServer).vm.$emit('update:page', 2)
    await flushPromises()
    expect(w.emitted('update:page')?.at(-1)).toEqual([2])
  })

  it('🔴 표가 정렬을 바꾸면 부모에게 그대로 올라간다', async () => {
    const w = await mountPanel()
    w.findComponent(VDataTableServer).vm.$emit('update:sortBy', [{ key: 'title', order: 'asc' }])
    await flushPromises()
    expect(w.emitted('update:sortBy')?.at(-1)).toEqual([[{ key: 'title', order: 'asc' }]])
  })
})

describe('DataTablePanel — 기본 정렬을 화면에 적는다', () => {
  it('🔴 현재 정렬이 문장으로 보인다', async () => {
    expect((await mountPanel()).text()).toContain('정렬: 발행일 내림차순')
  })

  it('정렬이 바뀌면 표시도 따라간다', async () => {
    const w = await mountPanel()
    await w.setProps({ sortBy: [{ key: 'title', order: 'asc' }] })
    expect(w.text()).toContain('정렬: 제목 오름차순')
    expect(w.text()).not.toContain('발행일 내림차순')
  })
})

describe('DataTablePanel — 슬롯', () => {
  it('🔴 #no-data 가 표로 내려간다 — 빈 상태를 화면이 정한다', async () => {
    const w = await mountPanel({ items: [], itemsLength: 0 }, { 'no-data': '<p>빈 상태 자리</p>' })
    expect(w.text()).toContain('빈 상태 자리')
  })

  it('#header-actions 와 #filters 는 패널이 직접 그린다 — 정확히 한 번씩', async () => {
    const w = await mountPanel(
      {},
      {
        'header-actions': '<button class="cta">글쓰기</button>',
        filters: '<span class="flt">필터 자리</span>',
      },
    )
    expect(w.findAll('.cta')).toHaveLength(1)
    expect(w.findAll('.flt')).toHaveLength(1)
  })

  it('🔴 패널 슬롯은 표로 안 내려간다 — 같은 내용이 두 번 그려지지 않는다', async () => {
    const w = await mountPanel({}, { 'header-actions': '<span>한 번만</span>' })
    expect(w.text(), '가드 — 슬롯이 그려지긴 했다').toContain('한 번만')
    expect(w.findComponent(VDataTableServer).vm.$slots).not.toHaveProperty('header-actions')
  })

  it('화면이 준 열 슬롯이 두 겹을 지나 표에 닿는다', async () => {
    const w = await mountPanel({}, { 'item.title': '<span class="probe">노출 중</span>' })
    expect(w.find('.probe').exists()).toBe(true)
  })
})

describe('DataTablePanel — 쪽당 개수 선택지', () => {
  it('🔴 기본 선택지에 -1(전체)이 없다 — 고르는 순간 서버가 400 을 낸다', () => {
    expect(DEFAULT_ITEMS_PER_PAGE_OPTIONS.length).toBeGreaterThan(0)
    expect(DEFAULT_ITEMS_PER_PAGE_OPTIONS).not.toContain(-1)
  })

  it('🔴 어느 선택지도 서버 상한을 안 넘고 1 미만이 없다', () => {
    for (const option of DEFAULT_ITEMS_PER_PAGE_OPTIONS) {
      expect(option).toBeGreaterThanOrEqual(1)
      expect(option).toBeLessThanOrEqual(ADMIN_LIST_MAX_PAGE_SIZE)
    }
  })

  it('🔴 선택지가 실제로 표까지 내려간다 — 안 내려가면 Vuetify 기본값이 이긴다', async () => {
    const w = await mountPanel()
    expect(w.findComponent(VDataTableServer).props('itemsPerPageOptions')).toEqual([
      ...DEFAULT_ITEMS_PER_PAGE_OPTIONS,
    ])
  })

  it('화면이 더 좁은 목록으로 덮어쓸 수 있다', async () => {
    const w = await mountPanel({ itemsPerPageOptions: [10, 20] })
    expect(w.findComponent(VDataTableServer).props('itemsPerPageOptions')).toEqual([10, 20])
  })
})

describe('DataTableBody — 표만', () => {
  const global = { plugins: [vuetify] }
  const headers: AdminTableHeader[] = [
    { title: '제목', key: 'title' },
    { title: '상태', key: 'state' },
  ]
  const items = [{ title: '가나다', state: 'live' }]

  it('표만 낸다 — 카드도 제목도 없다', () => {
    const w = mount(DataTableBody, { global, props: { headers, items, itemsLength: 1 } })
    expect(w.find('.v-card').exists()).toBe(false)
    expect(w.find('.v-data-table').exists()).toBe(true)
  })

  it('itemsLength 를 표에 그대로 넘긴다 — items.length 가 아니다', () => {
    const w = mount(DataTableBody, { global, props: { headers, items, itemsLength: 137 } })
    expect(w.getComponent({ name: 'VDataTableServer' }).props('itemsLength')).toBe(137)
  })

  it('열 슬롯과 no-data 슬롯이 표까지 내려간다', () => {
    const w = mount(DataTableBody, {
      global,
      props: { headers, items, itemsLength: 1 },
      slots: { 'item.state': '<span class="probe">노출 중</span>' },
    })
    expect(w.get('.probe').text()).toBe('노출 중')

    const empty = mount(DataTableBody, {
      global,
      props: { headers, items: [], itemsLength: 0 },
      slots: { 'no-data': '<p class="empty">아직 없다</p>' },
    })
    expect(empty.find('.empty').exists()).toBe(true)
  })

  it('카드 껍질은 DataTablePanel 에만 있다', () => {
    const w = mount(DataTablePanel, { global, props: { headers, items, itemsLength: 1 } })
    expect(w.find('.v-card').exists()).toBe(true)
  })
})
