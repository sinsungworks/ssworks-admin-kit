<script setup lang="ts">
  import { computed } from 'vue'
  import { VList, VNavigationDrawer } from 'vuetify/components'
  import { createPermissionCheck, type PermissionCheck } from '@ssworks/admin-shared'
  import { useAdminUi } from '../context/admin-ui.js'
  import MainMenuItem from './MainMenuItem.vue'
  import { filterMenu, type MenuNode } from './menu.js'

  // 정본: hangang-home apps/admin/src/components/layout/MainMenu.vue
  //       (+ axion `#prepend` 브랜드 자리, gise `layouts/default.vue` 접이식)
  // 바꾼 점:
  //   ① `MENU` 상수·`usePermission()` 직접 import 를 `items`·`check` prop 으로. `check` 를 안 주면
  //      `useAdminUi().user()?.permissions` 로 판정한다 — 호출 시점마다 평가해 로그인·로그아웃을 따른다.
  //   ② `v-model:show` 를 기본 `v-model`(modelValue) 로 — 이 저장소 규약.
  //   ③ `filter` — axion `partnerOnly`·gise `isPending` 같은 프로젝트 고유 축을 권한과 AND 로.
  //   ④ `groupMode`, `#prepend`(`{ rail }`)·`#append` 슬롯.
  //   ⑤ 구분선은 최상위 자동 삽입을 버리고 노드의 `divider` 필드로 옮겼다(MainMenuItem 주석).

  const show = defineModel<boolean>({ default: true })

  const props = withDefaults(
    defineProps<{
      items: readonly MenuNode[]
      /** 생략하면 `useAdminUi().user()` 의 permissions 로 판정한다. */
      check?: PermissionCheck
      /** 권한과 AND 로 걸리는 추가 축. 잎에만 적용되고, 자식이 다 걸러진 그룹은 사라진다. */
      filter?: (node: MenuNode) => boolean
      groupMode?: 'subheader' | 'collapsible'
      rail?: boolean
    }>(),
    {
      check: undefined,
      filter: undefined,
      groupMode: 'subheader',
      rail: false,
    },
  )

  defineSlots<{
    prepend?(props: { rail: boolean }): unknown
    append?(props: { rail: boolean }): unknown
  }>()

  const ui = useAdminUi()
  // 🔴 사용자는 게터로 읽는다 — 값을 캐시하면 로그아웃 뒤에도 이전 사용자의 메뉴가 남는다.
  const contextCheck = createPermissionCheck(() => ui.user()?.permissions ?? [])

  const visibleItems = computed(() =>
    filterMenu(props.items, props.check ?? contextCheck, props.filter),
  )
</script>

<template>
  <VNavigationDrawer v-model="show" :rail="props.rail">
    <slot name="prepend" :rail="props.rail" />
    <VList nav>
      <MainMenuItem
        v-for="node in visibleItems"
        :key="node.id"
        :group-mode="props.groupMode"
        :node="node"
        :rail="props.rail"
      />
    </VList>
    <slot name="append" :rail="props.rail" />
  </VNavigationDrawer>
</template>
