// useRoleEditor 렌더 테스트 공용 — 실제 PermissionMatrix · ConfirmDialog · ReauthDialog 를 v-bind 로 붙인다.
// 🔴 이 폴더는 빌드 · d.ts 에서 빠진다(vite.config.ts · tsconfig.build.json).
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { vi } from 'vitest'
import { defineComponent, h, ref, type Component, type Ref } from 'vue'
import type { AdminRole } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import ReauthDialog from '../components/common/ReauthDialog.vue'
import PermissionMatrix from '../components/permission/PermissionMatrix.vue'
import type { PermissionMatrixCategory } from '../components/permission/permission-matrix.js'
import {
  useRoleEditor,
  type RoleEditor,
  type RoleEditorApi,
  type RoleEditorOptions,
} from '../composables/useRoleEditor.js'
import { vuetify } from './setup.js'

export const CATALOG = [
  'org.users:read',
  'org.users:write',
  'org.users:delete',
  'org.roles:read',
  'org.roles:write',
  'log:read',
  '*',
]

export const IMPLIES = {
  'org.users:write': ['org.users:read'],
  'org.users:delete': ['org.users:write'],
  'org.roles:write': ['org.roles:read'],
}

export const CATEGORIES: PermissionMatrixCategory[] = [
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

/** 🔴 `displayOrder` 에 구멍이 있다(1 → 3) — 이동 목표가 ±1 이면 안 움직인다는 사고를 재기 위해서다. */
export const ROLES: readonly AdminRole[] = [
  {
    roleNo: 1n,
    roleName: '최고관리자',
    displayOrder: 0,
    isDefault: false,
    permissions: ['*'],
    revision: 1,
  },
  {
    roleNo: 2n,
    roleName: '운영자',
    displayOrder: 1,
    isDefault: true,
    permissions: ['org.users:write', 'org.users:read'],
    revision: 4,
  },
  {
    roleNo: 3n,
    roleName: '감사',
    displayOrder: 3,
    isDefault: false,
    permissions: ['log:read'],
    revision: 0,
  },
]

const copy = (row: AdminRole): AdminRole => ({ ...row, permissions: [...row.permissions] })

/** 서버 흉내 — 수정 · 삭제는 revision 을 대조하고 성공하면 올린다. 이동은 revision 을 건드리지 않는다(스펙 D1). */
export function createFakeRoleApi(initial: readonly AdminRole[] = ROLES) {
  let rows = initial.map(copy)
  let nextRoleNo = 100n
  const sortRows = () => rows.sort((a, b) => a.displayOrder - b.displayOrder)
  const find = (roleNo: bigint) => {
    const row = rows.find((candidate) => candidate.roleNo === roleNo)
    if (row == null) {
      throw new ApiError('없는 역할입니다', { status: 404, code: 'ERR_NO_ROLE', raw: null })
    }
    return row
  }
  const conflict = () =>
    new ApiError('다른 사람이 먼저 바꿨습니다', {
      status: 409,
      code: 'ERR_COMMON_REVISION_CONFLICT',
      raw: null,
    })

  const api = {
    list: vi.fn<RoleEditorApi['list']>(async () => sortRows().map(copy)),
    create: vi.fn<RoleEditorApi['create']>(async (body) => {
      const roleNo = nextRoleNo++
      const displayOrder = Math.max(-1, ...rows.map((row) => row.displayOrder)) + 1
      rows.push({ ...body, permissions: [...body.permissions], roleNo, displayOrder, revision: 0 })
      return roleNo
    }),
    update: vi.fn<RoleEditorApi['update']>(async (roleNo, body) => {
      const row = find(roleNo)
      if (row.revision !== body.revision) throw conflict()
      if (body.roleName != null) row.roleName = body.roleName
      if (body.isDefault != null) row.isDefault = body.isDefault
      if (body.permissions != null) row.permissions = [...body.permissions]
      row.revision += 1
    }),
    remove: vi.fn<RoleEditorApi['remove']>(async (roleNo, body) => {
      const row = find(roleNo)
      if (row.revision !== body.revision) throw conflict()
      rows = rows.filter((candidate) => candidate.roleNo !== roleNo)
    }),
    move: vi.fn<RoleEditorApi['move']>(async (roleNo, body) => {
      const row = find(roleNo)
      const other = rows.find((candidate) => candidate.displayOrder === body.displayOrder)
      if (other != null) other.displayOrder = row.displayOrder
      row.displayOrder = body.displayOrder
    }),
  }
  return { api, rows: () => rows }
}

export type FakeRoleApi = ReturnType<typeof createFakeRoleApi>

export interface RoleEditorHarness {
  editor: RoleEditor
  fake: FakeRoleApi
  /** 행위자 권한 — 기본 `['*']`. */
  actor: Ref<string[]>
  canWrite: Ref<boolean>
  /** 자기 직책 이름 — 기본 없음. */
  me: Ref<string | null>
}

let current: VueWrapper | null = null

export async function mountRoleEditor(
  overrides: Partial<RoleEditorOptions> & { roles?: readonly AdminRole[] } = {},
): Promise<RoleEditorHarness> {
  const { roles, ...options } = overrides
  const fake = createFakeRoleApi(roles)
  const actor = ref<string[]>(['*'])
  const canWrite = ref(true)
  const me = ref<string | null>(null)
  let editor!: RoleEditor
  current = mount(
    defineComponent({
      setup() {
        editor = useRoleEditor({
          api: fake.api,
          permissions: CATALOG,
          implies: IMPLIES,
          canWrite: () => canWrite.value,
          actorPermissions: () => actor.value,
          isSelf: (role) => role.roleName === me.value,
          ...options,
        })
        return () =>
          h('div', [
            h(PermissionMatrix as Component, { ...editor.matrix.value, categories: CATEGORIES }),
            h(ConfirmDialog as Component, editor.confirmDialog.value),
            h(ReauthDialog as Component, editor.reauthDialog.value),
          ])
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return { editor, fake, actor, canWrite, me }
}

export function unmountRoleEditor(): void {
  current?.unmount()
  current = null
  document.body.innerHTML = ''
}

export const cell = (key: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${key}"]`)

export async function clickCell(key: string): Promise<void> {
  const input = cell(key)
  if (input == null) throw new Error(`가드 — ${key} 칸이 없다`)
  input.click()
  await flushPromises()
}
