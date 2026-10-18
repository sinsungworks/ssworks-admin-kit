// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { VAutocomplete } from 'vuetify/components'
import { installVisualViewport, vuetify } from '../../test/setup.js'
import RemoteSearchField from './RemoteSearchField.vue'

// 정본: 3f 최종 리뷰 반영(audit-log-viewer.render.test.ts F1 · F2) — 실제 Vuetify 선택 경로로 잰다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

const TEXTS = {
  hintText: '이름을 입력하세요.',
  emptyText: '맞는 사람이 없습니다.',
  failedText: '검색하지 못했습니다.',
}

function mountField(
  initial: { value?: string; items?: { value: string; title: string }[]; failed?: boolean } = {},
) {
  const value = ref(initial.value ?? '')
  const items = ref(initial.items ?? [])
  const failed = ref(initial.failed ?? false)
  const searches: string[] = []
  wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(RemoteSearchField as Component, {
            modelValue: value.value,
            items: items.value,
            label: '대상 사용자',
            name: 'scopeRefNo',
            searching: false,
            failed: failed.value,
            ...TEXTS,
            'onUpdate:modelValue': (next: string) => {
              value.value = next
            },
            onSearch: (keyword: string) => {
              searches.push(keyword)
            },
          })
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  return { value, items, failed, searches }
}

const overlayText = () =>
  Array.from(document.querySelectorAll('.v-overlay--active'))
    .map((e) => e.textContent)
    .join('|')

/** 3f audit-log-viewer.render.test.ts `typeActor` 와 같은 손놀림 — 칸을 눌러 메뉴를 열고 친다 */
async function type(keyword: string): Promise<void> {
  const input = wrapper!.find('input:not([type="hidden"])')
  await input.trigger('focusin')
  await wrapper!.find('.v-field').trigger('mousedown')
  await input.setValue(keyword)
  await flushPromises()
}

describe('RemoteSearchField', () => {
  it('🔴 항목을 고르면 그 글자로 다시 검색하지 않는다 — 실제 선택 경로', async () => {
    const state = mountField({ items: [{ value: '12', title: '김운영 (ops01)' }] })
    await type('김')
    expect(state.searches).toEqual(['김'])
    const item = Array.from(
      document.querySelectorAll<HTMLElement>('.v-overlay--active .v-list-item'),
    ).find((e) => e.textContent?.includes('김운영 (ops01)'))
    expect(item, '가드 — 메뉴에 항목이 보인다').toBeDefined()
    item!.click()
    await flushPromises()
    expect(state.value.value).toBe('12')
    expect(state.searches).toEqual(['김'])
  })

  it('비우면 빈 문자열을 올린다', async () => {
    const state = mountField({ value: '12', items: [{ value: '12', title: '김운영 (ops01)' }] })
    wrapper!.findComponent(VAutocomplete).vm.$emit('update:modelValue', null)
    expect(state.value.value).toBe('')
  })

  it('🔴 고른 사람만 남은 목록에서 "결과 없음" · "검색 실패"를 메뉴 맨 위 줄로', async () => {
    const state = mountField({ value: '12', items: [{ value: '12', title: '김운영 (ops01)' }] })
    await type('박')
    expect(overlayText()).toContain(TEXTS.emptyText)
    expect(overlayText()).toContain('김운영 (ops01)')
    state.failed.value = true
    await flushPromises()
    expect(overlayText()).toContain(TEXTS.failedText)
  })

  it('목록이 비면 no-data — 검색어가 없으면 안내 글자', async () => {
    mountField()
    const field = wrapper!.findComponent(VAutocomplete)
    expect(field.props('noDataText')).toBe(TEXTS.hintText)
    expect(field.props('noFilter')).toBe(true)
  })

  it('오류 문구 · hide-details · disabled 를 넘긴다', async () => {
    wrapper = mount(RemoteSearchField as Component, {
      props: {
        modelValue: '',
        items: [],
        label: 'x',
        name: 'x',
        searching: false,
        failed: false,
        ...TEXTS,
        errorMessages: ['고르세요'],
        hideDetails: true,
        disabled: true,
      },
      attachTo: document.body,
      global: { plugins: [vuetify] },
    })
    const field = wrapper.findComponent(VAutocomplete)
    expect(field.props('errorMessages')).toEqual(['고르세요'])
    expect(field.props('hideDetails')).toBe(true)
    expect(field.props('disabled')).toBe(true)
  })
})
