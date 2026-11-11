import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref } from 'vue'
import {
  DEFAULT_MEDIA_PATH,
  DEFAULT_UPLOAD_POLICY,
  collectUploadKeys,
  type AdminUploadCreated,
  type UploadPolicy,
} from '@ssworks/admin-shared'
import { ApiError } from '../api/error.js'
import { uploadErrorMessage, type UploadErrorMessages } from '../api/upload-errors.js'
import {
  DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
  clampRoom,
  planAttachments,
  rejectionNotices,
  replaceUrls,
  strayBlobUrls,
  urlsInBodies,
  type ImageAttachmentMessages,
  type ImageAttachmentRejection,
} from './image-attachments.js'

// 편집기 그림 첨부 레지스트리(스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 C1 · C2 · C8 ·
// §14 C9 ~ C13) — 편집 중에는 파일 ↔ `blob:` 주소 대응표만 갖고, 저장(commit) 때 본문에 남은 등록 주소만 차례로 올려 주소를
// 바꾼 뒤 save 를 부른다. 작성하다 그만두면 서버에 아무것도 남지 않는다. v-model 은 Markdown 그대로(`![](blob:…)`)라 원문 탭 ·
// 미리보기(renderMarkdown 은 blob: 을 통과시킨다) · 더티 판정이 바뀌지 않는다.
//
// 정본: ssworks-ringside apps/web/app/utils/upload-queue.ts(한 장씩 차례 올리기 골격)
// 바꾼 점: 고른 즉시가 아니라 저장 시점에 올린다(결정 ⑧) · 세션 확인 · 토스트 · 미첨부 비우기를 뺐다 — 예외는 그대로 다시 던진다 ·
//   실패하면 이번에 올린 키를 지운다(R3) · 본문 여럿(C11) · 앱이 세는 남은 칸(C9).
//
// 🔴 되돌림(remove)을 기다리지 않고 원래 예외를 곧바로 다시 던진다. 기다리면 그사이 createApiClient 의 지연 onError(한
//    매크로태스크 뒤)가 먼저 돌아, useWriteFlow 가 처리할 오류(revision 충돌 · 칸 오류 — `handled`)까지 전역 토스트로 뜬다.
//    되돌림 실패는 `handled` 로 표시해 삼킨다 — 원래 실패가 이미 알려졌고, 남은 것은 서버 정리 잡(미첨부 24시간)이 지운다.
// 🔴 업로드 실패 문구는 **같은** ApiError 의 message 를 바꾼다(uploadErrorMessage — 503 은 서버가 문구를 가린다). 새 객체로
//    던지면 지연 onError 가 옛 객체(「서버 내부 오류가 발생했습니다.」)로 토스트를 띄운다.
// 🔴 레지스트리는 본문을 지켜보지 않는다(C8) — 지웠다 되돌린 그림 · 외부 변경 · 원문 탭 편집과 무관하게, 저장 순간 본문에 있는 등록
//    주소만 올라간다. 편집기 여럿이 하나를 나눠 써도 된다(C13) — 해제는 만든 스코프가 끝날 때.

export interface UseImageAttachmentsOptions {
  /**
   * 파일 하나를 올린다 — 보통 `(file) => api.uploadFile('/admin/uploads', file, { params: { purpose } })`.
   * 실패는 ApiError 로 던져야 업로드 오류 문구(ERR_UPLOAD_*)로 바뀐다
   */
  upload: (file: File) => Promise<AdminUploadCreated>
  /** 되돌림 — 보통 `` (key) => api.del(`/admin/uploads/${key}`) ``. 없으면 남은 것은 서버 정리 잡 몫 */
  remove?: (key: string) => Promise<unknown>
  /** 클라이언트가 먼저 거르는 상한(최종 판정은 서버). 기본 admin-shared `DEFAULT_UPLOAD_POLICY` */
  policy?: Partial<Pick<UploadPolicy, 'maxBytes' | 'maxPerBody'>>
  /** 본문의 우리 그림을 세는 경로 — 서버 `uploads.mediaPath`. 기본 `'/api/media'` */
  mediaPath?: string
  /** 더 넣을 수 있는 장수를 앱이 센다(C9 — 본문 밖 그림 · 다른 본문 포함). 있으면 maxPerBody 셈 대신 쓴다 */
  room?: () => number
  /** 거른 파일 — 사유마다 한 번(형식 · 크기 · 칸 순서). 편집기는 토스트를 띄우지 않는다(C5) */
  onRejected?: (notice: ImageAttachmentRejection) => void
  messages?: Partial<ImageAttachmentMessages>
  /** 업로드 실패 문구(ERR_UPLOAD_* 여섯). 기본 `DEFAULT_UPLOAD_ERROR_MESSAGES` */
  errorMessages?: Partial<UploadErrorMessages>
}

