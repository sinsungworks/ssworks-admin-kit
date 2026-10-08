import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import {
  LEGAL_BODY_MAX_LENGTH,
  type AdminLegalDocument,
  type AdminLegalHistoryItem,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import {
  useLegalDocuments,
  type LegalDocumentsController,
  type UseLegalDocumentsOptions,
} from './useLegalDocuments.js'

// DOM 없이 흐름만 잰다. 대화상자는 바인딩의 `onConfirm` · `onUpdate:modelValue` 를 직접 부른다. 어댑터는 직접 푸는
// Promise(deferred)로 응답 순서를 만든다. 화면과 함께 도는 시나리오는 `useLegalDocuments.render.test.ts`(Task 7).

const KINDS = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보처리방침' },
] as const
type Kind = (typeof KINDS)[number]['value']

const HASH = '0123456789abcdef'.repeat(4)

function doc(legalDocNo: number, kind: Kind, body: string): AdminLegalDocument {
  return {
    legalDocNo: BigInt(legalDocNo),
    kind,
    body,
    contentHash: HASH,
    publishedAt: '2026-09-01T05:00:00.000Z',
    publishedByUserNo: 7n,
    publishedByUserName: '김관리',
  }
}

function item(d: AdminLegalDocument): AdminLegalHistoryItem {
  return {
    legalDocNo: d.legalDocNo,
    kind: d.kind,
    contentHash: d.contentHash,
    publishedAt: d.publishedAt,
    publishedByUserNo: d.publishedByUserNo,
    publishedByUserName: d.publishedByUserName,
  }
}

const TERMS_12 = doc(12, 'TERMS', '# 이용약관 v12\n')
const TERMS_13 = doc(13, 'TERMS', '# 이용약관 v13(다른 관리자)\n')
const PRIVACY_5 = doc(5, 'PRIVACY', '# 개인정보처리방침 v5\n')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const apiError = (status: number, code: string, message = '실패') =>
  new ApiError(message, { status, code, raw: null })

const scopes: EffectScope[] = []

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.restoreAllMocks()
})

function setup(options: Partial<UseLegalDocumentsOptions<Kind>> = {}) {
  const loadCurrent = vi.fn(async (kind: Kind) => (kind === 'TERMS' ? TERMS_12 : PRIVACY_5))
  const loadHistory = vi.fn(async (kind: Kind) =>
    kind === 'TERMS' ? [item(TERMS_12)] : [item(PRIVACY_5)],
  )
  const loadOne = vi.fn(async (legalDocNo: bigint) => (legalDocNo === 12n ? TERMS_12 : PRIVACY_5))
  const publish = vi.fn(async () => ({ legalDocNo: 13n, contentHash: HASH }))
  const onDone = vi.fn()
  const scope = effectScope()
  scopes.push(scope)
  const adapters = {
    kinds: KINDS,
    loadCurrent,
    loadHistory,
    loadOne,
    publish,
    onDone,
    ...options,
  }
  const legal = scope.run(() => useLegalDocuments<Kind>(adapters))!
  // 덮어쓴 어댑터가 있으면 그것을 돌려준다 — 호출 검증이 실제로 넘긴 함수를 보게
  return {
    legal,
    scope,
    loadCurrent: adapters.loadCurrent,
    loadHistory: adapters.loadHistory,
    loadOne: adapters.loadOne,
    publish: adapters.publish,
    onDone: adapters.onDone,
  }
}

/** 확인 대화상자에서 "발행" 을 누른 것과 같다 */
async function confirmPublish(legal: LegalDocumentsController<Kind>) {
  legal.editor.value.publishDialog.onConfirm()
  await flush()
}

