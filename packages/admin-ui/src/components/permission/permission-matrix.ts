import { ALL_PERMISSION } from '@ssworks/admin-shared'

// 권한 매트릭스의 카탈로그 모양.
//
// 정본: ssworks-axion-admin packages/frontend/src/data/permission_matrix.ts
// 바꾼 점: 이름에 `PermissionMatrix` 접두를 붙였다 · 배열을 `readonly` 로 · 누락 검사 도우미를 더했다.

export interface PermissionMatrixColumn {
  action: string
  label: string
}

export interface PermissionMatrixRow {
  /** 점이 있어도 된다(`org.users`). 칸 키를 쪼개지 않는다. */
  resource: string
  label: string
}

/** 카테고리마다 열이 달라도 된다(axion — CRUD 4열 · 라이선스 5열 · 설정 2열). */
export interface PermissionMatrixCategory {
  id: string
  label: string
  columns: readonly PermissionMatrixColumn[]
  rows: readonly PermissionMatrixRow[]
}

/** 칸 키. 🔴 늘 `${resource}:${action}` 이라 `'*'` 와 같아질 수 없다. */
export function matrixCellKey(row: PermissionMatrixRow, column: PermissionMatrixColumn): string {
  return `${row.resource}:${column.action}`
}

/**
 * 카탈로그의 모든 권한(`'*'` 제외)이 어느 한 칸에 놓였는지 검사한다. 아니면 빠진 키를 나열하며 던진다.
 * 템플릿의 테스트에서 부른다 — 권한을 카탈로그에 더하고 매트릭스에 안 넣으면 그 권한은 화면에서 줄 길이 없다.
 * 카탈로그에 없는 칸이 있는 것은 괜찮다(비활성으로 그린다).
 */
export function assertMatrixCoversPermissions(
  categories: readonly PermissionMatrixCategory[],
  permissions: readonly string[],
): void {
  const placed = new Set(
    categories.flatMap((category) =>
      category.rows.flatMap((row) => category.columns.map((column) => matrixCellKey(row, column))),
    ),
  )
  const missing = permissions.filter(
    (permission) => permission !== ALL_PERMISSION && !placed.has(permission),
  )
  if (missing.length > 0) {
    throw new Error(`권한 매트릭스에 칸이 없는 권한: ${missing.join(', ')}`)
  }
}
