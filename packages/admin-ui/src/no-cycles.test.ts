import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 🔴 스토어 ↔ 라우터 ↔ API 순환을 소스 수준에서 막는다. 가드는 deps, 클라이언트는 콜백, 컴포넌트는
//    inject 로 받는다 — 패키지 어디에도 스토어 파일 import · 모듈 스코프 `useRouter()` ·
//    `declare module 'vue-router'` 가 없어야 한다. 이 파일 자신은 패턴을 리터럴로 담으므로 스캔에서 뺀다.

export function findStoreImports(source: string): string[] {
  return source.match(/from\s+['"](?:\.\.?\/)*stores\/?[^'"]*['"]|from\s+['"]@\/[^'"]*['"]/g) ?? []
}

export function findVueRouterAugmentation(source: string): string[] {
  // 줄 머리에서만 — 주석 속 설명("`declare module 'vue-router'` 를 하지 않는다")은 선언이 아니다.
  return source.match(/^[ \t]*declare\s+module\s+['"]vue-router['"]/gm) ?? []
}

/** `stores/` 경로를 가리키는 모든 import — `from`·동적 `import()`·부수효과 import 포함. */
export function findStorePathImports(source: string): string[] {
  return (
    source.match(
      /(?:from\s+|import\s*\(\s*|import\s+)['"][^'"]*(?:^|\/)stores\/[^'"]*['"]|(?:from\s+|import\s*\(\s*|import\s+)['"]@\/[^'"]*['"]/g,
    ) ?? []
  )
}

/** `.ts`: 0칸 들여쓰기 문장에서 `useRouter(` 호출. `.vue`: 일반 `<script>`(setup 아님) 안의 호출. */
export function findModuleScopeUseRouter(source: string, kind: 'ts' | 'vue'): string[] {
  if (kind === 'ts') {
    return source.split('\n').filter((line) => /^(?!\s|\/\/|\*|\/\*).*\buseRouter\s*\(/.test(line))
  }
  const hits: string[] = []
  const blocks = source.matchAll(/<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/g)
  for (const block of blocks) {
    if (/\bsetup\b/.test(block.groups?.attrs ?? '')) continue
    const body = block.groups?.body ?? ''
    if (/\buseRouter\s*\(/.test(body)) hits.push(body.trim())
  }
  return hits
}

describe('탐지기 자체 (음성 · 양성 픽스처)', () => {
  it('스토어 import — 잡는다', () => {
    expect(findStoreImports(`import { x } from '../stores/app'`)).toHaveLength(1)
    expect(findStoreImports(`import { x } from '../../stores/app.js'`)).toHaveLength(1)
    expect(findStoreImports(`import { x } from '@/stores/app'`)).toHaveLength(1)
    expect(findStoreImports(`import x from '@/api/client'`)).toHaveLength(1)
  })
  it('스토어 import — 잡지 않는다', () => {
    expect(findStoreImports(`import { x } from '../store/app-store.js'`)).toHaveLength(0)
    expect(findStoreImports(`import { x } from './menu.js'`)).toHaveLength(0)
    expect(findStoreImports(`import { x } from 'vue-router'`)).toHaveLength(0)
  })

  it('vue-router 증강 — 잡는다', () => {
    expect(findVueRouterAugmentation(`declare module 'vue-router' {}`)).toHaveLength(1)
    expect(findVueRouterAugmentation(`declare  module "vue-router" {`)).toHaveLength(1)
  })
  it('vue-router 증강 — 잡지 않는다', () => {
    expect(findVueRouterAugmentation(`declare module 'vue' {}`)).toHaveLength(0)
    expect(findVueRouterAugmentation(`import type { RouteMeta } from 'vue-router'`)).toHaveLength(0)
  })

  it('stores 경로 import — 잡는다', () => {
    expect(findStorePathImports(`import('../stores/app')`)).toHaveLength(1)
    expect(findStorePathImports(`import '../stores/app'`)).toHaveLength(1)
    expect(findStorePathImports(`import { a } from './stores/app.js'`)).toHaveLength(1)
    expect(findStorePathImports(`import { a } from '@/stores/app'`)).toHaveLength(1)
  })
  it('stores 경로 import — 잡지 않는다', () => {
    expect(findStorePathImports(`import { a } from './store/app-store.js'`)).toHaveLength(0)
    expect(findStorePathImports(`import { a } from 'pinia'`)).toHaveLength(0)
    expect(findStorePathImports(`const stores = []`)).toHaveLength(0)
  })

  it('.ts 모듈 스코프 useRouter — 잡는다', () => {
    expect(findModuleScopeUseRouter(`const router = useRouter()`, 'ts')).toHaveLength(1)
    expect(findModuleScopeUseRouter(`export const r = useRouter()`, 'ts')).toHaveLength(1)
  })
  it('.ts 함수 안·주석의 useRouter — 잡지 않는다', () => {
    expect(
      findModuleScopeUseRouter(`export function f() {\n  const r = useRouter()\n}`, 'ts'),
    ).toHaveLength(0)
    expect(findModuleScopeUseRouter(`// const r = useRouter()`, 'ts')).toHaveLength(0)
    expect(findModuleScopeUseRouter(` * useRouter() 를 부르지 않는다`, 'ts')).toHaveLength(0)
  })

  it('.vue 일반 script 의 useRouter — 잡는다', () => {
    const sfc = `<script lang="ts">\nconst r = useRouter()\n</script>\n<script setup lang="ts">\n</script>`
    expect(findModuleScopeUseRouter(sfc, 'vue')).toHaveLength(1)
  })
  it('.vue script setup 의 useRouter — 잡지 않는다', () => {
    const sfc = `<script setup lang="ts">\nconst r = useRouter()\n</script>`
    expect(findModuleScopeUseRouter(sfc, 'vue')).toHaveLength(0)
    expect(
      findModuleScopeUseRouter(`<script lang="ts">\nexport interface A {}\n</script>`, 'vue'),
    ).toHaveLength(0)
  })
})

const SRC = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(SRC)
  .filter((f) => /\.(ts|vue)$/.test(f) && f !== SELF)
  .map((file) => ({
    name: relative(SRC, file).replaceAll('\\', '/'),
    kind: file.endsWith('.vue') ? ('vue' as const) : ('ts' as const),
    source: readFileSync(file, 'utf8'),
  }))

function scan(detect: (f: (typeof files)[number]) => string[]): string[] {
  return files.flatMap((f) => detect(f).map((hit) => `${f.name}: ${hit}`))
}

describe('패키지 소스 — 순환 · 증강 금지', () => {
  it('충분한 수의 파일을 스캔했다 (빈 글롭이 통과하면 안 된다)', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((f) => f.kind === 'vue')).toBe(true)
  })
  it("(a) `from '../stores` · `from '@/` 가 0건", () => {
    expect(scan((f) => findStoreImports(f.source))).toEqual([])
  })
  it("(b) `declare module 'vue-router'` 가 0건", () => {
    expect(scan((f) => findVueRouterAugmentation(f.source))).toEqual([])
  })
  it('(c) stores/ 경로 import 가 0건', () => {
    expect(scan((f) => findStorePathImports(f.source))).toEqual([])
  })
  it('(d) 모듈 스코프 `useRouter()` 가 0건', () => {
    expect(scan((f) => findModuleScopeUseRouter(f.source, f.kind))).toEqual([])
  })
})
