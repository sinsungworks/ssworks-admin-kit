<script lang="ts">
  import type { RouteLocationRaw } from 'vue-router'

  export interface AppBarMenuItem {
    icon?: string
    title: string
    to?: RouteLocationRaw
    onClick?: () => void
    /** `false` 면 그리지 않는다. 생략하면 보인다. */
    visible?: boolean
  }
</script>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import {
    VAppBar,
    VAppBarNavIcon,
    VAppBarTitle,
    VAvatar,
    VBtn,
    VCard,
    VDivider,
    VList,
    VListItem,
    VMenu,
    VSpacer,
  } from 'vuetify/components'
  import { useAdminUi } from '../context/admin-ui.js'
  import { useAdminLogout } from '../context/logout.js'

  // 정본: hangang-home apps/admin/src/components/layout/AppBar.vue
  // (crm 의 우측 액션은 `#actions`, gise 의 텍스트 버튼은 `menuItems`/`#actions` 로 흡수한다.)
  // 바꾼 점:
  //  - 🔴 `useAppStore`·`SITE_NAME` 직접 import 를 걷어냈다. 사용자·사이트명·로그아웃은
  //    `useAdminUi()` 에서 받는다. 사이트명은 prop → 플러그인 → 없음(제목만) 순이다.
  //  - `/mypage`·`/account` 하드코딩을 걷어냈다. 메뉴 항목은 `menuItems` 로 받는다.
  //  - 팀/역할 행은 `showTeamRole` 일 때만. 슬롯 `brand`·`actions`·`user-info`·`user-menu`.
  //  - 🔴 로그아웃 뒤 이동은 AppBar 가 한다(스토어는 라우팅하지 않는다) — `useAdminLogout()`.
  //  - 제목은 `title ?? route.meta.title`. meta 는 `unknown` 으로 읽어 문자열만 받는다
  //    (패키지가 `RouteMeta` 를 증강하지 않는다).

  const props = withDefaults(
    defineProps<{
      title?: string
      siteName?: string
      menuItems?: AppBarMenuItem[]
      showTeamRole?: boolean
    }>(),
    { title: undefined, siteName: undefined, menuItems: () => [], showTeamRole: false },
  )

  const emit = defineEmits<{
    'click:nav': []
  }>()

  const ctx = useAdminUi()
  const route = useRoute()
  const logout = useAdminLogout()

  const user = computed(() => ctx.user())
  const visibleItems = computed(() => props.menuItems.filter((i) => i.visible !== false))

  const title = computed(() => {
    if (props.title != null) return props.title
    const metaTitle: unknown = route.meta.title
    return typeof metaTitle === 'string' ? metaTitle : ''
  })

  const fullTitle = computed(() => {
    const site = props.siteName ?? ctx.siteName
    return site ? `${site} · ${title.value}` : title.value
  })

  function onItemClick(item: AppBarMenuItem) {
    item.onClick?.()
  }
</script>

<template>
  <VAppBar flat>
    <VAppBarNavIcon density="comfortable" @click="emit('click:nav')" />
    <slot name="brand" />
    <VAppBarTitle>{{ fullTitle }}</VAppBarTitle>
    <VSpacer />
    <slot name="actions" />
    <VMenu>
      <template #activator="{ props: activatorProps }">
        <VBtn
          v-bind="activatorProps"
          aria-label="사용자 메뉴"
          class="mr-2 ml-2"
          icon
          variant="text"
        >
          <VAvatar border icon="mdi-account" />
        </VBtn>
      </template>
      <slot name="user-menu">
        <VCard min-width="220">
          <VList>
            <slot name="user-info">
              <VListItem :subtitle="user?.userId ?? ''" :title="user?.userName ?? ''">
                <template #prepend>
                  <VAvatar border icon="mdi-account" size="x-large" />
                </template>
              </VListItem>
            </slot>
          </VList>
          <template v-if="showTeamRole">
            <VDivider />
            <VList>
              <VListItem
                :subtitle="user?.roleName ?? ''"
                :title="user?.teamName ?? ''"
                prepend-icon="mdi-account-group-outline"
              />
            </VList>
          </template>
          <VDivider />
          <VList>
            <VListItem
              v-for="(item, i) in visibleItems"
              :key="`${i}:${item.title}`"
              :prepend-icon="item.icon"
              :title="item.title"
              :to="item.to"
              @click="onItemClick(item)"
            />
            <VListItem prepend-icon="mdi-logout" title="로그아웃" @click="logout" />
          </VList>
        </VCard>
      </slot>
    </VMenu>
  </VAppBar>
</template>

<style scoped lang="css">
  .v-app-bar {
    border-bottom-width: thin;
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
