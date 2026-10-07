// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Component } from 'vue'
import { VAutocomplete, VDialog } from 'vuetify/components'
import { moveTargets, type AdminTeamNode } from '@ssworks/admin-shared'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import TeamMoveDialog from './TeamMoveDialog.vue'

installVisualViewport()

const n = (
  teamNo: number,
  teamName: string,
  displayOrder: number,
  children: AdminTeamNode[] = [],
): AdminTeamNode => ({ teamNo: BigInt(teamNo), teamName, displayOrder, children })

const TREE = (): AdminTeamNode[] => [
  n(1, '한강투자그룹', 0, [
    n(3, '관리본부', 5, [n(7, '인사팀', 0)]),
    n(2, '영업본부', 0, [n(6, '분당지점', 9), n(4, '강남지점', 0), n(5, '판교지점', 5)]),
  ]),
]

interface Option {
  key: string
  title: string
  teamName: string | null
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(TeamMoveDialog as Component, {
    attachTo: document.body,
    props: { modelValue: true, teamName: '판교지점', targets: moveTargets(TREE(), 5n), ...props },
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body
const autocomplete = () => wrapper!.findComponent(VAutocomplete)

async function choose(key: string) {
  autocomplete().vm.$emit('update:modelValue', key)
  await flushPromises()
}

describe('TeamMoveDialog', () => {
  it('제목 · 문구 · 선택지(조직도 순서 · 들여쓰기)', async () => {
    await setup()
    expect(dialog().textContent).toContain('「판교지점」 옮기기')
    expect(dialog().textContent).toContain(
      '고른 팀 아래 맨 끝으로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.',
    )
    expect((autocomplete().props('items') as Option[]).map((o) => o.title)).toEqual([
      '한강투자그룹',
      '　└ 강남지점',
      '　└ 분당지점',
      '└ 관리본부',
      '　└ 인사팀',
    ])
  })

  it('고르기 전엔 옮기기가 비활성이고, 고르면 confirm(번호)', async () => {
    await setup()
    expect(buttonByText('옮기기', dialog())!.disabled).toBe(true)
    await choose('3')
    expect(buttonByText('옮기기', dialog())!.disabled).toBe(false)
    buttonByText('옮기기', dialog())!.click()
    expect(wrapper!.emitted('confirm')).toEqual([[3n]])
  })

  it('🔴 최상위는 null 로 나간다 — Vuetify 선택 상자에는 내부 키로 넘긴다', async () => {
    await setup({ targets: moveTargets(TREE(), 5n, { topLevel: true }) })
    expect((autocomplete().props('items') as Option[])[0]!.title).toBe('최상위')
    await choose('top')
    buttonByText('옮기기', dialog())!.click()
    expect(wrapper!.emitted('confirm')).toEqual([[null]])
  })

  it('들여쓰기 글자가 아니라 원래 이름으로 찾는다', async () => {
    await setup({ targets: moveTargets(TREE(), 5n, { topLevel: true }) })
    const filter = autocomplete().props('customFilter') as (
      value: string,
      query: string,
      item?: { raw: Option },
    ) => boolean
    const items = autocomplete().props('items') as Option[]
    const hr = items.find((o) => o.teamName === '인사팀')!
    expect(filter('', '인사', { raw: hr })).toBe(true)
    expect(filter('', '└', { raw: hr })).toBe(false)
    expect(filter('', '최상', { raw: items[0]! })).toBe(true)
  })

  it('🔴 다시 열면 고른 값 · 검색어가 비워진다(지연 마운트)', async () => {
    await setup()
    // 고른 값 없이 검색어만 — Vuetify 는 선택이 바뀔 때 검색어를 스스로 비우므로 이 경우만 우리 초기화를 잰다
    autocomplete().vm.$emit('update:search', '인사')
    await flushPromises()
    expect(autocomplete().props('search')).toBe('인사')
    await wrapper!.setProps({ modelValue: false })
    await wrapper!.setProps({ modelValue: true })
    await flushPromises()
    expect(autocomplete().props('search')).toBe('')

    await choose('3')
    autocomplete().vm.$emit('update:search', '인사')
    await flushPromises()
    await wrapper!.setProps({ modelValue: false })
    await wrapper!.setProps({ modelValue: true })
    await flushPromises()
    expect(autocomplete().props('modelValue')).toBeNull()
    expect(autocomplete().props('search')).toBe('')
  })

  it('제출 중엔 취소 · 옮기기 · 선택 상자가 잠긴다', async () => {
    await setup()
    await choose('3')
    await wrapper!.setProps({ submitting: true })
    expect(buttonByText('취소', dialog())!.disabled).toBe(true)
    expect(buttonByText('옮기기', dialog())!.disabled).toBe(true)
    expect(autocomplete().props('disabled')).toBe(true)
  })

  it('바깥 누르기 · Esc 로 닫히지 않는다(persistent), 취소로 닫는다', async () => {
    await setup()
    expect(wrapper!.findComponent(VDialog).props('persistent')).toBe(true)
    buttonByText('취소', dialog())!.click()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
  })
})
