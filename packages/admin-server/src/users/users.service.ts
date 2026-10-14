import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  toListQuery,
  type AdminUserCreate,
  type AdminUserRehire,
  type AdminUserResign,
  type AdminUserResignDate,
  type AdminUserUpdate,
  type Paginated,
} from '@ssworks/admin-shared'
import { sql, type Kysely } from 'kysely'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import {
  dateIn,
  effectiveResignAt,
  fitsTimestampColumn,
  fromDateColumn,
  startOfDayIn,
  toDateColumn,
  todayIn,
} from '../accounts/calendar.js'
import { isDuplicateOf } from '../accounts/duplicate.js'
import { ACCOUNT_MESSAGES } from '../accounts/errors.js'
import type { ResolvedUsersConfig } from '../accounts/options.js'
import { permissionsOrEmpty } from '../accounts/permissions-column.js'
import { reauthenticate } from '../accounts/reauth.js'
import { withSuperAdminSurvival, type LockedWrite } from '../accounts/super-admin.js'
import { generateTemporaryPassword } from '../accounts/temporary-password.js'
import { hashPassword } from '../auth/password.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { runQuery, runWriteTransaction } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'
import {
  correctJoinDate,
  insertPeriod,
  lockActivePeriods,
  lockLatestPeriods,
  reasonOf,
} from './employment.js'
import { fieldError, noUser, userConflict, userRevisionConflict } from './errors.js'
import { lockGrantRole, lockTeam, lockUser, replaceTeam, type LockedUser } from './user-locks.js'
import { readUser, toUserView, userViewQuery, type AdminUserView } from './user-view.js'
import { userListCondition, type AdminUserListQuery } from './users.query.js'

// 정본: hangang-home apps/api/src/modules/users/users.service.ts(목록 · 퇴사 · 정정 · 재입사 · 치유 · 세션 폐기 · 감사) +
//       ssworks-gise-home 계정 서비스(생성 임시 비밀번호 · 초기화 · 잠금 해제) + kim5257-crm-v5(활성 구간 ≤ 1)
// 바꾼 점:
//  - 목록은 팀 LEFT JOIN · 소속 전체 필터 · 마지막 구간 날짜(B9 · B10). 관리 쿼리는 코어 users 를 직접 읽는다(2c B4).
//  - 쓰기는 대상 users ⋈ roles 를 잠그고 judgeAccountCommand 로 판정한다(② E1 · B8) — 정본 넷 중 서버 자기 보호는 gise 뿐.
//  - 날짜 ↔ 효력 시각은 accounts/calendar.ts 하나(⑤ Z1).
//  - 잔존으로 감싼 쓰기(역할을 바꾸는 수정 · 퇴사)는 잠금 단계(대상 · 줄 역할 · 팀 잠금 · 판정 · revision · 상태) 뒤에 셈한다
//    (2d-3 스펙 ① A · C3) — before · item 이 낡지 않고 ON 에서 1020 이 아니다.
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

export interface AdminUserResignBody extends AdminUserResign {
  currentPassword?: string
}

export interface AdminUserResignDateBody extends AdminUserResignDate {
  currentPassword?: string
}

export interface AdminUserRehireBody extends AdminUserRehire {
  currentPassword?: string
}

/** 퇴사 · 퇴사일 정정 · 재입사의 결과 — 감사 diff 의 before 와 meta 를 함께 돌려준다 */
export interface UserEmploymentResult {
  item: AdminUserView
  before: AdminUserView
  meta: Record<string, unknown>
}

