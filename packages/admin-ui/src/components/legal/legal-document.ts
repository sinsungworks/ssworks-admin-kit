// 약관 화면의 타입 · 기본 문구. `useLegalDocuments`(흐름)와 `LegalDocumentEditor`(화면)가 함께 쓴다.

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
