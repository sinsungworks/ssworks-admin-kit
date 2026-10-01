import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AdminUserInfo } from '../context/admin-ui.js'
import { createAppStore, SessionNotEstablishedError } from './app-store.js'

const ME: AdminUserInfo = {
  userId: 'admin',
  userName: '최초 관리자',
  permissions: ['*'],
  teamName: '운영',
  roleName: '최고관리자',
}

const CREDENTIALS = { userId: 'admin', password: 'pw' }

class FakeForbidden extends Error {}

let seq = 0
function setup(overrides: Partial<Parameters<typeof createAppStore<AdminUserInfo>>[1]> = {}) {
  const fetchMe = vi.fn<() => Promise<AdminUserInfo>>()
  const login = vi.fn<(c: typeof CREDENTIALS) => Promise<unknown>>().mockResolvedValue(undefined)
  const logout = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  // 🔴 스토어 id 를 테스트마다 달리한다 — 같은 id 는 pinia 인스턴스가 달라도 혼동되기 쉽다.
  const useStore = createAppStore<AdminUserInfo>(`app-${seq++}`, {
    fetchMe,
    login,
    logout,
    isForbidden: (e) => e instanceof FakeForbidden,
    ...overrides,
  })
  return { fetchMe, login, logout, store: useStore() }
}

describe('createAppStore 타입', () => {
  it('userInfo 는 TMe | null, initialize 는 () => Promise<void> 다', () => {
    setActivePinia(createPinia())
    interface Me extends AdminUserInfo {
      userNo: bigint
    }
    const useStore = createAppStore<Me>('type-check', {
      fetchMe: async () => ({ ...ME, userNo: 1n }),
      login: async () => undefined,
      logout: async () => undefined,
    })
    const store = useStore()
    expectTypeOf(store.userInfo).toEqualTypeOf<Me | null>()
    expectTypeOf(store.initialize).toEqualTypeOf<() => Promise<void>>()
  })
})

