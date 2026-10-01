import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  DYNAMIC_RELOAD_FLAG,
  clearFlagWhenSettled,
  installChunkRecovery,
  isDynamicImportError,
  reloadTarget,
} from './recovery.js'

// 정본: hangang-home `router/recovery.test.ts`. 바꾼 점: 앱의 routes.ts 대신 테스트용 라우트,
// `index.ts` 소스 읽기 되돌림 감지 블록은 installChunkRecovery 동작 테스트로 대체.
const ADMIN_BASE = '/admin/'
const Stub = { template: '<div />' }

function memoryRouter() {
  return createRouter({
    history: createMemoryHistory(ADMIN_BASE),
    routes: [
      { path: '/', component: Stub },
      { path: '/login', component: Stub },
      { path: '/org/users', component: Stub },
    ],
  })
}

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  } as unknown as Storage
}

describe('reloadTarget — 청크 404 복구로 다시 열 URL', () => {
  it('🔴 base 를 붙인다 — fullPath 를 그대로 쓰면 공개 앱으로 튕긴다', () => {
    expect(reloadTarget(memoryRouter(), '/org/users')).toBe('/admin/org/users')
  })

  it('🔴 fullPath 에는 base 가 없다 — 이 차이가 결함의 실체다', () => {
    const router = memoryRouter()
    expect(router.resolve('/org/users').fullPath).toBe('/org/users')
    expect(reloadTarget(router, '/org/users')).not.toBe('/org/users')
  })

  it('쿼리스트링을 보존한다 — 로그인 리다이렉트가 여기 탄다', () => {
    const target = reloadTarget(memoryRouter(), '/login?redirect=%2Forg%2Fusers')
    expect(target.startsWith('/admin/login')).toBe(true)
    expect(target).toContain('redirect=')
  })

  it('루트도 base 안에 머문다', () => {
    expect(reloadTarget(memoryRouter(), '/')).toBe('/admin/')
  })
})

describe('isDynamicImportError', () => {
  it('청크 404 메시지를 알아본다', () => {
    const err = new Error('Failed to fetch dynamically imported module: /admin/assets/x-a1b2.js')
    expect(isDynamicImportError(err)).toBe(true)
  })

  it('다른 오류는 아니다', () => {
    expect(isDynamicImportError(new Error('Navigation cancelled'))).toBe(false)
  })

  it('🔴 message 가 없거나 문자열이 아니어도 던지지 않는다', () => {
    expect(isDynamicImportError(null)).toBe(false)
    expect(isDynamicImportError(undefined)).toBe(false)
    expect(isDynamicImportError({})).toBe(false)
    expect(isDynamicImportError({ message: 123 })).toBe(false)
    expect(isDynamicImportError('Failed to fetch dynamically imported module')).toBe(false)
  })
})

describe('clearFlagWhenSettled — 재시도 표식 지우기', () => {
  it('성공 팔에서 지운다', async () => {
    const clear = vi.fn()
    await clearFlagWhenSettled(Promise.resolve(), clear)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('🔴 거부 팔에서도 지운다 — 안 지우면 복구가 1회용으로 죽는다', async () => {
    const clear = vi.fn()
    await expect(
      clearFlagWhenSettled(Promise.reject(new Error('취소')), clear),
    ).resolves.toBeUndefined()
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('거부를 삼켜 처리되지 않은 거부로 새지 않는다', async () => {
    await expect(
      clearFlagWhenSettled(Promise.reject(new Error('취소')), () => {}),
    ).resolves.toBeUndefined()
  })
})

describe('installChunkRecovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function setup(storage: Storage, message: string) {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const router = createRouter({
      history: createMemoryHistory(ADMIN_BASE),
      routes: [
        { path: '/', component: Stub },
        {
          path: '/org/users',
          component: () => {
            throw new Error(message)
          },
        },
      ],
    })
    installChunkRecovery(router, storage)
    return { router, assign }
  }

  const CHUNK = 'Failed to fetch dynamically imported module: /x.js'

  it('청크 오류면 표식을 세우고 base 가 붙은 URL 로 다시 연다', async () => {
    const storage = fakeStorage()
    const { router, assign } = setup(storage, CHUNK)
    await router.push('/org/users').catch(() => {})
    expect(storage.getItem(DYNAMIC_RELOAD_FLAG)).toBe('true')
    expect(assign).toHaveBeenCalledWith('/admin/org/users')
  })

  it('🔴 표식이 이미 있으면 다시 열지 않는다 — 무한 새로고침 방지', async () => {
    const storage = fakeStorage({ [DYNAMIC_RELOAD_FLAG]: 'true' })
    const { router, assign } = setup(storage, CHUNK)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await router.push('/org/users').catch(() => {})
    expect(assign).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it('청크 오류가 아니면 다시 열지 않고 표식도 세우지 않는다', async () => {
    const storage = fakeStorage()
    const { router, assign } = setup(storage, 'other')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await router.push('/org/users').catch(() => {})
    expect(assign).not.toHaveBeenCalled()
    expect(storage.getItem(DYNAMIC_RELOAD_FLAG)).toBeNull()
  })

  it('첫 내비게이션이 준비되면 표식을 지운다', async () => {
    const storage = fakeStorage({ [DYNAMIC_RELOAD_FLAG]: 'true' })
    const router = memoryRouter()
    installChunkRecovery(router, storage)
    await router.push('/')
    await router.isReady()
    await Promise.resolve()
    expect(storage.getItem(DYNAMIC_RELOAD_FLAG)).toBeNull()
  })

  it('storage 가 없는 환경(sessionStorage 부재)에서도 던지지 않는다', () => {
    vi.stubGlobal('sessionStorage', undefined)
    expect(() => installChunkRecovery(memoryRouter())).not.toThrow()
  })
})
