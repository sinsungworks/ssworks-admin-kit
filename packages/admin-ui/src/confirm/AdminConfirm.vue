<script setup lang="ts">
  // 앱 전체에 하나뿐인 확인 창의 자리 — `App.vue` 에 `<AdminToast />` 옆으로 한 번만 둔다. 상태는 `createConfirm()`
  // 플러그인이 provide 한 것을 읽는다(셸 스펙 §8 R15).
  //
  // 🔴 마운트돼 있는 동안만 답할 자리로 센다 — 이 컴포넌트를 두지 않은 앱은 `ask()` 가 브라우저 기본 창으로 떨어진다.
  import { inject, onBeforeUnmount, onMounted } from 'vue'
  import ConfirmDialog from '../components/common/ConfirmDialog.vue'
  import { CONFIRM_KEY } from './confirm.js'

  const confirm = inject(CONFIRM_KEY, null)
  if (confirm == null) {
    throw new Error(
      '<AdminConfirm>: createConfirm() 플러그인이 설치되지 않았다 — app.use(createConfirm())',
    )
  }
  const state = confirm.state

  let detach: (() => void) | null = null
  onMounted(() => {
    detach = confirm.attach()
  })
  onBeforeUnmount(() => {
    detach?.()
    detach = null
  })

  function onModel(open: boolean): void {
    if (!open) confirm!.answer(false)
  }
</script>

<template>
  <ConfirmDialog
    v-if="state.request"
    :cancel-label="state.request.cancelLabel"
    :confirm-color="state.request.confirmColor"
    :confirm-label="state.request.confirmLabel"
    :message="state.request.message"
    :model-value="state.open"
    :reversible="state.request.reversible"
    :title="state.request.title"
    @confirm="confirm.answer(true)"
    @update:model-value="onModel"
  />
</template>
