<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { VAlert, VAutocomplete, VBtn, VSelect, VTextField } from 'vuetify/components'
  import type { AuditFilterItem, AuditLogDraft, AuditLogMessages } from './audit-log.js'

  // 감사 로그 필터 카드(내부 부품). 입력값만 고치고, 조회는 [적용] · [초기화] · 번호 칸 Enter 에서만 일어난다(A1).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue 필터 카드
  // 바꾼 점: 주체 선택기(100명 목록) + 번호 칸 둘을 행위자 칸 하나로 — 서버 검색 자동완성 또는 번호 칸(A8).
  //   동작 값은 묶음 끝 점 · 개별 코드 그대로(A4). 버튼은 조회 중에도 막지 않는다 — 늦은 응답은 순번으로 버린다.

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

  const actorItemList = computed(() => [...props.actorItems])
  const actionItemList = computed(() => [...props.actionItems])
  const targetItemList = computed(() => [...props.targetItems])

  const actorSearchText = ref('')
  const selectedActorTitle = computed(
    () => props.actorItems.find((item) => item.value === props.draft.actorUserNo)?.title ?? null,
  )

  /**
   * 🔴 항목을 고르면 VAutocomplete 가 모델을 바꾼 바로 뒤에 검색어를 그 항목 글자로 바꾸며 update:search 를 낸다.
   *   그때는 부모가 아직 다시 그리기 전이라 draft 가 옛 값이다 — selectedActorTitle 만으로는 못 막는다.
   *   그래서 고른 항목의 글자를 모델 변경 때 먼저 적어 둔다(update:modelValue 가 update:search 보다 앞선다).
   *   놓치면 사람을 고를 때마다 그 글자로 검색 요청이 한 번 더 나가고(64자 넘으면 400) 후보가 그 사람 하나로 접힌다.
   */
  let pickedTitle: string | null = null

  function onActorModel(value: unknown): void {
    pickedTitle =
      typeof value === 'string'
        ? (props.actorItems.find((item) => item.value === value)?.title ?? null)
        : null
    patch('actorUserNo', value)
  }

  function onActorSearch(value: string | null): void {
    const keyword = value ?? ''
    if (keyword === pickedTitle || keyword === selectedActorTitle.value) {
      // 고른 항목 글자는 사람이 친 검색어가 아니다 — 검색 안내 줄이 그 글자를 검색어로 알지 않게 비운다
      actorSearchText.value = ''
      return
    }
    actorSearchText.value = keyword
    emit('searchActors', keyword)
  }

  const actorNoData = computed(() => {
    if (props.actorSearchFailed) return props.messages.actorSearchFailed
    return actorSearchText.value.trim() === ''
      ? props.messages.actorSearchHint
      : props.messages.actorSearchEmpty
  })

  /**
   * 🔴 고른 사람이 목록에 늘 붙어 있어 items 가 비지 않는다 — Vuetify 는 no-data 를 items 가 빌 때만 그린다.
   *   그 상태에서 "맞는 사람 없음" · "검색 실패"가 사라지면 조용한 실패가 된다(A8 · C7). 그래서 메뉴 맨 위 줄로 따로 그린다.
   *   items 가 비면 no-data-text 가 이미 같은 글자를 그리므로 겹쳐 그리지 않는다.
   */
  const actorStatusLine = computed<string | null>(() => {
    if (actorItemList.value.length === 0) return null
    if (props.actorSearchFailed) return props.messages.actorSearchFailed
    if (props.actorSearching || actorSearchText.value.trim() === '') return null
    const others = props.actorItems.some((item) => item.value !== props.draft.actorUserNo)
    return others ? null : props.messages.actorSearchEmpty
  })
</script>

<template>
  <div class="audit-log-filter">
    <div class="audit-log-filter__fields">
      <VAutocomplete
        v-if="actorMode === 'search'"
        autocomplete="off"
        class="audit-log-filter__actor"
        clearable
        density="compact"
        hide-details
        item-title="title"
        item-value="value"
        :items="actorItemList"
        :label="messages.actorLabel"
        :loading="actorSearching"
        :model-value="draft.actorUserNo === '' ? null : draft.actorUserNo"
        name="actorUserNo"
        no-filter
        :no-data-text="actorNoData"
        :placeholder="messages.allPlaceholder"
        variant="outlined"
        @update:model-value="onActorModel"
        @update:search="onActorSearch"
      >
        <template v-if="actorStatusLine" #prepend-item>
          <div
            class="audit-log-filter__actor-status text-body-2 text-medium-emphasis"
            role="status"
          >
            {{ actorStatusLine }}
          </div>
        </template>
      </VAutocomplete>
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
  .audit-log-filter__actor-status {
    padding: 8px 16px;
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
