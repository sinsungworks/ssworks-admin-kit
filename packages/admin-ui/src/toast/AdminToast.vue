<script setup lang="ts">
  // 정본: ssworks-gise-home apps/admin/src/components/AppToast.vue
  // App.vue 에 한 번만 둔다. 상태는 `createToast()` 플러그인이 provide 한 것을 읽는다.
  import { inject } from 'vue'
  import { VSnackbar } from 'vuetify/components'
  import type { Anchor } from 'vuetify'
  import { TOAST_KEY } from './toast.js'

  withDefaults(
    defineProps<{
      location?: Anchor
    }>(),
    { location: 'bottom right' },
  )

  const toast = inject(TOAST_KEY, null)
  if (toast == null) {
    throw new Error(
      '<AdminToast>: createToast() 플러그인이 설치되지 않았다 — app.use(createToast())',
    )
  }
  const state = toast.state
</script>

<template>
  <VSnackbar
    v-model="state.show"
    :color="state.color"
    :location="location"
    :timeout="state.timeout"
  >
    {{ state.message }}
  </VSnackbar>
</template>
