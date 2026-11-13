import { vi } from 'vitest'

// 그림 첨부 시험 도구 — 파일 · blob: 주소 대역 · 붙여넣기 · 끌어 놓기 이벤트. DataTransfer · ClipboardEvent · DragEvent 를 쓰는
// 테스트 파일은 머리에 `// @vitest-environment happy-dom` 을 단다(File · URL 은 Node 에도 있다).
// 🔴 happy-dom 20 의 DragEvent 는 생성자의 dataTransfer · clientX · clientY 를 받지 않는다(실측 2026-11-11) — dataTransfer 는
//    defineProperty 로 심고, 놓은 자리는 `view.posAtCoords` 를 spy 로 정한다. ClipboardEvent 의 clipboardData 는 받는다.

/** 이미지 파일 — 기본 PNG 4바이트 */
export function imageFile(name: string, size = 4, type = 'image/png'): File {
  return new File([new Uint8Array(size)], name, { type })
}

/**
 * `URL.createObjectURL` · `revokeObjectURL` 대역 — `blob:test/u001` 처럼 길이가 같은 결정적 주소를 낸다(실제 주소의 UUID 처럼 한 주소가
 * 다른 주소의 앞부분이 되지 않는다). 되돌리기는 `vi.restoreAllMocks()`
 */
export function stubObjectUrls(): { created: string[]; revoked: string[] } {
  const created: string[] = []
  const revoked: string[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:test/u${String(created.length + 1).padStart(3, '0')}`
    created.push(url)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url)
  })
  return { created, revoked }
}

/** 파일(과 글자)을 실은 DataTransfer */
export function transferOf(files: readonly File[], text = ''): DataTransfer {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  if (text !== '') transfer.setData('text/plain', text)
  return transfer
}

export function pasteEvent(files: readonly File[], text = ''): ClipboardEvent {
  return new ClipboardEvent('paste', {
    clipboardData: transferOf(files, text),
    bubbles: true,
    cancelable: true,
  })
}

/** drop · dragover — dataTransfer 를 심는다(머리 주석) */
export function dragEvent(type: 'drop' | 'dragover', files: readonly File[]): DragEvent {
  const event = new DragEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: transferOf(files) })
  return event
}
