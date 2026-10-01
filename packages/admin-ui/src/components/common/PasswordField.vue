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
  <VTextField
    v-bind="$attrs"
    v-model="modelValue"
    :append-inner-icon="visible ? 'mdi-eye' : 'mdi-eye-off'"
    autocomplete="off"
    :type="visible ? 'text' : 'password'"
    @click:append-inner="visible = !visible"
  />
</template>
