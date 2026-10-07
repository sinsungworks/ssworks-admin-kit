<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue'
  import { VBtn } from 'vuetify/components'
  import { TEAM_NAME_MAX_LENGTH } from '@ssworks/admin-shared'
  import type { TeamCommitSource } from './team-tree.js'

  // 노드 안 이름 입력칸 — TeamTree 내부용(내보내지 않는다).
  //
  // 정본: ssworks-axion-admin packages/frontend/src/components/team/TeamTreeNode.vue(인라인 편집 · `@keydown.stop`)
  // 바꾼 점:
  //  - 이름 · 저장 중 · 오류는 부모(`useTeamTree` 의 `edit`)가 가진다 — 재조회로 트리가 다시 그려져도 친 글자가 남는다.
  //  - 바깥 누르기 = 저장(3d ⑦ — axion · crm 과 같음). 그 함정 넷을 여기서 막는다(스펙 D5).
  //  - 한글 조합 중 Enter 를 저장으로 받지 않는다.

  const props = defineProps<{
    name: string
    pending: boolean
    error: string | null
    /** 열릴 때 · 다시 그려진 뒤 포커스. 'select' 는 글자 전체 선택 */
    focus: false | 'select' | 'end'
    labels: { input: string; save: string; cancel: string }
  }>()

  const emit = defineEmits<{
    input: [name: string]
    commit: [source: TeamCommitSource]
    cancel: []
    focused: []
  }>()

  const field = ref<HTMLInputElement | null>(null)
  /** 🔴 Esc · ✕ 로 취소한 뒤 입력칸이 사라질 때의 포커스 빠짐은 저장이 아니다 */
  let cancelled = false

  function applyFocus(mode: false | 'select' | 'end'): void {
    const el = field.value
    if (mode === false || el == null) return
    el.focus()
    if (mode === 'select') el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
    emit('focused')
  }

  onMounted(() => applyFocus(props.focus))
  watch(
    () => props.focus,
    (mode) => applyFocus(mode),
  )

  function cancel(): void {
    cancelled = true
    emit('cancel')
  }

  function onKeydown(event: KeyboardEvent): void {
    // 🔴 키를 트리로 올려 보내지 않는다 — he-tree 루트가 Space · Enter · 방향키를 preventDefault 해 입력칸에서 공백이
    //    안 먹는다(스펙 D6, axion 이 겪음)
    event.stopPropagation()
    // 🔴 한글 조합 중 Enter 는 조합 확정이다 — 저장으로 받으면 마지막 글자가 빠진 이름이 나간다
    if (event.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      emit('commit', 'enter')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  function onBlur(): void {
    if (cancelled || props.pending) return
    // 🔴 창 자체가 포커스를 잃은 것(Alt+Tab)은 저장이 아니다
    if (!document.hasFocus()) return
    // 다시 그리느라 입력칸이 문서에서 떨어지는 중이면 저장이 아니다
    if (field.value == null || !field.value.isConnected) return
    emit('commit', 'blur')
  }
</script>

<template>
  <span class="team-name-input" @click.stop>
    <input
      ref="field"
      autocomplete="off"
      :aria-invalid="error ? 'true' : undefined"
      :aria-label="labels.input"
      class="team-name-input__field"
      name="teamName"
      :readonly="pending"
      type="text"
      :value="name"
      @blur="onBlur"
      @input="emit('input', ($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
    />
    <span class="team-name-input__count">{{ name.length }}/{{ TEAM_NAME_MAX_LENGTH }}</span>
    <!-- 🔴 ✓ · ✕ 는 누를 때 입력칸 포커스를 빼앗지 않는다 — 빼앗으면 ✕ 를 누르는 순간 바깥 누르기 저장이 먼저 돈다 -->
    <VBtn
      :aria-label="labels.save"
      :disabled="pending"
      icon="mdi-check"
      :loading="pending"
      size="x-small"
      variant="text"
      @click="emit('commit', 'button')"
      @mousedown.prevent
    />
    <VBtn
      :aria-label="labels.cancel"
      :disabled="pending"
      icon="mdi-close"
      size="x-small"
      variant="text"
      @click="cancel"
      @mousedown.prevent
    />
    <span v-if="error" class="team-name-input__error" role="alert">{{ error }}</span>
  </span>
</template>

<style scoped>
  .team-name-input {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    min-width: 0;
  }

  .team-name-input__field {
    flex: 1 1 120px;
    min-width: 0;
    height: 28px;
    padding: 2px 8px;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid rgb(var(--v-theme-primary));
    border-radius: 4px;
  }

  .team-name-input__field[aria-invalid='true'] {
    border-color: rgb(var(--v-theme-error));
  }

  .team-name-input__field[readonly] {
    opacity: 0.7;
  }

  .team-name-input__field:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 0;
  }

  .team-name-input__count {
    flex: none;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .team-name-input__error {
    flex-basis: 100%;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-error));
  }
</style>
