<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/ui/ColumnPane.vue
  //       (← kim5257-crm-v5 .../ui/column-layout/ColumnPane.vue)
  //
  // 🔴 **이 컴포넌트 자신이 `VCard` 다.** 이 안에 `CardLayout` 이나 `DataTablePanel` 을
  //    **루트로** 넣으면 테두리가 이중선이 된다. 내용 구획용 카드를 본문 안에 두는 것은 괜찮다.
  //
  // 🔴 **`width` 를 안 주면 `flex: 1`** 이다. 세 열 화면의 폭 산술이 그 사실에 선다.
  import { VCard } from 'vuetify/components'

  const props = withDefaults(
    defineProps<{
      width?: string
      scrollable?: boolean
    }>(),
    { width: undefined, scrollable: false },
  )
</script>

<template>
  <VCard
    class="column-pane"
    :class="{ 'column-pane--scrollable': props.scrollable }"
    :style="props.width ? { flex: `0 0 ${props.width}` } : { flex: 1 }"
    variant="outlined"
  >
    <div class="column-pane__top">
      <slot name="top" />
    </div>
    <div class="column-pane__content">
      <div class="column-pane__inner">
        <slot />
      </div>
    </div>
    <div class="column-pane__bottom">
      <slot name="bottom" />
    </div>
  </VCard>
</template>

<style scoped>
  .column-pane.v-card--variant-outlined {
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
    border-width: thin;
  }

  .column-pane {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  .column-pane__top {
    flex-shrink: 0;
  }

  .column-pane__content {
    position: relative;
    height: 100%;
  }

  .column-pane__bottom {
    flex-shrink: 0;
  }

  .column-pane__inner {
    height: 100%;
  }

  .column-pane--scrollable .column-pane__inner {
    position: absolute;
    width: 100%;
    overflow-y: auto;
  }
</style>
