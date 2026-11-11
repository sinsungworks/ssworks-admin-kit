import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { CommonErrorCodes, type AdminUploadCreated } from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { imageFile as png, stubObjectUrls } from '../test/image-transfer.js'
import { useImageAttachments, type UseImageAttachmentsOptions } from './useImageAttachments.js'

// DOM 없이 흐름만 잰다(Node 의 File · URL). blob: 주소는 결정적인 대역(stubObjectUrls)이다.

const MB = 1_048_576
const KEY_A = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'

let revoked: string[] = []

beforeEach(() => {
  revoked = stubObjectUrls().revoked
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 올린 결과 — 파일 이름으로 키를 만든다(이름은 영숫자 32자로 채운다) */
function createdFor(file: File): AdminUploadCreated {
  const id = file.name
    .replace(/[^A-Za-z0-9]/g, '')
    .padEnd(32, 'x')
    .slice(0, 32)
  const key = `legal/2026/11/${id}.webp`
  return { key, url: `/api/media/${key}`, width: 1, height: 1, bytes: file.size }
}

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

/** 기본 대역(upload · remove · onRejected)으로 만든다 — 덮은 어댑터는 테스트가 들고 있는 것을 잰다 */
function setup(overrides: Partial<UseImageAttachmentsOptions> = {}) {
  const uploaded: string[] = []
  const upload = vi.fn(async (file: File) => {
    uploaded.push(file.name)
    return createdFor(file)
  })
  const remove = vi.fn(async (_key: string): Promise<unknown> => undefined)
  const onRejected = vi.fn()
  const attachments = useImageAttachments({ upload, remove, onRejected, ...overrides })
  return { attachments, uploaded, upload, remove, onRejected }
}

describe('useImageAttachments — add(C1)', () => {
  it('받아들인 것의 blob: 주소를 고른 순서로 · 거른 것은 사유마다 onRejected 한 번', () => {
    const { attachments, onRejected } = setup()
    const urls = attachments.add(
      [
        png('a.png'),
        new File(['x'], 'b.svg', { type: 'image/svg+xml' }),
        png('c.png', 11 * MB),
        new File(['x'], 'd.gif', { type: 'image/gif' }),
        new File(['x'], 'e.txt', { type: 'text/plain' }),
      ],
      '',
    )
    expect(urls).toEqual(['blob:test/u001', 'blob:test/u002'])
    expect(onRejected.mock.calls).toEqual([
      [
        {
          reason: 'type',
          count: 2,
          message: '지원하지 않는 형식이라 2장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)',
        },
      ],
      [{ reason: 'size', count: 1, message: '장당 최대 10MB를 넘어 1장을 넣지 않았습니다.' }],
    ])
  })

  it('남은 칸 = maxPerBody − 본문의 우리 키 − 본문 안 등록 blob − 이번에 앞서 받은 수', () => {
    const { attachments, onRejected } = setup({ policy: { maxPerBody: 3 } })
    const [first] = attachments.add([png('a.png')], '')
    const body = `![](/api/media/${KEY_A})\n\n![](${first})`
    expect(attachments.add([png('b.png'), png('c.png')], body)).toEqual(['blob:test/u002'])
    expect(onRejected).toHaveBeenLastCalledWith({
      reason: 'full',
      count: 1,
      message: '이미지 수가 한도를 넘어 1장을 넣지 않았습니다.',
    })
  })

  it('본문에서 지운 등록 그림은 칸을 쓰지 않는다 · 같은 그림이 두 번이어도 하나', () => {
    const { attachments } = setup({ policy: { maxPerBody: 2 } })
    const [a] = attachments.add([png('a.png')], '')
    attachments.add([png('b.png')], `![](${a})`)
    expect(attachments.add([png('c.png')], `![](${a})\n\n![](${a})`)).toHaveLength(1)
  })

  it('C9 — room 이 있으면 maxPerBody 셈 대신 쓰이고, 한 add 안에서 앞서 받은 수만큼 준다', () => {
    const room = vi.fn(() => 2)
    const { attachments, onRejected } = setup({ room, policy: { maxPerBody: 1 } })
    const body = `![](/api/media/${KEY_A})`
    expect(attachments.add([png('a.png'), png('b.png'), png('c.png')], body)).toHaveLength(2)
    expect(room).toHaveBeenCalledTimes(1)
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'full', count: 1 }))
  })

  it.each([0, -1, Number.NaN])('C9 — room() 이 %s 면 전부 full', (value) => {
    const { attachments, onRejected } = setup({ room: () => value })
    expect(attachments.add([png('a.png'), png('b.png')], '')).toEqual([])
    expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'full', count: 2 }))
  })

  it('policy.maxBytes · messages 를 따른다', () => {
    const { attachments, onRejected } = setup({
      policy: { maxBytes: 2 * MB },
      messages: { rejectedSize: (count, max) => `${count}장 · ${max}` },
    })
    attachments.add([png('a.png', 3 * MB)], '')
    expect(onRejected).toHaveBeenCalledWith({
      reason: 'size',
      count: 1,
      message: `1장 · ${2 * MB}`,
    })
  })
})

