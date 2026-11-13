import { describe, expect, it } from 'vitest'
import { CommonErrorCodes } from '@ssworks/admin-shared'
import { ApiError } from './error.js'
import {
  DEFAULT_UPLOAD_ERROR_MESSAGES,
  formatMegabytes,
  uploadErrorMessage,
} from './upload-errors.js'

const apiError = (code: string | undefined, details?: unknown, message = '서버 문구') =>
  new ApiError(message, { status: 400, code, details, raw: null })

describe('formatMegabytes', () => {
  it('MiB 를 소수 한 자리까지 — 끝 0 없음', () => {
    expect(formatMegabytes(10_485_760)).toBe('10MB')
    expect(formatMegabytes(1_572_864)).toBe('1.5MB')
    expect(formatMegabytes(5_000_000)).toBe('4.8MB')
  })
})

describe('uploadErrorMessage(스펙 §6 · §13)', () => {
  it('4xx 다섯은 서버와 같은 기본 글자', () => {
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE))).toBe(
      '지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE))).toBe(
      '이미지를 읽을 수 없습니다.',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_LIMIT))).toBe(
      '이미지 수가 한도를 넘었습니다.',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND))).toBe(
      '이미지를 찾을 수 없습니다.',
    )
  })

  it('🔴 503 은 서버가 가린 문구 대신 코드로 고른다', () => {
    const masked = new ApiError('서버 내부 오류가 발생했습니다.', {
      status: 503,
      code: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
      raw: null,
    })
    expect(uploadErrorMessage(masked)).toBe(
      '이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
    )
  })

  it('🔴 413 은 details.maxBytes 를 붙이고, 없거나 이상하면 숫자 없이', () => {
    const tooLarge = (details?: unknown) =>
      uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE, details))
    expect(tooLarge({ maxBytes: 10_485_760 })).toBe('이미지가 너무 큽니다. (장당 최대 10MB)')
    expect(tooLarge()).toBe('이미지가 너무 큽니다.')
    expect(tooLarge({ maxBytes: '10MB' })).toBe('이미지가 너무 큽니다.')
    expect(tooLarge({ maxBytes: 0 })).toBe('이미지가 너무 큽니다.')
  })

  it('업로드 코드가 아니거나 ApiError 가 아니면 null — 서버 문구를 그대로 쓴다', () => {
    expect(uploadErrorMessage(apiError('ERR_COMMON_REVISION_CONFLICT'))).toBeNull()
    expect(uploadErrorMessage(apiError(undefined))).toBeNull()
    expect(uploadErrorMessage(new Error(CommonErrorCodes.ERR_UPLOAD_LIMIT))).toBeNull()
  })

  it('messages 로 일부만 덮는다', () => {
    const messages = { limit: '사진과 본문 그림은 합쳐 20장까지입니다.' }
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_LIMIT), messages)).toBe(
      '사진과 본문 그림은 합쳐 20장까지입니다.',
    )
    expect(uploadErrorMessage(apiError(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND), messages)).toBe(
      DEFAULT_UPLOAD_ERROR_MESSAGES.notFound,
    )
  })
})
