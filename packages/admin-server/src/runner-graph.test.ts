import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 🔴 `@ssworks/admin-server/runner` 는 kysely.config.ts(마이그레이션 러너)가 읽는다 — Nest · Express 를 끌어오면 안 된다
//    (정본 규약: 러너는 reflect-metadata 를 싣지 않는다). 소스의 상대 import 를 따라가 바깥 패키지를 모은다.

const SRC = dirname(fileURLToPath(import.meta.url))
const SPECIFIER =
  /(?:^|[\s;])(import|export)\s*(type\s+)?(?:[\w*{}\s,]*?\sfrom\s*)?['"]([^'"]+)['"]/g

export function collectImports(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      if (match[2]) continue // import type · export type — 실행 시 불러오지 않는다
      const specifier = match[3]!
      if (specifier.startsWith('.'))
        queue.push(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')))
      else packages.add(specifier)
    }
  }
  return { files: [...files], packages: [...packages] }
}

describe('runner 진입점', () => {
  it('🔴 Nest · Express · rxjs · reflect-metadata · cookie-parser 를 끌어오지 않는다', () => {
    const { packages } = collectImports(resolve(SRC, 'runner.ts'))
    expect(
      packages.filter((name) =>
        /^@nestjs\/|^express$|^rxjs$|^reflect-metadata$|^cookie-parser$/.test(name),
      ),
    ).toEqual([])
    expect(packages).toContain('kysely')
  })

  it('대조 — index 그래프는 @nestjs/common 을 끌어온다(탐지기가 살아 있다)', () => {
    expect(collectImports(resolve(SRC, 'index.ts')).packages).toContain('@nestjs/common')
  })
})
