<script lang="ts">
  import type { PermissionCheck } from '@ssworks/admin-shared'
  import type { MenuNode } from '../menu/menu.js'
  import type { AppBarMenuItem } from './AppBar.vue'

  /** 셸이 열림·레일을 직접 쥐므로 `modelValue`·`rail` 은 받지 않는다. `items` 를 안 주면 `[]`. */
  export interface AdminShellMenuProps {
    items?: readonly MenuNode[]
    check?: PermissionCheck
    filter?: (node: MenuNode) => boolean
    groupMode?: 'subheader' | 'collapsible'
  }

  export interface AdminShellAppBarProps {
    title?: string
    siteName?: string
    menuItems?: AppBarMenuItem[]
    showTeamRole?: boolean
  }
</script>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { RouterView } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { VContainer, VMain } from 'vuetify/components'
  import AppBar from './AppBar.vue'
  import MainMenu from '../menu/MainMenu.vue'

  // 정본: hangang-home apps/admin/src/layouts/default.vue
  //       (+ axion 배너 자리, gise `VContainer` 감싸기)
  // 바꾼 점:
  //   ① `MENU`·`AppBar` 직접 import 를 `menuProps`·`appBarProps` 와 `#drawer`·`#app-bar` 슬롯으로.
  //   ② `RAIL_KEY` 하드코딩을 `railStorageKey` prop(기본 `admin_rail_menu`)으로. 저장은 ref + watch
  //      (@vueuse 를 들이지 않는다). storage 접근은 try/catch — 사생활 보호 모드에서 던진다.
  //   ③ `VMain` 이 메뉴·앱바까지 감싸던 것을 형제로 풀었다. `#banner` 는 `VMain` 안 본문 앞,
  //      `#overlays` 는 `VMain` 뒤. `container`(기본 false)가 true 면 본문을 `VContainer` 로 감싼다.
  //   ④ `IpBlockedDialog` 를 내장하지 않는다 — `#overlays` 또는 App.vue 에 둔다.
  //
  // 🔴 레일은 데스크톱(md 초과)에서만 적용한다 — 모바일에서는 drawer 열림/닫힘이 토글된다.

  const props = withDefaults(
    defineProps<{
      menuProps?: AdminShellMenuProps
      appBarProps?: AdminShellAppBarProps
      railStorageKey?: string
      container?: boolean
    }>(),
    {
      menuProps: () => ({}),
      appBarProps: () => ({}),
      railStorageKey: 'admin_rail_menu',
      container: false,
    },
  )

  defineSlots<{
    drawer?(): unknown
    'app-bar'?(): unknown
    banner?(): unknown
    default?(): unknown
    overlays?(): unknown
  }>()

  const display = useDisplay()

  function readRail(): boolean {
    try {
      return window.localStorage.getItem(props.railStorageKey) === 'true'
    } catch {
      return false
    }
  }

  const showMenu = ref(false)
  const railMenu = ref(readRail())

  watch(railMenu, (value) => {
    try {
      window.localStorage.setItem(props.railStorageKey, String(value))
    } catch {
      // 저장 못 해도 이번 세션 동작에는 영향이 없다.
    }
  })

  const rail = computed(() => railMenu.value && !display.mdAndDown.value)

  const show = computed({
    get: () => showMenu.value || !display.mdAndDown.value,
    set: (value: boolean) => {
      showMenu.value = value
    },
  })

  function onClickNav() {
    if (display.mdAndDown.value) {
      showMenu.value = !showMenu.value
    } else {
      railMenu.value = !railMenu.value
    }
  }
</script>

<template>
  <slot name="drawer">
    <MainMenu
      v-model="show"
      v-bind="props.menuProps"
      :items="props.menuProps.items ?? []"
      :rail="rail"
    />
  </slot>
  <slot name="app-bar">
    <AppBar v-bind="props.appBarProps" @click:nav="onClickNav" />
  </slot>
  <VMain>
    <slot name="banner" />
    <VContainer v-if="props.container">
      <slot><RouterView /></slot>
    </VContainer>
    <slot v-else><RouterView /></slot>
  </VMain>
  <slot name="overlays" />
</template>
