import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { KYSELY } from '../tokens.js'
import type { AuditInsert } from './entry.js'

// 정본: hangang-home apps/api/src/core/audit/audit.service.ts `record`
// 바꾼 점: 행은 호출부(인터셉터 · 인증 이벤트 sink)가 다 만들어 온다 — 폭 자르기 · 소독은 entry.ts · scrub.ts 몫. 경고
//   문구는 2c 스펙 B12.

/** 던지지 않는 사유 문자열 */
export function reasonOf(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return '[unserializable]'
  }
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger('AdminAuditService')

  constructor(@Inject(KYSELY) private readonly db: Kysely<AdminDatabase>) {}

  /**
   * 감사 행 하나를 넣는다(자기 연결 — 업무 트랜잭션 밖, 커밋 뒤 · 2c 스펙 ⑤ T1).
   * 🔴 던지지 않는다 — 감사 누락 < 서비스 차단(hangang). 감사 테이블이 잠기거나 차도 로그인 · 저장이 막히면 안 된다.
   * 🔴 그 대가로 구멍은 경고 한 줄로만 드러난다(I7) — 누가 · 무엇을 · 어디서 · 결과를 싣고, meta · IP · UA 는 싣지 않는다.
   *    드라이버 문구는 싣는다 — 풀이 logParam: false 라 바인딩 값이 문구에 나오지 않는다(2a).
   */
  async insert(entry: AuditInsert): Promise<void> {
    try {
      await this.db.insertInto('auditLogs').values(entry).execute()
    } catch (error) {
      this.warn(
        `감사 기록 실패 — actor=${entry.actorUserNo ?? '-'} action=${entry.action} ${entry.method} ${entry.path} status=${entry.statusCode}: ${reasonOf(error)}`,
      )
    }
  }

  /** 🔴 로거가 던져도 삼킨다 — 감사 실패가 응답을 바꾸면 안 된다 */
  warn(message: string): void {
    try {
      this.logger.warn(message)
    } catch {
      // 의도적으로 삼킨다.
    }
  }
}
