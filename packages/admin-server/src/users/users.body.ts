import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import {
  adminUserCreateSchema,
  adminUserRehireSchema,
  adminUserResignDateSchema,
  adminUserResignSchema,
  adminUserUpdateSchema,
} from '@ssworks/admin-shared'
import { z } from 'zod'
import type { ResolvedAccountsConfig } from '../accounts/options.js'
import { currentPasswordField } from '../accounts/reauth-body.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_ACCOUNTS_CONFIG } from '../tokens.js'
import type {
  AdminUserCreateBody,
  AdminUserReauthBody,
  AdminUserRehireBody,
  AdminUserResignBody,
  AdminUserResignDateBody,
  AdminUserUpdateBody,
} from './users.service.js'

// 정본: hangang-home apps/api/src/modules/users/users.dto.ts(재인증 currentPassword) + admin-shared 사용자 스키마(2d 스펙 §4-1)
// 바꾼 점: 스키마가 런타임 옵션(reauth)에 달려 주입형 파이프로 만든다(2d-1 roles.body.ts 와 같은 방식, B5). `@Body(클래스)` 로
//   넘기면 Nest 가 모듈 안에서 만든다 — 모듈 provider 에 적지 않는다. 본문 없는 쓰기(초기화 · 잠금 해제)는 reauth 일 때만
//   본문을 검증한다 — 꺼져 있으면 무엇이 와도 {}.
// 🔴 Express 는 본문 없는 요청의 body 를 undefined 로 둔다 — {} 로 보고 검증해야 빠진 currentPassword 가 그 칸의 오류가
//    된다(루트 경로 오류면 admin-ui 재인증 창이 띄우지 못한다 — 3b D8).

@Injectable()
export class UserCreateBodyPipe implements PipeTransform<unknown, AdminUserCreateBody> {
  private readonly pipe: ZodValidationPipe<AdminUserCreateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserCreateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserCreateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserUpdateBodyPipe implements PipeTransform<unknown, AdminUserUpdateBody> {
  private readonly pipe: ZodValidationPipe<AdminUserUpdateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserUpdateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserUpdateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserResignBodyPipe implements PipeTransform<unknown, AdminUserResignBody> {
  private readonly pipe: ZodValidationPipe<AdminUserResignBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserResignSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserResignBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserResignDateBodyPipe implements PipeTransform<unknown, AdminUserResignDateBody> {
  private readonly pipe: ZodValidationPipe<AdminUserResignDateBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserResignDateSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserResignDateBody {
    return this.pipe.transform(value)
  }
}

@Injectable()
export class UserRehireBodyPipe implements PipeTransform<unknown, AdminUserRehireBody> {
  private readonly pipe: ZodValidationPipe<AdminUserRehireBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      adminUserRehireSchema.extend({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserRehireBody {
    return this.pipe.transform(value)
  }
}

/** 초기화 · 잠금 해제 — 본문은 재인증 칸뿐이다 */
@Injectable()
export class UserReauthBodyPipe implements PipeTransform<unknown, AdminUserReauthBody> {
  private readonly pipe: ZodValidationPipe<AdminUserReauthBody>

  constructor(@Inject(ADMIN_ACCOUNTS_CONFIG) config: ResolvedAccountsConfig) {
    this.pipe = new ZodValidationPipe(
      z.object({ currentPassword: currentPasswordField(config.reauth) }),
    )
  }

  transform(value: unknown): AdminUserReauthBody {
    return this.pipe.transform(value ?? {})
  }
}
