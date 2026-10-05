// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { vuetify } from '../../test/setup.js'
import PermissionMatrix from './PermissionMatrix.vue'
import {
  assertMatrixCoversPermissions,
  type PermissionMatrixCategory,
} from './permission-matrix.js'

// 정본: hangang-home apps/admin/src/components/org/permission-matrix.render.test.ts 의 규칙(없는 칸 비활성 ·
//       '*' 를 칸으로 못 만듦 · 칸 하나만 토글)을 axion 카테고리 모양에서 다시 잰다.

const CATEGORIES: PermissionMatrixCategory[] = [
  {
    id: 'org',
    label: '조직',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
      { action: 'delete', label: '삭제' },
    ],
    rows: [
      { resource: 'org.users', label: '직원' },
      { resource: 'org.roles', label: '역할' },
    ],
  },
  {
    id: 'log',
    label: '기록',
    columns: [{ action: 'read', label: '읽기' }],
    rows: [{ resource: 'log', label: '감사 로그' }],
  },
]
// org.roles:delete 는 카탈로그에 없다 — 격자에는 칸이 있지만 비활성이어야 한다.
const PERMISSIONS = [
  'org.users:read',
  'org.users:write',
  'org.users:delete',
  'org.roles:read',
  'org.roles:write',
  'log:read',
  '*',
]

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function setup(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const model = ref<string[]>((props.modelValue as string[] | undefined) ?? [])
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          PermissionMatrix as Component,
          {
            categories: CATEGORIES,
            permissions: PERMISSIONS,
            ...props,
            modelValue: model.value,
            'onUpdate:modelValue': (value: string[]) => {
              model.value = value
            },
          },
          slots,
        ),
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return model
}

const cell = (key: string) => document.querySelector<HTMLInputElement>(`input[name="${key}"]`)

async function clickCell(key: string) {
  const input = cell(key)
  expect(input, `가드 — ${key} 칸이 있다`).not.toBeNull()
  input!.click()
  await flushPromises()
}

describe('PermissionMatrix — 렌더', () => {
  it('카테고리마다 표 하나 — 머리 칸은 카테고리 라벨과 열 라벨, 행 머리는 행 라벨', async () => {
    await setup()
    const tables = document.querySelectorAll('table')
    expect(tables).toHaveLength(2)
    const heads = [...tables[0]!.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(heads).toEqual(['조직', '읽기', '편집', '삭제'])
    const rows = [...tables[0]!.querySelectorAll('tbody th')].map((th) => th.textContent?.trim())
    expect(rows).toEqual(['직원', '역할'])
  })

  it('칸의 접근 가능한 이름은 「행 라벨 열 라벨」, name 은 권한 키다', async () => {
    await setup()
    expect(cell('org.users:write')?.getAttribute('aria-label')).toBe('직원 편집')
    expect(cell('log:read')?.getAttribute('aria-label')).toBe('감사 로그 읽기')
  })

  it('🔴 permissions 에 없는 칸은 비활성 · 미체크다 — 모델에 그 키가 있어도', async () => {
    await setup({ modelValue: ['org.roles:delete'] })
    expect(cell('org.roles:delete')?.disabled).toBe(true)
    expect(cell('org.roles:delete')?.checked).toBe(false)
    expect(cell('org.roles:write')?.disabled).toBe(false)
  })

  it("🔴 '*' 는 칸이 되지 않는다 — 칸 키는 늘 resource:action 이다", async () => {
    await setup({ modelValue: ['*'] })
    expect(cell('*')).toBeNull()
    expect([...document.querySelectorAll('input')].some((input) => input.checked)).toBe(false)
  })
})

describe('PermissionMatrix — 토글', () => {
  it('칸 하나만 더하고 뺀다 — 다른 키는 그대로', async () => {
    const model = await setup({ modelValue: ['log:read'] })
    await clickCell('org.users:read')
    expect(model.value).toEqual(['log:read', 'org.users:read'])
    expect(cell('org.users:read')?.checked).toBe(true)
    await clickCell('org.users:read')
    expect(model.value).toEqual(['log:read'])
  })

  it('disabled 면 모든 칸이 비활성이고 모델이 바뀌지 않는다', async () => {
    const model = await setup({ modelValue: ['log:read'], disabled: true })
    expect([...document.querySelectorAll('input')].every((input) => input.disabled)).toBe(true)
    cell('org.users:read')!.click()
    await flushPromises()
    expect(model.value).toEqual(['log:read'])
  })

  it('canPick 이 거짓인 칸은 비활성 — 체크 표시는 모델을 따른다', async () => {
    await setup({
      modelValue: ['org.users:delete'],
      canPick: (permission: string) => permission !== 'org.users:delete',
    })
    expect(cell('org.users:delete')?.disabled).toBe(true)
    expect(cell('org.users:delete')?.checked).toBe(true)
    expect(cell('org.users:write')?.disabled).toBe(false)
  })
})

describe('PermissionMatrix — 슬롯 · 도우미', () => {
  it('#row-extra 를 주면 열 하나를 더해 행마다 그린다', async () => {
    await setup(
      {},
      {
        'row-extra': ({ row, category }: { row: { resource: string }; category: { id: string } }) =>
          h('span', `${category.id}/${row.resource}`),
      },
    )
    expect(document.body.textContent).toContain('org/org.users')
    expect(document.body.textContent).toContain('log/log')
    expect(document.querySelectorAll('table')[0]!.querySelectorAll('thead th')).toHaveLength(5)
  })

  it('슬롯이 없으면 열을 더하지 않는다', async () => {
    await setup()
    expect(document.querySelectorAll('table')[0]!.querySelectorAll('thead th')).toHaveLength(4)
  })

  it("assertMatrixCoversPermissions — 모든 권한('*' 제외)에 칸이 있으면 통과, 아니면 빠진 키를 나열한다", () => {
    expect(() => assertMatrixCoversPermissions(CATEGORIES, PERMISSIONS)).not.toThrow()
    expect(() =>
      assertMatrixCoversPermissions(CATEGORIES, [...PERMISSIONS, 'setting:read', 'setting:write']),
    ).toThrow('setting:read, setting:write')
  })
})
