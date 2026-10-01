<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/ui/ColumnLayout.vue + crm-v5 의 `divider` prop.
  //
  // hangang 은 사용처 0건을 근거로 `divider` 를 뺐지만 패키지는 옵션으로 둔다 — 기본값이
  // false 라 안 쓰면 아무 영향이 없고, 필요한 프로젝트가 다섯 줄을 다시 들여오는 일이 없어진다.
  //
  // 🔴 `PanelLayout` 과 같은 전제다 — 부모가 definite height 를 줘야 한다.
  withDefaults(
    defineProps<{
      gap?: string
      /** 이웃한 `ColumnPane` 사이에 세로 구분선을 긋는다. */
      divider?: boolean
    }>(),
    { gap: '0', divider: false },
  )
</script>

<template>
  <div class="column-layout" :class="{ 'column-layout--divider': divider }" :style="{ gap }">
    <slot />
  </div>
</template>

<style scoped>
  .column-layout {
    display: flex;
    flex-direction: row;
    height: 100%;
    width: 100%;
  }

  .column-layout--divider :deep(.column-pane + .column-pane) {
    border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
