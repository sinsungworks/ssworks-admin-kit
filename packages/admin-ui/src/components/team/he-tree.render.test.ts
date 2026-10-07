// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Component } from 'vue'
import { VBtn } from 'vuetify/components'
import { Draggable } from '@he-tree/vue'
import { vuetify } from '../../test/setup.js'

// he-tree 계약 — TeamTree 가 기대는 라이브러리 동작을 고정한다(3d 스펙 D3 · D7 · D8).
// he-tree 를 올렸을 때 여기가 빨개지면 TeamTree 의 해당 🔴 규칙을 다시 본다.

interface Item {
  no: number
  name: string
  children: Item[]
}

/** TeamTree 가 쓰는 노드 상태 필드만 — `@he-tree/tree-utils` 의 `Stat` 을 들이지 않는다 */
interface Stat {
  data: Item
  open: boolean
  parent: Stat | null
  children: Stat[]
}

interface TreeInstance {
  getStat(data: Item): Stat
  move(stat: Stat, parent: Stat | null, index: number): boolean
  statsFlat: Stat[]
}

const TREE = (): Item[] => [
  {
    no: 1,
    name: 'root',
    children: [
      { no: 2, name: 'a', children: [{ no: 4, name: 'a1', children: [] }] },
      { no: 3, name: 'b', children: [] },
    ],
  },
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function setup(options: { closed?: number[]; blockAlt?: boolean } = {}) {
  const data = ref(TREE())
  const closed = new Set(options.closed ?? [])
  const onChange = vi.fn()
  let tree: TreeInstance | null = null
  wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(
            'div',
            {
              onKeydownCapture: options.blockAlt
                ? (event: KeyboardEvent) => {
                    if (event.altKey && event.key.startsWith('Arrow')) {
                      event.preventDefault()
                      event.stopPropagation()
                    }
                  }
                : undefined,
            },
            [
              h(
                Draggable as Component,
                {
                  ref: (instance: unknown) => {
                    tree = instance as TreeInstance | null
                  },
                  modelValue: data.value,
                  ariaLabel: '팀 트리',
                  statHandler: (stat: Stat) => {
                    stat.open = !closed.has(stat.data.no)
                    return stat
                  },
                  onChange,
                },
                {
                  default: ({ node }: { node: Item }) =>
                    h('span', { class: 'name' }, [
                      node.name,
                      h(VBtn, { 'aria-label': `${node.name} 버튼`, size: 'x-small' }),
                    ]),
                },
              ),
            ],
          )
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  return {
    data,
    onChange,
    tree: () => tree!,
    names: () => wrapper!.findAll('.name').map((n) => n.text()),
  }
}

describe('he-tree 계약', () => {
  it('노드에 role="treeitem" · aria-level 을 달고, 슬롯 안 Vuetify 컴포넌트가 그려진다', async () => {
    setup()
    await nextTick()
    expect(wrapper!.findAll('[role="treeitem"]').map((n) => n.attributes('aria-level'))).toEqual([
      '1',
      '2',
      '3',
      '2',
    ])
    expect(wrapper!.find('[role="tree"]').attributes('aria-label')).toBe('팀 트리')
    expect(wrapper!.findAll('button[aria-label$="버튼"]')).toHaveLength(4)
  })

  it('statHandler 가 펼침을 정하고, 새 배열이 오면 다시 불린다(D3)', async () => {
    const { data, names } = setup({ closed: [2] })
    await nextTick()
    expect(names()).toEqual(['root', 'a', 'b'])
    data.value = TREE()
    await nextTick()
    await nextTick()
    expect(names()).toEqual(['root', 'a', 'b'])
  })

  it('인스턴스 move() 는 데이터를 바꾸지만 change 를 내지 않는다(TeamTree 테스트가 change 를 직접 내보내는 이유)', async () => {
    const { data, onChange, tree } = setup()
    await nextTick()
    const statB = tree().getStat(data.value[0]!.children[1]!)
    const statRoot = tree().getStat(data.value[0]!)
    tree().move(statB, statRoot, 0)
    await nextTick()
    expect(data.value[0]!.children.map((c) => c.name)).toEqual(['b', 'a'])
    expect(onChange).not.toHaveBeenCalled()
    expect(tree().statsFlat.map((s) => s.data.name)).toContain('b')
  })

  it('🔴 Alt+↑ 는 막지 않으면 형제 순서를 바꾸고 change 를 낸다(D7 의 이유)', async () => {
    const { data, onChange } = setup()
    await nextTick()
    await wrapper!.findAll('[role="treeitem"]').at(-1)!.trigger('keydown', {
      key: 'ArrowUp',
      altKey: true,
    })
    await nextTick()
    expect(data.value[0]!.children.map((c) => c.name)).toEqual(['b', 'a'])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('감싸개의 캡처 단계 keydown 이 Alt+화살표 이동을 막는다(D7)', async () => {
    const { data, onChange } = setup({ blockAlt: true })
    await nextTick()
    await wrapper!.findAll('[role="treeitem"]').at(-1)!.trigger('keydown', {
      key: 'ArrowUp',
      altKey: true,
    })
    await nextTick()
    expect(data.value[0]!.children.map((c) => c.name)).toEqual(['a', 'b'])
    expect(onChange).not.toHaveBeenCalled()
  })
})
