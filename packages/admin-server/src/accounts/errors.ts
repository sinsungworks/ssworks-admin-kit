// 정본: ssworks-gise-home apps/api/src/modules/accounts/account-policy.ts `ACCOUNT_ERROR_MESSAGES`(판정 문구) +
//       hangang-home apps/api/src/modules/roles · users 서비스 문구
// 바꾼 점: 한 표에 모은다(2b AUTH_MESSAGES · 2c SESSION_MESSAGES 와 같은 방식). 사용자 상태 문구는 2d-2 가 더한다.

export const ACCOUNT_MESSAGES = Object.freeze({
  noRole: '역할을 찾을 수 없습니다.',
  noUser: '사용자를 찾을 수 없습니다.',
  unknownPermission: '알 수 없는 권한입니다.',
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
    '이 변경 뒤에는 전체 권한을 가진 재직 관리자가 한 명도 남지 않습니다. 먼저 다른 관리자에게 전체 권한 역할을 주세요.',
  guardMissing: '동시성 보호 설정이 없어 처리할 수 없습니다.',
})
