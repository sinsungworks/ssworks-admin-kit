<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/ui/PanelLayout.vue
  //       (← kim5257-crm-v5 packages/frontend-core/src/components/ui/PanelLayout.vue)
  //
  // 🔴 **이 컴포넌트는 `height: 100%` 를 전제한다.** 부모가 definite height 를 안 주면
  //    `--scrollable` 의 `min-height: 0` + `position: absolute` 조합이 본문을 **0 높이로
  //    접는데 오류는 0건이다.** `VContainer` 안에 넣으면 본문이 통째로 안 보인다 — 이 컴포넌트를
  //    쓰는 페이지는 `<VContainer>` 를 쓰지 않는다.
  withDefaults(
    defineProps<{
      scrollable?: boolean
    }>(),
    { scrollable: false },
  )
</script>

<template>
  <div class="panel-layout" :class="{ 'panel-layout--scrollable': scrollable }">
    <div class="panel-layout__top">
      <slot name="top" />
    </div>
    <div class="panel-layout__content">
      <div class="panel-layout__content-inner">
        <slot />
      </div>
    </div>
    <div class="panel-layout__bottom">
      <slot name="bottom" />
    </div>
  </div>
</template>

<style scoped>
  .panel-layout {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  .panel-layout__top {
    flex-shrink: 0;
  }

  .panel-layout__content {
    flex: 1;
  }

  .panel-layout__bottom {
    flex-shrink: 0;
  }

  /*
   * 🔴 `min-height: 0` 이 핵심이다. flex item 의 암묵적 `min-height: auto` 를 깨야
   *    top+bottom 을 뺀 나머지 높이로 content 가 고정된다. 없으면 content 가 콘텐츠
   *    길이만큼 늘어나 스크롤이 페이지 전체에서 일어난다.
   */
  .panel-layout--scrollable .panel-layout__content {
    position: relative;
    min-height: 0;
  }

  .panel-layout--scrollable .panel-layout__content-inner {
    position: absolute;
    height: 100%;
    width: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
</style>
