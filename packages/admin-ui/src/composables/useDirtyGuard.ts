// 정본: ssworks-gise-home apps/admin/src/composables/useDirtyGuard.ts
// 바꾼 점: 확인 문구를 옵션(`message`)으로 뺐다(기본값은 gise 문구 그대로). 나머지 동작은 같다.
import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const DEFAULT_LEAVE_MESSAGE = '저장하지 않은 변경 사항이 있습니다. 이 화면을 벗어나시겠습니까?'

export interface DirtyGuardOptions {
  /** `window.confirm` 에 띄울 문구. 기본: 저장하지 않은 변경 사항 안내(한국어). */
  message?: string
}

/**
 * 🔴 커스텀 다이얼로그가 아니라 window.confirm 을 쓴다. 내비게이션 가드는 동기 boolean(또는
 *    Promise)을 기대하는데 Vuetify 다이얼로그를 끼우려면 가드에서 Promise 를 열고 응답까지
 *    붙잡는 상태 기계가 필요하다. beforeunload 쪽은 어차피 브라우저 기본 UI 라서 두 경로의
 *    생김새를 맞추는 쪽이 일관적이다.
 * 🔴 페이지 컴포넌트의 setup 에서만 호출한다 (onBeforeRouteLeave 제약).
 */
export function useDirtyGuard(isDirty: () => boolean, options: DirtyGuardOptions = {}): void {
  const message = options.message ?? DEFAULT_LEAVE_MESSAGE

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
  onBeforeRouteLeave(() => (isDirty() ? window.confirm(message) : true))
}
