import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
  clampRoom,
  planAttachments,
  rejectionNotices,
  replaceUrls,
  strayBlobUrls,
  urlsInBodies,
} from './image-attachments.js'

const MB = 1_048_576
const file = (name: string, type: string, size = 100) => ({ name, type, size })

describe('clampRoom(C1 · C9)', () => {
  it('0 이하 · NaN 은 0, 소수는 내림, Infinity 는 그대로', () => {
    expect(clampRoom(3)).toBe(3)
    expect(clampRoom(2.7)).toBe(2)
    expect(clampRoom(0)).toBe(0)
    expect(clampRoom(-4)).toBe(0)
    expect(clampRoom(Number.NaN)).toBe(0)
    expect(clampRoom(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('planAttachments — 형식 → 크기 → 칸(C1)', () => {
  it('받을 수 있는 넷(JPG · PNG · WebP · GIF)만 · 장당 상한 이하만 · 칸은 앞에서부터', () => {
    const files = [
      file('a.png', 'image/png'),
      file('b.svg', 'image/svg+xml'),
      file('c.jpg', 'image/jpeg', 11 * MB),
      file('d.webp', 'image/webp'),
      file('e.gif', 'image/gif'),
      file('f.heic', 'image/heic'),
    ]
    const plan = planAttachments(files, { room: 2, maxBytes: 10 * MB })
    expect(plan.accepted.map((f) => f.name)).toEqual(['a.png', 'd.webp'])
    expect(plan.rejected).toEqual({ type: 2, size: 1, full: 1 })
  })

  it('🔴 형식이 크기보다, 크기가 칸보다 먼저 — 큰 SVG 는 「형식」, 칸이 없어도 큰 PNG 는 「크기」', () => {
    const plan = planAttachments(
      [file('big.svg', 'image/svg+xml', 20 * MB), file('big.png', 'image/png', 20 * MB)],
      { room: 0, maxBytes: 10 * MB },
    )
    expect(plan.rejected).toEqual({ type: 1, size: 1, full: 0 })
  })

  it('상한과 같은 크기는 받는다 · 칸 0 이면 전부 full', () => {
    expect(
      planAttachments([file('a.png', 'image/png', 10 * MB)], { room: 1, maxBytes: 10 * MB })
        .accepted,
    ).toHaveLength(1)
    const full = planAttachments([file('a.png', 'image/png'), file('b.png', 'image/png')], {
      room: 0,
      maxBytes: 10 * MB,
    })
    expect(full).toEqual({ accepted: [], rejected: { type: 0, size: 0, full: 2 } })
  })
})

describe('rejectionNotices — 사유마다 하나', () => {
  it('형식 · 크기 · 칸 순서, 0 은 빠지고 문구에 장수 · 상한이 들어간다', () => {
    expect(
      rejectionNotices({ type: 2, size: 1, full: 3 }, DEFAULT_IMAGE_ATTACHMENT_MESSAGES, 10 * MB),
    ).toEqual([
      {
        reason: 'type',
        count: 2,
        message: '지원하지 않는 형식이라 2장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)',
      },
      { reason: 'size', count: 1, message: '장당 최대 10MB를 넘어 1장을 넣지 않았습니다.' },
      { reason: 'full', count: 3, message: '이미지 수가 한도를 넘어 3장을 넣지 않았습니다.' },
    ])
    expect(
      rejectionNotices({ type: 0, size: 0, full: 1 }, DEFAULT_IMAGE_ATTACHMENT_MESSAGES, 10 * MB),
    ).toHaveLength(1)
    expect(
      rejectionNotices({ type: 0, size: 0, full: 0 }, DEFAULT_IMAGE_ATTACHMENT_MESSAGES, 10 * MB),
    ).toEqual([])
  })

  it('진행 문구', () => {
    expect(DEFAULT_IMAGE_ATTACHMENT_MESSAGES.uploading(1, 3)).toBe('이미지 올리는 중 (1/3)')
  })
})

describe('urlsInBodies · replaceUrls(C2 · C10 · C11)', () => {
  const A = 'blob:http://localhost/0b9c7a1e-2f3d-4c5b-8a6e-1f2d3c4b5a69'
  const B = 'blob:http://localhost/7d1e9c20-4b3a-4f6e-9a8b-2c3d4e5f6a7b'
  const C = 'blob:http://localhost/9e8d7c6b-5a49-4382-a170-6f5e4d3c2b1a'

  it('본문 어느 하나라도 품은 주소만 — 주어진(등록) 순서 그대로', () => {
    expect(urlsInBodies([A, B, C], [`![](${C})`, `글 ![](${A})`])).toEqual([A, C])
    expect(urlsInBodies([A, B], ['그림 없음'])).toEqual([])
    expect(urlsInBodies([A], [])).toEqual([])
  })

  it('같은 주소가 여러 번이면 모두 바꾼다 · 모르는 주소는 그대로', () => {
    const replacements = new Map([[A, '/api/media/legal/2026/11/a.webp']])
    expect(replaceUrls(`![](${A})\n\n![x](${A})\n\n![](${B})`, replacements)).toBe(
      `![](/api/media/legal/2026/11/a.webp)\n\n![x](/api/media/legal/2026/11/a.webp)\n\n![](${B})`,
    )
  })
})

describe('strayBlobUrls — 등록에 없는 blob: 그림(I2)', () => {
  const A = 'blob:test/u001'
  const B = 'blob:test/u002'
  const X = 'blob:test/x001'
  const Y = 'blob:test/x002'

  it('등록된 주소는 뺀다 · 그림 대상이 아닌 글 속 blob: 은 세지 않는다', () => {
    expect(strayBlobUrls([A], [`![](${A})\n\n![](${X})`])).toEqual([X])
    expect(strayBlobUrls([A], ['주소는 blob:abc 처럼 생겼다 ![](/api/media/x.webp)'])).toEqual([])
  })

  it('같은 주소가 두 번이어도 하나 · 여러 본문을 모두 본다 · 처음 나온 순서', () => {
    expect(strayBlobUrls([], [`![](${Y}) ![](${X}) ![](${Y})`, `![a](${B})`])).toEqual([Y, X, B])
  })

  it('대상은 첫 괄호 · 공백 · 따옴표에서 끝난다', () => {
    expect(strayBlobUrls([], [`![](${X} "제목")`, `![](${Y})`])).toEqual([X, Y])
    expect(strayBlobUrls([], [])).toEqual([])
  })
})
