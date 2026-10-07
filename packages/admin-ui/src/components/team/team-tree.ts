// TeamTree 의 타입 · 기본 문구 — 컴포넌트와 `useTeamTree` 가 같이 쓴다.

/** 노드별 허용 판정의 동작 — `canAct(node, action)` */
export type TeamAction = 'addChild' | 'rename' | 'remove' | 'move'

/** 노드 안 입력칸 상태 — `useTeamTree` 가 가진다(3d 스펙 D4) */
export type TeamEdit =
  | { kind: 'rename'; teamNo: bigint; name: string; pending: boolean; error: string | null }
  | {
      kind: 'create'
      /** null = 최상위 */
      parentTeamNo: bigint | null
      name: string
      pending: boolean
      error: string | null
    }

export type TeamEditTarget =
  { kind: 'rename'; teamNo: bigint } | { kind: 'create'; parentTeamNo: bigint | null }

/** 입력칸 저장의 출처 — 바깥 누르기(`blur`)와 Enter 는 빈 이름을 다르게 다룬다 */
export type TeamCommitSource = 'enter' | 'button' | 'blur'

export type TeamMoveSource = 'button' | 'drag'

export interface TeamTreeMessages {
  treeLabel: string
  searchLabel: string
  empty: string
  noResult: string
  loadFailed: string
  retry: string
  up: (teamName: string) => string
  down: (teamName: string) => string
  menu: (teamName: string) => string
  toggle: (teamName: string, open: boolean) => string
  addChild: string
  rename: string
  reparent: string
  remove: string
  nameInput: string
  save: string
  cancel: string
}

export const DEFAULT_TEAM_TREE_MESSAGES: TeamTreeMessages = {
  treeLabel: '팀 트리',
  searchLabel: '팀 검색',
  empty: '팀이 없습니다.',
  noResult: '검색 결과가 없습니다.',
  loadFailed: '팀을 불러오지 못했습니다.',
  retry: '다시 시도',
  up: (teamName) => `「${teamName}」 위로`,
  down: (teamName) => `「${teamName}」 아래로`,
  menu: (teamName) => `「${teamName}」 메뉴`,
  toggle: (teamName, open) => `「${teamName}」 ${open ? '접기' : '펼치기'}`,
  addChild: '하위 팀 추가',
  rename: '이름 바꾸기',
  reparent: '옮기기',
  remove: '삭제',
  nameInput: '팀 이름',
  save: '저장',
  cancel: '취소',
}

/** he-tree 의 화면 낭독기 안내(기본 영문)를 한국어로. Alt+화살표 이동은 막으니 이동 안내는 넣지 않는다. */
export const HE_TREE_I18N = {
  instructions:
    '위아래 화살표로 팀 사이를 옮겨 다니고, 오른쪽 · 왼쪽 화살표로 펼치고 접습니다. Enter 로 팀을 고릅니다.',
}
