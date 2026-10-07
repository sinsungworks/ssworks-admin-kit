<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { VAutocomplete, VBtn } from 'vuetify/components'
  import type { TeamMoveTarget } from '@ssworks/admin-shared'
  import BaseDialog from '../common/BaseDialog.vue'

  // 옮기기 대화상자 — 새 상위 팀을 고르면 그 아래 맨 끝으로 간다(3d ② P2). 자리는 ↑↓ 로 고친다.
  //
  // 정본: hangang-home apps/admin/src/pages/org/teams.vue 생성 대화상자의 상위 팀 고르기(들여쓴 조직도 순서 · 값 수동 초기화)
  // 바꾼 점:
  //  - "옮기기" 전용. 선택지는 부르는 쪽이 `moveTargets()` 로 만든다(자기 · 하위 팀 · 지금 상위 팀이 빠진 목록).
  //  - 팀이 많아도 고르게 이름 검색(VAutocomplete). 들여쓴 제목으로 보이고 원래 이름으로 찾는다.
  //
  // 🔴 최상위 선택지는 `null` 대신 내부 키로 구분한다 — Vuetify 선택 상자는 `null` 을 "고르지 않음"으로 본다.
  // 🔴 열릴 때마다 고른 값과 검색어를 비운다 — VDialog 는 지연 마운트라 setup 상태가 다음 열림에 남는다(hangang).

  const props = withDefaults(
    defineProps<{
      teamName: string
      targets: readonly TeamMoveTarget[]
      submitting?: boolean
    }>(),
    { submitting: false },
  )

  const open = defineModel<boolean>({ default: false })

  const emit = defineEmits<{
    confirm: [parentTeamNo: bigint | null]
  }>()

  interface Option {
    key: string
    title: string
    teamName: string | null
    parentTeamNo: bigint | null
  }

  const TOP_KEY = 'top'

  const options = computed<Option[]>(() =>
    props.targets.map((target) => ({
      key: target.parentTeamNo == null ? TOP_KEY : String(target.parentTeamNo),
      title: target.title,
      teamName: target.teamName,
      parentTeamNo: target.parentTeamNo,
    })),
  )

  const choice = ref<string | null>(null)
  const chosen = computed(() => options.value.find((option) => option.key === choice.value) ?? null)

  const search = ref('')

  watch(open, (value) => {
    if (!value) return
    choice.value = null
    search.value = ''
  })

  /** 들여쓴 제목(U+3000 · └)이 아니라 원래 이름으로 찾는다 */
  function filter(_value: string, query: string, item?: { raw: Option }): boolean {
    const needle = query.trim().toLowerCase()
    if (needle === '') return true
    const raw = item?.raw
    return (raw?.teamName ?? raw?.title ?? '').toLowerCase().includes(needle)
  }

  function onConfirm(): void {
    if (props.submitting || chosen.value == null) return
    emit('confirm', chosen.value.parentTeamNo)
  }

  function onCancel(): void {
    if (props.submitting) return
    open.value = false
  }
</script>

<template>
  <BaseDialog
    v-model="open"
    :closable="false"
    :max-width="480"
    :title="`「${teamName}」 옮기기`"
    type="none"
  >
    <p class="team-move-dialog__message">
      고른 팀 아래 맨 끝으로 옮깁니다. 하위 팀과 소속 인원이 함께 옮겨집니다.
    </p>
    <VAutocomplete
      v-model="choice"
      v-model:search="search"
      autocomplete="off"
      :custom-filter="filter"
      density="compact"
      :disabled="submitting"
      item-title="title"
      item-value="key"
      :items="options"
      label="새 상위 팀"
      name="parentTeamNo"
      no-data-text="맞는 팀이 없습니다."
      variant="outlined"
    />
    <template #actions>
      <VBtn :disabled="submitting" variant="text" @click="onCancel">취소</VBtn>
      <VBtn
        color="primary"
        :disabled="submitting || chosen == null"
        :loading="submitting"
        @click="onConfirm"
      >
        옮기기
      </VBtn>
    </template>
  </BaseDialog>
</template>

<style scoped>
  .team-move-dialog__message {
    margin-bottom: 16px;
  }
</style>
