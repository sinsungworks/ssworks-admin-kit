# admin-ui ringside 보고 반영(PR #3h) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ringside 가 킷 0.5.0 을 조립하다 찾은 네 항목(Vuetify 레이어 순서 · 설정 셸 높이 · SessionTable 문구 · PermissionMatrix 열 정렬)을 admin-ui minor 한 번으로 반영한다.

**Architecture:** R1 은 Node 에서 읽히는 새 서브패스 `@ssworks/admin-ui/vite` 의 Vite 플러그인 `vuetifyLayerOrder()` 가 `<head>` 맨 앞에 Vuetify 레이어 순서 선언 `<style>` 을 넣는다. 선언은 킷 한 곳(`src/vuetify/layer-order.ts`)에 두고 테스트가 설치된 `vuetify/styles` 머리와 대조한다. R3 은 `SessionTableMessages`(표 문구 · 기본값은 컴포넌트 쪽)를 `SessionTable` `messages` prop 과 `useSessions({ messages })` → `table` 바인딩으로 흘리고, 확인 창 제목 · 접근 이름의 기본값이 버튼 문구를 따른다. R4 는 `PermissionMatrix` 를 표 하나 · 카테고리마다 `<tbody>` 로 바꿔 모든 줄의 칸 수를 같게 한다. R2 는 README 만.

**Tech Stack:** Vue 3.5 · Vuetify 4.2(dev 4.2.6) · Vite 8 lib 빌드(엔트리 둘) · TypeScript 6 · Vitest 5 + @vue/test-utils + happy-dom

**Spec:** `docs/superpowers/specs/2026-10-18-admin-ui-ringside-feedback-design.md` — 결정 ①~⑤ · L1–L8 · S1–S8 · M1–M7 · §2-5 · §3 · §6 · §7 · §8. 실행자는 스펙과 함께 읽는다. 입력 보고서는 `docs/reports/2026-10-18-ringside-admin-kit-report.md`.

## Global Constraints

- 브랜치 `feat/admin-ui-ringside-feedback`(main `baa0884` 에서 갈라짐 — 보고서 `b2e41b9` · 스펙 `4a39c05` 커밋됨). `main` 에 직접 커밋하지 않는다.
- **admin-shared · admin-server 는 고치지 않는다.** 템플릿(`../kim5257-project-template`) · ringside 는 읽기만 한다.
- 새 의존을 더하지 않는다. `vite` 를 peer 로 올리지 않는다(스펙 L4).
- 🔴 `src/vite.ts` · `src/vuetify/layer-order.ts` 는 바깥 패키지 · `.vue` · `.css` 를 import 하지 않는다(`vite` 타입 포함). 두 파일의 주석에 `from '…'` 꼴의 글을 쓰지 않는다 — 엔트리 그래프 테스트가 소스 글자를 읽는다.
- SFC 는 Vuetify 컴포넌트를 `vuetify/components` 에서 명시 import 한다. 스타일은 순수 CSS `<style scoped>`. 스토어 · 라우터를 import 하지 않는다.
- `import type` 을 분리한다(eslint `consistent-type-imports`). 내부 상대 import 는 `.js` 확장자(`.vue` 는 그대로).
- `console.log` 금지. 🔴 **코드 · 정규식 · 명령에 백슬래시를 쓰지 않는다** — 도구 입력의 이스케이프가 풀려 글자가 바뀐다. 공백은 `charCodeAt(i) <= 32`, 점은 `[.]`, 경로는 `/` 로 적는다. 백슬래시가 들어간 편집을 했다면 node 로 바이트를 확인한다. 예외는 `vite.config.ts` 의 `external` 정규식에 원래 있던 백슬래시뿐이다 — 그 줄은 건드리지 않는다(Task 1 Step 6).
- 바꾸는 파일의 머리 주석(정본 · 바꾼 점)에 3h 변경을 한 줄 더한다. `🔴` 주석은 "지우면 사고가 나는 이유"다.
- Boolean prop 에 `undefined` 기본값을 주지 않는다. 함수 꼴 문구 키는 **메서드 꼴**(bivariant)로 선언한다 — 쓰는 쪽이 자기 행 타입으로 적어도 된다.
- 기본 문구는 지금 박힌 글자와 **한 글자도 다르지 않다**(S1). 새 문구는 이 플랜에 적힌 글자 그대로다.
- 테스트: `src/**/*.test.ts`. DOM 이 필요하면 파일 머리 `// @vitest-environment happy-dom`. `data-testid` 를 심지 않는다 — 글자 · 접근 이름 · `name` · `scope` 로 찾는다.
- 명령은 저장소 루트에서: 파일 하나 `pnpm --filter @ssworks/admin-ui exec vitest run <src 기준 경로>`, 패키지 `pnpm --filter @ssworks/admin-ui test`, 타입 `pnpm --filter @ssworks/admin-ui typecheck`, 빌드 `pnpm --filter @ssworks/admin-ui build`, lint `pnpm exec eslint <파일들>`, 마크다운 `pnpm exec prettier --write <파일>`(긴 md 는 두 번 돌리고 `--check`).
- 커밋 메시지: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`. `.claude/settings.json` 의 로컬 변경은 커밋하지 않는다 — `git add` 는 파일을 이름으로 적는다.
- Windows · Linux 양쪽: Unix 파일 명령 대신 전용 도구, `> /dev/null` 금지.

## Review Focus

1. **Vuetify 가 레이어 머리의 모양을 바꿈**(쉼표 목록 ↔ 문 여럿 · 앞에 라이선스 주석) — 기대: 같은 순서면 대조가 초록, 순서 · 이름이 다르면 빨강. 주석 때문에 빈 목록이 나와 엉뚱한 실패를 내지 않는다. → Task 1 파서 테스트 "쉼표 목록과 문 여럿이 같다" · "앞의 주석을 건너뛴다" · "규칙 블록에서 멈춘다".
2. **쓰는 쪽이 접근 이름 함수의 행 인자를 자기 행 타입으로 적음**(`(row: AdminSessionListItem, view) => …`) — 기대: 타입 오류 없이 받는다(메서드 꼴). → Task 3 테스트가 `Row` 로 적은 함수를 넘기고 `pnpm typecheck` 가 잰다.
3. **`v-bind="table"` 뒤에 `:messages` 를 따로 줌** — 기대: 그 값이 바인딩을 통째로 덮고(병합하지 않음 — README 가 경고), 나머지는 컴포넌트 기본값. → Task 3 "따로 준 :messages 는 바인딩을 통째로 덮는다".
4. **열이 없는 카테고리 · 카테고리 0개** — 기대: 열 없는 카테고리도 칸 수가 같고, 0개면 표를 그리지 않으며 오류가 없다. → Task 4 "열이 없는 카테고리" · "카테고리가 없으면 표가 없다".
5. **HTML 엔트리가 여럿인 앱**(관리자 + 다른 페이지) — 기대: 모든 HTML 의 `<head>` 맨 앞에 선언이 들어간다. → Task 6 스모크가 `index.html` · `measure.html` 둘 다 본다.

---

## File Structure

| 파일 (모두 `packages/admin-ui/` 아래, 문서는 저장소 루트 기준)                                                   | 책임                                                     | Task |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| `src/vuetify/layer-order.ts`                                                                                     | 레이어 선언 상수(내부)                                   | 1    |
| `src/vite.ts`                                                                                                    | `vuetifyLayerOrder()` · 타입 둘 — `./vite` 엔트리        | 1    |
| `src/vite.test.ts`                                                                                               | 파서 · 선언 대조 · 플러그인 출력 · Vite 타입 · 그래프    | 1    |
| `vite.config.ts` · `package.json`                                                                                | lib 엔트리 둘 · exports `./vite`                         | 1    |
| `src/components/session/session-table.ts` · `SessionTable.vue` · `session-table.render.test.ts`                  | 표 문구 타입 · 기본값 · `messages` prop                  | 2    |
| `src/index.ts`                                                                                                   | 타입 둘 공개                                             | 2    |
| `src/composables/useSessions.ts` · `useSessions.render.test.ts`                                                  | `SessionMessages` 넓힘 · 확인 창 제목 · `table.messages` | 3    |
| `src/components/permission/PermissionMatrix.vue` · `permission-matrix.render.test.ts`                            | 한 표 · 카테고리마다 `<tbody>`                           | 4    |
| `README.md` · `.changeset/admin-ui-ringside-feedback.md` · `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md` | 문서 · 릴리스 · 진행                                     | 5    |
| `docs/verification/2026-10-18-admin-ui-ringside-feedback.md` · `docs/HANDOFF.md`                                 | 스모크 · 실브라우저 검증 기록                            | 6    |

---

### Task 1: R1 — Vite 플러그인 `vuetifyLayerOrder()` · `./vite` 엔트리

**Files:**

- Create: `packages/admin-ui/src/vuetify/layer-order.ts`
- Create: `packages/admin-ui/src/vite.ts`
- Create: `packages/admin-ui/src/vite.test.ts`
- Modify: `packages/admin-ui/vite.config.ts` (lib 엔트리)
- Modify: `packages/admin-ui/package.json` (exports)

**Interfaces:**

- Consumes: 없음(설치된 `vuetify` 의 `lib/styles/main.css` 는 테스트만 읽는다)
- Produces:
  - `src/vuetify/layer-order.ts`: `export const VUETIFY_LAYER_ORDER: string`(내부 — `index.ts` · `vite.ts` 밖으로 내보내지 않는다)
  - `src/vite.ts`(= `@ssworks/admin-ui/vite`): `export interface VuetifyLayerOrderTag { tag: 'style'; children: string; injectTo: 'head-prepend' }` · `export interface VuetifyLayerOrderPlugin { name: string; transformIndexHtml: () => VuetifyLayerOrderTag[] }` · `export function vuetifyLayerOrder(): VuetifyLayerOrderPlugin`
  - 빌드 산출물 `dist/vite.js` · `dist/vite.d.ts`, exports `"./vite"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/admin-ui/src/vite.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/vite.test.ts`
Expected: FAIL — `./vite.js` · `./vuetify/layer-order.js` 를 찾지 못한다(모듈 없음).

- [ ] **Step 3: 선언 상수를 쓴다**

`packages/admin-ui/src/vuetify/layer-order.ts`:

```ts
// Vuetify CSS 레이어 순서 선언 — vite.ts 의 플러그인이 <head> 맨 앞에 넣는다.
//
// 정본: Vuetify 4.2.6 lib/styles/main.css 머리(= lib/styles/generic/_layers.scss)
// 바꾼 점: 문자열 상수로 옮겼다. 내용은 그대로다(PR #3h 스펙 L3).
//
// 🔴 손으로 고치지 않는다. 킷이 Vuetify 를 올려 vite.test.ts 의 대조가 빨개지면, 설치된 vuetify 의
//    lib/styles/main.css 머리(규칙이 든 첫 블록 앞까지)를 다시 옮긴다.
// 🔴 공개하지 않는다 — @ssworks/admin-ui/vite 의 플러그인만 공개다. 이 파일은 아무것도 import 하지 않는다.

