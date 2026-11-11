import { UPLOAD_CONTENT_TYPES } from '@ssworks/admin-shared'
import { formatMegabytes } from '../api/upload-errors.js'

// 편집기 그림 첨부의 순수 규칙(스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 C1 · C2 · §14 C9 ·
// C10) — 남은 칸 · 거르기(형식 → 크기 → 칸) · 사유 묶음 · 본문 속 등록 주소 · 주소 치환 · 기본 문구. 상태는 useImageAttachments.ts.
//
// 정본: ssworks-ringside apps/web/app/utils/uploads.ts(planUploads · rejectionNotices — 거르는 순서 · 사유마다 알림 하나)
// 바꾼 점:
//  - 고른 즉시 올리는 큐가 아니라 저장 시점 commit 이라 "올리는 중" 칸이 없다 — 남은 칸은 본문의 우리 키 + 본문 안 등록 blob(C1)
//    또는 앱이 센 room(C9).
//  - 사유 넷(형식 · 크기 · 줄이기 · 칸) → 셋 — 브라우저 줄이기는 비범위(스펙 §11, 서버가 줄인다).
//  - 문구는 토스트 제목 · 설명 둘이 아니라 한 문장 — 알림은 앱이 onRejected 로 띄운다(C5).

export type ImageAttachmentRejectReason = 'type' | 'size' | 'full'

/** 거른 파일 알림 — 사유마다 하나 */
export interface ImageAttachmentRejection {
  reason: ImageAttachmentRejectReason
  /** 그 사유로 넣지 않은 장수 */
  count: number
  message: string
}

export interface ImageAttachmentMessages {
  rejectedType: (count: number) => string
  /** maxBytes — 장당 상한(정책) */
  rejectedSize: (count: number, maxBytes: number) => string
  /** 🔴 본문 밖 그림과 합친 한도(room — C9)를 쓰는 앱은 덮는다 — 한도의 말은 앱의 말이다 */
  rejectedFull: (count: number) => string
  /** 저장 중 진행 — 앱이 `progress` 로 그릴 때 쓴다(킷 화면은 그리지 않는다) */
  uploading: (done: number, total: number) => string
  /** 등록에 없는 `blob:` 그림이 있어 저장을 거절할 때(I2) — count = 서로 다른 주소 수 */
  stray: (count: number) => string
}

/** 기본 문구 — 🔴 얼린다(앱이 펼쳐 일부만 덮는다) */
export const DEFAULT_IMAGE_ATTACHMENT_MESSAGES: Readonly<ImageAttachmentMessages> =
  Object.freeze<ImageAttachmentMessages>({
    rejectedType: (count) =>
      `지원하지 않는 형식이라 ${count}장을 넣지 않았습니다. (JPG · PNG · WebP · GIF)`,
    rejectedSize: (count, maxBytes) =>
      `장당 최대 ${formatMegabytes(maxBytes)}를 넘어 ${count}장을 넣지 않았습니다.`,
    rejectedFull: (count) => `이미지 수가 한도를 넘어 ${count}장을 넣지 않았습니다.`,
    uploading: (done, total) => `이미지 올리는 중 (${done}/${total})`,
    stray: (count) =>
      `저장할 수 없는 그림이 ${count}장 있습니다(다른 곳에서 복사한 그림). 그 그림을 지우고 파일로 다시 넣으세요.`,
  })

const ACCEPTED_TYPES: ReadonlySet<string> = new Set(UPLOAD_CONTENT_TYPES)
const REASON_ORDER: readonly ImageAttachmentRejectReason[] = ['type', 'size', 'full']

/** 남은 칸 — 0 이하 · NaN 은 0, 소수는 내림. Infinity 는 그대로(앱이 한도를 두지 않는다) */
export function clampRoom(room: number): number {
  return Number.isNaN(room) || room <= 0 ? 0 : Math.floor(room)
}

export interface AttachmentPlan<F> {
  /** 받아들인 것 — 고른 순서 그대로 */
  accepted: F[]
  /** 사유별 장수 */
  rejected: Record<ImageAttachmentRejectReason, number>
}

/** 형식 → 크기 → 칸 순서로 거른다(C1). 칸은 앞에서부터 채운다 — 뒤의 것이 `full` 이 된다 */
export function planAttachments<F extends { type: string; size: number }>(
  files: readonly F[],
  limits: { room: number; maxBytes: number },
): AttachmentPlan<F> {
  const plan: AttachmentPlan<F> = { accepted: [], rejected: { type: 0, size: 0, full: 0 } }
  let room = limits.room
  for (const file of files) {
    if (!ACCEPTED_TYPES.has(file.type)) plan.rejected.type += 1
    else if (file.size > limits.maxBytes) plan.rejected.size += 1
    else if (room <= 0) plan.rejected.full += 1
    else {
      plan.accepted.push(file)
      room -= 1
    }
  }
  return plan
}

/** 사유별 장수 → 알림(형식 · 크기 · 칸 순서, 0 은 뺀다) */
export function rejectionNotices(
  rejected: Readonly<Record<ImageAttachmentRejectReason, number>>,
  messages: ImageAttachmentMessages,
  maxBytes: number,
): ImageAttachmentRejection[] {
  return REASON_ORDER.flatMap((reason) => {
    const count = rejected[reason]
    if (count === 0) return []
    const message =
      reason === 'type'
        ? messages.rejectedType(count)
        : reason === 'size'
          ? messages.rejectedSize(count, maxBytes)
          : messages.rejectedFull(count)
    return [{ reason, count, message }]
  })
}

/**
 * 본문(들) 중 하나라도 품은 주소만 — 주어진 순서(등록 순서)를 지킨다(C2 · C10 · C11).
 * 🔴 문자열 포함 검사다 — blob: 주소는 UUID 라 다른 주소의 일부가 되지 않는다
 */
export function urlsInBodies(urls: Iterable<string>, bodies: readonly string[]): string[] {
  return [...urls].filter((url) => bodies.some((body) => body.includes(url)))
}

/**
 * 본문(들)에서 마크다운 그림 대상(`](` 바로 뒤)으로 쓰였는데 등록에 없는 `blob:` 주소 — 중복 없이 처음 나온 순서(I2).
 * 대상은 첫 `)` · 공백 · 탭 · 줄바꿈 · `"` 에서 끝난다. 글 속에 적힌 "blob:" 은 세지 않는다
 */
export function strayBlobUrls(registered: Iterable<string>, bodies: readonly string[]): string[] {
  const known = new Set(registered)
  const found = new Set<string>()
  const opener = '](blob:'
  const enders = new Set([')', ' ', '\t', '\n', '\r', '"'])
  for (const body of bodies) {
    let from = body.indexOf(opener)
    while (from !== -1) {
      const start = from + 2
      let end = start
      while (end < body.length && !enders.has(body.charAt(end))) end += 1
      const url = body.slice(start, end)
      if (!known.has(url)) found.add(url)
      from = body.indexOf(opener, end)
    }
  }
  return [...found]
}

/** 본문의 주소를 모두 바꾼다(같은 주소가 여러 번이면 모두) */
export function replaceUrls(markdown: string, replacements: ReadonlyMap<string, string>): string {
  let out = markdown
  for (const [from, to] of replacements) out = out.split(from).join(to)
  return out
}
