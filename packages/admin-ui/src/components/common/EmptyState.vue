<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/common/EmptyState.vue
  //
  // 🔴 **「아직 없습니다」와 「검색 결과가 없습니다」는 다른 상태다.** 뭉뚱그리면 필터를 켜 둔 것을
  //    잊은 관리자가 목록이 통째로 비었다고 읽고 **이미 있는 항목을 다시 만든다.** 그래서 문구만
  //    가르는 것이 아니라 만들기 버튼도 그 갈래에서 뺀다 — 필터가 켜져 있을 때 옳은 다음 행동은
  //    만드는 것이 아니라 필터를 푸는 것이다.
  //
  // 🔴 **만들기 버튼은 권한이 있을 때만 그린다.** 판정은 이 컴포넌트가 하지 않고 부르는 쪽이
  //    `usePermission()` 으로 계산해 `canCreate` 로 넘긴다 — 권한 판정 훅은 저장소에 하나뿐이다.
  //
  // ⚠️ 버튼을 숨기는 것이 방어선은 아니다. 서버 가드가 방어선이고 이것은 안내다.
  import { VBtn } from 'vuetify/components'

  withDefaults(
    defineProps<{
      /** 검색어·필터가 걸린 상태인가. 🔴 이 값이 두 문구를 가른다. */
      filtered?: boolean
      /** 🔴 부르는 쪽이 `usePermission()` 으로 계산해 넘긴다. */
      canCreate?: boolean
      title?: string
      filteredTitle?: string
      filteredHint?: string
      createLabel?: string
    }>(),
    {
      filtered: false,
      canCreate: false,
      title: '아직 없습니다',
      filteredTitle: '검색 결과가 없습니다',
      filteredHint: '검색어나 필터를 바꿔 보세요. 필터를 풀면 다른 항목이 있을 수 있습니다.',
      createLabel: '새로 만들기',
    },
  )

  defineEmits<{
    create: []
  }>()
</script>

<template>
  <div class="empty-state text-center py-8">
    <template v-if="filtered">
      <p class="text-body-1 mb-1">
        {{ filteredTitle }}
      </p>
      <p class="text-body-2 text-medium-emphasis">
        {{ filteredHint }}
      </p>
    </template>
    <template v-else>
      <p class="text-body-1 mb-1">
        {{ title }}
      </p>
      <VBtn v-if="canCreate" class="mt-2" @click="$emit('create')">
        {{ createLabel }}
      </VBtn>
    </template>
  </div>
</template>
