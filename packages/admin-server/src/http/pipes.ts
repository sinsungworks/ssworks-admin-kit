import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { koreanZodErrors, toValidationIssues, validationError } from './validation.js'

// 정본: ssworks-gise-home apps/api/src/core/pipes/zod-validation.pipe.ts
// 바꾼 점: 이슈 모양 · 문구는 validation.ts. `@Injectable()` 을 붙이지 않는다 — 스키마를 생성자로 받는 파이프는
//   `new ZodValidationPipe(schema)` 로만 쓴다(DI 로 만들 수 없다).

/**
 * 스키마 하나로 요청 조각을 검증한다. `@Body(new ZodValidationPipe(schema))`.
 * 반환값은 입력 원본이 아니라 **파싱 결과**다 — `.default()` · `z.coerce.*` 가 적용된 값이 핸들러에 들어간다.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata?: ArgumentMetadata): T {
    const result = this.schema.safeParse(value, { error: koreanZodErrors() })
    if (!result.success) throw validationError(toValidationIssues(result.error.issues))
    return result.data
  }
}

/** `BIGINT UNSIGNED` 의 상한 — 정본 넷의 PK 가 전부 이 타입이다 */
const UNSIGNED_BIGINT_MAX = 18446744073709551615n
const DIGITS = /^\d{1,20}$/

/** 경로 · 쿼리 매개변수 `"12"` → `12n`. 0 이상 정수만(부호 · 소수 · 지수 · 공백 거부). `@Param('teamNo', ParseBigIntPipe)`. */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<unknown, bigint> {
  transform(value: unknown, metadata: ArgumentMetadata): bigint {
    if (typeof value === 'string' && DIGITS.test(value)) {
      const parsed = BigInt(value)
      if (parsed <= UNSIGNED_BIGINT_MAX) return parsed
    }
    throw validationError([
      {
        path: [metadata.data ?? metadata.type],
        code: 'invalid_type',
        message: '0 이상의 정수 번호여야 합니다.',
      },
    ])
  }
}
