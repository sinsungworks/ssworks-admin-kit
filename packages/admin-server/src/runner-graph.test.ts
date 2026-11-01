import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectImports } from './test-support/import-graph.js'

// 🔴 `@ssworks/admin-server/runner` 는 kysely.config.ts(마이그레이션 러너)가 읽는다 — Nest · Express 를 끌어오면 안 된다
//    (정본 규약: 러너는 reflect-metadata 를 싣지 않는다). 소스의 상대 import 를 따라가 바깥 패키지를 모은다.

const SRC = dirname(fileURLToPath(import.meta.url))

describe('runner 진입점', () => {
  it('🔴 Nest · Express · rxjs · reflect-metadata · cookie-parser 를 끌어오지 않는다', () => {
    const { packages } = collectImports(resolve(SRC, 'runner.ts'))
    expect(
      packages.filter((name) =>
        /^@nestjs\/|^express$|^rxjs$|^reflect-metadata$|^cookie-parser$/.test(name),
      ),
    ).toEqual([])
    expect(packages).toContain('kysely')
    // 시드 스크립트가 러너로 계정을 만든다(스펙 B5) — argon2 는 Nest 무의존이다
    expect(packages).toContain('@node-rs/argon2')
  })

  it('대조 — index 그래프는 @nestjs/common 을 끌어온다(탐지기가 살아 있다)', () => {
    expect(collectImports(resolve(SRC, 'index.ts')).packages).toContain('@nestjs/common')
  })
})
