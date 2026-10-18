<script setup lang="ts" generic="R extends AdminIpRule">
  import { VAlert } from 'vuetify/components'
  import type { AdminIpPreviewItem, AdminIpRule } from '@ssworks/admin-shared'
  import type {
    ConfirmDialogBindings,
    ReauthDialogBindings,
  } from '../../composables/useWriteFlow.js'
  import ConfirmDialog from '../common/ConfirmDialog.vue'
  import ReauthDialog from '../common/ReauthDialog.vue'
  import IpPreviewCard from './IpPreviewCard.vue'
  import IpRuleEditor from './IpRuleEditor.vue'
  import IpRuleTable from './IpRuleTable.vue'
  import type {
    IpAccessAlert,
    IpAccessMessages,
    IpPreviewView,
    IpRuleForm,
    IpSelectItem,
  } from './ip-access.js'

  // IP 접근 제어 화면 한 벌 — 알림 → 접속 상태와 변경 영향 카드(늘) → 편집 패널(열렸을 때) → 규칙 목록 + 창 셋(I1).
  // 흐름은 `useIpAccessRules` 가 갖고, 이 컴포넌트는 그 바인딩(`ip.manager.value`)을 받아 그리고 이벤트만 낸다.
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue 템플릿
  // 바꾼 점: 페이지 제목 · 바깥 카드가 없다(C6), 성공 알림이 없다(onDone — I23), 확인 · 재인증 · 고친 값 버리기 창이 이 안에
  //   있다(3e D17 와 같음). 알림은 빨강(409 자기 잠금) · 노랑(revision 충돌 · 미리보기 없이 저장)만.

  defineProps<{
    rules: readonly R[]
    loading: boolean
    loadFailed: boolean
    canManage: boolean
    editing: R | 'new' | null
    form: IpRuleForm
    fieldErrors: Readonly<Record<string, readonly string[]>>
    scopeItems: readonly IpSelectItem[]
    teamMode: 'select' | 'number'
    teamItems: readonly IpSelectItem[]
    teamsLoading: boolean
    teamsFailed: boolean
    teamHint: string | null
    userMode: 'search' | 'number'
    userItems: readonly IpSelectItem[]
    usersSearching: boolean
    usersFailed: boolean
    userHint: string | null
    submitting: boolean
    busy: boolean
    preview: IpPreviewView
    lockedItems: readonly AdminIpPreviewItem[]
    changedItems: readonly AdminIpPreviewItem[]
    isSelf: (item: AdminIpPreviewItem) => boolean
    globalAllowRemoval: boolean
    alerts: readonly IpAccessAlert[]
    confirmDialog: ConfirmDialogBindings
    reauthDialog: ReauthDialogBindings
    discardDialog: ConfirmDialogBindings
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    retry: []
    openCreate: []
    openEdit: [rule: R]
    cancel: []
    save: []
    remove: [rule: R]
    'update:form': [form: IpRuleForm]
    cidrBlur: []
    searchUsers: [keyword: string]
    dismissAlert: [index: number]
  }>()
</script>

<template>
  <div class="ip-access-manager">
    <VAlert
      v-for="(alert, index) in alerts"
      :key="`${alert.kind}-${alert.text}`"
      closable
      density="compact"
      :type="alert.kind"
      variant="tonal"
      @click:close="emit('dismissAlert', index)"
    >
      {{ alert.text }}
    </VAlert>
    <IpPreviewCard
      :changed-items="changedItems"
      :global-allow-removal="globalAllowRemoval"
      :is-self="isSelf"
      :locked-items="lockedItems"
      :messages="messages"
      :preview="preview"
    />
    <IpRuleEditor
      v-if="editing !== null"
      :busy="busy"
      :editing="editing"
      :field-errors="fieldErrors"
      :form="form"
      :messages="messages"
      :scope-items="scopeItems"
      :submitting="submitting"
      :team-hint="teamHint"
      :team-items="teamItems"
      :team-mode="teamMode"
      :teams-failed="teamsFailed"
      :teams-loading="teamsLoading"
      :user-hint="userHint"
      :user-items="userItems"
      :user-mode="userMode"
      :users-failed="usersFailed"
      :users-searching="usersSearching"
      @cancel="emit('cancel')"
      @cidr-blur="emit('cidrBlur')"
      @save="emit('save')"
      @search-users="emit('searchUsers', $event)"
      @update:form="emit('update:form', $event)"
    />
    <IpRuleTable
      :busy="busy"
      :can-manage="canManage"
      :editing="editing"
      :load-failed="loadFailed"
      :loading="loading"
      :messages="messages"
      :rules="rules"
      @create="emit('openCreate')"
      @edit="emit('openEdit', $event)"
      @remove="emit('remove', $event)"
      @retry="emit('retry')"
    />
    <ConfirmDialog v-bind="confirmDialog" />
    <ReauthDialog v-bind="reauthDialog" />
    <ConfirmDialog v-bind="discardDialog" />
  </div>
</template>

<style scoped>
  .ip-access-manager {
    display: grid;
    gap: 12px;
  }
</style>
