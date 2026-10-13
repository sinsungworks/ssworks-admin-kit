import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Kysely, Transaction } from 'kysely'
import { readJsonColumn } from '../database/json.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import type {
  AdminAuthRepository,
  AdminCredential,
  AdminLoginState,
  AdminPrincipalRecord,
} from './auth.repository.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.repository.ts(KyselyAuthRepository) + hangang-home
//       modules/auth/auth.service.ts `primaryTeamQuery`(대표 팀 R34) · users.service.ts `findMeByUserNo`(역할 조인)
// 바꾼 점:
//  - 코어 users 컬럼(hangang 이름)을 읽는다. 대표 팀은 LEFT JOIN — 팀 없는 계정도 인증된다(hangang 은 INNER 라 팀 미배정
//    계정이 401 이었다). IP team 층은 2f 가 teamNos 가 빈 경우를 다룬다.
//  - 권한 JSON 이 배열이 아니면 [] + 경고(fail-closed) — 깨진 JSON 이 500 으로 그 역할 전원을 막지 않는다.

@Injectable()
export class KyselyAuthRepository implements AdminAuthRepository {
  private readonly logger = new Logger('KyselyAuthRepository')

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  async findCredentialByUserId(userId: string): Promise<AdminCredential | null> {
    const row = await runQuery(() =>
      this.credentialQuery().where('userId', '=', userId).executeTakeFirst(),
    )
    return row ?? null
  }

  async findCredentialByNo(userNo: bigint): Promise<AdminCredential | null> {
    const row = await runQuery(() =>
      this.credentialQuery().where('userNo', '=', userNo).executeTakeFirst(),
    )
    return row ?? null
  }

  async findPrincipal(userNo: bigint): Promise<AdminPrincipalRecord | null> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('users')
        .innerJoin('roles', 'roles.roleNo', 'users.roleNo')
        // 🔴 대표 팀 = 가장 작은 teamNo(hangang R34) — 로그인 · 가드 · 2f IP 판정이 같은 팀을 본다. 다중 팀은 범위 밖.
        .leftJoin(
          (eb) =>
            eb
              .selectFrom('teamUserMap')
              .select((sub) => [
                'teamUserMap.userNo',
                sub.fn.min('teamUserMap.teamNo').as('teamNo'),
              ])
              .where('teamUserMap.userNo', '=', userNo)
              .groupBy('teamUserMap.userNo')
              .as('primaryTeam'),
          (join) => join.onRef('primaryTeam.userNo', '=', 'users.userNo'),
        )
        .leftJoin('teams', 'teams.teamNo', 'primaryTeam.teamNo')
        .select([
          'users.userNo',
          'users.userId',
          'users.userName',
          'users.roleNo',
          'roles.roleName',
          'roles.permissions',
          'teams.teamNo',
          'teams.teamName',
          'users.isPasswordChangeRequired',
          'users.resignAt',
        ])
        .where('users.userNo', '=', userNo)
        .executeTakeFirst(),
    )
    if (row == null) return null
    return {
      userNo: row.userNo,
      userId: row.userId,
      userName: row.userName,
      roleNo: row.roleNo,
      roleName: row.roleName,
      teamNo: row.teamNo ?? null,
      teamName: row.teamName ?? null,
      permissions: this.readPermissions(row.roleNo, row.permissions),
      isPasswordChangeRequired: row.isPasswordChangeRequired,
      resignAt: row.resignAt,
    }
  }

  async saveLoginState(userNo: bigint, state: AdminLoginState): Promise<void> {
    await runQuery(() =>
      this.db
        .updateTable('users')
        .set({ loginFailCount: state.loginFailCount, lockUntil: state.lockUntil })
        .where('userNo', '=', userNo)
        .execute(),
    )
  }

  async changePassword(
    trx: Transaction<AdminDatabase>,
    userNo: bigint,
    expectedHash: string,
    newHash: string,
  ): Promise<number> {
    // 트랜잭션 안이라 runQuery 로 감싸지 않는다 — runWriteTransaction 이 드라이버 오류를 바꾼다.
    const result = await trx
      .updateTable('users')
      .set({
        password: newHash,
        isPasswordChangeRequired: false,
        loginFailCount: 0,
        lockUntil: null,
      })
      .where('userNo', '=', userNo)
      .where('password', '=', expectedHash)
      .executeTakeFirst()
    return Number(result.numUpdatedRows)
  }

  private credentialQuery() {
    return this.db
      .selectFrom('users')
      .select([
        'userNo',
        'password as passwordHash',
        'resignAt',
        'loginFailCount',
        'lockUntil',
        'isPasswordChangeRequired',
      ])
  }

  private readPermissions(roleNo: bigint, value: unknown): string[] {
    let parsed: unknown
    try {
      parsed = readJsonColumn(value)
    } catch {
      parsed = undefined
    }
    if (!Array.isArray(parsed)) {
      this.logger.warn(`역할 ${roleNo} 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.`)
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string')
  }
}
