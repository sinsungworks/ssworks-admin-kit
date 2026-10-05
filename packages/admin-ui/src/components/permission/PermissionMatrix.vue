<script setup lang="ts">
  import { computed } from 'vue'
  import { VCheckbox, VTable } from 'vuetify/components'
  import {
    matrixCellKey,
    type PermissionMatrixCategory,
    type PermissionMatrixRow,
  } from './permission-matrix.js'

  // 정본: hangang-home apps/admin/src/components/org/PermissionMatrix.vue
  //       + ssworks-axion-admin packages/frontend/src/data/permission_matrix.ts(카테고리 · 라벨 모양)
  // 바꾼 점:
  //  ① 고정 열(read/write/delete) · 상수 import 를 `categories` · `permissions` prop 으로. 카테고리마다 열이 다르다.
  //  ② 라벨을 그린다. 칸의 접근 가능한 이름은 「행 라벨 열 라벨」, `name` 은 권한 키다 — 테스트도 이것으로 찾는다
  //     (hangang 의 `data-perm` 은 테스트 전용 속성이라 버렸다).
  //  ③ `canPick` — 권한 상승 방지(gise). ④ `#row-extra` 슬롯 — scope 선택 상자 자리(crm · axion).
  //
  // 🔴 칸 하나만 더하거나 뺀다 — 함의 · 전체 권한 · 정렬은 모른다. `useRoleEditor` 가 판정해 바인딩으로 넘긴다.
  // 🔴 `'*'` 를 칸으로 만들 수 없다. 칸 키는 늘 `${resource}:${action}` 이다. hangang 사고 — 전체 권한을 행으로
  //    넣으면 `*:read` 가 만들어져 조용히 버려지고, 켜고 저장했는데 권한이 하나도 안 붙는다.
  // 🔴 칸의 활성 여부는 `permissions`(카탈로그)에서 파생한다. 손으로 적으면 카탈로그가 바뀌는 날 조용히 갈린다.

  const model = defineModel<string[]>({ default: () => [] })

  const props = withDefaults(
    defineProps<{
      categories: readonly PermissionMatrixCategory[]
      /** 유효 권한 목록. 칸 키가 여기 없으면 그 칸은 비활성 · 미체크다. */
      permissions: readonly string[]
      disabled?: boolean
      /**
       * false 면 그 칸 비활성(권한 상승 방지). 체크 표시는 모델을 그대로 따른다.
       * 🔴 메서드 꼴이다(bivariant) — `MainMenu` 의 `filter` 와 같은 이유.
       */
      canPick?(permission: string): boolean
    }>(),
    { disabled: false, canPick: undefined },
  )

  const slots = defineSlots<{
    'row-extra'?(props: { row: PermissionMatrixRow; category: PermissionMatrixCategory }): unknown
  }>()

  const valid = computed(() => new Set(props.permissions))
  const granted = computed(() => new Set(model.value))

  const tables = computed(() =>
    props.categories.map((category) => ({
      category,
      rows: category.rows.map((row) => ({
        row,
        cells: category.columns.map((column) => ({ column, key: matrixCellKey(row, column) })),
      })),
    })),
  )

  function cellDisabled(key: string): boolean {
    return props.disabled || !valid.value.has(key) || (props.canPick?.(key) ?? true) === false
  }

  function toggle(key: string, on: boolean): void {
    // 🔴 첫 줄이 가드다 — `:disabled` 는 마우스만 막는다.
    if (cellDisabled(key)) return
    if (on) {
      if (!granted.value.has(key)) model.value = [...model.value, key]
    } else {
      model.value = model.value.filter((permission) => permission !== key)
    }
  }
</script>

<template>
  <div class="permission-matrix">
    <VTable
      v-for="table in tables"
      :key="table.category.id"
      class="permission-matrix__category"
      density="compact"
    >
      <thead>
        <tr>
          <th scope="col">{{ table.category.label }}</th>
          <th v-for="column in table.category.columns" :key="column.action" scope="col">
            {{ column.label }}
          </th>
          <th v-if="slots['row-extra']" scope="col" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in table.rows" :key="entry.row.resource">
          <th scope="row">{{ entry.row.label }}</th>
          <td v-for="cell in entry.cells" :key="cell.column.action">
            <VCheckbox
              :aria-label="`${entry.row.label} ${cell.column.label}`"
              density="compact"
              :disabled="cellDisabled(cell.key)"
              hide-details
              :model-value="valid.has(cell.key) && granted.has(cell.key)"
              :name="cell.key"
              @update:model-value="(value) => toggle(cell.key, value === true)"
            />
          </td>
          <td v-if="slots['row-extra']">
            <slot name="row-extra" :category="table.category" :row="entry.row" />
          </td>
        </tr>
      </tbody>
    </VTable>
  </div>
</template>

<style scoped>
  .permission-matrix {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
