<script setup lang="ts">
  import { computed } from 'vue'
  import type { AdminAuditLog } from '@ssworks/admin-shared'
  import { diffAuditMeta, metaJson, type AuditLogMessages } from './audit-log.js'

  // 펼친 행 내용(내부 부품) — 바뀐 항목 · 가린 항목 · 기타 기록 · 요청 줄(A14).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/audit-logs.vue `#expanded-row`
  // 바꾼 점: 항목 이름에 `fieldLabels`(gise audit-fields 의 일반화), 요청 줄에 세션 번호.
  //
  // 🔴 서버가 가린 값(***)은 풀거나 추측하지 않는다 — 이름만 낸다.

  const props = defineProps<{
    row: AdminAuditLog
    fieldLabels: Readonly<Record<string, string>>
    messages: AuditLogMessages
  }>()

  const diff = computed(() => diffAuditMeta(props.row.meta, props.messages.absent))
  const restJson = computed(() => (diff.value.rest == null ? '' : metaJson(diff.value.rest)))

  function fieldLabel(key: string): string | null {
    return Object.hasOwn(props.fieldLabels, key) ? (props.fieldLabels[key] ?? null) : null
  }
</script>

<template>
  <div class="audit-log-detail">
    <template v-if="diff.hasDiff">
      <div class="audit-log-detail__title">{{ messages.changesTitle }}</div>
      <table v-if="diff.changes.length > 0" class="audit-log-detail__diff">
        <thead>
          <tr>
            <th>{{ messages.changeField }}</th>
            <th>{{ messages.changeBefore }}</th>
            <th>{{ messages.changeAfter }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="change in diff.changes" :key="change.key">
            <td>
              <template v-if="fieldLabel(change.key)">
                {{ fieldLabel(change.key) }}
                <span class="audit-log-detail__key">{{ change.key }}</span>
              </template>
              <template v-else>{{ change.key }}</template>
            </td>
            <td>{{ change.before }}</td>
            <td>{{ change.after }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-body-2">{{ messages.noChanges }}</p>
      <p v-if="diff.masked.length > 0" class="text-body-2 text-medium-emphasis">
        {{ messages.masked(diff.masked) }}
      </p>
    </template>
    <template v-if="restJson !== ''">
      <div class="audit-log-detail__title">{{ messages.restTitle }}</div>
      <pre class="audit-log-detail__json">{{ restJson }}</pre>
    </template>
    <p v-if="!diff.hasDiff && restJson === ''" class="text-body-2 text-medium-emphasis">
      {{ messages.nothingRecorded }}
    </p>
    <div class="text-body-2">
      <strong>{{ messages.requestLabel }}</strong>
      {{ row.method }} {{ row.path }}
      <template v-if="row.sessionNo != null">
        · {{ messages.sessionLabel(row.sessionNo) }}</template
      >
    </div>
    <div v-if="row.userAgent" class="text-body-2 audit-log-detail__ua">
      <strong>{{ messages.userAgentLabel }}</strong>
      {{ row.userAgent }}
    </div>
  </div>
</template>

<style scoped>
  .audit-log-detail {
    display: grid;
    gap: 8px;
    padding: 12px 4px;
  }
  .audit-log-detail__title {
    font-weight: 600;
    font-size: 0.875rem;
  }
  .audit-log-detail__diff {
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  .audit-log-detail__diff th,
  .audit-log-detail__diff td {
    border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
    padding: 4px 8px;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .audit-log-detail__key {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.8em;
    opacity: 0.7;
  }
  .audit-log-detail__json {
    background-color: rgb(var(--v-theme-surface-variant));
    border-radius: 4px;
    font-family: Consolas, Monaco, monospace;
    font-size: 0.85em;
    margin: 0;
    max-height: 320px;
    overflow: auto;
    padding: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .audit-log-detail__ua {
    overflow-wrap: anywhere;
  }
</style>
