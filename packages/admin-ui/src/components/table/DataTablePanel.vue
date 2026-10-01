<script setup lang="ts" generic="TItem">
  // 정본: hangang-home apps/admin/src/components/common/DataTablePanel.vue
  //
  // 🔴 **서버 페이지네이션이다 — `VDataTable` 이 아니라 `VDataTableServer`.** `VDataTable` 은
  //    `items` 를 전량 받아 자기가 자른다. `itemsLength`(서버 총수)와 `items`(이 페이지분)를 갈라
  //    받는 것이 그 구분을 구조로 못박는다.
  //
  // 🔴 **페이지·개수·정렬은 `v-model` 로 부모가 갖는다.** 부모가 그 셋을 지켜보다 다시 조회한다.
  //    `@update:options` 하나로 받는 Vuetify 관례를 안 쓰는 이유는 그 이벤트가 마운트 때도 한 번
  //    튀어 「초기 조회」와 「사용자가 페이지를 넘겼다」가 한 신호로 뭉치기 때문이다.
  //
  // 🔴 **빈 상태는 이 컴포넌트가 안 정한다.** `#no-data` 슬롯이 그대로 표로 내려가고, 화면이 거기에
  //    `EmptyState` 를 넣으며 「검색 0건인가 아예 0건인가」를 자기가 판정한다.
  import { computed, useSlots } from 'vue'
  import { VCard, VCardText, VCardTitle, VSpacer } from 'vuetify/components'
  import { useOptionalAdminUi } from '../../context/admin-ui.js'
  import {
    DEFAULT_ITEMS_PER_PAGE_OPTIONS,
    formatSortLabel,
    type AdminTableHeader,
    type AdminTableSort,
  } from './data-table.js'
  import DataTableBody from './DataTableBody.vue'

  const props = withDefaults(
    defineProps<{
      headers: readonly AdminTableHeader[]
      /** 🔴 **이 페이지분만.** 전 행이 아니다. */
      items: readonly TItem[]
      /** 🔴 **서버가 센 총 개수.** `items.length` 가 아니다. */
      itemsLength: number
      title?: string
      loading?: boolean
      /** 🔴 `-1`(전체)을 넣지 마라 — 서버가 400 을 낸다. */
      itemsPerPageOptions?: readonly number[]
    }>(),
    {
      title: '',
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

  const sortLabel = computed(() => formatSortLabel(props.headers, sortBy.value))

  /**
   * 🔴 이 컴포넌트가 직접 그리는 슬롯(`header-actions` · `filters`)은 표로 안 내려보낸다. 통째로
   *    넘기면 Vuetify 가 같은 이름의 슬롯을 만드는 날 같은 내용이 두 곳에 그려진다. 열 슬롯은 이름이
   *    동적이라 **제외 목록**이지 허용목록이 아니다.
   */
  const PANEL_SLOTS = ['header-actions', 'filters']
  const slots = useSlots()
  const tableSlotNames = computed(() =>
    Object.keys(slots).filter((name) => !PANEL_SLOTS.includes(name)),
  )
</script>

<template>
  <VCard class="data-table-panel" variant="outlined">
    <VCardTitle class="d-flex align-center ga-2">
      <span>{{ title }}</span>
      <VSpacer />
      <slot name="header-actions" />
    </VCardTitle>
    <VCardText class="pb-0">
      <div class="d-flex align-center flex-wrap ga-2">
        <slot name="filters" />
        <VSpacer />
        <!-- 🔴 기본 정렬을 화면에 적는다. 근거는 `data-table.ts`. -->
        <span class="text-body-2 text-medium-emphasis">{{ sortLabel }}</span>
      </div>
    </VCardText>
    <DataTableBody
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      v-model:sort-by="sortBy"
      :headers="headers"
      :items="items"
      :items-length="itemsLength"
      :items-per-page-options="resolvedItemsPerPageOptions"
      :loading="loading"
    >
      <template v-for="name in tableSlotNames" :key="name" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>
    </DataTableBody>
  </VCard>
</template>
