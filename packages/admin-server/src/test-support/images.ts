import { randomBytes } from 'node:crypto'
import sharp from 'sharp'

// 테스트 전용 — 이미지 픽스처를 sharp 로 만든다(바이너리를 저장소에 두지 않는다). 🔴 빌드에서 빠진다.

export async function pngImage(width = 8, height = 8, background = '#336699'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer()
}

export async function jpegImage(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#993366' } })
    .jpeg()
    .toBuffer()
}

/** EXIF Orientation 6(시계 방향 90°) — autoOrient 가 가로세로를 바꾼다 */
export async function orientedJpeg(width = 20, height = 10): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#000000' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
}

export async function webpImage(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#669933' } })
    .webp()
    .toBuffer()
}

/** 2프레임 GIF 움짤 */
export async function animatedGif(size = 4): Promise<Buffer> {
  const a = await pngImage(size, size, '#ff0000')
  const b = await pngImage(size, size, '#00ff00')
  return sharp([a, b], { join: { animated: true } })
    .gif()
    .toBuffer()
}

/** 압축이 안 되는 잡음 PNG — 결과 크기 상한(413)을 재는 데 쓴다 */
export async function noisyPng(size = 64): Promise<Buffer> {
  return sharp(randomBytes(size * size * 3), { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
}

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>',
)
export const BMP_HEADER = Buffer.from('BM' + '\u0000'.repeat(60), 'latin1')
