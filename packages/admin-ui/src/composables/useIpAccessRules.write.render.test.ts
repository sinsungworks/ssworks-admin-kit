// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { AdminIpPreview, AdminIpPreviewQuery, AdminIpRule } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { DEFAULT_IP_ACCESS_MESSAGES as M } from '../components/ip-access/ip-access.js'
import {
  useIpAccessRules,
  type IpAccessRules,
  type UseIpAccessRulesOptions,
} from './useIpAccessRules.js'

// 정본: hangang-home ip-access.render.test.ts 의 저장 · 삭제 흐름(검증이 비밀번호보다 먼저 · 실패해도 재조회 · 저장 전
//       스냅숏)에 킷의 새 갈래(flush 뒤 관문 · revision 충돌 · 409 자기 잠금 · 관문 하나)를 더해 잰다.

const rule = (over: Partial<AdminIpRule> = {}): AdminIpRule => ({
  ruleNo: 12n,
  scopeType: 'team',
  scopeRefNo: 4n,
  scopeName: '상담센터',
  scopeUserId: null,
  cidr: '203.0.113.0/24',
  description: '상담센터 사무실',
  revision: 3,
  createAt: '2026-10-01T00:00:00.000Z',
  updateAt: '2026-10-02T00:00:00.000Z',
  ...over,
})

const GLOBAL_V6 = rule({
  ruleNo: 2n,
  scopeType: 'global',
  scopeRefNo: null,
  scopeName: null,
  cidr: '::/0',
  description: '기본 허용(IPv6)',
  revision: 0,
})
const TEAM = rule()
const RULES = [GLOBAL_V6, TEAM]

const previewResult = (newlyLocked = 0): AdminIpPreview => ({
  clientIp: '203.0.113.7',
  clientPasses: true,
  summary: {
    total: 14,
    newlyLocked,
    alreadyLocked: 0,
    unknown: 0,
    blockedSessions: 0,
    ruleSetChangedOnly: 0,
  },
  items: [],
})

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

