// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createPermissionCheck } from '@ssworks/admin-shared'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, type Component } from 'vue'
import { VLayout } from 'vuetify/components'
import { createAdminUi } from '../context/admin-ui.js'
import type { AdminShellMenuProps } from '../layout/AdminShell.vue'
import { installVisualViewport, vuetify } from '../test/setup.js'
import MainMenu from './MainMenu.vue'
import type { MenuNode } from './menu.js'

// 정본: 신규(스펙 §6). hangang MainMenu 에는 렌더 테스트가 없었다.
// 🔴 crm·axion 의 `rail` 이 재귀 자식에 안 내려가던 버그, `is-last` 이중 의미를 지킨다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

const items: MenuNode[] = [
  { id: 'home', title: '대시보드', to: '/', icon: 'mdi-home' },
  {
    id: 'content',
    title: '콘텐츠',
    children: [
      { id: 'pages', title: '페이지', to: '/pages', permissions: ['content.pages:read'] },
      { id: 'files', title: '파일', to: '/files', anyPermissions: ['content.files:read'] },
    ],
  },
]

/** VNavigationDrawer 는 레이아웃 안에서만 산다. */
function host(menuProps: Record<string, unknown>, slots: Record<string, unknown> = {}): Component {
  return defineComponent({
    render: () =>
      h(VLayout, null, {
        default: () => h(MainMenu as Component, { modelValue: true, ...menuProps }, slots as never),
      }),
  })
}

