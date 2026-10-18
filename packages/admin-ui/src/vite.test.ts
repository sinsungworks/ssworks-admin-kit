import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'
import { vuetifyLayerOrder } from './vite.js'
import { VUETIFY_LAYER_ORDER } from './vuetify/layer-order.js'

// 🔴 킷의 레이어 선언이 설치된 vuetify/styles(lib/styles/main.css) 머리와 같은 순서인지 대조한다 — 킷이 Vuetify 를
//    올려 레이어가 바뀌면 여기서 빨개진다. 기대 목록을 손으로 적지 않는다(대조가 목적이다, PR #3h 스펙 §6-1).
// 🔴 ./vite 엔트리는 소비자의 vite.config 가 Node 에서 읽는다 — 바깥 패키지 · .vue · .css 를 끌면 설정 로드가 깨진다.
//    pnpm check 는 build 보다 test 가 먼저라 dist 가 아니라 소스를 따라간다(admin-server runner-graph.test.ts 와 같다).

const SRC = dirname(fileURLToPath(import.meta.url))

/**
 * 맨 앞의 `@layer` 문만 읽어 처음 나타난 순서의 점 표기 목록으로 편다(`@layer a { @layer b; }` → `a`, `a.b`).
 * 쉼표 목록과 문 여럿을 같게 보고, 주석은 건너뛰며, 규칙이 든 첫 블록에서 멈춘다.
 */
function layerOrder(css: string): string[] {
  const order: string[] = []
  let at = 0

  function skipSpaceAndComments(): void {
    for (;;) {
      while (at < css.length && css.charCodeAt(at) <= 32) at++
      if (!css.startsWith('/*', at)) return
      const end = css.indexOf('*/', at + 2)
      at = end === -1 ? css.length : end + 2
    }
  }

  /** 블록 하나(또는 최상위)를 읽는다. 규칙을 만나면 false — 거기서 모두 멈춘다. */
  function block(prefix: string, nested: boolean): boolean {
    for (;;) {
      skipSpaceAndComments()
      if (at >= css.length) return !nested
      if (css[at] === '}') {
        if (!nested) return false
        at++
        return true
      }
      if (!css.startsWith('@layer', at)) return false
      let end = at + '@layer'.length
      while (end < css.length && css[end] !== ';' && css[end] !== '{') end++
      const names = css
        .slice(at + '@layer'.length, end)
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')
      at = end + 1
      if (css[end] === ';') {
        for (const name of names) if (!order.includes(prefix + name)) order.push(prefix + name)
        continue
      }
      if (names.length !== 1) return false
      const name = prefix + names[0]!
      const mark = order.length
      if (!order.includes(name)) order.push(name)
      if (!block(`${name}.`, true)) {
        order.length = mark
        return false
      }
    }
  }

  block('', false)
  return order
}

const SPECIFIER = /(?:^|[ ;])(?:import|export)(?:[^'";]*?[ }]from)?[ ]*['"]([^'"]+)['"]/gm

/** 엔트리에서 상대 import 를 따라가 바깥 specifier(패키지 · .vue · .css)를 모은다. */
function collectImports(entry: string): { files: string[]; specifiers: string[] } {
  const files = new Set<string>()
  const specifiers = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const specifier = match[1]!
      if (specifier.startsWith('.') && !/[.](vue|css)$/.test(specifier)) {
        queue.push(resolve(dirname(file), specifier.replace(/[.]js$/, '.ts')))
      } else {
        specifiers.add(specifier)
      }
    }
  }
  return { files: [...files], specifiers: [...specifiers] }
}

const REPORT_FORM = `@layer vuetify-core {
  @layer reset, base;
}
@layer vuetify-components;
@layer vuetify-overrides;
@layer vuetify-utilities {
  @layer theme-base, typography, helpers, theme-background, theme-foreground;
}
@layer vuetify-final {
  @layer transitions, trumps;
}`

