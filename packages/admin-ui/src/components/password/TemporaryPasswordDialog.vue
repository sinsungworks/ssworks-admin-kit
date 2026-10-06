<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { VAlert, VBtn } from 'vuetify/components'
  import BaseDialog from '../common/BaseDialog.vue'
  import { copyText, type CopyResult } from '../../utils/copy-text.js'

  // 정본: ssworks-gise-home apps/admin/src/components/TemporaryPasswordDialog.vue
  //       + hangang-home apps/admin/src/pages/org/users.vue(인라인 다이얼로그) · users-messages.ts(문구)
  // 바꾼 점:
  //  ① 열림(boolean)과 값을 따로 받던 것을 `v-model` 하나로 — 값 자체(`string | null`)가 모델이다.
  //  ② hangang 규칙: 값을 글자로 · 복사 3갈래 · 문구는 값 아래 · "한 번만" 경고 · 세션 폐기 안내 · 스스로 닫지 않음.
  //  ③ gise 의 토스트 복사 알림을 버렸다 — 관리자는 지금 이 값을 보고 있다.
  //
  // 🔴 `v-model` 이 곧 값이다. 닫기가 `null` 을 내보내 부모의 값을 비운다 — "닫으면 부모가 비운다" 를 부모의
  //    성실함에 맡기지 않는다(3c 스펙 D7). 이 컴포넌트는 값을 따로 보관하지 않는다.
  // 🔴 값을 입력칸이 아니라 글자로 낸다 — 입력칸의 value 는 화면 읽기 도구가 못 읽고, 클립보드가 없을 때 손으로
  //    고르기도 불편하다. 복사는 편의이고 화면의 글자가 정본이다(hangang).
  // 🔴 스스로 닫지 않는다 — 바깥 클릭 · ESC 무시, 제목 줄 X 없음. 목록을 다시 불러와도 열린 채다. 읽기 전에 닫히면
  //    그 값은 다시 볼 수 없다(hangang).

  const value = defineModel<string | null>({ default: null })

  const props = withDefaults(
    defineProps<{
      mode?: 'create' | 'reset'
      title?: string
      /** 누구의 값인지(예: `홍길동(hong)`) */
      target?: string
      /** 서버가 그 계정의 세션을 함께 끊었다는 안내 */
      sessionsRevoked?: boolean
    }>(),
    { mode: 'reset', title: undefined, target: undefined, sessionsRevoked: false },
  )

  defineSlots<{ default?(): unknown }>()

  const COPY_MESSAGES: Record<CopyResult, string> = {
    done: '임시 비밀번호를 복사했습니다.',
    failed: '복사하지 못했습니다. 위 값을 직접 선택해 복사하세요.',
    unavailable: '이 브라우저에서는 복사 기능을 쓸 수 없습니다. 위 값을 직접 선택해 복사하세요.',
  }

  const open = computed(() => value.value != null)
  const heading = computed(
    () =>
      props.title ??
      (props.mode === 'create' ? '계정을 만들었습니다' : '비밀번호를 초기화했습니다'),
  )
  const copying = ref(false)
  const copyResult = ref<CopyResult | null>(null)

  /** 값이 바뀔 때마다 올린다 — 늦게 끝난 옛 복사의 결과를 새 값에 붙이지 않는다 */
  let copySeq = 0

  // 🔴 값이 바뀌거나 닫히면 이전 복사 결과를 지우고 잠금도 푼다 — 다른 사람 값에 "복사했습니다" 가 남지 않게.
  //    복사 중에 값이 바뀌어도, 늦게 끝난 옛 복사는 새 값에 결과를 쓰지 못하고(copySeq) 새 값의 복사 버튼을
  //    잠가 두지도 못한다.
  watch(value, () => {
    copySeq++
    copyResult.value = null
    copying.value = false
  })

  async function copy(): Promise<void> {
    const text = value.value
    if (text == null || copying.value) return
    const seq = ++copySeq
    copying.value = true
    try {
      const result = await copyText(text)
      if (seq === copySeq) copyResult.value = result
    } finally {
      if (seq === copySeq) copying.value = false
    }
  }

  function close(): void {
    value.value = null
  }

  function onModel(next: boolean): void {
    if (!next) close()
  }
</script>

<template>
  <BaseDialog
    :closable="false"
    max-width="480"
    :model-value="open"
    persistent
    :title="heading"
    type="none"
    @update:model-value="onModel"
  >
    <div class="temporary-password">
      <p v-if="target" class="text-body-2">「{{ target }}」의 임시 비밀번호</p>
      <code class="temporary-password__value">{{ value }}</code>
      <p aria-live="polite" class="text-body-2">
        {{ copyResult ? COPY_MESSAGES[copyResult] : '' }}
      </p>
      <VAlert density="compact" type="warning" variant="tonal">
        이 값은 지금 한 번만 보입니다. 창을 닫으면 다시 볼 수 없고, 잃어버리면 다시 발급해야 합니다.
      </VAlert>
      <VAlert v-if="sessionsRevoked" density="compact" type="info" variant="tonal">
        이 계정의 접속 세션은 서버가 함께 끊었습니다.
      </VAlert>
      <p class="text-body-2">처음 로그인하면 새 비밀번호를 정하게 됩니다.</p>
      <slot />
    </div>
    <template #actions>
      <VBtn :disabled="copying" :loading="copying" variant="text" @click="copy">복사</VBtn>
      <VBtn @click="close">닫기</VBtn>
    </template>
  </BaseDialog>
</template>

<style scoped>
  .temporary-password {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .temporary-password__value {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 1.25rem;
    letter-spacing: 0.04em;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    user-select: all;
    overflow-wrap: anywhere;
  }
</style>
