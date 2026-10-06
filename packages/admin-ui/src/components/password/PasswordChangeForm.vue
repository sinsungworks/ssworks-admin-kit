<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { VBtn } from 'vuetify/components'
  import type { PasswordPolicy } from '@ssworks/admin-shared'
  import PasswordField from '../common/PasswordField.vue'

  // 정본: ssworks-gise-home apps/admin/src/pages/password.vue + hangang-home apps/admin/src/pages/account.vue
  // 바꾼 점:
  //  ① 페이지를 폼 컴포넌트로 — 화면 위치(전용 페이지 · 내 계정 카드 · 다이얼로그)는 템플릿이 고른다.
  //  ② 길이 숫자 · 문구를 admin-shared 정책 객체에서 받는다 — 서버 본문 검증과 같은 값이다(3c 결정 ⑧).
  //  ③ 요청 · 성공 뒤 처리(`/me` 재조회 · 이동)는 `submit` 을 넘긴 페이지가 한다. 페이지는
  //     `useWriteFlow({ gate: 'none', fields: ['currentPassword', 'newPassword'] })` 로 보낸다 — 재인증 관문을 쓰지
  //     않는다(본문이 이미 현재 비밀번호를 받는다, hangang).
  //  ④ gise 의 눈 토글 없는 칸 대신 킷 `PasswordField`(hangang).
  //
  // 🔴 제출 함수 첫 줄이 버튼과 같은 검사다 — `:disabled` 는 마우스만 막는다. Enter 두 번에도 요청은 한 번(gise).
  // 🔴 처리 중에는 `readonly` 다(`disabled` 아님) — 값과 포커스를 유지한다(gise).
  // 🔴 비밀번호 값은 이 컴포넌트 상태에만 있다. 성공하면 비운다.

  const props = withDefaults(
    defineProps<{
      policy: PasswordPolicy
      submit: (body: { currentPassword: string; newPassword: string }) => Promise<boolean>
      /** `useWriteFlow` 의 `fieldErrors` — `currentPassword` · `newPassword` 만 그린다 */
      errors?: Readonly<Record<string, readonly string[]>>
      /** 있으면 숨은 username 칸 — 비밀번호 관리자가 계정을 알아본다(gise) */
      userId?: string
      submitLabel?: string
    }>(),
    { errors: () => ({}), userId: undefined, submitLabel: '비밀번호 변경' },
  )

  const MISMATCH_MESSAGE = '새 비밀번호가 서로 다릅니다.'
  const FIELD_KEYS = ['currentPassword', 'newPassword'] as const

  const formEl = ref<HTMLFormElement | null>(null)
  const currentPassword = ref('')
  const newPassword = ref('')
  const confirmPassword = ref('')
  const pending = ref(false)
  /** 서버 오류를 숨긴 칸 — 사용자가 그 칸을 고치면 숨기고, 새 `errors` 가 오면 비운다 */
  const dismissed = ref(new Set<string>())

  const lengthOk = computed(
    () =>
      newPassword.value.length >= props.policy.minLength &&
      newPassword.value.length <= props.policy.maxLength,
  )
  const confirmOk = computed(() => confirmPassword.value === newPassword.value)
  const differs = computed(() => newPassword.value !== currentPassword.value)
  const canSubmit = computed(
    () =>
      !pending.value &&
      currentPassword.value !== '' &&
      lengthOk.value &&
      confirmOk.value &&
      differs.value,
  )

  function serverErrors(key: string): string[] {
    return dismissed.value.has(key) ? [] : [...(props.errors[key] ?? [])]
  }

  const currentErrors = computed(() => serverErrors('currentPassword'))
  const newErrors = computed(() => {
    const local: string[] = []
    if (newPassword.value !== '') {
      if (!lengthOk.value) local.push(props.policy.lengthMessage)
      else if (!differs.value) local.push(props.policy.sameAsCurrentMessage)
    }
    return [...local, ...serverErrors('newPassword')]
  })
  const confirmErrors = computed(() =>
    confirmPassword.value !== '' && !confirmOk.value ? [MISMATCH_MESSAGE] : [],
  )

  // 새 서버 오류가 오면 숨김을 풀고 첫 오류 칸(현재 → 새)으로 포커스를 옮긴다(gise).
  watch(
    () => props.errors,
    async (next) => {
      dismissed.value = new Set()
      const first = FIELD_KEYS.find((key) => (next[key]?.length ?? 0) > 0)
      if (first == null) return
      await nextTick()
      formEl.value?.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus()
    },
  )
  watch(currentPassword, () => {
    dismissed.value.add('currentPassword')
  })
  watch(newPassword, () => {
    dismissed.value.add('newPassword')
  })

  async function onSubmit(): Promise<void> {
    if (!canSubmit.value) return
    pending.value = true
    try {
      const ok = await props.submit({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      })
      if (ok) {
        currentPassword.value = ''
        newPassword.value = ''
        confirmPassword.value = ''
      }
    } finally {
      pending.value = false
    }
  }
</script>

<template>
  <form ref="formEl" class="password-change-form" novalidate @submit.prevent="onSubmit">
    <input
      v-if="userId"
      autocomplete="username"
      hidden
      name="username"
      readonly
      type="text"
      :value="userId"
    />
    <PasswordField
      v-model="currentPassword"
      autocomplete="current-password"
      :error-messages="currentErrors"
      label="현재 비밀번호"
      name="currentPassword"
      :readonly="pending"
    />
    <PasswordField
      v-model="newPassword"
      autocomplete="new-password"
      :error-messages="newErrors"
      :hint="policy.lengthMessage"
      label="새 비밀번호"
      name="newPassword"
      persistent-hint
      :readonly="pending"
    />
    <PasswordField
      v-model="confirmPassword"
      autocomplete="new-password"
      :error-messages="confirmErrors"
      label="새 비밀번호 확인"
      name="confirmPassword"
      :readonly="pending"
    />
    <VBtn block :disabled="!canSubmit" :loading="pending" type="submit">{{ submitLabel }}</VBtn>
  </form>
</template>

<style scoped>
  .password-change-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
