import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { CommonErrorCodes } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { toFieldErrors } from '../api/field-errors.js'

// 정본: hangang-home apps/admin/src/pages/org/users.vue `onReauthConfirm` · users-messages.ts `isReauthFailure`
//       + ssworks-gise-home revision 충돌 처리(components/RoleFormDialog.vue · pages/settings/index.vue)
// 바꾼 점:
//  - 페이지마다 `switch(action)` 으로 갈리던 쓰기를 `run({ gate, action })` 하나로. 확인 · 재인증 관문,
//    busy, 오류 분류를 여기서 한 번만 한다.
//  - 재인증 실패 판정을 AxiosError 직접 읽기에서 `ApiError.code` 로.
//  - 🔴 화면에 직접 보인 오류만 `handled` 로 표시한다 — `createApiClient` 의 지연 `onError` 가 그것을
//    건너뛴다(전역 토스트 이중 알림 방지). 표시는 `catch` 의 동기 구간에서 한다.
//  - 성공 알림은 하지 않는다 — 문구가 페이지마다 달라 `onSuccess` 에서 페이지가 띄운다.

interface WriteCommon<T> {
  onSuccess?: (result: T) => void | Promise<void>
  /** `ERR_COMMON_REVISION_CONFLICT`. 있으면 처리 표시(전역 토스트를 막음), 없으면 전역 토스트에 맡긴다. */
  onConflict?: (error: ApiError) => void | Promise<void>
}

interface DialogText {
  title?: string
  message?: string
  confirmLabel?: string
}

export type WriteRunOptions<T> =
  | ({ gate?: 'none'; action: () => Promise<T> } & WriteCommon<T>)
  | ({
      gate: 'confirm'
      /** 🔴 필수 — `ConfirmDialog` 규약. 되돌릴 수 있는지를 부르는 쪽이 밝힌다. */
      reversible: boolean
      confirmColor?: string
      action: () => Promise<T>
    } & WriteCommon<T> &
      DialogText)
  | ({
      gate: 'reauth'
      action: (ctx: { currentPassword: string }) => Promise<T>
    } & WriteCommon<T> &
      DialogText)

/** `<ConfirmDialog v-bind="confirmDialog" />` — props 와 리스너 이름은 컴포넌트 그대로. */
export interface ConfirmDialogBindings {
  modelValue: boolean
  'onUpdate:modelValue': (value: boolean) => void
  title: string
  message: string
  reversible: boolean
  submitting: boolean
  confirmLabel?: string
  confirmColor?: string
  onConfirm: () => void
}

/** `<ReauthDialog v-bind="reauthDialog" />` — props 와 리스너 이름은 컴포넌트 그대로. */
export interface ReauthDialogBindings {
  modelValue: boolean
  'onUpdate:modelValue': (value: boolean) => void
  title?: string
  message: string
  submitting: boolean
  error: string
  confirmLabel?: string
  onConfirm: (password: string) => void
}

export interface WriteFlow {
  /** 성공 true · 취소 · 실패 false. 진행 중이면 바로 false. ApiError 가 아닌 예외는 reject. */
  run: <T>(options: WriteRunOptions<T>) => Promise<boolean>
  submitting: Readonly<Ref<boolean>>
  fieldErrors: Readonly<Ref<Record<string, string[]>>>
  clearFieldErrors: () => void
  confirmDialog: ComputedRef<ConfirmDialogBindings>
  reauthDialog: ComputedRef<ReauthDialogBindings>
}

interface Pending {
  options: WriteRunOptions<unknown>
  resolve: (ok: boolean) => void
  reject: (error: unknown) => void
}

