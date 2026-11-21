import { randomBytes } from 'node:crypto'
import { sql, type Generated, type Kysely, type Transaction } from 'kysely'
import type { AdminClientIpSource } from '../auth/request-meta.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminDatabase } from '../database/types.js'
import {
  resolveIpAccessConfig,
  type AdminIpAccessOptions,
  type AdminIpExtraScope,
  type AdminIpScopeTarget,
  type ResolvedIpAccessConfig,
} from '../ip-access/options.js'

// 테스트 전용 — IP 규칙 시드 · 초기화(2f-1). 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 🔴 규칙은 DB 전역 상태다 — 규칙을 바꾸는 테스트 파일은 beforeEach 로 resetIpRules 를 부른다.

export interface IpRuleSeed {
  /** 코어 셋 또는 확장 범위 이름(대역 probeToken 등) */
  scopeType: string
  scopeRefNo?: bigint | null
  cidr: string
  description?: string | null
}

/** 장 0012 의 시드와 같은 두 행 */
export const SEED_IP_RULES: readonly IpRuleSeed[] = Object.freeze([
  { scopeType: 'global', cidr: '0.0.0.0/0' },
  { scopeType: 'global', cidr: '::/0' },
])

export async function seedIpRule(db: Kysely<AdminDatabase>, input: IpRuleSeed): Promise<bigint> {
  const result = await db
    .insertInto('ipAccessRules')
    .values({
      scopeType: input.scopeType,
      scopeRefNo: input.scopeRefNo ?? null,
      cidr: input.cidr,
      description: input.description ?? null,
    })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

/** 규칙을 모두 지우고 rules(기본 — 장의 시드 두 행)만 넣는다. 넣은 번호를 차례로 돌려준다 */
export async function resetIpRules(
  db: Kysely<AdminDatabase>,
  rules: readonly IpRuleSeed[] = SEED_IP_RULES,
): Promise<bigint[]> {
  await db.deleteFrom('ipAccessRules').execute()
  const ruleNos: bigint[] = []
  for (const rule of rules) ruleNos.push(await seedIpRule(db, rule))
  return ruleNos
}

/** 지금 규칙 — ruleNo 순 */
export function ipRulesOf(db: Kysely<AdminDatabase>) {
  return db
    .selectFrom('ipAccessRules')
    .select(['ruleNo', 'scopeType', 'scopeRefNo', 'cidr', 'description', 'revision'])
    .orderBy('ruleNo')
    .execute()
}

/** IP 서비스 설정 — 재인증 기본 꺼짐 · 출처 req.ip · 확장 범위 없음. 🔴 앱과 같은 해석 함수를 지난다 */
export function ipAccessConfig(
  reauth = false,
  clientIp: AdminClientIpSource = 'req.ip',
  ipAccess?: AdminIpAccessOptions,
): ResolvedIpAccessConfig {
  return resolveIpAccessConfig({
    reauth,
    clientIp,
    ...(ipAccess === undefined ? {} : { ipAccess }),
  })
}

/** 주소가 남은 살아 있는 세션 하나(하루 뒤 만료) — 미리보기 시드 */
export function seedSessionFrom(
  db: Kysely<AdminDatabase>,
  userNo: bigint,
  ipAddress: string | null,
): Promise<bigint> {
  const now = new Date()
  return new AdminSessionStore(db).create({
    userNo,
    refreshTokenHash: randomBytes(32).toString('hex'),
    userAgent: null,
    ipAddress,
    loginAt: now,
    now,
    expireAt: new Date(now.getTime() + 86_400_000),
  })
}

/** 확장 범위 대역 이름 — 쓰는 쪽 출고 토큰 자리 */
export const PROBE_SCOPE = 'probeToken'

interface ProbeTokensTable {
  tokenNo: Generated<bigint>
  tokenName: string
}

/** 쓰는 쪽 DB 모양 — `interface Database extends AdminDatabase` 와 같은 꼴 */
export interface ProbeDatabase extends AdminDatabase {
  probeTokens: ProbeTokensTable
}

/** 테스트 DB 에 쓰는 쪽 토큰 표 자리를 만든다(beforeAll 에서 한 번) */
export async function createProbeTokens(db: Kysely<AdminDatabase>): Promise<void> {
  await sql`create table if not exists probe_tokens (
    token_no bigint unsigned not null auto_increment primary key,
    token_name varchar(50) not null
  ) engine = InnoDB`.execute(db)
}

export async function seedProbeToken(
  db: Kysely<AdminDatabase>,
  tokenName: string,
): Promise<bigint> {
  const result = await (db as unknown as Kysely<ProbeDatabase>)
    .insertInto('probeTokens')
    .values({ tokenName })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

/** 훅이 받은 번호 — lock 은 번호 하나씩, names 는 한 번에 받은 목록 */
export interface ProbeTargetCalls {
  lock: bigint[]
  names: bigint[][]
}

/**
 * 쓰는 쪽 훅 대역. 🔴 쓰는 쪽처럼 Transaction<ProbeDatabase> 로 적는다 — 메서드 꼴 이변성으로 옵션에 들어가는지를 typecheck 가
 * 함께 잰다(확장 범위 스펙 X5).
 */
export function probeTokenTarget(
  calls: ProbeTargetCalls = { lock: [], names: [] },
): AdminIpScopeTarget<ProbeDatabase> {
  return {
    async lock(trx: Transaction<ProbeDatabase>, refNo: bigint) {
      calls.lock.push(refNo)
      const row = await trx
        .selectFrom('probeTokens')
        .select('tokenNo')
        .where('tokenNo', '=', refNo)
        .forUpdate()
        .executeTakeFirst()
      return row !== undefined
    },
    async names(db: Kysely<ProbeDatabase>, refNos: readonly bigint[]) {
      calls.names.push([...refNos])
      const rows = await db
        .selectFrom('probeTokens')
        .select(['tokenNo', 'tokenName'])
        .where('tokenNo', 'in', refNos)
        .execute()
      return new Map(rows.map((row) => [row.tokenNo, row.tokenName]))
    },
  }
}

export function probeScope(
  over: Partial<AdminIpExtraScope<ProbeDatabase>> = {},
): AdminIpExtraScope<ProbeDatabase> {
  return { type: PROBE_SCOPE, target: probeTokenTarget(), ...over }
}
