import type { Editor } from '@tiptap/core'
import { moveCaretAfterImage } from './editor-markdown.js'

// 편집기에 그림 넣기(이미지 업로드 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §2-4 C3 · C4) —
// 붙여넣기 · 끌어 놓기 · 그림 단추가 받은 파일의 `blob:` 주소를 넣는다. 순수 모듈(Vue 무의존) — 화면은 MarkdownEditor.vue.
//
// 정본: ssworks-ringside apps/web/app/utils/editor-image-insert.ts(insertMediaImage — 한 트랜잭션 · 캐럿)
//       + apps/web/app/components/ring/RingMarkdownEditor.vue(handlePaste — 글자가 함께 오면 기본 붙여넣기)
// 바꾼 점: 업로드가 끝날 때마다 한 장씩이 아니라 받은 장을 한 번에 넣는다(blob: — 기다릴 것이 없다 · 앵커 매핑 없음). 캐럿은
//   EditorImage 입력 규칙과 같은 moveCaretAfterImage(#3j A4). 원문 textarea 넣기를 더했다.

/** 클립보드 · 끌어 놓기의 파일 — 형식은 거르지 않는다(레지스트리 add 가 「형식」 사유로 알린다) */
export function filesOf(transfer: DataTransfer | null | undefined): File[] {
  return transfer == null ? [] : [...transfer.files]
}

/**
 * 파일을 끌고 있는가 — 🔴 브라우저는 dragover 동안 `files` 를 비워 둔다(보호 모드) — `types` 의 'Files' 로 본다. drop 에서는 `files`
 * 가 찬다(happy-dom 은 `types` 에 'Files' 를 싣지 않는다 — 둘 다 본다)
 */
export function hasFiles(transfer: DataTransfer | null | undefined): boolean {
  return transfer != null && (transfer.types.includes('Files') || transfer.files.length > 0)
}

/**
 * 붙여넣기에서 편집기가 맡을 파일 — 글자가 없을 때만(스크린숏 · 이미지 복사). 글자가 함께 오면 빈 배열(기본 붙여넣기) —
 * Word · 엑셀 · 웹 문서 복사는 내용의 그림 한 장을 함께 싣는다(ringside 실측)
 */
export function pastedFiles(transfer: DataTransfer | null | undefined): File[] {
  if (transfer == null || transfer.getData('text/plain') !== '') return []
  return filesOf(transfer)
}

/**
 * 그림 블록을 at 에 차례로 넣는다 — 한 트랜잭션(되돌리기 한 번). 장마다 moveCaretAfterImage(그림 바로 뒤 글자 자리 · 없으면 빈
 * 문단)를 따르고, 다음 장은 그 캐럿 자리에 넣는다. at 은 문서 범위로 자른다
 */
export function insertImagesAt(editor: Editor, at: number, urls: readonly string[]): void {
  if (urls.length === 0) return
  editor.commands.command(({ tr, commands }) => {
    let pos = Math.min(Math.max(0, at), tr.doc.content.size)
    for (const src of urls) {
      commands.insertContentAt(pos, { type: 'image', attrs: { src, alt: '', title: null } })
      moveCaretAfterImage(tr)
      pos = tr.selection.from
    }
    return true
  })
}

/**
 * 원문 textarea 에 그림 줄 — at(캐럿) 자리에 `![](주소)` 를 빈 줄로 띄워 넣는다(앞뒤 글이 있으면 빈 줄 하나씩). 고른 글자는
 * 지우지 않는다. caret 은 마지막 그림 줄 바로 뒤
 */
export function sourceWithImages(
  value: string,
  at: number,
  urls: readonly string[],
): { value: string; caret: number } {
  const position = Math.min(Math.max(0, at), value.length)
  const before = value.slice(0, position)
  const after = value.slice(position)
  const block = urls.map((url) => `![](${url})`).join('\n\n')
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail =
    after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const head = `${before}${lead}${block}`
  return { value: `${head}${trail}${after}`, caret: head.length }
}
