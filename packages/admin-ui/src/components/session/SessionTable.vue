<script setup lang="ts" generic="TRow extends SessionTableRow">
  import { computed } from 'vue'
  import { VBtn, VChip } from 'vuetify/components'
  import { describeUserAgent } from '@ssworks/admin-shared'
  import DataTableBody from '../table/DataTableBody.vue'
  import type { AdminTableHeader } from '../table/data-table.js'
  import {
    DEFAULT_SESSION_TABLE_MESSAGES,
    type SessionLabelView,
    type SessionTableMessages,
    type SessionTableRow,
  } from './session-table.js'
  import { formatDateTime } from '../../utils/format-date-time.js'

  // 정본: ssworks-gise-home apps/admin/src/components/SessionTable.vue
  //       + kim5257-crm-v5 packages/frontend-core/src/components/sessions/SessionsAdminPanel.vue(사용자 열 · 서버 페이징)
  // 바꾼 점:
  //  ① 클라이언트 `VDataTable` 을 킷 `DataTableBody` 로 — `itemsLength` 를 주면 서버 페이징(관리자 전체 목록),
  //     안 주면 행 전부 + 쪽 이동 숨김(내 세션 · 계정별). `VDataTableServer` 는 넘긴 행을 자르지 않는다.
  //  ② 열을 켜고 끈다(사용자 · IP · 로그인 · 만료). crm 의 행 메뉴를 텍스트 버튼 둘로.
  //  ③ gise 의 `testPrefix` · `data-test` 를 버렸다 — 테스트는 접근 이름으로 찾는다.
  //  ④ 문구를 `messages`(부분 덮어쓰기 — C2)로 바꾼다(3h · ringside 보고 §3). `useSessions` 가 `table` 바인딩으로 싣는다.
  //
  // 🔴 현재 세션 행에는 "끝내기" 가 없다(3c 스펙 D4). 목록에서 끊으면 다음 요청이 401 이 되어 화면이 갑자기
  //    로그인으로 튕긴다 — 로그아웃 버튼이 같은 일을 정상 경로로 한다.
  // 🔴 끝내기 버튼의 접근 이름에 마지막 활동 시각을 넣는다 — 같은 브라우저 · 같은 OS 의 세션이 여러 줄이면 요약만으로는
  //    스크린리더도 테스트도 어느 줄인지 모른다(gise).
  // 🔴 "사용자 전체 끊기" 접근 이름의 기본값은 버튼 문구(`view.button`)를 쓴다 — 버튼만 바꿔도 화면 글자와 접근 이름이
  //    같은 말이다(3h S4).

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
      /** 표 문구 일부. 나머지는 기본값(`SessionTableMessages`) */
      messages?: Partial<SessionTableMessages>
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
      messages: () => ({}),
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

  const text = computed<SessionTableMessages>(() => ({
    ...DEFAULT_SESSION_TABLE_MESSAGES,
    ...props.messages,
  }))

  const headers = computed<AdminTableHeader[]>(() => [
    ...(props.showUser ? [{ title: text.value.userColumn, key: 'user', sortable: false }] : []),
    { title: text.value.deviceColumn, key: 'device', sortable: false },
    ...(props.showIp
      ? [{ title: text.value.ipColumn, key: 'ipAddress', sortable: false, nowrap: true }]
      : []),
    ...(props.showLoginAt
      ? [{ title: text.value.loginAtColumn, key: 'loginAt', sortable: false, nowrap: true }]
      : []),
    { title: text.value.lastAccessAtColumn, key: 'lastAccessAt', sortable: false, nowrap: true },
    ...(props.showExpireAt
      ? [{ title: text.value.expireAtColumn, key: 'expireAt', sortable: false, nowrap: true }]
      : []),
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ])

  function format(iso: string): string {
    return props.formatDate ? props.formatDate(iso) : formatDateTime(iso)
  }

  function labelView(row: TRow, button: string): SessionLabelView {
    return {
      device: describeUserAgent(row.userAgent),
      lastAccessAt: format(row.lastAccessAt),
      showUser: props.showUser,
      button,
    }
  }

  function revokeLabel(row: TRow): string {
    return text.value.revokeButtonLabel(row, labelView(row, text.value.revokeButton))
  }

  function revokeUserLabel(row: TRow): string {
    return text.value.revokeUserButtonLabel(row, labelView(row, text.value.revokeUserButton))
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
        <VChip v-if="item.isCurrent" color="primary" size="x-small" variant="tonal">
          {{ text.currentDevice }}
        </VChip>
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
          {{ text.currentDeviceNote }}
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
          {{ text.revokeButton }}
        </VBtn>
        <VBtn
          v-if="canRevokeUser"
          :aria-label="revokeUserLabel(item)"
          :disabled="busy"
          size="small"
          variant="text"
          @click="emit('revokeUser', item)"
        >
          {{ text.revokeUserButton }}
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