describe('useLegalDocuments — 불러오기', () => {
  it('처음 종류의 현재본 · 이력을 부르고, 초안은 본문 · 깨끗하다', async () => {
    const { legal, loadCurrent, loadHistory } = setup()
    await flush()
    expect(loadCurrent).toHaveBeenCalledWith('TERMS')
    expect(loadHistory).toHaveBeenCalledWith('TERMS')
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.current.value).toEqual(TERMS_12)
    expect(legal.draft.value).toBe('# 이용약관 v12\n')
    expect(legal.isDirty.value).toBe(false)
    expect(legal.history.value).toEqual([item(TERMS_12)])
    expect(legal.publishBlock.value).toBe('unchanged')
    expect(legal.canPublish.value).toBe(false)
    expect(legal.editor.value.readonly).toBe(false)
  })

  it('immediate: false 면 부르지 않는다', async () => {
    const { loadCurrent, loadHistory } = setup({ immediate: false })
    await flush()
    expect(loadCurrent).not.toHaveBeenCalled()
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('🔴 immediate: false 는 처음 불러올 때까지 loading — 잠겨 있다(D16)', async () => {
    const { legal, loadCurrent } = setup({ immediate: false })
    await flush()
    expect(legal.loading.value).toBe(true)
    expect(legal.publishBlock.value).toBe('loading')
    expect(legal.editor.value.readonly).toBe(true)
    expect(loadCurrent).not.toHaveBeenCalled()

    await legal.reload()
    expect(legal.loading.value).toBe(false)
    expect(legal.publishBlock.value).toBe('unchanged')
    expect(legal.editor.value.readonly).toBe(false)
  })

  it('initialKind 로 시작하고, 목록에 없으면 경고 뒤 첫 종류', async () => {
    const { legal } = setup({ initialKind: 'PRIVACY' })
    await flush()
    expect(legal.kind.value).toBe('PRIVACY')

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const other = setup({ initialKind: 'REFUND' as Kind })
    expect(other.legal.kind.value).toBe('TERMS')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('kinds 가 비면 만들 때 예외', () => {
    expect(() => setup({ kinds: [] })).toThrow()
  })

  it('미발행(null)이면 빈 초안 · empty, 쓰면 발행할 수 있다', async () => {
    const { legal } = setup({ loadCurrent: vi.fn(async () => null) })
    await flush()
    expect(legal.current.value).toBeNull()
    expect(legal.draft.value).toBe('')
    expect(legal.loadFailed.value).toBe(false)
    expect(legal.publishBlock.value).toBe('empty')
    legal.setDraft('# 이용약관\n')
    expect(legal.canPublish.value).toBe(true)
  })

  it('불러오는 동안은 loading · 읽기 전용', async () => {
    const pending = deferred<AdminLegalDocument | null>()
    const { legal } = setup({ loadCurrent: vi.fn(() => pending.promise) })
    expect(legal.loading.value).toBe(true)
    expect(legal.publishBlock.value).toBe('loading')
    expect(legal.editor.value.readonly).toBe(true)
    pending.resolve(TERMS_12)
    await flush()
    expect(legal.loading.value).toBe(false)
    expect(legal.editor.value.readonly).toBe(false)
  })

  it('현재본 실패 → 잠금 · 읽기 전용, 다시 시도로 회복', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
      .mockResolvedValueOnce(TERMS_12)
    const { legal } = setup({ loadCurrent })
    await flush()
    expect(legal.loadFailed.value).toBe(true)
    expect(legal.draft.value).toBe('')
    expect(legal.publishBlock.value).toBe('loadFailed')
    expect(legal.editor.value.readonly).toBe(true)

    legal.editor.value.onReloadCurrent()
    await flush()
    expect(legal.loadFailed.value).toBe(false)
    expect(legal.draft.value).toBe('# 이용약관 v12\n')
  })

  it('🔴 읽기 실패는 처리됨으로 표시하지 않는다 — 전역 토스트도 알린다(D13)', async () => {
    const error = apiError(500, 'ERR_COMMON_INTERNAL')
    setup({ loadCurrent: vi.fn(async () => Promise.reject(error)) })
    await flush()
    expect(error.handled).toBe(false)
  })

  it('이력 재조회가 실패하면 직전 목록을 남기고 historyFailed', async () => {
    const loadHistory = vi
      .fn<(kind: Kind) => Promise<readonly AdminLegalHistoryItem[]>>()
      .mockResolvedValueOnce([item(TERMS_12)])
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
      .mockResolvedValueOnce([item(TERMS_13), item(TERMS_12)])
    const { legal } = setup({ loadHistory })
    await flush()
    legal.editor.value.onReloadHistory()
    await flush()
    expect(legal.historyFailed.value).toBe(true)
    expect(legal.history.value).toEqual([item(TERMS_12)])
    legal.editor.value.onReloadHistory()
    await flush()
    expect(legal.historyFailed.value).toBe(false)
    expect(legal.history.value).toHaveLength(2)
  })

  it('🔴 초안이 더러울 때 reload() 는 초안을 지키고 기준만 새 본문으로(D9)', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(TERMS_13)
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    await legal.reload()
    expect(legal.current.value).toEqual(TERMS_13)
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(legal.isDirty.value).toBe(true)
    expect(legal.conflict.value).toBe(true)
  })

  it('같은 판을 더러운 초안 위에 다시 불러오면 충돌 안내는 없다', async () => {
    const { legal } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    await legal.reload()
    expect(legal.conflict.value).toBe(false)
  })

  it('미발행에서 편집 중 다른 관리자가 먼저 발행했으면 충돌 안내', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(TERMS_12)
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    await legal.reload()
    expect(legal.conflict.value).toBe(true)
    expect(legal.draft.value).toBe('# 내 편집\n')
  })

  it('깨끗한 초안은 새 판을 그냥 따라가고 충돌 안내는 없다', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(TERMS_13)
    const { legal } = setup({ loadCurrent })
    await flush()
    await legal.reload()
    expect(legal.conflict.value).toBe(false)
  })

  it('깨끗할 때 reload() 는 초안도 새 본문으로', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(TERMS_13)
    const { legal } = setup({ loadCurrent })
    await flush()
    await legal.reload()
    expect(legal.draft.value).toBe(TERMS_13.body)
    expect(legal.isDirty.value).toBe(false)
  })

  it('🔴 초안은 받은 그대로 보관한다 — 앞뒤 공백 · CRLF(D3)', async () => {
    const { legal } = setup()
    await flush()
    legal.editor.value['onUpdate:modelValue']('  본문 \r\n')
    expect(legal.draft.value).toBe('  본문 \r\n')
    expect(legal.editor.value.modelValue).toBe('  본문 \r\n')
  })
})

