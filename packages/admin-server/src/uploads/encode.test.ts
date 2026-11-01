import { BusinessError, CommonErrorCodes, DEFAULT_UPLOAD_POLICY } from '@ssworks/admin-shared'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { failure } from '../test-support/errors.js'
import {
  BMP_HEADER,
  SVG,
  animatedGif,
  jpegImage,
  noisyPng,
  orientedJpeg,
  pngImage,
  webpImage,
} from '../test-support/images.js'
import { EncodeGate, encodeUpload, sniffFormat } from './encode.js'

const policy = DEFAULT_UPLOAD_POLICY

async function expectCode(promise: Promise<unknown>, code: string, reason?: string) {
  const error = await failure(promise)
  expect(error.code).toBe(code)
  if (reason !== undefined) expect(error.details).toEqual({ reason })
  return error
}

describe('sniffFormat', () => {
  it('매직 바이트로 넷을 가르고 그 밖은 null', async () => {
    expect(sniffFormat(await pngImage())).toBe('png')
    expect(sniffFormat(await jpegImage())).toBe('jpeg')
    expect(sniffFormat(await webpImage())).toBe('webp')
    expect(sniffFormat(await animatedGif())).toBe('gif')
    expect(sniffFormat(SVG)).toBeNull()
    expect(sniffFormat(BMP_HEADER)).toBeNull()
    expect(sniffFormat(Buffer.alloc(0))).toBeNull()
  })
})

describe('encodeUpload(스펙 S4)', () => {
  it('PNG → WebP · 크기 · 정지 · 입력 형식', async () => {
    const out = await encodeUpload(await pngImage(8, 6), policy)
    expect(sniffFormat(out.data)).toBe('webp')
    expect(out).toMatchObject({ width: 8, height: 6, isAnimated: false, inputFormat: 'png' })
    expect(out.data.length).toBeGreaterThan(0)
  })

  it('🔴 EXIF 방향대로 돌리고 메타데이터는 싣지 않는다', async () => {
    const out = await encodeUpload(await orientedJpeg(20, 10), policy)
    expect(out.width).toBe(10)
    expect(out.height).toBe(20)
    const meta = await sharp(out.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
  })

  it('긴 변이 상한을 넘으면 비율을 지켜 줄인다 · 작으면 키우지 않는다', async () => {
    const shrunk = await encodeUpload(await pngImage(3000, 10), { ...policy, maxLongEdge: 2048 })
    expect(shrunk.width).toBe(2048)
    expect(shrunk.height).toBe(7)
    const kept = await encodeUpload(await pngImage(8, 8), { ...policy, maxLongEdge: 2048 })
    expect(kept.width).toBe(8)
  })

  it('움짤 GIF → 움직이는 WebP(2프레임) · 한 프레임 높이', async () => {
    const out = await encodeUpload(await animatedGif(4), policy)
    expect(out).toMatchObject({ width: 4, height: 4, isAnimated: true, inputFormat: 'gif' })
    expect((await sharp(out.data, { animated: true }).metadata()).pages).toBe(2)
  })

  it('WebP 입력도 지난다 — inputFormat webp · 다시 WebP', async () => {
    const out = await encodeUpload(await webpImage(6, 4), policy)
    expect(out).toMatchObject({ width: 6, height: 4, isAnimated: false, inputFormat: 'webp' })
    expect(sniffFormat(out.data)).toBe('webp')
  })

  it('🔴 400 unreadable — 매직 바이트와 실제 형식이 다르면(PNG 서명 뒤에 JPEG 본문)', async () => {
    const jpeg = await jpegImage(8, 8)
    const forged = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      jpeg.subarray(8),
    ])
    await expectCode(
      encodeUpload(forged, policy),
      CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
      'unreadable',
    )
  })

  it('415 — 형식 밖(SVG · BMP · 빈 본문)', async () => {
    for (const input of [SVG, BMP_HEADER, Buffer.alloc(0)]) {
      await expectCode(encodeUpload(input, policy), CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    }
  })

  it('🔴 400 — 픽셀 · 프레임 상한은 풀기 전에, 잘린 파일은 풀다가', async () => {
    await expectCode(
      encodeUpload(await pngImage(10, 10), { ...policy, maxInputPixels: 50 }),
      CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
      'too_many_pixels',
    )
    await expectCode(
      encodeUpload(await animatedGif(), { ...policy, maxFrames: 1 }),
      CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
      'too_many_frames',
    )
    const jpeg = await jpegImage(64, 64)
    await expectCode(
      encodeUpload(jpeg.subarray(0, Math.floor(jpeg.length * 0.6)), policy),
      CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
      'unreadable',
    )
  })

  it('413 — 결과가 장당 상한을 넘으면 details.maxBytes', async () => {
    const error = await expectCode(
      encodeUpload(await noisyPng(64), { ...policy, maxBytes: 500 }),
      CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
    )
    expect(error.details).toEqual({ maxBytes: 500 })
  })
})

describe('EncodeGate(스펙 S5)', () => {
  function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  it('동시 2 — 셋째는 자리가 날 때까지 기다린다', async () => {
    const gate = new EncodeGate(2, 1_000, 8)
    const first = deferred()
    const second = deferred()
    let thirdRan = false
    const a = gate.run(() => first.promise)
    const b = gate.run(() => second.promise)
    const c = gate.run(async () => {
      thirdRan = true
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(thirdRan).toBe(false)
      first.resolve()
      await a
      await c
      expect(thirdRan).toBe(true)
    } finally {
      first.resolve()
      second.resolve()
    }
    await b
  })

  it('🔴 대기 초과 · 대기열 가득 → 503 ERR_UPLOAD_UNAVAILABLE(자리를 받지 않는다)', async () => {
    const gate = new EncodeGate(1, 20, 1)
    const hold = deferred()
    const running = gate.run(() => hold.promise)
    const waiting = expectCode(
      gate.run(async () => 'late'),
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    )
    const overflow = expectCode(
      gate.run(async () => 'overflow'),
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    )
    await overflow
    await waiting
    hold.resolve()
    await running
    expect(await gate.run(async () => 'next')).toBe('next')
  })

  it('fn 이 던져도 자리를 돌려준다', async () => {
    const gate = new EncodeGate(1, 1_000, 8)
    await expect(
      gate.run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await gate.run(async () => 'ok')).toBe('ok')
  })

  it('uploadUnavailable 은 BusinessError 다', async () => {
    const gate = new EncodeGate(0, 5, 0)
    const error = await failure(gate.run(async () => 1))
    expect(error).toBeInstanceOf(BusinessError)
  })
})
