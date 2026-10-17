<script setup lang="ts" generic="R extends AdminAuditLog">
  import { computed } from 'vue'
  import { VBtn, VChip } from 'vuetify/components'
  import type { AdminAuditLog, AuditCatalog } from '@ssworks/admin-shared'
  import { formatDateTime } from '../../utils/format-date-time.js'
  import EmptyState from '../common/EmptyState.vue'
  import DataTableBody from '../table/DataTableBody.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import AuditLogDetail from './AuditLogDetail.vue'
  import {
    actorText,
    auditResultOf,
    auditResultText,
    targetText,
    type AuditLogMessages,
    type AuditResultKind,
  } from './audit-log.js'

  // 감사 로그 표(내부 부품) — 셀 · 이 사람 기록만 · 글자 펼침 버튼 · 펼친 행 · 빈 상태(A12 · A13 · A15).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue `DataTableBody` 부분
  // 바꾼 점: 결과를 칩 + 글자로(crm 칩 · hangang 글자), 행위자 셀에 "이 사람 기록만"(A10).
  //
  // 🔴 펼침 키는 `String(logNo)` 다 — 키가 없으면 한 행을 펼칠 때 전 행이 펼쳐지고, bigint 는 비교가 안 된다(hangang).
  //    `item-value` · `expanded` 는 `DataTableBody` 의 props 가 아니라 루트 `VDataTableServer` 로 떨어지는 속성이다.
  // 🔴 펼침 버튼은 아이콘이 아니라 글자다 — 사람이 읽고, 테스트가 글자로 찾는다(hangang 453).
  // 🔴 머리 정렬을 모두 막는다 — 서버가 최신순만 낸다(A11). 화살표만 움직이면 거짓 신호다.

  const props = withDefaults(
    defineProps<{
      rows: readonly R[]
      itemsLength: number
      loading: boolean
      loadFailed: boolean
      filtered: boolean
      expanded: readonly string[]
      catalog: AuditCatalog
      fieldLabels: Readonly<Record<string, string>>
      messages: AuditLogMessages
      formatDate?(iso: string): string
    }>(),
    { formatDate: undefined },
  )

  const page = defineModel<number>('page', { default: 1 })
  const itemsPerPage = defineModel<number>('itemsPerPage', { default: 20 })

  const emit = defineEmits<{
    'update:expanded': [keys: string[]]
    filterByActor: [row: R]
  }>()

  const RESULT_COLOR: Record<AuditResultKind, string> = {
    success: 'success',
    redirect: 'info',
    denied: 'warning',
    error: 'error',
  }

  const headers = computed<AdminTableHeader[]>(() => [
    { title: props.messages.columnCreateAt, key: 'createAt', sortable: false, nowrap: true },
    { title: props.messages.columnActor, key: 'actor', sortable: false },
    { title: props.messages.columnAction, key: 'action', sortable: false },
    { title: props.messages.columnTarget, key: 'target', sortable: false },
    { title: props.messages.columnResult, key: 'statusCode', sortable: false, nowrap: true },
    { title: props.messages.columnIp, key: 'ip', sortable: false, nowrap: true },
    { title: '', key: 'data-table-expand', sortable: false, align: 'end' },
  ])

  const expandedKeys = computed(() => [...props.expanded])
  const rowKey = (row: R) => String(row.logNo)
  /** 슬롯 props 의 타입이 넓다 — 행 타입을 되찾는다(hangang 247) */
  const row = (item: unknown) => item as R

  function format(iso: string): string {
    return props.formatDate ? props.formatDate(iso) : formatDateTime(iso, { seconds: true })
  }
</script>

<template>
  <DataTableBody
    v-model:items-per-page="itemsPerPage"
    v-model:page="page"
    class="audit-log-table"
    :expanded="expandedKeys"
    :headers="headers"
    :item-value="rowKey"
    :items="rows"
    :items-length="itemsLength"
    :loading="loading"
    @update:expanded="emit('update:expanded', $event)"
  >
    <template #item.createAt="{ item }">
      <span class="audit-log-table__time">{{ format(row(item).createAt) }}</span>
    </template>
    <template #item.actor="{ item }">
      <div>{{ actorText(row(item), messages) }}</div>
      <VBtn
        v-if="row(item).actorUserNo != null"
        :aria-label="messages.filterByActorLabel(actorText(row(item), messages))"
        class="audit-log-table__actor-button"
        size="x-small"
        variant="text"
        @click="emit('filterByActor', row(item))"
      >
        {{ messages.filterByActor }}
      </VBtn>
    </template>
    <template #item.action="{ item }">
      <div>{{ catalog.labelOf(row(item).action) }}</div>
      <div
        v-if="catalog.labelOf(row(item).action) !== row(item).action"
        class="audit-log-table__code"
      >
        {{ row(item).action }}
      </div>
    </template>
    <template #item.target="{ item }">{{ targetText(row(item), catalog) }}</template>
    <template #item.statusCode="{ item }">
      <VChip
        :color="RESULT_COLOR[auditResultOf(row(item).statusCode)]"
        size="x-small"
        variant="tonal"
      >
        {{ auditResultText(row(item).statusCode, messages) }}
      </VChip>
      <div v-if="row(item).errorCode" class="audit-log-table__code">{{ row(item).errorCode }}</div>
    </template>
    <template #item.ip="{ item }">{{ row(item).ip ?? '—' }}</template>
    <template #item.data-table-expand="{ item, internalItem, isExpanded, toggleExpand }">
      <VBtn
        :aria-expanded="isExpanded(internalItem)"
        :aria-label="
          messages.expandLabel(
            format(row(item).createAt),
            catalog.labelOf(row(item).action),
            isExpanded(internalItem),
          )
        "
        size="small"
        variant="text"
        @click="toggleExpand(internalItem)"
      >
        {{ isExpanded(internalItem) ? messages.collapse : messages.expand }}
      </VBtn>
    </template>
    <template #expanded-row="{ columns, item }">
      <tr class="audit-log-table__expanded">
        <td :colspan="columns.length">
          <AuditLogDetail :field-labels="fieldLabels" :messages="messages" :row="row(item)" />
        </td>
      </tr>
    </template>
    <template #no-data>
      <EmptyState
        v-if="!loadFailed"
        :filtered="filtered"
        :filtered-title="messages.filteredEmptyTitle"
        :title="messages.emptyTitle"
      />
    </template>
  </DataTableBody>
</template>

<style scoped>
  .audit-log-table__time {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .audit-log-table__code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.78rem;
    opacity: 0.7;
    overflow-wrap: anywhere;
  }
  .audit-log-table__actor-button {
    margin-left: -8px;
  }
</style>
