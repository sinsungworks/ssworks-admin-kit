import { defineStore } from 'pinia'
import type { StoreDefinition } from 'pinia'
import { ref } from 'vue'
import type { AdminUserInfo } from '../context/admin-ui.js'

// 정본: hangang-home apps/admin/src/stores/app.ts (+ session-error.ts)
//   gise `permissionDenied`(401/403 구분)·`SessionNotEstablishedError` 메시지·`sanitize`(`toPermissions` 필터)를 합쳤다.
// 바꾼 점:
//  - 🔴 모듈 싱글턴이 아니라 팩토리다. API 모듈(`authApi`)·`@ssworks/admin-shared` 카탈로그를 import 하지 않는다 —
//    `fetchMe`·`login`·`logout`·`isForbidden`·`sanitize` 를 주입받는다. 클라이언트(`ApiError`)도 모른다.
//  - 🔴 스토어가 라우팅하지 않는다. 이 파일에 router import 는 0이다. 이동은 AppBar 와 가드가 한다.
//    (axion 의 `initialize({ redirect: false })` 우회는 스토어가 `useRoute()` 로 읽은 `route.path` 가
//    첫 내비게이션 중에 아직 `START_LOCATION` 이라, 스토어의 자체 리다이렉트가 진행 중인 목적지를 되돌렸기 때문에
//    필요했다. 스토어가 이동하지 않으니 그 우회도 필요 없다 — 이 팩토리에 `redirect` 옵션을 두지 않는다.)
//  - hangang 의 `ipBlocked`·`blockedIp`·`setIpBlocked` 를 뺐다 — `createApiClient({ onError })` 와 `useAdminUi().ipBlocked` 몫.
//  - 로그인 자격증명은 `{ userId, password }` 한 객체로 받고 `login` 의 응답은 돌려주지 않는다(주입한 쪽이 이미 가진다).
//  - `initialize()` 가 진행 중 Promise 를 공유하고, 한 번 끝나면 다시 가져오지 않는다(hangang 은 호출마다 재요청).
//    다시 읽을 곳은 `login()` 뿐이다.
//  - 실패를 로깅하지 않는다(hangang 과 같다). 401 이 정상 경로라 구별 없이 남기면 첫 진입마다 콘솔이 더러워진다.
//    `logout()` 의 API 실패만 `console.warn` 한다(gise).

/**
 * 로그인 API 는 200 이었는데 **그 직후 `/me` 가 세션을 확인하지 못한** 상태.
 *
 * 🔴 **이 오류가 없으면 화면에 문구가 0이다.** `initialize()` 는 모든 실패를 삼키고(미인증 첫 진입이 그 안의
 *    정상 경로다) 로그인 화면의 `catch` 는 **던질 때만** 돈다. "로그인 200 + me 실패" 가 오류 문구 없이 같은
 *    로그인 폼으로 되돌아오면 사용자에게는 비밀번호를 틀린 것처럼 보인다.
 *
 * 🔴 **자격증명 오류와 갈라야 한다.** 아이디·비밀번호는 맞았고 **쿠키가 브라우저에 안 앉은** 것이다. 대표적인
 *    원인이 `Secure` 쿠키를 http 로 받아 브라우저가 버린 경우다(gise 개발 서버).
 */
export class SessionNotEstablishedError extends Error {
  constructor() {
    super('로그인은 성공했으나 세션이 확립되지 않았다')
    this.name = 'SessionNotEstablishedError'
  }
}

export interface AppStoreOptions<TMe extends AdminUserInfo> {
  fetchMe: () => Promise<TMe>
  login: (credentials: { userId: string; password: string }) => Promise<unknown>
  logout: () => Promise<void>
  /** 403 → `permissionDenied`. 생략하면 어떤 실패도 403 이 아니다. */
  isForbidden?: (error: unknown) => boolean
  /** 저장 전에 적용한다(예: `toPermissions` 로 알 수 없는 키를 거른다). */
  sanitize?: (me: TMe) => TMe
}

/** 🔴 반환 타입을 적어 둔다 — 추론에 맡기면 d.ts 가 `@vue/shared` 의 pnpm 경로를 참조해 TS2742 가 난다. */
export interface AppStoreState<TMe extends AdminUserInfo> {
  initialized: boolean
  authorized: boolean
  userInfo: TMe | null
  permissionDenied: boolean
}