describe('layerOrder — 테스트 파서', () => {
  it('쉼표 목록(보고서 §1)을 처음 나타난 순서의 점 표기로 편다', () => {
    expect(layerOrder(REPORT_FORM)).toEqual([
      'vuetify-core',
      'vuetify-core.reset',
      'vuetify-core.base',
      'vuetify-components',
      'vuetify-overrides',
      'vuetify-utilities',
      'vuetify-utilities.theme-base',
      'vuetify-utilities.typography',
      'vuetify-utilities.helpers',
      'vuetify-utilities.theme-background',
      'vuetify-utilities.theme-foreground',
      'vuetify-final',
      'vuetify-final.transitions',
      'vuetify-final.trumps',
    ])
  })

  it('쉼표 목록과 문 여럿(4.2.6 꼴)이 같은 목록이 된다', () => {
    expect(layerOrder(VUETIFY_LAYER_ORDER)).toEqual(layerOrder(REPORT_FORM))
  })

  it('규칙이 든 첫 블록에서 멈춘다 — 그 블록과 뒤의 문은 세지 않는다', () => {
    const css = `@layer a, b;
@layer a.x {
  .v-btn { color: red; }
}
@layer c;`
    expect(layerOrder(css)).toEqual(['a', 'b'])
  })

  it('앞의 주석을 건너뛴다', () => {
    expect(
      layerOrder(`/*! license */
@layer a;
/* 사이 */
@layer b { @layer c; }`),
    ).toEqual(['a', 'b', 'b.c'])
  })
})

describe('VUETIFY_LAYER_ORDER — 설치된 vuetify 와 대조', () => {
  const requireFrom = createRequire(import.meta.url)
  const installed = layerOrder(readFileSync(requireFrom.resolve('vuetify/styles'), 'utf8'))

  it('탐지기가 살아 있다 — vuetify 쪽 목록에 reset 이 부품보다 앞에 있다', () => {
    expect(installed).toContain('vuetify-core.reset')
    expect(installed).toContain('vuetify-components')
    expect(installed.indexOf('vuetify-core.reset')).toBeLessThan(
      installed.indexOf('vuetify-components'),
    )
  })

  it('🔴 킷 선언과 설치된 vuetify/styles 머리의 레이어 순서가 같다', () => {
    expect(layerOrder(VUETIFY_LAYER_ORDER)).toEqual(installed)
  })

  it('킷 선언에는 규칙이 없다 — 레이어 문만', () => {
    expect(VUETIFY_LAYER_ORDER).not.toContain(':')
    expect(VUETIFY_LAYER_ORDER).not.toContain('.v-')
  })
})

describe('vuetifyLayerOrder — 플러그인', () => {
  it('head 맨 앞에 선언 style 태그 하나를 넣는다', () => {
    const plugin = vuetifyLayerOrder()
    expect(plugin.name).toBe('@ssworks/admin-ui:vuetify-layer-order')
    expect(plugin.transformIndexHtml()).toEqual([
      { tag: 'style', children: VUETIFY_LAYER_ORDER, injectTo: 'head-prepend' },
    ])
  })

  it('Vite Plugin 에 대입된다 — vite 를 import 하지 않는 구조 타입(pnpm typecheck 가 잰다)', () => {
    const plugin: Plugin = vuetifyLayerOrder()
    expect(plugin.name).toBe('@ssworks/admin-ui:vuetify-layer-order')
  })
})

describe('./vite 엔트리 그래프', () => {
  it('🔴 바깥 패키지 · .vue · .css 를 끌지 않는다 — 소비자의 vite.config 가 Node 에서 읽는다', () => {
    const graph = collectImports(resolve(SRC, 'vite.ts'))
    expect(graph.specifiers).toEqual([])
    expect(graph.files).toHaveLength(2) // vite.ts · vuetify/layer-order.ts
  })

  it('대조 — createAdminVuetify 그래프는 vuetify 를 끌어온다(탐지기가 살아 있다)', () => {
    expect(collectImports(resolve(SRC, 'vuetify/createAdminVuetify.ts')).specifiers).toContain(
      'vuetify',
    )
  })
})
