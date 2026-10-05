// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/error.js'
import { clickCell, mountRoleEditor, unmountRoleEditor } from '../test/role-editor-harness.js'
import { buttonByText, installVisualViewport } from '../test/setup.js'

// 정본: hangang-home apps/admin/src/pages/settings/roles.render.test.ts 의 쓰기 규칙(바뀐 것만 전송 · 실패해도
//       재조회 · 성공할 때만 선택 이동 · 이웃 displayOrder · 이동에는 재인증 없음)과 gise revision 충돌.

installVisualViewport()

afterEach(() => {
  unmountRoleEditor()
  vi.restoreAllMocks()
})

const apiError = (code: string, status = 400, details?: unknown) =>
  new ApiError(code, { status, code, details, raw: null })

async function click(text: string) {
  const button = buttonByText(text)
  expect(button, `가드 — "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

async function typePassword(value: string) {
  const input = document.body.querySelector<HTMLInputElement>('input[name="currentPassword"]')
  expect(input, '가드 — 재인증 다이얼로그가 열려 있다').not.toBeNull()
  input!.value = value
  input!.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('save — 만들기', () => {
  it('이름(trim) · 기본 여부 · 카탈로그 순서 권한으로 만들고, 만든 행을 연다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.startCreate()
    editor.form.value.roleName = '  신규  '
    await flushPromises()
    await clickCell('log:read')
    await clickCell('org.users:write')
    expect(await editor.save()).toBe(true)
    expect(fake.api.create).toHaveBeenCalledWith(
      {
        roleName: '신규',
        isDefault: false,
        permissions: ['org.users:read', 'org.users:write', 'log:read'],
      },
      {},
    )
    expect(fake.api.list).toHaveBeenCalledTimes(2)
    expect(editor.selected.value?.roleNo).toBe(100n)
    expect(editor.form.value.roleName).toBe('신규')
  })

  it("🔴 전체 권한을 켜고 저장하면 정확히 ['*'] 만 보낸다", async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.startCreate()
    editor.form.value.roleName = '전권'
    editor.form.value.permissions = ['log:read']
    editor.form.value.isAll = true
    await editor.save()
    expect(fake.api.create.mock.calls[0]![0].permissions).toEqual(['*'])
  })

  it('🔴 만든 뒤 재조회가 실패하면 선택 · 폼을 비운다 — 채운 "새 역할" 폼이 남으면 중복을 만든다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.startCreate()
    editor.form.value.roleName = '신규'
    fake.api.list.mockRejectedValueOnce(new Error('network'))
    expect(await editor.save()).toBe(true)
    expect(editor.selected.value).toBeNull()
    expect(editor.form.value.roleName).toBe('')
    expect(editor.loadError.value).toBeInstanceOf(Error)
  })

  it('🔴 만든 뒤 재조회가 실패해도, 그동안 고른 행은 비우지 않는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.startCreate()
    editor.form.value.roleName = '신규'
    let failList!: () => void
    fake.api.list.mockImplementationOnce(
      () => new Promise((_, reject) => (failList = () => reject(new Error('network')))),
    )
    const pending = editor.save()
    await flushPromises()
    expect(editor.loading.value).toBe(true)
    editor.select(editor.roles.value[1]!)
    failList()
    expect(await pending).toBe(true)
    expect(editor.selected.value?.roleNo).toBe(2n)
    expect(editor.form.value.roleName).toBe('운영자')
  })
})

describe('save — 수정', () => {
  it('🔴 이름만 고치면 permissions 를 싣지 않는다 — revision 은 늘 싣는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    expect(await editor.save()).toBe(true)
    expect(fake.api.update).toHaveBeenCalledWith(
      2n,
      { roleName: '운영팀', isDefault: true, revision: 4 },
      {},
    )
  })

  it('🔴 행위자보다 넓은 역할도 이름은 고칠 수 있다 — permissions 가 실리지 않는다', async () => {
    const { editor, fake, actor } = await mountRoleEditor()
    actor.value = ['org.users:read']
    editor.select(editor.roles.value[0]!)
    editor.form.value.roleName = '전권 관리자'
    expect(await editor.save()).toBe(true)
    expect(fake.api.update.mock.calls[0]![1]).toEqual({
      roleName: '전권 관리자',
      isDefault: false,
      revision: 1,
    })
  })

  it('권한을 바꾸면 permissions 를 싣는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    await flushPromises()
    await clickCell('log:read')
    await editor.save()
    expect(fake.api.update.mock.calls[0]![1]).toEqual({
      roleName: '운영자',
      isDefault: true,
      revision: 4,
      permissions: ['org.users:read', 'org.users:write', 'log:read'],
    })
  })

  it('🔴 저장에 성공하면 같은 행을 새 revision 으로 다시 연다 — 이어서 저장해도 거짓 충돌이 없다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    await editor.save()
    expect(editor.selected.value?.revision).toBe(5)
    editor.form.value.roleName = '운영본부'
    expect(await editor.save()).toBe(true)
    expect(fake.api.update.mock.calls[1]![1]).toMatchObject({ revision: 5 })
    expect(editor.conflicted.value).toBe(false)
  })

  it('🔴 실패하면 폼을 그대로 두고 목록만 다시 받는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    fake.api.update.mockRejectedValueOnce(apiError('ERR_COMMON_INTERNAL', 500))
    expect(await editor.save()).toBe(false)
    expect(fake.api.list).toHaveBeenCalledTimes(2)
    expect(editor.form.value.roleName).toBe('운영팀')
    expect(editor.selected.value?.revision).toBe(4)
  })

  it('🔴 저장 뒤 재조회가 실패하면 옛 목록으로 재선택하지 않는다 — 방금 저장한 값으로 폼이 남는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    fake.api.list.mockRejectedValueOnce(new Error('network'))
    expect(await editor.save()).toBe(true)
    expect(editor.form.value.roleName).toBe('운영팀')
    expect(editor.selected.value?.roleNo).toBe(2n)
    expect(editor.loadError.value).toBeInstanceOf(Error)
  })

  it('서버 검증 오류는 fieldErrors.roleName 에 — 폼이 그리는 키라 처리됨이다', async () => {
    const { editor, fake } = await mountRoleEditor()
    const failure = apiError('ERR_COMMON_VALIDATION', 400, {
      issues: [{ path: ['roleName'], message: '이미 있는 이름입니다' }],
    })
    fake.api.update.mockRejectedValueOnce(failure)
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '감사'
    expect(await editor.save()).toBe(false)
    expect(editor.fieldErrors.value).toEqual({ roleName: ['이미 있는 이름입니다'] })
    expect(failure.handled).toBe(true)
  })

  it("🔴 fields 기본값은 ['roleName'] — isDefault 오류는 fieldErrors 에 채우되 처리됨이 아니다(전역 토스트가 알린다)", async () => {
    const { editor, fake } = await mountRoleEditor()
    const failure = apiError('ERR_COMMON_VALIDATION', 400, {
      issues: [{ path: ['isDefault'], message: '기본 역할은 하나여야 합니다' }],
    })
    fake.api.update.mockRejectedValueOnce(failure)
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    expect(await editor.save()).toBe(false)
    expect(editor.fieldErrors.value).toEqual({ isDefault: ['기본 역할은 하나여야 합니다'] })
    expect(failure.handled).toBe(false)
  })

  it('fields 옵션에 든 키의 오류만 처리됨이다 — 폼이 그리는 키를 더한다', async () => {
    const { editor, fake } = await mountRoleEditor({ fields: ['roleName', 'isDefault'] })
    const isDefaultFailure = apiError('ERR_COMMON_VALIDATION', 400, {
      issues: [{ path: ['isDefault'], message: '기본 역할은 하나여야 합니다' }],
    })
    const permissionsFailure = apiError('ERR_COMMON_VALIDATION', 400, {
      issues: [{ path: ['permissions'], message: '알 수 없는 권한입니다' }],
    })
    fake.api.update
      .mockRejectedValueOnce(isDefaultFailure)
      .mockRejectedValueOnce(permissionsFailure)
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    expect(await editor.save()).toBe(false)
    expect(isDefaultFailure.handled).toBe(true)
    expect(await editor.save()).toBe(false)
    expect(editor.fieldErrors.value).toEqual({ permissions: ['알 수 없는 권한입니다'] })
    expect(permissionsFailure.handled).toBe(false)
  })

  it('🔴 revision 충돌 — 처리됨, 폼 유지, conflicted 동안 저장 불가, 같은 행을 다시 열면 풀린다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    fake.rows().find((row) => row.roleNo === 2n)!.revision = 9 // 남이 먼저 고쳤다
    expect(await editor.save()).toBe(false)
    const settled = fake.api.update.mock.settledResults[0]
    expect(settled?.type).toBe('rejected')
    expect((settled?.value as ApiError).handled).toBe(true)
    expect(editor.conflicted.value).toBe(true)
    expect(editor.form.value.roleName).toBe('운영팀')
    expect(editor.canSave.value).toBe(false)
    editor.select(editor.roles.value[1]!)
    expect(editor.conflicted.value).toBe(false)
    expect(editor.form.value.roleName).toBe('운영자')
    expect(editor.selected.value?.revision).toBe(9)
  })

  it('canSave 가 아니면 요청 없이 false', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    expect(await editor.save()).toBe(false)
    expect(fake.api.update).not.toHaveBeenCalled()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
  })

  it('🔴 저장 뒤 재조회 중에 고른 행은 되돌리지 않는다 — 자기 직책 훅은 그래도 부른다', async () => {
    const onSelfRoleSaved = vi.fn()
    const { editor, fake, me } = await mountRoleEditor({ onSelfRoleSaved })
    me.value = '운영자'
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    const realList = fake.api.list.getMockImplementation()!
    let releaseList!: () => void
    fake.api.list.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (releaseList = resolve))
      return realList()
    })
    const pending = editor.save()
    await flushPromises()
    expect(editor.submitting.value).toBe(false)
    expect(editor.loading.value).toBe(true)
    editor.select(editor.roles.value[2]!)
    editor.form.value.roleName = '감사팀'
    releaseList()
    expect(await pending).toBe(true)
    expect(editor.selected.value?.roleNo).toBe(3n)
    expect(editor.form.value.roleName).toBe('감사팀')
    expect(onSelfRoleSaved).toHaveBeenCalledTimes(1)
  })

  it('🔴 저장 중 select 는 무시한다 — 진행 중이던 저장이 선택을 되돌리지 않게', async () => {
    const { editor, fake } = await mountRoleEditor()
    let release!: () => void
    fake.api.update.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    const pending = editor.save()
    await flushPromises()
    expect(editor.submitting.value).toBe(true)
    editor.select(editor.roles.value[2]!)
    expect(editor.selected.value?.roleNo).toBe(2n)
    release()
    expect(await pending).toBe(true)
  })
})

describe('재인증 · 확인 관문', () => {
  it('reauth: true 면 저장이 재인증을 거쳐 비밀번호를 ctx 로 넘긴다 — 기본 문구는 원본 이름', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    const pending = editor.save()
    await flushPromises()
    expect(document.body.textContent).toContain('「운영자」 역할을 저장합니다.')
    await typePassword('pw')
    await click('확인')
    expect(await pending).toBe(true)
    expect(fake.api.update).toHaveBeenCalledWith(
      2n,
      { roleName: '운영팀', isDefault: true, revision: 4 },
      { currentPassword: 'pw' },
    )
  })

  it('🔴 관문을 취소하면 요청도 재조회도 없고 폼이 남는다', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    const pending = editor.save()
    await flushPromises()
    await click('취소')
    expect(await pending).toBe(false)
    expect(fake.api.update).not.toHaveBeenCalled()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
    expect(editor.form.value.roleName).toBe('운영팀')
  })

  it('remove — 재인증이 아니면 되돌릴 수 없다는 확인을 거쳐 revision 과 함께 지우고 첫 행을 연다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    const pending = editor.remove()
    await flushPromises()
    expect(document.body.textContent).toContain('「감사」 역할을 삭제합니다.')
    expect(editor.confirmDialog.value.reversible).toBe(false)
    await click('확인')
    expect(await pending).toBe(true)
    expect(fake.api.remove).toHaveBeenCalledWith(3n, { revision: 0 }, {})
    expect(editor.roles.value.map((role) => role.roleNo)).toEqual([1n, 2n])
    expect(editor.selected.value?.roleNo).toBe(1n)
  })

  it('remove — reauth: true 면 재인증 다이얼로그 하나로 지운다', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    editor.select(editor.roles.value[2]!)
    const pending = editor.remove()
    await flushPromises()
    expect(editor.confirmDialog.value.modelValue).toBe(false)
    expect(document.body.textContent).toContain('「감사」 역할을 삭제합니다.')
    await typePassword('pw')
    await click('확인')
    expect(await pending).toBe(true)
    expect(fake.api.remove).toHaveBeenCalledWith(3n, { revision: 0 }, { currentPassword: 'pw' })
  })

  it('🔴 삭제 뒤 재조회 중에 고른 행은 되돌리지 않는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    const realList = fake.api.list.getMockImplementation()!
    let releaseList!: () => void
    fake.api.list.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (releaseList = resolve))
      return realList()
    })
    const pending = editor.remove()
    await flushPromises()
    await click('확인')
    expect(editor.loading.value).toBe(true)
    editor.select(editor.roles.value[1]!)
    releaseList()
    expect(await pending).toBe(true)
    expect(editor.selected.value?.roleNo).toBe(2n)
  })

  it('🔴 삭제 뒤 재조회가 실패하면 옛 목록으로 고르지 않고 선택을 비운다', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    fake.api.list.mockRejectedValueOnce(new Error('network'))
    const pending = editor.remove()
    await flushPromises()
    await click('확인')
    expect(await pending).toBe(true)
    expect(editor.selected.value).toBeNull()
    expect(editor.loadError.value).toBeInstanceOf(Error)
  })

  it('remove 가 실패하면 선택이 그대로이고 목록은 다시 받는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    fake.api.remove.mockRejectedValueOnce(apiError('ERR_COMMON_CONFLICT', 409))
    editor.select(editor.roles.value[2]!)
    const pending = editor.remove()
    await flushPromises()
    await click('확인')
    expect(await pending).toBe(false)
    expect(editor.selected.value?.roleNo).toBe(3n)
    expect(fake.api.list).toHaveBeenCalledTimes(2)
  })

  it('🔴 remove 의 revision 충돌 — 처리됨, conflicted, 선택 그대로', async () => {
    const { editor, fake } = await mountRoleEditor()
    editor.select(editor.roles.value[2]!)
    fake.rows().find((row) => row.roleNo === 3n)!.revision = 9 // 남이 먼저 고쳤다
    const pending = editor.remove()
    await flushPromises()
    await click('확인')
    expect(await pending).toBe(false)
    const settled = fake.api.remove.mock.settledResults[0]
    expect(settled?.type).toBe('rejected')
    expect((settled?.value as ApiError).handled).toBe(true)
    expect(editor.conflicted.value).toBe(true)
    expect(editor.selected.value?.roleNo).toBe(3n)
  })

  it('dialogText 로 문구를 바꾼다', async () => {
    const { editor } = await mountRoleEditor({
      reauth: true,
      dialogText: (action, role) => ({
        title: '직책',
        message: `${action}:${role?.roleName ?? '새 직책'}`,
      }),
    })
    editor.startCreate()
    editor.form.value.roleName = '신규'
    const pending = editor.save()
    await flushPromises()
    expect(document.body.textContent).toContain('create:새 직책')
    await click('취소')
    expect(await pending).toBe(false)
  })
})

describe('move', () => {
  it('🔴 목표값은 이웃 행의 displayOrder 다 — 구멍(1 → 3)이 있어도 움직인다', async () => {
    const { editor, fake } = await mountRoleEditor()
    expect(await editor.move(editor.roles.value[1]!, 'down')).toBe(true)
    expect(fake.api.move).toHaveBeenCalledWith(2n, { displayOrder: 3 })
    expect(editor.roles.value.map((role) => role.roleName)).toEqual([
      '최고관리자',
      '감사',
      '운영자',
    ])
  })

  it('경계에서는 요청하지 않는다', async () => {
    const { editor, fake } = await mountRoleEditor()
    expect(await editor.move(editor.roles.value[0]!, 'up')).toBe(false)
    expect(await editor.move(editor.roles.value[2]!, 'down')).toBe(false)
    expect(fake.api.move).not.toHaveBeenCalled()
    expect(fake.api.list).toHaveBeenCalledTimes(1)
  })

  it('🔴 이동에는 재인증이 없다 — reauth: true 여도 다이얼로그 없이 바로 나간다', async () => {
    const { editor, fake } = await mountRoleEditor({ reauth: true })
    expect(await editor.move(editor.roles.value[0]!, 'down')).toBe(true)
    expect(fake.api.move).toHaveBeenCalledWith(1n, { displayOrder: 1 })
    expect(editor.reauthDialog.value.modelValue).toBe(false)
  })

  it('이동은 선택 · 폼을 건드리지 않는다', async () => {
    const { editor } = await mountRoleEditor()
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    await editor.move(editor.roles.value[0]!, 'down')
    expect(editor.selected.value?.roleNo).toBe(2n)
    expect(editor.form.value.roleName).toBe('운영팀')
  })
})

describe('자기 직책', () => {
  it('🔴 자기 직책 수정에 성공하면 재조회 · 재선택 뒤 onSelfRoleSaved 를 부른다', async () => {
    const onSelfRoleSaved = vi.fn()
    const { editor, me } = await mountRoleEditor({ onSelfRoleSaved })
    onSelfRoleSaved.mockImplementation(() => {
      expect(editor.selected.value?.revision).toBe(5)
    })
    me.value = '운영자'
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀' // 🔴 이름을 바꿔도 요청 전에 잡아 둔 판정을 쓴다
    expect(await editor.save()).toBe(true)
    expect(onSelfRoleSaved).toHaveBeenCalledTimes(1)
  })

  it('다른 역할 수정 · 실패 · 만들기에서는 부르지 않는다', async () => {
    const onSelfRoleSaved = vi.fn()
    const { editor, me, fake } = await mountRoleEditor({ onSelfRoleSaved })
    me.value = '운영자'
    editor.select(editor.roles.value[2]!)
    editor.form.value.roleName = '감사팀'
    await editor.save()
    editor.select(editor.roles.value.find((role) => role.roleNo === 2n)!)
    editor.form.value.roleName = '운영팀'
    fake.api.update.mockRejectedValueOnce(apiError('ERR_COMMON_INTERNAL', 500))
    await editor.save()
    editor.startCreate()
    editor.form.value.roleName = '운영자 2'
    await editor.save()
    expect(onSelfRoleSaved).not.toHaveBeenCalled()
  })

  it('onSelfRoleSaved 가 던지면 save() 가 reject 한다', async () => {
    const boom = new Error('boom')
    const { editor, me } = await mountRoleEditor({
      onSelfRoleSaved: () => {
        throw boom
      },
    })
    me.value = '운영자'
    editor.select(editor.roles.value[1]!)
    editor.form.value.roleName = '운영팀'
    await expect(editor.save()).rejects.toBe(boom)
  })
})
