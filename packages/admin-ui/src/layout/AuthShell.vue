<script setup lang="ts">
  import { RouterView } from 'vue-router'
  import { VAppBar, VContainer, VMain } from 'vuetify/components'

  // 정본: hangang-home apps/admin/src/layouts/auth.vue
  // 바꾼 점: `#brand` 슬롯(로고·사이트명 자리)과 기본 슬롯 폴백(RouterView)을 더했다.
  //   앱바도 메뉴도 없다 — 로그인 같은 인증 전 화면용이다.

  defineSlots<{
    brand?(): unknown
    default?(): unknown
  }>()
</script>

<template>
  <VMain>
    <VAppBar flat />
    <VContainer class="h-100 d-flex flex-column justify-center align-center">
      <slot name="brand" />
      <slot><RouterView /></slot>
    </VContainer>
  </VMain>
</template>
