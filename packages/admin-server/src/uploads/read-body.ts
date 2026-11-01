import { UPLOAD_CONTENT_TYPES } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { uploadTooLarge, uploadUnsupportedType } from './errors.js'

// 정본: ssworks-ringside apps/api/src/uploads/upload-body.ts(express.raw 미들웨어 — 이미지 네 형식 · 하드 상한 · inflate:false)
// 바꾼 점: 미들웨어가 아니라 컨트롤러가 부르는 함수다(스펙 U2) — RouterModule 접두사와 무관하고, JSON 파서는 image/* 를 건드리지
//   않아 요청 스트림이 온전하다. Content-Encoding 이 붙은 본문은 풀지 않고 415(압축 폭탄).
// 🔴 상한을 넘는 순간 모으기를 멈추고 `resume()` 으로 남은 본문을 버린 뒤 413 을 던진다 — 소켓을 끊지 않아 클라이언트가 413 을 받는다.
// 🔴 이미지 형식은 CORS 단순 요청 형식이 아니다 — 다른 출처는 사전 요청에서 막힌다(CSRF — 같은 출처 + 비단순 본문 규약).

const UPLOAD_TYPES: ReadonlySet<string> = new Set(UPLOAD_CONTENT_TYPES)

/** Content-Type 의 미디어 형식(매개변수 · 대소문자 무시)이 이미지 네 형식인가 — 실제 형식은 재인코딩이 매직 바이트로 다시 본다 */
export function isUploadContentType(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase()
  return mediaType !== undefined && UPLOAD_TYPES.has(mediaType)
}

function headerOf(req: Request, name: string): string | undefined {
  const value = req.headers[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * 원시 이미지 본문을 Buffer 로 — 415(형식 · 인코딩) → 413(Content-Length) → 스트림(넘는 순간 413).
 * 빈 본문은 빈 Buffer 다(재인코딩의 매직 바이트 검사가 415 를 낸다).
 */
export function readImageBody(req: Request, maxBytes: number): Promise<Buffer> {
  if (!isUploadContentType(headerOf(req, 'content-type'))) {
    return Promise.reject(uploadUnsupportedType())
  }
  const encoding = headerOf(req, 'content-encoding')
  if (encoding !== undefined && encoding.trim().toLowerCase() !== 'identity') {
    return Promise.reject(uploadUnsupportedType())
  }
  const declared = Number(headerOf(req, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return Promise.reject(uploadTooLarge(maxBytes))
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false
    const finish = (done: () => void) => {
      if (settled) return
      settled = true
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('close', onClose)
      done()
    }
    const onData = (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        finish(() => {
          // 남은 본문은 버린다 — 응답을 보낼 수 있게 소켓은 그대로
          // 버리는 동안 중단돼도 'error' 가 처리 안 된 이벤트가 되지 않게 — Node 는 리스너가 있을 때만 error 를 내보낸다(본문은 이제 상관없다)
          req.on('error', () => {})
          req.resume()
          reject(uploadTooLarge(maxBytes))
        })
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => finish(() => resolve(Buffer.concat(chunks)))
    const onError = (error: Error) => finish(() => reject(error))
    const onClose = () =>
      finish(() => reject(new Error('업로드 본문을 다 받기 전에 연결이 끊겼다')))
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
    req.on('close', onClose)
  })
}