describe('useImageAttachments — count(C10)', () => {
  it('본문(들)에 남은 등록 주소의 수 — 같은 주소 둘 · 여러 본문은 하나, 미등록 blob 은 세지 않는다', () => {
    const { attachments } = setup()
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    expect(attachments.count(`![](${a})\n\n![](${a})`)).toBe(1)
    expect(attachments.count([`![](${a})`, `![](${a})\n\n![](${b})`])).toBe(2)
    expect(attachments.count('![](blob:test/u999)')).toBe(0)
    expect(attachments.count([])).toBe(0)
  })
})

describe('useImageAttachments — commit(C2)', () => {
  it('본문에 남은 등록 주소만 등록 순서로 올려 모두 치환한 본문으로 save — 성공 뒤 그 주소만 해제', async () => {
    const { attachments, uploaded } = setup()
    const [a, b, gone] = attachments.add([png('a.png'), png('b.png'), png('gone.png')], '')
    const save = vi.fn(async (final: string) => `saved:${final.length}`)
    const draft = `![](${b})\n\n글\n\n![](${a})\n\n![](${b})`
    const result = await attachments.commit(draft, save)
    expect(uploaded).toEqual(['a.png', 'b.png'])
    const urlA = createdFor(png('a.png')).url
    const urlB = createdFor(png('b.png')).url
    expect(save).toHaveBeenCalledWith(`![](${urlB})\n\n글\n\n![](${urlA})\n\n![](${urlB})`)
    expect(result).toBe(`saved:${save.mock.calls[0]![0].length}`)
    expect(revoked).toEqual([a, b])
    expect(attachments.count([`![](${a})`, `![](${b})`, `![](${gone})`])).toBe(1)
  })

  it('C8 — 등록은 본문과 무관하다: 본문에 없던 그림은 올라가지 않고, 되돌려 다시 넣으면 다음 저장에 올라간다', async () => {
    const { attachments, uploaded } = setup()
    const [a] = attachments.add([png('a.png')], '')
    await attachments.commit('그림을 지운 본문', async () => undefined)
    expect(uploaded).toEqual([])
    await attachments.commit(`![](${a})`, async () => undefined)
    expect(uploaded).toEqual(['a.png'])
  })

  it('업로드 n장째 실패 → 앞서 올린 키만 remove · 원래 예외를 다시 던진다 · save 없음 · 등록은 그대로', async () => {
    const failure = new ApiError('x', { status: 400, code: 'ERR_X', raw: null })
    const upload = vi.fn(async (file: File) => {
      if (file.name === 'b.png') throw failure
      return createdFor(file)
    })
    const { attachments, remove } = setup({ upload })
    const [a, b, c] = attachments.add([png('a.png'), png('b.png'), png('c.png')], '')
    const save = vi.fn(async () => undefined)
    const draft = `![](${a})\n\n![](${b})\n\n![](${c})`
    await expect(attachments.commit(draft, save)).rejects.toBe(failure)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(createdFor(png('a.png')).key)
    expect(revoked).toEqual([])
    expect(attachments.count(draft)).toBe(3)
  })

  it('save 실패 → 올린 키 모두 remove · 원래 예외 · 다시 저장하면 전부 다시 올린다', async () => {
    const conflict = new ApiError('다른 관리자가 먼저 발행했습니다.', {
      status: 409,
      code: 'ERR_COMMON_REVISION_CONFLICT',
      raw: null,
    })
    const { attachments, remove, uploaded } = setup()
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    const draft = `![](${a})\n\n![](${b})`
    await expect(attachments.commit(draft, async () => Promise.reject(conflict))).rejects.toBe(
      conflict,
    )
    expect(remove.mock.calls).toEqual([
      [createdFor(png('a.png')).key],
      [createdFor(png('b.png')).key],
    ])
    expect(conflict.message).toBe('다른 관리자가 먼저 발행했습니다.')
    await attachments.commit(draft, async () => undefined)
    expect(uploaded).toEqual(['a.png', 'b.png', 'a.png', 'b.png'])
  })

  it('🔴 되돌림을 기다리지 않는다 — remove 가 끝나기 전에 commit 이 거부된다(handled 계약)', async () => {
    const pending = deferred<undefined>()
    const remove = vi.fn(() => pending.promise)
    const { attachments } = setup({ remove })
    const [a] = attachments.add([png('a.png')], '')
    const failure = new Error('save')
    await expect(attachments.commit(`![](${a})`, async () => Promise.reject(failure))).rejects.toBe(
      failure,
    )
    expect(remove).toHaveBeenCalledTimes(1)
    expect(attachments.busy.value).toBe(false)
    pending.resolve(undefined)
  })

  it('remove 실패는 삼킨다 — ApiError 는 handled(전역 토스트로 두 번 알리지 않는다) · remove 가 없으면 되돌리지 않는다', async () => {
    const gone = new ApiError('이미지를 찾을 수 없습니다.', {
      status: 404,
      code: CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
      raw: null,
    })
    const { attachments } = setup({ remove: vi.fn(async () => Promise.reject(gone)) })
    const [a] = attachments.add([png('a.png')], '')
    await expect(
      attachments.commit(`![](${a})`, async () => Promise.reject(new Error('save'))),
    ).rejects.toThrow('save')
    await flush()
    expect(gone.handled).toBe(true)

    const bare = useImageAttachments({ upload: async (file) => createdFor(file) })
    const [b] = bare.add([png('b.png')], '')
    await expect(
      bare.commit(`![](${b})`, async () => Promise.reject(new Error('x'))),
    ).rejects.toThrow('x')
  })

  it('🔴 업로드 실패 문구 — 같은 ApiError 의 message 를 코드로 바꾼다(503 · 413) · errorMessages 로 덮는다', async () => {
    const unavailable = new ApiError('서버 내부 오류가 발생했습니다.', {
      status: 503,
      code: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
      raw: null,
    })
    const first = setup({ upload: vi.fn(async () => Promise.reject(unavailable)) })
    const [a] = first.attachments.add([png('a.png')], '')
    await expect(first.attachments.commit(`![](${a})`, async () => undefined)).rejects.toBe(
      unavailable,
    )
    expect(unavailable.message).toBe('이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.')

    const tooLarge = new ApiError('이미지가 너무 큽니다.', {
      status: 413,
      code: CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
      details: { maxBytes: 5 * MB },
      raw: null,
    })
    const second = setup({
      upload: vi.fn(async () => Promise.reject(tooLarge)),
      errorMessages: { tooLarge: (max) => `너무 큼 ${max}` },
    })
    const [b] = second.attachments.add([png('b.png')], '')
    await expect(second.attachments.commit(`![](${b})`, async () => undefined)).rejects.toBe(
      tooLarge,
    )
    expect(tooLarge.message).toBe(`너무 큼 ${5 * MB}`)
  })

  it('save 가 던진 업로드 코드 오류는 문구를 바꾸지 않는다 — 서버 4xx 문구 그대로', async () => {
    const limit = new ApiError('사진과 본문 그림은 합쳐 20장까지입니다.', {
      status: 409,
      code: CommonErrorCodes.ERR_UPLOAD_LIMIT,
      raw: null,
    })
    const { attachments } = setup()
    const [a] = attachments.add([png('a.png')], '')
    await expect(attachments.commit(`![](${a})`, async () => Promise.reject(limit))).rejects.toBe(
      limit,
    )
    expect(limit.message).toBe('사진과 본문 그림은 합쳐 20장까지입니다.')
  })

  it('busy · progress — 업로드마다 done 이 오르고, 진행 중 commit 은 거부되며, 끝나면 0/0', async () => {
    const gates = [deferred<void>(), deferred<void>()]
    const upload = vi.fn(async (file: File) => {
      await gates[file.name === 'a.png' ? 0 : 1]!.promise
      return createdFor(file)
    })
    const { attachments } = setup({ upload })
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    const save = vi.fn(async () => 'ok')
    const running = attachments.commit(`![](${a})\n\n![](${b})`, save)
    expect(attachments.busy.value).toBe(true)
    expect(attachments.progress.value).toEqual({ done: 0, total: 2 })
    await expect(attachments.commit('다른 본문', save)).rejects.toThrow('이미 진행 중')
    await expect(attachments.commit(['다른 본문'], async () => 'x')).rejects.toThrow('이미 진행 중')
    gates[0]!.resolve()
    await flush()
    expect(attachments.progress.value).toEqual({ done: 1, total: 2 })
    gates[1]!.resolve()
    await expect(running).resolves.toBe('ok')
    expect(save).toHaveBeenCalledTimes(1)
    expect(attachments.busy.value).toBe(false)
    expect(attachments.progress.value).toEqual({ done: 0, total: 0 })
  })
})