describe('createAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initialize()', () => {
    it('fetchMe 성공이면 authorized 와 userInfo 가 선다', async () => {
      const { fetchMe, store } = setup()
      fetchMe.mockResolvedValue(ME)

      await store.initialize()

      expect(store.initialized).toBe(true)
      expect(store.authorized).toBe(true)
      expect(store.userInfo).toEqual(ME)
      expect(store.permissionDenied).toBe(false)
    })

    it('🔴 401 같은 실패는 던지지 않고 미인증으로 남는다 — 미인증 첫 진입이 정상 경로다', async () => {
      const { fetchMe, store } = setup()
      fetchMe.mockRejectedValue(new Error('401'))

      await expect(store.initialize()).resolves.toBeUndefined()

      expect(store.initialized).toBe(true)
      expect(store.authorized).toBe(false)
      expect(store.userInfo).toBeNull()
      expect(store.permissionDenied).toBe(false)
    })

    it('isForbidden 이 참인 실패는 permissionDenied 를 세운다', async () => {
      const { fetchMe, store } = setup()
      fetchMe.mockRejectedValue(new FakeForbidden('403'))

      await store.initialize()

      expect(store.permissionDenied).toBe(true)
      expect(store.authorized).toBe(false)
      expect(store.userInfo).toBeNull()
    })

    it('isForbidden 을 안 넘기면 어떤 실패도 permissionDenied 가 아니다', async () => {
      const { fetchMe, store } = setup({ isForbidden: undefined })
      fetchMe.mockRejectedValue(new FakeForbidden('403'))

      await store.initialize()

      expect(store.permissionDenied).toBe(false)
    })

    it('두 번 불러도 fetchMe 는 한 번이다', async () => {
      const { fetchMe, store } = setup()
      fetchMe.mockResolvedValue(ME)

      await store.initialize()
      await store.initialize()

      expect(fetchMe).toHaveBeenCalledTimes(1)
    })

    it('동시에 불러도 진행 중인 요청 하나를 공유한다', async () => {
      const { fetchMe, store } = setup()
      fetchMe.mockResolvedValue(ME)

      await Promise.all([store.initialize(), store.initialize()])

      expect(fetchMe).toHaveBeenCalledTimes(1)
    })

    it('실패한 뒤에도 initialized 면 다시 부르지 않는다', async () => {
      const { fetchMe, store } = setup()
      fetchMe.mockRejectedValue(new Error('401'))

      await store.initialize()
      await store.initialize()

      expect(fetchMe).toHaveBeenCalledTimes(1)
    })

    it('🔴 isForbidden 이 던져도 initialize 는 거부하지 않고 permissionDenied 는 거짓이다', async () => {
      const { fetchMe, store } = setup({
        isForbidden: () => {
          throw new Error('predicate bug')
        },
      })
      fetchMe.mockRejectedValue(new Error('403'))

      await expect(store.initialize()).resolves.toBeUndefined()

      expect(store.permissionDenied).toBe(false)
      expect(store.authorized).toBe(false)
      expect(store.initialized).toBe(true)
    })

    it('🔴 진행 중에 clearSession 이 불리면 늦게 온 성공 응답이 세션을 되살리지 못한다', async () => {
      const { fetchMe, store } = setup()
      let resolveMe!: (me: AdminUserInfo) => void
      fetchMe.mockImplementation(
        () =>
          new Promise<AdminUserInfo>((resolve) => {
            resolveMe = resolve
          }),
      )

      const pending = store.initialize()
      store.clearSession()
      resolveMe(ME)
      await pending

      expect(store.authorized).toBe(false)
      expect(store.userInfo).toBeNull()
      expect(store.initialized).toBe(true)
    })

    it('sanitize 를 저장 전에 적용한다', async () => {
      const { fetchMe, store } = setup({
        sanitize: (me) => ({ ...me, permissions: me.permissions.filter((p) => p !== 'bogus') }),
      })
      fetchMe.mockResolvedValue({ ...ME, permissions: ['users.read', 'bogus'] })

      await store.initialize()

      expect(store.userInfo?.permissions).toEqual(['users.read'])
    })
  })

  describe('login()', () => {
    it('login 뒤 initialize 가 이미 한 번 돌았어도 fetchMe 를 다시 부른다', async () => {
      const { fetchMe, login, store } = setup()
      fetchMe.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce(ME)
      await store.initialize()
      expect(store.authorized).toBe(false)

      await store.login(CREDENTIALS)

      expect(login).toHaveBeenCalledWith(CREDENTIALS)
      expect(fetchMe).toHaveBeenCalledTimes(2)
      expect(store.authorized).toBe(true)
      expect(store.userInfo).toEqual(ME)
    })

    it('로그인 200 인데 세션이 안 서면 SessionNotEstablishedError 를 던진다', async () => {
      const { fetchMe, store } = setup()
      fetchMe.mockRejectedValue(new Error('401'))

      const error = await store.login(CREDENTIALS).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(SessionNotEstablishedError)
      expect((error as Error).name).toBe('SessionNotEstablishedError')
      expect(store.authorized).toBe(false)
    })

    it('자격증명 오류는 그대로 올라가고 fetchMe 를 부르지 않는다', async () => {
      const { fetchMe, login, store } = setup()
      const credentialError = new Error('ERR_NO_USER')
      login.mockRejectedValue(credentialError)

      await expect(store.login(CREDENTIALS)).rejects.toBe(credentialError)
      expect(fetchMe).not.toHaveBeenCalled()
    })

    it('진행 중인 initialize 가 있으면 끝난 뒤 새로 부른다(옛 응답을 믿지 않는다)', async () => {
      const { fetchMe, login, store } = setup()
      // 🔴 options.login 을 지연시켜, login() 이 inFlight 분기에 닿는 시점에 첫 load 가 아직 진행 중임을 보장한다.
      let finishLogin!: () => void
      login.mockImplementation(() => new Promise<void>((resolve) => (finishLogin = resolve)))
      let resolveFirst!: (me: AdminUserInfo) => void
      fetchMe.mockImplementationOnce(
        () =>
          new Promise<AdminUserInfo>((resolve) => {
            resolveFirst = resolve
          }),
      )
      fetchMe.mockResolvedValueOnce({ ...ME, userName: '두 번째' })

      const pending = store.initialize()
      const loggingIn = store.login(CREDENTIALS)
      finishLogin()
      // login 이 inFlight 를 기다리는 동안 첫 응답(옛 응답)이 늦게 도착한다.
      await Promise.resolve()
      expect(fetchMe).toHaveBeenCalledTimes(1)
      resolveFirst(ME)
      await pending
      await loggingIn

      expect(fetchMe).toHaveBeenCalledTimes(2)
      expect(store.userInfo?.userName).toBe('두 번째')
    })
  })

  describe('logout() / clearSession()', () => {
    it('API 를 부르고 세션을 비운다', async () => {
      const { fetchMe, logout, store } = setup()
      fetchMe.mockResolvedValue(ME)
      await store.initialize()

      await store.logout()

      expect(logout).toHaveBeenCalledTimes(1)
      expect(store.authorized).toBe(false)
      expect(store.userInfo).toBeNull()
      expect(store.permissionDenied).toBe(false)
    })

    it('🔴 API 가 실패해도 세션은 비운다 — 로컬이 로그아웃 상태여야 한다', async () => {
      const { fetchMe, logout, store } = setup()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      fetchMe.mockResolvedValue(ME)
      await store.initialize()
      logout.mockRejectedValue(new Error('network'))

      await expect(store.logout()).resolves.toBeUndefined()

      expect(store.authorized).toBe(false)
      expect(store.userInfo).toBeNull()
      expect(warn).toHaveBeenCalledTimes(1)
      warn.mockRestore()
    })

    it('clearSession 은 서버를 부르지 않고 initialized 를 그대로 둔다', async () => {
      const { fetchMe, logout, store } = setup()
      fetchMe.mockRejectedValue(new FakeForbidden('403'))
      await store.initialize()
      expect(store.permissionDenied).toBe(true)

      store.clearSession()

      expect(logout).not.toHaveBeenCalled()
      expect(store.permissionDenied).toBe(false)
      expect(store.initialized).toBe(true)
      // 로그아웃 뒤 가드가 /me 를 또 때리지 않는다.
      await store.initialize()
      expect(fetchMe).toHaveBeenCalledTimes(1)
    })
  })
})