export const VUETIFY_LAYER_ORDER = `@layer vuetify-core {
  @layer reset, base;
}
@layer vuetify-components;
@layer vuetify-overrides;
@layer vuetify-utilities {
  @layer theme-base;
  @layer typography;
  @layer helpers;
  @layer theme-background;
  @layer theme-foreground;
}
@layer vuetify-final {
  @layer transitions, trumps;
}`
```

- [ ] **Step 4: 플러그인을 쓴다**

`packages/admin-ui/src/vite.ts`:

```ts
import { VUETIFY_LAYER_ORDER } from './vuetify/layer-order.js'

// @ssworks/admin-ui/vite — Vuetify CSS 레이어 순서를 <head> 맨 앞에서 선언하는 Vite 플러그인.
//
// 정본: Vuetify 문서 Styles › CSS Layers(레이어 순서를 다른 스타일시트보다 먼저 선언한다 — public/layers.css 를
//       head 맨 앞에서 link) + ringside 보고 2026-10-18 §1
// 바꾼 점: 프로젝트마다 layers.css 를 베끼지 않게 킷이 transformIndexHtml 로 넣는다(PR #3h 결정 ① ⓓ).
//
// 🔴 admin-ui 엔트리가 vuetify/components 를 들여서 부품 CSS(@layer vuetify-components)가 vuetify/styles 의 순서
//    선언보다 먼저 문서에 들어간다. 레이어 순서는 처음 나타난 순서라 reset 레이어가 <button> VBtn 의 size · 굵기를
//    이긴다(22px · 400). import 순서로는 못 고친다 — 개발 서버는 모듈 평가 순서, 운영 빌드는 청크 CSS 순서를 따른다.
// 🔴 head-prepend 는 <head> 바로 뒤, 빌드 CSS link 는 </head> 바로 앞에 들어간다(Vite 8 injectToHead) — 개발 · 빌드
//    모두 선언이 맨 앞이다. 우리 위에 올 수 있는 것은 다른 플러그인의 head-prepend 태그뿐이다(스펙 L2).
// 🔴 이 파일은 바깥 패키지를 import 하지 않는다 — 소비자의 vite.config 가 Node 에서 읽는다(vite.test.ts 그래프).
//    vite 타입도 들이지 않는다(peer-deps.test.ts 가 src 의 bare import 를 모두 필수 peer 로 요구한다). 반환 타입은
//    Vite Plugin 에 대입되는 구조 타입이다.

export interface VuetifyLayerOrderTag {
  tag: 'style'
  children: string
  injectTo: 'head-prepend'
}

export interface VuetifyLayerOrderPlugin {
  name: string
  transformIndexHtml: () => VuetifyLayerOrderTag[]
}

/** vite.config 의 plugins 맨 앞에 넣는다. index.html 은 고치지 않는다. */
export function vuetifyLayerOrder(): VuetifyLayerOrderPlugin {
  return {
    name: '@ssworks/admin-ui:vuetify-layer-order',
    transformIndexHtml: () => [
      { tag: 'style', children: VUETIFY_LAYER_ORDER, injectTo: 'head-prepend' },
    ],
  }
}
```

- [ ] **Step 5: 테스트 · 타입이 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/vite.test.ts`
Expected: PASS — 4 + 3 + 2 + 2 = 11 tests.

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/peer-deps.test.ts src/no-cycles.test.ts`
Expected: PASS(새 파일이 bare import 를 더하지 않았다).

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0(`const plugin: Plugin = vuetifyLayerOrder()` 가 컴파일된다).

- [ ] **Step 6: 빌드 엔트리와 exports 를 더한다**

`packages/admin-ui/vite.config.ts` — 파일 전체(바뀐 곳은 머리 주석 · `lib.entry` · `lib.fileName`):

```ts
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// 라이브러리 빌드 — ESM 엔트리 둘(index · vite) + style.css 하나. vue · vuetify 는 소비 프로젝트 것을 쓴다(external).
// 🔴 vite 엔트리(src/vite.ts)는 소비자의 vite.config 가 Node 에서 읽는다 — 아무것도 import 하지 않아 공유 청크가 없다.
export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: './tsconfig.build.json',
      processor: 'vue',
      copyDtsFiles: false,
      exclude: ['src/**/*.test.ts', 'src/test/**'],
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        vite: resolve(import.meta.dirname, 'src/vite.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: 'style',
    },
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        'vue',
        /^vuetify(\/.*)?$/,
        /^@ssworks\/admin-shared(\/.*)?$/,
        'zod',
        'axios',
        'pinia',
        /^vue-router(\/.*)?$/,
        /^@he-tree\/vue(\/.*)?$/,
        /^codemirror$/,
        /^@codemirror\//,
      ],
      output: {
        // 소비 프로젝트의 tree-shaking 을 위해 모듈 구조를 유지하지 않고 한 파일로 — 이 패키지는
        // 작고 sideEffects 가 CSS 뿐이라 한 파일이 단순하다.
        exports: 'named',
      },
    },
  },
})
```

🔴 `external` 의 정규식은 지금 파일 그대로다(그 안의 백슬래시는 원래 있던 글자다). **파일을 통째로 다시 쓰지 말고 Edit 로 머리 주석 · `entry` · `fileName` 세 곳만 바꾼다** — 통째로 쓰면 그 백슬래시가 도구 입력에서 풀릴 수 있다. 바꾼 뒤 `git diff packages/admin-ui/vite.config.ts` 에 `external` 줄이 나오지 않아야 한다.

`packages/admin-ui/package.json` — `exports` 에 `./vite` 를 `./style.css` 다음에 더한다:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./style.css": "./dist/style.css",
    "./vite": {
      "types": "./dist/vite.d.ts",
      "import": "./dist/vite.js"
    },
    "./package.json": "./package.json"
  },
```

- [ ] **Step 7: 빌드 산출물을 확인한다**

Run: `pnpm --filter @ssworks/admin-ui build`
Expected: 성공.

Run(저장소 루트, Bash): `ls packages/admin-ui/dist/*.js packages/admin-ui/dist/vite.d.ts packages/admin-ui/dist/style.css`
Expected: `index.js` · `vite.js` · `vite.d.ts` · `style.css` 가 있고, 최상위 `.js` 는 `index.js` · `vite.js` 둘뿐이다(공유 청크 없음 — 스펙 L5). 다르면 멈추고 보고한다.

Run: `node -e "import('./packages/admin-ui/dist/vite.js').then((m) => { const tags = m.vuetifyLayerOrder().transformIndexHtml(); console.log(tags.length, tags[0].tag, tags[0].injectTo, tags[0].children.includes('@layer vuetify-components')) })"`
Expected: `1 style head-prepend true` — Node 가 vue · vuetify 없이 읽는다.

Run: `node -e "const s = require('fs').readFileSync('packages/admin-ui/dist/vite.js', 'utf8'); console.log(/^import /m.test(s))"`
Expected: `false`.

- [ ] **Step 8: lint · 커밋**

Run: `pnpm exec eslint packages/admin-ui/src/vite.ts packages/admin-ui/src/vite.test.ts packages/admin-ui/src/vuetify/layer-order.ts packages/admin-ui/vite.config.ts`
Expected: 오류 0.

