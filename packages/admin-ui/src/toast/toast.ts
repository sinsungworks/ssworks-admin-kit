import { inject, nextTick, reactive, type App, type InjectionKey } from 'vue'

/**
 * 앱 전체에 하나뿐인 토스트.
 *
 * 정본: ssworks-gise-home apps/admin/src/composables/useToast.ts. 🔴 페이지마다 `VSnackbar` 를
 * 복제하지 않는다 — 두 참조 프로젝트가 그 방식으로 "실패했는데 아무 표시도 없는" 구멍을 남겼다.
 *
 * 원본은 모듈 스코프 싱글턴이었다. 패키지에서는 `createToast()` 가 상태를 만들고 `app.use()` 로
 * provide 한다 — 테스트 간 상태 누수와 앱 인스턴스 둘 이상이 한 상태를 공유하는 문제를 막는다.
 * 플러그인 객체 자체가 API 를 노출하므로 컴포넌트 밖(API 클라이언트의 onError 등)에서도 쓸 수 있다.
 */

export type ToastColor = 'success' | 'error' | 'warning' | 'info'

/**
 * 색상별 표시 시간(ms). `error` 가 가장 길다 — 사용자가 읽고 조치할 시간이 필요하다.
 * `success` 가 가장 짧다 — 이미 끝난 일이라 읽지 않아도 손해가 없다.
 */
export const DEFAULT_TOAST_TIMEOUT_MS: Readonly<Record<ToastColor, number>> = {
  success: 3000,
  error: 6000,
  warning: 5000,
  info: 4000,
}

export interface ToastState {
  show: boolean
  message: string
  color: ToastColor
  timeout: number
}

export interface ToastApi {
  success(message: string): void
  error(message: string): void
  warning(message: string): void
  info(message: string): void
  show(message: string, color: ToastColor): void
  dismiss(): void
}

export interface ToastPlugin extends ToastApi {
  /** `AdminToast` 가 읽는 반응형 상태. 직접 바꾸지 말고 API 를 쓴다. */
  readonly state: ToastState
  install(app: App): void
}

export interface CreateToastOptions {
  /** 색상별 표시 시간 덮어쓰기. */
  timeouts?: Partial<Record<ToastColor, number>>
}

export const TOAST_KEY: InjectionKey<ToastPlugin> = Symbol('admin-ui:toast')

export function createToast(options: CreateToastOptions = {}): ToastPlugin {
  const timeouts: Record<ToastColor, number> = { ...DEFAULT_TOAST_TIMEOUT_MS, ...options.timeouts }

  const state = reactive<ToastState>({
    show: false,
    message: '',
    color: 'info',
    timeout: timeouts.info,
  })

  /** 다시 열기를 기다리는 표 — 그사이 다른 show · dismiss 가 오면 앞의 다시 열기는 버린다 */
  let reopenSeq = 0
  let reopening = false

  function show(message: string, color: ToastColor) {
    state.message = message
    state.color = color
    state.timeout = timeouts[color]
    if (!state.show && !reopening) {
      state.show = true
      return
    }
    // 🔴 이미 떠 있으면 한 틱 닫았다가 다시 연다. `false → true` 를 같은 틱에 바꾸면 VSnackbar 는 열림이 그대로라
    //    타이머를 다시 걸지 않는다 — 떠 있던 토스트의 남은 시간만큼만 새 문구가 보였다(브라우저 확인 P9: 오류를 띄우고
    //    4초 뒤 다른 오류를 띄우면 2초만 보임). 셸 스펙 §8 R16.
    state.show = false
    const seq = ++reopenSeq
    reopening = true
    void nextTick(() => {
      if (seq !== reopenSeq) return
      reopening = false
      state.show = true
    })
  }

  const plugin: ToastPlugin = {
    state,
    show,
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
    warning: (message) => show(message, 'warning'),
    info: (message) => show(message, 'info'),
    dismiss: () => {
      reopenSeq++
      reopening = false
      state.show = false
    },
    install(app) {
      app.provide(TOAST_KEY, plugin)
    },
  }

  return plugin
}

/**
 * 컴포넌트·pinia setup 스토어 안에서 토스트 API 를 얻는다.
 * 🔴 `app.use(createToast())` 가 먼저 돼 있어야 한다. 아니면 던진다 — 조용히 아무 표시도 안 하는
 *    상태가 되는 것이 이 컴포저블이 막으려는 바로 그 구멍이다.
 */
export function useToast(): ToastApi {
  const toast = inject(TOAST_KEY, null)
  if (toast == null) {
    throw new Error('useToast(): createToast() 플러그인이 설치되지 않았다 — app.use(createToast())')
  }
  return toast
}
