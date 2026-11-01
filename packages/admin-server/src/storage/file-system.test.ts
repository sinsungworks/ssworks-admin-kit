import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileSystemStorage } from './file-system.js'

const KEY = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ak-fs-storage-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createFileSystemStorage(스펙 S2)', () => {
  it('put → get 왕복 — 하위 폴더를 만들고 내용 · 길이가 같다, 같은 키에 다시 쓰면 덮는다', async () => {
    const storage = createFileSystemStorage({ root })
    await storage.put(KEY, Buffer.from('first'), 'image/webp')
    const first = await storage.get(KEY)
    expect(first).not.toBeNull()
    expect(first?.contentLength).toBe(5)
    expect((await drain(first!.body)).toString()).toBe('first')

    await storage.put(KEY, Buffer.from('second!'), 'image/webp')
    const second = await storage.get(KEY)
    expect(second?.contentLength).toBe(7)
    expect((await drain(second!.body)).toString()).toBe('second!')
  })

  it('🔴 임시 파일이 남지 않는다 — put 은 .tmp 에 쓰고 rename 한다', async () => {
    const storage = createFileSystemStorage({ root })
    await storage.put(KEY, Buffer.from('x'), 'image/webp')
    expect(readdirSync(join(root, 'legal', '2026', '11'))).toEqual([
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
    ])
  })

  it('없는 키는 null · delete 는 없어도 성공(멱등)', async () => {
    const storage = createFileSystemStorage({ root })
    expect(await storage.get(KEY)).toBeNull()
    await expect(storage.delete(KEY)).resolves.toBeUndefined()
    await storage.put(KEY, Buffer.from('x'), 'image/webp')
    await storage.delete(KEY)
    expect(await storage.get(KEY)).toBeNull()
    await expect(storage.delete(KEY)).resolves.toBeUndefined()
  })

  it('🔴 root 밖을 가리키는 키는 세 동작 모두 던진다(경로 탐색)', async () => {
    const storage = createFileSystemStorage({ root })
    for (const bad of ['../outside.webp', 'legal/../../x.webp', '/etc/passwd', '.', 'a/..']) {
      await expect(storage.put(bad, Buffer.from('x'), 'image/webp')).rejects.toThrow('root 밖')
      await expect(storage.get(bad)).rejects.toThrow('root 밖')
      await expect(storage.delete(bad)).rejects.toThrow('root 밖')
    }
  })

  it('🔴 root 가 파일 시스템 뿌리(/ · C:\\)여도 키는 안이다 — 끝 구분자를 겹쳐 모두 밖으로 치지 않는다(쓰지 않고 get 만)', async () => {
    const storage = createFileSystemStorage({ root: parse(process.cwd()).root })
    expect(await storage.get(KEY)).toBeNull()
    await expect(storage.get('.')).rejects.toThrow('root 밖')
  })

  it('폴더를 가리키는 키의 get 은 null', async () => {
    const storage = createFileSystemStorage({ root })
    await storage.put(KEY, Buffer.from('x'), 'image/webp')
    expect(await storage.get('legal/2026/11')).toBeNull()
  })
})
