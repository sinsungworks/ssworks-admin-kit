import { Inject, Injectable } from '@nestjs/common'
import { BusinessError, CommonErrorCodes, toListQuery, type Paginated } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminPrincipal } from '../auth/principal.js'
import {
  AdminSessionStore,
  type AdminSessionListRow,
  type AdminSessionMeta,
} from '../auth/session.store.js'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import { SESSION_MESSAGES } from './errors.js'
import type { AdminSessionListQuery } from './sessions.query.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.service.ts(5라우트 · terminated · 남의 세션 404 · runQuery) +
//       ssworks-gise-home apps/api/src/modules/auth/admin-me.service.ts(지금 세션 거부 · revoke-others · { revokedCount })
// 바꾼 점: 살아 있는 세션만(공통 1), isCurrent 는 액세스 토큰의 sessionNo(공통 2), 지금 세션 거부는 400(③ C1 — gise 403),
//   관리자 "사용자 전체" 는 본인에게도 열린다(admin-ui onSelfSignedOut — gise 는 막았다). 권한 상승 검사는 2d(⑪ D1).

export interface AdminSessionView extends AdminSessionMeta {
  isCurrent: boolean
}

export interface AdminSessionListView extends AdminSessionListRow {
  isCurrent: boolean
}

@Injectable()
export class AdminSessionsService {
  constructor(
    private readonly store: AdminSessionStore,
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
  ) {}

  async list(
    query: AdminSessionListQuery,
    principal: AdminPrincipal,
  ): Promise<Paginated<AdminSessionListView>> {
    const { offset, limit, sort } = toListQuery(query)
    const keyword = query.filter?.keyword
    const userNo = query.filter?.userNo
    const { rows, total } = await this.store.listLive({
      now: new Date(),
      ...(keyword ? { keyword } : {}),
      ...(userNo === undefined ? {} : { userNo }),
      sort,
      offset,
      limit,
    })
    return {
      items: rows.map((row) => ({ ...row, isCurrent: row.sessionNo === principal.sessionNo })),
      total,
      page: query.page,
      itemsPerPage: query.itemsPerPage,
    }
  }

  async listMine(principal: AdminPrincipal): Promise<{ items: AdminSessionView[] }> {
    const rows = await this.store.listLiveOfUser(principal.userNo, new Date())
    return {
      items: rows.map((row) => ({ ...row, isCurrent: row.sessionNo === principal.sessionNo })),
    }
  }

  /** 관리자 하나 끝내기. 🔴 지금 세션 검사가 UPDATE 보다 먼저다 — 본인 세션이라 드러낼 것이 없다 */
  async revoke(sessionNo: bigint, principal: AdminPrincipal): Promise<void> {
    if (sessionNo === principal.sessionNo) throw currentSession()
    if ((await this.store.revokeLive(sessionNo, new Date())) === 0) throw notFound()
  }

  /** 사용자 전체. 본인이면 지금 세션도 끊긴다 — 다음 요청이 401(admin-ui onSelfSignedOut, 2c 스펙 공통 4) */
  async revokeUser(userNo: bigint): Promise<number> {
    const user = await runQuery(() =>
      this.db.selectFrom('users').select('userNo').where('userNo', '=', userNo).executeTakeFirst(),
    )
    if (user === undefined) {
      throw new BusinessError(CommonErrorCodes.ERR_NO_USER, SESSION_MESSAGES.noUser)
    }
    return this.store.revokeAllOfUser(userNo, 'terminated', new Date(), { liveOnly: true })
  }

  /** 내 세션 하나. 🔴 남의 세션 · 없음 · 끝남이 같은 404 — 내 userNo 를 조건에 단 UPDATE 한 문장이 가른다 */
  async revokeMine(sessionNo: bigint, principal: AdminPrincipal): Promise<void> {
    if (sessionNo === principal.sessionNo) throw currentSession()
    const revoked = await this.store.revokeLive(sessionNo, new Date(), { userNo: principal.userNo })
    if (revoked === 0) throw notFound()
  }

  /** 다른 세션 모두 — 지금 세션을 뺀 살아 있는 것. 0 도 정상이다 */
  revokeOthers(principal: AdminPrincipal): Promise<number> {
    return this.store.revokeAllOfUser(principal.userNo, 'terminated', new Date(), {
      exceptSessionNo: principal.sessionNo,
      liveOnly: true,
    })
  }
}

function currentSession(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_BAD_REQUEST, SESSION_MESSAGES.currentSession)
}

function notFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, SESSION_MESSAGES.notFound)
}
