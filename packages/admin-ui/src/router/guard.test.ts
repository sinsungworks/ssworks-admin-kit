import { describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { createPermissionCheck } from '@ssworks/admin-shared'
import { createAdminGuard } from './guard.js'

// 출처 표기 — 이 파일의 블록은 아래에서 왔다.
//  · 「순서·fail-closed·selfOnly·AND/OR」: hangang-home `router/guard.test.ts`(resolveGuard 케이스)
//  · 「403 / password 분기」: gise-home `router/guards.ts` createAuthGuard 동작(테스트는 신규)
//  · 「axion 이식」: ssworks-axion-admin `router/auth-guard.spec.ts` — 라우터·스토어 통합 하니스는
//    쓰지 않고 순수 가드 호출로 옮겼다. `/intro` 는 `onUnauthorizedHome` 으로 대응한다.
//    버린 케이스: `hasPassword:false`·`/reset-password` 예외 3건과 `savePostAuthRedirect` 소비
//    3건(앱 몫이지 가드 몫이 아니다), `ERR_LOGIN_FAILED` 어댑터 목(스토어 몫).
//  · 「R8 루프 방지」「paths 기본값」: 신규

type Meta = Record<string, unknown>
type Perm = 'a:read' | 'b:read' | 'c:read'

function to(path: string, meta: Meta = {}, query = ''): RouteLocationNormalized {
  return { path, fullPath: path + query, meta } as unknown as RouteLocationNormalized
}
const from = {} as RouteLocationNormalized

interface State {
  authorized?: boolean
  denied?: boolean
  pwRequired?: boolean
  granted?: string[]
}

function make(
  state: State = {},
  extra: Partial<Parameters<typeof createAdminGuard<Perm>>[0]> = {},
) {
  const s: State = { authorized: true, granted: [], ...state }
  const ensureInitialized = vi.fn(async () => {})
  const guard = createAdminGuard<Perm>({
    ensureInitialized,
    isAuthorized: () => !!s.authorized,
    isPermissionDenied: () => !!s.denied,
    isPasswordChangeRequired: () => !!s.pwRequired,
    check: createPermissionCheck<Perm>(() => s.granted ?? []),
    ...extra,
  })
  const run = async (t: RouteLocationNormalized): Promise<true | RouteLocationRaw | void> =>
    (await guard.call(undefined, t, from, () => {})) as true | RouteLocationRaw | void
  return { run, ensureInitialized }
}

describe('초기화', () => {
  it('내비게이션마다 ensureInitialized 를 정확히 1회 기다린다', async () => {
    const { run, ensureInitialized } = make()
    await run(to('/x', { isPublic: true }))
    expect(ensureInitialized).toHaveBeenCalledTimes(1)
    await run(to('/y', { selfOnly: true }))
    expect(ensureInitialized).toHaveBeenCalledTimes(2)
  })

  it('🔴 판정은 초기화가 끝난 뒤의 상태로 한다(axion C1 경합 회귀)', async () => {
    const s = { authorized: false }
    const guard = createAdminGuard<Perm>({
      ensureInitialized: async () => {
        await Promise.resolve()
        s.authorized = true // 초기화가 끝나야 인증 상태가 선다
      },
      isAuthorized: () => s.authorized,
      check: createPermissionCheck<Perm>(() => []),
    })
    expect(await guard.call(undefined, to('/x', { selfOnly: true }), from, () => {})).toBe(true)
  })
})

describe('hangang 이식 — 부재를 통과로 해석하지 않는다(fail-closed)', () => {
  it('🔴 meta 에 선언이 전무하면 forbidden — 권한이 있어도 그렇다', async () => {
    const { run } = make({ granted: ['*'] })
    expect(await run(to('/x'))).toEqual({ path: '/403' })
  })

  it('permissions(AND) — 전부 있어야 통과, 하나라도 없으면 forbidden', async () => {
    const meta = { permissions: ['a:read', 'b:read'] }
    expect(await make({ granted: ['a:read', 'b:read'] }).run(to('/x', meta))).toBe(true)
    expect(await make({ granted: ['a:read'] }).run(to('/x', meta))).toEqual({ path: '/403' })
  })

  it('anyPermissions(OR) — 하나면 통과, 전무하면 forbidden', async () => {
    const meta = { anyPermissions: ['a:read', 'b:read'] }
    expect(await make({ granted: ['b:read'] }).run(to('/x', meta))).toBe(true)
    expect(await make({ granted: ['c:read'] }).run(to('/x', meta))).toEqual({ path: '/403' })
  })

  it("'*' 는 전부 통과한다", async () => {
    const { run } = make({ granted: ['*'] })
    expect(await run(to('/x', { permissions: ['a:read', 'b:read'] }))).toBe(true)
    expect(await run(to('/x', { anyPermissions: ['c:read'] }))).toBe(true)
  })

  it('isPublic 은 명시 선언이라 통과한다(미인증 포함)', async () => {
    expect(await make({ authorized: false }).run(to('/x', { isPublic: true }))).toBe(true)
    expect(await make({ authorized: true }).run(to('/x', { isPublic: true }))).toBe(true)
  })

  it('selfOnly 는 명시 선언이라 통과한다 — 권한 카탈로그를 보지 않는다', async () => {
    expect(await make({ granted: [] }).run(to('/x', { selfOnly: true }))).toBe(true)
  })

  it('빈 배열 선언은 선언이 아니다 — forbidden', async () => {
    expect(await make().run(to('/x', { permissions: [], anyPermissions: [] }))).toEqual({
      path: '/403',
    })
  })

  it('failClosed:false 면 선언 전무도 통과한다(과도기)', async () => {
    const { run } = make({}, { failClosed: false })
    expect(await run(to('/x'))).toBe(true)
  })

  it('failClosed:false 여도 선언한 권한은 검사한다', async () => {
    const { run } = make({ granted: [] }, { failClosed: false })
    expect(await run(to('/x', { permissions: ['a:read'] }))).toEqual({ path: '/403' })
  })
})

describe('순서 — 인증 판정이 명시 선언 검사보다 먼저다', () => {
  it('🔴 미인증이고 meta 가 비어도 forbidden 이 아니라 로그인으로 간다', async () => {
    const { run } = make({ authorized: false })
    expect(await run(to('/oops', {}, '?q=1'))).toEqual({
      path: '/login',
      query: { redirect: '/oops?q=1' },
    })
  })

  it('이미 인증된 사용자는 needNonAuth 라우트에 못 들어간다 → home', async () => {
    const { run } = make()
    expect(await run(to('/login', { needNonAuth: true }))).toEqual({ path: '/' })
  })

  it('미인증이면 needNonAuth 는 통과한다', async () => {
    const { run } = make({ authorized: false })
    expect(await run(to('/login', { needNonAuth: true, isPublic: true }))).toBe(true)
  })
})

describe('gise 이식 — permissionDenied · passwordChange', () => {
  it('미인증 + permissionDenied(인증은 됐으나 /auth/me 403) → forbidden, login 루프 아님', async () => {
    const { run } = make({ authorized: false, denied: true })
    expect(await run(to('/x', { permissions: ['a:read'] }))).toEqual({ path: '/403' })
  })

  it('isPasswordChangeRequired → passwordChange(원래 목적지를 redirect 로)', async () => {
    const { run } = make({ pwRequired: true })
    expect(await run(to('/x', { selfOnly: true }, '?a=1'))).toEqual({
      path: '/password',
      query: { redirect: '/x?a=1' },
    })
  })

  it('passwordChange 화면 자신은 통과한다', async () => {
    const { run } = make({ pwRequired: true })
    expect(await run(to('/password'))).toBe(true)
    expect(await run(to('/password', { selfOnly: true }))).toBe(true)
  })

  it('비밀번호 변경이 필요하면 isPublic 이 아닌 화면은 전부 그리로 — 권한보다 앞선다', async () => {
    const { run } = make({ pwRequired: true, granted: ['*'] })
    expect(await run(to('/x', { permissions: ['a:read'] }))).toMatchObject({ path: '/password' })
  })
})

describe('axion 이식 — onUnauthorizedHome(`/intro`)', () => {
  const intro = () => ({ path: '/intro' })

  it('미인증 사용자가 home 에 오면 onUnauthorizedHome 의 위치로 보낸다', async () => {
    const { run } = make({ authorized: false }, { onUnauthorizedHome: intro })
    expect(await run(to('/', { selfOnly: true }))).toEqual({ path: '/intro' })
  })

  it('undefined 를 돌려주면 평소의 로그인 리다이렉트로 떨어진다', async () => {
    const { run } = make({ authorized: false }, { onUnauthorizedHome: () => undefined })
    expect(await run(to('/', { selfOnly: true }))).toEqual({
      path: '/login',
      query: { redirect: '/' },
    })
  })

  it('home 이 아닌 곳에는 적용되지 않는다', async () => {
    const { run } = make({ authorized: false }, { onUnauthorizedHome: intro })
    expect(await run(to('/mypage', { selfOnly: true }))).toEqual({
      path: '/login',
      query: { redirect: '/mypage' },
    })
  })

  it('/intro 는 isPublic 이면 미인증으로 그대로 열린다', async () => {
    const { run } = make({ authorized: false }, { onUnauthorizedHome: intro })
    expect(await run(to('/intro', { isPublic: true }))).toBe(true)
  })

  it('인증된 사용자의 home 에는 적용되지 않는다', async () => {
    const { run } = make({ authorized: true }, { onUnauthorizedHome: intro })
    expect(await run(to('/', { selfOnly: true }))).toBe(true)
  })
})

describe('axion 이식 — 기본 라우팅', () => {
  it('보호 화면은 미인증 시 login?redirect=<fullPath> 로 간다', async () => {
    const { run } = make({ authorized: false })
    expect(await run(to('/mypage', { selfOnly: true }))).toEqual({
      path: '/login',
      query: { redirect: '/mypage' },
    })
  })

  it('공개 화면(/signup)은 미인증으로 그대로 열린다', async () => {
    expect(await make({ authorized: false }).run(to('/signup', { isPublic: true }))).toBe(true)
  })

  it('로그인 사용자가 needNonAuth 화면(/signup)에 오면 home 으로 돌아간다', async () => {
    const { run } = make()
    expect(await run(to('/signup', { needNonAuth: true, isPublic: true }))).toEqual({ path: '/' })
  })
})

describe('R8 — 자기 자신으로는 리다이렉트하지 않는다(루프 방지, 양성 대조)', () => {
  it('/login 에 needNonAuth 만 있고 isPublic 이 없어도 미인증이 통과한다', async () => {
    const { run } = make({ authorized: false })
    expect(await run(to('/login', { needNonAuth: true }))).toBe(true)
  })

  it('/403 에 meta 가 없어도 인증된 사용자가 통과한다', async () => {
    const { run } = make()
    expect(await run(to('/403'))).toBe(true)
  })

  it('/403 에 meta 가 없어도 미인증 permissionDenied 가 통과한다', async () => {
    const { run } = make({ authorized: false, denied: true })
    expect(await run(to('/403'))).toBe(true)
  })

  it('/403 에 권한이 선언돼 있고 부족해도 통과한다', async () => {
    const { run } = make({ granted: [] })
    expect(await run(to('/403', { permissions: ['a:read'] }))).toBe(true)
  })

  it('/password 는 isPasswordChangeRequired 중에도 리다이렉트되지 않는다', async () => {
    const { run } = make({ pwRequired: true })
    expect(await run(to('/password'))).toBe(true)
  })

  it('paths 를 바꿔도 같은 보장이다', async () => {
    const paths = { login: '/in', forbidden: '/nope', passwordChange: '/pw', home: '/dash' }
    expect(await make({ authorized: false }, { paths }).run(to('/in'))).toBe(true)
    expect(await make({}, { paths }).run(to('/nope'))).toBe(true)
    expect(await make({ pwRequired: true }, { paths }).run(to('/pw'))).toBe(true)
  })
})

describe('paths', () => {
  it('기본값은 /login · /403 · /password · /', async () => {
    expect(await make({ authorized: false }).run(to('/x', { selfOnly: true }))).toMatchObject({
      path: '/login',
    })
    expect(await make().run(to('/x'))).toEqual({ path: '/403' })
    expect(await make({ pwRequired: true }).run(to('/x', { selfOnly: true }))).toMatchObject({
      path: '/password',
    })
    expect(await make().run(to('/login', { needNonAuth: true }))).toEqual({ path: '/' })
  })

  it('지정한 값이 쓰인다', async () => {
    const paths = { login: '/in', forbidden: '/nope', passwordChange: '/pw', home: '/dash' }
    expect(await make({ authorized: false }, { paths }).run(to('/x', { selfOnly: true }))).toEqual({
      path: '/in',
      query: { redirect: '/x' },
    })
    expect(await make({}, { paths }).run(to('/x'))).toEqual({ path: '/nope' })
    expect(await make({ pwRequired: true }, { paths }).run(to('/x', { selfOnly: true }))).toEqual({
      path: '/pw',
      query: { redirect: '/x' },
    })
    expect(await make({}, { paths }).run(to('/in', { needNonAuth: true }))).toEqual({
      path: '/dash',
    })
  })

  it('onUnauthorizedHome 의 home 은 paths.home 을 따른다', async () => {
    const { run } = make(
      { authorized: false },
      { paths: { home: '/dash' }, onUnauthorizedHome: () => ({ path: '/intro' }) },
    )
    expect(await run(to('/dash', { selfOnly: true }))).toEqual({ path: '/intro' })
  })
})
