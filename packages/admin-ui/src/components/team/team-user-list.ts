// TeamUserList 의 타입 · 기본 문구.

/** 킷이 아는 최소 행 — 프로젝트 필드(직책 · 상태 …)는 `#item` 슬롯에서 쓴다 */
export interface TeamUserRow {
  userNo: bigint
  userId: string
  userName: string
}

export interface TeamUserQuery {
  teamNo: bigint
  recursive: boolean
  /** 마지막으로 제출한 검색어. 비었으면 싣지 않는다 */
  keyword?: string
  page: number
  itemsPerPage: number
}

export interface TeamUserPage<R> {
  items: readonly R[]
  total: number | bigint
}

export interface TeamUserListMessages {
  searchLabel: string
  searchButton: string
  recursiveLabel: string
  noTeam: string
  empty: string
  emptyFiltered: string
  total: (total: number) => string
  loadMore: (rest: number) => string
  loadMoreFailed: string
  forbidden: string
  loadFailed: string
  retry: string
}

export const DEFAULT_TEAM_USER_LIST_MESSAGES: TeamUserListMessages = {
  // 🔴 "ID 검색" 이다 — hangang 서버 스키마에 이름 검색이 없고 넘겨도 조용히 무시된다. 이름 검색을 지원하는 서버만
  //    `messages.searchLabel` 을 바꾼다(hangang 이 남긴 경고).
  searchLabel: 'ID 검색',
  searchButton: '검색',
  recursiveLabel: '하위 팀 포함',
  noTeam: '팀을 고르면 인원이 보입니다.',
  empty: '인원이 없습니다.',
  emptyFiltered: '맞는 인원이 없습니다.',
  total: (total) => `총 ${total}명`,
  loadMore: (rest) => `더 불러오기(${rest}명 남음)`,
  loadMoreFailed: '더 불러오지 못했습니다.',
  forbidden: '이 팀의 인원을 볼 권한이 없습니다. 권한을 가진 관리자에게 요청하세요.',
  loadFailed: '인원을 불러오지 못했습니다.',
  retry: '다시 시도',
}