async function mountMenu(
  menuProps: Record<string, unknown>,
  opts: { granted?: string[]; slots?: Record<string, unknown> } = {},
): Promise<VueWrapper> {
  const granted = opts.granted ?? []
  wrapper = mount(host(menuProps, opts.slots), {
    global: {
      plugins: [
        vuetify,
        createAdminUi({
          user: () => ({ userId: 'u', userName: 'U', permissions: granted }),
          logout: async () => {},
        }),
      ],
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const text = (w: VueWrapper) => w.text()

describe('MainMenu — 항목과 권한 필터', () => {
  it('items 를 그리고, 컨텍스트 user().permissions 로 걸러진다', async () => {
    const w = await mountMenu({ items }, { granted: ['content.pages:read'] })
    expect(text(w)).toContain('대시보드')
    expect(text(w)).toContain('페이지')
    expect(text(w)).not.toContain('파일')
  })

  it('🔴 자식이 전부 걸러지면 그룹 머리도 안 그린다', async () => {
    const w = await mountMenu({ items }, { granted: [] })
    expect(text(w)).toContain('대시보드')
    expect(text(w)).not.toContain('콘텐츠')
  })

  it('check prop 이 컨텍스트보다 우선한다', async () => {
    const check = createPermissionCheck(() => ['content.files:read'])
    const w = await mountMenu({ items, check }, { granted: ['content.pages:read'] })
    expect(text(w)).toContain('파일')
    expect(text(w)).not.toContain('페이지')
  })

  it('filter prop 은 권한과 AND 다', async () => {
    const w = await mountMenu(
      { items, filter: (n: MenuNode) => n.id !== 'pages' },
      { granted: ['*'] },
    )
    expect(text(w)).toContain('파일')
    expect(text(w)).not.toContain('페이지')
  })

  it('🔴 filter 는 좁힌 MenuNode<Permission> 술어도 받는다 (타입 — vue-tsc 가 잰다)', async () => {
    // 프로젝트는 `MenuNode<Permission>` 으로 술어를 쓴다. prop 이 `(node: MenuNode) => boolean`
    // 프로퍼티 꼴이면 매개변수가 반공변이라 TS2322 로 막힌다 — 메서드 꼴(bivariant)이어야 한다.
    type Perm = 'content.pages:read' | 'content.files:read'
    const narrow = (n: MenuNode<Perm>): boolean =>
      !(n.permissions ?? []).includes('content.pages:read')
    const menuProps: InstanceType<typeof MainMenu>['$props'] = { items, filter: narrow }
    const shellProps: AdminShellMenuProps = { items, filter: narrow }
    expect(shellProps.filter).toBe(narrow)
    const w = await mountMenu({ ...menuProps }, { granted: ['*'] })
    expect(text(w)).toContain('파일')
    expect(text(w)).not.toContain('페이지')
  })

  it('disabled + badge 는 칩으로 그리고 링크로 만들지 않는다', async () => {
    const pending: MenuNode[] = [
      { id: 'soon', title: '곧 열림', to: '/soon', disabled: true, badge: '준비 중' },
    ]
    const w = await mountMenu({ items: pending })
    expect(text(w)).toContain('곧 열림')
    expect(w.find('.v-chip').text()).toBe('준비 중')
    expect(w.find('.v-list-item').classes()).toContain('v-list-item--disabled')
    expect(w.find('a[href]').exists()).toBe(false)
  })

  it('divider 는 그 노드 뒤에 선다', async () => {
    const withDivider: MenuNode[] = [
      { id: 'a', title: '에이', to: '/a', divider: true },
      { id: 'b', title: '비', to: '/b' },
    ]
    const w = await mountMenu({ items: withDivider })
    const children = [...w.find('.v-list').element.children]
    expect(
      children.map((el) => el.className.includes('v-divider') || el.textContent?.trim()),
    ).toEqual(['에이', true, '비'])
  })
})

describe('MainMenu — 그룹 모드', () => {
  it("기본 'subheader' 는 VListSubheader 로 그룹 머리를 그린다", async () => {
    const w = await mountMenu({ items }, { granted: ['*'] })
    expect(w.find('.v-list-subheader').text()).toBe('콘텐츠')
    expect(w.find('.v-list-group').exists()).toBe(false)
  })

  it("'collapsible' 은 VListGroup 으로 그린다", async () => {
    const w = await mountMenu({ items, groupMode: 'collapsible' }, { granted: ['*'] })
    expect(w.find('.v-list-group').exists()).toBe(true)
    expect(w.find('.v-list-subheader').exists()).toBe(false)
    expect(text(w)).toContain('콘텐츠')
  })
})

describe('MainMenu — rail', () => {
  it('rail 이면 그룹 머리를 숨긴다', async () => {
    const w = await mountMenu({ items, rail: true }, { granted: ['*'] })
    expect(w.find('.v-list-subheader').exists()).toBe(false)
  })

  it('🔴 rail 이 재귀 자식에도 전달된다 — 중첩 그룹의 머리도 숨는다', async () => {
    const nested: MenuNode[] = [
      {
        id: 'outer',
        title: '바깥',
        children: [
          { id: 'inner', title: '안쪽', children: [{ id: 'leaf', title: '잎', to: '/leaf' }] },
        ],
      },
    ]
    const open = await mountMenu({ items: nested })
    expect(open.findAll('.v-list-subheader').map((s) => s.text())).toEqual(['바깥', '안쪽'])
    open.unmount()
    wrapper = null

    const rail = await mountMenu({ items: nested, rail: true })
    expect(rail.findAll('.v-list-subheader')).toHaveLength(0)
  })
})

describe('MainMenu — 슬롯', () => {
  it('#prepend 는 { rail } 을 받는다', async () => {
    const slots = {
      prepend: (p: { rail: boolean }) => h('div', { class: 'brand' }, `rail=${p.rail}`),
    }
    const open = await mountMenu({ items }, { slots })
    expect(open.find('.brand').text()).toBe('rail=false')
    open.unmount()
    wrapper = null
    const rail = await mountMenu({ items, rail: true }, { slots })
    expect(rail.find('.brand').text()).toBe('rail=true')
  })

  it('#append 를 그린다', async () => {
    const w = await mountMenu(
      { items },
      { slots: { append: () => h('div', { class: 'foot' }, '푸터') } },
    )
    expect(w.find('.foot').text()).toBe('푸터')
  })
})
