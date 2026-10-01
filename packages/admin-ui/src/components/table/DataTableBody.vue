<script setup lang="ts" generic="TItem">
  // 정본: hangang-home apps/admin/src/components/common/DataTableBody.vue
  //
  // `DataTablePanel` 에서 표만 뽑은 것이다. 카드·제목·필터·정렬 라벨은 여기 없다 — `PanelLayout` 의
  // `#top` 에 그 셋을 올려 스크롤에 안 딸려가게 하려면 표가 갈려 있어야 한다.
  import { computed, useSlots } from 'vue'
  import { VDataTableServer } from 'vuetify/components'
  import { useOptionalAdminUi } from '../../context/admin-ui.js'
  import {
    DEFAULT_ITEMS_PER_PAGE_OPTIONS,
    type AdminTableHeader,
    type AdminTableSort,
  } from './data-table.js'

  const props = withDefaults(
    defineProps<{
      headers: readonly AdminTableHeader[]
      /** 🔴 **이 페이지분만.** 전 행이 아니다. */
      items: readonly TItem[]
      /** 🔴 **서버가 센 총 개수.** `items.length` 가 아니다 — 같게 쓰면 항상 1페이지다. */
      itemsLength: number
      loading?: boolean
      /** 🔴 `-1`(전체)을 넣지 마라 — 서버가 400 을 낸다. */
      itemsPerPageOptions?: readonly number[]
    }>(),
    {
      loading: false,
      // 🔴 기본값을 여기 두지 않는다 — prop → 컨텍스트 → 상수 순으로 아래에서 푼다.
      itemsPerPageOptions: undefined,
    },
  )

  const adminUi = useOptionalAdminUi()
  const resolvedItemsPerPageOptions = computed(
    () =>
      props.itemsPerPageOptions ??
      adminUi?.table.itemsPerPageOptions ??
      DEFAULT_ITEMS_PER_PAGE_OPTIONS,
  )

  const page = defineModel<number>('page', { default: 1 })
  const itemsPerPage = defineModel<number>('itemsPerPage', { default: 20 })
  const sortBy = defineModel<AdminTableSort[]>('sortBy', { default: () => [] })

  const slots = useSlots()
</script>

<template>
  <VDataTableServer
    v-model:items-per-page="itemsPerPage"
    v-model:page="page"
    v-model:sort-by="sortBy"
    :headers="headers"
    :items="items"
    :items-length="itemsLength"
    :items-per-page-options="resolvedItemsPerPageOptions"
    :loading="loading"
  >
    <template v-for="name in Object.keys(slots)" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </VDataTableServer>
</template>
