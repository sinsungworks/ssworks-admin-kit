// 약관 화면의 타입 · 기본 문구. `useLegalDocuments`(흐름)와 `LegalDocumentEditor`(화면)가 함께 쓴다.

import { LEGAL_BODY_MAX_LENGTH } from '@ssworks/admin-shared'

/** 탭 하나 — 종류 값과 화면 이름. 값 집합은 소비자 카탈로그다(킷은 하드코딩하지 않는다) */
export interface LegalKindOption<K extends string = string> {
  value: K
  label: string
}

/**
 * 발행이 막힌 첫 이유. 순서가 있다(3e 스펙 D16): readonly → loading → loadFailed → empty → tooLong → unchanged.
 * 화면은 `loading` 을 뺀 다섯을 버튼 옆 글자로 보인다.
 */
export type LegalPublishBlock =
  'readonly' | 'loading' | 'loadFailed' | 'empty' | 'tooLong' | 'unchanged'

export interface LegalDialogText {
  title: string
  message: string
  confirmLabel: string
}

/** 흐름이 내는 문구 — 발행 완료 알림 · 발행 확인 · 초안 버리기 확인 */
export interface LegalMessages {
  published: (kindLabel: string) => string
  publishConfirm: (kindLabel: string) => LegalDialogText
  discardConfirm: (fromLabel: string, toLabel: string) => LegalDialogText
}

export const DEFAULT_LEGAL_MESSAGES: LegalMessages = {
  published: (kindLabel) => `${kindLabel} 새 버전을 발행했습니다.`,
  publishConfirm: (kindLabel) => ({
    title: `${kindLabel} 새 버전 발행`,
    // 🔴 ConfirmDialog 가 reversible: false 로 「이 작업은 되돌릴 수 없습니다.」를 스스로 붙인다 — 여기서 반복하지 않는다
    message: '발행하면 새 버전이 바로 시행됩니다. 기존 버전은 이력에 그대로 남습니다.',
    confirmLabel: '발행',
  }),
  discardConfirm: (fromLabel, toLabel) => ({
    title: '편집 중인 내용 버리기',
    message: `발행하지 않은 ${fromLabel} 편집 내용이 있습니다. '${toLabel}' 탭으로 넘어가면 편집 내용이 사라집니다.`,
    confirmLabel: '버리고 이동',
  }),
}

/** 화면이 내는 문구. 흐름 문구(`LegalMessages`)와 나눈다(3d 와 같은 분리) */
export interface LegalDocumentEditorMessages {
  kindTabs: string
  editorLabel: (kindLabel: string) => string
  preview: string
  previewEmpty: string
  currentChip: string
  currentLine: (publishedAt: string, publisher: string, hash: string) => string
  notPublished: (kindLabel: string) => string
  loadFailed: string
  retry: string
  /** 날짜를 모르면(재조회 실패) null */
  conflict: (publishedAt: string | null) => string
  publish: string
  /** 발행이 막힌 이유 — `loading` 은 진행 막대가 대신한다 */
  blocked: Record<Exclude<LegalPublishBlock, 'loading'>, string>
  historyTitle: string
  historyFailed: string
  historyEmpty: string
  headers: { legalDocNo: string; publishedAt: string; publisher: string; contentHash: string }
  view: string
  viewLabel: (legalDocNo: bigint) => string
  detailTitle: string
  detailMeta: (legalDocNo: bigint, publishedAt: string, publisher: string, hash: string) => string
  detailFailed: string
  close: string
}

const CONFLICT_TAIL =
  '발행했습니다. 이력에서 새 판을 확인한 뒤 다시 발행하세요. 다시 발행하면 그 판을 대체합니다.'

export const DEFAULT_LEGAL_DOCUMENT_EDITOR_MESSAGES: LegalDocumentEditorMessages = {
  kindTabs: '문서 종류',
  editorLabel: (kindLabel) => `${kindLabel} 본문`,
  preview: '미리보기',
  previewEmpty: '미리 볼 내용이 없습니다.',
  currentChip: '시행 중',
  currentLine: (publishedAt, publisher, hash) =>
    `${publishedAt} 발행 · ${publisher} · 해시 ${hash}`,
  notPublished: (kindLabel) =>
    `아직 발행된 ${kindLabel} 문서가 없습니다. 본문을 작성해 발행하세요.`,
  loadFailed: '현재본을 불러오지 못했습니다. 다시 불러오기 전까지 발행할 수 없습니다.',
  retry: '다시 시도',
  conflict: (publishedAt) =>
    publishedAt == null
      ? `다른 관리자가 새 버전을 ${CONFLICT_TAIL}`
      : `다른 관리자가 ${publishedAt}에 새 버전을 ${CONFLICT_TAIL}`,
  publish: '새 버전 발행',
  blocked: {
    readonly: '발행 권한이 없습니다.',
    loadFailed: '현재본을 불러온 뒤 발행할 수 있습니다.',
    empty: '본문을 입력하세요.',
    tooLong: `본문은 ${LEGAL_BODY_MAX_LENGTH.toLocaleString('en-US')}자를 넘을 수 없습니다.`,
    unchanged: '시행 중인 판과 내용이 같습니다.',
  },
  historyTitle: '발행 이력',
  historyFailed: '발행 이력을 불러오지 못했습니다. 아래 목록이 최신이 아닐 수 있습니다.',
  historyEmpty: '발행 이력이 없습니다.',
  headers: { legalDocNo: '번호', publishedAt: '발행일', publisher: '발행자', contentHash: '해시' },
  view: '보기',
  viewLabel: (legalDocNo) => `${legalDocNo}번 판 원문 보기`,
  detailTitle: '판 원문',
  detailMeta: (legalDocNo, publishedAt, publisher, hash) =>
    `${legalDocNo}번 · ${publishedAt} · ${publisher} · 해시 ${hash}`,
  detailFailed: '원문을 불러오지 못했습니다.',
  close: '닫기',
}

/**
 * 해시 표시용 앞 8자. 관리자가 판을 눈으로 가려내는 용도이지 그 자체가 증거는 아니다 — 전체 값은 서버에 있다(axion
 * `legal.util.ts`). 비었으면 "-".
 */
export function shortHash(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 8) : '-'
}

/**
 * 발행자 표기(3e D20): 이름 → 없으면 `#번호`(axion — 이름이 바뀌거나 비어도 추적할 수 있게) → 둘 다 없으면 "-"(gise —
 * 계정이 지워지면 FK SET NULL 로 둘 다 빈다).
 */
export function publisherLabel(name: string | null, userNo: bigint | null): string {
  if (name != null && name !== '') return name
  if (userNo != null) return `#${userNo}`
  return '-'
}
