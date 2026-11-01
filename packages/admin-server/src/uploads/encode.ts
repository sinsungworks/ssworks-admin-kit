import type { UploadPolicy } from '@ssworks/admin-shared'
import sharp from 'sharp'
import {
  uploadInvalidImage,
  uploadTooLarge,
  uploadUnavailable,
  uploadUnsupportedType,
} from './errors.js'

// 정본: ssworks-ringside apps/api/src/uploads/encode.ts(encodeUpload · EncodeGate · sniffFormat)
// 바꾼 점: 정책 타입이 admin-shared UploadPolicy, 오류 팩토리가 uploads/errors.ts. 그 밖은 그대로(스펙 S4 · S5).
// 🔴 메타데이터를 싣지 않으므로 ICC 가 있는 광색역 이미지는 sRGB 로 변환된 뒤 프로파일이 빠진다(색역 손실 — 스펙 S4 의 "메타데이터 제거" 의도) · 동시성 문과 maxInputPixels 는 함께 잡는다(최대 메모리 ≈ 동시 수 × 픽셀 × 4바이트).
// 🔴 트랜잭션 밖에서 부른다(스트림 읽기 → 재인코딩 → PUT → 짧은 INSERT). 원본 바이트 상한은 readImageBody 가 먼저 본다.

export type UploadInputFormat = 'jpeg' | 'png' | 'webp' | 'gif'

export interface EncodedImage {
  /** WebP(움짤이면 움직이는 WebP) — 메타데이터 없음 */
  data: Buffer
  width: number
  /** 움짤은 한 프레임 높이 */
  height: number
  isAnimated: boolean
  /** 바이트로 본 실제 형식 — Content-Type 과 달라도 이것을 따른다 */
  inputFormat: UploadInputFormat
}

/** 재인코딩 처리 시간 상한(초) — 큰 움짤 · 압축 폭탄이 문 자리를 오래 묶지 않게. 만료는 400 unreadable */
export const ENCODE_TIMEOUT_SECONDS = 15

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 매직 바이트로 본 형식 — 받는 네 형식이 아니면 null. SVG · HEIC · AVIF · TIFF · BMP 는 sharp 가 열어도 여기서 거른다 */
export function sniffFormat(input: Buffer): UploadInputFormat | null {
  if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg'
  if (input.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  const gif = input.subarray(0, 6).toString('latin1')
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif'
  const riff = input.subarray(0, 4).toString('latin1')
  if (riff === 'RIFF' && input.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

/**
 * 검사 · 재인코딩(스펙 S4).
 * 1. 매직 바이트가 jpeg · png · webp · gif 아니면 415
 * 2. 머리(metadata — 픽셀을 풀지 않는다)를 못 읽거나 형식이 다르면 400. 픽셀(너비 × 프레임 높이 × 프레임 수) > maxInputPixels 면 400,
 *    프레임 > maxFrames 면 400 — 풀기 전에 막는다
 * 3. 정지 이미지는 EXIF 방향대로 돌린다(autoOrient — 움짤은 돌리지 않는다)
 * 4. 긴 변 > maxLongEdge 면 비율을 지켜 줄인다(fit inside · 키우지 않음). 움짤은 animated 로 열어 움직이는 WebP
 * 5. 메타데이터(EXIF · GPS · XMP · ICC)는 싣지 않는다 — withMetadata 를 부르지 않는다
 * 6. 결과 > maxBytes 면 413. 풀다 실패 · 시간 초과면 400
 */
export async function encodeUpload(input: Buffer, policy: UploadPolicy): Promise<EncodedImage> {
  const inputFormat = sniffFormat(input)
  if (inputFormat === null) throw uploadUnsupportedType()
  const meta = await sharp(input)
    .metadata()
    .catch(() => {
      throw uploadInvalidImage('unreadable')
    })
  if (meta.format !== inputFormat) throw uploadInvalidImage('unreadable')
  const width = meta.width ?? 0
  const frameHeight = meta.pageHeight ?? meta.height ?? 0
  const frames = meta.pages ?? 1
  if (width <= 0 || frameHeight <= 0) throw uploadInvalidImage('unreadable')
  if (width * frameHeight * frames > policy.maxInputPixels) {
    throw uploadInvalidImage('too_many_pixels')
  }
  if (frames > policy.maxFrames) throw uploadInvalidImage('too_many_frames')

  const animated = frames > 1
  let pipeline = sharp(input, { animated, limitInputPixels: policy.maxInputPixels })
  if (!animated) pipeline = pipeline.autoOrient()
  if (Math.max(width, frameHeight) > policy.maxLongEdge) {
    pipeline = pipeline.resize({
      width: policy.maxLongEdge,
      height: policy.maxLongEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  const data = await pipeline
    .timeout({ seconds: ENCODE_TIMEOUT_SECONDS })
    .webp({ quality: policy.webpQuality })
    .toBuffer()
    .catch(() => {
      throw uploadInvalidImage('unreadable')
    })
  if (data.length > policy.maxBytes) throw uploadTooLarge(policy.maxBytes)

  const out = await sharp(data, { animated })
    .metadata()
    .catch(() => {
      throw uploadInvalidImage('unreadable')
    })
  return {
    data,
    width: out.width ?? 0,
    height: out.pageHeight ?? out.height ?? 0,
    isAnimated: (out.pages ?? 1) > 1,
    inputFormat,
  }
}

/**
 * 프로세스당 동시 재인코딩 문(스펙 S5 — 기본 동시 2 · 대기 5초 · 대기열 8). 자리가 없으면 차례로 기다리고 waitMs 가 넘거나 대기열이
 * 찼으면 503 ERR_UPLOAD_UNAVAILABLE(자리를 받지 않는다). fn 이 끝나면(던져도) 자리를 다음 대기에 바로 넘긴다.
 * Nest 제공자는 `{ provide: EncodeGate, useValue: new EncodeGate() }` — 생성자 인자가 숫자라 클래스 제공자로 두지 않는다.
 */
export class EncodeGate {
  private active = 0
  private readonly queue: (() => void)[] = []

  constructor(
    private readonly concurrency = 2,
    private readonly waitMs = 5_000,
    private readonly maxQueue = 8,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1
      return Promise.resolve()
    }
    if (this.queue.length >= this.maxQueue) return Promise.reject(uploadUnavailable())
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        const index = this.queue.indexOf(grant)
        if (index !== -1) this.queue.splice(index, 1)
        reject(uploadUnavailable())
      }, this.waitMs)
      this.queue.push(grant)
    })
  }

  /** 기다리는 쪽이 있으면 자리를 그대로 넘긴다(active 그대로), 없으면 자리를 비운다 */
  private release(): void {
    const next = this.queue.shift()
    if (next === undefined) this.active -= 1
    else next()
  }
}
