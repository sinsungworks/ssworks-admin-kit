<script setup lang="ts">
  import { computed } from 'vue'
  import { VAlert, VAutocomplete, VBtn, VSelect, VTextField } from 'vuetify/components'
  import RemoteSearchField from '../common/RemoteSearchField.vue'
  import type { AuditFilterItem, AuditLogDraft, AuditLogMessages } from './audit-log.js'

  // 감사 로그 필터 카드(내부 부품). 입력값만 고치고, 조회는 [적용] · [초기화] · 번호 칸 Enter 에서만 일어난다(A1).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue 필터 카드
  // 바꾼 점: 주체 선택기(100명 목록) + 번호 칸 둘을 행위자 칸 하나로 — 서버 검색 자동완성 또는 번호 칸(A8).
  //   동작 값은 묶음 끝 점 · 개별 코드 그대로(A4). 버튼은 조회 중에도 막지 않는다 — 늦은 응답은 순번으로 버린다.
  //   행위자 칸은 공용 `RemoteSearchField`(3g 와 함께 씀 — 고른 항목 글자로 재검색 막기 · 선택 중 안내 줄).

  const props = defineProps<{
    draft: AuditLogDraft
    actorMode: 'search' | 'number'
    actorHint: string | null
    actorItems: readonly AuditFilterItem[]
    actorSearching: boolean
    actorSearchFailed: boolean
    actionItems: readonly AuditFilterItem[]
    targetItems: readonly AuditFilterItem[]
    filterError: string | null
    messages: AuditLogMessages
  }>()

  const emit = defineEmits<{
    'update:draft': [draft: AuditLogDraft]
    searchActors: [keyword: string]
    apply: []
    reset: []
  }>()

  function patch(key: keyof AuditLogDraft, value: unknown): void {
    emit('update:draft', { ...props.draft, [key]: typeof value === 'string' ? value : '' })
  }

  const actionItemList = computed(() => [...props.actionItems])
  const targetItemList = computed(() => [...props.targetItems])
</script>

<template>
  <div class="audit-log-filter">
    <div class="audit-log-filter__fields">
      <RemoteSearchField
        v-if="actorMode === 'search'"
        class="audit-log-filter__actor"
        :empty-text="messages.actorSearchEmpty"
        :failed="actorSearchFailed"
        :failed-text="messages.actorSearchFailed"
        hide-details
        :hint-text="messages.actorSearchHint"
        :items="actorItems"
        :label="messages.actorLabel"
        :model-value="draft.actorUserNo"
        name="actorUserNo"
        :placeholder="messages.allPlaceholder"
        :searching="actorSearching"
        @search="emit('searchActors', $event)"
        @update:model-value="patch('actorUserNo', $event)"
      />
      <VTextField
        v-else
        autocomplete="off"
        class="audit-log-filter__number"
        clearable
        density="compact"
        hide-details
        :label="messages.actorNumberLabel"
        :model-value="draft.actorUserNo"
        name="actorUserNo"
        :placeholder="messages.numberPlaceholder"
        variant="outlined"
        @keyup.enter="emit('apply')"
        @update:model-value="patch('actorUserNo', $event)"
      />
      <VAutocomplete
        autocomplete="off"
        class="audit-log-filter__action"
        clearable
        density="compact"
        hide-details
        item-title="title"
        item-value="value"
        :items="actionItemList"
        :label="messages.actionLabel"
        :model-value="draft.action === '' ? null : draft.action"
        name="action"
        :placeholder="messages.allPlaceholder"
        variant="outlined"
        @update:model-value="patch('action', $event)"
      />
      <VSelect
        class="audit-log-filter__target"
        clearable
        density="compact"
        hide-details
        item-title="title"
        item-value="value"
        :items="targetItemList"
        :label="messages.targetTypeLabel"
        :model-value="draft.targetType === '' ? null : draft.targetType"
        name="targetType"
        :placeholder="messages.allPlaceholder"
        variant="outlined"
        @update:model-value="patch('targetType', $event)"
      />
      <VTextField
        autocomplete="off"
        class="audit-log-filter__number"
        clearable
        density="compact"
        hide-details
        :label="messages.targetRefNoLabel"
        :model-value="draft.targetRefNo"
        name="targetRefNo"
        :placeholder="messages.numberPlaceholder"
        variant="outlined"
        @keyup.enter="emit('apply')"
        @update:model-value="patch('targetRefNo', $event)"
      />
      <VTextField
        class="audit-log-filter__date"
        density="compact"
        hide-details
        :label="messages.fromLabel"
        :model-value="draft.from"
        name="from"
        type="date"
        variant="outlined"
        @update:model-value="patch('from', $event)"
      />
      <VTextField
        class="audit-log-filter__date"
        density="compact"
        hide-details
        :label="messages.toLabel"
        :model-value="draft.to"
        name="to"
        type="date"
        variant="outlined"
        @update:model-value="patch('to', $event)"
      />
      <div class="audit-log-filter__buttons">
        <VBtn variant="text" @click="emit('reset')">{{ messages.reset }}</VBtn>
        <VBtn color="primary" variant="flat" @click="emit('apply')">{{ messages.apply }}</VBtn>
      </div>
    </div>
    <div class="audit-log-filter__hints text-body-2 text-medium-emphasis">
      <div>{{ messages.periodHint }}</div>
      <div>{{ messages.actionHint }}</div>
      <div v-if="actorHint">{{ actorHint }}</div>
    </div>
    <VAlert v-if="filterError" density="compact" type="warning" variant="tonal">
      {{ filterError }}
    </VAlert>
  </div>
</template>

<style scoped>
  .audit-log-filter {
    display: grid;
    gap: 12px;
  }
  .audit-log-filter__fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .audit-log-filter__actor {
    flex: 1 1 220px;
  }
  .audit-log-filter__action {
    flex: 1 1 280px;
  }
  .audit-log-filter__target {
    flex: 0 1 180px;
  }
  .audit-log-filter__number {
    flex: 0 1 150px;
  }
  .audit-log-filter__date {
    flex: 0 1 170px;
  }
  .audit-log-filter__buttons {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .audit-log-filter__hints {
    display: grid;
    gap: 2px;
  }
</style>
