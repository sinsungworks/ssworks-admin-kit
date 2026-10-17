<script setup lang="ts" generic="R extends AdminAuditLog">
  import { VAlert, VBtn } from 'vuetify/components'
  import type { AdminAuditLog, AuditCatalog } from '@ssworks/admin-shared'
  import AuditLogFilterBar from './AuditLogFilterBar.vue'
  import AuditLogTable from './AuditLogTable.vue'
  import type { AuditFilterItem, AuditLogDraft, AuditLogMessages } from './audit-log.js'

  // 감사 로그 화면 한 벌 — 읽기 전용 안내 · 조회 실패 알림 · 필터 카드 · 머리 줄 · 표.
  // 흐름은 `useAuditLogs` 가 갖고, 이 컴포넌트는 그 바인딩(`audit.viewer.value`)을 받아 그리고 이벤트만 낸다.
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue 템플릿
  // 바꾼 점: `ColumnPane` 루트 · 페이지 제목이 없다 — 틀과 제목은 페이지 몫이다(C6). 조회 실패는 알림 + [다시 시도](C7).
  //   내보내기 · 만들기 · 수정 · 삭제 버튼을 두지 않는다 — 읽기 전용이고 서버에 그 라우트가 없다(hangang 46).

  withDefaults(
    defineProps<{
      draft: AuditLogDraft
      actorMode: 'search' | 'number'
      actorHint: string | null
      actorItems: readonly AuditFilterItem[]
      actorSearching: boolean
      actorSearchFailed: boolean
      actionItems: readonly AuditFilterItem[]
      targetItems: readonly AuditFilterItem[]
      filterError: string | null
      rows: readonly R[]
      itemsLength: number
      page: number
      itemsPerPage: number
      loading: boolean
      loadFailed: boolean
      filtered: boolean
      expanded: readonly string[]
      catalog: AuditCatalog
      fieldLabels: Readonly<Record<string, string>>
      messages: AuditLogMessages
      /** 시각 표기. 기본 `YYYY-MM-DD HH:mm:ss`(브라우저 현지 시각) */
      formatDate?(iso: string): string
    }>(),
    { formatDate: undefined },
  )

  const emit = defineEmits<{
    'update:draft': [draft: AuditLogDraft]
    searchActors: [keyword: string]
    apply: []
    reset: []
    'update:page': [page: number]
    'update:itemsPerPage': [size: number]
    retry: []
    'update:expanded': [keys: readonly string[]]
    filterByActor: [row: R]
  }>()
</script>

<template>
  <div class="audit-log-viewer">
    <p class="text-body-2 text-medium-emphasis">{{ messages.readOnlyNote }}</p>
    <VAlert v-if="loadFailed" density="compact" type="error" variant="tonal">
      <div class="audit-log-viewer__alert">
        <span>{{ messages.loadFailed }}</span>
        <VBtn size="small" variant="text" @click="emit('retry')">{{ messages.retry }}</VBtn>
      </div>
    </VAlert>
    <AuditLogFilterBar
      :action-items="actionItems"
      :actor-hint="actorHint"
      :actor-items="actorItems"
      :actor-mode="actorMode"
      :actor-search-failed="actorSearchFailed"
      :actor-searching="actorSearching"
      :draft="draft"
      :filter-error="filterError"
      :messages="messages"
      :target-items="targetItems"
      @apply="emit('apply')"
      @reset="emit('reset')"
      @search-actors="emit('searchActors', $event)"
      @update:draft="emit('update:draft', $event)"
    />
    <div class="audit-log-viewer__head text-body-2 text-medium-emphasis">
      <span>{{ loadFailed ? '' : messages.total(itemsLength) }}</span>
      <span>{{ messages.fixedSortLabel }}</span>
    </div>
    <AuditLogTable
      :catalog="catalog"
      :expanded="expanded"
      :field-labels="fieldLabels"
      :filtered="filtered"
      :format-date="formatDate"
      :items-length="itemsLength"
      :items-per-page="itemsPerPage"
      :load-failed="loadFailed"
      :loading="loading"
      :messages="messages"
      :page="page"
      :rows="rows"
      @filter-by-actor="emit('filterByActor', $event)"
      @update:expanded="emit('update:expanded', $event)"
      @update:items-per-page="emit('update:itemsPerPage', $event)"
      @update:page="emit('update:page', $event)"
    />
  </div>
</template>

<style scoped>
  .audit-log-viewer {
    display: grid;
    gap: 12px;
  }
  .audit-log-viewer__alert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .audit-log-viewer__head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
  }
</style>
