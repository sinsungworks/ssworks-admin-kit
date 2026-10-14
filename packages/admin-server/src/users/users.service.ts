import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  toListQuery,
  type AdminUserCreate,
  type AdminUserUpdate,
  type Paginated,
} from '@ssworks/admin-shared'
import { sql, type Kysely } from 'kysely'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { fromDateColumn, startOfDayIn, todayIn } from '../accounts/calendar.js'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { ResolvedUsersConfig } from '../accounts/options.js'
import { permissionsOrEmpty } from '../accounts/permissions-column.js'
import { reauthenticate } from '../accounts/reauth.js'
import { withSuperAdminSurvival } from '../accounts/super-admin.js'
import { generateTemporaryPassword } from '../accounts/temporary-password.js'
import { hashPassword } from '../auth/password.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'
import { correctJoinDate, insertPeriod } from './employment.js'
import { fieldError, noUser, userRevisionConflict } from './errors.js'
import { lockGrantRole, lockTeam, lockUser, replaceTeam } from './user-locks.js'
import { readUser, toUserView, userViewQuery, type AdminUserView } from './user-view.js'
import { userListCondition, type AdminUserListQuery } from './users.query.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(목록 · 퇴사 · 정정 · 재입사 · 치유 · 세션 폐기 · 감사) +
//       ssworks-gise-home 계정 서비스(생성 임시 비밀번호 · 초기화 · 잠금 해제) + kim5257-crm-v5(활성 구간 ≤ 1)
// 바꾼 점:
//  - 목록은 팀 LEFT JOIN · 소속 전체 필터 · 마지막 구간 날짜(B9 · B10). 관리 쿼리는 코어 users 를 직접 읽는다(2c B4).
//  - 쓰기는 대상 users ⋈ roles 를 잠그고 judgeAccountCommand 로 판정한다(② E1 · B8) — 정본 넷 중 서버 자기 보호는 gise 뿐.
//  - 날짜 ↔ 효력 시각은 accounts/calendar.ts 하나(⑤ Z1).
// 🔴 재인증 · argon2 는 트랜잭션 밖 · 권한 가드 뒤(2b §4-7). 임시 비밀번호는 응답에만 — 감사 가방 · 로그에 넣지 않는다.

/** 재직 이력 한 줄 — 날짜는 'YYYY-MM-DD' */
export type AdminEmploymentPeriodView = {
  periodNo: bigint
  joinDate: string
  resignDate: string | null
  reason: string | null
  recordedTimezone: string
  createdBy: bigint | null
  createdByName: string | null
  createAt: Date
}

export interface AdminUserCreateBody extends AdminUserCreate {
  currentPassword?: string
}

