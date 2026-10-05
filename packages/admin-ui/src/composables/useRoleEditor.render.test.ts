// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import type { AdminRole } from '@ssworks/admin-shared'
import { createAdminUi, type AdminUserInfo } from '../context/admin-ui.js'
import {
  CATALOG,
  ROLES,
  cell,
  clickCell,
  createFakeRoleApi,
  mountRoleEditor,
  unmountRoleEditor,
} from '../test/role-editor-harness.js'
import { installVisualViewport, vuetify } from '../test/setup.js'
import { useRoleEditor, type RoleEditor } from './useRoleEditor.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles.render.test.ts 의 상태 규칙(첫 행 열기 · 전체 권한
//       스위치 · 함의 써 넣기 · 자기 직책 판정 · 응답 경합)과 gise 의 권한 상승 방지를 headless 로 다시 잰다.

installVisualViewport()

afterEach(() => {
  unmountRoleEditor()
  vi.restoreAllMocks()
})

const MATRIX_KEYS = CATALOG.filter((key) => key !== '*')

describe('useRoleEditor — 목록 · 선택', () => {
  it('첫 조회가 끝나면 첫 행을 연다', async () => {
    const { editor, fake } = await mountRoleEditor()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
    expect(editor.loading.value).toBe(false)
    expect(editor.roles.value.map((role) => role.roleName)).toEqual([
      '최고관리자',
      '운영자',
      '감사',
    ])
    expect(editor.selected.value?.roleNo).toBe(1n)
    expect(editor.form.value).toEqual({
      roleName: '최고관리자',
      isDefault: false,
      isAll: true,
      permissions: [],
    })
  })

  it("select 는 폼을 그 행으로 세운다 — 권한은 카탈로그 순서, '*' 는 isAll 로", async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    expect(editor.form.value).toEqual({
      roleName: '운영자',
      isDefault: true,
      isAll: false,
      permissions: ['org.users:read', 'org.users:write'],
    })
  })

  it('🔴 늦게 온 옛 목록 응답은 버린다', async () => {
    const fake = createFakeRoleApi()
    let releaseFirst!: (rows: readonly AdminRole[]) => void
    fake.api.list.mockImplementationOnce(
      () => new Promise<readonly AdminRole[]>((resolve) => (releaseFirst = resolve)),
    )
    const { editor } = await mountRoleEditor({ api: fake.api })
    await editor.reload()
    releaseFirst([{ ...ROLES[2]!, roleName: '옛 응답' }])
    await flushPromises()
    expect(editor.roles.value.map((role) => role.roleName)).toEqual([
      '최고관리자',
      '운영자',
      '감사',
    ])
    expect(editor.loading.value).toBe(false)
  })

  it('조회 실패는 loadError 에 — 목록은 그대로 두고, 다음 조회가 비운다', async () => {
    const { editor, fake } = await mountRoleEditor()
    const failure = new Error('network')
    fake.api.list.mockRejectedValueOnce(failure)
    await editor.reload()
    expect(editor.loadError.value).toBe(failure)
    expect(editor.roles.value).toHaveLength(3)
    await editor.reload()
    expect(editor.loadError.value).toBeNull()
  })

  it('첫 조회가 실패했다가 성공하면 그때 첫 행을 연다', async () => {
    const fake = createFakeRoleApi()
    fake.api.list.mockRejectedValueOnce(new Error('network'))
    const { editor } = await mountRoleEditor({ api: fake.api })
    expect(editor.selected.value).toBeNull()
    await editor.reload()
    expect(editor.selected.value?.roleNo).toBe(1n)
  })

  it('startCreate 는 선택과 폼을 비운다 — 쓰기 권한이 없으면 무시한다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    canWrite.value = false
    editor.startCreate()
    expect(editor.selected.value?.roleNo).toBe(1n)
    canWrite.value = true
    editor.startCreate()
    expect(editor.selected.value).toBeNull()
    expect(editor.form.value).toEqual({
      roleName: '',
      isDefault: false,
      isAll: false,
      permissions: [],
    })
    expect(editor.matrix.value.modelValue).toEqual([])
  })

  it('쓰기 권한이 없어도 select 는 된다 — 읽기 동작이다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    canWrite.value = false
    editor.select(editor.roles.value[2]!)
    expect(editor.selected.value?.roleNo).toBe(3n)
  })
})

