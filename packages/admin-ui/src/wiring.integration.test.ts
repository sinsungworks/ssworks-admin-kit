// @vitest-environment happy-dom
import { AxiosError } from 'axios'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { START_LOCATION, createMemoryHistory, createRouter } from 'vue-router'
import { createApiClient } from './api/client.js'
import { ApiError } from './api/error.js'
import type { AdminUserInfo } from './context/admin-ui.js'
import { createUsePermission } from './permission/createUsePermission.js'
import { createAdminGuard } from './router/guard.js'
import { defineAdminRoute } from './router/route-meta.js'
import { createAppStore } from './store/app-store.js'

// README「최소 배선」을 그대로 옮겨 패키지 실물로 돌린다. 템플릿이 이 배선을 복사하므로 README 를 고치면
// 여기도 같이 고친다. (네트워크는 axios 어댑터 교체 — api/client.test.ts 와 같은 방식)

type Reply = { status?: number; body?: unknown }
type Handler = (config: InternalAxiosRequestConfig) => Reply

const me: AdminUserInfo = { userId: 'kim01', userName: '김관리', permissions: ['org.users:read'] }
const ok = (data: unknown): Reply => ({ body: { success: true, data } })
const unauthorized = (): Reply => ({
  status: 401,
  body: { success: false, code: 'ERR_AUTH_UNAUTHORIZED', message: '로그인이 필요합니다' },
})
const ipBlocked = (): Reply => ({
  status: 403,
  body: {
    success: false,
    code: 'ERR_IP_NOT_ALLOWED',
    message: '허용되지 않은 IP',
    details: { clientIp: '203.0.113.9' },
  },
})

function setup(handler: Handler) {
  // ── plugins/toast.ts ──
  const toast = { error: vi.fn() }

  // ── state/ip-block.ts ──
  const ipBlock = reactive({ blocked: false, ip: '' })
  function resetIpBlock(): void {
    ipBlock.blocked = false
    ipBlock.ip = ''
  }

  // ── api/client.ts ──
  const client = createApiClient({
    baseURL: '/api',
    refreshPath: '/auth/refresh',
    noRetryPaths: ['/auth/login'],
    onError: (error) => {
      if (error.code === 'ERR_IP_NOT_ALLOWED') {
        ipBlock.blocked = true
        ipBlock.ip = (error.details as { clientIp?: string } | undefined)?.clientIp ?? ''
        return
      }
      if (error.status === 401) return
      toast.error(error.message)
    },
  })
  const { api } = client

  // ── stores/app.ts ──
  const useAppStore = createAppStore<AdminUserInfo>('app', {
    fetchMe: () => api.get<AdminUserInfo>('/auth/me'),
    login: async (credentials) => {
      resetIpBlock()
      await api.post('/auth/login', credentials)
    },
    logout: async () => {
      try {
        await api.post('/auth/logout')
      } finally {
        resetIpBlock()
      }
    },
    isForbidden: (error) => error instanceof ApiError && error.status === 403,
  })

  // ── composables/usePermission.ts ──
  const usePermission = createUsePermission(() => useAppStore().userInfo?.permissions ?? [])

  // ── router/index.ts ──
  const page = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      defineAdminRoute({ path: '/', component: page, meta: { selfOnly: true } }),
      defineAdminRoute({
        path: '/users',
        component: page,
        meta: { title: '사용자', permissions: ['org.users:read'] },
      }),
      defineAdminRoute({
        path: '/login',
        component: page,
        meta: { title: '로그인', layout: 'auth', isPublic: true, needNonAuth: true },
      }),
      defineAdminRoute({
        path: '/403',
        component: page,
        meta: { title: '접근 권한 없음', layout: 'auth', selfOnly: true },
      }),
    ],
  })
  /** 시도된 모든 내비게이션 목적지(취소된 것 포함). 가드보다 먼저 등록한다. */
  const attempted: string[] = []
  router.beforeEach((to) => {
    attempted.push(to.fullPath)
  })
  router.beforeEach(
    createAdminGuard({
      ensureInitialized: () => useAppStore().initialize(),
      isAuthorized: () => useAppStore().authorized,
      isPermissionDenied: () => useAppStore().permissionDenied,
      check: usePermission(),
    }),
  )

  // ── main.ts ──
  client.onAuthFailure(() => {
    useAppStore().clearSession()
    const current = router.currentRoute.value
    if (current === START_LOCATION || current.path === '/login') return
    void router.replace({ path: '/login', query: { redirect: current.fullPath } })
  })

  const adapter: AxiosAdapter = async (config) => {
    const reply = handler(config)
    const status = reply.status ?? 200
    const data = reply.body === undefined ? '' : JSON.stringify(reply.body)
    const response = { data, status, statusText: '', headers: {}, config }
    if (status >= 200 && status < 300) return response
    throw new AxiosError(`status ${status}`, 'ERR_BAD_REQUEST', config, null, response)
  }
  client.axios.defaults.adapter = adapter

  return { toast, ipBlock, api, useAppStore, router, attempted }
}

