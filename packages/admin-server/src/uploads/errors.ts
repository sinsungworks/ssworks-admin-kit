import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'

// 정본: ssworks-ringside packages/db/src/uploads/errors.ts(여섯 사유 · details) — 문구는 관리자용으로 다시 썼다.
// 바꾼 점: 한 표에 모은다(legal/errors.ts 와 같은 방식). 상한은 정책이라 문구에 숫자를 박지 않고 details 로 싣는다(화면이 붙인다).
// 🔴 notFound 는 없음 · 남의 것 · 첨부됨 · 지움 표시 · 용도 불일치를 가르지 않는다(열거 방어 — 스펙 U4 · U8).

export const UPLOAD_MESSAGES = Object.freeze({
  unsupportedType: '지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)',
  tooLarge: '이미지가 너무 큽니다.',
  invalidImage: '이미지를 읽을 수 없습니다.',
  limit: '이미지 수가 한도를 넘었습니다.',
  notFound: '이미지를 찾을 수 없습니다.',
  unavailable: '이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
})

export type UploadInvalidReason = 'unreadable' | 'too_many_pixels' | 'too_many_frames'

/** 415 — Content-Type · 매직 바이트 · Content-Encoding */
export function uploadUnsupportedType(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE,
    UPLOAD_MESSAGES.unsupportedType,
  )
}

/** 413 — details.maxBytes 는 정책의 장당 상한 */
export function uploadTooLarge(maxBytes: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE, UPLOAD_MESSAGES.tooLarge, {
    maxBytes,
  })
}

/** 400 — details.reason 으로 사유를 남긴다(화면 문구는 하나) */
export function uploadInvalidImage(reason: UploadInvalidReason): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
    UPLOAD_MESSAGES.invalidImage,
    { reason },
  )
}

/** 409 — 사람당 미첨부 상한 · 본문당 장수. details.limit */
export function uploadLimit(limit: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_LIMIT, UPLOAD_MESSAGES.limit, { limit })
}

/** 404 — 🔴 사유를 가르지 않는다 */
export function uploadNotFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND, UPLOAD_MESSAGES.notFound)
}

/** 503 — 저장소 오류 · 재인코딩 대기 초과 */
export function uploadUnavailable(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE, UPLOAD_MESSAGES.unavailable)
}
