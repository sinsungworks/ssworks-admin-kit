<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { VAutocomplete } from 'vuetify/components'

  // 서버 검색 자동완성 칸(내부 부품) — 감사 행위자(3f) · IP 대상 사용자(3g)가 같은 규칙을 쓴다(3f · 3g 스펙 C8).
  // 검색 자체(디바운스 · 순번)는 `useRemoteSearch` 가 하고, 이 칸은 무엇을 검색어로 알릴지와 메뉴 안내를 맡는다.
  //
  // 정본: 3f `AuditLogFilterBar.vue` 의 행위자 칸(최종 리뷰 F1 · F2 반영본)
  // 바꾼 점: 문구 · 이름 · 오류 · hide-details · disabled 를 props 로 — 두 화면이 한 부품을 쓴다.

  const props = withDefaults(
    defineProps<{
      /** '' = 없음 */
      modelValue: string
      items: readonly { value: string; title: string }[]
      label: string
      name: string
      searching: boolean
      failed: boolean
      /** 검색어가 없을 때 메뉴 글자 */
      hintText: string
      emptyText: string
      failedText: string
      placeholder?: string
      errorMessages?: readonly string[]
      hideDetails?: boolean
      disabled?: boolean
    }>(),
    { placeholder: undefined, errorMessages: () => [], hideDetails: false, disabled: false },
  )

  const emit = defineEmits<{
    'update:modelValue': [value: string]
    search: [keyword: string]
  }>()

  const itemList = computed(() => [...props.items])
  const errors = computed(() => [...props.errorMessages])
  const searchText = ref('')
  const selectedTitle = computed(
    () => props.items.find((item) => item.value === props.modelValue)?.title ?? null,
  )

  /**
   * 🔴 항목을 고르면 VAutocomplete 가 모델을 바꾼 바로 뒤에 검색어를 그 항목 글자로 바꾸며 update:search 를 낸다.
   *   그때는 부모가 아직 다시 그리기 전이라 modelValue 가 옛 값이다 — selectedTitle 만으로는 못 막는다.
   *   그래서 고른 항목의 글자를 모델 변경 때 먼저 적어 둔다(update:modelValue 가 update:search 보다 앞선다).
   *   놓치면 고를 때마다 그 글자로 검색 요청이 한 번 더 나가고(64자 넘으면 400) 후보가 그 사람 하나로 접힌다.
   */
  let pickedTitle: string | null = null

  function onModel(value: unknown): void {
    pickedTitle =
      typeof value === 'string'
        ? (props.items.find((item) => item.value === value)?.title ?? null)
        : null
    emit('update:modelValue', typeof value === 'string' ? value : '')
  }

  function onSearch(value: string | null): void {
    const keyword = value ?? ''
    if (keyword === pickedTitle || keyword === selectedTitle.value) {
      // 고른 항목 글자는 사람이 친 검색어가 아니다 — 안내 줄이 그 글자를 검색어로 알지 않게 비운다
      searchText.value = ''
      return
    }
    searchText.value = keyword
    emit('search', keyword)
  }

  const noDataText = computed(() => {
    if (props.failed) return props.failedText
    return searchText.value.trim() === '' ? props.hintText : props.emptyText
  })

  /**
   * 🔴 고른 사람이 목록에 늘 붙어 있어 items 가 비지 않는다 — Vuetify 는 no-data 를 items 가 빌 때만 그린다.
   *   그 상태에서 "결과 없음" · "검색 실패"가 사라지면 조용한 실패가 된다(A8 · C7). 그래서 메뉴 맨 위 줄로 따로 그린다.
   *   items 가 비면 no-data-text 가 이미 같은 글자를 그리므로 겹쳐 그리지 않는다.
   */
  const statusLine = computed<string | null>(() => {
    if (itemList.value.length === 0) return null
    if (props.failed) return props.failedText
    if (props.searching || searchText.value.trim() === '') return null
    const others = props.items.some((item) => item.value !== props.modelValue)
    return others ? null : props.emptyText
  })
</script>

<template>
  <VAutocomplete
    autocomplete="off"
    clearable
    density="compact"
    :disabled="disabled"
    :error-messages="errors"
    :hide-details="hideDetails"
    item-title="title"
    item-value="value"
    :items="itemList"
    :label="label"
    :loading="searching"
    :model-value="modelValue === '' ? null : modelValue"
    :name="name"
    no-filter
    :no-data-text="noDataText"
    :placeholder="placeholder"
    variant="outlined"
    @update:model-value="onModel"
    @update:search="onSearch"
  >
    <template v-if="statusLine" #prepend-item>
      <div class="remote-search-field__status text-body-2 text-medium-emphasis" role="status">
        {{ statusLine }}
      </div>
    </template>
  </VAutocomplete>
</template>

<style scoped>
  .remote-search-field__status {
    padding: 8px 16px;
  }
</style>