describe('useRoleEditor — 전체 권한 · 매트릭스', () => {
  it('🔴 전체 권한이면 매트릭스에 카탈로그 전체가 체크된 채 잠기고, 끄면 이전 권한이 돌아온다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.isAll = true
    await flushPromises()
    expect(editor.matrix.value.modelValue).toEqual(MATRIX_KEYS)
    expect(editor.matrix.value.disabled).toBe(true)
    expect(cell('log:read')?.checked).toBe(true)
    expect(cell('log:read')?.disabled).toBe(true)
    expect(editor.form.value.permissions).toEqual(['org.users:read', 'org.users:write'])
    editor.form.value.isAll = false
    await flushPromises()
    expect(editor.matrix.value.modelValue).toEqual(['org.users:read', 'org.users:write'])
    expect(cell('log:read')?.checked).toBe(false)
  })

  it("🔴 매트릭스에 '*' 칸은 없다 — matrix.permissions 에서 '*' 를 뺀다", async () => {
    const { editor } = await mountRoleEditor()
    expect(editor.matrix.value.permissions).toEqual(MATRIX_KEYS)
    expect(cell('*')).toBeNull()
  })

  it('🔴 칸을 켜면 함의가 값에 써 넣어진다 — 끄면 그것을 함의하는 키도 꺼진다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    await flushPromises()
    await clickCell('org.users:delete')
    expect(editor.form.value.permissions).toEqual([
      'org.users:read',
      'org.users:write',
      'org.users:delete',
      'log:read',
    ])
    expect(cell('org.users:read')?.checked).toBe(true)
    await clickCell('org.users:read')
    expect(editor.form.value.permissions).toEqual(['log:read'])
  })

  it('🔴 행위자가 못 가진 권한(함께 켜질 키 포함)은 고를 수 없다', async () => {
    const { editor, actor } = await mountRoleEditor()
    actor.value = ['org.users:read', 'org.users:write', 'org.roles:read', 'log:read']
    editor.select(editor.roles.value[2]!)
    await flushPromises()
    expect(editor.permissionsLocked.value).toBe(false)
    expect(cell('org.users:write')?.disabled).toBe(false)
    expect(cell('org.users:delete')?.disabled).toBe(true)
    expect(cell('org.roles:write')?.disabled).toBe(true)
    // 바인딩을 직접 불러도 무시한다 — :disabled 는 마우스만 막는다.
    editor.matrix.value['onUpdate:modelValue']([
      ...editor.form.value.permissions,
      'org.users:delete',
    ])
    expect(editor.form.value.permissions).toEqual(['log:read'])
  })

  it('🔴 행위자보다 넓은 역할은 매트릭스 전체가 잠긴다 — 이름 · 기본 여부는 고칠 수 있다', async () => {
    const { editor, actor } = await mountRoleEditor()
    actor.value = ['org.users:read', 'org.users:write', 'org.roles:read']
    editor.select(editor.roles.value[2]!)
    expect(editor.permissionsLocked.value).toBe(true)
    expect(editor.matrix.value.disabled).toBe(true)
    editor.form.value.roleName = '감사팀'
    expect(editor.canSave.value).toBe(true)
    editor.select(editor.roles.value[0]!)
    expect(editor.permissionsLocked.value).toBe(true)
    editor.select(editor.roles.value[1]!)
    expect(editor.permissionsLocked.value).toBe(false)
  })

  it("전체 권한 스위치는 행위자가 '*' 이고 쓰기 권한이 있을 때만 켤 수 있다", async () => {
    const { editor, actor, canWrite } = await mountRoleEditor()
    expect(editor.canToggleAll.value).toBe(true)
    actor.value = ['org.users:read']
    expect(editor.canToggleAll.value).toBe(false)
    actor.value = ['*']
    canWrite.value = false
    expect(editor.canToggleAll.value).toBe(false)
  })

  it('쓰기 권한이 없으면 매트릭스가 잠긴다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    canWrite.value = false
    await flushPromises()
    expect(editor.matrix.value.disabled).toBe(true)
    expect(cell('org.users:read')?.disabled).toBe(true)
  })
})

