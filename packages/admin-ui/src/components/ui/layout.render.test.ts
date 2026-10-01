// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { vuetify } from '../../test/setup.js'
import CardLayout from './CardLayout.vue'
import ColumnLayout from './ColumnLayout.vue'
import ColumnPane from './ColumnPane.vue'
import PanelLayout from './PanelLayout.vue'

// 정본: hangang-home apps/admin/src/components/ui/layout.render.test.ts (divider 단언만 뒤집었다)
const global = { plugins: [vuetify] }

describe('PanelLayout', () => {
  it('세 슬롯이 top → content → bottom 순서로 놓인다', () => {
    const w = mount(PanelLayout, {
      global,
      slots: { top: '<p>상단</p>', default: '<p>본문</p>', bottom: '<p>하단</p>' },
    })
    const kids = Array.from(w.get('.panel-layout').element.children).map((el) => el.className)
    expect(kids).toEqual(['panel-layout__top', 'panel-layout__content', 'panel-layout__bottom'])
  })

  it('본문은 content-inner 안에 들어간다 — 스크롤 상자가 그것이다', () => {
    const w = mount(PanelLayout, { global, slots: { default: '<p id="body">본문</p>' } })
    expect(w.find('.panel-layout__content > .panel-layout__content-inner #body').exists()).toBe(
      true,
    )
  })

  it('🔴 scrollable 이 꺼져 있으면 수식 클래스가 없다 — 기본값이 false 다', () => {
    const w = mount(PanelLayout, { global })
    expect(w.get('.panel-layout').classes()).not.toContain('panel-layout--scrollable')
  })

  it('🔴 scrollable 을 켜면 수식 클래스가 붙는다 — 이것이 사라지면 스크롤이 통째로 죽는다', () => {
    const w = mount(PanelLayout, { global, props: { scrollable: true } })
    expect(w.get('.panel-layout').classes()).toContain('panel-layout--scrollable')
  })
})

describe('CardLayout', () => {
  it('VCard 를 outlined 로 낸다', () => {
    const w = mount(CardLayout, { global, slots: { default: '<p>내용</p>' } })
    expect(w.get('.card-layout').classes()).toContain('v-card--variant-outlined')
  })

  it('fillHeight 를 켜면 fill-height 가 붙고 꺼져 있으면 안 붙는다', () => {
    expect(mount(CardLayout, { global }).get('.card-layout').classes()).not.toContain('fill-height')
    expect(
      mount(CardLayout, { global, props: { fillHeight: true } })
        .get('.card-layout')
        .classes(),
    ).toContain('fill-height')
  })
})

describe('ColumnLayout', () => {
  it('gap 을 인라인 스타일로 그대로 넘긴다', () => {
    const w = mount(ColumnLayout, { global, props: { gap: '12px' } })
    expect(w.get('.column-layout').attributes('style')).toContain('gap: 12px')
  })

  it('divider 는 기본 꺼짐이고 켜면 수식 클래스가 붙는다 (crm-v5 prop 복원)', () => {
    expect(mount(ColumnLayout, { global }).get('.column-layout').classes()).not.toContain(
      'column-layout--divider',
    )
    expect(
      mount(ColumnLayout, { global, props: { divider: true } })
        .get('.column-layout')
        .classes(),
    ).toContain('column-layout--divider')
  })
})

describe('ColumnPane', () => {
  // happy-dom 은 `flex` shorthand 를 longhand 로 분해해 저장하고 다시 합치지 않는다 — 컴포넌트는
  // shorthand 를 쓰고, 단언만 longhand 로 본다(hangang 실측).
  it('width 를 주면 flex 가 고정폭이 된다', () => {
    const style = mount(ColumnPane, { global, props: { width: '240px' } })
      .get('.column-pane')
      .attributes('style')
    expect(style).toContain('flex-grow: 0')
    expect(style).toContain('flex-shrink: 0')
    expect(style).toContain('flex-basis: 240px')
  })

  it('🔴 width 가 없으면 flex: 1 이다 — 세 열 화면의 폭 산술이 이 사실에 선다', () => {
    const style = mount(ColumnPane, { global }).get('.column-pane').attributes('style')
    expect(style).toContain('flex-grow: 1')
    expect(style).toContain('flex-shrink: 1')
  })

  it('세 슬롯이 top → content → bottom 순서로 놓인다', () => {
    const w = mount(ColumnPane, {
      global,
      slots: { top: '<p>상단</p>', default: '<p>본문</p>', bottom: '<p>하단</p>' },
    })
    // 자신이 VCard 라 Vuetify 가 loader·underlay 를 함께 낸다. 우리 클래스만 걸러 상대 순서를 본다.
    const kids = Array.from(w.get('.column-pane').element.children)
      .map((el) => el.className)
      .filter((cls) => cls.startsWith('column-pane__'))
    expect(kids).toEqual(['column-pane__top', 'column-pane__content', 'column-pane__bottom'])
  })

  it('🔴 자신이 VCard 다 — 이 안에 카드를 루트로 넣으면 테두리가 이중선이 된다', () => {
    expect(mount(ColumnPane, { global }).get('.column-pane').classes()).toContain('v-card')
  })

  it('scrollable 을 켜면 수식 클래스가 붙는다', () => {
    expect(
      mount(ColumnPane, { global, props: { scrollable: true } })
        .get('.column-pane')
        .classes(),
    ).toContain('column-pane--scrollable')
  })
})
