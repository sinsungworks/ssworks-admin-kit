import { CommonErrorCodes } from '@ssworks/admin-shared'
import { ApiError } from './error.js'

// 업로드 오류 코드(ERR_UPLOAD_* 여섯)의 화면 문구 — 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §6 표 · §13.
// 4xx 다섯의 기본 글자는 서버 `UPLOAD_MESSAGES`(admin-server uploads/errors.ts)와 같다.
// 🔴 503 `ERR_UPLOAD_UNAVAILABLE` 은 서버가 문구를 보내지 않는다 — 코어 필터가 5xx 본문을 「서버 내부 오류가 발생했습니다.」 로
//    가린다(코드는 남는다). 그래서 화면 문구는 코드로 고른다.
// 🔴 413 의 상한은 서버 문구에 없다 — `details.maxBytes` 로 오고 화면이 붙인다(정책이라 문구에 숫자를 박지 않는다).

export interface UploadErrorMessages {
  unsupportedType: string
  /** maxBytes — 서버 `details.maxBytes`(없으면 null) */
  tooLarge: (maxBytes: number | null) => string
  invalidImage: string
  limit: string
  notFound: string
  unavailable: string
}

const MEBIBYTE = 1_048_576

/** 바이트 → `10MB` · `1.5MB`(소수 한 자리까지 · 끝 0 없음) */
export function formatMegabytes(bytes: number): string {
  return `${Number((bytes / MEBIBYTE).toFixed(1))}MB`
}

/** 기본 문구 — 🔴 얼린다(앱이 펼쳐 일부만 덮는다) */
export const DEFAULT_UPLOAD_ERROR_MESSAGES: Readonly<UploadErrorMessages> =
  Object.freeze<UploadErrorMessages>({
    unsupportedType: '지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)',
    tooLarge: (maxBytes) =>
      maxBytes == null
        ? '이미지가 너무 큽니다.'
        : `이미지가 너무 큽니다. (장당 최대 ${formatMegabytes(maxBytes)})`,
    invalidImage: '이미지를 읽을 수 없습니다.',
    limit: '이미지 수가 한도를 넘었습니다.',
    notFound: '이미지를 찾을 수 없습니다.',
    unavailable: '이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
  })

function maxBytesOf(details: unknown): number | null {
  if (typeof details !== 'object' || details === null) return null
  const value = (details as { maxBytes?: unknown }).maxBytes
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** 업로드 오류의 화면 문구 — `ApiError` 이고 코드가 ERR_UPLOAD_* 여섯 중 하나일 때만. 그 밖은 null(서버 문구 그대로) */
export function uploadErrorMessage(
  error: unknown,
  messages: Partial<UploadErrorMessages> = {},
): string | null {
  if (!(error instanceof ApiError)) return null
  const text: UploadErrorMessages = { ...DEFAULT_UPLOAD_ERROR_MESSAGES, ...messages }
  switch (error.code) {
    case CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE:
      return text.unsupportedType
    case CommonErrorCodes.ERR_UPLOAD_TOO_LARGE:
      return text.tooLarge(maxBytesOf(error.details))
    case CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE:
      return text.invalidImage
    case CommonErrorCodes.ERR_UPLOAD_LIMIT:
      return text.limit
    case CommonErrorCodes.ERR_UPLOAD_NOT_FOUND:
      return text.notFound
    case CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE:
      return text.unavailable
    default:
      return null
  }
}