/** 본문 없는 쓰기(초기화 · 잠금 해제) — 재인증을 켜면 currentPassword 만 온다 */
export interface AdminUserReauthBody {
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
    const timeZone = this.config.timeZone
    const joinDate = body.joinDate ?? todayIn(timeZone)
    const joinAt = storableInstant('joinDate', startOfDayIn(joinDate, timeZone))
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const temporaryPassword = generateTemporaryPassword()
    // 🔴 argon2 는 트랜잭션 밖 — 해시가 행 잠금을 쥔 채 돌지 않게(2b §4-7)
    const passwordHash = await hashPassword(temporaryPassword)
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
            joinAt,
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
    const timeZone = this.config.timeZone
    const joinAt =
      body.joinDate === undefined
        ? undefined
        : storableInstant('joinDate', startOfDayIn(body.joinDate, timeZone))
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    return runWriteTransaction(this.db, async (trx) => {
      const steps: LockedWrite<LockedUser, AdminUserView> = {
        // 🔴 잠금 읽기 · 판정만(2d-3 스펙 C2 · C3) — 대상 users ⋈ roles · 줄 역할 · 팀. 남이 이 사용자 잠금 없이 바꾸는 행(역할 —
        //    이름 · 기본 · 이동, 팀 — 이름 · 이동)이라 셈(읽기 뷰) 뒤에 잠그면 스냅샷 격리 ON 에서 1020 이다(2e-1 이월).
        //    잠금 순서는 users → roles → teams → (teamUserMap · 재직 이력) — create 와 같은 순서다. 이력을 팀보다 먼저 잠그면
        //    같은 팀에 계정을 만드는 create 와 교착한다(Task 8 리뷰).
        lock: async () => {
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
          if (body.teamNo != null) await lockTeam(trx, body.teamNo)
          return target
        },
        // 셈이 연 읽기 뷰 — 잠근 행은 모두 최신이다(2d-3 스펙 §14 R1-1 · R1-5)
        write: async () => {
          const before = await readUser(trx, userNo, timeZone)
          if (body.joinDate !== undefined) await correctJoinDate(trx, userNo, body.joinDate)
          if (body.teamNo !== undefined) await replaceTeam(trx, userNo, body.teamNo)
          await trx
            .updateTable('users')
            .set((eb) => ({
              ...(body.userName === undefined ? {} : { userName: body.userName }),
              ...(body.roleNo === undefined ? {} : { roleNo: body.roleNo }),
              ...(joinAt === undefined ? {} : { joinAt }),
              revision: eb('revision', '+', 1),
              updateAt: sql<Date>`current_timestamp`,
            }))
            .where('userNo', '=', userNo)
            .execute()
          return before
        },
      }
      // 🔴 역할을 바꾸는 수정만 잔존을 줄일 수 있다 — 센티넬이 트랜잭션의 첫 문장이 되게 감싼다(§5-3)
      const before =
        body.roleNo === undefined
          ? await steps.write(await steps.lock())
          : await withSuperAdminSurvival(trx, steps)
      // 🔴 같은 트랜잭션에서 읽는다 — 응답 · 감사 after 가 이 쓰기의 결과다(§14 R5-2)
      return { item: await readUser(trx, userNo, timeZone), before }
    })
  }

  /**
   * 퇴사(⑤ Z1). 효력 시각(기준 시간대의 퇴사일 다음 날 0시)이 이미 지났으면 그 사용자의 세션을 같은 트랜잭션에서
   * 폐기한다 — 미래면 두고 인증이 그 시각에 막는다(공통 6). 활성 구간이 없으면 users.joinAt 으로 치유한다(공통 7).
   * 🔴 늘 잔존 잠금 — 퇴사 예정(미래)도 셈에서 곧바로 빠진다(§5-3).
   */
  async resign(
    userNo: bigint,
    body: AdminUserResignBody,
    principal: AdminPrincipal,
  ): Promise<UserEmploymentResult> {
    const timeZone = this.config.timeZone
    const effective = storableInstant('resignDate', effectiveResignAt(body.resignDate, timeZone))
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    const reason = reasonOf(body.reason)
    const now = new Date()
    return runWriteTransaction(this.db, (trx) =>
      withSuperAdminSurvival(trx, {
        // 🔴 잠금 읽기 · 판정 · 상태 검사만(2d-3 스펙 C2 · C3)
        lock: async () => {
          const target = await lockUser(trx, userNo)
          // 🔴 판정이 상태보다 먼저(B7)
          judgeAccountCommand(actor, {
            kind: 'user.resign',
            targetUserNo: userNo,
            current: this.permissionsOf(target),
          })
          if (target.resignAt !== null) throw userConflict(ACCOUNT_MESSAGES.alreadyResigned)
          return target
        },
        // 셈이 연 읽기 뷰 — 대상 잠금을 기다린 사이의 커밋(재입사 · 로그인 실패)이 before 에 보인다(2d-3 스펙 §14 R1-1)
        write: async (target) => {
          const before = await readUser(trx, userNo, timeZone)
          const active = await lockActivePeriods(trx, userNo)
          if (active.length > 1) throw userConflict(ACCOUNT_MESSAGES.periodCorrupted)
          const healed = active[0] === undefined
          const period =
            active[0] ??
            (await insertPeriod(trx, {
              userNo,
              joinDate: dateIn(target.joinAt, timeZone),
              reason: null,
              createdBy: null,
            }))
          if (body.resignDate < period.joinDate) {
            throw fieldError('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin)
          }
          await trx
            .updateTable('userEmploymentPeriods')
            .set({ resignAt: toDateColumn(body.resignDate), reason })
            .where('periodNo', '=', period.periodNo)
            .execute()
          await trx
            .updateTable('users')
            .set((eb) => ({
              resignAt: effective,
              revision: eb('revision', '+', 1),
              updateAt: sql<Date>`current_timestamp`,
            }))
            .where('userNo', '=', userNo)
            .execute()
          // 🔴 효력 시각이 이미 지났으면 같은 트랜잭션에서 끊는다 — 커밋되면 그 사용자의 다음 요청은 401(§14 R6-1).
          // 🔴 세션 폐기는 쓰기 단계다(2d-3 스펙 C5) — 잠금 단계로 올리면 대상의 refresh 회전과의 교착에서 퇴사가 희생자가
          //    된다. ON 에서 대상 로그아웃이 셈과 폐기 사이에 커밋되면 1020 → 409 다시 시도(2d-3 스펙 §14 R1-4).
          const revokedCount =
            effective.getTime() <= now.getTime()
              ? await this.sessions.revokeAllOfUser(userNo, 'terminated', now, { trx })
              : 0
          return {
            item: await readUser(trx, userNo, timeZone),
            before,
            meta: { reason, revokedCount, ...(healed ? { healedPeriod: true } : {}), timeZone },
          }
        },
      }),
    )
  }

  /**
   * 퇴사일 정정 — 마지막 구간만. 잔존 잠금 없음(resignAt 이 NULL 아닌 채로 바뀐다). 세션은 건드리지 않는다(hangang) —
   * 과거로 당기면 인증이 다음 요청에서 막는다.
   */
  async correctResignDate(
    userNo: bigint,
    body: AdminUserResignDateBody,
    principal: AdminPrincipal,
  ): Promise<UserEmploymentResult> {
    const timeZone = this.config.timeZone
    const effective = storableInstant('resignDate', effectiveResignAt(body.resignDate, timeZone))
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    const reason = body.reason === undefined ? undefined : reasonOf(body.reason)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.resignDate',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      if (target.resignAt === null) throw userConflict(ACCOUNT_MESSAGES.notResigned)
      const before = await readUser(trx, userNo, timeZone)
      const [last] = await lockLatestPeriods(trx, userNo)
      if (last === undefined) throw userConflict(ACCOUNT_MESSAGES.noPeriodForResign)
      if (body.resignDate < last.joinDate) {
        throw fieldError('resignDate', ACCOUNT_MESSAGES.resignBeforeJoin)
      }
      await trx
        .updateTable('userEmploymentPeriods')
        .set({
          resignAt: toDateColumn(body.resignDate),
          ...(reason === undefined ? {} : { reason }),
        })
        .where('periodNo', '=', last.periodNo)
        .execute()
      await trx
        .updateTable('users')
        .set((eb) => ({
          resignAt: effective,
          revision: eb('revision', '+', 1),
          updateAt: sql<Date>`current_timestamp`,
        }))
        .where('userNo', '=', userNo)
        .execute()
      return {
        item: await readUser(trx, userNo, timeZone),
        before,
        meta: { ...(reason === undefined ? {} : { reason }), timeZone },
      }
    })
  }

  /** 재입사 — 잔존 잠금 없음(셈을 늘리기만 한다). 본인도 된다(B16 — 퇴사 예정인 본인) */
  async rehire(
    userNo: bigint,
    body: AdminUserRehireBody,
    principal: AdminPrincipal,
  ): Promise<UserEmploymentResult> {
    const timeZone = this.config.timeZone
    const joinAt = storableInstant('joinDate', startOfDayIn(body.joinDate, timeZone))
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    const reason = reasonOf(body.reason)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.rehire',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      if (target.resignAt === null) throw userConflict(ACCOUNT_MESSAGES.notResignedForRehire)
      const before = await readUser(trx, userNo, timeZone)
      if ((await lockActivePeriods(trx, userNo)).length > 0) {
        throw userConflict(ACCOUNT_MESSAGES.activePeriodExists)
      }
      const [last] = await lockLatestPeriods(trx, userNo)
      // ⑤ Z1 에서 같은 날은 근무가 겹친다 — 재입사일은 직전 퇴사일 다음 날부터(axion)
      if (last?.resignDate != null && body.joinDate <= last.resignDate) {
        throw fieldError('joinDate', ACCOUNT_MESSAGES.rehireNotAfterResign)
      }
      await insertPeriod(trx, {
        userNo,
        joinDate: body.joinDate,
        reason,
        createdBy: principal.userNo,
      })
      await trx
        .updateTable('users')
        .set((eb) => ({
          joinAt,
          resignAt: null,
          revision: eb('revision', '+', 1),
          updateAt: sql<Date>`current_timestamp`,
        }))
        .where('userNo', '=', userNo)
        .execute()
      return { item: await readUser(trx, userNo, timeZone), before, meta: { reason, timeZone } }
    })
  }

  /**
   * 비밀번호 초기화(3c §9) — 해시 교체 · 강제 변경 · 잠금 해제 · 대상의 살아 있는 세션 폐기를 한 트랜잭션에서(공통 5).
   * 🔴 revision · updateAt 은 그대로(⑧ V1 — 열어 둔 수정 폼을 떨어뜨리지 않는다). 해시는 트랜잭션 밖.
   * 🔴 코어 users.password 를 직접 쓴다 — AUTH_REPOSITORY.changePassword 는 본인 변경(기대 해시 조건)용이다(2c B4).
   * 🔴 임시 비밀번호는 돌려주기만 한다 — 감사 meta 에는 revokedCount 만.
   */
  async resetPassword(
    userNo: bigint,
    body: AdminUserReauthBody,
    principal: AdminPrincipal,
  ): Promise<{ temporaryPassword: string; revokedCount: number }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)
    const actor = actorOf(principal)
    const now = new Date()
    const revokedCount = await runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.passwordReset',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      await trx
        .updateTable('users')
        .set({
          password: passwordHash,
          isPasswordChangeRequired: true,
          loginFailCount: 0,
          lockUntil: null,
        })
        .where('userNo', '=', userNo)
        .execute()
      return this.sessions.revokeAllOfUser(userNo, 'terminated', now, { trx })
    })
    return { temporaryPassword, revokedCount }
  }

  /** 잠금 해제(gise) — 실패 카운터 0 · lockUntil NULL. 잠겨 있지 않아도 된다(B16). revision · updateAt 그대로 */
  async unlock(
    userNo: bigint,
    body: AdminUserReauthBody,
    principal: AdminPrincipal,
  ): Promise<{ lockUntil: Date | null; loginFailCount: number }> {
    await reauthenticate(this.config, this.reauthService, principal, body.currentPassword)
    const actor = actorOf(principal)
    return runWriteTransaction(this.db, async (trx) => {
      const target = await lockUser(trx, userNo)
      judgeAccountCommand(actor, {
        kind: 'user.unlock',
        targetUserNo: userNo,
        current: this.permissionsOf(target),
      })
      await trx
        .updateTable('users')
        .set({ loginFailCount: 0, lockUntil: null })
        .where('userNo', '=', userNo)
        .execute()
      return { lockUntil: target.lockUntil, loginFailCount: target.loginFailCount }
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

/**
 * 🔴 users.joinAt · resignAt 은 TIMESTAMP 다(1970 ~ 2038-01-19). 셈한 순간이 그 밖이면 본문 칸 오류 400 — 그냥 쓰면
 *    ER_TRUNCATED_WRONG_VALUE 가 500 으로 나가거나(엄격 모드) 0000-00-00 으로 조용히 저장된다(최종 리뷰).
 */
function storableInstant(field: 'joinDate' | 'resignDate', instant: Date): Date {
  if (!fitsTimestampColumn(instant)) throw fieldError(field, ACCOUNT_MESSAGES.dateOutOfRange)
  return instant
}
