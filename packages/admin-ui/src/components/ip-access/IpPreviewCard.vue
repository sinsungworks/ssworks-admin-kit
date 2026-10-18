<script setup lang="ts">
  import { computed } from 'vue'
  import type { AdminIpPreviewItem } from '@ssworks/admin-shared'
  import {
    basisLine,
    changedItemLine,
    currentIpLine,
    impactLine,
    lockedItemLine,
    passLine,
    type IpAccessMessages,
    type IpPreviewView,
  } from './ip-access.js'

  // 접속 상태와 변경 영향 카드(내부 부품) — 편집 중이 아닐 때도 늘 선다(I1 · I2–I8).
  //
  // 정본: hangang-home apps/admin/src/pages/settings/ip-access.vue "접속 상태와 변경 영향" 카드
  // 바꾼 점: 문장은 `ip-access.ts` 순수 함수 하나에서 — 이 부품은 그리기만 한다. 세션 끊기 문단이 없다(⑥ S2).
  //
  // 🔴 ① 현재 IP · ② 통과 여부 · ③ 잠기는 사람은 화면 몫이다 — 서버는 요청자 본인만 막는다(hangang §7-1).
  // 🔴 색이 아니라 글자로 — happy-dom 은 색을 못 재고, 색각 이상에도 안 보인다(C3).

  const props = defineProps<{
    preview: IpPreviewView
    lockedItems: readonly AdminIpPreviewItem[]
    changedItems: readonly AdminIpPreviewItem[]
    isSelf: (item: AdminIpPreviewItem) => boolean
    globalAllowRemoval: boolean
    messages: IpAccessMessages
  }>()

  const pass = computed(() => passLine(props.preview, props.messages))
  const blocked = computed(() => props.preview.result != null && !props.preview.result.clientPasses)
</script>

<template>
  <section :aria-label="messages.cardTitle" class="ip-preview-card">
    <div class="ip-preview-card__title">{{ messages.cardTitle }}</div>
    <p class="ip-preview-card__ip">{{ currentIpLine(preview.clientIp, messages) }}</p>
    <p v-if="pass" :class="{ 'ip-preview-card__danger': blocked }">{{ pass }}</p>
    <p class="text-medium-emphasis">{{ basisLine(preview.op, messages) }}</p>
    <p role="status">{{ impactLine(preview, messages) }}</p>
    <ul v-if="lockedItems.length > 0" class="ip-preview-card__people">
      <li v-for="item in lockedItems" :key="String(item.userNo)">
        {{ lockedItemLine(item, isSelf(item), messages) }}
      </li>
    </ul>
    <ul v-if="changedItems.length > 0" class="ip-preview-card__people">
      <li v-for="item in changedItems" :key="String(item.userNo)">
        {{ changedItemLine(item, isSelf(item), messages) }}
      </li>
    </ul>
    <p v-if="globalAllowRemoval" class="ip-preview-card__danger" role="alert">
      {{ messages.globalAllowRemoval }}
    </p>
    <div class="ip-preview-card__hints text-body-2 text-medium-emphasis">
      <p>{{ messages.hintLayerShadow }}</p>
      <p>{{ messages.hintServerDefence }}</p>
      <p>{{ messages.hintSessionsStay }}</p>
      <p>{{ messages.hintRecovery }}</p>
    </div>
  </section>
</template>

<style scoped>
  .ip-preview-card {
    display: grid;
    gap: 6px;
    padding: 12px 16px;
    border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
  }
  .ip-preview-card p {
    margin: 0;
  }
  .ip-preview-card__title {
    font-weight: 600;
  }
  .ip-preview-card__ip {
    font-weight: 600;
  }
  .ip-preview-card__danger {
    color: rgb(var(--v-theme-error));
    font-weight: 600;
  }
  .ip-preview-card__people {
    margin: 0;
    padding-left: 1.2em;
    display: grid;
    gap: 2px;
    font-size: 0.875rem;
  }
  .ip-preview-card__hints {
    display: grid;
    gap: 4px;
    padding-top: 6px;
    border-top: thin dashed rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
