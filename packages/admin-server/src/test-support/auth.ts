import type { Request } from 'express'
import type { Kysely } from 'kysely'
import { createConnection } from 'mariadb'
import { AdminAccessTokenService } from '../auth/access-token.service.js'
import { AdminAuthService } from '../auth/auth.service.js'
import type {
  AdminAccessContext,
  AdminAccessPolicy,
  AdminAuthEvent,
  AdminAuthEventSink,
} from '../auth/hooks.js'
import { KyselyAuthRepository } from '../auth/kysely-auth.repository.js'
import {
  resolveAuthConfig,
  type AdminAuthOptions,
  type ResolvedAuthConfig,
} from '../auth/options.js'
import { hashPassword } from '../auth/password.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import type { AdminDatabase } from '../database/types.js'
import type { TestDatabase } from './db.js'
import { testDbServer } from './db-url.js'

// 테스트 전용 — 인증 테스트의 계정 시드. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// argon2 해시가 한 번에 약 15ms 라(스펙 §14 R1-2) 시드마다 그냥 해시한다.

let sequence = 0

export async function seedRole(
  db: Kysely<AdminDatabase>,
  input: { roleName?: string; permissions?: unknown } = {},
): Promise<bigint> {
  sequence += 1
  const result = await db
    .insertInto('roles')
    .values({
      roleName: input.roleName ?? `역할${sequence}`,
      permissions: JSON.stringify(input.permissions ?? ['*']),
    })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

export interface SeedUserInput {
  roleNo: bigint
  userId?: string
  /** 평문 — 시드가 해시한다 */
  password?: string
  userName?: string
  resignAt?: Date | null
  isPasswordChangeRequired?: boolean
  loginFailCount?: number
  lockUntil?: Date | null
}

export interface SeededUser {
  userNo: bigint
  userId: string
  password: string
}

export async function seedUser(
  db: Kysely<AdminDatabase>,
  input: SeedUserInput,
): Promise<SeededUser> {
  sequence += 1
  const userId = input.userId ?? `user${sequence}`
  const password = input.password ?? `pw-${sequence}-secret`
  const result = await db
    .insertInto('users')
    .values({
      userId,
      password: await hashPassword(password),
      userName: input.userName ?? `사용자${sequence}`,
      roleNo: input.roleNo,
      resignAt: input.resignAt ?? null,
      isPasswordChangeRequired: input.isPasswordChangeRequired ?? false,
      loginFailCount: input.loginFailCount ?? 0,
      lockUntil: input.lockUntil ?? null,
    })
    .executeTakeFirstOrThrow()
  return { userNo: result.insertId as bigint, userId, password }
}

export async function seedTeam(db: Kysely<AdminDatabase>, teamName: string): Promise<bigint> {
  const result = await db.insertInto('teams').values({ teamName }).executeTakeFirstOrThrow()
  return result.insertId as bigint
}

export async function addToTeam(
  db: Kysely<AdminDatabase>,
  teamNo: bigint,
  userNo: bigint,
): Promise<void> {
  await db.insertInto('teamUserMap').values({ teamNo, userNo }).execute()
}

/**
 * 🔴 P1(동시 회전 경합)을 결정적으로 재현한다(스펙 §9-3 · §14 R1-4). 별도 연결이 옛 행을 커밋 전 'rotated' 로 잡는다 —
 * 그동안 autocommit 읽기는 옛(살아 있는) 버전을 보고, 같은 행의 조건부 UPDATE 는 `release()` 의 커밋까지 기다렸다가
 * 0행을 받는다.
 */
export async function holdRotation(
  t: TestDatabase,
  sessionNo: bigint,
  replacedBySessionNo: bigint | null,
): Promise<{ release(): Promise<void> }> {
  // 🔴 revoked_at 은 테스트 프로세스 시각으로 넣는다 — DB 컨테이너 시계(UTC_TIMESTAMP)가 호스트보다 5초 넘게 앞서면 유예
  //    판정이 재사용으로 바뀐다. timezone 'Z' + 프로세스 TZ=UTC(vitest env)라 저장 바이트가 UTC 다(2a R8).
  const connection = await createConnection({ ...testDbServer(), database: t.name, timezone: 'Z' })
  await connection.beginTransaction()
  await connection.query(
    "update sessions set is_revoked = 1, revoked_reason = 'rotated', revoked_at = ?, replaced_by_session_no = ? where session_no = ?",
    [new Date(), replacedBySessionNo, sessionNo],
  )
  return {
    async release() {
      try {
        await connection.commit()
      } finally {
        await connection.end()
      }
    },
  }
}

export const TEST_JWT_SECRET = 'admin-kit-test-jwt-secret'.padEnd(32, '-')

/** 서비스 테스트용 요청 — ip · User-Agent · 쿠키만 */
export function fakeRequest(
  input: { ip?: string; userAgent?: string; cookies?: Record<string, unknown> } = {},
): Request {
  return {
    ip: input.ip ?? '10.0.0.1',
    headers: { 'user-agent': input.userAgent ?? 'TestAgent/1.0' },
    cookies: input.cookies ?? {},
    secure: false,
  } as unknown as Request
}

/** `ADMIN_AUTH_EVENTS` 가짜 — 받은 이벤트를 모은다. `failWith` 가 있으면 던진다 */
export class RecordingEvents implements AdminAuthEventSink {
  readonly events: AdminAuthEvent[] = []
  failWith: Error | null = null

  async record(event: AdminAuthEvent): Promise<void> {
    if (this.failWith != null) throw this.failWith
    this.events.push(event)
  }

  /** 'login.blocked' 는 'login.blocked:locked' 처럼 사유를 붙인다 */
  types(): string[] {
    return this.events.map((event) =>
      event.type === 'login.blocked' || event.type === 'access.blocked'
        ? `${event.type}:${event.reason}`
        : event.type,
    )
  }
}

/** `ADMIN_ACCESS_POLICY` 가짜 — `allow` 로 답하고 받은 문맥을 모은다 */
export class SwitchablePolicy implements AdminAccessPolicy {
  allow = true
  readonly calls: AdminAccessContext[] = []

  async allows(context: AdminAccessContext): Promise<boolean> {
    this.calls.push(context)
    return this.allow
  }
}

export interface AuthKit {
  config: ResolvedAuthConfig
  repo: KyselyAuthRepository
  store: AdminSessionStore
  tokens: AdminAccessTokenService
  service: AdminAuthService
  reauth: AdminReauthService
  events: RecordingEvents
  policy: SwitchablePolicy
}

/** Nest 없이 서비스를 조립한다. `policy: false` 면 정책을 주입하지 않는다 */
export function createAuthKit(
  t: TestDatabase,
  options: { auth?: Partial<AdminAuthOptions>; policy?: boolean } = {},
): AuthKit {
  const config = resolveAuthConfig({ jwtSecret: TEST_JWT_SECRET, ...options.auth }, undefined)
  const repo = new KyselyAuthRepository(t.db)
  const store = new AdminSessionStore(t.db)
  const tokens = new AdminAccessTokenService(config)
  const events = new RecordingEvents()
  const policy = new SwitchablePolicy()
  const service = new AdminAuthService(
    config,
    repo,
    store,
    tokens,
    t.db,
    options.policy === false ? undefined : policy,
    events,
  )
  return {
    config,
    repo,
    store,
    tokens,
    service,
    reauth: new AdminReauthService(config, repo),
    events,
    policy,
  }
}
