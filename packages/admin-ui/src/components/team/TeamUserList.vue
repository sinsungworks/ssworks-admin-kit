<script setup lang="ts" generic="R extends TeamUserRow">
  import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
  import {
    VAlert,
    VBtn,
    VCheckbox,
    VList,
    VListItem,
    VListItemSubtitle,
    VListItemTitle,
    VProgressLinear,
    VTextField,
  } from 'vuetify/components'
  import { ApiError } from '../../api/error.js'
  import { ADMIN_LIST_MAX_PAGE_SIZE } from '../table/data-table.js'
  import PanelLayout from '../ui/PanelLayout.vue'
  import {
    DEFAULT_TEAM_USER_LIST_MESSAGES,
    type TeamUserListMessages,
    type TeamUserPage,
    type TeamUserQuery,
    type TeamUserRow,
  } from './team-user-list.js'

  // 팀 화면 2열 — 트리에서 고른 팀의 인원 목록. 읽기 전용 선택기다(편집 진입점은 3열 하나 — hangang).
  //
  // 정본: hangang-home apps/admin/src/components/org/TeamUserList.vue
  // 바꾼 점:
  //  - API 직접 호출(`usersApi.list`)을 `load(query)` 어댑터로, 고정 행 모양을 `#item` 슬롯으로, "사용자 추가" 버튼을
  //    `#bottom` 슬롯으로(3d ⑧ L1).
  //  - 100명 절단 안내 대신 쪽 나눔 — 목록 끝의 "더 불러오기" 버튼이 화면에 들어오면 저절로 눌린다(스펙 D16). 위에는
  //    총계만 보인다.
  //  - 하위 팀 포함 · 팀이 바뀔 때 마지막으로 **제출한** 검색어를 쓴다 — hangang 은 칸에 쳐 두기만 한 글자가 섞여 나갔다.
  //
  // 🔴 응답 경합 — 첫 쪽 · 다음 쪽 · reload 가 같은 순번을 탄다. 팀을 빨리 바꾸면 먼저 보낸 느린 응답이 나중 팀의 목록을
  //    덮거나 끝에 붙는다(hangang).
  // 🔴 `recursive` 는 `teamNo` 와 짝이다 — 단독이면 서버가 둘 다 안 건다. 그래서 팀이 없으면 조회하지 않는다(hangang).

  const props = withDefaults(
    defineProps<{
      teamNo: bigint | null
      /** 메서드 꼴(bivariant) */
      load(query: TeamUserQuery): Promise<TeamUserPage<R>>
      pageSize?: number
      messages?: Partial<TeamUserListMessages>
    }>(),
    { pageSize: ADMIN_LIST_MAX_PAGE_SIZE, messages: () => ({}) },
  )

  const selected = defineModel<bigint | null>({ default: null })

  defineSlots<{
    item?(props: { item: R; selected: boolean }): unknown
    bottom?(): unknown
  }>()

  const text = computed<TeamUserListMessages>(() => ({
    ...DEFAULT_TEAM_USER_LIST_MESSAGES,
    ...props.messages,
  }))

  const keywordInput = ref('')
  /** 🔴 마지막으로 제출한 검색어 — 칸에 쳐 두고 제출 안 한 글자는 쓰지 않는다 */
  const applied = ref('')
  const recursive = ref(false)
  const items = shallowRef<R[]>([])
  const total = ref(0)
  const page = ref(0)
  const done = ref(true)
  const loading = ref(false)
  const loadingMore = ref(false)
  const failure = ref<'forbidden' | 'failed' | null>(null)
  /** 다음 쪽 실패 — 다시 시도를 누를 때까지 자동 불러오기를 멈춘다(실패 → 다시 보임 → 또 실패의 반복을 막는다) */
  const moreFailed = ref(false)
  let seq = 0

  function query(nextPage: number, teamNo: bigint): TeamUserQuery {
    const result: TeamUserQuery = {
      teamNo,
      recursive: recursive.value,
      page: nextPage,
      itemsPerPage: props.pageSize,
    }
    if (applied.value !== '') result.keyword = applied.value
    return result
  }

  /** 🔴 목록 위에 직접 보이므로 처리됨으로 표시한다 — 전역 토스트와 두 번 알리지 않는다(3a 규약) */
  function classify(error: unknown): 'forbidden' | 'failed' {
    if (error instanceof ApiError) {
      error.handled = true
      if (error.status === 403) return 'forbidden'
    }
    return 'failed'
  }

  /** 쪽 사이에 명단이 바뀌어 같은 사람이 다시 오면 버린다 */
  function append(current: readonly R[], incoming: readonly R[]): R[] {
    const seen = new Set(current.map((row) => row.userNo))
    const fresh = incoming.filter((row) => {
      if (seen.has(row.userNo)) return false
      seen.add(row.userNo)
      return true
    })
    return [...current, ...fresh]
  }

  function settle(result: TeamUserPage<R>, nextItems: R[], nextPage: number): void {
    items.value = nextItems
    total.value = Number(result.total)
    page.value = nextPage
    // 서버 total 이 틀려도 끝없이 부르지 않게 — 덜 찬 쪽이 오면 끝이다
    done.value = nextItems.length >= total.value || result.items.length < props.pageSize
  }

  async function loadFirst(): Promise<void> {
    const teamNo = props.teamNo
    const mine = ++seq
    loadingMore.value = false
    moreFailed.value = false
    failure.value = null
    if (teamNo == null) {
      items.value = []
      total.value = 0
      page.value = 0
      done.value = true
      loading.value = false
      return
    }
    loading.value = true
    try {
      const result = await props.load(query(1, teamNo))
      if (mine !== seq) return
      settle(result, append([], result.items), 1)
    } catch (error) {
      if (mine !== seq) return
      items.value = []
      total.value = 0
      page.value = 0
      done.value = true
      failure.value = classify(error)
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    const teamNo = props.teamNo
    if (teamNo == null || done.value || loading.value || loadingMore.value || moreFailed.value)
      return
    const mine = seq
    loadingMore.value = true
    try {
      const result = await props.load(query(page.value + 1, teamNo))
      if (mine !== seq) return
      settle(result, append(items.value, result.items), page.value + 1)
      rearm()
    } catch (error) {
      if (mine !== seq) return
      moreFailed.value = true
      classify(error)
    } finally {
      if (mine === seq) loadingMore.value = false
    }
  }

  function retryMore(): void {
    moreFailed.value = false
    void loadMore()
  }

  function onSearch(): void {
    if (props.teamNo == null || loading.value) return
    applied.value = keywordInput.value.trim()
    void loadFirst()
  }

  function select(row: R): void {
    selected.value = row.userNo
  }

  watch(
    () => props.teamNo,
    (next, previous) => {
      // 팀이 실제로 바뀌면 고른 사람을 걷는다 — 다른 팀 사람을 3열에 남기지 않는다(첫 마운트는 제외 — hangang)
      if (previous !== undefined && next !== previous && selected.value != null)
        selected.value = null
      void loadFirst()
    },
    { immediate: true },
  )

  watch(recursive, () => {
    void loadFirst()
  })

  // ── 스크롤하면 더 ─────────────────────────────────────────────────

  const sentinel = ref<HTMLElement | null>(null)
  let observer: IntersectionObserver | null = null

  /** 붙인 뒤에도 끝이 화면 안이면 이어서 부르도록 다시 관찰한다 — 관찰은 교차가 "바뀔 때" 만 알린다 */
  function rearm(): void {
    const el = sentinel.value
    if (observer == null || el == null) return
    observer.unobserve(el)
    observer.observe(el)
  }

  watch(
    sentinel,
    (el) => {
      observer?.disconnect()
      observer = null
      if (el == null || typeof IntersectionObserver === 'undefined') return
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void loadMore()
        },
        { root: el.closest('.panel-layout__content-inner'), rootMargin: '0px 0px 120px 0px' },
      )
      observer.observe(el)
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  defineExpose({ reload: loadFirst })
</script>

<template>
  <PanelLayout class="team-user-list" scrollable>
    <template #top>
      <div class="team-user-list__top">
        <form class="team-user-list__search" @submit.prevent="onSearch">
          <VTextField
            v-model="keywordInput"
            autocomplete="off"
            density="compact"
            hide-details
            :label="text.searchLabel"
            name="userId"
            variant="outlined"
          />
          <VBtn :disabled="loading || teamNo == null" :loading="loading" type="submit">
            {{ text.searchButton }}
          </VBtn>
        </form>
        <VCheckbox
          v-model="recursive"
          density="compact"
          :disabled="teamNo == null"
          hide-details
          :label="text.recursiveLabel"
          name="recursive"
        />
        <VAlert v-if="failure === 'forbidden'" density="compact" type="error" variant="tonal">
          {{ text.forbidden }}
        </VAlert>
        <VAlert v-else-if="failure === 'failed'" density="compact" type="error" variant="tonal">
          {{ text.loadFailed }}
          <template #append>
            <VBtn size="small" variant="text" @click="loadFirst">{{ text.retry }}</VBtn>
          </template>
        </VAlert>
        <p v-else-if="teamNo != null && total > 0" class="team-user-list__total">
          {{ text.total(total) }}
        </p>
      </div>
      <VProgressLinear v-if="loading" color="primary" indeterminate />
    </template>

    <p v-if="teamNo == null" class="team-user-list__empty">{{ text.noTeam }}</p>
    <p v-else-if="items.length === 0 && !loading && failure == null" class="team-user-list__empty">
      {{ applied === '' ? text.empty : text.emptyFiltered }}
    </p>
    <template v-else-if="items.length > 0">
      <VList density="compact">
        <VListItem
          v-for="row in items"
          :key="String(row.userNo)"
          :active="row.userNo === selected"
          @click="select(row)"
        >
          <slot name="item" :item="row" :selected="row.userNo === selected">
            <VListItemTitle>{{ row.userName }}</VListItemTitle>
            <VListItemSubtitle>{{ row.userId }}</VListItemSubtitle>
          </slot>
        </VListItem>
      </VList>
      <div v-if="!done && failure == null" ref="sentinel" class="team-user-list__more">
        <VAlert v-if="moreFailed" density="compact" type="error" variant="tonal">
          {{ text.loadMoreFailed }}
          <template #append>
            <VBtn size="small" variant="text" @click="retryMore">{{ text.retry }}</VBtn>
          </template>
        </VAlert>
        <VBtn
          v-else
          block
          :disabled="loadingMore"
          :loading="loadingMore"
          variant="tonal"
          @click="loadMore"
        >
          {{ text.loadMore(Math.max(0, total - items.length)) }}
        </VBtn>
      </div>
    </template>

    <template #bottom>
      <slot name="bottom" />
    </template>
  </PanelLayout>
</template>

<style scoped>
  .team-user-list__top {
    display: grid;
    gap: 8px;
    padding: 12px 12px 8px;
  }

  .team-user-list__search {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .team-user-list__total {
    margin: 0;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .team-user-list__empty {
    padding: 32px 16px;
    margin: 0;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-align: center;
  }

  .team-user-list__more {
    padding: 8px 12px 16px;
  }
</style>