describe('useLegalDocuments — 종류 전환', () => {
  it('깨끗하면 바로 옮기고 새 종류를 불러온다', async () => {
    const { legal, loadCurrent } = setup()
    await flush()
    legal.editor.value.onSelectKind('PRIVACY')
    expect(legal.kind.value).toBe('PRIVACY')
    await flush()
    expect(loadCurrent).toHaveBeenLastCalledWith('PRIVACY')
    expect(legal.draft.value).toBe('# 개인정보처리방침 v5\n')
    expect(legal.history.value).toEqual([item(PRIVACY_5)])
  })

  it('🔴 옛 종류의 늦은 응답은 버린다', async () => {
    const terms = deferred<AdminLegalDocument | null>()
    const loadCurrent = vi.fn((kind: Kind) =>
      kind === 'TERMS' ? terms.promise : Promise.resolve(PRIVACY_5),
    )
    const { legal } = setup({ loadCurrent })
    legal.selectKind('PRIVACY')
    await flush()
    terms.resolve(TERMS_12)
    await flush()
    expect(legal.kind.value).toBe('PRIVACY')
    expect(legal.current.value).toEqual(PRIVACY_5)
    expect(legal.draft.value).toBe(PRIVACY_5.body)
  })

  it('더러우면 확인만 열리고 종류는 그대로 — 취소하면 아무 일도 없다', async () => {
    const { legal, loadCurrent } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    legal.selectKind('PRIVACY')
    const dialog = legal.editor.value.discardDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.title).toBe('편집 중인 내용 버리기')
    expect(dialog.message).toBe(
      "발행하지 않은 이용약관 편집 내용이 있습니다. '개인정보처리방침' 탭으로 넘어가면 편집 내용이 사라집니다.",
    )
    expect(dialog.confirmLabel).toBe('버리고 이동')
    expect(dialog.reversible).toBe(false)
    expect(legal.kind.value).toBe('TERMS')

    dialog['onUpdate:modelValue'](false)
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(loadCurrent).toHaveBeenCalledTimes(1)
  })

  it('"버리고 이동" 이면 초안을 버리고 옮긴다', async () => {
    const { legal } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    expect(legal.kind.value).toBe('PRIVACY')
    await flush()
    expect(legal.draft.value).toBe(PRIVACY_5.body)
  })

  it('🔴 옮기면 초안부터 비운다 — 새 종류 조회가 실패해도 앞 종류 본문이 남지 않는다(D7)', async () => {
    const loadCurrent = vi.fn(async (kind: Kind) => {
      if (kind === 'PRIVACY') throw apiError(500, 'ERR_COMMON_INTERNAL')
      return TERMS_12
    })
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    await flush()
    expect(legal.kind.value).toBe('PRIVACY')
    expect(legal.draft.value).toBe('')
    expect(legal.current.value).toBeNull()
    expect(legal.loadFailed.value).toBe(true)
  })

  it('같은 종류 · 없는 종류는 무시한다', async () => {
    const { legal, loadCurrent } = setup()
    await flush()
    legal.selectKind('TERMS')
    legal.selectKind('REFUND' as Kind)
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    expect(loadCurrent).toHaveBeenCalledTimes(1)
  })

  it('발행 중에는 전환을 무시한다', async () => {
    const pending = deferred<unknown>()
    const { legal } = setup({ publish: vi.fn(() => pending.promise) })
    await flush()
    legal.setDraft('# 이용약관 v12 수정\n')
    void legal.requestPublish()
    legal.editor.value.publishDialog.onConfirm()
    await flush()
    expect(legal.submitting.value).toBe(true)
    legal.selectKind('PRIVACY')
    expect(legal.kind.value).toBe('TERMS')
    expect(legal.editor.value.discardDialog.modelValue).toBe(false)
    pending.resolve({})
    await flush()
  })
})

