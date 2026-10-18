<script setup lang="ts" generic="R extends AdminIpRule">
  import { computed } from 'vue'
  import { VAlert, VBtn, VChip } from 'vuetify/components'
  import type { AdminIpRule } from '@ssworks/admin-shared'
  import EmptyState from '../common/EmptyState.vue'
  import DataTableBody from '../table/DataTableBody.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import { ruleScopeSub, ruleScopeTitle, type IpAccessMessages } from './ip-access.js'

  // IP 규칙 목록(내부 부품) — 서버가 준 전량 한 표(I22).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue 규칙 표
  // 바꾼 점: 화면 slice 페이징을 걷었다(서버 전량 · 쪽 넘김 숨김). 범위 셀에 대상 이름 · 번호(대상 후보 — ④ T1),
  //   "편집 중" 표시, 관리 권한이 없으면 작업 열 자체가 없다.
  //
  // 🔴 대상이 지워진 규칙은 이름을 지어내지 않는다 — "팀 #9 — 대상 없음(아무에게도 걸리지 않음)"(hangang).
  // 🔴 머리 정렬을 모두 막는다 — 서버가 범위 → 번호로 고정한다. 화살표만 움직이면 거짓 신호다.
  // 🔴 수정 · 삭제 버튼의 접근 이름이 규칙을 가리킨다 — 같은 글자 버튼이 줄마다 있다.

  const props = defineProps<{
    rules: readonly R[]
    loading: boolean
    loadFailed: boolean
    canManage: boolean
    editing: R | 'new' | null
    busy: boolean
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    create: []
    edit: [rule: R]
    remove: [rule: R]
    retry: []
  }>()

  const headers = computed<AdminTableHeader[]>(() => [
    { title: props.messages.columnScope, key: 'scope', sortable: false },
    { title: props.messages.columnCidr, key: 'cidr', sortable: false, nowrap: true },
    { title: props.messages.columnDescription, key: 'description', sortable: false },
    ...(props.canManage
      ? [{ title: '', key: 'actions', sortable: false, align: 'end' as const }]
      : []),
  ])

  /** 슬롯 props 의 타입이 넓다 — 행 타입을 되찾는다 */
  const row = (item: unknown) => item as R
  const ruleLabel = (rule: R) => `${ruleScopeTitle(rule, props.messages)} ${rule.cidr}`
  const isEditing = (rule: R) =>
    props.editing !== null && props.editing !== 'new' && props.editing.ruleNo === rule.ruleNo
</script>

<template>
  <div class="ip-rule-table-wrap">
    <div class="ip-rule-table__head">
      <span class="text-subtitle-1 font-weight-medium">{{ messages.listTitle }}</span>
      <VBtn
        v-if="canManage"
        color="primary"
        :disabled="busy"
        variant="flat"
        @click="emit('create')"
      >
        {{ messages.createButton }}
      </VBtn>
    </div>
    <span class="text-body-2 text-medium-emphasis">{{ messages.sortLabel }}</span>
    <VAlert v-if="loadFailed" density="compact" type="error" variant="tonal">
      <div class="ip-rule-table__alert">
        <span>{{ messages.loadFailed }}</span>
        <VBtn size="small" variant="text" @click="emit('retry')">{{ messages.retry }}</VBtn>
      </div>
    </VAlert>
    <DataTableBody
      class="ip-rule-table"
      :headers="headers"
      hide-default-footer
      :items="rules"
      :items-length="rules.length"
      :loading="loading"
    >
      <template #item.scope="{ item }">
        <div class="ip-rule-table__scope">
          <span>{{ ruleScopeTitle(row(item), messages) }}</span>
          <VChip v-if="isEditing(row(item))" color="primary" size="x-small" variant="tonal">
            {{ messages.editing }}
          </VChip>
        </div>
        <div v-if="ruleScopeSub(row(item), messages)" class="ip-rule-table__sub">
          {{ ruleScopeSub(row(item), messages) }}
        </div>
      </template>
      <template #item.cidr="{ item }">
        <span class="ip-rule-table__cidr">{{ row(item).cidr }}</span>
      </template>
      <template #item.description="{ item }">{{ row(item).description ?? '—' }}</template>
      <template #item.actions="{ item }">
        <div class="ip-rule-table__actions">
          <VBtn
            :aria-label="messages.editLabel(ruleLabel(row(item)))"
            :disabled="busy"
            size="small"
            variant="text"
            @click="emit('edit', row(item))"
          >
            {{ messages.edit }}
          </VBtn>
          <VBtn
            :aria-label="messages.removeLabel(ruleLabel(row(item)))"
            color="error"
            :disabled="busy"
            size="small"
            variant="text"
            @click="emit('remove', row(item))"
          >
            {{ messages.remove }}
          </VBtn>
        </div>
      </template>
      <template #no-data>
        <EmptyState
          v-if="!loadFailed"
          :can-create="canManage"
          :create-label="messages.createButton"
          :title="messages.emptyTitle"
          @create="emit('create')"
        />
      </template>
    </DataTableBody>
  </div>
</template>

<style scoped>
  .ip-rule-table-wrap {
    display: grid;
    gap: 8px;
  }
  .ip-rule-table__head,
  .ip-rule-table__alert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ip-rule-table__scope {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .ip-rule-table__sub {
    font-size: 0.78rem;
    opacity: 0.7;
  }
  .ip-rule-table__cidr {
    font-family: Consolas, Monaco, monospace;
    white-space: nowrap;
  }
  .ip-rule-table__actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }
</style>
