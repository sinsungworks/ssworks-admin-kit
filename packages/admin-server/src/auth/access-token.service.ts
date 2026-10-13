import { Inject, Injectable } from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { BusinessError, CommonErrorCodes, parseJSON, stringifyJSON } from '@ssworks/admin-shared'
import { ADMIN_AUTH_CONFIG } from '../tokens.js'
import { AUTH_MESSAGES } from './errors.js'
import type { ResolvedAuthConfig } from './options.js'

// 정본: hangang-home apps/api/src/modules/auth/auth.service.ts `signAccessToken` + core/guards/auth.guard.ts
//       `verifyAccessToken`(만료 · 위조 매핑) + ssworks-gise-home auth.service.ts `issue`(bigint 래퍼 서명)
// 바꾼 점:
//  - JwtModule 대신 JwtService 를 직접 만든다 — 비밀키가 런타임 옵션이고 쓰는 쪽 JwtModule 과 섞이지 않는다(스펙 ① J1).
//  - 🔴 알고리즘을 HS256 하나로 묶는다(서명 · 검증 둘 다) — HS512 · none 은 위조로 본다(스펙 §14 R1-1 실측).
//  - `now` 를 받아 `clockTimestamp` 로 넘긴다 — 만료 경계를 테스트가 만든다(스펙 §5-5).
//  - 클레임이 bigint 래퍼가 아니면 위조로 본다(gise payload 형태 검사).

export interface AccessTokenClaims {
  userNo: bigint
  sessionNo: bigint
}

function invalidToken(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_INVALID_TOKEN, AUTH_MESSAGES.accessInvalid)
}

@Injectable()
export class AdminAccessTokenService {
  private readonly jwt: JwtService
  private readonly expiresInSeconds: number

  constructor(@Inject(ADMIN_AUTH_CONFIG) config: ResolvedAuthConfig) {
    this.expiresInSeconds = Math.ceil(config.accessTtlMs / 1000)
    this.jwt = new JwtService({
      secret: config.jwtSecret,
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    })
  }

  sign(claims: AccessTokenClaims): string {
    // 🔴 jsonwebtoken 은 payload 를 JSON.stringify 한다 — bigint 를 만나면 던진다(gise 실측). 래퍼 문자열로 바꿔 넘긴다.
    const payload = JSON.parse(
      stringifyJSON({ userNo: claims.userNo, sessionNo: claims.sessionNo }),
    ) as Record<string, string>
    return this.jwt.sign(payload, { expiresIn: this.expiresInSeconds })
  }

  verify(token: string, now: Date): AccessTokenClaims {
    let raw: Record<string, unknown>
    try {
      // verify 옵션은 생성자의 verifyOptions(algorithms) 와 합쳐진다(스펙 §14 R1-1).
      raw = this.jwt.verify<Record<string, unknown>>(token, {
        clockTimestamp: Math.floor(now.getTime() / 1000),
      })
    } catch (error) {
      // 🔴 만료를 위조와 가른다 — 만료는 클라이언트가 조용히 갱신할 신호다. 감싸지 않으면 15분마다 500 이 된다(hangang).
      if (error instanceof TokenExpiredError) {
        throw new BusinessError(CommonErrorCodes.ERR_EXPIRED_TOKEN, AUTH_MESSAGES.accessExpired)
      }
      throw invalidToken()
    }
    const claims = parseJSON<{ userNo?: unknown; sessionNo?: unknown }>(
      JSON.stringify({ userNo: raw.userNo, sessionNo: raw.sessionNo }),
    )
    if (typeof claims.userNo !== 'bigint' || typeof claims.sessionNo !== 'bigint') {
      throw invalidToken()
    }
    return { userNo: claims.userNo, sessionNo: claims.sessionNo }
  }
}