export interface ImageAttachmentProgress {
  done: number
  total: number
}

export interface ImageAttachments {
  /** 파일을 거르고 받아들인 것의 `blob:` 주소를 고른 순서로. body = 지금 본문(남은 칸 셈 — `room` 이 있으면 보지 않는다) */
  add(files: readonly File[], body: string): string[]
  /** 본문에 남은 등록 주소를 등록 순서로 올리고 주소를 바꿔 `save(치환본)`. 실패하면 이번에 올린 키를 지우고 원래 예외를 다시 던진다(C2) */
  commit<T>(markdown: string, save: (final: string) => Promise<T>): Promise<T>
  /** 본문 여럿 — 모든 본문에 남은 등록 주소를 한 번씩 올리고 본문마다 바꿔 같은 순서 · 길이로 `save(finals)`(C11) */
  commit<T>(markdowns: readonly string[], save: (finals: string[]) => Promise<T>): Promise<T>
  /** 본문(들)에 남은 등록 주소의 수 — 같은 주소는 여러 번 · 여러 본문에 있어도 하나(C10) */
  count(markdown: string | readonly string[]): number
  /**
   * 본문(들)의 그림 중 이 레지스트리에 등록되지 않은 `blob:` 주소 — 중복 없이 처음 나온 순서(I2). 다른 편집기에서 복사했거나
   * 저장 전에 해제된 그림 · 원문 탭에서 손댄 주소다. 저장 전에 확인해 칸 오류로 보인다(`commit` 도 이런 본문은 거부한다)
   */
  strays(markdown: string | readonly string[]): string[]
  /** commit 진행 중 */
  busy: Readonly<Ref<boolean>>
  /** commit 의 업로드 진행 — 끝나면 `{ done: 0, total: 0 }` */
  progress: Readonly<Ref<ImageAttachmentProgress>>
  /** 남은 `blob:` 주소를 모두 해제한다 — 만든 스코프가 끝날 때 저절로 */
  dispose(): void
}

