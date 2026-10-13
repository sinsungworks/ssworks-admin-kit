import { Inject, Injectable, type PipeTransform } from '@nestjs/common'
import { z } from 'zod'
import { ZodValidationPipe } from '../http/pipes.js'
import { ADMIN_AUTH_CONFIG } from '../tokens.js'
import type { ResolvedAuthConfig } from './options.js'

// 정본: ssworks-gise-home apps/api/src/modules/auth/auth.dto.ts(loginBodySchema) · admin-password.controller.ts
// 바꾼 점: 스키마가 런타임 정책(passwordPolicy)에 달려 있어 데코레이터 인자로 고정할 수 없다 — 주입형 파이프가 2a
//   ZodValidationPipe 를 감싼다(스펙 §4-9). `@Body(LoginBodyPipe)` 처럼 클래스로 넘기면 Nest 가 모듈 안에서 만든다.

export interface AdminLoginBody {
  userId: string
  password: string
}

export interface AdminChangePasswordBody {
  currentPassword: string
  newPassword: string
}

/** userId 는 users.userId 폭(64). 비밀번호 상한은 정책 최대와 256 중 큰 값 — 정책을 줄여도 옛 긴 비밀번호로 들어온다 */
@Injectable()
export class LoginBodyPipe implements PipeTransform<unknown, AdminLoginBody> {
  private readonly pipe: ZodValidationPipe<AdminLoginBody>

  constructor(@Inject(ADMIN_AUTH_CONFIG) config: ResolvedAuthConfig) {
    this.pipe = new ZodValidationPipe(
      z.object({
        userId: z.string().min(1).max(64),
        password: z.string().min(1).max(Math.max(config.passwordPolicy.maxLength, 256)),
      }),
    )
  }

  transform(value: unknown): AdminLoginBody {
    return this.pipe.transform(value)
  }
}

/** 🔴 쓰는 쪽 정책의 changePasswordSchema — 길이 위반 · 새 = 현재가 저절로 필드 오류가 된다(3c §4-3) */
@Injectable()
export class ChangePasswordBodyPipe implements PipeTransform<unknown, AdminChangePasswordBody> {
  private readonly pipe: ZodValidationPipe<AdminChangePasswordBody>

  constructor(@Inject(ADMIN_AUTH_CONFIG) config: ResolvedAuthConfig) {
    this.pipe = new ZodValidationPipe(config.passwordPolicy.changePasswordSchema)
  }

  transform(value: unknown): AdminChangePasswordBody {
    return this.pipe.transform(value)
  }
}
