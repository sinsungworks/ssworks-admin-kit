// 정본: ssworks-gise-home apps/api/src/modules/accounts/account-policy.ts `ACCOUNT_ERROR_MESSAGES`(판정 문구) +
//       hangang-home apps/api/src/modules/roles · users 서비스 문구
// 바꾼 점: 한 표에 모은다(2b AUTH_MESSAGES · 2c SESSION_MESSAGES 와 같은 방식). 재직 문구는 hangang 을 다듬었다(2d 스펙 §6).

export const ACCOUNT_MESSAGES = Object.freeze({
  noRole: '역할을 찾을 수 없습니다.',
  noUser: '사용자를 찾을 수 없습니다.',
  noTeam: '팀을 찾을 수 없습니다.',
  duplicateUserId: '이미 있는 아이디입니다.',
  userRevisionMismatch: '다른 관리자가 먼저 이 계정을 바꿨습니다. 새로 불러온 내용을 확인하세요.',
  resignBeforeJoin: '퇴사일은 입사일과 같거나 뒤여야 합니다.',
  rehireNotAfterResign: '재입사일은 직전 퇴사일 다음 날부터입니다.',
  joinDateOutOfRange: '입사일은 직전 퇴사일 다음 날부터 이번 퇴사일까지입니다.',
  alreadyResigned: '이미 퇴사 처리된 사용자입니다.',
  notResigned: '재직 중인 사용자는 퇴사일을 정정할 수 없습니다.',
  notResignedForRehire: '재직 중인 사용자는 재입사 처리할 수 없습니다.',
  dateOutOfRange: '처리할 수 있는 날짜 범위(1970년 ~ 2038년 1월 18일)를 벗어났습니다.',
  activePeriodExists: '이미 활성 근무 이력이 있어 재입사 처리할 수 없습니다.',
  noPeriodForJoin: '근무 이력이 없어 입사일을 정정할 수 없습니다.',
  noPeriodForResign: '근무 이력이 없어 퇴사일을 정정할 수 없습니다.',
  periodCorrupted:
    '근무 이력이 손상되어(활성 구간 중복) 처리할 수 없습니다. 관리자에게 문의하세요.',
  unknownPermission: '알 수 없는 권한입니다.',
  fullAccessOnly: '전체 권한 역할만 가질 수 있는 권한이 들어 있습니다.',
  duplicateRoleName: '이미 있는 역할 이름입니다.',
  currentPasswordRequired: '현재 비밀번호를 입력하세요.',
  selfAccount: '내 계정에는 이 작업을 할 수 없습니다. 다른 관리자에게 요청하세요.',
  higherAccount: '내 권한보다 넓은 권한을 가진 계정은 바꿀 수 없습니다.',
  higherRoleToGrant: '내 권한보다 넓은 역할은 줄 수 없습니다.',
  higherRoleToEdit: '내 권한보다 넓은 역할은 만들거나 바꾸거나 지울 수 없습니다.',
  higherAccountSessions: '내 권한보다 넓은 권한을 가진 계정의 세션은 다룰 수 없습니다.',
  roleRevisionMismatch: '다른 관리자가 먼저 이 역할을 바꿨습니다. 새로 불러온 내용을 확인하세요.',
  roleInUse: '이 역할을 가진 계정이 있어 지울 수 없습니다. 계정의 역할을 먼저 바꾸세요.',
  lastSuperAdmin:
    '이 변경 뒤에는 어디서든 로그인할 수 있는 전체 권한 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주거나 접속 IP 제한을 푸세요.',
})
