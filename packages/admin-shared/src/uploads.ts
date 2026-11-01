import { z } from 'zod'
import { renderMarkdown } from './markdown.js'

// 편집기 이미지 업로드 계약 — admin-server(업로드 · 첨부 · 중계)와 admin-ui(useImageAttachments)가 같은 키 모양 · 정책 · 키 모으기를
// 본다(스펙 docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md §2-2 U1 · §2-3 S6 · §4-1).
//
// 정본: ssworks-ringside packages/shared/src/contracts/uploads.ts(키 · 받는 형식)
//       + packages/shared/src/uploads/render.ts(collectMediaKeys — 렌더 출력의 <img src> 에서 키를 모은다)
// 바꾼 점:
//  - 키 접두사가 `post|article` 고정이 아니라 **용도**다(서버 옵션 uploads.purposes — 약관 종류와 같은 폭 ^[A-Za-z0-9_]{1,32}$).
//  - 정책 기본값(DEFAULT_UPLOAD_POLICY)을 여기 둔다 — 서버 옵션이 덮고 클라이언트는 같은 값으로 **먼저** 거른다(최종 판정은 서버).
//  - collectUploadKeys 는 HTML 이 아니라 Markdown 을 받아 안에서 renderMarkdown 을 부른다 — 서버 첨부 · 본문당 장수 · 클라이언트
//    남은 칸이 같은 함수 하나를 쓴다. mediaPath 가 인자다(기본 '/api/media').
// 🔴 키 패턴은 경로 탐색 문자(`..` · 공백 · `%` · `?`)를 품을 수 없다 — 저장소 · 중계 · 첨부가 이 패턴을 지난 키만 받는다.
// 🔴 정규식에 백슬래시 문자 클래스를 쓰지 않는다(`[0-9]`) — 저장소 도구 규약.

export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number]

/** 용도 — 영숫자 · `_` 1~32자(약관 종류와 같은 폭). 키의 첫 조각이자 서버 옵션 uploads.purposes 의 키 */
export const UPLOAD_PURPOSE_PATTERN = /^[A-Za-z0-9_]{1,32}$/
/** 약관 발행이 쓰는 용도 — admin-server 가 자동 등록 · admin-ui 어댑터가 `?purpose=` 에 쓴다 */
export const LEGAL_UPLOAD_PURPOSE = 'legal'
/** `<용도>/<yyyy>/<mm>/<base64url 32자>.webp` — 저장 형식은 언제나 WebP(서버가 다시 만든다) */
export const UPLOAD_KEY_PATTERN =
  /^([A-Za-z0-9_]{1,32})\/[0-9]{4}\/[0-9]{2}\/[A-Za-z0-9_-]{32}\.webp$/
/** 본문에 적는 공개 경로의 기본값 — 앱 전역 접두사 `api` + 중계 컨트롤러 `media` */
export const DEFAULT_MEDIA_PATH = '/api/media'

export interface UploadPolicy {
  /** 장당 상한(원본 · 재인코딩 결과 둘 다) — 바이트 */
  maxBytes: number
  /** 긴 변이 이보다 크면 비율을 지켜 줄인다(px). 키우지는 않는다 */
  maxLongEdge: number
  /** 너비 × 프레임 높이 × 프레임 수 상한 — 풀기 전에 머리로 검사한다(픽셀 폭탄) */
  maxInputPixels: number
  /** 움짤 프레임 상한 */
  maxFrames: number
  /** WebP 품질 1~100 */
  webpQuality: number
  /** 본문 하나에 넣을 수 있는 서로 다른 그림 수 — 클라이언트가 먼저, 서버 첨부가 최종 */
  maxPerBody: number
  /** 사람당 미첨부(올렸지만 아직 어느 본문에도 붙지 않은) 상한 */
  maxPendingPerUser: number
  /** 미첨부가 이 시간을 넘기면 정리 잡이 지움 표시한다 */
  pendingTtlHours: number
}

export const DEFAULT_UPLOAD_POLICY: Readonly<UploadPolicy> = Object.freeze({
  maxBytes: 10_485_760,
  maxLongEdge: 2048,
  maxInputPixels: 40_000_000,
  maxFrames: 100,
  webpQuality: 82,
  maxPerBody: 20,
  maxPendingPerUser: 50,
  pendingTtlHours: 24,
})

export function isUploadKey(value: string): boolean {
  return UPLOAD_KEY_PATTERN.test(value)
}

/** 키의 용도(첫 조각) — 키 모양이 아니면 null */
export function uploadPurposeOf(key: string): string | null {
  return UPLOAD_KEY_PATTERN.exec(key)?.[1] ?? null
}

/** 본문 · 응답에 적는 공개 주소 `<mediaPath>/<키>` — 서버 응답 url 과 클라이언트 셈이 같은 함수다 */
export function uploadUrl(key: string, mediaPath: string = DEFAULT_MEDIA_PATH): string {
  return `${mediaPath}/${key}`
}

/** markdown-it(html:false) 의 그림 출력 모양 — `<img src="…" alt="…">`. 속성 값은 escapeHtml 을 거쳐 `"` 가 없다 */
const IMG_SRC = /<img src="([^"]*)"/g

/**
 * Markdown 본문의 우리 그림 키 — renderMarkdown 출력의 `<img src>` 중 `<mediaPath>/<키 모양>` 인 것만, 처음 나온 순서 · 겹침 없음.
 * 🔴 렌더를 거치므로 코드 블록 · 인라인 코드 안의 `![](…)` 글자와 링크 `[x](/api/media/…)`(`<a>`)는 키가 아니다 — "보이는 그림 =
 *    첨부하는 그림"(서버 첨부 · 본문당 장수 · 클라이언트 남은 칸이 모두 이 함수). 쿼리 · 조각이 붙은 주소는 키 모양이 아니라 뺀다.
 */
export function collectUploadKeys(
  markdown: string,
  mediaPath: string = DEFAULT_MEDIA_PATH,
): string[] {
  const prefix = `${mediaPath}/`
  const keys = new Set<string>()
  for (const match of renderMarkdown(markdown).matchAll(IMG_SRC)) {
    const src = match[1] ?? ''
    if (!src.startsWith(prefix)) continue
    const key = src.slice(prefix.length)
    if (UPLOAD_KEY_PATTERN.test(key)) keys.add(key)
  }
  return [...keys]
}

/** 스키마 문구 — 서버 400 의 칸 오류로 나간다(admin-server 문구 덮기 표 `uploadsSchema`) */
export const UPLOAD_SCHEMA_MESSAGES = Object.freeze({
  purpose: '용도는 영문 · 숫자 · _ 1~32자여야 합니다.',
})

export const uploadPurposeSchema = z
  .string()
  .regex(UPLOAD_PURPOSE_PATTERN, UPLOAD_SCHEMA_MESSAGES.purpose)

/** `POST /admin/uploads?purpose=` 의 쿼리 */
export const uploadPurposeQuerySchema = z.object({ purpose: uploadPurposeSchema })
export type UploadPurposeQuery = z.infer<typeof uploadPurposeQuerySchema>

/** 업로드 응답 — `url` 은 서버가 `uploadUrl(key, mediaPath)` 로 조립한다. 클라이언트는 url 만 본문에 넣는다 */
export const adminUploadCreatedSchema = z.object({
  key: z.string().regex(UPLOAD_KEY_PATTERN),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
})
export type AdminUploadCreated = z.infer<typeof adminUploadCreatedSchema>
