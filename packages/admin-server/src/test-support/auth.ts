import type { Kysely } from 'kysely'
import { hashPassword } from '../auth/password.js'
import type { AdminDatabase } from '../database/types.js'

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