async function setup(over: Partial<UseIpAccessRulesOptions> = {}) {
  const adapters = {
    list: vi.fn(async (): Promise<readonly AdminIpRule[]> => RULES),
    preview: vi.fn(async (_query: AdminIpPreviewQuery) => previewResult()),
    create: vi.fn(async (): Promise<unknown> => ({})),
    update: vi.fn(async (): Promise<unknown> => ({})),
    remove: vi.fn(async (): Promise<unknown> => ({})),
  }
  const onDone = vi.fn()
  let ip!: IpAccessRules<AdminIpRule>
  wrapper = mount(
    defineComponent({
      setup() {
        ip = useIpAccessRules({ ...adapters, canManage: () => true, onDone, ...over })
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { ...adapters, onDone, ip }
}

async function typeCidr(ip: IpAccessRules<AdminIpRule>, cidr: string): Promise<void> {
  ip.manager.value['onUpdate:form']({ ...ip.form.value, cidr })
}

describe('useIpAccessRules — 저장', () => {
  it('🔴 칸 검증이 실패하면 관문을 열지 않는다 — 칸 오류 · 요청 없음', async () => {
    const { create, ip } = await setup()
    await ip.openCreate()
    expect(await ip.save()).toBe(false)
    expect(ip.manager.value.fieldErrors.cidr).toEqual([M.cidrRequired])
    expect(ip.manager.value.confirmDialog.modelValue).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('🔴 디바운스 중에 눌러도 미리보기를 마친 뒤 관문 — 창 문구가 최종 영향이다', async () => {
    const preview = vi.fn(async (query: AdminIpPreviewQuery) =>
      previewResult(query.op === 'create' ? 2 : 0),
    )
    const { ip } = await setup({ preview })
    await ip.openCreate()
    await typeCidr(ip, '203.0.113.0/24')
    const saving = ip.save()
    await flushPromises()
    expect(preview).toHaveBeenLastCalledWith({
      op: 'create',
      scopeType: 'global',
      cidr: '203.0.113.0/24',
    })
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.message).toBe(
      `전체 범위의 「203.0.113.0/24」 규칙을 만듭니다. ${M.gateImpactLocked(2)}`,
    )
    expect(dialog.reversible).toBe(true)
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    expect(await saving).toBe(false)
  })

  it('확인 창(reauth 끔) → 만들기 · 재조회 · 패널 닫음 · onDone', async () => {
    const { create, list, onDone, ip } = await setup()
    await ip.openCreate()
    await typeCidr(ip, ' 203.0.113.0/24 ')
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(
      { scopeType: 'global', scopeRefNo: null, cidr: '203.0.113.0/24', description: null },
      {},
    )
    expect(list).toHaveBeenCalledTimes(2)
    expect(ip.editing.value).toBeNull()
    expect(onDone).toHaveBeenCalledWith({ action: 'create', rule: null })
  })

  it('재인증 창(reauth 켬) — 비밀번호가 ctx 로 간다', async () => {
    const { create, ip } = await setup({ reauth: true })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.reauthDialog.modelValue).toBe(true)
    expect(ip.manager.value.reauthDialog.title).toBe(M.createTitle)
    ip.manager.value.reauthDialog.onConfirm('pw')
    expect(await saving).toBe(true)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ cidr: '10.0.0.0/8' }), {
      currentPassword: 'pw',
    })
  })

  it('🔴 수정 본문은 네 칸과 revision', async () => {
    const { update, onDone, ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: '새 사무실' })
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(update).toHaveBeenCalledWith(
      TEAM,
      {
        scopeType: 'team',
        scopeRefNo: 4n,
        cidr: '203.0.113.0/24',
        description: '새 사무실',
        revision: 3,
      },
      {},
    )
    expect(onDone).toHaveBeenCalledWith({ action: 'update', rule: TEAM })
  })

  it('🔴 409 ERR_COMMON_CONFLICT — 빨간 알림(서버 문구 + 주소) · 처리됨 · 폼 유지 · 재조회', async () => {
    const error = new ApiError('이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다.', {
      status: 409,
      code: 'ERR_COMMON_CONFLICT',
      details: { clientIp: '203.0.113.7' },
      raw: null,
    })
    const create = vi.fn(async (): Promise<unknown> => {
      throw error
    })
    const { list, ip } = await setup({ create })
    await ip.openCreate()
    await typeCidr(ip, '198.51.100.0/24')
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(false)
    expect(error.handled).toBe(true)
    expect(ip.manager.value.alerts).toEqual([
      {
        kind: 'error',
        text: '이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다. 서버가 본 지금 주소: 203.0.113.7',
      },
    ])
    expect(ip.editing.value).toBe('new')
    expect(ip.form.value.cidr).toBe('198.51.100.0/24')
    expect(list).toHaveBeenCalledTimes(2)
    ip.manager.value.onDismissAlert(0)
    expect(ip.manager.value.alerts).toEqual([])
  })

  it('🔴 revision 충돌 — 폼 유지 · 편집 대상을 새 행으로 · 노란 알림 · 다음 저장은 새 revision', async () => {
    const fresh = rule({ cidr: '203.0.113.0/28', revision: 4 })
    const list = vi
      .fn(async (): Promise<readonly AdminIpRule[]> => RULES)
      .mockResolvedValueOnce(RULES)
      .mockResolvedValue([GLOBAL_V6, fresh])
    const update = vi
      .fn(async (): Promise<unknown> => ({}))
      .mockRejectedValueOnce(
        new ApiError('충돌', { status: 409, code: 'ERR_COMMON_REVISION_CONFLICT', raw: null }),
      )
    const { ip } = await setup({ list, update })
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: '내 값' })
    const first = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await first).toBe(false)
    expect(ip.editing.value).toBe(fresh)
    expect(ip.form.value.description).toBe('내 값')
    expect(ip.manager.value.alerts).toEqual([
      { kind: 'warning', text: M.revisionConflict('팀 · 상담센터', '203.0.113.0/28') },
    ])
    const second = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await second).toBe(true)
    expect(update).toHaveBeenLastCalledWith(
      fresh,
      expect.objectContaining({ revision: 4, description: '내 값' }),
      {},
    )
  })

  it('실패 뒤 새 목록에 그 규칙이 없으면 패널을 닫고 "이미 지워진 규칙"', async () => {
    const list = vi
      .fn(async (): Promise<readonly AdminIpRule[]> => RULES)
      .mockResolvedValueOnce(RULES)
      .mockResolvedValue([GLOBAL_V6])
    const update = vi.fn(async (): Promise<unknown> => {
      throw new ApiError('없음', { status: 404, code: 'ERR_COMMON_NOT_FOUND', raw: null })
    })
    const { ip } = await setup({ list, update })
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: 'x' })
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(false)
    expect(ip.editing.value).toBeNull()
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.ruleGone }])
  })

  it('미리보기를 못 받은 채 저장에 성공하면 노란 알림 — 「아무도 안 잠깁니다」가 아니다', async () => {
    const preview = vi
      .fn(async (_query: AdminIpPreviewQuery) => previewResult())
      .mockResolvedValueOnce(previewResult())
      .mockRejectedValue(new ApiError('x', { status: 500, raw: null }))
    const { ip } = await setup({ preview })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    expect(ip.manager.value.confirmDialog.message).toContain(M.gateImpactUnknown)
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.savedWithoutPreview }])
  })

  it('🔴 만들기에 성공하면 재조회가 실패해도 패널을 닫는다 — 같은 규칙을 또 만들지 않게', async () => {
    const list = vi
      .fn(async (): Promise<readonly AdminIpRule[]> => RULES)
      .mockResolvedValueOnce(RULES)
      .mockRejectedValue(new ApiError('x', { status: 500, raw: null }))
    const { ip } = await setup({ list })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(true)
    expect(ip.editing.value).toBeNull()
  })

  it('🔴 쓰는 동안에는 다른 규칙을 열지 못한다 — 재조회 뒤처리가 엉뚱한 패널을 닫지 않게(I24)', async () => {
    const { ip } = await setup()
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    expect(await ip.openEdit(TEAM)).toBe(false)
    expect(await ip.closeEditor()).toBe(false)
    expect(ip.editing.value).toBe('new')
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    await saving
  })

  it('🔴 두 번 눌러도 한 번만', async () => {
    const { create, ip } = await setup()
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const first = ip.save()
    const second = ip.save()
    expect(await second).toBe(false)
    await flushPromises()
    ip.manager.value.confirmDialog.onConfirm()
    expect(await first).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('🔴 관리 권한이 도중에 회수되면 저장하지 않는다', async () => {
    let can = true
    const { create, ip } = await setup({ canManage: () => can })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    can = false
    expect(await ip.save()).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('🔴 창이 열린 사이 권한이 회수되면 확인해도 보내지 않는다 — 패널은 그대로', async () => {
    let can = true
    const { create, onDone, ip } = await setup({ canManage: () => can })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    can = false
    ip.manager.value.confirmDialog.onConfirm()
    expect(await saving).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(ip.editing.value).toBe('new')
  })

  it('🔴 재인증 실패 뒤 권한이 회수되면 다시 확인해도 성공으로 치지 않는다', async () => {
    let can = true
    const create = vi
      .fn(async (): Promise<unknown> => ({}))
      .mockRejectedValueOnce(
        new ApiError('비밀번호가 맞지 않습니다.', {
          status: 401,
          code: 'ERR_REAUTH_REQUIRED',
          raw: null,
        }),
      )
    const { onDone, ip } = await setup({ reauth: true, canManage: () => can, create })
    await ip.openCreate()
    await typeCidr(ip, '10.0.0.0/8')
    const saving = ip.save()
    await flushPromises()
    ip.manager.value.reauthDialog.onConfirm('wrong')
    await flushPromises()
    expect(ip.manager.value.reauthDialog.modelValue).toBe(true)
    can = false
    ip.manager.value.reauthDialog.onConfirm('pw')
    expect(await saving).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(ip.editing.value).toBe('new')
  })
})

describe('useIpAccessRules — 삭제', () => {
  it('확인 창(reauth 끔) — 되돌릴 수 없음 · 영향 · 본문 { revision } · 재조회 · onDone', async () => {
    const { remove, list, onDone, ip } = await setup()
    const removing = ip.remove(TEAM)
    await flushPromises()
    const dialog = ip.manager.value.confirmDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.reversible).toBe(false)
    expect(dialog.title).toBe(M.removeTitle)
    expect(dialog.message).toBe(
      `팀 · 상담센터 범위의 「203.0.113.0/24」 규칙을 지웁니다. ${M.gateImpactNone}`,
    )
    ip.manager.value.confirmDialog.onConfirm()
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalledWith(TEAM, { revision: 3 }, {})
    expect(list).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith({ action: 'remove', rule: TEAM })
  })

  it('🔴 재인증 창 하나 — 문구가 "되돌릴 수 없습니다"를 겸한다', async () => {
    const { remove, ip } = await setup({ reauth: true })
    const removing = ip.remove(TEAM)
    await flushPromises()
    expect(ip.manager.value.confirmDialog.modelValue).toBe(false)
    expect(ip.manager.value.reauthDialog.modelValue).toBe(true)
    expect(ip.manager.value.reauthDialog.message).toContain(M.irreversible)
    ip.manager.value.reauthDialog.onConfirm('pw')
    expect(await removing).toBe(true)
    expect(remove).toHaveBeenCalledWith(TEAM, { revision: 3 }, { currentPassword: 'pw' })
  })

  it('🔴 전체 허용 행 삭제는 관문 문구에 경고', async () => {
    const { ip } = await setup()
    const removing = ip.remove(GLOBAL_V6)
    await flushPromises()
    expect(ip.manager.value.globalAllowRemoval).toBe(true)
    expect(ip.manager.value.confirmDialog.message).toContain(M.globalAllowRemoval)
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    await removing
  })

  it('취소하면 요청 없음 · 미리보기는 현행으로', async () => {
    const { remove, ip } = await setup()
    const removing = ip.remove(TEAM)
    await flushPromises()
    expect(ip.manager.value.preview.op).toBe('delete')
    ip.manager.value.confirmDialog['onUpdate:modelValue'](false)
    expect(await removing).toBe(false)
    await flushPromises()
    expect(remove).not.toHaveBeenCalled()
    expect(ip.manager.value.preview.op).toBeNull()
  })

  it('🔴 미리보기 404(이미 지워짐)면 관문을 열지 않고 알림 · 재조회', async () => {
    const preview = vi
      .fn(async (_query: AdminIpPreviewQuery) => previewResult())
      .mockResolvedValueOnce(previewResult())
      .mockRejectedValueOnce(new ApiError('없음', { status: 404, raw: null }))
    const { list, ip } = await setup({ preview })
    expect(await ip.remove(TEAM)).toBe(false)
    await flushPromises()
    expect(ip.manager.value.confirmDialog.modelValue).toBe(false)
    expect(ip.manager.value.alerts).toEqual([{ kind: 'warning', text: M.ruleGone }])
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('편집 중 고친 값이 있으면 삭제 전에 버릴지 묻는다', async () => {
    const { remove, ip } = await setup()
    await ip.openEdit(TEAM)
    ip.manager.value['onUpdate:form']({ ...ip.form.value, description: 'x' })
    const removing = ip.remove(GLOBAL_V6)
    await flushPromises()
    expect(ip.manager.value.discardDialog.modelValue).toBe(true)
    ip.manager.value.discardDialog['onUpdate:modelValue'](false)
    expect(await removing).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(ip.editing.value).toBe(TEAM)
  })
})