describe('useRoleEditor — 판정', () => {
  it('🔴 자기 직책 판정은 원본 기준 — 폼에서 이름을 고쳐도 남는다', async () => {
    const { editor, me } = await mountRoleEditor()
    me.value = '운영자'
    editor.select(editor.roles.value[1]!)
    expect(editor.isSelfRole.value).toBe(true)
    editor.form.value.roleName = '다른 이름'
    expect(editor.isSelfRole.value).toBe(true)
    editor.select(editor.roles.value[2]!)
    expect(editor.isSelfRole.value).toBe(false)
  })

  it('isDirty · canSave — 바뀐 것이 있어야 저장할 수 있고, 이름 앞뒤 공백은 변경이 아니다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    await flushPromises()
    expect(editor.isDirty.value).toBe(false)
    expect(editor.canSave.value).toBe(false)
    editor.form.value.roleName = ' 운영자 '
    expect(editor.isDirty.value).toBe(false)
    editor.form.value.isDefault = false
    expect(editor.isDirty.value).toBe(true)
    expect(editor.canSave.value).toBe(true)
    editor.form.value.isDefault = true
    expect(editor.isDirty.value).toBe(false)
    await clickCell('log:read')
    expect(editor.isDirty.value).toBe(true)
  })

  it('새 역할은 이름만 있으면 저장할 수 있다 — 빈 이름 · 쓰기 권한 없음은 막는다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    editor.startCreate()
    expect(editor.canSave.value).toBe(false)
    editor.form.value.roleName = '   '
    expect(editor.canSave.value).toBe(false)
    editor.form.value.roleName = '신규'
    expect(editor.canSave.value).toBe(true)
    canWrite.value = false
    expect(editor.canSave.value).toBe(false)
  })

  it('canMove — 이웃이 있는 방향만, 행은 roleNo 로 찾는다', async () => {
    const { editor, canWrite } = await mountRoleEditor()
    const [first, middle, last] = editor.roles.value
    expect(editor.canMove(first!, 'up')).toBe(false)
    expect(editor.canMove(first!, 'down')).toBe(true)
    expect(editor.canMove({ ...middle! }, 'up')).toBe(true)
    expect(editor.canMove(last!, 'down')).toBe(false)
    canWrite.value = false
    expect(editor.canMove(middle!, 'up')).toBe(false)
  })

  it('canRemove — 선택이 있고 쓰기 권한이 있을 때', async () => {
    const { editor } = await mountRoleEditor()
    expect(editor.canRemove.value).toBe(true)
    editor.startCreate()
    expect(editor.canRemove.value).toBe(false)
  })
})

describe('useRoleEditor — 기본값', () => {
  let wrapper: VueWrapper | null = null
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('actorPermissions · isSelf 를 안 주면 useAdminUi 사용자의 권한 · 역할 이름으로 판정한다', async () => {
    const fake = createFakeRoleApi()
    const user = ref<AdminUserInfo>({
      userId: 'u',
      userName: '김',
      permissions: ['org.users:read'],
      roleName: '운영자',
    })
    let editor!: RoleEditor
    wrapper = mount(
      defineComponent({
        setup() {
          editor = useRoleEditor({ api: fake.api, permissions: CATALOG, canWrite: () => true })
          return () => h('div')
        },
      }),
      {
        global: {
          plugins: [vuetify, createAdminUi({ user: () => user.value, logout: async () => {} })],
        },
      },
    )
    await flushPromises()
    editor.select(editor.roles.value[1]!)
    expect(editor.isSelfRole.value).toBe(true)
    expect(editor.permissionsLocked.value).toBe(true)
    expect(editor.canToggleAll.value).toBe(false)
    user.value = { ...user.value, permissions: ['*'] }
    expect(editor.permissionsLocked.value).toBe(false)
  })
})
