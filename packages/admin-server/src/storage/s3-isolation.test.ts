import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectImports } from '../test-support/import-graph.js'

// 🔴 `@aws-sdk/client-s3` 는 선택 peer 다 — `.` 진입점(index.ts) · `./runner` 가 끌어오면 SDK 없는 앱이 기동에서 죽는다(스펙 S3).
//    S3 구현은 서브패스 `@ssworks/admin-server/storage/s3` 로만 닿는다. sharp 도 러너에는 없어야 한다.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('S3 저장소 격리', () => {
  it('index.ts 그래프에 storage/s3.ts · @aws-sdk/client-s3 가 없다', () => {
    const { files, packages } = collectImports(resolve(SRC, 'index.ts'))
    expect(files.some((file) => file.endsWith(`storage${sep}s3.ts`))).toBe(false)
    expect(packages.filter((name) => name.startsWith('@aws-sdk/'))).toEqual([])
  })

  it('runner.ts 그래프에 sharp · @aws-sdk 가 없다', () => {
    const { packages } = collectImports(resolve(SRC, 'runner.ts'))
    expect(packages.filter((name) => name === 'sharp' || name.startsWith('@aws-sdk/'))).toEqual([])
  })

  it('대조 — storage/s3.ts 자체는 @aws-sdk/client-s3 를 끌어온다(탐지기가 살아 있다)', () => {
    expect(collectImports(resolve(SRC, 'storage', 's3.ts')).packages).toContain(
      '@aws-sdk/client-s3',
    )
  })
})
