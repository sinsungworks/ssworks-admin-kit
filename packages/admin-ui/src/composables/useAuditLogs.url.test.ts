// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { AdminAuditLog } from '@ssworks/admin-shared'
import { emptyAuditLogDraft, type AuditLogFilter } from '../components/audit/audit-log.js'
import { useAuditLogs, type AuditLogs } from './useAuditLogs.js'
import type { ServerTableParams } from './useServerTable.js'

// 정본: 킷 useServerTable.url.test.ts 의 라우터 하네스. 감사 화면의 URL 키(A6)를 잰다.

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

async function setup(initial: string) {
  const fetch = vi.fn(async (_params: ServerTableParams<AuditLogFilter>) => ({
    items: [] as AdminAuditLog[],
    total: 0,
  }))
  let audit!: AuditLogs<AdminAuditLog>
  const Page = defineComponent({
    setup() {
      audit = useAuditLogs({ fetch, urlSync: true })
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/audit', component: Page },
      { path: '/other', component: { render: () => h('div') } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  await flushPromises()
  return { fetch, router, audit: () => audit }
}

describe('useAuditLogs — urlSync', () => {
  it('🔴 URL 에서 복원하고 조회는 1번 — 입력값 · 적용값 둘 다', async () => {
    const { fetch, audit } = await setup(
      '/audit?actor=12&action=org.role.&targetType=role&targetRefNo=3&from=2026-10-01&to=2026-10-18',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.lastCall?.[0].filter).toEqual({
      actorUserNo: 12n,
      action: 'org.role.',
      actionMatch: 'prefix',
      targetType: 'role',
      targetRefNo: 3n,
      from: localMidnight(2026, 10, 1),
      to: localMidnight(2026, 10, 19),
    })
    expect(audit().draft.value).toEqual(audit().applied.value)
    expect(audit().applied.value.actorUserNo).toBe('12')
  })

  it('틀린 값은 버린다 — 화면이 뜨고 필터 없이 부른다', async () => {
    const { fetch } = await setup('/audit?actor=abc&targetRefNo=007&from=2026-02-30&to=x')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.lastCall?.[0].filter).toEqual({})
  })

  it('🔴 거꾸로 된 기간은 둘 다 버린다', async () => {
    const { fetch } = await setup('/audit?from=2026-10-18&to=2026-10-01')
    expect(fetch.mock.lastCall?.[0].filter).toEqual({})
  })

  it('적용하면 URL 에 싣고 빈 칸은 뺀다 · 초기화하면 비운다', async () => {
    const { router, audit } = await setup('/audit')
    audit().viewer.value['onUpdate:draft']({ ...emptyAuditLogDraft(), action: 'org.role.update' })
    audit().apply()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ action: 'org.role.update' })
    audit().reset()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('이 사람 기록만은 actor 를 싣는다', async () => {
    const { router, audit } = await setup('/audit')
    audit().filterByActor({
      logNo: 1n,
      actorUserNo: 7n,
      actorUserId: 'park',
      actorUserName: '박보안',
      sessionNo: null,
      action: 'auth.logout',
      targetType: null,
      targetRefNo: null,
      method: 'POST',
      path: '/admin/auth/logout',
      statusCode: 200,
      errorCode: null,
      ip: null,
      userAgent: null,
      meta: null,
      createAt: '2026-10-18T05:03:21.000Z',
    })
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ actor: '7' })
  })

  it('뒤로 가기 · 같은 화면 링크 — URL 이 바뀌면 다시 채우고 다시 부른다', async () => {
    const { fetch, router, audit } = await setup('/audit')
    fetch.mockClear()
    await router.push('/audit?actor=5&targetType=role&targetRefNo=3')
    await flushPromises()
    expect(audit().applied.value).toEqual({
      ...emptyAuditLogDraft(),
      actorUserNo: '5',
      targetType: 'role',
      targetRefNo: '3',
    })
    expect(audit().draft.value).toEqual(audit().applied.value)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.lastCall?.[0].filter).toEqual({
      actorUserNo: 5n,
      targetType: 'role',
      targetRefNo: 3n,
    })
  })
})
