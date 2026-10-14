import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import {
  adminRoleCreateSchema,
  adminRoleRemoveSchema,
  adminRoleUpdateSchema,
} from '@ssworks/admin-shared'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { currentPasswordField, permissionListSchema } from '../accounts/reauth-body.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_ACCOUNTS_CONFIG } from '../tokens.js'
import type {
  AdminRoleCreateBody,
  AdminRoleRemoveBody,
  AdminRoleUpdateBody,
} from './roles.service.js'

// 정본: hangang-home apps/api/src/modules/roles/roles.dto.ts(재인증 currentPassword) + admin-shared 역할 스키마(3b §4-1)
// 바꾼 점: 스키마가 런타임 옵션(카탈로그 · reauth)에 달려 주입형 파이프로 만든다(2b LoginBodyPipe 와 같은 방식, 2d 스펙
//   B5). `@Body(클래스)` 로 넘기면 Nest 가 모듈 안에서 만든다 — 모듈 provider 에 적지 않는다(2b 와 같다).

@Injectable()
export class RoleCreateBodyPipe implements PipeTransform<unknown, AdminRoleCreateBody> {
  private readonly pipe: ZodValidationPipe<AdminRoleCreateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminRoleCreateSchema.extend({
        permissions: permissionListSchema(config.catalog),
        currentPassword: currentPasswordField(config.reauth),
      }),
    )
  }

  transform(value: unknown): AdminRoleCreateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class RoleUpdateBodyPipe implements PipeTransform<unknown, AdminRoleUpdateBody> {
  private readonly pipe: ZodValidationPipe<AdminRoleUpdateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminRoleUpdateSchema.extend({
        permissions: permissionListSchema(config.catalog).optional(),
        currentPassword: currentPasswordField(config.reauth),
      }),
    )
  }

  transform(value: unknown): AdminRoleUpdateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class RoleRemoveBodyPipe implements PipeTransform<unknown, AdminRoleRemoveBody> {
  private readonly pipe: ZodValidationPipe<AdminRoleRemoveBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminRoleRemoveSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminRoleRemoveBody {
    return this.pipe.transform(value)
  }
}