export interface AppStoreActions {
  /** 절대 거부하지 않는다. */
  initialize: () => Promise<void>
  login: (credentials: { userId: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  clearSession: () => void
}

export function createAppStore<TMe extends AdminUserInfo>(
  id: string,
  options: AppStoreOptions<TMe>,
): StoreDefinition<string, AppStoreState<TMe>, Record<never, never>, AppStoreActions> {
  const useStore = defineStore(id, () => {
    /** `fetchMe` 를 한 번이라도 시도했는가. 🔴 가드가 이것으로 초기화를 한 번만 돈다. */
    const initialized = ref(false)
    const authorized = ref(false)
    const userInfo = ref<TMe | null>(null)

    /**
     * 🔴 401 과 403 은 다른 상태다. 401 은 "로그인 필요" 라 로그인 화면으로 보내는 것이 맞다. 403 은 "로그인은
     * 됐으나 권한이 없음" 이라 로그인으로 보내면 **조용한 루프**가 된다(자격증명은 이미 맞다). 가드가 이 값을 읽는다.
     */
    const permissionDenied = ref(false)

    let inFlight: Promise<void> | null = null

    /**
     * 🔴 세대 번호. `clearSession()` 이 올린다. 진행 중이던 `load()` 는 시작할 때의 번호를 쥐고 있다가, 끝났을 때
     * 번호가 바뀌었으면 결과를 버린다 — 느린 `fetchMe` 가 로그아웃·토큰 갱신 실패로 비운 세션을 되살리면 안 된다.
     */
    let generation = 0

    function isForbidden(error: unknown): boolean {
      try {
        return options.isForbidden?.(error) ?? false
      } catch {
        // 🔴 소비자의 판정 함수가 던져도 `initialize()` 는 거부하지 않는다 — 거부하면 내비게이션이 중단된다.
        return false
      }
    }

    async function load(): Promise<void> {
      const started = generation
      try {
        const me = await options.fetchMe()
        if (started !== generation) return
        userInfo.value = options.sanitize ? options.sanitize(me) : me
        authorized.value = true
        permissionDenied.value = false
      } catch (error) {
        if (started !== generation) return
        // 미인증이 정상 경로다. 로그인 화면이 이 상태로 뜬다.
        userInfo.value = null
        authorized.value = false
        permissionDenied.value = isForbidden(error)
      } finally {
        initialized.value = true
      }
    }

    function fetchSession(): Promise<void> {
      const run = load().finally(() => {
        if (inFlight === run) inFlight = null
      })
      inFlight = run
      return run
    }

    /**
     * 🔴 **절대 거부하지 않는다.** 가드의 `ensureInitialized` 가 거부하면 내비게이션이 중단된다. 동시 호출은
     * 진행 중인 요청 하나를 공유하고, 이미 끝났으면 다시 가져오지 않는다.
     */
    function initialize(): Promise<void> {
      if (inFlight) return inFlight
      if (initialized.value) return Promise.resolve()
      return fetchSession()
    }

    async function login(credentials: { userId: string; password: string }): Promise<void> {
      await options.login(credentials)

      // 🔴 로그인 직후에는 **새로** 읽는다 — 이전에 미인증으로 초기화됐어도, 진행 중이던 옛 요청의 응답은 믿지 않는다.
      if (inFlight) await inFlight
      await fetchSession()

      // 🔴 **로그인 경로에서만 확인한다.** 가드가 부르는 `initialize()` 는 미인증 첫 진입이 정상이라 던지면 안 된다.
      //    방금 200 을 받았는데 세션이 안 보이면 그것은 반드시 이상하다.
      if (!authorized.value) {
        throw new SessionNotEstablishedError()
      }
    }

    /** 서버를 부르지 않고 세션 상태만 비운다. 🔴 `initialized` 는 그대로 둔다 — 가드가 `/me` 를 또 때리지 않게. */
    function clearSession() {
      generation++
      authorized.value = false
      userInfo.value = null
      permissionDenied.value = false
    }

    /**
     * API 호출 + `clearSession()` 만 한다. 이동은 하지 않는다.
     *
     * 🔴 API 가 실패해도 세션은 비운다(`finally`). 이미 만료된 세션이면 실패가 정상이다. 다시 던지지 않는다 —
     * 던지면 AppBar 의 `afterLogout` 이동이 건너뛰어져 화면이 로그아웃된 채 멈춘다. 대신 `console.warn` 으로 남긴다:
     * 서버 폐기 실패와 정상 로그아웃이 구분되지 않으면 서버에 세션이 살아 있는 줄 아무도 모른다(gise).
     */
    async function logout(): Promise<void> {
      try {
        await options.logout()
      } catch (error) {
        console.warn('[admin-ui] 서버 세션 폐기 호출이 실패했다. 로컬 상태만 비운다.', error)
      } finally {
        clearSession()
      }
    }

    return {
      initialized,
      authorized,
      userInfo,
      permissionDenied,
      initialize,
      login,
      logout,
      clearSession,
    }
  })
  // setup 스토어의 추론 타입(Ref 해제 조건부 타입)은 제네릭 TMe 에서 펼쳐지지 않아 명시 타입으로 단언한다.
  return useStore as unknown as StoreDefinition<
    string,
    AppStoreState<TMe>,
    Record<never, never>,
    AppStoreActions
  >
}
