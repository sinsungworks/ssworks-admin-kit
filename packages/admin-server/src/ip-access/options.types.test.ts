import type { Generated, Kysely, Transaction } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { AdminDatabase } from '../database/types.js'
import type { AdminServerOptions } from '../options.js'
import type { AdminIpExtraScopeService } from './extra-scope.service.js'

// 확장 범위 훅 타입(확장 범위 스펙 X5). 🔴 typecheck 가 재는 시험이다 — 쓰는 쪽 `interface Database extends AdminDatabase` 의
// Transaction<Database> 로 적은 훅이 옵션에 들어가야 한다. 들어가지 않으면 `pnpm typecheck` 가 이 파일에서 실패한다.

interface ShippingTokensTable {
  tokenNo: Generated<bigint>
  tokenName: string
}

interface Database extends AdminDatabase {
  shippingTokens: ShippingTokensTable
}

describe('확장 범위 옵션 타입', () => {
  it('🔴 쓰는 쪽 Transaction<Database> · Kysely<Database> 로 적은 훅이 들어간다', () => {
    const options: Pick<AdminServerOptions, 'ipAccess'> = {
      ipAccess: {
        extraScopes: [
          {
            type: 'shippingToken',
            target: {
              async lock(trx: Transaction<Database>, refNo: bigint) {
                const row = await trx
                  .selectFrom('shippingTokens')
                  .select('tokenNo')
                  .where('tokenNo', '=', refNo)
                  .forUpdate()
                  .executeTakeFirst()
                return row !== undefined
              },
              async names(db: Kysely<Database>, refNos: readonly bigint[]) {
                const rows = await db
                  .selectFrom('shippingTokens')
                  .select(['tokenNo', 'tokenName'])
                  .where('tokenNo', 'in', refNos)
                  .execute()
                return new Map(rows.map((row) => [row.tokenNo, row.tokenName]))
              },
            },
          },
        ],
      },
    }
    expect(options.ipAccess?.extraScopes).toHaveLength(1)
  })

  it('🔴 countRulesOf 가 쓰는 쪽 Transaction<Database> · Kysely<Database> 를 형변환 없이 받는다', () => {
    // typecheck 가 재는 시험 — 실행하지 않는다(호출만 컴파일)
    const callCount = async (
      svc: AdminIpExtraScopeService,
      trx: Transaction<Database>,
      db: Kysely<Database>,
    ) => [
      await svc.countRulesOf('shippingToken', 1n, trx),
      await svc.countRulesOf('shippingToken', 1n, db),
    ]
    expect(callCount).toBeTypeOf('function')
  })
})
