<script setup lang="ts">
  import { VChip, VDivider, VListGroup, VListItem, VListSubheader } from 'vuetify/components'
  import type { MenuNode } from './menu.js'

  // 정본: hangang-home apps/admin/src/components/layout/MainMenuItem.vue
  //       (+ gise-home layouts/default.vue 의 VListGroup 접이식·'준비 중' 칩)
  // 바꾼 점:
  //   ① entry/group 이분 타입 대신 `children` 유무로 가른다(`MenuNode`, 스펙 §3-2).
  //   ② `divider` 는 prop 이 아니라 **노드 필드**다. 뜻은 하나 — "이 노드 뒤에 구분선"
  //      (상류 `is-last` 는 부모마다 뜻이 달랐다). 최상위·그룹 안 어디서든 노드가 선언한 자리에 선다.
  //   ③ `groupMode` — 'subheader'(hangang) | 'collapsible'(gise `VListGroup`).
  //   ④ `disabled` + `badge` — gise `isPending` 을 일반화. 링크를 걸지 않고 칩을 단다.
  //
  // 🔴 `rail` 은 **재귀 호출에도 반드시 내려보낸다.** crm·axion 은 이것을 빠뜨려 접힌 메뉴에서도
  //    중첩 그룹 머리가 그려졌다.

  const props = withDefaults(
    defineProps<{
      node: MenuNode
      rail?: boolean
      groupMode?: 'subheader' | 'collapsible'
    }>(),
    {
      rail: false,
      groupMode: 'subheader',
    },
  )
</script>

<template>
  <template v-if="props.node.children == null">
    <VListItem
      :disabled="props.node.disabled === true"
      :prepend-icon="props.node.icon"
      :title="props.node.title"
      :to="props.node.disabled === true ? undefined : props.node.to"
    >
      <template v-if="props.node.badge != null" #append>
        <VChip label size="x-small">
          {{ props.node.badge }}
        </VChip>
      </template>
    </VListItem>
  </template>
  <template v-else-if="props.groupMode === 'collapsible'">
    <VListGroup :value="props.node.id">
      <template #activator="{ props: activatorProps }">
        <VListItem
          v-bind="activatorProps"
          :prepend-icon="props.node.icon"
          :title="props.node.title"
        />
      </template>
      <MainMenuItem
        v-for="child in props.node.children"
        :key="child.id"
        :group-mode="props.groupMode"
        :node="child"
        :rail="props.rail"
      />
    </VListGroup>
  </template>
  <template v-else>
    <VListSubheader v-if="!props.rail">
      {{ props.node.title }}
    </VListSubheader>
    <MainMenuItem
      v-for="child in props.node.children"
      :key="child.id"
      :group-mode="props.groupMode"
      :node="child"
      :rail="props.rail"
    />
  </template>
  <VDivider v-if="props.node.divider === true" class="main-menu-divider" />
</template>

<style scoped lang="css">
  .main-menu-divider {
    margin-top: 8px;
    margin-bottom: 8px;
  }
</style>
