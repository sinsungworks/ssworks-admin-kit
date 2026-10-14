import { Injectable, Logger } from '@nestjs/common'
import { BusinessError, CommonErrorCodes, toListQuery, type Paginated } from '@ssworks/admin-shared'
import { actorOf, judgeAccountCommand } from '../accounts/account-command.js'
import { readPermissionsColumn } from '../accounts/permissions-column.js'
import type { AdminPrincipal } from '../auth/principal.js'
import {
  AdminSessionStore,
  type AdminSessionListRow,
  type AdminSessionMeta,
  type AdminSessionTarget,
} from '../auth/session.store.js'
import { SESSION_MESSAGES } from './errors.js'
import type { AdminSessionListQuery } from './sessions.query.js'

// 정본: hangang-home apps/api/src/modules/sessions/sessions.service.ts(5라우트 · terminated · 남의 세션 404 · runQuery) +
//       ssworks-gise-home apps/api/src/modules/auth/admin-me.service.ts(지금 세션 거부 · revoke-others · { revokedCount })
//       + ssworks-gise-home account-policy.ts judgeSessionTarget(2d — 권한 상승 검사)
// 바꾼 점: 살아 있는 세션만(공통 1), isCurrent 는 액세스 토큰의 sessionNo(공통 2), 지금 세션 거부는 400(③ C1 — gise 403),
//   관리자 "사용자 전체" 는 본인에게도 열린다(admin-ui onSelfSignedOut — gise 는 막았다). 남의 세션은 주인의 역할을 덮어야
//   끊는다(2d 스펙 §5-5 — 2c ⑪ D1). 조회는 저장소에 둔다 — 이 서비스는 KYSELY 를 직접 쓰지 않는다(단위 테스트의 가짜 저장소).

export interface AdminSessionView extends AdminSessionMeta {
  isCurrent: boolean
}

export interface AdminSessionListView extends AdminSessionListRow {
  isCurrent: boolean
}

@Injectable()
export class AdminSessionsService {
  private readonly logger = new Logger('AdminSessionsService')

  constructor(private readonly store: AdminSessionStore) {}

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

  /**
   * 관리자 하나 끝내기. 🔴 지금 세션 검사가 먼저다 — 본인 세션이라 드러낼 것이 없다. 주인이 없으면(끝난 · 없는 세션) 판정
   * 없이 같은 404, 주인이 나보다 넓으면 403(2c ⑪ D1).
   */
  async revoke(sessionNo: bigint, principal: AdminPrincipal): Promise<void> {
    if (sessionNo === principal.sessionNo) throw currentSession()
    const now = new Date()
    const owner = await this.store.findLiveOwner(sessionNo, now)
    if (owner === null) throw notFound()
    this.judge(principal, owner)
    if ((await this.store.revokeLive(sessionNo, now)) === 0) throw notFound()
  }

  /** 사용자 전체. 본인이면 지금 세션도 끊긴다 — 다음 요청이 401(admin-ui onSelfSignedOut, 2c 스펙 공통 4) */
  async revokeUser(userNo: bigint, principal: AdminPrincipal): Promise<number> {
    const target = await this.store.findUserTarget(userNo)
    if (target === null) {
      throw new BusinessError(CommonErrorCodes.ERR_NO_USER, SESSION_MESSAGES.noUser)
    }
    this.judge(principal, target)
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

  private judge(principal: AdminPrincipal, target: AdminSessionTarget): void {
    let current = readPermissionsColumn(target.permissions)
    if (current === null) {
      // 인증 가드(2b findPrincipal)와 같은 fail-closed — 그 계정은 지금 아무 권한도 없다.
      this.logger.warn(`역할 ${target.roleNo} 의 permissions 가 배열이 아니다 — 빈 권한으로 본다.`)
      current = []
    }
    judgeAccountCommand(actorOf(principal), {
      kind: 'session.target',
      targetUserNo: target.userNo,
      current,
    })
  }
}

function currentSession(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_BAD_REQUEST, SESSION_MESSAGES.currentSession)
}

function notFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, SESSION_MESSAGES.notFound)
}
