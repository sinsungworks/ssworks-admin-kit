import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/roles.table.ts
// 바꾼 점: `revision` 추가. `permissions` 의 읽기 타입을 unknown 으로 — 드라이버 autoJsonMap 이 파싱된 값과 문자열 둘 다
//   줄 수 있어 `readJsonColumn` + zod 를 거치게 한다(gise). 프로젝트 권한 타입은 패키지가 모른다.

export interface AdminRolesTable {
  roleNo: Generated<bigint>
  roleName: string
  /** JSON 문자열 배열. 쓰기는 `JSON.stringify`, 읽기는 `readJsonColumn` + zod */
  permissions: ColumnType<unknown, string, string>
  displayOrder: Generated<number>
  isDefault: Generated<boolean>
  revision: Generated<number>
  createAt: ColumnType<Date, never, never>
  updateAt: ColumnType<Date, never, never>
}
