<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/common/ConfirmDialog.vue
  //       + gise ConfirmDialog.vue 의 `blockedReason` · `confirmLabel` · `confirmColor`.
  //
  // 🔴 **삭제 확인은 「되돌릴 수 있는지 여부」를 문구에 적는다.** 그래서 `reversible` 이
  //    **옵셔널이 아니다.** 기본값을 주면 부르는 쪽이 빠뜨려도 컴파일이 통과하고, 되돌릴 수 없는
  //    삭제가 조용히 「되돌릴 수 있습니다」로 안내된다 — 관리자가 그 문구를 믿고 누른다.
  //
  // 🔴 `blockedReason` 이 채워지면 확정 버튼을 **숨긴다**(비활성이 아니다). "지금은 어떤 방법으로도
  //    못 한다" 가 답인 자리다 — 비활성 버튼을 남겨 두면 "권한이 없나" 를 의심하며 계속 시도한다.
  //
  // 🔴 `:loading` 은 클릭을 안 막는다(vuetify VBtn) — 확인 버튼이 `:disabled` 를 함께 갖는 이유다.
  //    삭제에서 두 번 눌리면 두 번째가 「없는 행 삭제」로 죽어 **성공 직후 오류 문구**가 뜬다.
  //
  // ⚠️ 색은 렌더 테스트가 원리적으로 못 잰다(happy-dom 에 Vuetify 스타일시트가 없다). 그래서 위험
  //    신호를 색에만 걸지 않고 **문장으로** 낸다 — 색은 그 위에 덧붙이는 것이다.
  //
  // 🔴 닫히면 연 곳으로 포커스를 돌려준다(`useDialogFocus` — 브라우저 확인 G4).
  import { computed } from 'vue'
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

  const props = withDefaults(
    defineProps<{
      title: string
      message: string
      /** 🔴 필수다. 되돌릴 수 있는지를 부르는 쪽이 반드시 밝힌다. */
      reversible: boolean
      submitting?: boolean
      confirmLabel?: string
      cancelLabel?: string
      /** 생략하면 reversible 이면 primary, 아니면 error. */
      confirmColor?: string
      /** 채워지면 메시지 대신 이 사유를 보이고 확정 버튼을 숨긴다. */
      blockedReason?: string | null
      maxWidth?: number | string
    }>(),
    {
      submitting: false,
      confirmLabel: '확인',
      cancelLabel: '취소',
      confirmColor: undefined,
      blockedReason: null,
      maxWidth: 480,
    },
  )

  const open = defineModel<boolean>({ default: false })
  useDialogFocus(open)

  const emit = defineEmits<{
    confirm: []
  }>()

  const blocked = computed(() => (props.blockedReason ?? '') !== '')
  const color = computed(() => props.confirmColor ?? (props.reversible ? 'primary' : 'error'))

  function onConfirm() {
    if (props.submitting || blocked.value) return
    emit('confirm')
  }
</script>

<template>
  <VDialog v-model="open" :max-width="maxWidth" persistent>
    <VCard>
      <VCardTitle>{{ title }}</VCardTitle>
      <VCardText>
        <VAlert v-if="blocked" density="compact" type="error" variant="tonal">
          {{ blockedReason }}
        </VAlert>
        <template v-else>
          <p class="mb-4 text-body-2">
            {{ message }}
          </p>
          <VAlert density="compact" :type="reversible ? 'info' : 'warning'" variant="tonal">
            <span v-if="reversible">이 작업은 되돌릴 수 있습니다.</span>
            <span v-else>이 작업은 되돌릴 수 없습니다.</span>
          </VAlert>
        </template>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn :disabled="submitting" variant="text" @click="open = false">
          {{ blocked ? '닫기' : cancelLabel }}
        </VBtn>
        <!-- 🔴 막힌 경우 이 버튼은 **없다**. `:disabled` 로 남기지 않는다. -->
        <VBtn
          v-if="!blocked"
          :color="color"
          :disabled="submitting"
          :loading="submitting"
          @click="onConfirm"
        >
          {{ confirmLabel }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
