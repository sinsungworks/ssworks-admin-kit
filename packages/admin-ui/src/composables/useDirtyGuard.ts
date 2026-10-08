// 정본: ssworks-gise-home apps/admin/src/composables/useDirtyGuard.ts
// 바꾼 점: 확인 문구를 옵션(`message`)으로 뺐다(기본값은 gise 문구 그대로). 킷 확인 창(`createConfirm()` +
//   `<AdminConfirm />`)이 있으면 브라우저 기본 `confirm` 대신 그것으로 묻는다(셸 스펙 §8 R15 — 브라우저 확인에서 요청).
import { inject, onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { CONFIRM_KEY } from '../confirm/confirm.js'

const DEFAULT_LEAVE_MESSAGE = '저장하지 않은 변경 사항이 있습니다. 이 화면을 벗어나시겠습니까?'
const DEFAULT_LEAVE_TITLE = '화면 떠나기'

export interface DirtyGuardOptions {
  /** 확인 창에 띄울 문구. 기본: 저장하지 않은 변경 사항 안내(한국어). */
  message?: string
  /** 킷 확인 창의 제목. 기본 '화면 떠나기'. 브라우저 기본 창에는 제목이 없다. */
  title?: string
}

/**
 * 🔴 묻는 창은 둘 중 하나다. 앱이 `app.use(createConfirm())` 하고 `App.vue` 에 `<AdminConfirm />` 을 두었으면 킷
 *    `ConfirmDialog` 로 묻고 가드는 그 답(Promise)을 기다린다. 아니면 `window.confirm` 이다(gise 원본 그대로 — 기존
 *    앱은 바뀌지 않는다). 플러그인만 있고 자리를 안 둔 앱도 기본 창으로 떨어진다 — 아무도 그리지 않는 창을 기다리며
 *    이동이 멈추지 않게(`createConfirm` 이 자리 수를 센다).
 * 🔴 `beforeunload`(새로고침 · 탭 닫기)는 어느 쪽이든 브라우저 기본 경고다 — 브라우저가 모양 · 문구를 바꾸지 못하게 막는다.
 * 🔴 페이지 컴포넌트의 setup 에서만 호출한다 (onBeforeRouteLeave 제약).
 */
export function useDirtyGuard(isDirty: () => boolean, options: DirtyGuardOptions = {}): void {
  const message = options.message ?? DEFAULT_LEAVE_MESSAGE
  const title = options.title ?? DEFAULT_LEAVE_TITLE
  const confirm = inject(CONFIRM_KEY, null)

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
  onBeforeRouteLeave(() => {
    if (!isDirty()) return true
    if (confirm == null) return window.confirm(message)
    // 떠나면 저장하지 않은 변경이 사라진다 — 되돌릴 수 없는 쪽이다(빨간 "떠나기")
    return confirm.ask({
      title,
      message,
      reversible: false,
      confirmLabel: '떠나기',
      cancelLabel: '머물기',
    })
  })
}
