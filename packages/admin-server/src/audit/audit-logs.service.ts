import { Inject, Injectable } from '@nestjs/common'
import { toListQuery, type AdminAuditLogQuery, type Paginated } from '@ssworks/admin-shared'
import { sql, type Kysely, type SqlBool } from 'kysely'
import { readJsonColumn } from '../database/json.js'
import { likePrefix } from '../database/like.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { validationError } from '../http/validation.js'
import { KYSELY } from '../tokens.js'
import { AUDIT_MESSAGES } from './errors.js'

// 정본: hangang-home apps/api/src/modules/audit-logs/audit-logs.service.ts(필터 · 반열림 · actionMatch · LEFT JOIN)
// 바꾼 점: 행위자 컬럼 actorUserNo(2c 스펙 B5), 응답에 actionLabel 을 싣지 않는다 — 화면이 admin-shared 카탈로그의 labelOf
//   로 읽는다. 기간 순서는 여기서 본다(스키마에 refine 을 걸지 않는다 — B14). 읽기 마스킹(hangang maskCiphertext)은 없다 —
//   모든 meta 가 쓸 때 소독된다.

export interface AdminAuditLogRow {
  logNo: bigint
  actorUserNo: bigint | null
  actorUserId: string | null
  actorUserName: string | null
  sessionNo: bigint | null
  action: string
  targetType: string | null
  targetRefNo: bigint | null
  method: string
  path: string
  statusCode: number
  errorCode: string | null
  ip: string | null
  userAgent: string | null
  meta: unknown
  createAt: Date
}

@Injectable()
export class AdminAuditLogsService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async list(query: AdminAuditLogQuery): Promise<Paginated<AdminAuditLogRow>> {
    const filter = query.filter ?? {}
    if (
      filter.from !== undefined &&
      filter.to !== undefined &&
      Date.parse(filter.from) >= Date.parse(filter.to)
    ) {
      throw validationError([
        { path: ['filter', 'to'], code: 'custom', message: AUDIT_MESSAGES.periodOrder },
      ])
    }
    const { offset, limit, sort } = toListQuery(query)
    const order = sort[0]?.order ?? 'desc'

    return runQuery(async () => {
      let base = this.db
        .selectFrom('auditLogs as a')
        .leftJoin('users as u', 'u.userNo', 'a.actorUserNo')
      if (filter.actorUserNo !== undefined)
        base = base.where('a.actorUserNo', '=', filter.actorUserNo)
      if (filter.action !== undefined) {
        base =
          filter.actionMatch === 'exact'
            ? base.where('a.action', '=', filter.action)
            : // 🔴 접두 — session.revoke 는 .user · .self · .others 도 잡는다. 정확히 하나만 보려면 actionMatch: 'exact'.
              base.where(
                sql<SqlBool>`${sql.ref('a.action')} like ${likePrefix(filter.action)} escape '!'`,
              )
      }
      if (filter.targetType !== undefined) base = base.where('a.targetType', '=', filter.targetType)
      if (filter.targetRefNo !== undefined)
        base = base.where('a.targetRefNo', '=', filter.targetRefNo)
      if (filter.from !== undefined) base = base.where('a.createAt', '>=', new Date(filter.from))
      // 🔴 반열림 — `<=` 는 화면이 보낸 "다음 날 0시" 를 포함하거나, 날짜만 보내면 마지막 날을 통째로 뺐다(hangang).
      if (filter.to !== undefined) base = base.where('a.createAt', '<', new Date(filter.to))

      const counted = await base
        .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
        .executeTakeFirstOrThrow()
      const rows = await base
        .select([
          'a.logNo',
          'a.actorUserNo',
          'u.userId as actorUserId',
          'u.userName as actorUserName',
          'a.sessionNo',
          'a.action',
          'a.targetType',
          'a.targetRefNo',
          'a.method',
          'a.path',
          'a.statusCode',
          'a.errorCode',
          'a.ip',
          'a.userAgent',
          'a.meta',
          'a.createAt',
        ])
        .orderBy('a.createAt', order)
        .orderBy('a.logNo', order)
        .limit(limit)
        .offset(offset)
        .execute()

      return {
        items: rows.map((row) => ({ ...row, meta: readJsonColumn(row.meta) })),
        total: BigInt(counted.n),
        page: query.page,
        itemsPerPage: query.itemsPerPage,
      }
    })
  }
}