describe('useLegalDocuments — 발행 판정', () => {
  it.each([
    ['publish 어댑터 없음', { publish: undefined }, '# 수정\n', 'readonly'],
    ['canWrite false', { canWrite: () => false }, '# 수정\n', 'readonly'],
    ['공백뿐', {}, '  \n\t', 'empty'],
    ['최대 + 1', {}, '가'.repeat(LEGAL_BODY_MAX_LENGTH + 1), 'tooLong'],
    ['시행본과 같음', {}, '# 이용약관 v12\n', 'unchanged'],
    ['최대 길이', {}, '가'.repeat(LEGAL_BODY_MAX_LENGTH), null],
  ] as const)('%s → %s', async (_label, options, body, expected) => {
    const { legal } = setup(options as Partial<UseLegalDocumentsOptions<Kind>>)
    await flush()
    legal.setDraft(body)
    expect(legal.publishBlock.value).toBe(expected)
    expect(legal.canPublish.value).toBe(expected === null)
  })

  it('🔴 이유는 순서대로 첫 것 — 권한 없음이 불러오는 중보다 먼저', () => {
    const { legal } = setup({
      canWrite: () => false,
      loadCurrent: vi.fn(() => new Promise<AdminLegalDocument | null>(() => {})),
    })
    expect(legal.loading.value).toBe(true)
    expect(legal.publishBlock.value).toBe('readonly')
  })

  it('canWrite 가 반응형 게터면 판정이 따라간다', async () => {
    const allowed = ref(true)
    const { legal } = setup({ canWrite: () => allowed.value })
    await flush()
    legal.setDraft('# 수정\n')
    expect(legal.canPublish.value).toBe(true)
    allowed.value = false
    expect(legal.publishBlock.value).toBe('readonly')
    expect(legal.editor.value.readonly).toBe(true)
  })
})

