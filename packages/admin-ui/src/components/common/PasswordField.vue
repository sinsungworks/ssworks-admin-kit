<script setup lang="ts">
  // 정본: hangang-home apps/admin/src/components/common/PasswordField.vue
  //       (crm-v5 · axion 사본과 동일 — 세 사본이 같다)
  import { ref } from 'vue'
  import { VTextField } from 'vuetify/components'

  defineOptions({ inheritAttrs: false })

  const modelValue = defineModel<string>({ default: '' })

  const visible = ref(false)
</script>

<template>
  <!-- 🔴 기본값은 $attrs 앞에 둔다 — 호출하는 쪽의 autocomplete(current-password · new-password)가 이겨야 비밀번호 관리자가 칸을 알아본다 -->
  <!-- eslint-disable vue/attributes-order -->
  <VTextField
    autocomplete="off"
    v-bind="$attrs"
    v-model="modelValue"
    :append-inner-icon="visible ? 'mdi-eye' : 'mdi-eye-off'"
    :type="visible ? 'text' : 'password'"
    @click:append-inner="visible = !visible"
  />
  <!-- eslint-enable vue/attributes-order -->
</template>
