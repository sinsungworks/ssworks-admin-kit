import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 🔴 엔트리가 하나(`dist/index.js`)다. 소스가 import 하는 외부 패키지는 소비자가 그 기능을 안 써도
//    번들러가 해석해야 한다 — optional peer 로 두면 pnpm 이 설치하지 않고, `safeRedirect` 하나만 쓰는
//    앱의 `vite build` 가 "failed to resolve import axios" 로 깨진다(R12). 그래서 전부 필수 peer 다.

const srcDir = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(srcDir, '..', 'package.json'), 'utf8')) as {
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path)
    if (name.endsWith('.test.ts')) return []
    return name.endsWith('.ts') || name.endsWith('.vue') ? [path] : []
  })
}

/** 줄 머리의 import/export 문만 — 주석 속 예시 코드는 세지 않는다. */
function bareImports(source: string): string[] {
  const specs = [
    ...source.matchAll(/^\s*(?:import|export)\b[^'"\n]*?\bfrom\s+['"]([^'"]+)['"]/gm),
    ...source.matchAll(/^\s*\}\s*from\s+['"]([^'"]+)['"]/gm),
    ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
  ].map((m) => m[1]!)
  return specs.filter((s) => !s.startsWith('.') && !s.startsWith('node:'))
}

function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

describe('peer 의존 — 엔트리가 import 하는 외부 패키지', () => {
  const imported = [
    ...new Set(
      sourceFiles(srcDir).flatMap((f) => bareImports(readFileSync(f, 'utf8')).map(packageName)),
    ),
  ].sort()

  it('탐지기가 실제 import 를 본다(공허하지 않다)', () => {
    expect(imported).toEqual(
      expect.arrayContaining(['axios', 'pinia', 'vue', 'vue-router', 'vuetify']),
    )
  })

  it('🔴 전부 peerDependencies 에 있고 optional 이 아니다', () => {
    for (const name of imported) {
      expect(pkg.peerDependencies?.[name], `${name} 이 peerDependencies 에 없다`).toBeDefined()
      expect(pkg.peerDependenciesMeta?.[name]?.optional, `${name} 이 optional peer 다`).not.toBe(
        true,
      )
    }
  })
})
