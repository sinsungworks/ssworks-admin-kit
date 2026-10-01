<script setup lang="ts">
  import { ref } from 'vue'
  import {
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VDialog,
    VSpacer,
  } from 'vuetify/components'
  import { useAdminUi } from '../../context/admin-ui.js'
  import { useAdminLogout } from '../../context/logout.js'

  // 정본: hangang-home apps/admin/src/components/common/IpBlockedDialog.vue
  // 바꾼 점:
  //   ① `useAppStore().ipBlocked/blockedIp` 를 `useAdminUi().ipBlocked()` 게터로.
  //   ② 로그아웃 → 이동을 `useAdminLogout()` 으로 — `afterLogout ?? router.replace(loginPath)`.
  //   ③ 로그아웃 진행 중 버튼을 `:loading` + `:disabled` 한 벌로 잠근다.
  //
  // 🔴 이 대화상자는 AdminShell 에 내장하지 않는다. `App.vue` 최상위(또는 `#overlays`)에 둔다 —
  //    `default` 레이아웃에만 두면 **로그인 화면에서 IP 차단이 안 뜬다**.
  // 🔴 `:loading` 은 클릭을 안 막는다 — `:disabled` 와 한 벌이다.

  const ui = useAdminUi()
  const logout = useAdminLogout()
  const busy = ref(false)

  async function onLogout() {
    if (busy.value) return
    busy.value = true
    try {
      await logout()
    } finally {
      busy.value = false
    }
  }
</script>

<template>
  <VDialog :model-value="ui.ipBlocked().blocked" :max-width="480" no-click-animation persistent>
    <VCard>
      <VCardTitle>접근이 차단되었습니다</VCardTitle>
      <VCardText>
        <p class="mb-3">
          현재 접속한 IP 주소는 관리자 사용이 허용되지 않습니다. 접속 정보를 확인한 뒤 관리자에게
          문의해 주세요.
        </p>
        <div class="ip-box">
          <span class="label">접속 IP</span>
          <span class="value">{{ ui.ipBlocked().ip || '확인 불가' }}</span>
        </div>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn color="primary" :disabled="busy" :loading="busy" @click="onLogout">로그아웃</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
  .ip-box {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background-color: rgba(0, 0, 0, 0.04);
    border-radius: 4px;
  }

  .ip-box .label {
    font-weight: 600;
  }

  .ip-box .value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    user-select: all;
  }
</style>
