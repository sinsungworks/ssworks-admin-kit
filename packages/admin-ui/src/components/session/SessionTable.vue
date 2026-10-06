<script setup lang="ts" generic="TRow extends SessionTableRow">
  import { computed } from 'vue'
  import { VBtn, VChip } from 'vuetify/components'
  import { describeUserAgent } from '@ssworks/admin-shared'
  import DataTableBody from '../table/DataTableBody.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import { formatDateTime, type SessionTableRow } from './session-table.js'

  // 정본: ssworks-gise-home apps/admin/src/components/SessionTable.vue
  //       + kim5257-crm-v5 packages/frontend-core/src/components/sessions/SessionsAdminPanel.vue(사용자 열 · 서버 페이징)
  // 바꾼 점:
  //  ① 클라이언트 `VDataTable` 을 킷 `DataTableBody` 로 — `itemsLength` 를 주면 서버 페이징(관리자 전체 목록),
  //     안 주면 행 전부 + 쪽 이동 숨김(내 세션 · 계정별). `VDataTableServer` 는 넘긴 행을 자르지 않는다.
  //  ② 열을 켜고 끈다(사용자 · IP · 로그인 · 만료). crm 의 행 메뉴를 텍스트 버튼 둘로.
  //  ③ gise 의 `testPrefix` · `data-test` 를 버렸다 — 테스트는 접근 이름으로 찾는다.
  //
  // 🔴 현재 세션 행에는 "끝내기" 가 없다(3c 스펙 D4). 목록에서 끊으면 다음 요청이 401 이 되어 화면이 갑자기
  //    로그인으로 튕긴다 — 로그아웃 버튼이 같은 일을 정상 경로로 한다.
  // 🔴 끝내기 버튼의 접근 이름에 마지막 활동 시각을 넣는다 — 같은 브라우저 · 같은 OS 의 세션이 여러 줄이면 요약만으로는
  //    스크린리더도 테스트도 어느 줄인지 모른다(gise).

  const props = withDefaults(
    defineProps<{
      sessions: readonly TRow[]
      /** 있으면 서버 페이징 모드 — 서버가 센 총 개수 */
      itemsLength?: number
      loading?: boolean
      busy?: boolean
      showUser?: boolean
      showIp?: boolean
      showLoginAt?: boolean
      showExpireAt?: boolean
      canRevoke?: boolean
      canRevokeUser?: boolean
      emptyText?: string
      /** 메서드 꼴(bivariant). 기본은 브라우저 현지 시각 `YYYY-MM-DD HH:mm` */
      formatDate?(iso: string): string
    }>(),
    {
      itemsLength: undefined,
      loading: false,
      busy: false,
      showUser: false,
      showIp: true,
      showLoginAt: false,
      showExpireAt: true,
      canRevoke: true,
      canRevokeUser: false,
      emptyText: '로그인된 세션이 없습니다.',
      formatDate: undefined,
    },
  )

  const page = defineModel<number>('page', { default: 1 })
  const itemsPerPage = defineModel<number>('itemsPerPage', { default: 20 })

  const emit = defineEmits<{
    revoke: [row: TRow]
    revokeUser: [row: TRow]
  }>()

  defineSlots<{ 'no-data'?(): unknown }>()

  const paged = computed(() => props.itemsLength != null)

  const headers = computed<AdminTableHeader[]>(() => [
    ...(props.showUser ? [{ title: '사용자', key: 'user', sortable: false }] : []),
    { title: '기기', key: 'device', sortable: false },
    ...(props.showIp ? [{ title: 'IP', key: 'ipAddress', sortable: false, nowrap: true }] : []),
    ...(props.showLoginAt
      ? [{ title: '로그인', key: 'loginAt', sortable: false, nowrap: true }]
      : []),
    { title: '마지막 활동', key: 'lastAccessAt', sortable: false, nowrap: true },
    ...(props.showExpireAt
      ? [{ title: '만료', key: 'expireAt', sortable: false, nowrap: true }]
      : []),
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ])

  function format(iso: string): string {
    return props.formatDate ? props.formatDate(iso) : formatDateTime(iso)
  }

  function revokeLabel(row: TRow): string {
    const who = props.showUser && row.userName ? `${row.userName} · ` : ''
    return `${who}${describeUserAgent(row.userAgent)} 세션 끝내기 (마지막 활동 ${format(row.lastAccessAt)})`
  }

  function revokeUserLabel(row: TRow): string {
    return `${row.userName ?? ''}(${row.userId ?? ''}) 의 세션 모두 끊기`
  }
</script>

<template>
  <DataTableBody
    v-model:items-per-page="itemsPerPage"
    v-model:page="page"
    class="session-table"
    :headers="headers"
    :hide-default-footer="!paged"
    :items="sessions"
    :items-length="itemsLength ?? sessions.length"
    :loading="loading"
  >
    <template #item.user="{ item }">{{ item.userName }} ({{ item.userId }})</template>
    <template #item.device="{ item }">
      <div class="session-table__device">
        <span>{{ describeUserAgent(item.userAgent) }}</span>
        <VChip v-if="item.isCurrent" color="primary" size="x-small" variant="tonal">이 기기</VChip>
      </div>
      <div
        v-if="item.userAgent?.trim()"
        class="session-table__raw text-caption text-medium-emphasis"
      >
        {{ item.userAgent }}
      </div>
    </template>
    <template #item.ipAddress="{ item }">{{ item.ipAddress ?? '-' }}</template>
    <template #item.loginAt="{ item }">{{ format(item.loginAt) }}</template>
    <template #item.lastAccessAt="{ item }">{{ format(item.lastAccessAt) }}</template>
    <template #item.expireAt="{ item }">{{ format(item.expireAt) }}</template>
    <template #item.actions="{ item }">
      <div class="session-table__actions">
        <span v-if="item.isCurrent" class="text-caption text-medium-emphasis">
          이 기기는 로그아웃으로 끝냅니다.
        </span>
        <VBtn
          v-else-if="canRevoke"
          :aria-label="revokeLabel(item)"
          color="error"
          :disabled="busy"
          size="small"
          variant="text"
          @click="emit('revoke', item)"
        >
          끝내기
        </VBtn>
        <VBtn
          v-if="canRevokeUser"
          :aria-label="revokeUserLabel(item)"
          :disabled="busy"
          size="small"
          variant="text"
          @click="emit('revokeUser', item)"
        >
          사용자 전체 끊기
        </VBtn>
      </div>
    </template>
    <template #no-data>
      <slot name="no-data">{{ emptyText }}</slot>
    </template>
  </DataTableBody>
</template>

<style scoped>
  .session-table__device {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .session-table__raw {
    overflow-wrap: anywhere;
  }
  .session-table__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
  }
</style>
