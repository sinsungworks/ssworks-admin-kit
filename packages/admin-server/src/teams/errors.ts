import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { validationError } from '../http/validation.js'

// 정본: hangang-home apps/api/src/modules/teams/teams.service.ts 의 문구(팀을 찾을 수 없습니다 · 중복) + ssworks-axion-admin
//       teams.service.ts '상위 팀을 찾을 수 없습니다.'
// 바꾼 점: 한 표에 모은다(2d ACCOUNT_MESSAGES 와 같은 방식). 소속 있는 삭제 · 순환은 전용 코드다(3d §9 — hangang 은
//   ERR_COMMON_CONFLICT 하나에 뜻이 셋이라 화면이 문구에 기댔다). 이름 중복은 409 ERR_DUPLICATE_TEAM_NAME(⑧ N1 — 3d §9 계약).

export const TEAM_MESSAGES = Object.freeze({
  noTeam: '팀을 찾을 수 없습니다.',
  noParentTeam: '상위 팀을 찾을 수 없습니다.',
  duplicateTeamName: '이미 있는 팀 이름입니다.',
  teamHasMembers:
    '이 팀이나 하위 팀에 소속된 계정이 있어 지울 수 없습니다. 계정을 먼저 다른 팀으로 옮기세요.',
  teamHasIpRules:
    '이 팀(하위 팀 포함)을 가리키는 IP 규칙이 있어 지울 수 없습니다. 규칙을 먼저 지우세요.',
  moveCycle: '팀을 자기 자신이나 하위 팀 아래로 옮길 수 없습니다.',
  beforeNotSibling: '기준 팀이 옮겨 갈 상위 팀의 하위 팀이 아닙니다.',
  beforeIsSelf: '옮길 팀 자신을 기준 팀으로 고를 수 없습니다.',
})

export function noTeam(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_TEAM, TEAM_MESSAGES.noTeam)
}

export function noParentTeam(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_NO_TEAM, TEAM_MESSAGES.noParentTeam)
}

export function duplicateTeamName(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_DUPLICATE_TEAM_NAME,
    TEAM_MESSAGES.duplicateTeamName,
  )
}

/** memberCount 는 계정 수(두 팀에 걸친 계정도 1) — 퇴사자 포함(③ M1) */
export function teamHasMembers(memberCount: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_TEAM_HAS_MEMBERS, TEAM_MESSAGES.teamHasMembers, {
    memberCount,
  })
}

/** ruleCount 는 서브트리 팀을 가리키는 IP 규칙 수(2f-1 ⑤ T1) — 규칙 삭제는 IP 모듈의 자기 잠금 · 잔존 · 감사를 지난다 */
export function teamHasIpRules(ruleCount: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_TEAM_HAS_IP_RULES, TEAM_MESSAGES.teamHasIpRules, {
    ruleCount,
  })
}

export function moveCycle(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_TEAM_MOVE_CYCLE, TEAM_MESSAGES.moveCycle)
}

/** 기준 형제 위반 — 400 ERR_COMMON_VALIDATION + issues[{ path: ['beforeTeamNo'] }] */
export function beforeTeamError(message: string): BusinessError {
  return validationError([{ path: ['beforeTeamNo'], code: 'custom', message }], message)
}