/** 내비게이션이 조용해질 때까지 — 가드 · 갱신 · 재시도 체인이 여러 틱에 걸친다. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('README 최소 배선 — 미인증 첫 진입', () => {
  it('🔴 /users 로 처음 오면 /login?redirect=/users 로 끝나고, 헛 내비게이션(/login?redirect=/)이 없다', async () => {
    const { router, attempted } = setup((config) =>
      config.url === '/auth/me' || config.url === '/auth/refresh' ? unauthorized() : ok(null),
    )
    await router.push('/users')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/users')
    expect(attempted).not.toContain('/login?redirect=/')
  })

  it('🔴 첫 진입의 /auth/me 401 은 오류 토스트를 띄우지 않는다', async () => {
    const { router, toast } = setup((config) =>
      config.url === '/auth/me' || config.url === '/auth/refresh' ? unauthorized() : ok(null),
    )
    await router.push('/users')
    await settle()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('🔴 비밀번호를 틀리면(/auth/login 401) 토스트 없이 거부만 한다 — 로그인 화면이 알린다', async () => {
    const { router, toast, useAppStore } = setup((config) =>
      config.url === '/auth/me' || config.url === '/auth/refresh' || config.url === '/auth/login'
        ? unauthorized()
        : ok(null),
    )
    await router.push('/login')
    await settle()
    await expect(useAppStore().login({ userId: 'kim01', password: 'wrong' })).rejects.toThrow(
      ApiError,
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('401 이 아닌 실패는 토스트한다', async () => {
    const { api, toast } = setup(() => ({
      status: 500,
      body: { success: false, code: 'ERR_INTERNAL', message: '서버 오류' },
    }))
    await expect(api.get('/anything')).rejects.toThrow('서버 오류')
    expect(toast.error).toHaveBeenCalledWith('서버 오류')
  })
})

describe('README 최소 배선 — 세션이 끊긴 화면', () => {
  it('첫 내비게이션 뒤 갱신이 실패하면 세션을 비우고 /login?redirect=<현재> 로 replace 한다', async () => {
    let expired = false
    const { router, api, useAppStore, toast } = setup((config) => {
      if (config.url === '/auth/me') return ok(me)
      if (config.url === '/auth/refresh') return unauthorized()
      return expired ? unauthorized() : ok([])
    })
    await router.push('/users')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/users')
    expired = true
    await expect(api.get('/users')).rejects.toThrow(ApiError)
    await settle()
    expect(useAppStore().authorized).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/users')
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('README 최소 배선 — IP 차단', () => {
  it('🔴 onError 가 IP 차단 코드로 플래그를 세우고(토스트 없음), 로그아웃·로그인이 비운다', async () => {
    let blocked = true
    const { api, ipBlock, toast, useAppStore } = setup((config) => {
      if (config.url === '/auth/me') return ok(me)
      if (config.url === '/auth/login' || config.url === '/auth/logout') return ok(null)
      return blocked ? ipBlocked() : ok([])
    })
    await expect(api.get('/users')).rejects.toThrow(ApiError)
    expect(ipBlock).toEqual({ blocked: true, ip: '203.0.113.9' })
    expect(toast.error).not.toHaveBeenCalled()

    await useAppStore().logout()
    expect(ipBlock).toEqual({ blocked: false, ip: '' })

    await expect(api.get('/users')).rejects.toThrow(ApiError)
    expect(ipBlock.blocked).toBe(true)
    blocked = false
    await useAppStore().login({ userId: 'kim01', password: 'pw' })
    expect(ipBlock).toEqual({ blocked: false, ip: '' })
  })
})