```bash
git add packages/admin-ui/src/vite.ts packages/admin-ui/src/vite.test.ts packages/admin-ui/src/vuetify/layer-order.ts packages/admin-ui/vite.config.ts packages/admin-ui/package.json
git commit -F - <<'EOF'
feat(admin-ui): Vite 플러그인 vuetifyLayerOrder — Vuetify 레이어 순서를 head 맨 앞에서 선언

admin-ui 가 vuetify/components 를 들여 부품 CSS 가 vuetify/styles 의 순서 선언보다 먼저
들어가고, reset 레이어가 <button> VBtn 의 size · 굵기를 이겼다(ringside 보고 §1). 새 서브패스
@ssworks/admin-ui/vite 의 플러그인이 개발 · 빌드 모두 <head> 맨 앞에 선언을 넣는다. 선언은
킷 한 곳에 두고 테스트가 설치된 vuetify/styles 머리와 대조한다. ./vite 엔트리는 Node 에서
읽히므로 아무것도 import 하지 않는다(소스 그래프 테스트).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 2: R3 — `SessionTable` 문구 `messages`

**Files:**

- Modify: `packages/admin-ui/src/components/session/session-table.ts`
- Modify: `packages/admin-ui/src/components/session/SessionTable.vue`
- Modify: `packages/admin-ui/src/index.ts:177` (세션 타입 export)
- Test: `packages/admin-ui/src/components/session/session-table.render.test.ts`

**Interfaces:**

- Consumes: `describeUserAgent`(admin-shared) · `formatDateTime`(내부) — 그대로
- Produces (`components/session/session-table.ts`):
  - `export interface SessionLabelView { device: string; lastAccessAt: string; showUser: boolean; button: string }`
  - `export interface SessionTableMessages { userColumn; deviceColumn; ipColumn; loginAtColumn; lastAccessAtColumn; expireAtColumn; currentDevice; currentDeviceNote; revokeButton: string; revokeButtonLabel(row: SessionTableRow, view: SessionLabelView): string; revokeUserButton: string; revokeUserButtonLabel(row: SessionTableRow, view: SessionLabelView): string }` (문자열 키는 모두 `string`)
  - `export const DEFAULT_SESSION_TABLE_MESSAGES: SessionTableMessages`(모듈 export — `index.ts` 로는 내보내지 않는다. Task 3 의 `useSessions` 가 읽는다)
  - `SessionTable` prop `messages?: Partial<SessionTableMessages>`(기본 `() => ({})`)
  - `index.ts`: `type SessionTableMessages` · `type SessionLabelView` 공개

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`session-table.render.test.ts` — import 줄을 바꾸고 파일 끝에 describe 를 더한다:

```ts
import { type SessionLabelView, type SessionTableRow } from './session-table.js'
```

```ts
describe('SessionTable — 문구(messages)', () => {
  it('일부만 덮으면 그 키만 바뀌고 나머지는 기본값이다', async () => {
    await mountTable({
      showUser: true,
      canRevokeUser: true,
      messages: {
        userColumn: '운영자',
        deviceColumn: '브라우저',
        currentDevice: '지금 기기',
        revokeButton: '로그아웃시키기',
      },
    })
    expect(headers()).toEqual(['운영자', '브라우저', 'IP', '마지막 활동', '만료', ''])
    const current = bodyRows()[0]!
    expect(current.textContent).toContain('지금 기기')
    expect(current.textContent).toContain('이 기기는 로그아웃으로 끝냅니다.')
    expect(buttonsByText('로그아웃시키기')).toHaveLength(2)
    expect(buttonsByText('사용자 전체 끊기')).toHaveLength(3)
  })

  it('🔴 revokeUserButton 만 바꾸면 버튼 글자와 접근 이름이 함께 바뀐다', async () => {
    const w = await mountTable({
      canRevokeUser: true,
      messages: { revokeUserButton: '운영자 전체 끊기' },
    })
    expect(buttonsByText('운영자 전체 끊기')).toHaveLength(3)
    expect(buttonsByText('사용자 전체 끊기')).toHaveLength(0)
    buttonByLabel('이(lee) 운영자 전체 끊기')!.click()
    await flushPromises()
    expect(w.emitted('revokeUser')).toEqual([[ROWS[2]]])
  })

  it('접근 이름 함수는 view(기기 · formatDate 를 거친 시각 · showUser · 버튼 문구)를 받는다', async () => {
    const views: SessionLabelView[] = []
    await mountTable({
      showUser: true,
      sessions: [ROWS[2]!],
      messages: {
        revokeButton: '로그아웃',
        revokeButtonLabel: (r: SessionTableRow, view: SessionLabelView) => {
          views.push(view)
          return `${r.userId ?? ''} ${view.button}`
        },
      },
    })
    expect(buttonByLabel('lee 로그아웃')).not.toBeNull()
    expect(views.at(-1)).toEqual({
      device: 'Safari · iOS',
      lastAccessAt: '2026-10-05 03:00',
      showUser: true,
      button: '로그아웃',
    })
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/session/session-table.render.test.ts`
Expected: 새 셋 FAIL(머리 칸이 '사용자' 그대로 · '운영자 전체 끊기' 버튼 0개 · `SessionLabelView` 타입 없음), 기존 테스트는 PASS.

- [ ] **Step 3: 문구 타입 · 기본값을 쓴다**

`session-table.ts` — 머리 주석의 `바꾼 점` 에 한 줄을 더하고 파일 끝에 붙인다:

```ts
// 바꾼 점: 행 모양을 admin-shared 세션 스키마에서 파생한다 — 관리자 목록 행이면 사용자 필드가 있다.
//          3h — 표 문구 타입 · 기본값(`messages` 부분 덮어쓰기, C2 · ringside 보고 §3).
```

```ts
/** 접근 이름 함수가 받는 값 — 표가 이미 셈한 것 */
export interface SessionLabelView {
  /** `describeUserAgent` 결과 */
  device: string
  /** `formatDate` 를 거친 마지막 활동 시각 */
  lastAccessAt: string
  showUser: boolean
  /** 그 행 버튼의 병합된 문구 */
  button: string
}

/**
 * 표 문구. `SessionTable` 의 `messages` 또는 `useSessions({ messages })` 로 일부만 덮는다(C2).
 * 함수 키는 메서드 꼴(bivariant)이다 — 쓰는 쪽이 자기 행 타입으로 적어도 된다.
 */
export interface SessionTableMessages {
  userColumn: string
  deviceColumn: string
  ipColumn: string
  loginAtColumn: string
  lastAccessAtColumn: string
  expireAtColumn: string
  /** 현재 세션 칩 */
  currentDevice: string
  /** 현재 세션 행의 동작 칸 안내 */
  currentDeviceNote: string
  revokeButton: string
  revokeButtonLabel(row: SessionTableRow, view: SessionLabelView): string
  revokeUserButton: string
  /** 🔴 기본값은 `view.button` 을 쓴다 — 버튼 문구를 바꾸면 접근 이름이 따라온다(3h S4) */
  revokeUserButtonLabel(row: SessionTableRow, view: SessionLabelView): string
}

/**
 * 기본 문구 — `index.ts` 로 내보내지 않는다(C2). 3h 전에 `SessionTable` 에 박혀 있던 글자 그대로다.
 * `useSessions` 가 확인 창 제목의 기본값으로 `revokeUserButton` 을 읽는다.
 */
export const DEFAULT_SESSION_TABLE_MESSAGES: SessionTableMessages = {
  userColumn: '사용자',
  deviceColumn: '기기',
  ipColumn: 'IP',
  loginAtColumn: '로그인',
  lastAccessAtColumn: '마지막 활동',
  expireAtColumn: '만료',
  currentDevice: '이 기기',
  currentDeviceNote: '이 기기는 로그아웃으로 끝냅니다.',
  revokeButton: '끝내기',
  revokeButtonLabel: (row, view) =>
    `${view.showUser && row.userName ? `${row.userName} · ` : ''}${view.device} 세션 끝내기 (마지막 활동 ${view.lastAccessAt})`,
  revokeUserButton: '사용자 전체 끊기',
  revokeUserButtonLabel: (row, view) => `${row.userName ?? ''}(${row.userId ?? ''}) ${view.button}`,
}
```

- [ ] **Step 4: `SessionTable.vue` 가 병합 문구로 그리게 한다**

`<script setup>` 의 import 를 바꾼다:

```ts
import {
  DEFAULT_SESSION_TABLE_MESSAGES,
  type SessionLabelView,
  type SessionTableMessages,
  type SessionTableRow,
} from './session-table.js'
```

머리 주석 `바꾼 점` 의 ③ 다음 줄과 🔴 하나를 더한다:

```ts
//  ④ 문구를 `messages`(부분 덮어쓰기 — C2)로 바꾼다(3h · ringside 보고 §3). `useSessions` 가 `table` 바인딩으로 싣는다.
```

```ts
// 🔴 "사용자 전체 끊기" 접근 이름의 기본값은 버튼 문구(`view.button`)를 쓴다 — 버튼만 바꿔도 화면 글자와 접근 이름이
//    같은 말이다(3h S4).
```

`defineProps` 에 prop 을, `withDefaults` 에 기본값을 더한다(`formatDate?(iso: string): string` 다음 · `formatDate: undefined,` 다음):

```ts
      /** 표 문구 일부. 나머지는 기본값(`SessionTableMessages`) */
      messages?: Partial<SessionTableMessages>
```

```ts
      messages: () => ({}),
```

`headers` · `revokeLabel` · `revokeUserLabel` 을 바꾼다(`format` 함수는 그대로):

```ts
const text = computed<SessionTableMessages>(() => ({
  ...DEFAULT_SESSION_TABLE_MESSAGES,
  ...props.messages,
}))

const headers = computed<AdminTableHeader[]>(() => [
  ...(props.showUser ? [{ title: text.value.userColumn, key: 'user', sortable: false }] : []),
  { title: text.value.deviceColumn, key: 'device', sortable: false },
  ...(props.showIp
    ? [{ title: text.value.ipColumn, key: 'ipAddress', sortable: false, nowrap: true }]
    : []),
  ...(props.showLoginAt
    ? [{ title: text.value.loginAtColumn, key: 'loginAt', sortable: false, nowrap: true }]
    : []),
  { title: text.value.lastAccessAtColumn, key: 'lastAccessAt', sortable: false, nowrap: true },
  ...(props.showExpireAt
    ? [{ title: text.value.expireAtColumn, key: 'expireAt', sortable: false, nowrap: true }]
    : []),
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
])

function labelView(row: TRow, button: string): SessionLabelView {
  return {
    device: describeUserAgent(row.userAgent),
    lastAccessAt: format(row.lastAccessAt),
    showUser: props.showUser,
    button,
  }
}

function revokeLabel(row: TRow): string {
  return text.value.revokeButtonLabel(row, labelView(row, text.value.revokeButton))
}

function revokeUserLabel(row: TRow): string {
  return text.value.revokeUserButtonLabel(row, labelView(row, text.value.revokeUserButton))
}
```

`<template>` 의 글자 넷을 바꾼다:

```vue
<VChip v-if="item.isCurrent" color="primary" size="x-small" variant="tonal">
          {{ text.currentDevice }}
        </VChip>
```

```vue
<span v-if="item.isCurrent" class="text-caption text-medium-emphasis">
          {{ text.currentDeviceNote }}
        </span>
```

```vue
          {{ text.revokeButton }}
        </VBtn>
```

```vue
          {{ text.revokeUserButton }}
        </VBtn>
```

(모양은 `pnpm exec prettier --write` 뒤를 따른다. 테스트는 글자를 `toContain` 으로 재므로 앞뒤 공백은 상관없다.)

- [ ] **Step 5: 타입을 공개한다**

`packages/admin-ui/src/index.ts:177`:

```ts
export {
  type SessionTableRow,
  type SessionTableMessages,
  type SessionLabelView,
} from './components/session/session-table.js'
```

- [ ] **Step 6: 테스트 · 타입이 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/session/session-table.render.test.ts`
Expected: PASS — 기존 14 + 새 3. 🔴 기존 테스트를 고치지 않았는데 초록이어야 한다(기본 문구가 그대로라는 증거).

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 7: lint · 커밋**

Run: `pnpm exec prettier --write packages/admin-ui/src/components/session/SessionTable.vue packages/admin-ui/src/components/session/session-table.ts packages/admin-ui/src/components/session/session-table.render.test.ts packages/admin-ui/src/index.ts`
Run: `pnpm exec eslint packages/admin-ui/src/components/session packages/admin-ui/src/index.ts`
Expected: 오류 0.

```bash
git add packages/admin-ui/src/components/session/session-table.ts packages/admin-ui/src/components/session/SessionTable.vue packages/admin-ui/src/components/session/session-table.render.test.ts packages/admin-ui/src/index.ts
git commit -F - <<'EOF'
feat(admin-ui): SessionTable 문구 messages — 열 · 칩 · 버튼 · 접근 이름을 부분 덮어쓰기로

"사용자" 열 · "사용자 전체 끊기" 버튼 · 그 접근 이름이 박혀 있어 프로젝트 용어(운영자)로 바꿀
수 없었다(ringside 보고 §3). 표 문구 전부를 SessionTableMessages 키로 두고 기본값은 지금 글자
그대로다. 사용자 전체 끊기 접근 이름의 기본값은 버튼 문구를 따른다.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 3: R3 — `useSessions` 가 표 문구를 `table` 바인딩으로 · 확인 창 제목이 버튼을 따름

**Files:**

- Modify: `packages/admin-ui/src/composables/useSessions.ts`
- Test: `packages/admin-ui/src/composables/useSessions.render.test.ts`

**Interfaces:**

- Consumes (Task 2): `DEFAULT_SESSION_TABLE_MESSAGES` · `type SessionTableMessages` · `type SessionLabelView`(테스트) from `../components/session/session-table.js`; `SessionTable` 의 `messages` prop
- Produces:
  - `export interface SessionMessages<R> extends SessionTableMessages { revoke: SessionDialogText; revokeOthers: SessionDialogText; revokeUser: (row: R) => SessionDialogText; revokeUserSelf: (row: R) => SessionDialogText }` — 대화상자 키 넷은 지금 그대로
  - `SessionTableBindings<R>` 에 `messages: Partial<SessionTableMessages>`
  - 옵션 `messages?: Partial<SessionMessages<R>>` 는 그대로(쓰는 쪽이 깨지지 않는다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`useSessions.render.test.ts` — import 에 타입 하나를 더하고, `describe('useSessions — 서버 페이징 모드'` 앞에 describe 를 더한다:

```ts
import { type SessionLabelView } from '../components/session/session-table.js'
```

```ts
describe('useSessions — 표 문구', () => {
  const overlay = () => {
    const node = document.querySelector<HTMLElement>('.v-overlay--active')
    expect(node, '가드 — 확인 창이 열렸다').not.toBeNull()
    return node!
  }

  it('🔴 키 둘이 table 바인딩을 거쳐 열 제목 · 버튼 · 접근 이름이 되고, 확인 창 제목도 따라온다', async () => {
    await setup(
      {
        list: async () => OTHERS,
        revokeUser: vi.fn(async () => undefined),
        messages: { userColumn: '운영자', revokeUserButton: '운영자 전체 끊기' },
      },
      { showUser: true },
    )
    const heads = [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(heads[0]).toBe('운영자')
    await clickLabel('이(lee) 운영자 전체 끊기')
    expect(overlay().textContent).toContain('운영자 전체 끊기')
    expect(overlay().textContent).toContain('「이(lee)」의 모든 세션이 즉시 로그아웃됩니다.')
    expect(buttonByText('모두 끊기', overlay())).toBeTruthy()
  })

  it('🔴 내 계정의 확인 창 제목도 버튼 문구를 따른다', async () => {
    await setup({
      list: async () => MINE,
      revokeUser: vi.fn(),
      messages: { revokeUserButton: '운영자 전체 끊기' },
    })
    await clickLabel('김(kim) 운영자 전체 끊기')
    expect(overlay().textContent).toContain('운영자 전체 끊기')
    expect(overlay().textContent).toContain('이 계정은 지금 로그인한 당신 자신입니다.')
  })

  it('revokeUser 확인 문구를 직접 주면 그것이 이긴다', async () => {
    await setup({
      list: async () => OTHERS,
      revokeUser: vi.fn(),
      messages: {
        revokeUserButton: '운영자 전체 끊기',
        revokeUser: (r) => ({
          title: '접속 모두 차단',
          message: `${r.userName} 님을 내보냅니다.`,
          confirmLabel: '차단',
        }),
      },
    })
    await clickLabel('이(lee) 운영자 전체 끊기')
    expect(overlay().textContent).toContain('접속 모두 차단')
    expect(overlay().textContent).toContain('이 님을 내보냅니다.')
    expect(overlay().textContent).not.toContain('운영자 전체 끊기')
  })

  it('쓰는 쪽 행 타입으로 적은 접근 이름 함수를 받는다(메서드 꼴 — pnpm typecheck 가 잰다)', async () => {
    await setup(
      {
        list: async () => OTHERS,
        revokeUser: vi.fn(),
        messages: {
          revokeUserButtonLabel: (r: Row, view: SessionLabelView) => `${r.userNo} ${view.button}`,
        },
      },
      { showUser: true },
    )
    expect(document.querySelector('button[aria-label="2 사용자 전체 끊기"]')).not.toBeNull()
  })

  it('🔴 v-bind 뒤에 따로 준 :messages 는 바인딩을 통째로 덮는다 — 병합하지 않는다', async () => {
    await setup(
      {
        list: async () => OTHERS,
        revokeUser: vi.fn(),
        messages: { userColumn: '운영자', revokeUserButton: '운영자 전체 끊기' },
      },
      { showUser: true, messages: { userColumn: '직접' } },
    )
    const heads = [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(heads[0]).toBe('직접')
    expect(document.querySelector('button[aria-label="이(lee) 사용자 전체 끊기"]')).not.toBeNull()
  })

  it('messages 를 안 주면 table.messages 는 빈 객체다', async () => {
    const sessions = await setup({ list: async () => MINE })
    expect(sessions.table.value.messages).toEqual({})
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useSessions.render.test.ts`
Expected: 새 테스트 중 바인딩을 거치는 것 FAIL(머리 칸 '사용자' 그대로 · `table.value.messages` 가 `undefined` · 확인 창 제목 '사용자 전체 끊기'). "따로 준 :messages" 는 Task 2 덕에 이미 PASS 일 수 있다. 기존 테스트는 PASS.

- [ ] **Step 3: `useSessions.ts` 를 바꾼다**

머리 주석 `바꾼 점` 에 ⑤ 를 더한다:

```ts
//  ⑤ 표 문구도 `messages` 가 맡아 `table` 바인딩으로 싣는다. "사용자 전체 끊기" 확인 창 제목의 기본값은 표 버튼
//     문구(`revokeUserButton`)를 따른다 — 버튼만 바꿔도 창 제목이 같은 말이다(3h S4 · ringside 보고 §3).
```

import 를 바꾼다:

```ts
import {
  DEFAULT_SESSION_TABLE_MESSAGES,
  type SessionTableMessages,
  type SessionTableRow,
} from '../components/session/session-table.js'
```

`SessionMessages` 를 넓힌다:

```ts
/** 확인 창 문구 넷 + 표 문구(`SessionTableMessages`) — 옵션은 `Partial` 이라 일부만 준다 */
export interface SessionMessages<R> extends SessionTableMessages {
  revoke: SessionDialogText
  revokeOthers: SessionDialogText
  revokeUser: (row: R) => SessionDialogText
  revokeUserSelf: (row: R) => SessionDialogText
}
```

`SessionTableBindings` 에 키 하나를 더한다(`onRevokeUser` 다음):

```ts
/** 표 문구 — `useSessions({ messages })` 를 그대로 싣는다. 대화상자 키는 표가 쓰지 않는다 */
messages: Partial<SessionTableMessages>
```

`const DEFAULT_MESSAGES: SessionMessages<SessionTableRow> = { … }` 를 통째로 이 함수로 바꾼다(문구 글자는 그대로, 제목 둘만 인자):

```ts
type SessionDialogMessages = Omit<SessionMessages<SessionTableRow>, keyof SessionTableMessages>

/** 확인 창 기본 문구. 🔴 사용자 전체 끊기의 제목은 표 버튼 문구를 받는다 — 버튼만 바꿔도 같은 말이다(3h S4). */
function defaultDialogs(revokeUserTitle: string): SessionDialogMessages {
  return {
    revoke: {
      title: '세션 끝내기',
      message: '그 브라우저는 즉시 로그아웃되고, 다시 쓰려면 다시 로그인해야 합니다.',
      confirmLabel: '끝내기',
    },
    revokeOthers: {
      title: '다른 세션 모두 끝내기',
      message: '이 기기를 뺀 모든 세션이 즉시 로그아웃됩니다.',
      confirmLabel: '모두 끝내기',
    },
    revokeUser: (row) => ({
      title: revokeUserTitle,
      message: `「${row.userName ?? ''}(${row.userId ?? ''})」의 모든 세션이 즉시 로그아웃됩니다. 그 사람은 다시 로그인해야 합니다.`,
      confirmLabel: '모두 끊기',
    }),
    revokeUserSelf: () => ({
      title: revokeUserTitle,
      message:
        '이 계정은 지금 로그인한 당신 자신입니다. 확인하는 즉시 이 화면에서도 로그아웃되고, 다시 로그인해야 합니다.',
      confirmLabel: '모두 끊기',
    }),
  }
}
```

`useSessions` 안의 `const messages = …` 한 줄을 바꾼다:

```ts
const revokeUserTitle =
  options.messages?.revokeUserButton ?? DEFAULT_SESSION_TABLE_MESSAGES.revokeUserButton
const messages = {
  ...DEFAULT_SESSION_TABLE_MESSAGES,
  ...defaultDialogs(revokeUserTitle),
  ...options.messages,
} as SessionMessages<R>
/** 표 문구는 컴포넌트가 기본값과 병합한다 — 여기서는 받은 것을 그대로 싣는다(S6 · S7) */
const tableMessages: Partial<SessionTableMessages> = options.messages ?? {}
```

`table` computed 의 `bindings` 에 한 줄을 더한다(`onRevokeUser` 다음):

```ts
      messages: tableMessages,
```

- [ ] **Step 4: 테스트 · 타입이 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/composables/useSessions.render.test.ts src/components/session/session-table.render.test.ts`
Expected: PASS — 기존 테스트를 고치지 않고 초록, 새 6 포함.

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0(`(r: Row, view: SessionLabelView) => …` 가 받아진다).

- [ ] **Step 5: lint · 커밋**

Run: `pnpm exec prettier --write packages/admin-ui/src/composables/useSessions.ts packages/admin-ui/src/composables/useSessions.render.test.ts`
Run: `pnpm exec eslint packages/admin-ui/src/composables/useSessions.ts packages/admin-ui/src/composables/useSessions.render.test.ts`
Expected: 오류 0.

```bash
git add packages/admin-ui/src/composables/useSessions.ts packages/admin-ui/src/composables/useSessions.render.test.ts
git commit -F - <<'EOF'
feat(admin-ui): useSessions messages 가 표 문구까지 — table 바인딩으로 싣고 확인 창 제목이 버튼을 따름

useSessions({ messages: { userColumn, revokeUserButton } }) 두 키로 열 · 버튼 · 접근 이름 ·
"사용자 전체 끊기" 확인 창 제목(남 · 본인)이 함께 바뀐다(ringside 보고 §3 — 버튼과 창 제목이
다른 말이던 문제). 확인 문구를 직접 주면 그것이 이긴다.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 4: R4 — `PermissionMatrix` 한 표 · 카테고리마다 `<tbody>`

**Files:**

- Modify: `packages/admin-ui/src/components/permission/PermissionMatrix.vue`
- Test: `packages/admin-ui/src/components/permission/permission-matrix.render.test.ts`

**Interfaces:**

- Consumes: `matrixCellKey` · 타입 셋(그대로)
- Produces: props · 슬롯 · 모델 그대로. DOM 만 — `<table>` 하나(VTable, 루트 class `permission-matrix`) · 카테고리마다 `<tbody class="permission-matrix__category">` · 첫 줄 `<tr class="permission-matrix__head">`(`th[scope=rowgroup]` 카테고리 라벨 · `th[scope=col]` 열 라벨 · 빈 `<td>` · `#row-extra` 면 빈 `th[scope=col]`) · 행 줄(`th[scope=row]` · 칸 `<td>` · 빈 `<td>` · `#row-extra` 면 `<td>`). 모든 줄의 칸 수 = 1 + 최대 열 수 [+ 1]

- [ ] **Step 1: 테스트를 새 구조로 바꾸고 더한다**

`permission-matrix.render.test.ts` — `CATEGORIES` 다음에 고정값과 도우미를 더한다:

```ts
/** 열 수가 다른 카테고리(2 · 4) — 같은 순번 열 정렬을 잰다(ringside 보고 §4) */
const MIXED: PermissionMatrixCategory[] = [
  {
    id: 'org',
    label: '조직',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
    ],
    rows: [
      { resource: 'org.users', label: '직원' },
      { resource: 'org.roles', label: '역할' },
    ],
  },
  {
    id: 'member',
    label: '회원',
    columns: [
      { action: 'read', label: '읽기' },
      { action: 'write', label: '편집' },
      { action: 'suspend', label: '정지' },
      { action: 'export', label: '내보내기' },
    ],
    rows: [{ resource: 'members', label: '회원' }],
  },
]
```

```ts
const table = () => document.querySelector('table')!
const categoryBodies = () => [...table().querySelectorAll('tbody')]
const allRows = () => [...table().querySelectorAll('tr')]
const cellTexts = (tr: Element) => [...tr.children].map((c) => c.textContent?.trim() ?? '')
/** 행 줄(머리 줄 제외) — 행 머리가 있는 줄 */
const resourceRows = () => allRows().filter((tr) => tr.querySelector('th[scope="row"]'))
```

`describe('PermissionMatrix — 렌더'` 의 첫 테스트를 바꾸고, 그 describe 끝에 셋을 더한다:

```ts
it('표 하나에 카테고리마다 tbody — 머리 줄은 카테고리 라벨(rowgroup)과 열 라벨, 행 머리는 행 라벨', async () => {
  await setup()
  expect(document.querySelectorAll('table')).toHaveLength(1)
  expect(table().querySelector('thead')).toBeNull()
  const [org, log] = categoryBodies()
  expect(categoryBodies()).toHaveLength(2)
  expect(org!.querySelector('th[scope="rowgroup"]')?.textContent?.trim()).toBe('조직')
  expect([...org!.querySelectorAll('th[scope="col"]')].map((th) => th.textContent?.trim())).toEqual(
    ['읽기', '편집', '삭제'],
  )
  expect([...org!.querySelectorAll('th[scope="row"]')].map((th) => th.textContent?.trim())).toEqual(
    ['직원', '역할'],
  )
  expect(log!.querySelector('th[scope="rowgroup"]')?.textContent?.trim()).toBe('기록')
})
```

```ts
it('🔴 열 수가 다른 카테고리(2 · 4)도 모든 줄의 칸 수가 같다 — 같은 순번 열이 한 줄로 선다', async () => {
  await setup({ categories: MIXED })
  expect(allRows().map((tr) => tr.children.length)).toEqual([5, 5, 5, 5, 5])
  expect(cellTexts(categoryBodies()[0]!.querySelector('tr')!)).toEqual([
    '조직',
    '읽기',
    '편집',
    '',
    '',
  ])
  // 두 카테고리의 첫 액션 칸이 모두 둘째 칸이다
  const firstAction = (body: Element) =>
    body.querySelectorAll('tr')[1]!.children[1]!.querySelector('input')?.getAttribute('name')
  expect(firstAction(categoryBodies()[0]!)).toBe('org.users:read')
  expect(firstAction(categoryBodies()[1]!)).toBe('members:read')
})

it('열이 없는 카테고리도 칸 수가 같다', async () => {
  await setup({
    categories: [
      ...MIXED,
      { id: 'empty', label: '빈 카테고리', columns: [], rows: [{ resource: 'x', label: '엑스' }] },
    ],
  })
  expect(new Set(allRows().map((tr) => tr.children.length))).toEqual(new Set([5]))
})

it('카테고리가 없으면 표를 그리지 않는다', async () => {
  await setup({ categories: [] })
  expect(document.querySelector('table')).toBeNull()
})
```

`describe('PermissionMatrix — 슬롯 · 도우미'` 의 앞 두 테스트를 바꾼다:

```ts
it('#row-extra 를 주면 열 하나를 더한다 — 모든 줄의 칸 수가 같고 슬롯은 늘 마지막 칸이다', async () => {
  await setup(
    { categories: MIXED },
    {
      'row-extra': ({ row, category }: { row: { resource: string }; category: { id: string } }) =>
        h('span', `${category.id}/${row.resource}`),
    },
  )
  expect(allRows().map((tr) => tr.children.length)).toEqual([6, 6, 6, 6, 6])
  expect(resourceRows().map((tr) => tr.lastElementChild?.textContent?.trim())).toEqual([
    'org/org.users',
    'org/org.roles',
    'member/members',
  ])
})

it('슬롯이 없으면 열을 더하지 않는다', async () => {
  await setup()
  expect(allRows().map((tr) => tr.children.length)).toEqual([4, 4, 4, 4, 4])
})
```

나머지 테스트(접근 이름 · 비활성 · `'*'` · 토글 · `canPick` · `assertMatrixCoversPermissions`)는 그대로 둔다.

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/permission/permission-matrix.render.test.ts`
Expected: 바꾼 · 더한 테스트 FAIL(표가 2개 · `th[scope=rowgroup]` 없음 · 줄마다 칸 수가 다름), 그대로 둔 테스트는 PASS.

- [ ] **Step 3: 한 표로 그린다**

`PermissionMatrix.vue` — 머리 주석 `바꾼 점` 에 ⑤ 와 🔴 하나를 더한다:

```ts
//  ⑤ 카테고리마다 표를 따로 그리던 것을 표 하나 · 카테고리마다 `<tbody>` 로(3h · ringside 보고 §4). 같은 순번 열이
//     카테고리를 넘어 한 줄로 서서 위아래로 훑으며 비교할 수 있다.
```

```ts
// 🔴 모든 줄의 칸 수가 같아야 한다(1 + 최대 열 수 [+ row-extra]). 열이 적은 카테고리는 빈 `<td>` 로 채운다 — 빠뜨리면
//    그 카테고리의 `#row-extra` 칸이 다른 카테고리의 액션 열 자리로 밀려 들어간다.
```

`tables` computed 를 바꾼다:

```ts
/** 모든 카테고리 열 수의 최댓값 — 표 하나의 액션 열 수 */
const width = computed(() =>
  props.categories.reduce((max, category) => Math.max(max, category.columns.length), 0),
)

const tables = computed(() =>
  props.categories.map((category) => ({
    category,
    padding: width.value - category.columns.length,
    rows: category.rows.map((row) => ({
      row,
      cells: category.columns.map((column) => ({ column, key: matrixCellKey(row, column) })),
    })),
  })),
)
```

`<template>` 를 통째로 바꾼다:

```vue
<template>
  <VTable v-if="tables.length > 0" class="permission-matrix" density="compact">
    <tbody v-for="table in tables" :key="table.category.id" class="permission-matrix__category">
      <tr class="permission-matrix__head">
        <th scope="rowgroup">{{ table.category.label }}</th>
        <th v-for="column in table.category.columns" :key="column.action" scope="col">
          {{ column.label }}
        </th>
        <td v-for="n in table.padding" :key="`pad-${n}`" />
        <th v-if="slots['row-extra']" scope="col" />
      </tr>
      <tr v-for="entry in table.rows" :key="entry.row.resource">
        <th scope="row">{{ entry.row.label }}</th>
        <td v-for="cell in entry.cells" :key="cell.column.action">
          <VCheckbox
            :aria-label="`${entry.row.label} ${cell.column.label}`"
            density="compact"
            :disabled="cellDisabled(cell.key)"
            hide-details
            :model-value="valid.has(cell.key) && granted.has(cell.key)"
            :name="cell.key"
            @update:model-value="(value) => toggle(cell.key, value === true)"
          />
        </td>
        <td v-for="n in table.padding" :key="`pad-${n}`" />
        <td v-if="slots['row-extra']">
          <slot name="row-extra" :category="table.category" :row="entry.row" />
        </td>
      </tr>
    </tbody>
  </VTable>
</template>
```

`<style scoped>` 를 통째로 바꾼다:

```css
<style scoped>
  /*
   * 🔴 머리 줄은 thead 가 아니라 tbody 의 첫 줄이다 — thead 는 표에 하나뿐이라 카테고리마다 머리를 두려면 그렇다.
   *    VTable 의 thead 모양(굵기 · 보조 글자색)을 흉내 낸다.
   */
  .permission-matrix__head > th {
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  /* 3h 전의 표 사이 간격(16px)을 카테고리 사이에 둔다 */
  .permission-matrix__category + .permission-matrix__category > .permission-matrix__head > * {
    padding-top: 16px;
  }
</style>
```

- [ ] **Step 4: 테스트 · 타입이 통과하는지 본다**

Run: `pnpm --filter @ssworks/admin-ui exec vitest run src/components/permission/permission-matrix.render.test.ts`
Expected: PASS — 13 tests(렌더 7 · 토글 3 · 슬롯 · 도우미 3).

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: PASS(다른 테스트가 매트릭스를 표 단위로 재지 않는다 — 실패하면 그 테스트를 새 구조로 고친다).

Run: `pnpm --filter @ssworks/admin-ui typecheck`
Expected: 오류 0.

- [ ] **Step 5: lint · 커밋**

Run: `pnpm exec prettier --write packages/admin-ui/src/components/permission/PermissionMatrix.vue packages/admin-ui/src/components/permission/permission-matrix.render.test.ts`
Run: `pnpm exec eslint packages/admin-ui/src/components/permission`
Expected: 오류 0.

```bash
git add packages/admin-ui/src/components/permission/PermissionMatrix.vue packages/admin-ui/src/components/permission/permission-matrix.render.test.ts
git commit -F - <<'EOF'
feat(admin-ui): PermissionMatrix 를 한 표로 — 카테고리마다 tbody, 같은 순번 열이 한 줄

카테고리마다 VTable 을 따로 그려 같은 순번 열이 카테고리마다 다른 자리에 섰다(ringside 보고
§4 — 1557 · 1395 · 1952px). 표 하나에 카테고리마다 tbody(첫 줄이 카테고리 머리 줄)로 그리고,
열이 적은 카테고리는 빈 칸으로 채워 모든 줄의 칸 수를 같게 한다. props · 슬롯은 그대로다.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 5: README · changeset · 진행 문서 · `pnpm check`

**Files:**

- Modify: `packages/admin-ui/README.md`
- Create: `.changeset/admin-ui-ringside-feedback.md`
- Modify: `CLAUDE.md` (진행표)
- Modify: `docs/01-phase0.md` (§8)
- Modify: `docs/HANDOFF.md` (제목 날짜 · 「지금 상태」 · 「PR #3h 가 넘긴 것」)

**Interfaces:**

- Consumes: Task 1~4 의 공개 이름 — `vuetifyLayerOrder` · `@ssworks/admin-ui/vite` · `SessionTableMessages` · `SessionLabelView` · 키 이름(`userColumn` … `revokeUserButtonLabel`)
- Produces: 문서만

- [ ] **Step 1: README 「레이아웃 프리미티브」 · 「Vuetify 프리셋」 · 「Peer 의존」**

PanelLayout 행의 설명 끝 `**부모가 definite height 를 줘야 한다**` 뒤에 ` — 「설정 셸」의 높이 예시` 를 붙인다.

「Vuetify 프리셋」 문단(`createAdminVuetify({ theme, defaults })` …) 뒤에 더한다:

````markdown
🔴 **레이어 순서 선언 — `vite.config` 의 `plugins` 맨 앞에 `vuetifyLayerOrder()` 를 넣는다.** admin-ui 는 `vuetify/components` 를 import 한다. 그래서 앱이 admin-ui 를 처음 import 하는 순간 Vuetify 부품 CSS(`@layer vuetify-components`)가 `vuetify/styles` 의 레이어 순서 선언보다 먼저 들어가고, reset 레이어가 `<button>` VBtn 의 `size` · 굵기를 이긴다(22px · 400 — `<a>` VBtn 은 멀쩡하다). import 순서로는 고칠 수 없다 — 개발 서버는 모듈 평가 순서, 운영 빌드는 청크 CSS 순서를 따른다. 플러그인이 개발 · 빌드 모두 `<head>` 맨 앞에 Vuetify 의 레이어 순서를 선언한다. `index.html` 은 고치지 않는다.

```ts
// vite.config.ts
import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite'

export default defineConfig({
  plugins: [vuetifyLayerOrder(), vue(), vuetify()],
})
```

- 선언은 인라인 `<style>` 이다. `style-src` 를 좁힌 CSP 는 해시나 nonce 가 필요하다(Vuetify 테마 `<style>` 과 같은 처지).
- 선언은 킷이 시험한 Vuetify(4.2.6)의 `lib/styles/main.css` 머리와 같다 — 킷 테스트가 대조한다. 킷보다 새 Vuetify 를 쓰는데 레이어가 바뀌었으면 킷을 올린다.
- `@ssworks/admin-ui/vite` 는 Node 에서 읽히는 빌드 설정용 서브패스다 — vue · vuetify 를 끌지 않는다.
````

「Peer 의존」 🔴 문단의 `서브패스 export 로 가르지 않는 대가다.` 뒤에 아래 문장을 붙인다(같은 문단):

```text
예외는 `@ssworks/admin-ui/vite` 하나다 — 브라우저 엔트리가 아니라 `vite.config` 가 읽는 빌드 설정용이다.
```

- [ ] **Step 2: README export 표 · 「역할 · 설정」 · 「설정 셸」**

export 표의 `SessionTable` 행을 바꾼다 — 첫 칸은 아래 첫 줄로 바꾸고, 설명 칸 끝에 아래 둘째 줄을 붙인다:

```text
`SessionTable` · `SessionTableRow` · `SessionTableMessages` · `SessionLabelView`
 · 문구 `messages`
```

「`PermissionMatrix` props · 슬롯」 표의 `categories` 행 설명을 바꾼다: `한 표에 카테고리마다 머리 줄 + 행(자원) × 열(액션). 같은 순번 열이 카테고리를 넘어 한 줄로 선다 — 열이 적은 카테고리는 끝 칸이 빈다`.

「설정 셸」 props 표 다음, 기존 bullet 목록 앞에 더한다:

````markdown
🔴 **`SettingsShell` 은 부모가 정한 높이(definite height)를 받는다.** 셸 · 메뉴 pane · 자식 페이지의 `ColumnPane` 이 모두 `height: 100%` 다 — 높이가 없으면 `scrollable` pane 의 본문이 0 높이로 접히거나 페이지 전체가 스크롤된다(`PanelLayout` 과 같다). 앱바 높이는 숫자로 박지 않고 Vuetify 가 `VMain` 에 다는 `--v-layout-top` 으로 뺀다 — 프리셋(compact) 앱바는 48px 다.

```vue
<!-- pages/settings.vue -->
<template>
  <div class="settings"><SettingsShell /></div>
</template>

<style scoped>
  .settings {
    height: calc(100dvh - var(--v-layout-top, 64px));
  }
</style>
```

- `AdminShell` 의 `banner` 슬롯에 내용이 있으면 그 높이만큼 넘친다 — 배너 높이도 뺀다.
- `PanelLayout` · 팀 화면처럼 높이를 받아야 하는 다른 페이지도 같은 식이다.
````

- [ ] **Step 3: README 「관리자 전체 목록」 표 문구**

「관리자 전체 목록」의 bullet 목록(`- 🔴 지금 쓰는 세션 행에는 …` 부터 `- 계정별 세션 다이얼로그는 …` 까지) 뒤, `### 임시 비밀번호` 앞에 더한다:

````markdown
#### 표 문구

열 제목 · 버튼 · 접근 이름은 `useSessions({ messages })` 로 바꾼다 — 확인 창 문구와 같은 곳이다. 버튼 문구를 바꾸면 그 접근 이름과 "사용자 전체 끊기" 확인 창 제목(남 · 본인)이 따라온다.

```ts
const all = useSessions({
  // … 위와 같음
  messages: { userColumn: '운영자', revokeUserButton: '운영자 전체 끊기' },
})
```

| 키                                                                                                     | 기본값                                                      |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `userColumn` · `deviceColumn` · `ipColumn` · `loginAtColumn` · `lastAccessAtColumn` · `expireAtColumn` | 사용자 · 기기 · IP · 로그인 · 마지막 활동 · 만료            |
| `currentDevice` · `currentDeviceNote`                                                                  | 이 기기 · 이 기기는 로그아웃으로 끝냅니다.                  |
| `revokeButton` · `revokeButtonLabel(row, view)`                                                        | 끝내기 · `{이름 · }{기기} 세션 끝내기 (마지막 활동 {시각})` |
| `revokeUserButton` · `revokeUserButtonLabel(row, view)`                                                | 사용자 전체 끊기 · `{이름}({아이디}) {view.button}`         |

- `view` = `{ device, lastAccessAt, showUser, button }` — 표가 셈한 기기 요약 · `formatDate` 를 거친 시각 · 사용자 열 표시 여부 · 그 버튼의 문구.
- 🔴 `v-bind="all.table.value"` 뒤에 `:messages` 를 따로 주면 바인딩의 것을 통째로 덮는다(병합하지 않는다) — `useSessions` 한 곳에서 바꾼다. `useSessions` 없이 표만 쓸 때는 `SessionTable` 의 `messages` prop 으로 바꾼다.
- 빈 목록 문구는 그대로 `emptyText` · `#no-data` 다.
````

Run: `pnpm exec prettier --write packages/admin-ui/README.md` 를 두 번, 그다음 `pnpm exec prettier --check packages/admin-ui/README.md`
Expected: 통과.

- [ ] **Step 4: changeset**

`.changeset/admin-ui-ringside-feedback.md`:

```markdown
---
'@ssworks/admin-ui': minor
---

ringside 보고 반영(PR #3h)

- 🔴 **Vuetify CSS 레이어 순서** — `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder()` 를 더했다. admin-ui 가 `vuetify/components` 를 import 해서 부품 CSS 가 `vuetify/styles` 의 레이어 순서 선언보다 먼저 들어가, reset 레이어가 `<button>` VBtn 의 `size` · 굵기를 이겼다(22px · 400). **쓰는 쪽은 `vite.config` 의 `plugins` 맨 앞에 `vuetifyLayerOrder()` 를 넣는다** — `index.html` 은 고치지 않는다(README 「Vuetify 프리셋」).
- `SessionTable` 문구 — `messages` prop(부분 덮어쓰기)과 `useSessions({ messages })` 의 표 문구 키(`userColumn` · `revokeUserButton` …)를 더했다. `table` 바인딩이 그대로 싣고, "사용자 전체 끊기" 확인 창 제목 · 접근 이름의 기본값은 `revokeUserButton` 을 따른다. 공개 타입 `SessionTableMessages` · `SessionLabelView`. 기본 문구는 그대로다.
- `PermissionMatrix` — 카테고리마다 `<table>` 을 그리던 것을 `<table>` 하나 + 카테고리마다 `<tbody>`(첫 줄이 카테고리 머리 줄)로 바꿨다. 같은 순번 열이 카테고리를 넘어 한 줄로 선다. props · 슬롯은 그대로다 — **표 단위로 DOM 을 재는 테스트(`querySelectorAll('table')` · `thead th`)는 고친다.**
- README 「설정 셸」 — 부모 높이 요구와 `calc(100dvh - var(--v-layout-top, 64px))` 예시.
```

Run: `pnpm changeset status`
Expected: `@ssworks/admin-ui` minor 가 보이고(`fixed` 라 세 패키지가 함께 오른다), major 가 없다.

- [ ] **Step 5: 진행 문서**

`CLAUDE.md` 진행표 — PR #3g 행 다음, Phase 4 행 앞에 더한다:

```markdown
| Phase 1 후속 PR #3h — ringside 보고 반영(`vuetifyLayerOrder` Vite 플러그인 · SessionTable `messages` · PermissionMatrix 한 표 · 설정 셸 높이 README) | 완료 | 스펙 `docs/superpowers/specs/2026-10-18-admin-ui-ringside-feedback-design.md` · 플랜 `docs/superpowers/plans/2026-10-18-admin-ui-ringside-feedback.md` |
```

`docs/01-phase0.md` §8 — PR #3g 문단(`admin-ui IP 접근 제어 화면 PR #3g(2026-10-18) 완료 — …`) 다음에 빈 줄과 문단을 더한다:

```markdown
admin-ui ringside 보고 반영 PR #3h(2026-10-18) 완료 — `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder()`(Vuetify 레이어 순서를 `<head>` 맨 앞에서 선언 · 설치된 vuetify 와 대조 테스트) · `SessionTable` `messages`(`useSessions` 한 곳에서 표 · 확인 창 문구) · `PermissionMatrix` 한 표(카테고리마다 tbody) · README 설정 셸 높이(스펙 `docs/superpowers/specs/2026-10-18-admin-ui-ringside-feedback-design.md` · 플랜 `docs/superpowers/plans/2026-10-18-admin-ui-ringside-feedback.md`). 입력은 ringside 보고(`docs/reports/2026-10-18-ringside-admin-kit-report.md`).
```

`docs/HANDOFF.md`:

1. 제목 `# HANDOFF — 2026-10-17` → `# HANDOFF — 2026-10-18`.
2. 공개 상태를 먼저 본다: `npm view @ssworks/admin-ui versions --json` · `npm view @ssworks/admin-ui dist-tags --json`. 0.6.0 · 0.7.0 이 목록에 있으면 "공개", 없으면 "Version Packages 머지 · 승인 대기" 로 아래 문장에 적는다.
3. 「지금 상태」 표 `@ssworks/admin-ui` 행 — 셀 끝(`… · peer pinia ^4(0.5.0 예정 — 킷 상향 2026-10-17)`) 뒤에 아래를 붙인다. `<공개 상태>` 는 2 에서 본 값이다.

   ```text
    · **PR #3f**(감사 로그 `useAuditLogs` · `AuditLogViewer` — 0.6.0 <공개 상태>) · **PR #3g**(IP 접근 제어 `useIpAccessRules` · `IpAccessManager` — 0.7.0 <공개 상태>) · **PR #3h**(ringside 보고 반영 — `@ssworks/admin-ui/vite` 의 `vuetifyLayerOrder()` · `SessionTable` `messages` · `PermissionMatrix` 한 표, 브랜치 `feat/admin-ui-ringside-feedback` — 0.8.0 예정)
   ```

4. 「지금 상태」 표 「다음 플랜」 행 — 셀 맨 앞에 아래를 붙인다(뒤에 공백 하나):

   ```text
   **PR #3h 뒤**: push → Version Packages PR(0.8.0 ×3) 머지 → `pnpm stage approve` ×3 → 태그. 그다음 ringside 가 0.8.0 을 적용하고(아래 「PR #3h 가 넘긴 것」), 템플릿 세션이 같은 입력을 반영한다.
   ```

5. 「PR #3g 가 넘긴 것」 목록 다음, `## 작업 폴더 밖에 남은 것` 앞에 더한다:

```markdown
- **PR #3h 가 넘긴 것(2026-10-18)** — 입력 `docs/reports/2026-10-18-ringside-admin-kit-report.md` · 스펙 `docs/superpowers/specs/2026-10-18-admin-ui-ringside-feedback-design.md`
  - **ringside 적용법**(0.8.0 공개 뒤 — pnpm 12 의 최소 공개 기간 1일이 지나서 설치하고, 자동으로 붙은 `minimumReleaseAgeExclude` 는 커밋하지 않는다):
    - ① 레이어: 킷 셋을 0.8.0 으로 올리고 관리자 앱 `vite.config` 의 `plugins` 맨 앞에 `vuetifyLayerOrder()`(`import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite'`). `index.html` · `public/layers.css` 는 만들지 않는다. 새로 고침 `<button>` VBtn 이 14px · 500, `size="small"` 이 12px 인지 본다.
    - ② 설정 셸: 부모 `height: calc(100dvh - var(--v-layout-top, 64px))`(README 「설정 셸」) — 이미 그렇게 고쳤으면 그대로.
    - ③ 세션 표 문구: `useSessions({ …, messages: { userColumn: '운영자', revokeUserButton: '운영자 전체 끊기' } })` — 열 · 버튼 · 접근 이름 · 확인 창 제목이 함께 바뀐다. 표에 `:messages` 를 따로 주지 않는다.
    - ④ 권한 매트릭스: 코드 변경 없음(0.8.0 이면 같은 순번 열이 한 줄). 매트릭스를 `table` · `thead th` 단위로 재는 테스트가 있으면 `tbody` · `th[scope]` 로 고친다.
  - **템플릿 세션 입력**(`kim5257-project-template` `preset/admin` — push 는 사람): 킷 핀 0.5.0 → 0.8.0 · `packages/frontend/vite.config.mts` 의 `plugins` 맨 앞에 `vuetifyLayerOrder()` · `pages/settings.vue:26` · `teams.vue:130` 의 `64px` → `var(--v-layout-top, 64px)` · 감사 로그 · IP 접근 제어 페이지(「PR #3f 가 넘긴 것」 · 「PR #3g 가 넘긴 것」) · PermissionMatrix 를 표 단위로 재는 템플릿 테스트 확인.
```

Run: `pnpm exec prettier --write CLAUDE.md docs/01-phase0.md docs/HANDOFF.md .changeset/admin-ui-ringside-feedback.md` 를 두 번, 그다음 `pnpm format:check`
Expected: 통과.

- [ ] **Step 6: 전체 검사**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 모두 초록. 실패하면 고치고 다시 돌린다.

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-ui/README.md .changeset/admin-ui-ringside-feedback.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md
git commit -F - <<'EOF'
docs(admin-ui): PR #3h — README(레이어 플러그인 · 설정 셸 높이 · 세션 표 문구 · 매트릭스) · changeset · 진행 문서

HANDOFF 「지금 상태」를 2026-10-18 로 고치고(3f · 3g · 3h), ringside 적용법과 템플릿 세션
입력을 「PR #3h 가 넘긴 것」에 남긴다.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

---

### Task 6: 스모크 · 실브라우저 검증 · 검증 기록

**Files:**

- Create: `docs/verification/2026-10-18-admin-ui-ringside-feedback.md`(prettier 밖 — `.prettierignore` 의 `docs/verification/`)
- Modify: `docs/HANDOFF.md` (「지금 상태」 검증 행)
- 저장소 밖(커밋하지 않음): `$LOCALAPPDATA/Temp/aksh/` — 짧은 경로(긴 경로에서 pnpm 12 설치가 os error 3)

**Interfaces:**

- Consumes: Task 1~5 의 빌드 산출물 · `.claude/commands/smoke.md` 절차
- Produces: 검증 기록(측정표)

- [ ] **Step 1: 패킹 · 스모크 앱(모든 export)**

`.claude/commands/smoke.md` 1~4 를 그대로 따른다. 작업 폴더는 Git Bash 의 `"$LOCALAPPDATA/Temp/aksh"`(포그라운드로 — 백그라운드 Bash 산출물은 저장소 밖에 남지 않은 적이 있다). 앱 `package.json` 의 `packageManager` 는 `pnpm@12.8.1`. 더할 것:

- 앱 `vite.config.ts` 의 `plugins` 맨 앞에 `process.env.NO_LAYERS ? null : vuetifyLayerOrder()`(`import { vuetifyLayerOrder } from '@ssworks/admin-ui/vite'`). `build.rolldownOptions.input` 에 `{ main: 'index.html', measure: 'measure.html' }`(Vite 8 — `rollupOptions` 가 아니다).
- devDependencies 에 `playwright-core`(측정 스크립트용 — 저장소에는 더하지 않는다)와 `@types/node`(`vite.config.ts` 의 `process.env` 타입).

`vue-tsc --noEmit` 이 `vite.config.ts` 도 검사하게 한다(앱 tsconfig 의 include 에 넣는다) — `vuetifyLayerOrder()` 가 Vite `PluginOption` 에 대입되는지 여기서도 잰다.

- [ ] **Step 2: 측정 페이지**

앱 `measure.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>measure</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/measure.ts"></script>
  </body>
</html>
```

앱 `src/measure.ts` — 🔴 admin-ui 를 `vuetify/styles` 보다 먼저 import 한다(보고서의 재현 순서):

```ts
import { createAdminVuetify } from '@ssworks/admin-ui'
import { createApp } from 'vue'
import 'vuetify/styles'
import '@ssworks/admin-ui/style.css'
import Measure from './Measure.vue'

createApp(Measure).use(createAdminVuetify()).mount('#app')
```

앱 `src/Measure.vue`:

```vue
<script setup lang="ts">
  import { ref } from 'vue'
  import { VApp, VAppBar, VBtn, VMain } from 'vuetify/components'
  import {
    DataTablePanel,
    PermissionMatrix,
    type PermissionMatrixCategory,
  } from '@ssworks/admin-ui'

  const headers = [
    { title: '이름', key: 'name', sortable: false },
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ]
  const items = [{ name: '김하늘' }]
  const page = ref(1)
  const itemsPerPage = ref(20)
  const sortBy = ref([])
  const categories: PermissionMatrixCategory[] = [
    {
      id: 'org',
      label: '조직',
      columns: [
        { action: 'read', label: '읽기' },
        { action: 'write', label: '편집' },
      ],
      rows: [
        { resource: 'org.users', label: '직원' },
        { resource: 'org.roles', label: '역할' },
      ],
    },
    {
      id: 'session',
      label: '세션',
      columns: [
        { action: 'read', label: '읽기' },
        { action: 'revoke', label: '끊기' },
      ],
      rows: [{ resource: 'sessions', label: '관리자 세션 전체 목록' }],
    },
    {
      id: 'member',
      label: '회원',
      columns: [
        { action: 'read', label: '읽기' },
        { action: 'write', label: '편집' },
        { action: 'suspend', label: '정지' },
        { action: 'export', label: '내보내기' },
      ],
      rows: [{ resource: 'members', label: '회원' }],
    },
  ]
  const permissions = [
    'org.users:read',
    'org.users:write',
    'org.roles:read',
    'sessions:read',
    'members:read',
  ]
  const granted = ref(['org.users:read', 'sessions:read'])
  const noop = () => {}
</script>

<template>
  <VApp>
    <VAppBar title="aksh" />
    <VMain>
      <div class="settings">
        <DataTablePanel
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          v-model:sort-by="sortBy"
          :headers="headers"
          :items="items"
          :items-length="1"
          title="운영자"
        >
          <template #header-actions>
            <VBtn prepend-icon="mdi-refresh" variant="text" @click="noop">새로 고침</VBtn>
            <VBtn href="#add" prepend-icon="mdi-plus">운영자 추가</VBtn>
          </template>
          <template #item.actions>
            <VBtn size="small" variant="text" @click="noop">퇴사 처리</VBtn>
            <VBtn href="#edit" size="small" variant="text">편집</VBtn>
          </template>
        </DataTablePanel>
        <PermissionMatrix v-model="granted" :categories="categories" :permissions="permissions" />
      </div>
    </VMain>
  </VApp>
</template>

<style scoped>
  .settings {
    height: calc(100dvh - var(--v-layout-top, 64px));
    overflow: auto;
  }
</style>
```

(vue-tsc 가 `sortBy` 타입을 문제 삼으면 `DataTablePanel` 의 `sortBy` 모델 타입으로 `ref<…>([])` 를 적는다.)

- [ ] **Step 3: 타입 · 빌드 둘 · head 확인**

앱 폴더에서(Git Bash):

```bash
pnpm exec vue-tsc --noEmit
pnpm exec vite build
NO_LAYERS=1 pnpm exec vite build --outDir dist-noplugin
```

Expected: 셋 다 성공.

head 확인 스크립트 `check-head.mjs`:

```js
import { readFileSync } from 'node:fs'

for (const file of ['dist/index.html', 'dist/measure.html', 'dist-noplugin/measure.html']) {
  const html = readFileSync(file, 'utf8')
  const head = html.slice(html.indexOf('<head'), html.indexOf('</head>'))
  const first = head.search(/<style|<link rel="stylesheet"/)
  console.log(file, '→', head.slice(first, first + 48).replaceAll(String.fromCharCode(10), ' '))
}
```

Run: `node check-head.mjs`
Expected: `dist/index.html` · `dist/measure.html` 은 `<style>@layer vuetify-core {` 로 시작한다(🔴 HTML 둘 다 — Review Focus 5). `dist-noplugin/measure.html` 은 `<link rel="stylesheet" …` 이다(대조).

- [ ] **Step 4: 실브라우저 측정**

앱 `measure.mjs` — 개발 서버 · 빌드 둘을 차례로 띄워 같은 값을 잰다:

```js
import { chromium } from 'playwright-core'
import { createServer, preview } from 'vite'

async function measure(url) {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  const result = await page.evaluate(() => {
    const button = (text) =>
      [...document.querySelectorAll('.v-btn')].find((b) => b.textContent.trim() === text)
    const style = (text) => {
      const el = button(text)
      const s = getComputedStyle(el)
      return { text, tag: el.tagName.toLowerCase(), fontSize: s.fontSize, fontWeight: s.fontWeight }
    }
    const firstSheet = document.styleSheets[0]?.ownerNode
    const bodies = [...document.querySelectorAll('.permission-matrix tbody')]
    const main = document.querySelector('.v-main')
    const settings = document.querySelector('.settings')
    return {
      firstSheet: firstSheet ? firstSheet.outerHTML.slice(0, 48) : null,
      buttons: ['새로 고침', '운영자 추가', '퇴사 처리', '편집'].map(style),
      matrixFirstActionLefts: bodies.map(
        (tb) => tb.querySelectorAll('tr')[1].children[1].getBoundingClientRect().left,
      ),
      layoutTop: getComputedStyle(main).getPropertyValue('--v-layout-top').trim(),
      settingsHeight: settings.getBoundingClientRect().height,
      viewportHeight: innerHeight,
    }
  })
  await browser.close()
  return result
}

const results = {}

const dev = await createServer({ server: { port: 5181, strictPort: true } })
await dev.listen()
results.dev = await measure('http://localhost:5181/measure.html')
await dev.close()

for (const [name, outDir, port] of [
  ['build', 'dist', 5182],
  ['buildNoPlugin', 'dist-noplugin', 5183],
]) {
  const server = await preview({ build: { outDir }, preview: { port, strictPort: true } })
  results[name] = await measure(`http://localhost:${port}/measure.html`)
  await server.close()
}

console.log(JSON.stringify(results, null, 2))
```

Run: `node measure.mjs`(Chrome 이 없으면 `BROWSER_CHANNEL=msedge node measure.mjs`)
Expected:

- `dev` · `build`: `firstSheet` 가 `<style>@layer vuetify-core` 로 시작 · 새로 고침(`button`) 14px · 500 · 운영자 추가(`a`) 14px · 500 · 퇴사 처리(`button`, small) 12px · 500 · 편집(`a`, small) 12px · 500 · `matrixFirstActionLefts` 셋이 같은 값 · `layoutTop` 48px · `settingsHeight` = `viewportHeight` − 48.
- `buildNoPlugin`(대조): `<button>` 둘이 기대와 다르다(보고서 §1 — 새로 고침은 부모 글자 크기 · 400, 퇴사 처리 14px · 400). 대조가 기대와 같게 나오면(버그가 재현되지 않으면) 멈추고 보고한다 — 측정이 아무것도 증명하지 못한다.

기대와 다르면 멈추고 값 그대로 보고한다(고치지 않는다).

- [ ] **Step 5: 검증 기록**

`docs/verification/2026-10-18-admin-ui-ringside-feedback.md` — 아래 틀에 Step 1~4 의 실제 값을 채운다(값을 지어내지 않는다):

```markdown
# 검증 — admin-ui PR #3h ringside 보고 반영 (2026-10-18)

스펙 `docs/superpowers/specs/2026-10-18-admin-ui-ringside-feedback-design.md` §8.

## 1. 저장소

- `pnpm check`: <결과 — 워크스페이스 테스트 수>
- `pnpm format:check`: <결과>
- `dist/`: <최상위 .js 목록 · vite.d.ts 유무>

## 2. 스모크(`$LOCALAPPDATA/Temp/aksh`)

- tarball: <admin-shared · admin-ui 파일 이름>
- vue-tsc(`vite.config.ts` 포함): <결과> · vite build: <결과> · peer 경고: <결과>
- head 첫 스타일: <check-head.mjs 출력 세 줄>

## 3. 실브라우저(<브라우저 · 버전>, 1600×1000)

| 버튼             | 태그   | 개발 서버 | 빌드 | 빌드(플러그인 없음) |
| ---------------- | ------ | --------- | ---- | ------------------- |
| 새로 고침        | button | <값>      | <값> | <값>                |
| 운영자 추가      | a      | <값>      | <값> | <값>                |
| 퇴사 처리(small) | button | <값>      | <값> | <값>                |
| 편집(small)      | a      | <값>      | <값> | <값>                |

- 첫 스타일시트: <dev · build · noplugin>
- 매트릭스 첫 액션 열 왼쪽 끝: <값 셋>
- 설정 셸: `--v-layout-top` <값> · 높이 <값> = 뷰포트 <값> − <값>

## 4. 남은 것

- <없으면 "없음">
```

- [ ] **Step 6: HANDOFF 검증 행 · 커밋**

`docs/HANDOFF.md` 「지금 상태」 표 검증 행 셀 끝에 아래를 붙인다(`<…>` 는 Step 4 의 실제 값):

```text
 PR #3h(2026-10-18)는 Windows 에서 pnpm check 초록, 스모크(`$LOCALAPPDATA/Temp/aksh` — 모든 export · vite.config 에 vuetifyLayerOrder · head 첫 스타일)와 실브라우저 측정(<브라우저> — <button> VBtn 14px · 500 / small 12px, 플러그인 없는 빌드는 <값>)을 통과했다 — docs/verification/2026-10-18-admin-ui-ringside-feedback.md.
```

Run: `pnpm exec prettier --write docs/HANDOFF.md` 를 두 번, `pnpm format:check`
Expected: 통과.

```bash
git add docs/verification/2026-10-18-admin-ui-ringside-feedback.md docs/HANDOFF.md
git commit -F - <<'EOF'
docs(admin-ui): PR #3h 검증 기록 — 스모크 · 실브라우저 VBtn 글자 크기 · 매트릭스 열 · 셸 높이

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```

스모크 임시 폴더는 측정이 끝나면 지운다(smoke.md 5).
