<script setup lang="ts">
  // 정본: kim5257-crm-v5 / axion `BaseDialog.vue` 의 골격(슬롯 title/default/actions, type ok|yesno)
  //       + gise `BaseDialog.vue` 의 `persistent` 기본값 true.
  //
  // 🔴 `persistent` 기본값이 **true** 다. 저장·삭제가 진행 중인데 바깥을 클릭했다고 닫히면
  //    사용자는 요청이 취소된 줄 알고 같은 조작을 한 번 더 한다.
  //
  // 🔴 닫기 버튼 색은 `secondary` 다. crm 원본의 `third` 는 어느 테마에도 정의되지 않은 색이었다.
  //
  // 🔴 `:loading` 은 클릭을 안 막는다(vuetify VBtn) — 확인 버튼은 `:disabled` 와 한 벌이다.
  import {
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VDialog,
    VSpacer,
  } from 'vuetify/components'

  const props = withDefaults(
    defineProps<{
      title?: string
      message?: string
      maxWidth?: number | string
      /**
       * `ok`    확인 버튼 하나.
       * `yesno` 취소·확인 두 버튼.
       * `none`  기본 버튼 없음 — `#actions` 슬롯으로 직접 그린다.
       */
      type?: 'ok' | 'yesno' | 'none'
      persistent?: boolean
      scrollable?: boolean
      /** 제목 줄 오른쪽의 X 닫기 버튼. */
      closable?: boolean
      confirmLabel?: string
      cancelLabel?: string
      /** 부모가 요청을 보내는 중인가. 확인 버튼이 잠긴다. */
      submitting?: boolean
      /**
       * 확인을 누르면 닫히는가. `'auto'`(기본)는 `type === 'ok'` 일 때만 닫는다 — `yesno` 는
       * 부모가 비동기 작업을 마친 뒤 닫는 흐름이 보통이라 자동으로 닫지 않는다.
       * ⚠️ `boolean | undefined` 로 두지 않는 이유: Vue 는 없는 Boolean prop 을 false 로 캐스팅한다.
       */
      closeOnConfirm?: boolean | 'auto'
    }>(),
    {
      title: '',
      message: '',
      maxWidth: 540,
      type: 'ok',
      persistent: true,
      scrollable: true,
      closable: true,
      confirmLabel: '확인',
      cancelLabel: '취소',
      submitting: false,
      closeOnConfirm: 'auto',
    },
  )

  const open = defineModel<boolean>({ default: false })

  const emit = defineEmits<{
    confirm: []
    cancel: []
  }>()

  function onConfirm() {
    if (props.submitting) return
    emit('confirm')
    const shouldClose = props.closeOnConfirm === 'auto' ? props.type === 'ok' : props.closeOnConfirm
    if (shouldClose) open.value = false
  }

  function onCancel() {
    emit('cancel')
    open.value = false
  }
</script>

<template>
  <VDialog v-model="open" :max-width="maxWidth" :persistent="persistent" :scrollable="scrollable">
    <VCard>
      <slot name="title">
        <VCardTitle class="d-flex align-center">
          <span>{{ title }}</span>
          <VSpacer />
          <VBtn
            v-if="closable"
            aria-label="닫기"
            color="secondary"
            icon="mdi-close"
            variant="text"
            @click="onCancel"
          />
        </VCardTitle>
      </slot>
      <VCardText>
        <slot>
          {{ message }}
        </slot>
      </VCardText>
      <VCardActions v-if="type !== 'none' || $slots.actions">
        <VSpacer />
        <slot name="actions">
          <VBtn v-if="type === 'yesno'" variant="text" @click="onCancel">
            {{ cancelLabel }}
          </VBtn>
          <VBtn :disabled="submitting" :loading="submitting" @click="onConfirm">
            {{ confirmLabel }}
          </VBtn>
        </slot>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
