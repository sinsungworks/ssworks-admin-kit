import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'

// 정본: ssworks-gise-home apps/api/src/modules/legal/legal.service.ts(같은 본문 · 없는 문서 문구 — axion 도 같은 글자)
//       + 3e 스펙 §9(기준 판 409)
// 바꾼 점: 한 표에 모은다(teams/errors.ts 와 같은 방식). 같은 본문은 코어 ERR_COMMON_CONFLICT(axion 은 ERR_LEGAL_UNCHANGED),
//   기준 판 충돌은 ERR_COMMON_REVISION_CONFLICT — 두 정본에 없던 검사다(3e ⑤ V2).

export const LEGAL_MESSAGES = Object.freeze({
  notFound: '문서를 찾을 수 없습니다.',
  revisionConflict: '다른 관리자가 먼저 새 버전을 발행했습니다. 새로 불러온 내용을 확인하세요.',
  sameContent: '이전 버전과 내용이 같습니다.',
})

export function legalNotFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, LEGAL_MESSAGES.notFound)
}

/** 기준 판이 지금 시행본이 아니다 — 남이 먼저 발행했다(3e §9 ①) */
export function legalRevisionConflict(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    LEGAL_MESSAGES.revisionConflict,
  )
}

/** 시행본과 본문(해시)이 같다(3e §9 ②) */
export function legalSameContent(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, LEGAL_MESSAGES.sameContent)
}
