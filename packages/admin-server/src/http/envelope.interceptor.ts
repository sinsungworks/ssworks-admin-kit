import {
  Injectable,
  SetMetadata,
  StreamableFile,
  type CallHandler,
  type CustomDecorator,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { map, type Observable } from 'rxjs'
import { RAW_RESPONSE } from '../tokens.js'

// 정본: kim5257-crm-v5 `{ success: true, data }` 봉투(Phase 0 §4 #1). crm 은 컨트롤러가 손으로 쌌다.
// 바꾼 점: 전역 인터셉터가 싼다 — 서비스 · 컨트롤러는 봉투를 모른다.

/** 봉투를 씌우지 않는다 — 웹훅 · 헬스 체크처럼 정해진 모양을 내야 하는 라우트. 메서드나 컨트롤러에 붙인다. */
export function RawResponse(): CustomDecorator<string> {
  return SetMetadata(RAW_RESPONSE, true)
}

/** 반환값을 `{ success: true, data }` 로 싼다. `undefined` 는 `data: null`. 파일 응답은 건드리지 않는다. */
@Injectable()
export class AdminEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const raw = this.reflector.getAllAndOverride<boolean | undefined>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (raw === true) return next.handle()
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          data instanceof StreamableFile || Buffer.isBuffer(data)
            ? data
            : { success: true, data: data ?? null },
        ),
      )
  }
}
