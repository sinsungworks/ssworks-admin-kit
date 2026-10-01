import type { Router } from 'vue-router'

// 정본: hangang-home `apps/admin/src/router/recovery.ts` + `router/index.ts` 의 배선(onError ·
// isReady). 바꾼 점: (1) 표식 저장소를 `localStorage` 고정에서 주입 가능한 `Storage` 로(기본
// `sessionStorage`, 부재하면 표식 없이 동작), (2) `index.ts` 에 있던 배선을 `installChunkRecovery`
// 로 묶었다, (3) 이 설치가 방금 세운 표식은 `isReady` 거부 팔이 지우지 않는다(아래 `armed`).

/** 청크 404 복구가 무한 새로고침이 되지 않게 막는 표식. 저장소 키. */
export const DYNAMIC_RELOAD_FLAG = 'vuetify:dynamic-reload'

/**
 * 지연 청크를 못 받아온 오류인가.
 *
 * 배포로 청크 해시가 바뀐 뒤 **열려 있던 탭**이 이동하면 옛 청크가 404 다
 * (vitejs/vite#11804). 라우트 컴포넌트가 전부 지연 import 라 이 방어가 실질이다.
 */
export function isDynamicImportError(err: unknown): boolean {
  const message = (err as { message?: unknown } | null | undefined)?.message
  return (
    typeof message === 'string' && message.includes('Failed to fetch dynamically imported module')
  )
}

/**
 * 청크 404 복구로 **통째로 다시 열 URL.**
 *
 * 🔴 **`to.fullPath` 가 아니다.** vue-router 의 `fullPath` 에는 history base 가 **없다** — base 를
 *    붙여 주는 것은 `resolve(...).href` 뿐이다. 앱이 `base: '/admin/'` 이면 `fullPath` 를 그대로
 *    `location.assign()` 에 넘길 때 `https://host/org/users` 로 나가 edge 의 캐치올이 받아 공개
 *    앱으로 튕긴다. 증상이 조용하다 — 재배포가 있어야 하고, 열려 있던 탭이어야 하고, 이동해야
 *    나타난다. 예외도 안 난다 — 그냥 다른 앱이 뜬다. `recovery.test.ts` 가 살아 있는 계약이다.
 */
export function reloadTarget(router: Router, fullPath: string): string {
  return router.resolve(fullPath).href
}

/**
 * `ready` 가 **어느 팔로 가라앉든** 표식을 지운다.
 *
 * 🔴 **성공 팔만 달면 안 된다.** `router.isReady()` 는 첫 항해가 취소·실패하면 **거부**한다
 *    (`markAsReady(err)`). 그때 표식이 안 지워지면 ⓐ 처리되지 않은 거부가 남고 ⓑ 다음 청크
 *    404 에서 표식이 여전히 보여 **복구 경로가 1회용으로 죽는다** — 재배포마다 한 번씩 관리자가
 *    못 들어온다. 지표는 "준비를 마쳤다" 이지 "성공했다" 가 아니다.
 */
export function clearFlagWhenSettled(ready: Promise<unknown>, clear: () => void): Promise<void> {
  return ready.then(
    () => {
      clear()
    },
    () => {
      clear()
    },
  )
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined // 저장소 접근이 막힌 환경(프라이빗 모드 등)
  }
}

/**
 * 청크 404 복구를 라우터에 건다: 첫 실패에서 표식을 세우고 base 가 붙은 URL 로 한 번 다시 연다.
 * 표식이 이미 있으면(다시 열어도 안 고쳐졌다) 오류만 남기고 멈춘다. 저장소가 없으면 표식 없이
 * 동작하므로 무한 새로고침을 막는 장치가 빠진다 — 그 경우에는 다시 열지 않고 오류만 남긴다.
 */
export function installChunkRecovery(
  router: Router,
  storage: Storage | undefined = defaultStorage(),
): void {
  // 🔴 이 설치가 방금 표식을 세웠다면 `isReady` 거부 팔이 그것을 지우면 안 된다. 첫 내비게이션이
  //    청크 오류로 실패하면 `isReady()` 가 곧바로 거부되는데, 그때 지우면 다시 열린 페이지가 또
  //    같은 오류를 만나 표식 없이 또 다시 연다 = 무한 새로고침. 표식은 **다시 연 페이지** 의 준비가
  //    끝났을 때 지운다.
  let armed = false

  router.onError((err, to) => {
    if (!isDynamicImportError(err)) {
      console.error(err)
      return
    }
    if (!storage || storage.getItem(DYNAMIC_RELOAD_FLAG)) {
      console.error('Dynamic import error, reloading page did not fix it', err)
      return
    }
    storage.setItem(DYNAMIC_RELOAD_FLAG, 'true')
    armed = true
    // 🔴 `to.fullPath` 를 그대로 넘기지 마라 — base 가 없어 공개 앱으로 튕긴다.
    location.assign(reloadTarget(router, to.fullPath))
  })

  // 🔴 두 팔이다. 거부에서 안 지우면 위 복구가 1회용으로 죽는다.
  void clearFlagWhenSettled(router.isReady(), () => {
    if (!armed) storage?.removeItem(DYNAMIC_RELOAD_FLAG)
  })
}
