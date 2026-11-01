import { describe, expect, it } from 'vitest'
import {
  CORE_AUDIT_ACTION_LABELS,
  CORE_AUDIT_TARGET_LABELS,
  CoreAuditActions,
  CoreAuditTargets,
} from './audit.js'
import { COMMON_ERROR_STATUS, CommonErrorCodes } from './error-codes.js'

describe('업로드 오류 코드(스펙 §6 표)', () => {
  it('여섯 코드와 상태', () => {
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE]).toBe(415)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_TOO_LARGE]).toBe(413)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE]).toBe(400)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_LIMIT]).toBe(409)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_NOT_FOUND]).toBe(404)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE]).toBe(503)
  })
})

describe('업로드 감사 카탈로그(스펙 U13)', () => {
  it('액션 둘 · 대상 하나 · 라벨', () => {
    expect(CoreAuditActions.UPLOAD_CREATE).toBe('upload.create')
    expect(CoreAuditActions.UPLOAD_DELETE).toBe('upload.delete')
    expect(CoreAuditTargets.UPLOAD).toBe('upload')
    expect(CORE_AUDIT_ACTION_LABELS['upload.create']).toBe('이미지 올리기')
    expect(CORE_AUDIT_ACTION_LABELS['upload.delete']).toBe('이미지 지우기')
    expect(CORE_AUDIT_TARGET_LABELS.upload).toBe('업로드')
  })
})
