import { inject, reactive, type App, type InjectionKey } from 'vue'

/**
 * 앱 전체에 하나뿐인 확인 창 — `useDirtyGuard` 의 이탈 확인을 브라우저 기본 `confirm` 대신 킷 `ConfirmDialog` 로 묻는다.
 *
 * 신규(2026-10-08 브라우저 확인에서 요청 — 셸 스펙 §8 R15). `createToast` 와 같은 모양이다 — 플러그인 객체가 곧 API 이고
 * `app.use()` 가 provide 하며, `App.vue` 에 `<AdminConfirm />` 을 한 번 둔다.
 *
 * 🔴 답할 자리(`<AdminConfirm />`)가 화면에 없으면 브라우저 기본 `confirm` 으로 묻는다. 내비게이션 가드는 이 Promise 를
 *    기다리므로, 아무도 그리지 않는 창에 물으면 이동이 영원히 멈춘다 — 그래서 자리 수를 센다(`attach`).
 * 🔴 한 번에 하나다. 열린 채 또 물으면 앞의 물음은 `false`(취소)로 끝낸다 — 기다리던 쪽이 멈추지 않게.
 */

export interface ConfirmRequest {
  title: string
  message: string
  /** 🔴 `ConfirmDialog` 와 같다 — 되돌릴 수 있는지를 부르는 쪽이 밝힌다. */
  reversible: boolean
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: string
}

export interface ConfirmState {
  open: boolean
  /** 마지막 물음. 닫혀도 남겨 두어 닫히는 동안 글자가 비지 않는다. */
  request: ConfirmRequest | null
}

export interface ConfirmApi {
  /** 확정 `true` · 취소 `false`. 답할 자리가 없으면 브라우저 기본 `confirm(message)` 의 답. */
  ask(request: ConfirmRequest): Promise<boolean>
}

export interface ConfirmPlugin extends ConfirmApi {
  /** `AdminConfirm` 이 읽는 반응형 상태. 직접 바꾸지 말고 API 를 쓴다. */
  readonly state: ConfirmState
  /** `AdminConfirm` 이 부른다 — 열린 물음에 답하고 닫는다. 열려 있지 않으면 아무것도 하지 않는다. */
  answer(value: boolean): void
  /** `AdminConfirm` 이 마운트될 때 부르고, 돌려받은 함수를 언마운트 때 부른다. */
  attach(): () => void
  install(app: App): void
}

export const CONFIRM_KEY: InjectionKey<ConfirmPlugin> = Symbol('admin-ui:confirm')

export function createConfirm(): ConfirmPlugin {
  const state = reactive<ConfirmState>({ open: false, request: null })
  let hosts = 0
  let pending: ((value: boolean) => void) | null = null

  function settle(value: boolean): void {
    const resolve = pending
    pending = null
    resolve?.(value)
  }

  function answer(value: boolean): void {
    if (!state.open) return
    state.open = false
    settle(value)
  }

  const plugin: ConfirmPlugin = {
    state,
    ask(request) {
      if (hosts === 0) {
        return Promise.resolve(
          typeof window !== 'undefined' && typeof window.confirm === 'function'
            ? window.confirm(request.message)
            : false,
        )
      }
      settle(false)
      state.request = request
      state.open = true
      return new Promise<boolean>((resolve) => {
        pending = resolve
      })
    },
    answer,
    attach() {
      hosts += 1
      let attached = true
      return () => {
        if (!attached) return
        attached = false
        hosts -= 1
        // 🔴 마지막 자리가 떠나면 열린 물음에 답할 곳이 없다 — 취소로 끝낸다.
        if (hosts === 0) answer(false)
      }
    },
    install(app) {
      app.provide(CONFIRM_KEY, plugin)
    },
  }
  return plugin
}

/**
 * 컴포넌트에서 확인 창 API 를 얻는다.
 * 🔴 `app.use(createConfirm())` 가 먼저 돼 있어야 한다. 아니면 던진다 — 조용히 아무것도 안 묻는 상태를 막는다.
 */
export function useConfirm(): ConfirmApi {
  const confirm = inject(CONFIRM_KEY, null)
  if (confirm == null) {
    throw new Error(
      'useConfirm(): createConfirm() 플러그인이 설치되지 않았다 — app.use(createConfirm())',
    )
  }
  return confirm
}