/** 쓰기 흐름. 페이지당 하나 — 동작마다 `run()` 을 부르고 두 다이얼로그는 페이지에 한 번씩 둔다. */
export function useWriteFlow(): WriteFlow {
  const submitting = ref(false)
  const fieldErrors = shallowRef<Record<string, string[]>>({})
  const pending = shallowRef<Pending | null>(null)
  const confirmOpen = ref(false)
  const reauthOpen = ref(false)
  const reauthError = ref('')

  function closeGates(): void {
    confirmOpen.value = false
    reauthOpen.value = false
    reauthError.value = ''
  }

  function settle(current: Pending, outcome: { ok: boolean } | { error: unknown }): void {
    if (pending.value === current) pending.value = null
    if ('error' in outcome) current.reject(outcome.error)
    else current.resolve(outcome.ok)
  }

  function run<T>(options: WriteRunOptions<T>): Promise<boolean> {
    // 권한 검사는 부르는 쪽이 먼저 한다(hangang: 권한 → 재인증 순).
    if (submitting.value || pending.value) return Promise.resolve(false)
    return new Promise<boolean>((resolve, reject) => {
      pending.value = { options: options as unknown as WriteRunOptions<unknown>, resolve, reject }
      if (options.gate === 'confirm') confirmOpen.value = true
      else if (options.gate === 'reauth') reauthOpen.value = true
      else void execute(undefined)
    })
  }

  async function execute(currentPassword: string | undefined): Promise<void> {
    const current = pending.value
    if (!current || submitting.value) return
    const { options } = current
    submitting.value = true
    fieldErrors.value = {}
    reauthError.value = ''
    let result: unknown
    try {
      // 🔴 비밀번호는 다이얼로그에서 여기로 한 번 오고, 이 함수 밖에 남지 않는다.
      result =
        options.gate === 'reauth'
          ? await options.action({ currentPassword: currentPassword ?? '' })
          : await options.action()
    } catch (caught) {
      submitting.value = false
      onFailure(current, caught)
      return
    }
    closeGates()
    try {
      await options.onSuccess?.(result)
      settle(current, { ok: true })
    } catch (caught) {
      settle(current, { error: caught })
    } finally {
      submitting.value = false
    }
  }

  /** 🔴 `handled` 표시는 이 함수의 동기 구간에서 한다 — 지연 `onError` 보다 먼저여야 한다. */
  function onFailure(current: Pending, caught: unknown): void {
    if (!(caught instanceof ApiError)) {
      closeGates()
      settle(current, { error: caught })
      return
    }
    const { options } = current
    if (caught.code === CommonErrorCodes.ERR_REAUTH_REQUIRED && options.gate === 'reauth') {
      // 🔴 다이얼로그를 닫지 않는다 — 닫으면 사용자가 뒤의 폼을 처음부터 다시 채운다(hangang).
      caught.handled = true
      reauthError.value = caught.message
      return
    }
    if (caught.code === CommonErrorCodes.ERR_COMMON_VALIDATION) {
      const mapped = toFieldErrors(caught)
      if (Object.keys(mapped).length > 0) {
        caught.handled = true
        fieldErrors.value = mapped
      }
    }
    if (caught.code === CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT && options.onConflict) {
      caught.handled = true
      closeGates()
      const onConflict = options.onConflict
      void Promise.resolve()
        .then(() => onConflict(caught))
        .then(
          () => settle(current, { ok: false }),
          (error: unknown) => settle(current, { error }),
        )
      return
    }
    closeGates()
    settle(current, { ok: false })
  }

  function onGateModel(gate: 'confirm' | 'reauth', open: boolean): void {
    if (open) return
    if (gate === 'confirm') confirmOpen.value = false
    else {
      reauthOpen.value = false
      reauthError.value = ''
    }
    // 실행 중에 닫혔으면 결과를 기다린다 — 요청은 이미 나갔다. 끝나면 execute 가 정리한다.
    const current = pending.value
    if (current && !submitting.value) settle(current, { ok: false })
  }

  const confirmDialog = computed<ConfirmDialogBindings>(() => {
    const options = pending.value?.options
    const text = options?.gate === 'confirm' ? options : undefined
    return {
      modelValue: confirmOpen.value,
      'onUpdate:modelValue': (open: boolean) => onGateModel('confirm', open),
      title: text?.title ?? '확인',
      message: text?.message ?? '',
      reversible: text?.reversible ?? true,
      submitting: submitting.value,
      confirmLabel: text?.confirmLabel,
      confirmColor: text?.confirmColor,
      onConfirm: () => {
        void execute(undefined)
      },
    }
  })

  const reauthDialog = computed<ReauthDialogBindings>(() => {
    const options = pending.value?.options
    const text = options?.gate === 'reauth' ? options : undefined
    return {
      modelValue: reauthOpen.value,
      'onUpdate:modelValue': (open: boolean) => onGateModel('reauth', open),
      title: text?.title,
      message: text?.message ?? '',
      submitting: submitting.value,
      error: reauthError.value,
      confirmLabel: text?.confirmLabel,
      onConfirm: (password: string) => {
        void execute(password)
      },
    }
  })

  return {
    run,
    submitting,
    fieldErrors,
    clearFieldErrors: () => {
      fieldErrors.value = {}
    },
    confirmDialog,
    reauthDialog,
  }
}
