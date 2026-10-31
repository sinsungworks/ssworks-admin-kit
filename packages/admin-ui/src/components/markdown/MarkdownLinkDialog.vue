<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { VBtn, VTextField } from 'vuetify/components'
  import BaseDialog from '../common/BaseDialog.vue'
  import type { MarkdownEditorMessages } from './markdown-editor.js'

  // 마크다운 편집기의 링크 대화상자(스펙 W12) — 내부 부품(export 안 함). 🔴 브라우저 `prompt` 를 쓰지 않는다(저장소 규약).
  //
  // 정본: ssworks-ringside apps/web/app/components/ring/RingEditorLinkPopover.vue 의 흐름(열 때만 주소 채움 · 적용 실패 힌트)
  // 바꾼 점: 팝오버 대신 킷 `BaseDialog` · 「열기」 단추 없음(미리보기의 새 탭 링크가 있다) · 적용 · 지우기는 함수 prop 으로
  //          받는다 — 성공 여부(링크 확장의 `setLink` 가 `javascript:` 등을 거부하면 거짓)를 바로 안다.
  //
  // 🔴 주소 칸은 **열 때만** 채운다(`watch(modelValue)`). `href` prop 에 동기화하면 열린 채 선택이 다시 매핑될 때 치던 주소가 지워진다.

  const props = defineProps<{
    modelValue: boolean
    /** 열 때 채울 주소 — 링크 위면 지금 주소, 아니면 '' */
    href: string
    /** 지금 선택이 링크 위인가 — 「링크 지우기」 를 켠다 */
    hasLink: boolean
    /** 적용. 거짓을 돌려주면 닫지 않고 `linkInvalid` 를 보인다 */
    apply: (href: string) => boolean
    remove: () => void
    messages: MarkdownEditorMessages
  }>()

  const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

  const input = ref('')
  const error = ref('')

  watch(
    () => props.modelValue,
    (open) => {
      if (!open) return
      input.value = props.href
      error.value = ''
    },
    { immediate: true },
  )

  function close(): void {
    emit('update:modelValue', false)
  }

  function onApply(): void {
    if (props.apply(input.value)) {
      close()
      return
    }
    error.value = props.messages.linkInvalid
  }

  function onRemove(): void {
    props.remove()
    close()
  }
</script>

<template>
  <BaseDialog
    max-width="480"
    :model-value="modelValue"
    :title="messages.linkTitle"
    type="none"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VTextField
      v-model="input"
      autofocus
      :error-messages="error ? [error] : []"
      :label="messages.linkHref"
      placeholder="https://"
      @keydown.enter.prevent="onApply"
      @update:model-value="error = ''"
    />
    <template #actions>
      <VBtn :disabled="!hasLink" variant="text" @click="onRemove">{{ messages.linkRemove }}</VBtn>
      <VBtn variant="text" @click="close">{{ messages.linkCancel }}</VBtn>
      <VBtn color="primary" @click="onApply">{{ messages.linkApply }}</VBtn>
    </template>
  </BaseDialog>
</template>
