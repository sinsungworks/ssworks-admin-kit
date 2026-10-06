// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import type { AdminSessionListItem } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import SessionTable from '../components/session/SessionTable.vue'
import { createAdminUi } from '../context/admin-ui.js'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import { useSessions, type Sessions, type UseSessionsOptions } from './useSessions.js'

// 정본: ssworks-gise-home apps/admin/test/me-page.test.ts(확인 뒤 요청 · 취소는 요청 0건 · 개수 문구 · 다른 세션이
//       없으면 "모두" 꺼짐) + hangang-home users.render.test.ts(자기 계정 1인칭 경고)를 실제 SessionTable ·
//       ConfirmDialog 에 붙여 잰다.

installVisualViewport()

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

type Row = AdminSessionListItem

const row = (over: Partial<Row>): Row => ({
  sessionNo: 1n,
  userNo: 1n,
  userId: 'kim',
  userName: '김',
  userAgent: CHROME_WIN,
  ipAddress: '10.0.0.1',
  loginAt: '2026-10-05T00:00:00.000Z',
  lastAccessAt: '2026-10-05T01:00:00.000Z',
  expireAt: '2026-10-12T01:00:00.000Z',
  isCurrent: false,
  ...over,
})

const MINE: Row[] = [
  row({ sessionNo: 1n, isCurrent: true }),
  row({ sessionNo: 2n, userAgent: SAFARI_IPHONE, lastAccessAt: '2026-10-05T02:00:00.000Z' }),
]
const OTHERS: Row[] = [row({ sessionNo: 7n, userNo: 2n, userId: 'lee', userName: '이' })]

const utc = (iso: string) => iso.slice(0, 16).replace('T', ' ')
const SECOND_ROW_LABEL = 'Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 02:00)'

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(options: UseSessionsOptions<Row>, tableProps: Record<string, unknown> = {}) {
  let sessions!: Sessions<Row>
  wrapper = mount(
    defineComponent({
      setup() {
        sessions = useSessions<Row>(options)
        return () =>
          h('div', [
            h(SessionTable as Component, {
              ...sessions.table.value,
              formatDate: utc,
              ...tableProps,
            }),
            h(ConfirmDialog as Component, sessions.confirmDialog.value),
          ])
      },
    }),
    {
      attachTo: document.body,
      global: {
        plugins: [
          vuetify,
          createAdminUi({
            user: () => ({ userId: 'kim', userName: '김', permissions: ['*'] }),
            logout: async () => {},
          }),
        ],
      },
    },
  )
  await flushPromises()
  return sessions
}

const activeDialog = () =>
  document.querySelector<HTMLElement>('.v-overlay--active') ?? document.body

async function clickLabel(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button, `가드 — "${label}" 버튼이 있다`).not.toBeNull()
  button!.click()
  await flushPromises()
}

