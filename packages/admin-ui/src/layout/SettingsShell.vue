<script setup lang="ts">
  import { computed, inject, watch } from 'vue'
  import { matchedRouteKey, RouterView, useRoute, useRouter } from 'vue-router'
  import { VList, VListItem } from 'vuetify/components'
  import { createPermissionCheck, type PermissionCheck } from '@ssworks/admin-shared'
  import ColumnLayout from '../components/ui/ColumnLayout.vue'
  import ColumnPane from '../components/ui/ColumnPane.vue'
  import { useAdminUi } from '../context/admin-ui.js'
  import { filterMenu, joinPath, type MenuNode } from '../menu/menu.js'
  import type { AdminRouteMeta } from '../router/route-meta.js'

  // 정본: hangang-home apps/admin/src/pages/settings/index.vue
  // 바꾼 점:
  //  ① 라우트 표 직접 import(`routes.find(r => r.path === '/settings')`)를 vue-router 의 `matchedRouteKey` 주입으로.
  //     이 셸(또는 셸을 품은 페이지)을 그린 `RouterView` 의 레코드다 — 패키지는 소비자의 라우트 표를 모른다.
  //  ② `usePermission()` 직접 import 를 `check` prop 으로. 안 주면 `useAdminUi().user()` 의 권한(MainMenu 와 같음).
  //  ③ 판정을 킷 `filterMenu` 로 — 빈 권한은 공개, `permissions` AND, `anyPermissions` OR(가드와 같은 meta).
  //  ④ 인덱스(`path: ''`) · 동적 세그먼트 자식을 뺀다 — 메뉴로 갈 수 있는 자리가 아니다. 제목은 `meta.menu.title` 우선.
  //  ⑤ `forbiddenPath` · `menuWidth` prop, 기본 슬롯(기본 내용 `RouterView`).
  //
  // 🔴 **좌측 메뉴를 손으로 나열하지 않는다** — 자식 `meta` 에서 파생한다. 메뉴가 자기 권한을 따로 들면 둘이 갈릴 때
  //    메뉴는 보이는데 들어가면 403 이 된다.
  // 🔴 **`RouterView` 를 `ColumnPane` 으로 감싸지 않는다.** 자식 페이지가 자기 루트에서 `ColumnPane` 을 내고,
  //    fragment 로 메뉴 pane 과 나란히 놓인다(hangang 구조).

  const props = withDefaults(
    defineProps<{
      /** 생략하면 `useAdminUi().user()` 의 permissions 로 판정한다. */
      check?: PermissionCheck
      /** 허용된 자식이 하나도 없을 때. 가드 기본값과 같다. */
      forbiddenPath?: string
      menuWidth?: string
    }>(),
    { check: undefined, forbiddenPath: '/403', menuWidth: '240px' },
  )

  defineSlots<{ default?(): unknown }>()

  const matched = inject(matchedRouteKey, null)
  if (matched == null) {
    throw new Error(
      '[admin-ui] SettingsShell 은 RouterView 가 그린 라우트 컴포넌트 안에서 써야 한다 — 자기 라우트 레코드를 찾지 못했다',
    )
  }
  const route = useRoute()
  const router = useRouter()
  const ui = useAdminUi()
  // 🔴 사용자는 게터로 읽는다 — 값을 캐시하면 로그아웃 · `refresh()` 뒤에도 이전 권한의 메뉴가 남는다.
  const contextCheck = createPermissionCheck(() => ui.user()?.permissions ?? [])

  const isDynamic = (path: string) => path.includes(':')
  const trimSlash = (path: string) =>
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

  const basePath = computed(() => matched.value?.path ?? '')

  watch(
    basePath,
    (path) => {
      if (isDynamic(path)) {
        console.warn(
          `[admin-ui] SettingsShell 은 동적 세그먼트가 있는 부모 경로(${path})를 지원하지 않는다 — 메뉴를 그리지 않는다`,
        )
      }
    },
    { immediate: true },
  )

  const items = computed<MenuNode[]>(() => {
    const record = matched.value
    if (record == null || isDynamic(record.path)) return []
    return (record.children ?? [])
      .filter((child) => child.path !== '' && !isDynamic(child.path))
      .map((child) => {
        const meta = child.meta as AdminRouteMeta | undefined
        const to = joinPath(record.path, child.path)
        const node: MenuNode = {
          id: to,
          title: meta?.menu?.title ?? meta?.title ?? to,
          to,
          permissions: meta?.permissions,
          anyPermissions: meta?.anyPermissions,
        }
        if (meta?.menu?.icon != null) node.icon = meta.menu.icon
        return node
      })
  })

  const visibleItems = computed(() => filterMenu(items.value, props.check ?? contextCheck))

  /**
   * 🔴 **`watch` 로 건다 — `setup`/`onMounted` 에서 하면 첫 진입에서만 돈다.** `/settings/roles → /settings` 이동에서
   *    셸 레코드가 같아 부모는 patch 될 뿐 다시 마운트되지 않고, 자식 매칭이 없어 오른쪽이 빈다. 사이드바의 "설정" 을
   *    다시 누르는 것이 가장 흔한 경로다(hangang).
   * 🔴 **대상은 고정 자식이 아니라 걸러진 첫 항목이다.** 고정 자식으로 밀면 그 권한 하나만 없는 관리자가 설정 전체를
   *    못 쓴다. 걸러진 목록이 비면 `forbiddenPath` — 빈 화면이 아니라 "접근 권한 없음" 문장을 낸다.
   * 🔴 `replace` 다 — 뒤로 가기가 부모와 첫 자식 사이에 갇히지 않는다.
   */
  watch(
    () => route.path,
    (path) => {
      if (isDynamic(basePath.value) || trimSlash(path) !== trimSlash(basePath.value)) return
      const first = visibleItems.value[0]
      void router.replace(first?.to ?? props.forbiddenPath)
    },
    { immediate: true },
  )
</script>

<template>
  <ColumnLayout class="pa-3" gap="12px">
    <ColumnPane :width="props.menuWidth">
      <VList nav>
        <VListItem
          v-for="item in visibleItems"
          :key="item.id"
          :prepend-icon="item.icon"
          :title="item.title"
          :to="item.to"
        />
      </VList>
    </ColumnPane>
    <slot><RouterView /></slot>
  </ColumnLayout>
</template>
