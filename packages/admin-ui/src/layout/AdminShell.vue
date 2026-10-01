<script lang="ts">
  import type { PermissionCheck } from '@ssworks/admin-shared'
  import type { MenuNode } from '../menu/menu.js'
  import type { AppBarMenuItem, AppBarUserMenuSlotProps } from './AppBar.vue'

  /** 셸이 열림·레일을 직접 쥐므로 `modelValue`·`rail` 은 받지 않는다. `items` 를 안 주면 `[]`. */
  export interface AdminShellMenuProps {
    items?: readonly MenuNode[]
    check?: PermissionCheck
    /** 🔴 메서드 꼴이다(bivariant) — 프로젝트의 `(node: MenuNode<Permission>) => boolean` 을 받는다. */
    filter?(node: MenuNode): boolean
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
  //      교체 슬롯은 셸 상태를 props 로 받는다 — `#drawer` `{ show, rail, setShow }`,
  //      `#app-bar` `{ toggleNav }`. 기본 자식을 살린 채 일부만 바꾸는 전달 슬롯
  //      `menu-prepend`·`menu-append`(→ MainMenu `prepend`·`append`, axion 브랜드),
  //      `app-bar-brand`·`app-bar-actions`·`app-bar-user-info`·`app-bar-user-menu`(→ AppBar,
  //      crm `#actions`)를 둔다.
  //   ② `RAIL_KEY` 하드코딩을 `railStorageKey` prop(기본 `admin_rail_menu`)으로. 저장은 ref + watch
  //      (@vueuse 를 들이지 않는다). storage 접근은 try/catch — 사생활 보호 모드에서 던진다.
  //   ③ `VMain` 이 메뉴·앱바까지 감싸던 것을 형제로 풀었다. `#banner` 는 `VMain` 안 본문 앞,
  //      `#overlays` 는 `VMain` 뒤. `container`(기본 false)가 true 면 본문을 `VContainer` 로 감싼다.
  //   ④ `IpBlockedDialog` 를 내장하지 않는다 — 🔴 `App.vue` 최상위에 둔다. `#overlays` 는 이 셸
  //      (default 레이아웃) 안이라 로그인 화면에서 IP 차단이 안 뜬다.
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

  const slots = defineSlots<{
    /** 기본 MainMenu 를 통째로 바꾼다. 셸이 쥔 열림·레일 상태와 열림 setter 를 받는다. */
    drawer?(props: { show: boolean; rail: boolean; setShow: (value: boolean) => void }): unknown
    /** 기본 AppBar 를 통째로 바꾼다. `toggleNav` 는 기본 nav 아이콘과 같다(모바일 열림 · 데스크톱 레일). */
    'app-bar'?(props: { toggleNav: () => void }): unknown
    banner?(): unknown
    default?(): unknown
    overlays?(): unknown
    /** 기본 MainMenu 의 `#prepend` 로 간다(axion 브랜드 자리). */
    'menu-prepend'?(props: { rail: boolean }): unknown
    /** 기본 MainMenu 의 `#append` 로 간다. */
    'menu-append'?(props: { rail: boolean }): unknown
    /** 기본 AppBar 의 `#brand` 로 간다. */
    'app-bar-brand'?(): unknown
    /** 기본 AppBar 의 `#actions` 로 간다(crm 우측 액션). */
    'app-bar-actions'?(): unknown
    /** 기본 AppBar 의 `#user-info` 로 간다. */
    'app-bar-user-info'?(): unknown
    /** 기본 AppBar 의 `#user-menu` 로 간다. `{ user, logout }` 을 그대로 받는다. */
    'app-bar-user-menu'?(props: AppBarUserMenuSlotProps): unknown
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

  function setShow(value: boolean) {
    show.value = value
  }

  function onClickNav() {
    if (display.mdAndDown.value) {
      showMenu.value = !showMenu.value
    } else {
      railMenu.value = !railMenu.value
    }
  }
</script>

<template>
  <!-- 🔴 전달 슬롯은 받았을 때만 건넨다(v-if). 빈 슬롯을 늘 건네면 AppBar `#user-info`·`#user-menu` 의
       기본 내용(사용자 정보 · 로그아웃)이 사라진다. -->
  <slot name="drawer" :rail="rail" :set-show="setShow" :show="show">
    <MainMenu
      v-model="show"
      v-bind="props.menuProps"
      :items="props.menuProps.items ?? []"
      :rail="rail"
    >
      <template v-if="slots['menu-prepend']" #prepend="slotProps">
        <slot name="menu-prepend" v-bind="slotProps" />
      </template>
      <template v-if="slots['menu-append']" #append="slotProps">
        <slot name="menu-append" v-bind="slotProps" />
      </template>
    </MainMenu>
  </slot>
  <slot name="app-bar" :toggle-nav="onClickNav">
    <AppBar v-bind="props.appBarProps" @click:nav="onClickNav">
      <template v-if="slots['app-bar-brand']" #brand>
        <slot name="app-bar-brand" />
      </template>
      <template v-if="slots['app-bar-actions']" #actions>
        <slot name="app-bar-actions" />
      </template>
      <template v-if="slots['app-bar-user-info']" #user-info>
        <slot name="app-bar-user-info" />
      </template>
      <template v-if="slots['app-bar-user-menu']" #user-menu="slotProps">
        <slot name="app-bar-user-menu" v-bind="slotProps" />
      </template>
    </AppBar>
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
