import type { ColumnType } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/audit-logs.table.ts
// 바꾼 점: 2c 스펙 §4-8 의 컬럼(actorUserNo · sessionNo · errorCode, NULL 허용). 🔴 append-only — 갱신 타입을 never 로 막는다
//   (gise audit-log-append-only 테스트의 뜻을 타입으로).

/** 넣을 수 있고 고칠 수 없다 */
type AppendOnly<T> = ColumnType<T, T, never>

export interface AdminAuditLogsTable {
  logNo: ColumnType<bigint, never, never>
  actorUserNo: AppendOnly<bigint | null>
  sessionNo: AppendOnly<bigint | null>
  action: AppendOnly<string>
  targetType: AppendOnly<string | null>
  targetRefNo: AppendOnly<bigint | null>
  method: AppendOnly<string>
  path: AppendOnly<string>
  statusCode: AppendOnly<number>
  errorCode: AppendOnly<string | null>
  ip: AppendOnly<string | null>
  userAgent: AppendOnly<string | null>
  /** 쓰기는 JSON 문자열, 읽기는 드라이버가 파싱한 값 — `readJsonColumn` 을 거친다(2c 스펙 §14 R1-4) */
  meta: ColumnType<unknown, string | null, never>
  createAt: ColumnType<Date, never, never>
}
