<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/ui/CardLayout.vue
  //       (← kim5257-crm-v5 packages/frontend-core/src/components/ui/CardLayout.vue)
  //
  // 🔴 Vuetify 컴포넌트는 명시 import 한다. 라이브러리는 소비 프로젝트의 auto-import
  //    (vite-plugin-vuetify · unplugin-vue-components) 에 기댈 수 없고, 테스트 러너도 마찬가지다.
  import { VCard } from 'vuetify/components'

  withDefaults(
    defineProps<{
      fillHeight?: boolean
    }>(),
    { fillHeight: false },
  )
</script>

<template>
  <VCard class="card-layout" :class="fillHeight ? ['fill-height'] : []" variant="outlined">
    <slot />
  </VCard>
</template>

<style scoped>
  .card-layout.fill-height {
    height: 100%;
  }

  /*
   * Vuetify 기본 outlined 테두리보다 옅고 얇게 통일한다. 테마 CSS 변수를 쓰므로
   * 라이트/다크가 저절로 따라온다.
   */
  .card-layout.v-card--variant-outlined {
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
    border-width: thin;
  }
</style>
