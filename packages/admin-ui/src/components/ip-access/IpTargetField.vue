<script setup lang="ts">
  import { computed } from 'vue'
  import { VSelect, VTextField } from 'vuetify/components'
  import RemoteSearchField from '../common/RemoteSearchField.vue'
  import type { IpAccessMessages, IpSelectItem } from './ip-access.js'

  // IP 규칙의 대상 칸(내부 부품) — 팀은 경로 select, 사용자는 서버 검색, 권한 · 어댑터가 없으면 번호 칸(④ T1 · I20).
  //
  // 정본: kim5257-crm-v5 apps/base/frontend/src/pages/settings/ip_access_control.vue 의 대상 고르기(팀 경로 · 사용자 목록)
  // 바꾼 점: 사용자 500명 목록 대신 서버 검색(공용 RemoteSearchField — C8), 후보 실패는 칸 아래 문구(번호 칸으로 바꾸지 않는다),
  //   권한 게터가 거짓이면 번호 칸 + 이유(C9). hangang 은 번호를 직접 쳤다.

  const props = defineProps<{
    scopeType: 'team' | 'user'
    value: string
    errorMessages: readonly string[]
    disabled: boolean
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
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    'update:value': [value: string]
    searchUsers: [keyword: string]
  }>()

  const teamItemList = computed(() => [...props.teamItems])
  const errors = computed(() => [...props.errorMessages])
  const numberMode = computed(() =>
    props.scopeType === 'team' ? props.teamMode === 'number' : props.userMode === 'number',
  )
  const hint = computed(() => (props.scopeType === 'team' ? props.teamHint : props.userHint))

  function update(value: unknown): void {
    emit('update:value', typeof value === 'string' ? value : '')
  }
</script>

<template>
  <div class="ip-target-field">
    <VTextField
      v-if="numberMode"
      autocomplete="off"
      density="compact"
      :disabled="disabled"
      :error-messages="errors"
      :label="scopeType === 'team' ? messages.teamNumberLabel : messages.userNumberLabel"
      :model-value="value"
      name="scopeRefNo"
      :placeholder="messages.numberPlaceholder"
      variant="outlined"
      @update:model-value="update"
    />
    <VSelect
      v-else-if="scopeType === 'team'"
      density="compact"
      :disabled="disabled"
      :error-messages="errors"
      item-title="title"
      item-value="value"
      :items="teamItemList"
      :label="messages.teamLabel"
      :loading="teamsLoading"
      :model-value="value === '' ? null : value"
      name="scopeRefNo"
      variant="outlined"
      @update:model-value="update"
    />
    <RemoteSearchField
      v-else
      :disabled="disabled"
      :empty-text="messages.userSearchEmpty"
      :error-messages="errorMessages"
      :failed="usersFailed"
      :failed-text="messages.userSearchFailed"
      :hint-text="messages.userSearchHint"
      :items="userItems"
      :label="messages.userLabel"
      :model-value="value"
      name="scopeRefNo"
      :searching="usersSearching"
      @search="emit('searchUsers', $event)"
      @update:model-value="update"
    />
    <p
      v-if="scopeType === 'team' && !numberMode && teamsFailed"
      class="ip-target-field__note"
      role="alert"
    >
      {{ messages.teamsFailed }}
    </p>
    <p v-if="hint" class="ip-target-field__note">{{ hint }}</p>
  </div>
</template>

<style scoped>
  .ip-target-field {
    display: grid;
    gap: 4px;
  }
  .ip-target-field__note {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }
</style>
