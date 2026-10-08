<script setup lang="ts" generic="K extends string, R extends AdminLegalHistoryItem">
  import { computed } from 'vue'
  import {
    VAlert,
    VBtn,
    VCard,
    VChip,
    VDataTable,
    VProgressLinear,
    VTab,
    VTabs,
  } from 'vuetify/components'
  import type { AdminLegalDocument, AdminLegalHistoryItem } from '@ssworks/admin-shared'
  import type { LegalDetailDialogBindings } from '../../composables/useLegalDocuments.js'
  import type { ConfirmDialogBindings } from '../../composables/useWriteFlow.js'
  import { formatDateTime } from '../../utils/format-date-time.js'
  import BaseDialog from '../common/BaseDialog.vue'
  import ConfirmDialog from '../common/ConfirmDialog.vue'
  import MarkdownEditor from '../markdown/MarkdownEditor.vue'
  import MarkdownView from '../markdown/MarkdownView.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import {
    DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,
    publisherLabel,
    shortHash,
    type LegalDocumentEditorMessages,
    type LegalKindOption,
    type LegalPublishBlock,
  } from './legal-document.js'

  // 약관 화면 한 벌 — 종류 탭 · 시행 정보 · 편집기 | 미리보기 · 발행 · 이력 · 대화상자 셋(발행 확인 · 초안 버리기 · 판 원문).
  // 흐름은 `useLegalDocuments` 가 갖고, 이 컴포넌트는 그 바인딩(`legal.editor.value`)을 받아 그리고 이벤트만 낸다.
  //
  // 정본: ssworks-gise-home apps/admin/src/pages/settings/legal.vue 템플릿(배치 — 3e ④ S1)
  //       + ssworks-axion-admin packages/frontend/src/pages/settings/legal.vue(시행 정보 · 해시 8자 · 발행자 대체 표기)
  // 바꾼 점:
  //  - axion 의 현재본 카드를 시행 정보 한 줄로 바꿨다 — 본문은 편집기 · 미리보기에 이미 보인다.
  //  - 이력 상세를 행 클릭(axion)이 아니라 [보기] 버튼(gise)으로 연다 — 키보드로 닿는다.
  //  - 발행이 막힌 이유를 버튼 옆 글자로(D16), 동시 발행 충돌 안내(⑤ V2).
  //  - 이력 표에 소비자 열(`historyHeaders` + `item.<key>` 슬롯) — axion 의 동의 건수 같은 것.
  //  - `VSnackbar` · 페이지 제목 · 카드 틀이 없다 — 알림은 `onDone` 으로 페이지가, 틀은 페이지 레이아웃이 맡는다.
  //
  // 🔴 탭은 `:model-value="kind"` + `@update:model-value` 로만 묶는다(D7). 부모가 `kind` 를 바꿔야만 탭이 움직이므로
  //    확인을 취소했을 때 탭을 되돌리는 코드가 없다. `v-model` 이면 먼저 움직인 뒤 되돌려야 하고, 그 되돌리는 경로가 곧
  //    초안을 버릴 자리가 된다(gise).
  // 🔴 편집기는 불러오는 동안에도 숨기지 않고 `readonly` 로 둔다 — `MarkdownEditor` 를 `v-if` 뒤에 두지 않는다.
  // 🔴 실패 중에는 시행 정보 줄과 이력의 「시행 중」 칩을 숨긴다(D19) — 직전 값이 낡았을 수 있다.

  const props = withDefaults(
    defineProps<{
      kinds: readonly LegalKindOption<K>[]
      kind: K
      current: AdminLegalDocument | null
      loading: boolean
      loadFailed: boolean
      /** 초안 */
      modelValue: string
      readonly: boolean
      canPublish: boolean
      publishBlock: LegalPublishBlock | null
      submitting: boolean
      conflict: boolean
      history: readonly R[]
      historyLoading: boolean
      historyFailed: boolean
      publishDialog: ConfirmDialogBindings
      discardDialog: ConfirmDialogBindings
      detailDialog: LegalDetailDialogBindings<R>
      /** 이력 표에 더할 열 — [보기] 앞에 붙는다. 값은 슬롯 `item.<key>`(없으면 원값) */
      historyHeaders?: readonly AdminTableHeader[]
      /** 날짜 표기. 기본 `YYYY-MM-DD HH:mm`(현지 시각) — `SessionTable` 과 같은 이름 · 같은 기본값 */
      formatDate?(iso: string): string
      editorHeight?: string
      messages?: Partial<LegalDocumentEditorMessages>
    }>(),
    {
      historyHeaders: () => [],
      formatDate: undefined,
      editorHeight: '420px',
      messages: () => ({}),
    },
  )

  const emit = defineEmits<{
    selectKind: [kind: K]
    'update:modelValue': [value: string]
    publish: []
    reloadCurrent: []
    reloadHistory: []
    openDetail: [row: R]
    dismissConflict: []
  }>()

  defineSlots<{ [name: `item.${string}`]: (props: { item: R }) => unknown }>()

  const text = computed<LegalDocumentEditorMessages>(() => ({
    ...DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES,
    ...props.messages,
  }))

  const kindLabel = computed(
    () => props.kinds.find((option) => option.value === props.kind)?.label ?? props.kind,
  )

  const format = (iso: string) => (props.formatDate ? props.formatDate(iso) : formatDateTime(iso))

  const status = computed<'loading' | 'failed' | 'none' | 'current'>(() => {
    if (props.loading) return 'loading'
    if (props.loadFailed) return 'failed'
    return props.current == null ? 'none' : 'current'
  })

  const currentLine = computed(() => {
    const current = props.current
    if (current == null) return ''
    return text.value.currentLine(
      format(current.publishedAt),
      publisherLabel(current.publishedByUserName, current.publishedByUserNo),
      shortHash(current.contentHash),
    )
  })

  const conflictText = computed(() =>
    text.value.conflict(
      props.current != null && !props.loadFailed && !props.loading
        ? format(props.current.publishedAt)
        : null,
    ),
  )

  const blockedText = computed(() => {
    const block = props.publishBlock
    return block == null || block === 'loading' ? '' : text.value.blocked[block]
  })

  /** 🔴 실패 중에는 칩도 숨긴다(D19) */
  const currentNo = computed(() => (props.loadFailed ? null : (props.current?.legalDocNo ?? null)))
  const isCurrentRow = (row: R) => currentNo.value != null && row.legalDocNo === currentNo.value

  const headers = computed<AdminTableHeader[]>(() => [
    { title: text.value.headers.legalDocNo, key: 'legalDocNo', sortable: false, width: 140 },
    { title: text.value.headers.publishedAt, key: 'publishedAt', sortable: false, width: 160 },
    { title: text.value.headers.publisher, key: 'publisher', sortable: false },
    { title: text.value.headers.contentHash, key: 'contentHash', sortable: false, width: 110 },
    ...props.historyHeaders.map((header) => ({ sortable: false, ...header })),
    { title: '', key: 'actions', sortable: false, align: 'end', width: 90 },
  ])

  const rows = computed(() => props.history as R[])
  /** bigint 는 Vue 키 타입이 아니다 — 문자열로 */
  const rowKey = (row: R) => String(row.legalDocNo)

  function rawValue(row: R, key: string): string {
    const value = (row as unknown as Record<string, unknown>)[key]
    return value == null ? '' : String(value)
  }

  const detailMeta = computed(() => {
    const row = props.detailDialog.row
    if (row == null) return ''
    return text.value.detailMeta(
      row.legalDocNo,
      format(row.publishedAt),
      publisherLabel(row.publishedByUserName, row.publishedByUserNo),
      shortHash(row.contentHash),
    )
  })

  /** `VTabs` 의 페이로드는 unknown 이다 — 종류 목록 안으로 좁혀서 낸다 */
  function onTab(value: unknown): void {
    const next = props.kinds.find((option) => option.value === value)
    if (next == null || next.value === props.kind) return
    emit('selectKind', next.value)
  }
