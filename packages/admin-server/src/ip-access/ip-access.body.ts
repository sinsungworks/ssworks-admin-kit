import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import {
  adminIpRuleCreateSchema,
  adminIpRuleRemoveSchema,
  adminIpRuleUpdateSchema,
  ipScopeProblem,
} from '@ssworks/admin-shared'
import { currentPasswordField } from '../accounts/reauth-body.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_IP_ACCESS_CONFIG } from '../tokens.js'
import type {
  AdminIpRuleCreateBody,
  AdminIpRuleRemoveBody,
  AdminIpRuleUpdateBody,
} from './ip-access.service.js'
import type { ResolvedIpAccessConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.dto.ts(cidr · 범위 불변식 · 재인증 칸) + admin-shared IP 스키마
// 바꾼 점: 재인증 칸이 런타임 옵션(reauth)에 달려 주입형 파이프로 만든다(역할 · 사용자와 같은 방식, 2d B5). 범위 불변식은 extend
//   뒤에 superRefine 으로 건다 — admin-shared 스키마에 refine 이 있으면 extend 가 던진다(zod 4). 수정의 불변식은 병합 결과라
//   서비스가 본다. `@Body(클래스)` 로 넘기면 Nest 가 모듈 안에서 만든다 — 모듈 providers 에 적지 않는다.

@Injectable()
export class IpRuleCreateBodyPipe implements PipeTransform<unknown, AdminIpRuleCreateBody> {
  private readonly pipe: ZodValidationPipe<AdminIpRuleCreateBody>

  constructor(@Inject(ADMIN_IP_ACCESS_CONFIG) config: ResolvedIpAccessConfig) {
    this.pipe = new ZodValidationPipe(
      adminIpRuleCreateSchema
        .extend({ currentPassword: currentPasswordField(config.reauth) })
        .superRefine((body, ctx) => {
          const problem = ipScopeProblem(body)
          if (problem !== null) {
            ctx.addIssue({ code: 'custom', path: ['scopeRefNo'], message: problem })
          }
        }),
    )
  }

  transform(value: unknown): AdminIpRuleCreateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class IpRuleUpdateBodyPipe implements PipeTransform<unknown, AdminIpRuleUpdateBody> {
  private readonly pipe: ZodValidationPipe<AdminIpRuleUpdateBody>

  constructor(@Inject(ADMIN_IP_ACCESS_CONFIG) config: ResolvedIpAccessConfig) {
    this.pipe = new ZodValidationPipe(
      adminIpRuleUpdateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminIpRuleUpdateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class IpRuleRemoveBodyPipe implements PipeTransform<unknown, AdminIpRuleRemoveBody> {
  private readonly pipe: ZodValidationPipe<AdminIpRuleRemoveBody>

  constructor(@Inject(ADMIN_IP_ACCESS_CONFIG) config: ResolvedIpAccessConfig) {
    this.pipe = new ZodValidationPipe(
      adminIpRuleRemoveSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminIpRuleRemoveBody {
    return this.pipe.transform(value)
  }
}
