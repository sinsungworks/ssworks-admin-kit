import { Inject, Injectable, Optional } from '@nestjs/common'
import { toListQuery, type Paginated } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { fromDateColumn } from '../accounts/calendar.js'
import type { ResolvedUsersConfig } from '../accounts/options.js'
import { AdminReauthService } from '../auth/reauth.service.js'
import { AdminSessionStore } from '../auth/session.store.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { ADMIN_ACCOUNTS_CONFIG, KYSELY } from '../tokens.js'
import { noUser } from './errors.js'
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

@Injectable()
export class AdminUsersService {
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
}