describe('useLegalDocuments — 발행', () => {
  it('확인 → 초안 · 기준 판 번호로 요청 → 깨끗 · 재조회 · onDone', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(doc(13, 'TERMS', '# 이용약관 v12\n제2조\n'))
    const { legal, publish, onDone } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 이용약관 v12\n제2조\n')
    void legal.requestPublish()
    const dialog = legal.editor.value.publishDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.title).toBe('이용약관 새 버전 발행')
    expect(dialog.message).toBe(
      '발행하면 새 버전이 바로 시행됩니다. 기존 버전은 이력에 그대로 남습니다.',
    )
    expect(dialog.confirmLabel).toBe('발행')
    expect(dialog.reversible).toBe(false)
    expect(publish).not.toHaveBeenCalled()

    await confirmPublish(legal)
    expect(publish).toHaveBeenCalledWith({
      kind: 'TERMS',
      body: '# 이용약관 v12\n제2조\n',
      baseLegalDocNo: 12n,
    })
    expect(loadCurrent).toHaveBeenCalledTimes(2)
    expect(legal.current.value?.legalDocNo).toBe(13n)
    expect(legal.isDirty.value).toBe(false)
    expect(onDone).toHaveBeenCalledWith({
      action: 'published',
      kind: 'TERMS',
      message: '이용약관 새 버전을 발행했습니다.',
    })
  })

  it('미발행에서 시작했으면 baseLegalDocNo: null', async () => {
    const { legal, publish } = setup({ loadCurrent: vi.fn(async () => null) })
    await flush()
    legal.setDraft('# 이용약관\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(publish).toHaveBeenCalledWith({
      kind: 'TERMS',
      body: '# 이용약관\n',
      baseLegalDocNo: null,
    })
  })

  it('확인을 취소하면 요청 · 재조회가 없다', async () => {
    const { legal, publish, loadCurrent } = setup()
    await flush()
    legal.setDraft('# 수정\n')
    const done = legal.requestPublish()
    legal.editor.value.publishDialog['onUpdate:modelValue'](false)
    await done
    expect(publish).not.toHaveBeenCalled()
    expect(loadCurrent).toHaveBeenCalledTimes(1)
  })

  it('막혀 있으면 확인 대화상자도 열지 않는다', async () => {
    const { legal } = setup()
    await flush()
    await legal.requestPublish()
    expect(legal.editor.value.publishDialog.modelValue).toBe(false)
  })

  it('🔴 성공 뒤 재조회가 실패해도 방금 보낸 본문은 깨끗하다(D11)', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 이용약관 v13\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(legal.loadFailed.value).toBe(true)
    expect(legal.draft.value).toBe('# 이용약관 v13\n')
    expect(legal.isDirty.value).toBe(false)
  })

  it('🔴 revision 충돌 → 처리됨 · 초안 유지 · 기준 = 새 판, 다시 발행하면 새 번호로(D12)', async () => {
    const conflict = apiError(
      409,
      'ERR_COMMON_REVISION_CONFLICT',
      '다른 관리자가 먼저 발행했습니다.',
    )
    const publish = vi
      .fn<(body: unknown) => Promise<unknown>>()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ legalDocNo: 14n, contentHash: HASH })
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValue(TERMS_13)
    const { legal, onDone } = setup({ publish, loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await confirmPublish(legal)

    expect(conflict.handled).toBe(true)
    expect(legal.conflict.value).toBe(true)
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(legal.current.value).toEqual(TERMS_13)
    expect(legal.isDirty.value).toBe(true)
    expect(legal.canPublish.value).toBe(true)
    expect(onDone).not.toHaveBeenCalled()

    void legal.requestPublish()
    await confirmPublish(legal)
    expect(publish).toHaveBeenLastCalledWith({
      kind: 'TERMS',
      body: '# 내 편집\n',
      baseLegalDocNo: 13n,
    })
    expect(legal.conflict.value).toBe(false)
  })

  it('충돌 안내는 닫을 수 있고, 종류를 바꾸면 내린다', async () => {
    const { legal } = setup({
      publish: vi.fn(async () => Promise.reject(apiError(409, 'ERR_COMMON_REVISION_CONFLICT'))),
    })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(legal.conflict.value).toBe(true)
    legal.editor.value.onDismissConflict()
    expect(legal.conflict.value).toBe(false)

    // 다시 충돌시킨 뒤 종류를 바꾼다 — 초안이 더러우니 버리기 확인을 거친다
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(legal.conflict.value).toBe(true)
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    expect(legal.conflict.value).toBe(false)
  })

  it('그 밖의 실패는 처리 표시 없이(전역 토스트) — 초안 유지 · 재조회 없음', async () => {
    const error = apiError(500, 'ERR_COMMON_INTERNAL')
    const { legal, loadCurrent, onDone } = setup({
      publish: vi.fn(async () => Promise.reject(error)),
    })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(error.handled).toBe(false)
    expect(legal.draft.value).toBe('# 내 편집\n')
    expect(legal.conflict.value).toBe(false)
    expect(loadCurrent).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('🔴 확인 대기 중 권한이 사라지면 보내지 않는다(D10)', async () => {
    let allowed = true
    const { legal, publish, loadCurrent, onDone } = setup({ canWrite: () => allowed })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    allowed = false
    await confirmPublish(legal)
    expect(publish).not.toHaveBeenCalled()
    expect(loadCurrent).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('🔴 확인 대기 중 종류가 바뀌었으면 보내지 않는다(D10)', async () => {
    const { legal, publish } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    // 대화상자가 열린 사이 다른 경로(페이지 코드)가 종류를 바꿨다 — 초안이 더러우니 버리기 확인을 거친다
    legal.selectKind('PRIVACY')
    legal.editor.value.discardDialog.onConfirm()
    await flush()
    // 새 종류의 초안이 발행 가능해야 kind 재검사만 막고 있음을 잰다
    legal.setDraft('# 개인정보 편집\n')
    await confirmPublish(legal)
    expect(publish).not.toHaveBeenCalled()
  })

  it('🔴 확인 대기 중 재조회가 새 판을 가져오면 보내지 않고 충돌 안내를 남긴다(D10 · R2)', async () => {
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValue(TERMS_13)
    const { legal, publish } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await legal.reload()
    expect(legal.current.value?.legalDocNo).toBe(13n)
    await confirmPublish(legal)
    expect(publish).not.toHaveBeenCalled()
    expect(legal.conflict.value).toBe(true)
    expect(legal.editor.value.publishDialog.modelValue).toBe(false)
  })

  it('확인 대기 중 재조회가 같은 판이면 그대로 보낸다(과차단 없음)', async () => {
    const { legal, publish } = setup()
    await flush()
    legal.setDraft('# 내 편집\n')
    void legal.requestPublish()
    await legal.reload()
    await confirmPublish(legal)
    expect(publish).toHaveBeenCalledWith({
      kind: 'TERMS',
      body: '# 내 편집\n',
      baseLegalDocNo: 12n,
    })
  })

  it('🔴 발행 뒤 재조회가 서버가 고친 본문을 주면 초안이 그것을 따른다 — 충돌 없음(D11 순서)', async () => {
    const normalized = doc(13, 'TERMS', '# 이용약관 v13(서버 정규화)\n')
    const loadCurrent = vi
      .fn<(kind: Kind) => Promise<AdminLegalDocument | null>>()
      .mockResolvedValueOnce(TERMS_12)
      .mockResolvedValueOnce(normalized)
    const { legal } = setup({ loadCurrent })
    await flush()
    legal.setDraft('# 내가 보낸 본문\n')
    void legal.requestPublish()
    await confirmPublish(legal)
    expect(legal.draft.value).toBe(normalized.body)
    expect(legal.isDirty.value).toBe(false)
    expect(legal.conflict.value).toBe(false)
  })
})

describe('useLegalDocuments — 원문', () => {
  it('보기 → 불러오는 중 → 원문', async () => {
    const one = deferred<AdminLegalDocument>()
    const { legal, loadOne } = setup({ loadOne: vi.fn(() => one.promise) })
    await flush()
    legal.editor.value.onOpenDetail(item(TERMS_12))
    let dialog = legal.editor.value.detailDialog
    expect(dialog.modelValue).toBe(true)
    expect(dialog.row).toEqual(item(TERMS_12))
    expect(dialog.loading).toBe(true)
    expect(loadOne).toHaveBeenCalledWith(12n)
    one.resolve(TERMS_12)
    await flush()
    dialog = legal.editor.value.detailDialog
    expect(dialog.loading).toBe(false)
    expect(dialog.document).toEqual(TERMS_12)
  })

  it('실패 → failed, 다시 시도로 회복', async () => {
    const loadOne = vi
      .fn<(legalDocNo: bigint) => Promise<AdminLegalDocument>>()
      .mockRejectedValueOnce(apiError(500, 'ERR_COMMON_INTERNAL'))
      .mockResolvedValueOnce(TERMS_12)
    const { legal } = setup({ loadOne })
    await flush()
    legal.editor.value.onOpenDetail(item(TERMS_12))
    await flush()
    expect(legal.editor.value.detailDialog.failed).toBe(true)
    legal.editor.value.detailDialog.onRetry()
    await flush()
    expect(legal.editor.value.detailDialog.failed).toBe(false)
    expect(legal.editor.value.detailDialog.document).toEqual(TERMS_12)
  })

  it('🔴 닫은 뒤 · 다른 행을 연 뒤 도착한 응답은 버린다', async () => {
    const first = deferred<AdminLegalDocument>()
    const second = deferred<AdminLegalDocument>()
    const loadOne = vi
      .fn<(legalDocNo: bigint) => Promise<AdminLegalDocument>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { legal } = setup({ loadOne })
    await flush()
    void legal.openDetail(item(TERMS_12))
    void legal.openDetail(item(TERMS_13))
    first.resolve(TERMS_12)
    await flush()
    expect(legal.editor.value.detailDialog.document).toBeNull()
    legal.editor.value.detailDialog['onUpdate:modelValue'](false)
    second.resolve(TERMS_13)
    await flush()
    expect(legal.editor.value.detailDialog.modelValue).toBe(false)
    expect(legal.editor.value.detailDialog.document).toBeNull()
  })
})

describe('useLegalDocuments — 해제', () => {
  it('🔴 스코프가 해제된 뒤 도착한 응답은 상태를 바꾸지 않는다', async () => {
    const pending = deferred<AdminLegalDocument | null>()
    const { legal, scope } = setup({ loadCurrent: vi.fn(() => pending.promise) })
    scope.stop()
    pending.resolve(TERMS_12)
    await flush()
    expect(legal.current.value).toBeNull()
    expect(legal.draft.value).toBe('')
  })
})