describe('useImageAttachments — 배열 commit(C11)', () => {
  it('모든 본문의 등록 주소를 등록 순서로 한 번씩 올리고 본문마다 치환 — finals 는 같은 길이 · 순서', async () => {
    const { attachments, uploaded } = setup()
    const [a, b, c] = attachments.add([png('a.png'), png('b.png'), png('c.png')], '')
    const save = vi.fn(async (finals: string[]) => finals.length)
    const bodies = [`![](${c})`, '그림 없음', `![](${a})\n\n![](${c})`]
    await expect(attachments.commit(bodies, save)).resolves.toBe(3)
    expect(uploaded).toEqual(['a.png', 'c.png'])
    const urlA = createdFor(png('a.png')).url
    const urlC = createdFor(png('c.png')).url
    expect(save).toHaveBeenCalledWith([`![](${urlC})`, '그림 없음', `![](${urlA})\n\n![](${urlC})`])
    expect(revoked).toEqual([a, c])
    expect(attachments.count(`![](${b})`)).toBe(1)
  })

  it('빈 배열이면 업로드 없이 save([])', async () => {
    const { attachments, upload } = setup()
    attachments.add([png('a.png')], '')
    const save = vi.fn(async (finals: string[]) => finals)
    await expect(attachments.commit([], save)).resolves.toEqual([])
    expect(upload).not.toHaveBeenCalled()
  })

  it('업로드 n장째 실패 · save 실패 둘 다 이번 commit 이 올린 키만 지운다', async () => {
    const failure = new Error('업로드')
    const upload = vi.fn(async (file: File) => {
      if (file.name === 'c.png') throw failure
      return createdFor(file)
    })
    const { attachments, remove } = setup({ upload })
    const [a, b, c] = attachments.add([png('a.png'), png('b.png'), png('c.png')], '')
    await attachments.commit([`![](${a})`], async () => undefined)
    expect(remove).not.toHaveBeenCalled()

    await expect(
      attachments.commit([`![](${b})`, `![](${c})`], async () => undefined),
    ).rejects.toBe(failure)
    expect(remove.mock.calls).toEqual([[createdFor(png('b.png')).key]])

    remove.mockClear()
    await expect(
      attachments.commit([`![](${b})`], async () => Promise.reject(new Error('save'))),
    ).rejects.toThrow('save')
    expect(remove.mock.calls).toEqual([[createdFor(png('b.png')).key]])
  })
})

describe('useImageAttachments — 해제(C8)', () => {
  it('dispose — 남은 주소를 모두 해제하고, 그 뒤 add 는 빈 배열 · count 0', () => {
    const { attachments } = setup()
    const [a, b] = attachments.add([png('a.png'), png('b.png')], '')
    attachments.dispose()
    expect(revoked).toEqual([a, b])
    expect(attachments.add([png('c.png')], '')).toEqual([])
    expect(attachments.count(`![](${a})`)).toBe(0)
  })

  it('만든 스코프가 끝나면 저절로 해제한다', () => {
    const scope = effectScope()
    const attachments = scope.run(() =>
      useImageAttachments({ upload: async (file) => createdFor(file) }),
    )!
    const [a] = attachments.add([png('a.png')], '')
    scope.stop()
    expect(revoked).toEqual([a])
  })
})
