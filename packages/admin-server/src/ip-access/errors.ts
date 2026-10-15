import {
  BusinessError,
  CommonErrorCodes,
  ipScopeProblem,
  type IpScope,
} from '@ssworks/admin-shared'
import { validationError } from '../http/validation.js'

// 정본: hangang-home apps/api/src/modules/ip-access/ip-access.service.ts · ip-evaluation.ts 의 문구(규칙 없음 · 자기 잠금 409)
// 바꾼 점: 한 표에 모은다(2d ACCOUNT_MESSAGES 와 같은 방식). 자기 잠금은 details.clientIp(hangang actorIp). 대상 없음은 404 가
//   아니라 칸 오류 400 scopeRefNo — 사용자 만들기의 없는 팀(400 teamNo)과 같은 모양이다. 범위 불변식 문구는 admin-shared
//   IP_ACCESS_SCHEMA_MESSAGES(화면과 같은 문구).

export const IP_ACCESS_MESSAGES = Object.freeze({
  ruleNotFound: 'IP 규칙을 찾을 수 없습니다.',
  ruleRevisionMismatch: '다른 관리자가 먼저 이 규칙을 바꿨습니다. 새로 불러온 내용을 확인하세요.',
  selfLockout: '이 변경을 저장하면 지금 접속한 위치에서 로그인할 수 없게 됩니다.',
  noScopeTeam: '대상 팀을 찾을 수 없습니다.',
  noScopeUser: '대상 사용자를 찾을 수 없습니다.',
})

export function ruleNotFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_NOT_FOUND, IP_ACCESS_MESSAGES.ruleNotFound)
}

export function ruleRevisionConflict(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
    IP_ACCESS_MESSAGES.ruleRevisionMismatch,
  )
}

/** 🔴 409 다 — 권한이 없어서가 아니라 요청이 자기모순이라서(hangang). 화면이 주소를 보여 주게 clientIp 를 싣는다 */
export function selfLockout(clientIp: string | null): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, IP_ACCESS_MESSAGES.selfLockout, {
    clientIp,
  })
}

/** 400 ERR_COMMON_VALIDATION + issues[{ path: ['scopeRefNo'] }] */
export function scopeRefError(message: string): BusinessError {
  return validationError([{ path: ['scopeRefNo'], code: 'custom', message }], message)
}

/** 범위 불변식(global ⇔ 대상 없음) — 만들기 본문 · 수정의 병합 결과가 같은 함수로 본다(hangang R30) */
export function assertIpScope(scope: IpScope): void {
  const problem = ipScopeProblem(scope)
  if (problem !== null) throw scopeRefError(problem)
}
