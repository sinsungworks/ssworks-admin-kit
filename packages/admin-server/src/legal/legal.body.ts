import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import { adminLegalPublishSchema } from '@ssworks/admin-shared'
import type { AdminLegalPublish } from '@ssworks/admin-shared'
import { z } from 'zod'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_LEGAL_CONFIG } from '../tokens.js'
import type { ResolvedLegalConfig } from './options.js'

// 정본: ssworks-gise-home apps/api/src/modules/legal/admin-legal.controller.ts(legalKindQuerySchema · publishLegalDocumentSchema)
// 바꾼 점: 종류 열거가 런타임 옵션(legal.kinds)이라 주입형 파이프로 만든다(users.body.ts 와 같은 방식, 2e 스펙 B14).
//   `@Body(클래스)` · `@Query(클래스)` 로 넘기면 Nest 가 모듈 안에서 만든다 — 모듈 provider 에 적지 않는다.
// 🔴 본문은 admin-shared adminLegalPublishSchema 그대로다(본문 트림 없음 · 1,000,000자 · 공백만 거부). 해시 칸이 없다 —
//    클라이언트가 보낸 contentHash 는 zod 가 버린다(서버만 셈한다).

export interface LegalKindQuery {
  kind: string
}

@Injectable()
export class LegalPublishBodyPipe implements PipeTransform<unknown, AdminLegalPublish> {
  private readonly pipe: ZodValidationPipe<AdminLegalPublish>

  constructor(@Inject(ADMIN_LEGAL_CONFIG) config: ResolvedLegalConfig) {
    this.pipe = new ZodValidationPipe(
      adminLegalPublishSchema.extend({ kind: z.enum(config.kinds) }),
    )
  }

  transform(value: unknown): AdminLegalPublish {
    return this.pipe.transform(value)
  }
}

/** `?kind=` — 빠짐 · 배열 · 모르는 값은 400 issues[kind](§14 R5-3) */
@Injectable()
export class LegalKindQueryPipe implements PipeTransform<unknown, LegalKindQuery> {
  private readonly pipe: ZodValidationPipe<LegalKindQuery>

  constructor(@Inject(ADMIN_LEGAL_CONFIG) config: ResolvedLegalConfig) {
    this.pipe = new ZodValidationPipe(z.object({ kind: z.enum(config.kinds) }))
  }

  transform(value: unknown): LegalKindQuery {
    return this.pipe.transform(value)
  }
}