export interface AdminUserUpdateBody extends AdminUserUpdate {
  currentPassword?: string
}

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger('AdminUsersService')

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_ACCOUNTS_CONFIG) private readonly config: ResolvedUsersConfig,
    private readonly sessions: AdminSessionStore,
    // 🔴 @Optional — AdminAuthModule 이 빠진 앱이 DI 해석 오류가 아니라 모듈 기동 검사의 문구로 멈추게(2c R2 와 같은 이유)
    @Optional() private readonly reauthService?: AdminReauthService,
  ) {}

  async list(query: AdminUserListQuery): Promise<Paginated<AdminUserView>> {
    const { offset, limit, sort } = toListQuery(query)
    const where = userListCondition(query.filter)
    const now = new Date()
    return runQuery(async () => {
      const counted = await this.db
        .selectFrom('users as u')
        .where(where)
        .select((eb) => eb.fn.countAll<number | string | bigint>().as('n'))
        .executeTakeFirstOrThrow()
      let rows = userViewQuery(this.db).where(where)
      for (const { column, order } of sort) rows = rows.orderBy(`u.${column}`, order)
      const result = await rows.orderBy('u.userNo', 'desc').limit(limit).offset(offset).execute()
      return {
        items: result.map((row) => toUserView(row, this.config.timeZone, now)),
        total: BigInt(counted.n),
        page: query.page,
        itemsPerPage: query.itemsPerPage,
      }
    })
  }

  findOne(userNo: bigint): Promise<AdminUserView> {
    return runQuery(() => readUser(this.db, userNo, this.config.timeZone))
  }

  /** 입사일 내림차순 · 기록자 이름(LEFT JOIN — 최초 입사 행은 기록자 없음). 사용자가 없으면 404 */
  periods(userNo: bigint): Promise<{ items: AdminEmploymentPeriodView[] }> {
    return runQuery(async () => {
      const user = await this.db
        .selectFrom('users')
        .select('userNo')
        .where('userNo', '=', userNo)
        .executeTakeFirst()
      if (user === undefined) throw noUser()
      const rows = await this.db
        .selectFrom('userEmploymentPeriods as p')
        .leftJoin('users as c', 'c.userNo', 'p.createdBy')
        .select([
          'p.periodNo',
          'p.joinAt',
          'p.resignAt',
          'p.reason',
          'p.recordedTimezone',
          'p.createdBy',
          'c.userName as createdByName',
          'p.createAt',
        ])
        .where('p.userNo', '=', userNo)
        .orderBy('p.joinAt', 'desc')
        .orderBy('p.periodNo', 'desc')
        .execute()
      return {
        items: rows.map((row) => ({
          periodNo: row.periodNo,
          joinDate: fromDateColumn(row.joinAt),
          resignDate: row.resignAt === null ? null : fromDateColumn(row.resignAt),
          reason: row.reason,
          recordedTimezone: row.recordedTimezone,
          createdBy: row.createdBy,
          createdByName: row.createdByName,
          createAt: row.createAt,
        })),
      }
    })
  }
  /**
   * 계정 만들기 — 서버가 임시 비밀번호를 만든다(⑥ P1). 잔존을 늘리기만 해 센티넬을 잡지 않는다(§5-3).
   * 🔴 임시 비밀번호는 돌려주기만 한다 — 저장은 해시, 감사 · 로그에는 남기지 않는다(공통 11).
   */
  async create(
    body: AdminUserCreateBody,
    principal: AdminPrincipal,
  ): Promise<{ item: AdminUserView; temporaryPassword: string }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const temporaryPassword = generateTemporaryPassword()
    // 🔴 argon2 는 트랜잭션 밖 — 해시가 행 잠금을 쥔 채 돌지 않게(2b §4-7)
    const passwordHash = await hashPassword(temporaryPassword)
    const timeZone = this.config.timeZone
    const joinDate = body.joinDate ?? todayIn(timeZone)
    const actor = actorOf(principal)
    const item = await this.guardUserId(() =>
      runWriteTransaction(this.db, async (trx) => {
        const role = await lockGrantRole(trx, body.roleNo)
        judgeAccountCommand(actor, { kind: 'user.create', grant: this.permissionsOf(role) })
        if (body.teamNo !== null) await lockTeam(trx, body.teamNo)
        const inserted = await trx
          .insertInto('users')
          .values({
            userId: body.userId,
            password: passwordHash,
            userName: body.userName,
            roleNo: body.roleNo,
            joinAt: startOfDayIn(joinDate, timeZone),
            isPasswordChangeRequired: true,
          })
          .executeTakeFirstOrThrow()
        const userNo = inserted.insertId
        if (userNo === undefined) throw new Error('users INSERT 가 insertId 를 돌려주지 않았다.')
        if (body.teamNo !== null) {
          await trx.insertInto('teamUserMap').values({ teamNo: body.teamNo, userNo }).execute()
        }
        await insertPeriod(trx, { userNo, joinDate, reason: null, createdBy: null })
        // 🔴 같은 트랜잭션에서 읽는다(§14 R5-2)
        return readUser(trx, userNo, timeZone)
      }),
    )
    return { item, temporaryPassword }
  }

  /**
   * 수정 — revision 필수(⑧ V1). 역할을 바꾸면 잔존을 줄일 수 있어 센티넬로 감싼다. 팀은 하나로 바꾸고(⑨ T1), 입사일은
   * 마지막 구간을 정정한다.
   */
  async update(
    userNo: bigint,
    body: AdminUserUpdateBody,
    principal: AdminPrincipal,
  ): Promise<{ item: AdminUserView; before: AdminUserView }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const timeZone = this.config.timeZone
    const actor = actorOf(principal)
    return runWriteTransaction(this.db, async (trx) => {
      const write = async (): Promise<AdminUserView> => {
        const target = await lockUser(trx, userNo)
        const grant =
          body.roleNo === undefined
            ? undefined
            : this.permissionsOf(await lockGrantRole(trx, body.roleNo))
        // 🔴 판정이 revision 보다 먼저다 — 권한 없는 사람에게 revision 상태를 드러내지 않는다(B7)
        judgeAccountCommand(actor, {
          kind: 'user.update',
          targetUserNo: userNo,
          current: this.permissionsOf(target),
          grant,
        })
        if (body.revision !== target.revision) throw userRevisionConflict()
        const before = await readUser(trx, userNo, timeZone)
        if (body.joinDate !== undefined) await correctJoinDate(trx, userNo, body.joinDate)
        if (body.teamNo !== undefined) await replaceTeam(trx, userNo, body.teamNo)
        await trx
          .updateTable('users')
          .set((eb) => ({
            ...(body.userName === undefined ? {} : { userName: body.userName }),
            ...(body.roleNo === undefined ? {} : { roleNo: body.roleNo }),
            ...(body.joinDate === undefined
              ? {}
              : { joinAt: startOfDayIn(body.joinDate, timeZone) }),
            revision: eb('revision', '+', 1),
            updateAt: sql<Date>`current_timestamp`,
          }))
          .where('userNo', '=', userNo)
          .execute()
        return before
      }
      // 🔴 역할을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3)
      const before =
        body.roleNo === undefined ? await write() : await withSuperAdminSurvival(trx, write)
      // 🔴 같은 트랜잭션에서 읽는다 — 응답 · 감사 after 가 이 쓰기의 결과다(§14 R5-2)
      return { item: await readUser(trx, userNo, timeZone), before }
    })
  }

  /** 아이디 UNIQUE 위반을 400 userId 칸 오류로(B1 — 제약 이름으로 가른다, §14 R1-6) */
  private async guardUserId<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (isDuplicateOf(error, 'uq_users_user_id')) {
        throw fieldError('userId', ACCOUNT_MESSAGES.duplicateUserId)
      }
      throw error
    }
  }

  private permissionsOf(row: { roleNo: bigint; permissions: unknown }): string[] {
    return permissionsOrEmpty(row, this.logger)
  }
}
