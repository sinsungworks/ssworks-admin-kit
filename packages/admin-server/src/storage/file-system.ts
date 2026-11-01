import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { AdminObjectStorage, StoredObject } from './object-storage.js'

// 파일 시스템 저장소(스펙 S2) — 의존성 없음. 개발 · 테스트 · 단일 서버 배포용. 중계(AdminMediaModule)가 같은 폴더를 읽는다.
// 정본: 없음(ringside 는 S3 만 썼다).
// 🔴 키는 패턴을 지난 것만 오지만 resolve 뒤 root 안인지 다시 본다 — 저장소를 다른 코드가 부를 수도 있다. root 자체를 가리키는
//    키('.' · 'a/..')도 밖으로 친다. 심볼릭 링크는 따라가 검사하지 않는다(개발 · 단일 서버용 — 링크를 root 안에 두지 않는다).
// 🔴 put 은 임시 이름에 쓰고 rename 한다 — 중계가 반쪽 파일을 읽지 않게(rename 은 같은 파일 시스템 안에서 원자적).
//    실패하면 임시 파일을 지운다. contentType 은 쓰지 않는다(저장 형식이 WebP 하나 — 중계가 고정 Content-Type 을 낸다).

export interface FileSystemStorageOptions {
  /** 객체를 둘 폴더(절대 · 상대 — 상대는 process.cwd 기준). 없으면 put 때 만든다 */
  root: string
}

export function createFileSystemStorage(options: FileSystemStorageOptions): AdminObjectStorage {
  const root = resolve(options.root)

  const pathOf = (key: string): string => {
    const full = resolve(root, key)
    if (!full.startsWith(root + sep)) throw new Error(`저장소 키가 root 밖을 가리킨다: ${key}`)
    return full
  }

  return {
    async put(key, body) {
      const full = pathOf(key)
      await mkdir(dirname(full), { recursive: true })
      const temp = `${full}.${randomBytes(6).toString('hex')}.tmp`
      try {
        await writeFile(temp, body)
        await rename(temp, full)
      } catch (error) {
        await rm(temp, { force: true })
        throw error
      }
    },

    async get(key): Promise<StoredObject | null> {
      const full = pathOf(key)
      let size: number
      try {
        const info = await stat(full)
        if (!info.isFile()) return null
        size = info.size
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
      return { body: createReadStream(full), contentLength: size }
    },

    async delete(key) {
      await rm(pathOf(key), { force: true })
    },
  }
}
