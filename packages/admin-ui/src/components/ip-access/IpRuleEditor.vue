<script setup lang="ts">
  import { computed } from 'vue'
  import { VBtn, VSelect, VTextField } from 'vuetify/components'
  import {
    IP_CIDR_MAX_LENGTH,
    IP_RULE_DESCRIPTION_MAX_LENGTH,
    IP_SCOPE_TYPES,
    type AdminIpRule,
    type IpScopeType,
  } from '@ssworks/admin-shared'
  import IpTargetField from './IpTargetField.vue'
  import {
    ruleScopeTitle,
    type IpAccessMessages,
    type IpRuleForm,
    type IpRuleFormField,
    type IpSelectItem,
  } from './ip-access.js'

  // IP 규칙 편집 패널(내부 부품) — 표 위 인라인 패널이다(⑦ E1).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue 편집 카드
  // 바꾼 점: 대상 칸을 후보 고르기로(IpTargetField), CIDR 오류는 blur · 저장 때(서버와 같은 파서 — I19), 제출은 form submit.
  //
  // 🔴 대화상자가 아니다 — 재인증 창과 겹치고, 재인증 창이 닫히면 입력이 사라지던 사고가 있었다(hangang).
  // 🔴 전체 범위면 대상 칸을 그리지 않는다 — 전체 ⟺ 대상 없음이 서버 불변식이다.
  // 🔴 저장 버튼은 :disabled 와 :loading 한 벌 — :loading 은 클릭을 안 막는다.

  const props = defineProps<{
    editing: 'new' | AdminIpRule
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
    messages: IpAccessMessages
  }>()

  const emit = defineEmits<{
    'update:form': [form: IpRuleForm]
    cidrBlur: []
    save: []
    cancel: []
    searchUsers: [keyword: string]
  }>()

  const title = computed(() =>
    props.editing === 'new' ? props.messages.editorCreateTitle : props.messages.editorEditTitle,
  )
  const current = computed(() =>
    props.editing === 'new'
      ? null
      : `${ruleScopeTitle(props.editing, props.messages)} · ${props.editing.cidr}`,
  )
  const scopeItemList = computed(() => [...props.scopeItems])
  const targetScope = computed(() =>
    props.form.scopeType === 'global' ? null : props.form.scopeType,
  )
  const scopeTypes: readonly string[] = IP_SCOPE_TYPES

  function errors(key: IpRuleFormField): string[] {
    return [...(props.fieldErrors[key] ?? [])]
  }

  function patch(key: 'scopeRefNo' | 'cidr' | 'description', value: unknown): void {
    emit('update:form', { ...props.form, [key]: typeof value === 'string' ? value : '' })
  }

  /** 범위를 바꾸면 대상 비우기는 흐름(useIpAccessRules)이 한다 — 여기는 값만 올린다 */
  function patchScope(value: unknown): void {
    if (typeof value === 'string' && scopeTypes.includes(value)) {
      emit('update:form', { ...props.form, scopeType: value as IpScopeType })
    }
  }
</script>

<template>
  <section :aria-label="title" class="ip-rule-editor">
    <div class="ip-rule-editor__title">
      <span class="text-subtitle-1 font-weight-medium">{{ title }}</span>
      <span v-if="current" class="text-body-2 text-medium-emphasis">{{ current }}</span>
    </div>
    <form class="ip-rule-editor__form" novalidate @submit.prevent="emit('save')">
      <div class="ip-rule-editor__fields">
        <VSelect
          class="ip-rule-editor__scope"
          density="compact"
          :disabled="busy"
          :error-messages="errors('scopeType')"
          item-title="title"
          item-value="value"
          :items="scopeItemList"
          :label="messages.scopeLabel"
          :model-value="form.scopeType"
          name="scopeType"
          variant="outlined"
          @update:model-value="patchScope"
        />
        <IpTargetField
          v-if="targetScope"
          class="ip-rule-editor__target"
          :disabled="busy"
          :error-messages="errors('scopeRefNo')"
          :messages="messages"
          :scope-type="targetScope"
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
          :value="form.scopeRefNo"
          @search-users="emit('searchUsers', $event)"
          @update:value="patch('scopeRefNo', $event)"
        />
        <VTextField
          autocomplete="off"
          class="ip-rule-editor__cidr"
          density="compact"
          :disabled="busy"
          :error-messages="errors('cidr')"
          :hint="messages.cidrHint"
          :label="messages.cidrLabel"
          :maxlength="IP_CIDR_MAX_LENGTH"
          :model-value="form.cidr"
          name="cidr"
          persistent-hint
          variant="outlined"
          @blur="emit('cidrBlur')"
          @update:model-value="patch('cidr', $event)"
        />
        <VTextField
          autocomplete="off"
          class="ip-rule-editor__description"
          counter
          density="compact"
          :disabled="busy"
          :error-messages="errors('description')"
          :label="messages.descriptionLabel"
          :maxlength="IP_RULE_DESCRIPTION_MAX_LENGTH"
          :model-value="form.description"
          name="description"
          variant="outlined"
          @update:model-value="patch('description', $event)"
        />
      </div>
      <div class="ip-rule-editor__actions">
        <VBtn color="primary" :disabled="busy" :loading="submitting" type="submit" variant="flat">
          {{ messages.save }}
        </VBtn>
        <VBtn :disabled="busy" variant="text" @click="emit('cancel')">{{ messages.cancel }}</VBtn>
      </div>
    </form>
  </section>
</template>

<style scoped>
  .ip-rule-editor {
    display: grid;
    gap: 10px;
    padding: 12px 16px;
    border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
  }
  .ip-rule-editor__title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }
  .ip-rule-editor__form {
    display: grid;
    gap: 10px;
  }
  .ip-rule-editor__fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
  }
  .ip-rule-editor__scope {
    flex: 0 1 150px;
  }
  .ip-rule-editor__target {
    flex: 1 1 240px;
  }
  .ip-rule-editor__cidr {
    flex: 1 1 240px;
  }
  .ip-rule-editor__description {
    flex: 2 1 280px;
  }
  .ip-rule-editor__actions {
    display: flex;
    gap: 8px;
  }
</style>
