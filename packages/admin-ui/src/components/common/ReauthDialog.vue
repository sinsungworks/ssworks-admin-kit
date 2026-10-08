<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/common/ReauthDialog.vue
  //
  // 민감 쓰기(사용자 생성·비밀번호 초기화·IP 규칙 변경 …) 앞에 관리자 **본인**의 현재 비밀번호를
  // 다시 받는 대화상자. 서버는 본문의 `currentPassword` 로 재인증한다(`ERR_REAUTH_REQUIRED`).
  //
  // 🔴 **필드 이름은 `currentPassword` 다.** 요청을 보내는 관리자 본인의 현재 비밀번호이고,
  //    `password`(대상 계정의 새 비밀번호)와 뜻이 다르다. `data-testid` 를 안 쓰므로 이 `name` 이
  //    테스트와 자동화의 유일한 잡이다.
  //
  // 🔴 **틀린 비밀번호로 대화상자를 닫지 않는다.** 닫으면 사용자가 뒤에 있는 폼을 처음부터 다시
  //    채운다. 그래서 `error` 는 이 대화상자 안에 그린다.
  //
  // 🔴 **`VDialog` 를 닫아도 이 컴포넌트의 `password` ref 는 안 사라진다.** `VDialog` 는 지연
  //    마운트라 닫으면 속 페인만 언마운트된다. 그래서 열림·닫힘 전이마다 손으로 비운다 — 안 비우면
  //    다음에 연 사람에게 앞사람이 친 비밀번호가 평문으로 남는다.
  //
  // 🔴 `:loading` 은 클릭을 안 막는다 — 확인 버튼은 `:disabled` 와 한 벌이다.
  //
  // 🔴 열면 비밀번호 칸에 포커스를 둔다 — `VDialog` 는 카드 자체에 포커스를 둬 칸을 누르거나 Tab 해야 칠 수 있었다
  //    (브라우저 확인 P6). 닫히면 연 곳으로 포커스를 돌려준다(G4). 둘 다 `useDialogFocus`.
  import { ref, watch, type ComponentPublicInstance } from 'vue'
  import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VDialog,
    VSpacer,
  } from 'vuetify/components'
  import { useDialogFocus } from './dialog-focus.js'
  import PasswordField from './PasswordField.vue'

  const props = withDefaults(
    defineProps<{
      /** 무엇을 하려는지 한 문장. 뒤에 「현재 비밀번호를 입력하세요.」가 붙는다. */
      message?: string
      title?: string
      /** 부모가 요청을 보내는 중인가. 🔴 `:loading` 만으로는 클릭이 안 막힌다. */
      submitting?: boolean
      /** 🔴 재인증 실패 문구. 채워도 대화상자는 닫히지 않는다. */
      error?: string
      label?: string
      confirmLabel?: string
      cancelLabel?: string
    }>(),
    {
      message: '',
      title: '비밀번호 확인',
      submitting: false,
      error: '',
      label: '현재 비밀번호',
      confirmLabel: '확인',
      cancelLabel: '취소',
    },
  )

  const open = defineModel<boolean>({ default: false })

  const emit = defineEmits<{
    /** 확인을 눌렀다. 부모가 이 값을 요청 본문의 `currentPassword` 로 싣는다. */
    confirm: [password: string]
  }>()

  const password = ref('')
  const field = ref<ComponentPublicInstance | null>(null)

  useDialogFocus(open, () =>
    (field.value?.$el as HTMLElement | undefined)?.querySelector<HTMLInputElement>('input'),
  )

  /** 🔴 열릴 때마다, 닫힐 때도 비운다. 보관 시간을 최소로 줄인다. */
  watch(open, () => {
    password.value = ''
  })

  /**
   * 🔴 **첫 줄이 가드다.** 버튼의 `:disabled` 는 마우스만 막는다 — 이 함수를 부르는 다른 길
   *    (Enter · 프로그램 호출)이 생기면 그쪽은 안 막힌다.
   */
  function onConfirm() {
    if (password.value.length === 0 || props.submitting) return
    emit('confirm', password.value)
  }
</script>

<template>
  <VDialog v-model="open" :max-width="420" persistent>
    <VCard>
      <VCardTitle>{{ title }}</VCardTitle>
      <VCardText>
        <p class="mb-4 text-body-2">{{ message }} 현재 비밀번호를 입력하세요.</p>
        <VAlert v-if="error" class="mb-4" density="compact" type="error" variant="tonal">
          {{ error }}
        </VAlert>
        <PasswordField
          ref="field"
          v-model="password"
          autocomplete="current-password"
          :label="label"
          name="currentPassword"
          @keydown.enter.prevent="onConfirm"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="open = false">
          {{ cancelLabel }}
        </VBtn>
        <!-- 🔴 `:disabled` 와 `:loading` 은 한 벌이다. 머리 주석 참조. -->
        <VBtn
          :disabled="password.length === 0 || submitting"
          :loading="submitting"
          @click="onConfirm"
        >
          {{ confirmLabel }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