async function clickInDialog(text: string) {
  const button = buttonByText(text, activeDialog())
  expect(button, `가드 — 다이얼로그에 "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

const apiError = (code: string, status = 404) => new ApiError(code, { status, code, raw: null })

describe('useSessions — 전량 모드 · 하나 끝내기', () => {
  it('처음에 목록을 받아 표에 넘긴다', async () => {
    const list = vi.fn(async () => MINE)
    const sessions = await setup({ list, revoke: vi.fn() })
    expect(list).toHaveBeenCalledTimes(1)
    expect(sessions.rows.value).toEqual(MINE)
    expect(sessions.total.value).toBe(2)
    expect(sessions.table.value.sessions).toEqual(MINE)
    expect(sessions.loading.value).toBe(false)
  })

  it('끝내기 → 되돌릴 수 없다는 확인 → 요청 → 재조회 → onRevoked', async () => {
    const list = vi.fn(async () => MINE)
    const revoke = vi.fn(async () => undefined)
    const onRevoked = vi.fn()
    const sessions = await setup({ list, revoke, onRevoked })
    await clickLabel(SECOND_ROW_LABEL)
    expect(document.body.textContent).toContain(
      '그 브라우저는 즉시 로그아웃되고, 다시 쓰려면 다시 로그인해야 합니다.',
    )
    expect(sessions.confirmDialog.value.reversible).toBe(false)
    expect(revoke).not.toHaveBeenCalled()
    await clickInDialog('끝내기')
    expect(revoke).toHaveBeenCalledWith(MINE[1])
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked.mock.calls[0]![0]).toStrictEqual({ action: 'revoke', row: MINE[1] })
  })

  it('🔴 확인을 취소하면 요청도 재조회도 없다', async () => {
    const list = vi.fn(async () => MINE)
    const revoke = vi.fn(async () => undefined)
    await setup({ list, revoke })
    await clickLabel(SECOND_ROW_LABEL)
    await clickInDialog('취소')
    expect(revoke).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('실패해도 재조회한다 — 404 는 이미 끝난 세션이다. onRevoked 는 부르지 않는다', async () => {
    const list = vi.fn(async () => MINE)
    const revoke = vi.fn().mockRejectedValue(apiError('ERR_NO_SESSION'))
    const onRevoked = vi.fn()
    await setup({ list, revoke, onRevoked })
    await clickLabel(SECOND_ROW_LABEL)
    await clickInDialog('끝내기')
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked).not.toHaveBeenCalled()
  })

  it('🔴 현재 세션 행을 바인딩으로 직접 끊으려 해도 요청 없이 무시한다', async () => {
    const revoke = vi.fn(async () => undefined)
    const sessions = await setup({ list: async () => MINE, revoke })
    sessions.table.value.onRevoke(MINE[0]!)
    await flushPromises()
    expect(sessions.confirmDialog.value.modelValue).toBe(false)
    expect(revoke).not.toHaveBeenCalled()
  })

  it('요청 중에는 표가 busy — 동작 버튼이 잠긴다', async () => {
    let release!: () => void
    const revoke = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const sessions = await setup({ list: async () => MINE, revoke })
    await clickLabel(SECOND_ROW_LABEL)
    await clickInDialog('끝내기')
    expect(sessions.table.value.busy).toBe(true)
    expect(
      document.querySelector<HTMLButtonElement>(`button[aria-label="${SECOND_ROW_LABEL}"]`)
        ?.disabled,
    ).toBe(true)
    release()
    await flushPromises()
    expect(sessions.table.value.busy).toBe(false)
  })

  it('canWrite 가 거짓이면 끝내기 버튼이 없다', async () => {
    const sessions = await setup({ list: async () => MINE, revoke: vi.fn(), canWrite: () => false })
    expect(sessions.table.value.canRevoke).toBe(false)
    expect(document.querySelector(`button[aria-label="${SECOND_ROW_LABEL}"]`)).toBeNull()
  })

  it('messages 로 확인 문구를 바꾼다', async () => {
    await setup({
      list: async () => MINE,
      revoke: vi.fn(),
      messages: {
        revoke: {
          title: '로그아웃',
          message: '이 기기를 로그아웃합니다.',
          confirmLabel: '로그아웃',
        },
      },
    })
    await clickLabel(SECOND_ROW_LABEL)
    expect(document.body.textContent).toContain('이 기기를 로그아웃합니다.')
    expect(buttonByText('로그아웃', activeDialog())).toBeTruthy()
  })
})

describe('useSessions — 다른 세션 모두', () => {
  it('다른 세션이 있으면 켜지고, 개수를 주면 onRevoked 에 싣는다', async () => {
    const list = vi.fn(async () => MINE)
    const revokeOthers = vi.fn(async () => ({ revokedCount: 1 }))
    const onRevoked = vi.fn()
    const sessions = await setup({ list, revokeOthers, onRevoked })
    expect(sessions.canRevokeOthers.value).toBe(true)
    const pending = sessions.revokeOthers()
    await flushPromises()
    expect(document.body.textContent).toContain('이 기기를 뺀 모든 세션이 즉시 로그아웃됩니다.')
    await clickInDialog('모두 끝내기')
    expect(await pending).toBe(true)
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked).toHaveBeenCalledWith({ action: 'revokeOthers', revokedCount: 1 })
  })

  it('🔴 개수를 안 주면 지어내지 않는다', async () => {
    const onRevoked = vi.fn()
    const sessions = await setup({
      list: async () => MINE,
      revokeOthers: vi.fn(async () => undefined),
      onRevoked,
    })
    const pending = sessions.revokeOthers()
    await flushPromises()
    await clickInDialog('모두 끝내기')
    await pending
    // toStrictEqual — `revokedCount: undefined` 키가 실려도 실패한다
    expect(onRevoked.mock.calls[0]![0]).toStrictEqual({ action: 'revokeOthers' })
  })

  it('🔴 revokeOthers() 는 canWrite() 를 호출 시점에 다시 읽는다', async () => {
    let allowed = true
    const revokeOthers = vi.fn(async () => undefined)
    const sessions = await setup({
      list: async () => MINE,
      revokeOthers,
      canWrite: () => allowed,
    })
    // 화면이 이미 읽어 computed 가 캐시된 상태 — 비반응 게터가 바뀌어도 캐시는 그대로다
    expect(sessions.canRevokeOthers.value).toBe(true)
    allowed = false
    expect(await sessions.revokeOthers()).toBe(false)
    expect(sessions.confirmDialog.value.modelValue).toBe(false)
    expect(revokeOthers).not.toHaveBeenCalled()
  })

  it('현재 세션뿐이면 꺼지고, 불러도 확인 없이 false', async () => {
    const sessions = await setup({ list: async () => [MINE[0]!], revokeOthers: vi.fn() })
    expect(sessions.canRevokeOthers.value).toBe(false)
    expect(await sessions.revokeOthers()).toBe(false)
    expect(sessions.confirmDialog.value.modelValue).toBe(false)
  })
})

describe('useSessions — 사용자 전체', () => {
  it('다른 사람이면 「이름(아이디)」 문구로 확인받고, 요청 뒤 재조회한다', async () => {
    const list = vi.fn(async () => OTHERS)
    const revokeUser = vi.fn(async () => ({ revokedCount: 3 }))
    const onRevoked = vi.fn()
    await setup({ list, revokeUser, onRevoked }, { showUser: true })
    await clickLabel('이(lee) 사용자 전체 끊기')
    expect(document.body.textContent).toContain('「이(lee)」의 모든 세션이 즉시 로그아웃됩니다.')
    await clickInDialog('모두 끊기')
    expect(revokeUser).toHaveBeenCalledWith(OTHERS[0])
    expect(list).toHaveBeenCalledTimes(2)
    expect(onRevoked).toHaveBeenCalledWith({
      action: 'revokeUser',
      row: OTHERS[0],
      revokedCount: 3,
    })
  })

  it('🔴 내 계정이면 1인칭 경고로 확인받고, 성공하면 재조회 없이 onSelfSignedOut 을 부른다', async () => {
    const list = vi.fn(async () => MINE)
    const revokeUser = vi.fn(async () => undefined)
    const order: string[] = []
    await setup({
      list,
      revokeUser,
      onRevoked: () => {
        order.push('revoked')
      },
      onSelfSignedOut: () => {
        order.push('signedOut')
      },
    })
    await clickLabel('김(kim) 사용자 전체 끊기')
    expect(document.body.textContent).toContain('이 계정은 지금 로그인한 당신 자신입니다.')
    await clickInDialog('모두 끊기')
    expect(revokeUser).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['revoked', 'signedOut'])
  })

  it('🔴 onRevoked 가 던져도 onSelfSignedOut 은 부른다', async () => {
    const onSelfSignedOut = vi.fn()
    await setup({
      list: async () => MINE,
      revokeUser: vi.fn(async () => undefined),
      onRevoked: () => {
        throw new Error('toast failed')
      },
      onSelfSignedOut,
    })
    // 바인딩은 `void` 로 부르므로 던진 거절이 미처리로 새어 나온다 — 이 테스트에서만 받아 둔다.
    const saved = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    const rejections: unknown[] = []
    process.on('unhandledRejection', (reason) => rejections.push(reason))
    try {
      await clickLabel('김(kim) 사용자 전체 끊기')
      await clickInDialog('모두 끊기')
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      process.removeAllListeners('unhandledRejection')
      for (const listener of saved) process.on('unhandledRejection', listener)
    }
    expect(onSelfSignedOut).toHaveBeenCalledTimes(1)
    expect(rejections).toHaveLength(1)
  })

  it('🔴 내 계정을 끊었는데 onSelfSignedOut 이 없으면 재조회한다', async () => {
    const list = vi.fn(async () => MINE)
    await setup({ list, revokeUser: vi.fn(async () => undefined) })
    await clickLabel('김(kim) 사용자 전체 끊기')
    await clickInDialog('모두 끊기')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('isSelf 를 주면 그것으로 판정한다(useAdminUi 를 보지 않는다)', async () => {
    await setup({ list: async () => OTHERS, revokeUser: vi.fn(), isSelf: () => true })
    await clickLabel('이(lee) 사용자 전체 끊기')
    expect(document.body.textContent).toContain('이 계정은 지금 로그인한 당신 자신입니다.')
  })
})

describe('useSessions — 목록', () => {
  it('🔴 늦게 온 옛 목록 응답은 버린다', async () => {
    let releaseFirst!: (rows: Row[]) => void
    const list = vi
      .fn<() => Promise<Row[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValue(MINE)
    const sessions = await setup({ list })
    await sessions.reload()
    releaseFirst(OTHERS)
    await flushPromises()
    expect(sessions.rows.value).toEqual(MINE)
    expect(sessions.loading.value).toBe(false)
  })

  it('조회 실패는 loadError 에 — 목록은 그대로, 다음 조회가 비운다', async () => {
    const failure = new Error('network')
    const list = vi
      .fn<() => Promise<Row[]>>()
      .mockResolvedValueOnce(MINE)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(MINE)
    const sessions = await setup({ list })
    await sessions.reload()
    expect(sessions.loadError.value).toBe(failure)
    expect(sessions.rows.value).toEqual(MINE)
    await sessions.reload()
    expect(sessions.loadError.value).toBeNull()
  })

  it('immediate: false 면 reload() 를 부를 때까지 조회하지 않는다', async () => {
    const list = vi.fn(async () => MINE)
    const sessions = await setup({ list, immediate: false })
    expect(list).not.toHaveBeenCalled()
    await sessions.reload()
    expect(list).toHaveBeenCalledTimes(1)
  })
})

describe('useSessions — 서버 페이징 모드', () => {
  it('fetch 를 useServerTable 로 넘기고 표에 itemsLength · 쪽 모델을 준다', async () => {
    const fetch = vi.fn(async () => ({ items: OTHERS, total: 45n }))
    const sessions = await setup({ fetch, revoke: vi.fn() })
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ page: 1, itemsPerPage: 20 }))
    expect(sessions.table.value.itemsLength).toBe(45)
    expect(sessions.total.value).toBe(45)
    expect(sessions.serverTable).not.toBeNull()
    sessions.table.value['onUpdate:page']!(2)
    await flushPromises()
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('끝내기 뒤 재조회는 fetch 를 다시 부른다', async () => {
    const fetch = vi.fn(async () => ({ items: OTHERS, total: 1 }))
    const revoke = vi.fn(async () => undefined)
    await setup({ fetch, revoke })
    await clickLabel('Chrome · Windows 세션 끝내기 (마지막 활동 2026-10-05 01:00)')
    await clickInDialog('끝내기')
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('서버 페이징 모드에서는 "다른 세션 모두" 를 쓰지 않는다', async () => {
    const sessions = await setup({
      fetch: async () => ({ items: MINE, total: 2 }),
      revokeOthers: vi.fn(),
    })
    expect(sessions.canRevokeOthers.value).toBe(false)
  })
})