export function useImageAttachments(options: UseImageAttachmentsOptions): ImageAttachments {
  const maxBytes = options.policy?.maxBytes ?? DEFAULT_UPLOAD_POLICY.maxBytes
  const maxPerBody = options.policy?.maxPerBody ?? DEFAULT_UPLOAD_POLICY.maxPerBody
  const mediaPath = options.mediaPath ?? DEFAULT_MEDIA_PATH
  const messages: ImageAttachmentMessages = {
    ...DEFAULT_IMAGE_ATTACHMENT_MESSAGES,
    ...options.messages,
  }
  /** `blob:` 주소 → 파일. Map 의 순서가 등록 순서다 */
  const files = new Map<string, File>()
  const busy = ref(false)
  const progress = shallowRef<ImageAttachmentProgress>({ done: 0, total: 0 })
  let disposed = false

  const bodiesOf = (markdown: string | readonly string[]): readonly string[] =>
    typeof markdown === 'string' ? [markdown] : markdown

  function count(markdown: string | readonly string[]): number {
    return urlsInBodies(files.keys(), bodiesOf(markdown)).length
  }

  function strays(markdown: string | readonly string[]): string[] {
    return strayBlobUrls(files.keys(), bodiesOf(markdown))
  }

  function add(input: readonly File[], body: string): string[] {
    if (disposed || input.length === 0) return []
    const room = clampRoom(
      options.room
        ? options.room()
        : maxPerBody - collectUploadKeys(body, mediaPath).length - count(body),
    )
    const plan = planAttachments(input, { room, maxBytes })
    for (const notice of rejectionNotices(plan.rejected, messages, maxBytes)) {
      options.onRejected?.(notice)
    }
    return plan.accepted.map((file) => {
      const url = URL.createObjectURL(file)
      files.set(url, file)
      return url
    })
  }

  /** 업로드 실패 문구 — 같은 객체의 message 를 바꾼다(머리 주석) */
  function localize(error: unknown): void {
    const text = uploadErrorMessage(error, options.errorMessages)
    if (text != null && error instanceof ApiError) error.message = text
  }

  /** 이번 commit 이 올린 키를 지운다 — 기다리지 않는다(머리 주석). 실패는 handled 로 삼킨다 */
  function rollback(keys: readonly string[]): void {
    const remove = options.remove
    if (remove == null) return
    for (const key of keys) {
      void (async () => {
        try {
          await remove(key)
        } catch (error) {
          if (error instanceof ApiError) error.handled = true
        }
      })()
    }
  }

  async function run<T>(
    bodies: readonly string[],
    save: (finals: string[]) => Promise<T>,
  ): Promise<T> {
    // 해제된 blob: 이 그대로 서버 본문에 저장되지 않게 — add 와 같이 dispose 를 따른다(진행 중이던 commit 은 끝까지 간다)
    if (disposed) throw new Error('useImageAttachments: dispose 뒤에는 commit 할 수 없다')
    if (busy.value) throw new Error('useImageAttachments: commit 이 이미 진행 중이다')
    // 등록에 없는 blob: 은 올라가지 않아 그대로 저장되면 공개 화면에서 깨진다 — 앱은 `strays()` 로 먼저 막아 칸 오류를 띄운다
    const stray = strayBlobUrls(files.keys(), bodies)
    if (stray.length > 0) throw new Error(messages.stray(stray.length))
    busy.value = true
    // 🔴 시작할 때의 대응을 붙잡는다 — 도중에 dispose 돼도 이번 commit 은 끝까지 간다
    const queue = urlsInBodies(files.keys(), bodies).map((url) => ({
      url,
      file: files.get(url) as File,
    }))
    progress.value = { done: 0, total: queue.length }
    const uploaded: string[] = []
    const replacements = new Map<string, string>()
    try {
      for (const item of queue) {
        let created: AdminUploadCreated
        try {
          created = await options.upload(item.file)
        } catch (error) {
          localize(error)
          throw error
        }
        uploaded.push(created.key)
        replacements.set(item.url, created.url)
        progress.value = { done: progress.value.done + 1, total: queue.length }
      }
      const result = await save(bodies.map((body) => replaceUrls(body, replacements)))
      for (const { url } of queue) {
        // 진행 중 dispose 가 이미 해제한 주소는 다시 해제하지 않는다
        if (files.delete(url)) URL.revokeObjectURL(url)
      }
      return result
    } catch (error) {
      rollback(uploaded)
      throw error
    } finally {
      busy.value = false
      progress.value = { done: 0, total: 0 }
    }
  }

  function commit<T>(markdown: string, save: (final: string) => Promise<T>): Promise<T>
  function commit<T>(
    markdowns: readonly string[],
    save: (finals: string[]) => Promise<T>,
  ): Promise<T>
  function commit<T>(
    input: string | readonly string[],
    save: ((final: string) => Promise<T>) | ((finals: string[]) => Promise<T>),
  ): Promise<T> {
    if (typeof input === 'string') {
      const one = save as (final: string) => Promise<T>
      return run([input], (finals) => one(finals[0] ?? ''))
    }
    return run(input, save as (finals: string[]) => Promise<T>)
  }

  function dispose(): void {
    disposed = true
    for (const url of files.keys()) URL.revokeObjectURL(url)
    files.clear()
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return { add, commit, count, strays, busy, progress, dispose }
}