</script>

<template>
  <div class="legal-document-editor">
    <VTabs
      :aria-label="text.kindTabs"
      density="compact"
      :model-value="kind"
      @update:model-value="onTab"
    >
      <VTab
        v-for="option in kinds"
        :key="option.value"
        :disabled="submitting"
        :value="option.value"
      >
        {{ option.label }}
      </VTab>
    </VTabs>

    <VProgressLinear v-if="status === 'loading'" indeterminate />
    <VAlert v-else-if="status === 'failed'" density="compact" type="error" variant="tonal">
      {{ text.loadFailed }}
      <template #append>
        <VBtn size="small" variant="text" @click="emit('reloadCurrent')">{{ text.retry }}</VBtn>
      </template>
    </VAlert>
    <VAlert v-else-if="status === 'none'" density="compact" type="info" variant="tonal">
      {{ text.notPublished(kindLabel) }}
    </VAlert>
    <div v-else class="legal-document-editor__current">
      <VChip color="primary" size="small" variant="tonal">{{ text.currentChip }}</VChip>
      <span>{{ currentLine }}</span>
    </div>

    <VAlert
      v-if="conflict"
      closable
      density="compact"
      type="warning"
      variant="tonal"
      @click:close="emit('dismissConflict')"
    >
      {{ conflictText }}
    </VAlert>

    <div class="legal-document-editor__split">
      <MarkdownEditor
        :height="editorHeight"
        :label="text.editorLabel(kindLabel)"
        :model-value="modelValue"
        :readonly="readonly"
        @update:model-value="(value: string) => emit('update:modelValue', value)"
      />
      <VCard
        :aria-label="text.preview"
        class="legal-document-editor__preview"
        role="region"
        :style="{ height: editorHeight }"
        variant="outlined"
      >
        <MarkdownView link-target="_blank" :source="modelValue">
          <template #empty>{{ text.previewEmpty }}</template>
        </MarkdownView>
      </VCard>
    </div>

    <div class="legal-document-editor__publish">
      <span v-if="blockedText" class="legal-document-editor__hint">{{ blockedText }}</span>
      <VBtn color="primary" :disabled="!canPublish" :loading="submitting" @click="emit('publish')">
        {{ text.publish }}
      </VBtn>
    </div>

    <section :aria-label="text.historyTitle" class="legal-document-editor__history">
      <div class="legal-document-editor__history-title">{{ text.historyTitle }}</div>
      <VAlert v-if="historyFailed" density="compact" type="warning" variant="tonal">
        {{ text.historyFailed }}
        <template #append>
          <VBtn size="small" variant="text" @click="emit('reloadHistory')">{{ text.retry }}</VBtn>
        </template>
      </VAlert>
      <VDataTable
        density="comfortable"
        :headers="headers"
        :item-value="rowKey"
        :items="rows"
        :items-per-page="10"
        :loading="historyLoading"
        :no-data-text="historyFailed ? '' : text.historyEmpty"
      >
        <template #item.legalDocNo="{ item }">
          <span class="legal-document-editor__no">
            <span>{{ item.legalDocNo }}</span>
            <VChip v-if="isCurrentRow(item)" color="primary" size="x-small" variant="tonal">
              {{ text.currentChip }}
            </VChip>
          </span>
        </template>
        <template #item.publishedAt="{ item }">{{ format(item.publishedAt) }}</template>
        <template #item.publisher="{ item }">
          {{ publisherLabel(item.publishedByUserName, item.publishedByUserNo) }}
        </template>
        <template #item.contentHash="{ item }">
          <code>{{ shortHash(item.contentHash) }}</code>
        </template>
        <template
          v-for="header in historyHeaders"
          :key="header.key"
          #[`item.${header.key}`]="{ item }"
        >
          <slot :item="item" :name="`item.${header.key}`">{{ rawValue(item, header.key) }}</slot>
        </template>
        <template #item.actions="{ item }">
          <VBtn
            :aria-label="text.viewLabel(item.legalDocNo)"
            size="small"
            variant="text"
            @click="emit('openDetail', item)"
          >
            {{ text.view }}
          </VBtn>
        </template>
      </VDataTable>
    </section>

    <ConfirmDialog v-bind="publishDialog" />
    <ConfirmDialog v-bind="discardDialog" />
    <BaseDialog
      :confirm-label="text.close"
      max-width="900"
      :model-value="detailDialog.modelValue"
      :title="text.detailTitle"
      type="ok"
      @update:model-value="detailDialog['onUpdate:modelValue']"
    >
      <div class="legal-document-editor__detail">
        <div v-if="detailMeta" class="legal-document-editor__meta">{{ detailMeta }}</div>
        <VProgressLinear v-if="detailDialog.loading" indeterminate />
        <VAlert v-else-if="detailDialog.failed" density="compact" type="error" variant="tonal">
          {{ text.detailFailed }}
          <template #append>
            <VBtn size="small" variant="text" @click="detailDialog.onRetry()">{{
              text.retry
            }}</VBtn>
          </template>
        </VAlert>
        <MarkdownView v-else link-target="_blank" :source="detailDialog.document?.body ?? null" />
      </div>
    </BaseDialog>
  </div>
</template>

<style scoped>
  .legal-document-editor {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .legal-document-editor__current {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .legal-document-editor__split {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
    gap: 12px;
  }

  .legal-document-editor__split > * {
    min-width: 0;
  }

  .legal-document-editor__preview {
    padding: 16px;
    overflow-y: auto;
  }

  .legal-document-editor__publish {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px 16px;
  }

  .legal-document-editor__hint,
  .legal-document-editor__meta {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .legal-document-editor__history {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .legal-document-editor__history-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .legal-document-editor__no {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .legal-document-editor__detail {
    display: grid;
    gap: 12px;
    width: 100%;
  }
</style>
