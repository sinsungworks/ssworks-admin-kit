# admin-server 기반 · 코어 스키마 Implementation Plan (Phase 2 PR 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@ssworks/admin-server` 에 모든 후속 PR 이 기대는 바닥을 깐다 — 응답 봉투 · 예외 필터 · 검증 파이프 · `configureAdminApp` · `AdminServerModule` · DB 연결 · 코어 스키마 7장 · 러너 진입점.

**Architecture:**

- **Nest 무의존 층(`runner`):** env · TZ 유틸, 풀 옵션(`adminPoolConfig`), `createAdminKysely`(앱과 마이그레이션 러너가 같은 함수), 드라이버 오류 매핑(`mapError` · `runQuery` · `runWriteTransaction`), 코어 장 7개와 스텁 검사. `@ssworks/admin-server/runner` 로 낸다.
- **HTTP 층:** `configureAdminApp`(cookie-parser · bigint reviver · `json replacer` · extended 쿼리 파서), 전역 봉투 인터셉터(`@RawResponse()` 로 뺌), `@Catch()` 전부 받는 예외 필터(replacer 에 기대지 않고 직접 직렬화), zod · bigint 파이프.
- **모듈:** `AdminServerModule.forRoot` · `forRootAsync` 가 위를 전역으로 등록하고 `RouterModule` 로 `admin/` prefix 를 붙인다. 부팅 때 replacer 를 확인한다.

**Tech Stack:** NestJS 12.1 · Express 5 · Kysely 0.29 · mariadb 3.5 · `@kim5257/kysely-mariadb-dialect` 0.2 · zod 4 · vitest 4 · supertest 7 · MariaDB 11.4(Docker)

**Spec:** `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` — §1 Phase 2 지도 · §3 결정 F1~F17 · §5 공개 API · §6 코어 스키마 · §9 테스트 계약 · §13 플랜 전 정정 R1~R7. 플랜과 스펙이 어긋나면 스펙이 이긴다.

**Branch:** `feat/admin-server-foundation`(스펙 커밋 `e1a0f18` 위). `main` 에서 직접 작업하지 않는다.

## Global Constraints

- **판:** Node `>=22`. peer `@nestjs/common` · `@nestjs/core` · `@nestjs/platform-express` `^12.0.0`, `kysely` `^0.29.0`, `mariadb` `^3.4.0`, `@kim5257/kysely-mariadb-dialect` `^0.2.0`, `reflect-metadata` `^0.2.0`, `rxjs` `^7.8.0`, `zod` `^4.0.0`, `@ssworks/admin-shared` `workspace:^0`. `dependencies` 는 `cookie-parser` `^1.4.7` 하나. 테스트 DB 이미지는 `mariadb:11.4`.
- **kysely 0.29:** `Migrator` · `Migration` · `NO_MIGRATIONS` 는 `kysely/migration` 에서 import 한다(루트에 없다).
- **ESM · NodeNext:** 내부 상대 import 는 `.js` 확장자(`./env.js`).
- **import 규칙(admin-server/src):** eslint `consistent-type-imports` 가 꺼져 있다(DI 메타데이터). 🔴 그래도 **데코레이터가 붙은 시그니처에 쓰는 인터페이스 · 타입 별칭은 `import type`** 으로 받는다 — `isolatedModules` + `emitDecoratorMetadata` 에서 일반 import 면 TS1272 로 실패한다. DI 로 받는 **클래스**(`Reflector` · `HttpAdapterHost`)는 일반 import.
- **`any` 금지:** eslint `no-explicit-any`(src). 장은 `Kysely<unknown>`(스펙 R2). 테스트 파일은 규칙이 꺼져 있다.
- **로그:** `console.log` 금지. Nest 클래스는 `new Logger(이름)` 의 `error` 를 **문자열 하나**로 부른다. 러너 층(Nest 무의존)은 로그를 남기지 않고 던진다.
- **봉투:** 성공 `{ success: true, data }`, 실패 `{ success: false, code, message, details? }`. 코드는 admin-shared `CommonErrorCodes` 만 쓴다. 고정 문구:
  - 5xx `'서버 내부 오류가 발생했습니다.'`
  - 검증 `'요청 형식이 올바르지 않습니다.'`
  - 413 `'요청 본문이 너무 큽니다.'`, 그 밖 Express 4xx `'요청을 처리할 수 없습니다.'`
  - `mapError` 문구는 스펙 §5-5 표 그대로.
- **머리 주석:** 정본에서 가져온 파일은 `정본: …` 과 `바꾼 점:` 을 적는다. `🔴` 는 "지우면 사고가 나는 이유" 다.
- **포맷:** prettier(세미콜론 없음 · 작은따옴표 · 100자 · trailing comma all). Task 끝마다 `pnpm exec prettier --write <바꾼 파일들>`.
- **Windows · Linux 양쪽:** `> /dev/null` · `2>/dev/null` 금지(Windows 에서 `NUL` 파일이 생긴다). 파일을 python · sed 로 다시 쓰지 않는다(개행은 LF). npm 스크립트에 작은따옴표 · 글롭을 넣지 않는다.
- **admin-shared 는 이 PR 에서 고치지 않는다.** admin-server 는 admin-shared 를 `dist/` 로 읽는다(root `prepare` 가 install 직후 빌드).
- **참조 프로젝트(`../hangang-home` 등)는 읽기만 한다.**
- **커밋:** 한국어 conventional commits(`feat(admin-server): …`), 마지막 줄은 정확히 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` · `pnpm release` · `npm publish` 하지 않는다.
- **Task 마다:** `pnpm check` 초록(DB 가 걸린 Task 는 `pnpm test:db` 도).

## Review Focus

스펙이 말하지 않았지만 쓰는 사람이 실제로 부딪칠 입력 다섯. 각 줄의 테스트는 해당 Task 에 들어 있다.

1. **메모장이 저장한 `.env`(UTF-8 BOM)** — 첫 키가 `﻿DB_HOST` 가 되어 "필수 환경변수가 없다" 로 기동이 실패한다. BOM 을 벗겨야 한다 → Task 1 `parseDotEnv` BOM 테스트.
2. **`?__proto__[x]=1` · `filter[__proto__][x]=1` 같은 쿼리** — extended 파서를 켠 대가로 프로토타입 오염 경로가 열리면 안 된다 → Task 5 쿼리 테스트.
3. **객체가 아닌 JSON 본문(`"text"`)과 깨진 퍼센트 인코딩 경로(`/teams/%FF`)** — Express · Nest 층에서 나는 오류도 봉투로 나가야 한다(HTML 이 아니라) → Task 5 오류 봉투 테스트.
4. **응답을 쓰기 시작한 뒤의 예외(`@Res()` 핸들러)** — 필터가 두 번 보내다 터지거나 요청이 끝나지 않으면 안 된다 → Task 5 "헤더가 나간 뒤" 테스트.
5. **DB 가 아직 없을 때 기동했다가 내리기** — 풀이 생성 즉시 연결을 시도하므로, 닿지 않는 DB 로 만든 `KYSELY` 를 닫을 때 처리되지 않은 오류가 새면 안 된다 → Task 6 `KYSELY` 팩토리 테스트.

---

## 파일 구조

```
packages/admin-server/
  package.json                     (Task 1 — 판 · exports · peer, Task 9 — test:db)
  tsconfig.build.json              (Task 1 — test-support 제외)
  vitest.config.ts                 (Task 1 — *.db.test.ts 제외, TZ=UTC)
  vitest.db.config.ts              (Task 9)
  README.md                        (Task 10)
  src/
    index.ts                       (Task 1 임시 → Task 8 최종)
    runner.ts                      (Task 8)
    runner-graph.test.ts           (Task 8)
    decorator-metadata.test.ts     (Task 1)
    tokens.ts · options.ts         (Task 5)
    admin-server.module.ts (+test) (Task 6)
    config/env.ts · timezone.ts (+tests)                                   (Task 1)
    database/connection.ts · kysely.ts · boolean-transform.plugin.ts · json.ts (+tests)  (Task 2)
    database/map-error.ts · run.ts (+tests)                                 (Task 3)
    database/tables/*.ts · types.ts                                        (Task 7)
    database/migrations/_shared.ts · 0001_roles.ts … 0007_sessions.ts · ddl.test.ts  (Task 7)
    database/migrations/index.ts (+test)                                   (Task 8)
    database/migrations/migrations.db.test.ts · database/database.db.test.ts (Task 9)
    http/validation.ts · pipes.ts · json-safe.ts (+tests)                   (Task 4)
    http/configure-admin-app.ts · envelope.interceptor.ts · exception.filter.ts · http-contract.test.ts  (Task 5)
    test-support/http.ts · probe.ts                                        (Task 5)
    test-support/db-url.ts · db-global-setup.ts · db.ts                    (Task 9)
package.json(root)                 (Task 9 — test:db · db:test:up · db:test:down)
.github/workflows/ci.yml           (Task 9 — db 잡)
.changeset/admin-server-foundation.md · docs/* · CLAUDE.md   (Task 10)
```

권장 모델(서브에이전트로 실행할 때): Task 1 sonnet · Task 2 haiku · Task 3 haiku · Task 4 sonnet · Task 5 sonnet · Task 6 sonnet · Task 7 sonnet · Task 8 sonnet · Task 9 sonnet · Task 10 sonnet · Task 11 sonnet · 최종 리뷰 opus.

---

### Task 1: 패키지 바탕 — Nest 12 · kysely 0.29 의존, env · TZ 유틸

**Files:**

- Modify: `packages/admin-server/package.json`
- Modify: `packages/admin-server/tsconfig.build.json`
- Modify: `packages/admin-server/vitest.config.ts`
- Modify: `packages/admin-server/src/index.ts`
- Delete: `packages/admin-server/src/index.test.ts`
- Create: `packages/admin-server/src/decorator-metadata.test.ts`
- Create: `packages/admin-server/src/config/env.ts` · `env.test.ts`
- Create: `packages/admin-server/src/config/timezone.ts` · `timezone.test.ts`

**Interfaces:**

- Produces: `parseDotEnv(raw: string): Record<string, string>` · `loadDotEnv(file: string | URL): void` · `requireEnv(keys: readonly string[]): void` · `isEffectiveUtc(now?: Date): boolean` · `assertUtcTimezone(context: string): void`

- [ ] **Step 1: `package.json` 을 바꾼다**

`packages/admin-server/package.json` 전체:

```json
{
  "name": "@ssworks/admin-server",
  "version": "0.2.0",
  "private": true,
  "description": "관리자 API 공통 NestJS 모듈 — 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마. 인증 · 사용자 · 역할 · 팀 · 약관 · IP 는 Phase 2 후속 PR.",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": {
    "node": ">=22"
  },
  "files": ["dist", "README.md"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./runner": {
      "types": "./dist/runner.d.ts",
      "import": "./dist/runner.js"
    },
    "./migrations/*": {
      "types": "./dist/database/migrations/*.d.ts",
      "import": "./dist/database/migrations/*.js"
    },
    "./package.json": "./package.json"
  },
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/sinsungworks/ssworks-admin-kit.git",
    "directory": "packages/admin-server"
  },
  "scripts": {
    "build": "rimraf dist && tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "peerDependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.0.0",
    "@nestjs/core": "^12.0.0",
    "@nestjs/platform-express": "^12.0.0",
    "@ssworks/admin-shared": "workspace:^0",
    "kysely": "^0.29.0",
    "mariadb": "^3.4.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "zod": "^4.0.0"
  },
  "dependencies": {
    "cookie-parser": "^1.4.7"
  },
  "devDependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.1.2",
    "@nestjs/core": "^12.1.2",
    "@nestjs/platform-express": "^12.1.2",
    "@nestjs/testing": "^12.1.2",
    "@ssworks/admin-shared": "workspace:*",
    "@types/cookie-parser": "^1.4.10",
    "@types/express": "^5.0.6",
    "@types/node": "^24.0.0",
    "@types/supertest": "^7.2.1",
    "kysely": "^0.29.6",
    "mariadb": "^3.5.4",
    "reflect-metadata": "^0.2.2",
    "rimraf": "^6.0.1",
    "rxjs": "^7.8.2",
    "supertest": "^7.3.1",
    "typescript": "~5.9.2",
    "vitest": "^4.1.10",
    "zod": "^4.3.5"
  }
}
```

`packages/admin-server/tsconfig.build.json` 전체:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.test.ts", "src/test-support/**"]
}
```

`packages/admin-server/vitest.config.ts` 전체:

```ts
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'admin-server',
    include: ['src/**/*.test.ts'],
    // 🔴 실 MariaDB 층(*.db.test.ts)은 `pnpm test:db` 가 따로 돈다(vitest.db.config.ts). `pnpm check` 는 DB 없이 초록이어야 한다.
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
  },
})
```

- [ ] **Step 2: 설치**

Run: `pnpm install`
Expected: 성공. `pnpm-lock.yaml` 에 `@nestjs/*` 12.x · `kysely` 0.29.x · `mariadb` 3.5.x 가 들어온다. 설치 스크립트 차단(`ERR_PNPM_IGNORED_BUILDS`)이 나면 3d R1 처럼 `pnpm-workspace.yaml` `allowBuilds` 에 그 패키지를 `false` 로 적고 다시 돈다(2026-10-08 확인: 새 의존 중 설치 스크립트가 있는 것은 없다).

- [ ] **Step 3: 데코레이터 메타데이터 가드 테스트를 쓴다**

`packages/admin-server/src/decorator-metadata.test.ts`:

```ts
import 'reflect-metadata'
import { Injectable } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { expect, it } from 'vitest'

@Injectable()
class Dependency {
  readonly name = 'dependency'
}

@Injectable()
class Consumer {
  constructor(readonly dependency: Dependency) {}
}

it('🔴 vitest 변환이 design:paramtypes 를 낸다 — 없으면 클래스 생성자 주입이 조용히 undefined 가 된다', async () => {
  expect(Reflect.getMetadata('design:paramtypes', Consumer)).toEqual([Dependency])
  const ref = await Test.createTestingModule({ providers: [Dependency, Consumer] }).compile()
  expect(ref.get(Consumer).dependency.name).toBe('dependency')
  await ref.close()
})
```

Run: `pnpm --filter @ssworks/admin-server test -- decorator-metadata`
Expected: PASS (스펙 R1 — 플랜 전 실측과 같다). FAIL 이면 멈추고 보고한다(생성자 주입 규칙을 바꿔야 한다).

- [ ] **Step 4: env 테스트를 쓴다**

`packages/admin-server/src/config/env.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDotEnv, parseDotEnv, requireEnv } from './env.js'

describe('parseDotEnv', () => {
  it('주석 · 빈 줄 · 등호 없는 줄을 건너뛴다', () => {
    expect(parseDotEnv('# 주석\n\nNOEQ\nA=1\r\nB = two \n')).toEqual({ A: '1', B: 'two' })
  })

  it('첫 = 뒤는 전부 값이다 — base64 패딩이 남는다', () => {
    expect(parseDotEnv('SECRET=abc==\n')).toEqual({ SECRET: 'abc==' })
  })

  it('양끝 따옴표를 벗긴다', () => {
    expect(parseDotEnv(`A="x y"\nB='z'`)).toEqual({ A: 'x y', B: 'z' })
  })

  it('빈 값은 넣지 않는다', () => {
    expect(parseDotEnv('A=\nB=""\n')).toEqual({})
  })

  it('🔴 머리의 UTF-8 BOM 을 벗긴다 — 메모장이 저장한 .env 의 첫 키가 사라지지 않는다', () => {
    expect(parseDotEnv('﻿DB_HOST=db\nDB_USER=app\n')).toEqual({ DB_HOST: 'db', DB_USER: 'app' })
  })
})

describe('loadDotEnv', () => {
  const keys = ['AK_ENV_A', 'AK_ENV_B']
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ak-env-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    for (const key of keys) delete process.env[key]
  })

  it('파일 값을 채우되 이미 있는 키는 덮지 않는다', () => {
    const file = join(dir, '.env')
    writeFileSync(file, 'AK_ENV_A=from-file\nAK_ENV_B=from-file\n')
    process.env.AK_ENV_A = 'from-process'
    loadDotEnv(file)
    expect(process.env.AK_ENV_A).toBe('from-process')
    expect(process.env.AK_ENV_B).toBe('from-file')
  })

  it('URL 인자를 받는다', () => {
    const file = join(dir, '.env')
    writeFileSync(file, 'AK_ENV_A=from-url\n')
    loadDotEnv(pathToFileURL(file))
    expect(process.env.AK_ENV_A).toBe('from-url')
  })

  it('없는 파일은 조용히 넘긴다 — 운영 컨테이너에는 .env 가 없다', () => {
    expect(() => loadDotEnv(join(dir, 'none.env'))).not.toThrow()
  })

  it('🔴 디렉터리 경로는 던진다 — 읽어야 할 파일을 못 읽은 채 기동하지 않는다', () => {
    const sub = join(dir, 'is-dir')
    mkdirSync(sub)
    expect(() => loadDotEnv(sub)).toThrow()
  })
})

describe('requireEnv', () => {
  afterEach(() => {
    delete process.env.AK_REQ_SET
  })

  it('없는 키의 이름만 담고 값은 담지 않는다', () => {
    process.env.AK_REQ_SET = 'secret-value'
    let message = ''
    try {
      requireEnv(['AK_REQ_SET', 'AK_REQ_MISSING_1', 'AK_REQ_MISSING_2'])
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('필수 환경변수가 없다: AK_REQ_MISSING_1, AK_REQ_MISSING_2')
  })

  it('다 있으면 통과', () => {
    process.env.AK_REQ_SET = 'x'
    expect(() => requireEnv(['AK_REQ_SET'])).not.toThrow()
  })
})
```

`packages/admin-server/src/config/timezone.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { assertUtcTimezone, isEffectiveUtc } from './timezone.js'

const original = process.env.TZ

afterEach(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

describe('isEffectiveUtc', () => {
  const winter = new Date('2026-01-15T00:00:00.000Z')

  it('UTC 면 참', () => {
    process.env.TZ = 'UTC'
    expect(isEffectiveUtc(winter)).toBe(true)
  })

  it('Asia/Seoul 이면 거짓', () => {
    process.env.TZ = 'Asia/Seoul'
    expect(isEffectiveUtc(winter)).toBe(false)
  })

  it('🔴 Europe/London 은 겨울에 재도 거짓 — 7월 1일 시점이 서머타임을 잡는다', () => {
    process.env.TZ = 'Europe/London'
    expect(isEffectiveUtc(winter)).toBe(false)
  })
})

describe('assertUtcTimezone', () => {
  it('UTC 가 아니면 진입점 이름을 담아 던진다', () => {
    process.env.TZ = 'Asia/Seoul'
    expect(() => assertUtcTimezone('마이그레이션 러너')).toThrow(
      /^마이그레이션 러너: 프로세스 실효 타임존이 UTC 가 아니다/,
    )
  })

  it('UTC 면 통과', () => {
    process.env.TZ = 'UTC'
    expect(() => assertUtcTimezone('api')).not.toThrow()
  })
})
```

- [ ] **Step 5: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- config`
Expected: FAIL — `Cannot find module './env.js'` · `'./timezone.js'`.

- [ ] **Step 6: 구현**

`packages/admin-server/src/config/env.ts`:

```ts
import { readFileSync } from 'node:fs'

// 정본: hangang-home apps/api/src/core/config/env.ts + ssworks-gise-home apps/api/src/core/config/env.ts
// 바꾼 점:
//  - `.env` 경로를 인자로 받는다. 정본은 자기 파일 위치에서 저장소 루트까지 단계를 셌는데 패키지는 그 깊이를 모른다.
//    🔴 `process.cwd()` 를 기본값으로 두지 않는다 — 실행 위치에 따라 조용히 빗나간다(정본 주석).
//  - 없는 파일(`ENOENT`)만 조용히 넘기고 그 밖의 읽기 오류는 던진다(gise). hangang 은 모든 오류를 삼켰다.
//  - 머리의 UTF-8 BOM 을 벗긴다 — 메모장이 저장한 `.env` 의 첫 키가 사라졌다(스펙 R4).
//  - 의존성을 쓰지 않는다 — 자격증명이 지나는 경로에 서드파티를 넣지 않는다(hangang).

/** `.env` 원문을 파싱한다. 순수 함수 — 파일도 `process.env` 도 건드리지 않는다. */
export function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.replace(/^﻿/, '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sep = trimmed.indexOf('=')
    if (sep < 0) continue
    const key = trimmed.slice(0, sep).trim()
    // 🔴 첫 '=' 뒤는 전부 값이다. base64 시크릿의 '=' 패딩이 잘리면 JWT 서명이 조용히 갈린다(gise).
    const value = trimmed
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (key && value) out[key] = value
  }
  return out
}

/**
 * `.env` 를 `process.env` 에 채운다.
 *
 * 🔴 이미 있는 키를 덮지 않는다 — 운영에서는 시크릿 주입이 `process.env` 를 먼저 채운다.
 * 🔴 값을 로그 · 오류 메시지에 담지 않는다.
 */
export function loadDotEnv(file: string | URL): void {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    // 운영 컨테이너에는 `.env` 가 없다 — 없는 것이 정상이다. 권한 · 디렉터리 오류까지 삼키면 읽어야 할 파일을 못 읽은
    // 채 기동이 성공하고, 증상은 나중에 "환경변수가 없다" 로만 나타난다(gise).
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const [key, value] of Object.entries(parseDotEnv(raw))) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

/** 없는 키의 **이름만** 담아 던진다. 🔴 값은 담지 않는다. */
export function requireEnv(keys: readonly string[]): void {
  const missing = keys.filter((key) => !process.env[key])
  if (missing.length > 0) throw new Error(`필수 환경변수가 없다: ${missing.join(', ')}`)
}
```

`packages/admin-server/src/config/timezone.ts`:

```ts
// 정본: hangang-home apps/api/src/core/config/timezone.ts(최종 수정 A4 — 환경변수가 아니라 실효 타임존을 잰다)
// 바꾼 점: 오류 문구의 사내 문서 참조(부록 C · §6-1)를 뺐다.
//
// 🔴 환경변수 `TZ` 가 아니라 **실효 오프셋**을 잰다. `TZ` 를 보면 `.env` 를 먼저 읽었는지에 따라 가드가 자기가 방금 심은
//    값을 읽는다. Node 는 `process.env.TZ` 런타임 대입을 즉시 반영한다(hangang 실측, Node 24 / Windows).
// 🔴 세 시점(지금 · 1월 1일 · 7월 1일)을 잰다. 한 시점이면 `Europe/London` 이 겨울에 통과하고 여름에 한 시간 어긋난다.
// 🔴 DB 를 만지는 모든 진입점(앱 · 마이그레이션 러너 · 시드)이 이 한 함수를 부른다. 커넥터 `timezone` 옵션으로는 안
//    막힌다 — 러너가 KST 로 돌면 시드가 9시간 어긋난 바이트를 남긴다(hangang).

function effectiveOffsets(now: Date): number[] {
  const year = now.getUTCFullYear()
  return [
    now.getTimezoneOffset(),
    new Date(Date.UTC(year, 0, 1)).getTimezoneOffset(),
    new Date(Date.UTC(year, 6, 1)).getTimezoneOffset(),
  ]
}

/** 이 프로세스가 연중 UTC 로 도는가. 🔴 환경변수가 아니라 동작을 본다. */
export function isEffectiveUtc(now: Date = new Date()): boolean {
  return effectiveOffsets(now).every((offset) => offset === 0)
}

/** UTC 가 아니면 던진다. `context` 는 진입점 이름이다 — 메시지에만 쓴다. */
export function assertUtcTimezone(context: string): void {
  if (isEffectiveUtc()) return
  const observed = effectiveOffsets(new Date()).join(', ')
  throw new Error(
    `${context}: 프로세스 실효 타임존이 UTC 가 아니다 (getTimezoneOffset: ${observed}). ` +
      "TZ=UTC 로 실행한다(PowerShell: $env:TZ = 'UTC')",
  )
}
```

`packages/admin-server/src/index.ts` 전체(Task 8 에서 최종 모양으로 바꾼다):

```ts
// @ssworks/admin-server — 관리자 API 공통 NestJS 모듈 (Phase 2).
export { parseDotEnv, loadDotEnv, requireEnv } from './config/env.js'
export { isEffectiveUtc, assertUtcTimezone } from './config/timezone.js'
```

Delete `packages/admin-server/src/index.test.ts`(골격 확인 테스트 — `ADMIN_SERVER_PHASE` 가 사라진다).

- [ ] **Step 7: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test`
Expected: PASS — decorator-metadata 1 · env 11 · timezone 5.

- [ ] **Step 8: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server
pnpm check
git add packages/admin-server pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(admin-server): 패키지 바탕 — Nest 12 · kysely 0.29 peer, env · TZ 유틸

- peer: @nestjs/* ^12 · kysely ^0.29 · mariadb · dialect ^0.2 · reflect-metadata · rxjs, dependencies: cookie-parser
- exports: . · ./runner · ./migrations/*, engines node >=22, *.db.test.ts 는 pnpm check 에서 뺀다
- loadDotEnv(file) · parseDotEnv(BOM 제거) · requireEnv · assertUtcTimezone(세 시점 실효 오프셋)
- vitest 가 design:paramtypes 를 내는지 지키는 테스트

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

Expected: `pnpm check` 초록.

---

### Task 2: DB 연결 · Kysely · 플러그인 · JSON 읽기

**Files:**

- Create: `packages/admin-server/src/database/connection.ts` · `connection.test.ts`
- Create: `packages/admin-server/src/database/boolean-transform.plugin.ts` · `boolean-transform.plugin.test.ts`
- Create: `packages/admin-server/src/database/kysely.ts` · `kysely.test.ts`
- Create: `packages/admin-server/src/database/json.ts` · `json.test.ts`

**Interfaces:**

- Produces:
  - `interface AdminDbConnection { host: string; port?: number; user: string; password: string; database: string; connectionLimit?: number; acquireTimeout?: number }`
  - `poolEnvInt(name: string, fallback: number, env?: Readonly<Record<string, string | undefined>>): number`
  - `adminDbConnectionFromEnv(env?): AdminDbConnection` · `adminPoolConfig(connection): PoolConfig`
  - `class BooleanTransformPlugin implements KyselyPlugin`
  - `adminKyselyPlugins(): KyselyPlugin[]` · `createAdminKysely<DB>(connection: AdminDbConnection): Kysely<DB>`(Task 7 이 기본 타입 인자 `= AdminDatabase` 를 더한다)
  - `readJsonColumn(value: unknown): unknown`

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/database/connection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  adminDbConnectionFromEnv,
  adminPoolConfig,
  poolEnvInt,
  type AdminDbConnection,
} from './connection.js'

describe('poolEnvInt', () => {
  it('없거나 빈 값이면 기본값', () => {
    expect(poolEnvInt('X', 7, {})).toBe(7)
    expect(poolEnvInt('X', 7, { X: '  ' })).toBe(7)
  })

  it('양의 정수를 읽는다', () => {
    expect(poolEnvInt('X', 7, { X: '20' })).toBe(20)
  })

  it.each(['ten', '0', '-1', '1.5', 'NaN'])('🔴 %s 는 던지고 값을 메시지에 담지 않는다', (raw) => {
    expect(() => poolEnvInt('DB_PORT', 3306, { DB_PORT: raw })).toThrow(
      'DB_PORT 은 양의 정수여야 한다',
    )
    try {
      poolEnvInt('DB_PORT', 3306, { DB_PORT: raw })
    } catch (error) {
      expect((error as Error).message).not.toContain(raw)
    }
  })
})

describe('adminDbConnectionFromEnv', () => {
  const env = { DB_HOST: 'db', DB_USER: 'app', DB_PASSWORD: 's3cret', DB_NAME: 'admin' }

  it('기본값과 함께 읽는다', () => {
    expect(adminDbConnectionFromEnv(env)).toEqual({
      host: 'db',
      port: 3306,
      user: 'app',
      password: 's3cret',
      database: 'admin',
      connectionLimit: 10,
      acquireTimeout: 10_000,
    })
  })

  it('숫자 env 를 읽는다', () => {
    const connection = adminDbConnectionFromEnv({
      ...env,
      DB_PORT: '33306',
      DB_POOL_LIMIT: '4',
      DB_ACQUIRE_TIMEOUT_MS: '2000',
    })
    expect(connection).toMatchObject({ port: 33306, connectionLimit: 4, acquireTimeout: 2000 })
  })

  it('🔴 빠진 이름을 모아 던지고 값은 담지 않는다', () => {
    expect(() => adminDbConnectionFromEnv({ DB_PASSWORD: 's3cret' })).toThrow(
      '필수 환경변수가 없다: DB_HOST, DB_USER, DB_NAME',
    )
  })
})

describe('adminPoolConfig', () => {
  const connection: AdminDbConnection = { host: 'h', user: 'u', password: 'p', database: 'd' }

  it('🔴 안전 옵션을 고정한다 — timezone Z · 숫자 옵션 넷 · logParam false', () => {
    expect(adminPoolConfig(connection)).toEqual({
      host: 'h',
      port: 3306,
      user: 'u',
      password: 'p',
      database: 'd',
      timezone: 'Z',
      bigIntAsNumber: false,
      decimalAsNumber: false,
      insertIdAsNumber: false,
      checkNumberRange: true,
      logParam: false,
      connectionLimit: 10,
      acquireTimeout: 10_000,
    })
  })

  it('접속 정보에 끼워 넣은 다른 키는 옮기지 않는다', () => {
    const config = adminPoolConfig({ ...connection, logParam: true } as AdminDbConnection)
    expect(config.logParam).toBe(false)
  })
})
```

`packages/admin-server/src/database/boolean-transform.plugin.test.ts`:

```ts
import type { PluginTransformResultArgs, UnknownRow } from 'kysely'
import { describe, expect, it } from 'vitest'
import { BooleanTransformPlugin } from './boolean-transform.plugin.js'

async function transform(rows: UnknownRow[]): Promise<UnknownRow[]> {
  const result = await new BooleanTransformPlugin().transformResult({
    queryId: { queryId: 'q' },
    result: { rows },
  } as unknown as PluginTransformResultArgs)
  return result.rows
}

describe('BooleanTransformPlugin', () => {
  it('is_ · has_ · isX · hasX 의 0/1 을 boolean 으로', async () => {
    expect(await transform([{ is_revoked: 1, has_child: 0, isDefault: 1, hasX: 0 }])).toEqual([
      { is_revoked: true, has_child: false, isDefault: true, hasX: false },
    ])
  })

  it('접두를 우연히 품은 이름은 그대로', async () => {
    const row = { island: 1, hash: 0, history: 1, is: 1, isolated: 0 }
    expect(await transform([row])).toEqual([row])
  })

  it('0/1 이 아닌 값은 그대로', async () => {
    const row = { is_x: 2, is_y: null, is_z: '1' }
    expect(await transform([row])).toEqual([row])
  })
})
```

`packages/admin-server/src/database/kysely.test.ts`:

```ts
import {
  CamelCasePlugin,
  type PluginTransformResultArgs,
  type QueryResult,
  type UnknownRow,
} from 'kysely'
import { describe, expect, it } from 'vitest'
import { BooleanTransformPlugin } from './boolean-transform.plugin.js'
import { adminKyselyPlugins } from './kysely.js'

describe('adminKyselyPlugins', () => {
  it('🔴 [BooleanTransform, CamelCase] 순서 — boolean 판정이 snake 원본 키를 먼저 본다', () => {
    const plugins = adminKyselyPlugins()
    expect(plugins).toHaveLength(2)
    expect(plugins[0]).toBeInstanceOf(BooleanTransformPlugin)
    expect(plugins[1]).toBeInstanceOf(CamelCasePlugin)
  })

  it('🔴 JSON 컬럼 안쪽의 snake 키를 바꾸지 않는다(maintainNestedObjectKeys — crm 사고)', async () => {
    let result: QueryResult<UnknownRow> = {
      rows: [{ is_default: 1, extra_data: { inner_key: { deep_key: 1 } } }],
    }
    for (const plugin of adminKyselyPlugins()) {
      result = await plugin.transformResult({
        queryId: { queryId: 'q' },
        result,
      } as unknown as PluginTransformResultArgs)
    }
    expect(result.rows).toEqual([{ isDefault: true, extraData: { inner_key: { deep_key: 1 } } }])
  })

  it('부를 때마다 새 인스턴스', () => {
    expect(adminKyselyPlugins()[0]).not.toBe(adminKyselyPlugins()[0])
  })
})
```

`packages/admin-server/src/database/json.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readJsonColumn } from './json.js'

describe('readJsonColumn', () => {
  it('문자열이면 파싱한다', () => {
    expect(readJsonColumn('["*"]')).toEqual(['*'])
  })

  it('드라이버가 이미 파싱한 값은 그대로', () => {
    const value = { a: [1] }
    expect(readJsonColumn(value)).toBe(value)
  })

  it('🔴 잘못된 JSON 은 삼키지 않고 던진다', () => {
    expect(() => readJsonColumn('{bad')).toThrow(SyntaxError)
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- database`
Expected: FAIL — `Cannot find module './connection.js'` 등 넷.

- [ ] **Step 3: 구현**

`packages/admin-server/src/database/connection.ts`:

```ts
import type { PoolConfig } from 'mariadb'

// 정본: hangang-home apps/api/src/core/database/pool-options.ts · database.module.ts(createDb),
//       ssworks-gise-home apps/api/src/core/database/pool.ts
// 바꾼 점:
//  - 접속 정보를 `process.env` 에서 직접 읽지 않고 `AdminDbConnection` 으로 받는다. env 를 읽는 자리는
//    `adminDbConnectionFromEnv()` 하나다. 이름은 hangang(`DB_NAME`) — gise 처럼 `DB_DATABASE` 를 쓰는 프로젝트는
//    객체를 직접 만들어 넘긴다.
//  - 🔴 이 파일은 Nest 를 import 하지 않는다 — 마이그레이션 러너(kysely.config.ts)가 `@ssworks/admin-server/runner`
//    로 읽는다(정본 규약 그대로).

/** DB 접속 정보. 풀 안전 옵션은 `adminPoolConfig()` 가 고정하고 여기서는 바꾸지 못한다. */
export interface AdminDbConnection {
  host: string
  /** 기본 3306 */
  port?: number
  user: string
  password: string
  database: string
  /** 풀 크기. 기본 10 — `connectionLimit × API 프로세스 수` 가 DB `max_connections` 여유 안에 들어야 한다(hangang) */
  connectionLimit?: number
  /** 풀에서 연결을 기다리는 한도(ms). 기본 10 000 */
  acquireTimeout?: number
}

type Env = Readonly<Record<string, string | undefined>>

const DEFAULT_PORT = 3306
const DEFAULT_CONNECTION_LIMIT = 10
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000

/**
 * 풀 숫자 env 를 읽는다. 없거나 비면 기본값, 있으면 양의 정수여야 한다.
 *
 * 🔴 `Number('ten')` 은 `NaN` 을 그대로 `createPool()` 에 넘기고 드라이버는 던지지 않는다 — 기동은 성공하고 증상은
 *    부하가 걸린 뒤에 나온다(hangang 최종 수정 A9-1).
 * 🔴 값을 메시지에 담지 않는다 — `DB_PORT` 는 자격증명과 같은 줄에 있다.
 */
export function poolEnvInt(name: string, fallback: number, env: Env = process.env): number {
  const raw = env[name]
  if (raw == null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} 은 양의 정수여야 한다`)
  return parsed
}

const REQUIRED_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const

/** `DB_HOST` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` · `DB_POOL_LIMIT` · `DB_ACQUIRE_TIMEOUT_MS` 를 읽는다. */
export function adminDbConnectionFromEnv(env: Env = process.env): AdminDbConnection {
  const missing = REQUIRED_KEYS.filter((key) => !env[key])
  // 🔴 이름만 담는다. 값은 담지 않는다.
  if (missing.length > 0) throw new Error(`필수 환경변수가 없다: ${missing.join(', ')}`)
  const value = (key: (typeof REQUIRED_KEYS)[number]): string => env[key] ?? ''
  return {
    host: value('DB_HOST'),
    port: poolEnvInt('DB_PORT', DEFAULT_PORT, env),
    user: value('DB_USER'),
    password: value('DB_PASSWORD'),
    database: value('DB_NAME'),
    connectionLimit: poolEnvInt('DB_POOL_LIMIT', DEFAULT_CONNECTION_LIMIT, env),
    acquireTimeout: poolEnvInt('DB_ACQUIRE_TIMEOUT_MS', DEFAULT_ACQUIRE_TIMEOUT_MS, env),
  }
}

/** 풀 옵션의 단일 출처 — 앱과 마이그레이션 러너가 같은 값을 쓴다. 접속 정보 밖의 키는 옮기지 않는다. */
export function adminPoolConfig(connection: AdminDbConnection): PoolConfig {
  return {
    host: connection.host,
    port: connection.port ?? DEFAULT_PORT,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    // 🔴 'auto' 가 아니다 — 머신 IANA 이름을 세션에 강제해 tz 테이블 없는 인스턴스에서 접속이 실패한다(hangang).
    timezone: 'Z',
    // 🔴 넷 다 명시한다. BIGINT 는 bigint 로, DECIMAL 은 문자열로 — 숫자로 바꾸면 정밀도가 조용히 깎인다.
    //    checkNumberRange 는 앞의 셋 중 하나가 true 일 때만 동작한다(gise 실측) — 그래도 명시한다.
    bigIntAsNumber: false,
    decimalAsNumber: false,
    insertIdAsNumber: false,
    checkNumberRange: true,
    // 🔴 드라이버가 SQL 과 바인딩 값을 오류 메시지에 붙이지 않게 한다(hangang 최종 수정 A2). 기본 true 면 argon2 해시와
    //    refresh 토큰 해시가 5xx 로그로 나간다. 진단은 오류 `code` 와 스택이면 된다.
    logParam: false,
    connectionLimit: connection.connectionLimit ?? DEFAULT_CONNECTION_LIMIT,
    acquireTimeout: connection.acquireTimeout ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
  }
}
```

`packages/admin-server/src/database/boolean-transform.plugin.ts`:

```ts
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely'

// 정본: ssworks-gise-home apps/api/src/core/database/plugins/boolean-transform.plugin.ts(정규식판)
// 바꾼 점: 없음. hangang · crm 의 허용목록판은 버렸다.
//
// 🔴 tinyint(1) → boolean. **컬럼명 접두 `is` / `has` 로 판단한다.** MariaDB 에 boolean 타입은 없다 — `BOOLEAN` 은
//    `TINYINT(1)` 별칭이고 드라이버는 0/1 을 준다. 타입만 boolean 이고 값이 0 이면 예외 없이 조용히 틀린다.
// 🔴 허용목록을 두지 않는다. 예외를 등록하기 시작하면 규칙이 규칙이 아니게 된다 — 컬럼명을 고친다.
// `is_revoked`(snake)와 `isRevoked`(camel)를 모두 받는다 — CamelCasePlugin 과의 순서가 바뀌어도 조용히 죽지 않게.
// `island` · `hash` · `history` 처럼 접두를 우연히 품은 이름은 걸리지 않는다.
const BOOLEAN_COLUMN = /^(?:is|has)(?:_[a-z0-9]|[A-Z0-9])/

export class BooleanTransformPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return args.node
  }

  transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return Promise.resolve({
      ...args.result,
      rows: args.result.rows.map((row) => this.transformRow(row)),
    })
  }

  private transformRow(row: UnknownRow): UnknownRow {
    const out: UnknownRow = {}
    for (const [key, value] of Object.entries(row)) {
      out[key] = BOOLEAN_COLUMN.test(key) && (value === 0 || value === 1) ? Boolean(value) : value
    }
    return out
  }
}
```

`packages/admin-server/src/database/kysely.ts`:

```ts
import { MariadbDialect } from '@kim5257/kysely-mariadb-dialect'
import { CamelCasePlugin, Kysely, type KyselyPlugin } from 'kysely'
import { createPool } from 'mariadb'
import { BooleanTransformPlugin } from './boolean-transform.plugin.js'
import { adminPoolConfig, type AdminDbConnection } from './connection.js'

// 정본: hangang-home apps/api/src/core/database/database.module.ts(createDb) · gise database.module.ts(플러그인 순서 주석)
//       + crm kysely-plugins.ts(maintainNestedObjectKeys)
// 바꾼 점: 접속 정보를 인자로 받는다. Nest 를 import 하지 않는다(러너가 읽는다).

/**
 * 앱과 마이그레이션 러너가 함께 쓰는 플러그인. 부를 때마다 새 인스턴스.
 *
 * 🔴 순서가 의미를 갖는다 — Kysely 는 transformResult 를 배열 순서대로 돈다. boolean 판정이 snake 원본 키를 먼저 본다.
 * 🔴 `maintainNestedObjectKeys: true` — 없으면 JSON 컬럼 안쪽의 snake 키까지 camel 로 바뀐다(crm 2026-09-15 사고).
 *    hangang · gise 의 앱과 러너에는 이 옵션이 없었다.
 */
export function adminKyselyPlugins(): KyselyPlugin[] {
  return [new BooleanTransformPlugin(), new CamelCasePlugin({ maintainNestedObjectKeys: true })]
}

/**
 * 🔴 앱(`AdminServerModule`)과 마이그레이션 러너(`kysely.config.ts`)가 **같은 이 함수**로 만든다. 풀 옵션 · 플러그인이
 *    두 벌이 되면 갈리고, 갈린 쪽이 조용히 틀린 바이트를 쓴다.
 * 🔴 풀은 만들자마자 백그라운드로 연결을 시도한다(gise). 다 쓰면 `destroy()` 로 닫는다.
 */
export function createAdminKysely<DB>(connection: AdminDbConnection): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new MariadbDialect({ pool: createPool(adminPoolConfig(connection)) }),
    plugins: adminKyselyPlugins(),
  })
}
```

`packages/admin-server/src/database/json.ts`:

```ts
// 정본: ssworks-gise-home apps/api/src/core/database/json-column.ts
// 바꾼 점: 없음.

/**
 * MariaDB `JSON` 컬럼의 SELECT 값을 읽는다.
 *
 * `mariadb` 드라이버는 `autoJsonMap` 기본값 때문에 JSON 컬럼(LONGTEXT 별칭 + json 확장 메타데이터)을 **이미 파싱한
 * 값**으로 줄 때가 있다. 문자열이라고 가정하지 않는다 — 테이블 타입의 읽기 타입이 `unknown` 인 이유다.
 *
 * 🔴 잘못된 JSON 문자열은 삼키지 않는다 — `JSON.parse` 가 그대로 던진다. 반환값은 형태를 보장하지 않으므로 호출부가
 *    곧바로 zod 로 검증한다.
 */
export function readJsonColumn(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}
```

- [ ] **Step 4: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- database`
Expected: PASS — connection 12 · boolean 3 · kysely 3 · json 3.

- [ ] **Step 5: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/database
pnpm check
git add packages/admin-server/src/database
git commit -m "$(cat <<'EOF'
feat(admin-server): DB 연결 — 풀 안전 옵션 고정, createAdminKysely, 플러그인, readJsonColumn

- adminPoolConfig: timezone Z · 숫자 옵션 넷 · logParam false 고정, adminDbConnectionFromEnv(이름만 담아 던짐)
- adminKyselyPlugins: [BooleanTransform(정규식판), CamelCase(maintainNestedObjectKeys)]
- createAdminKysely: 앱과 마이그레이션 러너가 같은 함수

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 드라이버 오류 매핑 · 쿼리 봉투

**Files:**

- Create: `packages/admin-server/src/database/map-error.ts` · `map-error.test.ts`
- Create: `packages/admin-server/src/database/run.ts` · `run.test.ts`

**Interfaces:**

- Consumes: admin-shared `BusinessError` · `CommonErrorCodes`
- Produces: `mapError(error: unknown): BusinessError` · `runQuery<T>(fn: () => Promise<T>): Promise<T>` · `runWriteTransaction<DB, T>(db: Kysely<DB>, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T>`

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/database/map-error.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { mapError } from './map-error.js'

function driverError(code: string): Error {
  return Object.assign(new Error(`driver ${code}`), { code, errno: 1 })
}

describe('mapError', () => {
  it.each([
    ['ER_DUP_ENTRY', CommonErrorCodes.ERR_COMMON_DUPLICATED, '이미 존재하는 값입니다.'],
    [
      'ER_ROW_IS_REFERENCED_2',
      CommonErrorCodes.ERR_COMMON_IN_USE,
      '다른 데이터가 참조하고 있어 처리할 수 없습니다.',
    ],
    ['ER_NO_REFERENCED_ROW_2', CommonErrorCodes.ERR_COMMON_BAD_REQUEST, '참조 대상이 없습니다.'],
    [
      'ER_LOCK_DEADLOCK',
      CommonErrorCodes.ERR_COMMON_CONFLICT,
      '동시 처리 충돌입니다. 다시 시도해 주세요.',
    ],
    [
      'ER_LOCK_WAIT_TIMEOUT',
      CommonErrorCodes.ERR_COMMON_TIMEOUT,
      '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    ],
    [
      'ETIMEDOUT',
      CommonErrorCodes.ERR_COMMON_TIMEOUT,
      '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    ],
    ['ECONNREFUSED', CommonErrorCodes.ERR_COMMON_UNAVAILABLE, '데이터베이스에 연결할 수 없습니다.'],
    [
      'ER_GET_CONNECTION_TIMEOUT',
      CommonErrorCodes.ERR_COMMON_UNAVAILABLE,
      '데이터베이스에 연결할 수 없습니다.',
    ],
  ])('%s → %s', (driverCode, code, message) => {
    const original = driverError(driverCode)
    const mapped = mapError(original)
    expect(mapped).toBeInstanceOf(BusinessError)
    expect(mapped.code).toBe(code)
    expect(mapped.message).toBe(message)
    expect(mapped.details).toBeUndefined()
    // 🔴 원본은 cause 로만 — 응답에는 실리지 않고 5xx 로그로 간다
    expect(mapped.cause).toBe(original)
  })

  it.each([
    ['일반 오류', new Error('x')],
    ['문자열', 'boom'],
    ['null', null],
    ['프로토타입 키를 code 로 가진 객체', { code: 'toString' }],
  ])('모르는 오류(%s)는 ERR_COMMON_INTERNAL, 원본은 cause', (_label, original) => {
    const mapped = mapError(original)
    expect(mapped.code).toBe(CommonErrorCodes.ERR_COMMON_INTERNAL)
    expect(mapped.message).toBe('일시적인 오류가 발생했습니다.')
    expect(mapped.cause).toBe(original)
  })

  it('BusinessError 는 그대로 돌려준다', () => {
    const error = new BusinessError(CommonErrorCodes.ERR_NO_TEAM, '팀이 없습니다.')
    expect(mapError(error)).toBe(error)
  })
})
```

`packages/admin-server/src/database/run.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Kysely, Transaction } from 'kysely'
import { describe, expect, it } from 'vitest'
import { runQuery, runWriteTransaction } from './run.js'

const dup = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' })

/** `db.transaction().execute(fn)` 만 흉내 낸다 — 진짜 롤백은 DB 층 테스트(Task 9)가 잰다 */
function fakeDb(trx: unknown): Kysely<unknown> {
  return {
    transaction: () => ({
      execute: <T>(fn: (t: Transaction<unknown>) => Promise<T>) => fn(trx as Transaction<unknown>),
    }),
  } as unknown as Kysely<unknown>
}

describe('runQuery', () => {
  it('값을 그대로 돌려준다', async () => {
    await expect(runQuery(async () => 42)).resolves.toBe(42)
  })

  it('드라이버 오류를 코드 있는 BusinessError 로', async () => {
    await expect(
      runQuery(async () => {
        throw dup
      }),
    ).rejects.toMatchObject({ code: CommonErrorCodes.ERR_COMMON_DUPLICATED, cause: dup })
  })
})

describe('runWriteTransaction', () => {
  it('트랜잭션 객체를 넘기고 값을 돌려준다', async () => {
    const trx = { marker: 'trx' }
    await expect(runWriteTransaction(fakeDb(trx), async (t) => t)).resolves.toBe(trx)
  })

  it('안에서 던진 드라이버 오류를 바꾼다', async () => {
    await expect(
      runWriteTransaction(fakeDb({}), async () => {
        throw dup
      }),
    ).rejects.toMatchObject({ code: CommonErrorCodes.ERR_COMMON_DUPLICATED })
  })

  it('BusinessError 는 그대로 통과한다', async () => {
    const error = new BusinessError(
      CommonErrorCodes.ERR_COMMON_REVISION_CONFLICT,
      '다른 곳에서 먼저 바뀌었습니다.',
    )
    await expect(
      runWriteTransaction(fakeDb({}), async () => {
        throw error
      }),
    ).rejects.toBe(error)
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- map-error run`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`packages/admin-server/src/database/map-error.ts`:

```ts
import { BusinessError, CommonErrorCodes, type CommonErrorCode } from '@ssworks/admin-shared'

// 정본: hangang-home apps/api/src/core/utils/error.util.ts(mapError · 매핑 표 · 원본 cause 보존)
//       + ssworks-axion-admin(ER_ROW_IS_REFERENCED_2) + ssworks-gise-home apps/api/src/core/database/run.ts
// 바꾼 점:
//  - `BusinessException extends HttpException` 대신 admin-shared `BusinessError`(Nest 무의존). 상태는 예외 필터가 코드표로
//    정한다 — 같은 코드가 두 상태로 나가지 않는다.
//  - FK restrict(`ER_ROW_IS_REFERENCED_2`)는 `ERR_COMMON_IN_USE` — hangang 은 CONFLICT 였다. admin-shared 에 전용 코드가 있다.
//  - 풀 대기 초과(`ER_GET_CONNECTION_TIMEOUT`, mariadb 45028)를 UNAVAILABLE 로 더했다.
//  - 🔴 `safeExecute` 는 옮기지 않는다 — 매핑 표를 보지 않아 락 타임아웃이 INTERNAL 로 뭉개졌다(hangang 주석).
//
// 드라이버 오류는 `code` 문자열로 가른다 — mariadb 3.5 `SqlError` 는 서버 오류면 `ErrorCodes[errno]`, 클라이언트 오류
// (45000~45999)면 그 키를 `code` 에 싣는다.
// 🔴 UNIQUE 를 도메인 코드로 바꾸는 일(팀 이름 → ERR_DUPLICATE_TEAM_NAME)은 그 모듈이 제약 이름(snake — 스펙 R3)을 보고
//    여기 오기 전에 한다.

const MAPPINGS: ReadonlyMap<string, { code: CommonErrorCode; message: string }> = new Map([
  [
    'ER_DUP_ENTRY',
    { code: CommonErrorCodes.ERR_COMMON_DUPLICATED, message: '이미 존재하는 값입니다.' },
  ],
  [
    'ER_ROW_IS_REFERENCED_2',
    {
      code: CommonErrorCodes.ERR_COMMON_IN_USE,
      message: '다른 데이터가 참조하고 있어 처리할 수 없습니다.',
    },
  ],
  [
    'ER_NO_REFERENCED_ROW_2',
    { code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST, message: '참조 대상이 없습니다.' },
  ],
  // 🔴 데드락(1213) · 락 대기 초과(1205)는 긴 트랜잭션의 증상이다(hangang §8-5).
  [
    'ER_LOCK_DEADLOCK',
    {
      code: CommonErrorCodes.ERR_COMMON_CONFLICT,
      message: '동시 처리 충돌입니다. 다시 시도해 주세요.',
    },
  ],
  [
    'ER_LOCK_WAIT_TIMEOUT',
    {
      code: CommonErrorCodes.ERR_COMMON_TIMEOUT,
      message: '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    },
  ],
  [
    'ETIMEDOUT',
    {
      code: CommonErrorCodes.ERR_COMMON_TIMEOUT,
      message: '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    },
  ],
  [
    'ECONNREFUSED',
    {
      code: CommonErrorCodes.ERR_COMMON_UNAVAILABLE,
      message: '데이터베이스에 연결할 수 없습니다.',
    },
  ],
  [
    'ER_GET_CONNECTION_TIMEOUT',
    {
      code: CommonErrorCodes.ERR_COMMON_UNAVAILABLE,
      message: '데이터베이스에 연결할 수 없습니다.',
    },
  ],
])

function driverCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/** 드라이버 오류 → 코드 있는 `BusinessError`. `BusinessError` 는 그대로. 원본은 `cause` 로만 간다. */
export function mapError(error: unknown): BusinessError {
  if (error instanceof BusinessError) return error
  const code = driverCode(error)
  const mapping = code === undefined ? undefined : MAPPINGS.get(code)
  if (mapping) return new BusinessError(mapping.code, mapping.message, undefined, { cause: error })
  // 🔴 원본을 cause 로 매단다. 상류(crm)는 여기서 원본을 버려 500 의 실제 원인을 로그에서도 못 찾았다(hangang).
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_INTERNAL,
    '일시적인 오류가 발생했습니다.',
    undefined,
    {
      cause: error,
    },
  )
}
```

`packages/admin-server/src/database/run.ts`:

```ts
import type { Kysely, Transaction } from 'kysely'
import { mapError } from './map-error.js'

// 정본: hangang-home apps/api/src/core/database/write-transaction.ts + ssworks-gise-home apps/api/src/core/database/run.ts
// 바꾼 점: `Kysely<Database>` 에 묶지 않고 제네릭이다 — 쓰는 쪽 Database 로도 부른다. gise 의 `label` 인자 · 트랜잭션 안
//   네트워크 I/O 단언(tx-context)은 옮기지 않았다(스펙 §11).
//
// 🔴 이 봉투가 없으면 드라이버 오류(데드락 · 연결 거부)가 코드 없는 맨 500 으로 나간다. 관리자 SPA 는 `code` 로만
//    분기하므로 재시도 안내도 못 한다(hangang 최종 수정 A5).

/** 트랜잭션 없이 DB 를 만지는 자리(읽기 하나 · 단문 쓰기)의 봉투. */
export async function runQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw mapError(error)
  }
}

/**
 * 쓰기 트랜잭션. 안에서 던지면 롤백되고 드라이버 오류는 코드 있는 `BusinessError` 가 된다. 서비스가 던진
 * `BusinessError`(409 · 404 …)는 그대로 통과한다.
 *
 * 🔴 재인증(argon2)을 이 안에서 부르지 않는다 — 수십 ms 의 해시가 행 잠금을 쥔 채 돈다(hangang password-recheck).
 */
export async function runWriteTransaction<DB, T>(
  db: Kysely<DB>,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction().execute(fn)
  } catch (error) {
    throw mapError(error)
  }
}
```

- [ ] **Step 4: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- map-error run`
Expected: PASS — map-error 13 · run 5.

- [ ] **Step 5: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/database
pnpm check
git add packages/admin-server/src/database
git commit -m "$(cat <<'EOF'
feat(admin-server): 드라이버 오류 매핑 — mapError · runQuery · runWriteTransaction

드라이버 code → admin-shared BusinessError(UNIQUE → DUPLICATED, FK restrict → IN_USE, 데드락 → CONFLICT,
락 대기 · 시간 초과 → TIMEOUT, 연결 거부 · 풀 대기 초과 → UNAVAILABLE). 원본은 cause 로만.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 검증 · 소독 — `validationError` · 파이프 · `toJsonSafe`

**Files:**

- Create: `packages/admin-server/src/http/validation.ts` · `validation.test.ts`
- Create: `packages/admin-server/src/http/pipes.ts` · `pipes.test.ts`
- Create: `packages/admin-server/src/http/json-safe.ts` · `json-safe.test.ts`

**Interfaces:**

- Consumes: admin-shared `BusinessError` · `CommonErrorCodes` · `ValidationIssue` · `stringifyJSON`
- Produces:
  - `validationError(issues: ValidationIssue[], message?: string): BusinessError`
  - `toValidationIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[]` · `koreanZodErrors(): z.core.$ZodErrorMap`
  - `class ZodValidationPipe<T> implements PipeTransform<unknown, T>`(`new ZodValidationPipe(schema)`) · `class ParseBigIntPipe implements PipeTransform<unknown, bigint>`
  - `type JsonSafe` · `toJsonSafe(value: unknown): JsonSafe | undefined` · `stringifyForLog(value: unknown): string`

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/http/validation.test.ts`:

```ts
import { CommonErrorCodes, validationDetailsSchema } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { koreanZodErrors, toValidationIssues, validationError } from './validation.js'

describe('toValidationIssues', () => {
  it('🔴 path 는 배열 그대로, 키는 path · code · message 셋뿐(input 없음)', () => {
    const schema = z.object({ members: z.array(z.object({ name: z.string().min(1) })) })
    const result = schema.safeParse({ members: [{ name: '' }] })
    const issues = toValidationIssues(result.error!.issues)
    expect(issues).toEqual([
      { path: ['members', 0, 'name'], code: 'too_small', message: expect.any(String) },
    ])
    expect(Object.keys(issues[0]!)).toEqual(['path', 'code', 'message'])
  })

  it('🔴 보낸 원문(input)을 싣지 않는다 — 비밀번호가 되돌아 나간다', () => {
    const result = z.object({ password: z.string().min(20) }).safeParse({ password: 'p@ss-secret' })
    expect(JSON.stringify(toValidationIssues(result.error!.issues))).not.toContain('p@ss-secret')
  })

  it('symbol 키는 문자열로', () => {
    const issue = {
      code: 'custom',
      path: [Symbol('k')],
      message: 'm',
      input: 'secret',
    } as z.core.$ZodIssue
    expect(toValidationIssues([issue])).toEqual([
      { path: ['Symbol(k)'], code: 'custom', message: 'm' },
    ])
  })
})

describe('validationError', () => {
  it('ERR_COMMON_VALIDATION + details.issues — admin-shared 스키마로 읽힌다', () => {
    const error = validationError([
      { path: ['currentPassword'], message: '현재 비밀번호가 맞지 않습니다.' },
    ])
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    expect(error.message).toBe('요청 형식이 올바르지 않습니다.')
    expect(validationDetailsSchema.parse(error.details)).toEqual({
      issues: [{ path: ['currentPassword'], message: '현재 비밀번호가 맞지 않습니다.' }],
    })
  })

  it('메시지를 바꿀 수 있다', () => {
    expect(validationError([], '다시 확인하세요.').message).toBe('다시 확인하세요.')
  })
})

describe('koreanZodErrors', () => {
  it('한국어 기본 문구, 스키마 문구가 이긴다, 같은 인스턴스', () => {
    const plain = z.string().safeParse(1, { error: koreanZodErrors() })
    expect(plain.error?.issues[0]?.message).toMatch(/[가-힣]/)
    const custom = z.string().min(2, '두 글자 이상').safeParse('a', { error: koreanZodErrors() })
    expect(custom.error?.issues[0]?.message).toBe('두 글자 이상')
    expect(koreanZodErrors()).toBe(koreanZodErrors())
  })
})
```

`packages/admin-server/src/http/pipes.test.ts`:

```ts
import { BusinessError, CommonErrorCodes, validationDetailsSchema } from '@ssworks/admin-shared'
import type { ArgumentMetadata } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ParseBigIntPipe, ZodValidationPipe } from './pipes.js'

function rejection(fn: () => unknown): BusinessError {
  try {
    fn()
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('던지지 않았다')
}

const schema = z.object({
  name: z.string().min(2),
  count: z.coerce.number().int().default(1),
  members: z.array(z.object({ name: z.string().min(1, '이름을 입력하세요.') })).default([]),
})

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema)

  it('성공하면 파싱 결과(기본값 · coerce 적용)를 돌려준다', () => {
    expect(pipe.transform({ name: '홍길', count: '3' })).toEqual({
      name: '홍길',
      count: 3,
      members: [],
    })
  })

  it('실패는 ERR_COMMON_VALIDATION + 배열 path', () => {
    const error = rejection(() => pipe.transform({ name: 'a', members: [{ name: '' }] }))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    const details = validationDetailsSchema.parse(error.details)
    expect(details.issues.map((issue) => issue.path)).toEqual([['name'], ['members', 0, 'name']])
  })

  it('기본 문구는 한국어, 스키마에 적은 문구가 이긴다', () => {
    const error = rejection(() => pipe.transform({ name: 'a', members: [{ name: '' }] }))
    const [first, second] = validationDetailsSchema.parse(error.details).issues
    expect(first?.message).toMatch(/[가-힣]/)
    expect(second?.message).toBe('이름을 입력하세요.')
  })

  it('🔴 보낸 원문을 싣지 않는다', () => {
    const secretPipe = new ZodValidationPipe(z.object({ password: z.string().min(20) }))
    const error = rejection(() => secretPipe.transform({ password: 'p@ss-secret' }))
    expect(JSON.stringify(error.details)).not.toContain('p@ss-secret')
  })
})

describe('ParseBigIntPipe', () => {
  const pipe = new ParseBigIntPipe()
  const meta: ArgumentMetadata = { type: 'param', data: 'teamNo' }

  it.each([
    ['12', 12n],
    ['0', 0n],
    ['007', 7n],
    ['18446744073709551615', 18446744073709551615n],
  ])('%s → %s', (raw, expected) => {
    expect(pipe.transform(raw, meta)).toBe(expected)
  })

  it.each(['-1', '1.5', 'abc', '', ' 7', '7 ', '1e3', '18446744073709551616'])(
    '%j 는 400 + path [teamNo]',
    (raw) => {
      const error = rejection(() => pipe.transform(raw, meta))
      expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
      expect(validationDetailsSchema.parse(error.details).issues[0]?.path).toEqual(['teamNo'])
    },
  )

  it('문자열이 아니면 거부한다', () => {
    expect(rejection(() => pipe.transform(12, meta)).code).toBe(
      CommonErrorCodes.ERR_COMMON_VALIDATION,
    )
  })

  it('매개변수 이름이 없으면 위치 종류를 path 로', () => {
    const error = rejection(() => pipe.transform('x', { type: 'query' }))
    expect(validationDetailsSchema.parse(error.details).issues[0]?.path).toEqual(['query'])
  })
})
```

`packages/admin-server/src/http/json-safe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { stringifyForLog, toJsonSafe } from './json-safe.js'

describe('toJsonSafe', () => {
  it('순환은 [circular], 형제는 남는다', () => {
    const node: Record<string, unknown> = { name: 'a' }
    node.self = node
    expect(toJsonSafe(node)).toEqual({ name: 'a', self: '[circular]' })
  })

  it('🔴 순환이 아닌 DAG 의 두 가지가 모두 남는다', () => {
    const child = { v: 1 }
    expect(toJsonSafe({ a: child, b: child })).toEqual({ a: { v: 1 }, b: { v: 1 } })
  })

  it('던지는 getter 는 그 키만 마커', () => {
    const value = {
      ok: 1,
      get bad(): never {
        throw new Error('getter')
      },
    }
    expect(toJsonSafe(value)).toEqual({ ok: 1, bad: '[unserializable]' })
  })

  it('깊이 상한에서 마커', () => {
    const root: Record<string, unknown> = {}
    let cursor = root
    for (let index = 0; index < 40; index += 1) {
      const next: Record<string, unknown> = {}
      cursor.next = next
      cursor = next
    }
    expect(JSON.stringify(toJsonSafe(root))).toContain('[max depth]')
  })

  it('Date 는 toJSON, bigint 는 그대로, NaN 은 null, undefined 키는 지우고 배열 안은 null', () => {
    expect(
      toJsonSafe({
        at: new Date('2026-01-02T03:04:05.000Z'),
        n: 3n,
        x: Number.NaN,
        u: undefined,
        list: [undefined, () => 1],
      }),
    ).toEqual({ at: '2026-01-02T03:04:05.000Z', n: 3n, x: null, list: [null, null] })
  })

  it('🔴 절대 던지지 않는다 — ownKeys 가 던지는 Proxy', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no keys')
        },
      },
    )
    expect(toJsonSafe(hostile)).toBe('[unserializable]')
  })
})

describe('stringifyForLog', () => {
  it('bigint 를 "BigInt(n)" 래퍼로', () => {
    expect(stringifyForLog({ n: 3n })).toBe('{"n":"BigInt(3)"}')
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- http`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`packages/admin-server/src/http/validation.ts`:

```ts
import { BusinessError, CommonErrorCodes, type ValidationIssue } from '@ssworks/admin-shared'
import { z } from 'zod'

// 정본: ssworks-gise-home apps/api/src/core/pipes/zod-validation.pipe.ts(이슈 변환 · `input` 제외)
// 바꾼 점:
//  - 🔴 `path` 를 배열 그대로 싣는다. admin-shared `validationDetailsSchema` 와 admin-ui `toFieldErrors` 가 배열을 받는다
//    — gise 는 점으로 이어 보냈다.
//  - 코드는 admin-shared `ERR_COMMON_VALIDATION`. 기본 문구를 zod `ko` 로케일로(요청마다).

const DEFAULT_MESSAGE = '요청 형식이 올바르지 않습니다.'

/** 400 `ERR_COMMON_VALIDATION` + `details.issues` — 파이프와 서비스(틀린 현재 비밀번호 등)가 같은 모양을 낸다. */
export function validationError(
  issues: ValidationIssue[],
  message: string = DEFAULT_MESSAGE,
): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_COMMON_VALIDATION, message, { issues })
}

/** zod 이슈 → 계약 이슈. 🔴 `input`(보낸 원문)을 싣지 않는다 — 비밀번호 같은 값이 응답으로 되돌아 나간다(gise). */
export function toValidationIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key)),
    code: issue.code,
    message: issue.message,
  }))
}

let koreanErrorMap: z.core.$ZodErrorMap | undefined

/**
 * zod 4 의 한국어 기본 문구. `safeParse(value, { error: koreanZodErrors() })` 로 요청마다 건다 — 스키마에 적은 문구가
 * 이긴다(4.6.5 실측). 🔴 전역 `z.config()` 를 건드리지 않는다 — 쓰는 쪽 zod 설정을 바꾸지 않는다.
 */
export function koreanZodErrors(): z.core.$ZodErrorMap {
  koreanErrorMap ??= z.locales.ko().localeError
  return koreanErrorMap
}
```

`packages/admin-server/src/http/pipes.ts`:

```ts
import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { koreanZodErrors, toValidationIssues, validationError } from './validation.js'

// 정본: ssworks-gise-home apps/api/src/core/pipes/zod-validation.pipe.ts
// 바꾼 점: 이슈 모양 · 문구는 validation.ts. `@Injectable()` 을 붙이지 않는다 — 스키마를 생성자로 받는 파이프는
//   `new ZodValidationPipe(schema)` 로만 쓴다(DI 로 만들 수 없다).

/**
 * 스키마 하나로 요청 조각을 검증한다. `@Body(new ZodValidationPipe(schema))`.
 * 반환값은 입력 원본이 아니라 **파싱 결과**다 — `.default()` · `z.coerce.*` 가 적용된 값이 핸들러에 들어간다.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata?: ArgumentMetadata): T {
    const result = this.schema.safeParse(value, { error: koreanZodErrors() })
    if (!result.success) throw validationError(toValidationIssues(result.error.issues))
    return result.data
  }
}

/** `BIGINT UNSIGNED` 의 상한 — 정본 넷의 PK 가 전부 이 타입이다 */
const UNSIGNED_BIGINT_MAX = 18446744073709551615n
const DIGITS = /^\d{1,20}$/

/** 경로 · 쿼리 매개변수 `"12"` → `12n`. 0 이상 정수만(부호 · 소수 · 지수 · 공백 거부). `@Param('teamNo', ParseBigIntPipe)`. */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<unknown, bigint> {
  transform(value: unknown, metadata: ArgumentMetadata): bigint {
    if (typeof value === 'string' && DIGITS.test(value)) {
      const parsed = BigInt(value)
      if (parsed <= UNSIGNED_BIGINT_MAX) return parsed
    }
    throw validationError([
      {
        path: [metadata.data ?? metadata.type],
        code: 'invalid_type',
        message: '0 이상의 정수 번호여야 합니다.',
      },
    ])
  }
}
```

`packages/admin-server/src/http/json-safe.ts`:

```ts
import { stringifyJSON } from '@ssworks/admin-shared'

// 정본: ssworks-gise-home apps/api/src/core/filters/business-exception.filter.ts 의 단일 소독 경계(toJsonSafe ·
//       sanitize · stringifyForLog)
// 바꾼 점: 필터 파일에서 떼어 냈다 — 필터와 로그가 같은 경계를 쓰고, 이 파일만 따로 시험한다.
//
// 🔴 어떤 입력에도 던지지 않는다. 순환 참조 · 던지는 getter · 깊이 상한을 마커로 접는다.
// 🔴 bigint 는 그대로 남긴다 — 래퍼로 바꾸는 것은 직렬화하는 쪽(`stringifyJSON`)이다.

export type JsonSafe =
  string | number | bigint | boolean | null | JsonSafe[] | { [key: string]: JsonSafe }

/** 조상을 다시 가리키는 진짜 순환 지점에만 붙는다. */
const CIRCULAR_MARKER = '[circular]'
/** 읽거나 변환할 수 없는 **그 값 하나**를 대체한다 — 형제 필드는 살아남는다. */
const UNSERIALIZABLE_MARKER = '[unserializable]'
/** 재귀 깊이 상한. 상한이 있어야 스택 오버플로가 봉투를 통째로 날리지 않는다. */
const DEPTH_LIMIT_MARKER = '[max depth]'
const MAX_DEPTH = 32

/** 반환값 `undefined` 는 `JSON.stringify` 가 그 값을 생략하는 경우와 같다(객체 키는 지워지고 배열 원소는 null). */
export function toJsonSafe(value: unknown): JsonSafe | undefined {
  try {
    return sanitize(value, new Set<object>(), 0)
  } catch {
    return UNSERIALIZABLE_MARKER
  }
}

/** 로그용 문자열 — 응답과 같은 경계를 지나고 bigint 는 `"BigInt(n)"` 으로. 던지지 않는다. */
export function stringifyForLog(value: unknown): string {
  try {
    return stringifyJSON(toJsonSafe(value)) ?? UNSERIALIZABLE_MARKER
  } catch {
    return UNSERIALIZABLE_MARKER
  }
}

function sanitize(value: unknown, ancestors: Set<object>, depth: number): JsonSafe | undefined {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      // `JSON.stringify(NaN) === 'null'` — 같은 결과를 낸다.
      return Number.isFinite(value) ? value : null
    case 'bigint':
      return value
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined
    default:
      break
  }
  if (value === null) return null

  const node = value as object
  // 🔴 순환은 **조상 참조**다. "한 번이라도 본 객체" 로 세면 `{ a: child, b: child }` 의 둘째 가지가 지워진다(gise
  //    round 3 결함). 현재 경로만 추적하고 빠져나올 때 지운다.
  if (ancestors.has(node)) return CIRCULAR_MARKER
  if (depth >= MAX_DEPTH) return DEPTH_LIMIT_MARKER

  ancestors.add(node)
  try {
    const unwrapped = unwrapToJson(node)
    if (unwrapped !== node) return sanitize(unwrapped, ancestors, depth)
    if (Array.isArray(node)) return sanitizeArray(node, ancestors, depth)
    return sanitizeObject(node, ancestors, depth)
  } finally {
    ancestors.delete(node)
  }
}

/** `toJSON()` 을 가진 값(`Date`)은 `JSON.stringify` 처럼 그 결과를 쓴다 — 아니면 `Date` 가 `{}` 가 된다. */
function unwrapToJson(node: object): unknown {
  let toJson: unknown
  try {
    toJson = (node as { toJSON?: unknown }).toJSON
  } catch {
    return node
  }
  if (typeof toJson !== 'function') return node
  try {
    return (toJson as () => unknown).call(node)
  } catch {
    return UNSERIALIZABLE_MARKER
  }
}

function sanitizeArray(node: unknown[], ancestors: Set<object>, depth: number): JsonSafe {
  const out: JsonSafe[] = []
  for (let index = 0; index < node.length; index += 1) {
    let item: unknown
    try {
      item = node[index]
    } catch {
      out.push(UNSERIALIZABLE_MARKER)
      continue
    }
    out.push(sanitize(item, ancestors, depth + 1) ?? null)
  }
  return out
}

function sanitizeObject(node: object, ancestors: Set<object>, depth: number): JsonSafe {
  let keys: string[]
  try {
    keys = Object.keys(node)
  } catch {
    return UNSERIALIZABLE_MARKER
  }
  const out: Record<string, JsonSafe> = {}
  for (const key of keys) {
    let raw: unknown
    try {
      raw = (node as Record<string, unknown>)[key]
    } catch {
      // 접근하면 던지는 getter — 그 키만 마커로 바꾸고 형제는 살린다.
      out[key] = UNSERIALIZABLE_MARKER
      continue
    }
    const child = sanitize(raw, ancestors, depth + 1)
    if (child !== undefined) out[key] = child
  }
  return out
}
```

- [ ] **Step 4: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- http`
Expected: PASS — validation 6 · pipes 18 · json-safe 7.

- [ ] **Step 5: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/http
pnpm check
git add packages/admin-server/src/http
git commit -m "$(cat <<'EOF'
feat(admin-server): 검증 파이프 · validationError · 소독 경계

- ZodValidationPipe: 파싱 결과 반환, 실패는 ERR_COMMON_VALIDATION + details.issues(path 배열, input 없음,
  zod ko 로케일 — 스키마 문구 우선)
- ParseBigIntPipe: 0 이상 정수 문자열만, BIGINT UNSIGNED 상한
- toJsonSafe · stringifyForLog: 순환 · 던지는 getter · 깊이 상한을 마커로, 절대 던지지 않음(gise)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 응답 경로 — `configureAdminApp` · 봉투 인터셉터 · 예외 필터

**Files:**

- Create: `packages/admin-server/src/tokens.ts`
- Create: `packages/admin-server/src/options.ts`
- Create: `packages/admin-server/src/http/configure-admin-app.ts`
- Create: `packages/admin-server/src/http/envelope.interceptor.ts`
- Create: `packages/admin-server/src/http/exception.filter.ts`
- Create: `packages/admin-server/src/test-support/http.ts`
- Create: `packages/admin-server/src/test-support/probe.ts`
- Test: `packages/admin-server/src/http/http-contract.test.ts`

**Interfaces:**

- Consumes: Task 2 `AdminDbConnection`, Task 4 `toJsonSafe` · `stringifyForLog` · `ZodValidationPipe` · `ParseBigIntPipe`
- Produces:
  - `KYSELY: unique symbol` · `ADMIN_SERVER_OPTIONS: unique symbol` · `RAW_RESPONSE = 'admin-kit:raw-response'`
  - `interface AdminServerOptions { db: AdminDbConnection; errorCodes?: Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'> }` · `AdminServerStaticOptions { routePrefix?: string }` · `AdminServerAsyncOptions`
  - `configureAdminApp(app: NestExpressApplication, options?: ConfigureAdminAppOptions): void` · `interface ConfigureAdminAppOptions { jsonLimit?: string | number }`
  - `RawResponse(): CustomDecorator<string>` · `class AdminEnvelopeInterceptor` · `class AdminExceptionFilter`(생성자 `@Optional() @Inject(ADMIN_SERVER_OPTIONS) options?`)
  - 테스트 지원: `createHttpApp(metadata: ModuleMetadata, options?: HttpAppOptions): Promise<NestExpressApplication>` · `ProbeModule` · `ProbeController`

- [ ] **Step 1: 토큰 · 옵션 타입**

`packages/admin-server/src/tokens.ts`:

```ts
// 주입 토큰 · 메타데이터 키. 🔴 기능 모듈은 admin-server.module.ts 가 아니라 이 파일에서 토큰을 가져온다 — 코어 모듈이
//    기능 모듈 목록을 import 하므로(RouterModule) 반대 방향 import 는 순환이 된다.

/** `Kysely<AdminDatabase>`. 쓰는 쪽은 `@Inject(KYSELY) db: Kysely<Database>` 로 받는다. */
export const KYSELY = Symbol('KYSELY')

/** 해석된 `AdminServerOptions` */
export const ADMIN_SERVER_OPTIONS = Symbol('ADMIN_SERVER_OPTIONS')

/** `@RawResponse()` 가 남기는 메타데이터 키 */
export const RAW_RESPONSE = 'admin-kit:raw-response'
```

`packages/admin-server/src/options.ts`:

```ts
import type { FactoryProvider, ModuleMetadata } from '@nestjs/common'
import type { ErrorCodeTable } from '@ssworks/admin-shared'
import type { AdminDbConnection } from './database/connection.js'

export interface AdminServerOptions {
  /** DB 접속. 보통 `adminDbConnectionFromEnv()` */
  db: AdminDbConnection
  /**
   * 프로젝트 오류 코드표(admin-shared `defineErrorCodes` 결과). 예외 필터가 `BusinessError` 의 상태를 여기서 찾는다.
   * 없으면 코어 표(`COMMON_ERROR_STATUS`). 표에 없는 코드는 500.
   */
  errorCodes?: Pick<ErrorCodeTable<Record<string, string>>, 'httpStatusFor'>
}

/** 정적 옵션 — `RouterModule` 이 모듈 정의 시점의 값을 요구한다(스펙 F2). */
export interface AdminServerStaticOptions {
  /** 관리자 라우트 prefix. 기본 `'admin'`. `''` 이면 붙이지 않는다 */
  routePrefix?: string
}

export interface AdminServerAsyncOptions extends AdminServerStaticOptions {
  imports?: ModuleMetadata['imports']
  inject?: FactoryProvider['inject']
  // Nest 의 FactoryProvider 와 같은 모양 — 주입 인자 타입은 쓰는 쪽이 정한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => AdminServerOptions | Promise<AdminServerOptions>
}
```

- [ ] **Step 2: 테스트 지원 — HTTP 부트스트랩 · 프로브**

`packages/admin-server/src/test-support/http.ts`:

```ts
import type { ModuleMetadata } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import { configureAdminApp } from '../http/configure-admin-app.js'

// 테스트 전용 — 운영 main.ts 와 같은 배선(configureAdminApp)으로 앱을 띄운다. 🔴 빌드에서 빠진다(tsconfig.build.json).

export interface HttpAppOptions {
  /** false 면 configureAdminApp 을 부르지 않는다 — 부팅 검사 테스트 */
  configure?: boolean
  jsonLimit?: string | number
  /** 테스트 모듈 빌더를 고친다 — 예: KYSELY 를 가짜로 */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder
}

export async function createHttpApp(
  metadata: ModuleMetadata,
  options: HttpAppOptions = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule(metadata)
  if (options.override) builder = options.override(builder)
  const ref = await builder.compile()
  const app = ref.createNestApplication<NestExpressApplication>({ logger: false })
  if (options.configure !== false) {
    configureAdminApp(app, options.jsonLimit === undefined ? {} : { jsonLimit: options.jsonLimit })
  }
  await app.init()
  return app
}
```

`packages/admin-server/src/test-support/probe.ts`:

```ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'
import { BusinessError } from '@ssworks/admin-shared'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { RawResponse } from '../http/envelope.interceptor.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'

// 테스트 전용 프로브 — 응답 · 오류 · 검증 계약을 HTTP 로 잰다. 🔴 빌드에서 빠진다(tsconfig.build.json).

export const probeBodySchema = z.object({
  name: z.string().min(2),
  count: z.coerce.number().int().default(1),
  members: z.array(z.object({ name: z.string().min(1, '이름을 입력하세요.') })).default([]),
})

type ProbeBody = z.infer<typeof probeBodySchema>

@Controller('probe')
export class ProbeController {
  @Get('value')
  value() {
    // text 는 래퍼와 충돌하는 일반 문자열 — 코덱이 역슬래시로 이스케이프하고 되돌린다(B9)
    return {
      n: 12345678901234567890n,
      at: new Date('2026-01-02T03:04:05.000Z'),
      text: 'BigInt(7)',
      label: '한글 값',
    }
  }

  @Get('nothing')
  nothing(): void {}

  @Get('raw')
  @RawResponse()
  raw() {
    return { plain: true }
  }

  @Get('file')
  file() {
    return new StreamableFile(Buffer.from('hello'), { type: 'text/plain' })
  }

  @Post('echo')
  echo(@Body() body: Record<string, unknown>) {
    return { type: typeof body.n, body }
  }

  @Get('query')
  query(@Query() query: Record<string, unknown>) {
    return query
  }

  @Get('cookie')
  cookie(@Req() request: Request) {
    return { cookies: request.cookies as unknown }
  }

  @Get('business/:code')
  business(@Param('code') code: string) {
    throw new BusinessError(
      code,
      `업무 오류 ${code}`,
      { field: 'x', n: 3n },
      { cause: new Error('내부 원인') },
    )
  }

  @Get('business-weird')
  businessWeird() {
    const details: Record<string, unknown> = { ok: 1 }
    details.self = details
    Object.defineProperty(details, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter')
      },
    })
    throw new BusinessError('ERR_COMMON_CONFLICT', '이상한 details', details)
  }

  @Get('http-forbidden')
  forbidden() {
    throw new ForbiddenException('이 작업을 할 권한이 없습니다.')
  }

  @Get('http-502')
  badGateway() {
    throw new HttpException('upstream down', 502)
  }

  @Get('string-throw')
  stringThrow() {
    throw 'boom'
  }

  @Get('half')
  half(@Res() response: Response) {
    response.status(200).type('text/plain').write('partial')
    throw new Error('늦은 예외')
  }

  @Post('validate')
  validate(@Body(new ZodValidationPipe(probeBodySchema)) body: ProbeBody) {
    return body
  }

  @Get('teams/:teamNo')
  team(@Param('teamNo', ParseBigIntPipe) teamNo: bigint) {
    return { teamNo, type: typeof teamNo }
  }
}

@Module({ controllers: [ProbeController] })
export class ProbeModule {}
```

- [ ] **Step 3: 계약 테스트를 쓴다**

`packages/admin-server/src/http/http-contract.test.ts`:

```ts
import { Logger, type ModuleMetadata } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  defineErrorCodes,
  errorRespSchema,
  parseJSON,
  validationDetailsSchema,
} from '@ssworks/admin-shared'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AdminServerOptions } from '../options.js'
import { createHttpApp } from '../test-support/http.js'
import { ProbeModule } from '../test-support/probe.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { AdminEnvelopeInterceptor } from './envelope.interceptor.js'
import { AdminExceptionFilter } from './exception.filter.js'

const projectErrors = defineErrorCodes(
  { ERR_PROJECT_GONE: 'ERR_PROJECT_GONE' },
  { ERR_PROJECT_GONE: 410 },
)

function wiring(options: AdminServerOptions): ModuleMetadata {
  return {
    imports: [ProbeModule],
    providers: [
      { provide: ADMIN_SERVER_OPTIONS, useValue: options },
      { provide: APP_FILTER, useClass: AdminExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: AdminEnvelopeInterceptor },
    ],
  }
}

const options: AdminServerOptions = {
  db: { host: 'unused', user: 'u', password: 'p', database: 'd' },
  errorCodes: projectErrors,
}

let app: NestExpressApplication
let server: ReturnType<NestExpressApplication['getHttpServer']>

beforeAll(async () => {
  app = await createHttpApp(wiring(options))
  server = app.getHttpServer()
})

afterAll(async () => {
  await app.close()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 와이어 원문을 킷 코덱으로 — supertest 의 JSON.parse 는 "BigInt(n)" 을 문자열로 둔다 */
const wire = (text: string) => parseJSON<Record<string, unknown>>(text)

function silenceErrors() {
  return vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
}

describe('성공 봉투', () => {
  it('값을 data 에 싸고 bigint 는 "BigInt(n)", Date 는 ISO, 충돌 문자열은 왕복', async () => {
    const res = await request(server).get('/probe/value').expect(200)
    expect(res.headers['content-type']).toMatch(/application\/json; charset=utf-8/)
    expect(res.text).toContain('"BigInt(12345678901234567890)"')
    expect(wire(res.text)).toEqual({
      success: true,
      data: {
        n: 12345678901234567890n,
        at: '2026-01-02T03:04:05.000Z',
        text: 'BigInt(7)',
        label: '한글 값',
      },
    })
  })

  it('반환값이 없으면 data: null', async () => {
    const res = await request(server).get('/probe/nothing').expect(200)
    expect(res.body).toEqual({ success: true, data: null })
  })

  it('@RawResponse() 는 봉투 없이', async () => {
    const res = await request(server).get('/probe/raw').expect(200)
    expect(res.body).toEqual({ plain: true })
  })

  it('StreamableFile 은 건드리지 않는다', async () => {
    const res = await request(server).get('/probe/file').expect(200)
    expect(res.text).toBe('hello')
  })
})

describe('요청', () => {
  it('🔴 본문의 "BigInt(n)" 이 bigint 로 핸들러에 온다(reviver)', async () => {
    const res = await request(server).post('/probe/echo').send({ n: 'BigInt(5)' }).expect(201)
    expect(wire(res.text)).toEqual({ success: true, data: { type: 'bigint', body: { n: 5n } } })
  })

  it('🔴 filter[k] 는 객체, 같은 키 반복은 배열(query parser extended)', async () => {
    const res = await request(server).get('/probe/query?filter[a]=1&sortBy=x&sortBy=y').expect(200)
    expect(res.body).toEqual({ success: true, data: { filter: { a: '1' }, sortBy: ['x', 'y'] } })
  })

  it('🔴 __proto__ 는 쿼리 객체에 들어가지 않고 프로토타입도 오염되지 않는다', async () => {
    const res = await request(server)
      .get('/probe/query?__proto__[polluted]=1&filter[__proto__][x]=1&filter[a]=1')
      .expect(200)
    expect(res.body).toEqual({ success: true, data: { filter: { a: '1' } } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('쿠키를 읽는다(cookie-parser)', async () => {
    const res = await request(server).get('/probe/cookie').set('Cookie', 'a=1; b=two').expect(200)
    expect(res.body).toEqual({ success: true, data: { cookies: { a: '1', b: 'two' } } })
  })
})

describe('오류 봉투', () => {
  it('BusinessError 4xx — 코드표 상태 · 메시지 · details(bigint 포함), admin-shared 스키마로 읽힌다', async () => {
    const res = await request(server).get('/probe/business/ERR_COMMON_NOT_FOUND').expect(404)
    expect(res.headers['content-type']).toMatch(/application\/json; charset=utf-8/)
    expect(errorRespSchema.safeParse(res.body).success).toBe(true)
    expect(wire(res.text)).toEqual({
      success: false,
      code: 'ERR_COMMON_NOT_FOUND',
      message: '업무 오류 ERR_COMMON_NOT_FOUND',
      details: { field: 'x', n: 3n },
    })
  })

  it('프로젝트 코드는 errorCodes 의 상태', async () => {
    const res = await request(server).get('/probe/business/ERR_PROJECT_GONE').expect(410)
    expect(res.body.code).toBe('ERR_PROJECT_GONE')
  })

  it('🔴 BusinessError 5xx — 고정 문구, details 없음, 원문 · cause · details 는 로그로', async () => {
    const spy = silenceErrors()
    const res = await request(server).get('/probe/business/ERR_COMMON_INTERNAL').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: 'ERR_COMMON_INTERNAL',
      message: '서버 내부 오류가 발생했습니다.',
    })
    const logged = spy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('GET /probe/business/ERR_COMMON_INTERNAL')
    expect(logged).toContain('업무 오류 ERR_COMMON_INTERNAL')
    expect(logged).toContain('내부 원인')
    expect(logged).toContain('"BigInt(3)"')
  })

  it('표에 없는 코드는 500 · 고정 문구', async () => {
    silenceErrors()
    const res = await request(server).get('/probe/business/ERR_NOBODY_KNOWS').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: 'ERR_NOBODY_KNOWS',
      message: '서버 내부 오류가 발생했습니다.',
    })
  })

  it('HttpException 4xx 는 상태에 맞는 코어 코드와 그 메시지', async () => {
    const res = await request(server).get('/probe/http-forbidden').expect(403)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_FORBIDDEN,
      message: '이 작업을 할 권한이 없습니다.',
    })
  })

  it('HttpException 5xx(503 · 504 밖)는 500 · 고정 문구', async () => {
    silenceErrors()
    const res = await request(server).get('/probe/http-502').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_INTERNAL,
      message: '서버 내부 오류가 발생했습니다.',
    })
  })

  it('없는 경로는 404 봉투', async () => {
    const res = await request(server).get('/nope').expect(404)
    expect(res.body).toMatchObject({ success: false, code: CommonErrorCodes.ERR_COMMON_NOT_FOUND })
  })

  it('🔴 본문 1mb 초과는 413 봉투(Express http-errors 를 그대로 받는다)', async () => {
    const body = JSON.stringify({ blob: 'x'.repeat(1_100_000) })
    const res = await request(server)
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(413)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_PAYLOAD_TOO_LARGE,
      message: '요청 본문이 너무 큽니다.',
    })
  })

  it('깨진 JSON 은 400 봉투', async () => {
    const res = await request(server)
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400)
    expect(res.body).toMatchObject({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
    })
  })

  it('🔴 객체가 아닌 JSON 본문도 400 봉투(body-parser strict)', async () => {
    const res = await request(server)
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('"text"')
      .expect(400)
    expect(res.body).toMatchObject({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
    })
  })

  it('🔴 깨진 퍼센트 인코딩 경로도 400 봉투', async () => {
    const res = await request(server).get('/probe/teams/%FF').expect(400)
    expect(res.body).toMatchObject({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST,
    })
  })

  it('문자열을 던져도 500 봉투', async () => {
    silenceErrors()
    const res = await request(server).get('/probe/string-throw').expect(500)
    expect(res.body).toEqual({
      success: false,
      code: CommonErrorCodes.ERR_COMMON_INTERNAL,
      message: '서버 내부 오류가 발생했습니다.',
    })
  })

  it('🔴 details 에 순환 · 던지는 getter 가 있어도 응답한다', async () => {
    const res = await request(server).get('/probe/business-weird').expect(409)
    expect(res.body).toEqual({
      success: false,
      code: 'ERR_COMMON_CONFLICT',
      message: '이상한 details',
      details: { ok: 1, self: '[circular]', bad: '[unserializable]' },
    })
  })

  it('🔴 응답을 쓰기 시작한 뒤의 예외는 다시 보내지 않고 응답을 닫는다(로그만)', async () => {
    const spy = silenceErrors()
    const res = await request(server).get('/probe/half').expect(200)
    expect(res.text).toBe('partial')
    expect(spy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('응답이 이미 나가')
  })
})

describe('검증', () => {
  it('실패 본문을 admin-shared 스키마로 읽을 수 있고 path 는 배열', async () => {
    const res = await request(server)
      .post('/probe/validate')
      .send({ name: 'a', members: [{ name: '' }] })
      .expect(400)
    expect(res.body.code).toBe(CommonErrorCodes.ERR_COMMON_VALIDATION)
    const details = validationDetailsSchema.parse(res.body.details)
    expect(details.issues.map((issue) => issue.path)).toEqual([['name'], ['members', 0, 'name']])
    expect(details.issues[1]?.message).toBe('이름을 입력하세요.')
  })

  it('성공하면 파싱 결과가 핸들러에', async () => {
    const res = await request(server)
      .post('/probe/validate')
      .send({ name: '홍길', count: '2' })
      .expect(201)
    expect(res.body).toEqual({ success: true, data: { name: '홍길', count: 2, members: [] } })
  })

  it('ParseBigIntPipe — 통과는 bigint, 실패는 path [teamNo]', async () => {
    const ok = await request(server).get('/probe/teams/12').expect(200)
    expect(wire(ok.text)).toEqual({ success: true, data: { teamNo: 12n, type: 'bigint' } })
    const bad = await request(server).get('/probe/teams/abc').expect(400)
    expect(validationDetailsSchema.parse(bad.body.details).issues[0]?.path).toEqual(['teamNo'])
  })
})

describe('errorCodes 가 없을 때', () => {
  it('코어 표로 상태를 정하고 프로젝트 코드는 500', async () => {
    const plain = await createHttpApp(wiring({ db: options.db }))
    try {
      silenceErrors()
      await request(plain.getHttpServer()).get('/probe/business/ERR_COMMON_NOT_FOUND').expect(404)
      await request(plain.getHttpServer()).get('/probe/business/ERR_PROJECT_GONE').expect(500)
    } finally {
      await plain.close()
    }
  })
})
```

- [ ] **Step 4: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- http-contract`
Expected: FAIL — `Cannot find module './envelope.interceptor.js'` 등.

- [ ] **Step 5: `configureAdminApp` · 인터셉터 · 필터를 구현한다**

`packages/admin-server/src/http/configure-admin-app.ts`:

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import { bigintJsonReplacer, bigintJsonReviver } from '@ssworks/admin-shared'
import cookieParser from 'cookie-parser'

// 정본: ssworks-gise-home apps/api/src/core/config/bootstrap.ts(configureApp) · body-limits.ts,
//       kim5257-crm-v5 · ssworks-axion-admin main.ts(query parser)
// 바꾼 점:
//  - 전역 prefix · trust proxy 는 여기 없다 — 쓰는 쪽(prefix) · 2f(클라이언트 IP) 몫.
//  - `jsonLimit` 하나만 받는다. gise 는 옵션을 금지했다(main 과 테스트 배선이 갈리지 않게) — 패키지는 프로젝트마다 한도가
//    다를 수 있어 하나만 연다. 패키지 테스트 하네스도 이 함수를 그대로 부른다.
//  - `query parser: 'extended'` 를 더했다 — admin-ui 가 `filter[key]=…` 로 보낸다. Express 5 기본(`simple`)은 객체로
//    만들지 않는다. extended 파서는 `__proto__` 키를 버린다(2026-10-08 실측).

export interface ConfigureAdminAppOptions {
  /** JSON 본문 한도. 기본 `'1mb'`(Express 기본 100kb 는 관리자 저장 본문에 모자란다 — gise) */
  jsonLimit?: string | number
}

/**
 * `NestFactory.create()` 뒤, `listen()` · `init()` 전에 부른다. 🔴 빠뜨리면 `AdminServerModule` 이 기동에서 멈춘다.
 * 순서: cookie-parser → JSON 본문(한도 · bigint reviver) → `json replacer` → 쿼리 파서.
 */
export function configureAdminApp(
  app: NestExpressApplication,
  options: ConfigureAdminAppOptions = {},
): void {
  app.use(cookieParser())
  // 🔴 reviver 가 없으면 본문의 `"BigInt(n)"` 이 문자열로 남아 bigint 를 요구하는 스키마가 거부한다(gise 뮤테이션 관측).
  //    이 호출 뒤 Nest 는 자기 JSON 파서를 다시 붙이지 않는다(스펙 R1).
  app.useBodyParser('json', { limit: options.jsonLimit ?? '1mb', reviver: bigintJsonReviver })
  // 🔴 없으면 `res.json()` 의 JSON.stringify 가 bigint 에서 던져 성공 응답이 500 이 된다(gise 뮤테이션 관측).
  app.set('json replacer', bigintJsonReplacer)
  app.set('query parser', 'extended')
}
```

`packages/admin-server/src/http/envelope.interceptor.ts`:

```ts
import {
  Injectable,
  SetMetadata,
  StreamableFile,
  type CallHandler,
  type CustomDecorator,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { map, type Observable } from 'rxjs'
import { RAW_RESPONSE } from '../tokens.js'

// 정본: kim5257-crm-v5 `{ success: true, data }` 봉투(Phase 0 §4 #1). crm 은 컨트롤러가 손으로 쌌다.
// 바꾼 점: 전역 인터셉터가 싼다 — 서비스 · 컨트롤러는 봉투를 모른다.

/** 봉투를 씌우지 않는다 — 웹훅 · 헬스 체크처럼 정해진 모양을 내야 하는 라우트. 메서드나 컨트롤러에 붙인다. */
export function RawResponse(): CustomDecorator<string> {
  return SetMetadata(RAW_RESPONSE, true)
}

/** 반환값을 `{ success: true, data }` 로 싼다. `undefined` 는 `data: null`. 파일 응답은 건드리지 않는다. */
@Injectable()
export class AdminEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const raw = this.reflector.getAllAndOverride<boolean | undefined>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (raw === true) return next.handle()
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          data instanceof StreamableFile || Buffer.isBuffer(data)
            ? data
            : { success: true, data: data ?? null },
        ),
      )
  }
}
```

`packages/admin-server/src/http/exception.filter.ts`:

```ts
import {
  Catch,
  HttpException,
  Inject,
  Logger,
  Optional,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import {
  BusinessError,
  COMMON_ERROR_STATUS,
  CommonErrorCodes,
  stringifyJSON,
  type CommonErrorCode,
} from '@ssworks/admin-shared'
import type { Request, Response } from 'express'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS } from '../tokens.js'
import { stringifyForLog, toJsonSafe } from './json-safe.js'

// 정본: ssworks-gise-home apps/api/src/core/filters/business-exception.filter.ts(`@Catch()` 전부 · 소독 경계 · 5xx 마스킹 ·
//       "반드시 응답" · logSafely · 상태 정규화) + hangang-home business-exception.filter.ts(stringifyJSON 으로 직접 보냄)
// 바꾼 점:
//  - 본문이 `{ success: false, code, message, details? }`(Phase 0 §4 #1). gise 는 `{ statusCode, … }`.
//  - 🔴 replacer 에 기대지 않는다 — 소독한 본문을 admin-shared `stringifyJSON` 으로 직접 보낸다(hangang). gise 는
//    `res.json()` 이라 `json replacer` 가 빠진 앱에서 bigint 가 든 오류 응답이 응답 없이 타임아웃했다.
//  - 상태 → 코드는 고정 표다. gise 는 코드표를 역조회했는데 admin-shared 는 같은 상태를 쓰는 코드가 여럿이다.
//  - Express 층 `http-errors`(본문 초과 413 — Nest 가 그대로 넘긴다)를 그 상태로 받는다. gise 는 500 이었다.
//  - 헤더가 이미 나갔으면 다시 보내지 않고 응답을 닫는다(스펙 R5).
//  - 로그는 문자열 하나로 — Nest `Logger.error(message, second)` 는 둘째 문자열이 스택처럼 보이지 않으면 context 로 읽는다.

interface ErrorBody {
  success: false
  code: string
  message: string
  details?: unknown
}

/** 5xx 응답에서 원문 대신 나가는 고정 문구. 원문은 로그로만 간다. */
const GENERIC_5XX_MESSAGE = '서버 내부 오류가 발생했습니다.'
const PAYLOAD_TOO_LARGE_MESSAGE = '요청 본문이 너무 큽니다.'
const EXPRESS_4XX_MESSAGE = '요청을 처리할 수 없습니다.'

const CODE_BY_STATUS: ReadonlyMap<number, CommonErrorCode> = new Map([
  [400, CommonErrorCodes.ERR_COMMON_BAD_REQUEST],
  [401, CommonErrorCodes.ERR_COMMON_UNAUTHORIZED],
  [403, CommonErrorCodes.ERR_COMMON_FORBIDDEN],
  [404, CommonErrorCodes.ERR_COMMON_NOT_FOUND],
  [409, CommonErrorCodes.ERR_COMMON_CONFLICT],
  [413, CommonErrorCodes.ERR_COMMON_PAYLOAD_TOO_LARGE],
  [429, CommonErrorCodes.ERR_COMMON_TOO_MANY_REQUESTS],
  [503, CommonErrorCodes.ERR_COMMON_UNAVAILABLE],
  [504, CommonErrorCodes.ERR_COMMON_TIMEOUT],
])

function codeForStatus(status: number): string {
  return (
    CODE_BY_STATUS.get(status) ??
    (status >= 500 ? CommonErrorCodes.ERR_COMMON_INTERNAL : CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
  )
}

/** 5xx 는 503 · 504 만 그대로 두고 나머지는 500 이다 — 상류의 502 같은 상태를 그대로 흉내 내지 않는다. */
function serverStatus(status: number): number {
  return status === 503 || status === 504 ? status : 500
}

/** body-parser 등 Express 층의 `http-errors` — 4xx 이고 노출 가능하다고 표시된 것만 그 상태를 믿는다. */
function expressClientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined
  const { status, expose } = exception as { status?: unknown; expose?: unknown }
  return typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500 &&
    expose === true
    ? status
    : undefined
}

/** Express 5 의 `res.status()` 는 정수가 아니거나 범위 밖이면 던진다(gise). */
function normalizeStatus(status: number): number {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500
}

/** 객체 페이로드(`{ message, … }`)인 HttpException 에서 `message` 만 꺼낸다 — 다른 필드는 응답에 싣지 않는다(gise). */
function messageOfHttpException(exception: HttpException): string {
  const payload = exception.getResponse()
  if (typeof payload === 'string') return payload
  const message = (payload as { message?: unknown }).message
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.map(String).join(', ')
  return exception.message
}

/** 로그 첫 줄의 `METHOD PATH` — 쿼리스트링은 싣지 않는다. 던지지 않는다. */
function describeRequest(request: Request | undefined): string {
  try {
    const url = String(request?.originalUrl ?? '-')
    const queryIndex = url.indexOf('?')
    return `${String(request?.method ?? '-')} ${queryIndex === -1 ? url : url.slice(0, queryIndex)}`
  } catch {
    return '- -'
  }
}

function describeReason(reason: unknown): string {
  try {
    if (reason instanceof Error) return reason.stack ?? reason.message
    return String(reason)
  } catch {
    return '[unserializable]'
  }
}

/**
 * 전역 예외 필터 — 실패는 이 한 형식으로 나간다.
 *
 * 🔴 불변식: **이 필터에 온 요청은 반드시 응답을 받는다.** 어떤 예외 모양 · `details` 값 · 로거 동작도 이 필터를 던지게
 *    만들 수 없다. 이 위에는 아무것도 없다.
 * 🔴 예상 못한 예외의 내부 사유(드라이버 메시지 · 스택)는 응답에 넣지 않는다 — `cause` 와 함께 5xx 로그로만 간다.
 */
@Catch()
export class AdminExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AdminExceptionFilter.name)

  constructor(
    @Optional() @Inject(ADMIN_SERVER_OPTIONS) private readonly options?: AdminServerOptions,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const response = http.getResponse<Response>()
    let request: Request | undefined
    try {
      request = http.getRequest<Request>()
    } catch {
      request = undefined
    }

    let status: number
    let body: ErrorBody
    // 🔴 이 try/catch 를 "안전한 값만 다루니 필요 없다" 며 지우지 않는다 — 분기가 하나 늘면 같은 사고가 난다(gise).
    try {
      ;({ status, body } = this.toBody(exception, request))
    } catch (internalError) {
      this.logSafely(
        `${describeRequest(request)} — 예외 필터 내부 오류`,
        describeReason(internalError),
      )
      status = 500
      body = {
        success: false,
        code: CommonErrorCodes.ERR_COMMON_INTERNAL,
        message: GENERIC_5XX_MESSAGE,
      }
    }
    this.send(response, request, normalizeStatus(status), body)
  }

  private statusOf(code: string): number {
    if (this.options?.errorCodes) return this.options.errorCodes.httpStatusFor(code)
    return Object.hasOwn(COMMON_ERROR_STATUS, code)
      ? (COMMON_ERROR_STATUS as Readonly<Record<string, number>>)[code]!
      : 500
  }

  private toBody(
    exception: unknown,
    request: Request | undefined,
  ): { status: number; body: ErrorBody } {
    if (exception instanceof BusinessError) {
      const status = this.statusOf(exception.code)
      if (status >= 500) {
        // 🔴 원문 · details 는 로그로만. details 는 클라이언트가 요청을 고치라고 주는 채널이라 5xx 에서는 뺀다(gise).
        this.log(request, exception.message, exception.cause ?? exception, exception.details)
        return {
          status,
          body: { success: false, code: exception.code, message: GENERIC_5XX_MESSAGE },
        }
      }
      return {
        status,
        body: {
          success: false,
          code: exception.code,
          message: exception.message,
          ...(exception.details === undefined ? {} : { details: exception.details }),
        },
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      if (status >= 500) {
        this.log(request, messageOfHttpException(exception), exception)
        const masked = serverStatus(status)
        return {
          status: masked,
          body: { success: false, code: codeForStatus(masked), message: GENERIC_5XX_MESSAGE },
        }
      }
      return {
        status,
        body: {
          success: false,
          code: codeForStatus(status),
          message: messageOfHttpException(exception),
        },
      }
    }

    const expressStatus = expressClientErrorStatus(exception)
    if (expressStatus !== undefined) {
      return {
        status: expressStatus,
        body: {
          success: false,
          code: codeForStatus(expressStatus),
          message: expressStatus === 413 ? PAYLOAD_TOO_LARGE_MESSAGE : EXPRESS_4XX_MESSAGE,
        },
      }
    }

    this.log(request, '처리되지 않은 예외', exception)
    return {
      status: 500,
      body: {
        success: false,
        code: CommonErrorCodes.ERR_COMMON_INTERNAL,
        message: GENERIC_5XX_MESSAGE,
      },
    }
  }

  /** 🔴 클라이언트로 나가는 유일한 출구. 본문 전체가 소독 경계를 지난다. */
  private send(
    response: Response,
    request: Request | undefined,
    status: number,
    body: ErrorBody,
  ): void {
    if (response.headersSent) {
      // 🔴 다시 보내지 않는다. 열린 응답을 그대로 두면 요청이 끝나지 않으므로 닫는다(스펙 R5).
      this.logSafely(
        `${describeRequest(request)} — 응답이 이미 나가 오류 봉투(${body.code})를 보내지 못했다`,
      )
      try {
        if (!response.writableEnded) response.end()
      } catch {
        // 닫기도 실패하면 더 할 것이 없다.
      }
      return
    }
    const safe = toJsonSafe(body)
    const payload =
      typeof safe === 'object' && safe !== null && !Array.isArray(safe)
        ? safe
        : {
            success: false,
            code: CommonErrorCodes.ERR_COMMON_INTERNAL,
            message: GENERIC_5XX_MESSAGE,
          }
    try {
      response.status(status).type('application/json').send(stringifyJSON(payload))
    } catch (sendError) {
      this.logSafely(`${describeRequest(request)} — 응답 전송 실패`, describeReason(sendError))
    }
  }

  private log(
    request: Request | undefined,
    message: string,
    reason: unknown,
    details?: unknown,
  ): void {
    const parts = [`${describeRequest(request)} — ${message}`, describeReason(reason)]
    if (details !== undefined) parts.push(`details: ${stringifyForLog(details)}`)
    this.logSafely(...parts)
  }

  /** 🔴 로거가 죽어도 응답은 살린다 — 이 필터의 모든 로그가 여기를 지난다(gise). */
  private logSafely(...parts: string[]): void {
    try {
      this.logger.error(parts.join('\n'))
    } catch {
      // 의도적으로 삼킨다 — 같은 트랜스포트가 또 던진다.
    }
  }
}
```

- [ ] **Step 6: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- http-contract`
Expected: PASS — 26 tests. 413 · 400 경로가 HTML 로 나오면 `expressClientErrorStatus` · `HttpException` 분기를 다시 본다(스펙 §1-5 실측과 같아야 한다).

- [ ] **Step 7: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src
pnpm check
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): 응답 경로 — configureAdminApp · 봉투 인터셉터 · 예외 필터

- configureAdminApp: cookie-parser · JSON 1mb + bigint reviver · json replacer · query parser extended
- AdminEnvelopeInterceptor: { success: true, data }, undefined → null, @RawResponse() · 파일은 그대로
- AdminExceptionFilter: @Catch() 전부, { success: false, code, message, details? }, 5xx 마스킹 · 로그,
  Express 413/400 · 404 · 퍼센트 인코딩 오류도 봉투, 헤더가 나간 뒤면 응답만 닫음, stringifyJSON 으로 직접 직렬화
- 프로브 모듈로 HTTP 계약 테스트(__proto__ 쿼리 · 비객체 JSON 포함)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `AdminServerModule` — `forRoot` · `forRootAsync` · prefix · 부팅 검사

**Files:**

- Create: `packages/admin-server/src/admin-server.module.ts`
- Test: `packages/admin-server/src/admin-server.module.test.ts`

**Interfaces:**

- Consumes: Task 2 `createAdminKysely`, Task 5 토큰 · 옵션 · 인터셉터 · 필터 · `createHttpApp` · `ProbeModule`
- Produces:
  - `class AdminServerModule { static forRoot(options: AdminServerOptions & AdminServerStaticOptions): DynamicModule; static forRootAsync(options: AdminServerAsyncOptions): DynamicModule }`
  - 내부(공개 아님): `buildAdminServerModule(staticOptions: AdminServerStaticOptions, optionsProvider: Provider, imports: NonNullable<ModuleMetadata['imports']>, routeModules: readonly Type[]): DynamicModule`

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/admin-server.module.test.ts`:

```ts
import { Controller, Get, Module, type DynamicModule } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { defineErrorCodes } from '@ssworks/admin-shared'
import { Kysely } from 'kysely'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { AdminServerModule, buildAdminServerModule } from './admin-server.module.js'
import type { AdminServerOptions } from './options.js'
import { createHttpApp } from './test-support/http.js'
import { ProbeModule } from './test-support/probe.js'
import { ADMIN_SERVER_OPTIONS, KYSELY } from './tokens.js'

const db = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const projectErrors = defineErrorCodes(
  { ERR_PROJECT_GONE: 'ERR_PROJECT_GONE' },
  { ERR_PROJECT_GONE: 410 },
)

@Controller('other')
class OtherController {
  @Get()
  get() {
    return 'other'
  }
}

@Module({ controllers: [OtherController] })
class OtherModule {}

/** KYSELY 를 가짜로 바꿔 띄운다 — HTTP 계약 테스트에는 DB 가 필요 없다 */
async function boot(module: DynamicModule, extra: DynamicModule['imports'] = [], configure = true) {
  const kysely = { destroy: vi.fn(async () => undefined) }
  const app = await createHttpApp(
    { imports: [module, ...(extra ?? [])] },
    { configure, override: (builder) => builder.overrideProvider(KYSELY).useValue(kysely) },
  )
  return { app, kysely }
}

describe('forRoot', () => {
  it('봉투 · 필터를 전역으로 걸고 errorCodes 로 상태를 정한다', async () => {
    const { app } = await boot(AdminServerModule.forRoot({ db, errorCodes: projectErrors }), [
      ProbeModule,
    ])
    try {
      const server = app.getHttpServer()
      expect((await request(server).get('/probe/nothing').expect(200)).body).toEqual({
        success: true,
        data: null,
      })
      await request(server).get('/probe/business/ERR_PROJECT_GONE').expect(410)
      expect(app.get(ADMIN_SERVER_OPTIONS)).toEqual({ db, errorCodes: projectErrors })
    } finally {
      await app.close()
    }
  })

  it('앱을 닫으면 KYSELY 를 destroy 한다', async () => {
    const { app, kysely } = await boot(AdminServerModule.forRoot({ db }))
    await app.close()
    expect(kysely.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('forRootAsync', () => {
  it('useFactory 가 imports · inject 로 옵션을 만든다', async () => {
    const CONFIG = Symbol('CONFIG')
    @Module({
      providers: [{ provide: CONFIG, useValue: { db, errorCodes: projectErrors } }],
      exports: [CONFIG],
    })
    class ConfigStubModule {}

    const { app } = await boot(
      AdminServerModule.forRootAsync({
        imports: [ConfigStubModule],
        inject: [CONFIG],
        useFactory: (config: AdminServerOptions) => config,
      }),
      [ProbeModule],
    )
    try {
      await request(app.getHttpServer()).get('/probe/business/ERR_PROJECT_GONE').expect(410)
    } finally {
      await app.close()
    }
  })
})

describe('KYSELY 팩토리', () => {
  it('🔴 options.db 로 만든 Kysely — 닿지 않는 DB 여도 닫을 때 오류가 새지 않는다', async () => {
    const leaks: unknown[] = []
    const onLeak = (error: unknown) => leaks.push(error)
    process.on('unhandledRejection', onLeak)
    process.on('uncaughtException', onLeak)
    try {
      const ref = await Test.createTestingModule({
        imports: [AdminServerModule.forRoot({ db })],
      }).compile()
      expect(ref.get(KYSELY)).toBeInstanceOf(Kysely)
      await ref.close()
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(leaks).toEqual([])
    } finally {
      process.off('unhandledRejection', onLeak)
      process.off('uncaughtException', onLeak)
    }
  })
})

describe('routePrefix', () => {
  const optionsProvider = { provide: ADMIN_SERVER_OPTIONS, useValue: { db } }

  it('목록의 모듈에 붙이고 목록 밖 모듈은 그대로 — 기본은 admin', async () => {
    const { app } = await boot(buildAdminServerModule({}, optionsProvider, [], [ProbeModule]), [
      ProbeModule,
      OtherModule,
    ])
    try {
      const server = app.getHttpServer()
      await request(server).get('/admin/probe/nothing').expect(200)
      await request(server).get('/probe/nothing').expect(404)
      await request(server).get('/other').expect(200)
    } finally {
      await app.close()
    }
  })

  it('다른 prefix', async () => {
    const { app } = await boot(
      buildAdminServerModule({ routePrefix: 'manage' }, optionsProvider, [], [ProbeModule]),
      [ProbeModule],
    )
    try {
      await request(app.getHttpServer()).get('/manage/probe/nothing').expect(200)
    } finally {
      await app.close()
    }
  })

  it("'' 이면 붙이지 않는다", async () => {
    const { app } = await boot(
      buildAdminServerModule({ routePrefix: '' }, optionsProvider, [], [ProbeModule]),
      [ProbeModule],
    )
    try {
      await request(app.getHttpServer()).get('/probe/nothing').expect(200)
    } finally {
      await app.close()
    }
  })
})

describe('🔴 부팅 검사', () => {
  it('configureAdminApp 을 부르지 않으면 init 에서 멈춘다', async () => {
    await expect(boot(AdminServerModule.forRoot({ db }), [], false)).rejects.toThrow(
      'configureAdminApp',
    )
  })

  it('HTTP 어댑터가 없는 컨텍스트(스크립트)는 검사하지 않는다', async () => {
    const ref = await Test.createTestingModule({ imports: [AdminServerModule.forRoot({ db })] })
      .overrideProvider(KYSELY)
      .useValue({ destroy: async () => undefined })
      .compile()
    await expect(ref.init()).resolves.toBeDefined()
    await ref.close()
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- admin-server.module`
Expected: FAIL — `Cannot find module './admin-server.module.js'`.

- [ ] **Step 3: 구현**

`packages/admin-server/src/admin-server.module.ts`:

```ts
import {
  Inject,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type Provider,
  type Type,
} from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR, HttpAdapterHost, RouterModule } from '@nestjs/core'
import { bigintJsonReplacer } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { createAdminKysely } from './database/kysely.js'
import { AdminEnvelopeInterceptor } from './http/envelope.interceptor.js'
import { AdminExceptionFilter } from './http/exception.filter.js'
import type {
  AdminServerAsyncOptions,
  AdminServerOptions,
  AdminServerStaticOptions,
} from './options.js'
import { ADMIN_SERVER_OPTIONS, KYSELY } from './tokens.js'

// 정본: hangang-home apps/api/src/app.module.ts(전역 필터 · 가드를 DI 로) · gise database.module.ts(onModuleDestroy)
// 바꾼 점: 패키지 코어 모듈이다 — 기능 모듈은 쓰는 쪽 app.module.ts(B)가 골라 import 한다(Phase 2 결정 ④ R2).

/**
 * 패키지가 아는 기능 모듈 — `routePrefix` 를 붙일 대상. 쓰는 쪽이 import 하지 않은 모듈은 `RouterModule` 이 건너뛴다
 * (`@nestjs/core` router-module.js 실측).
 * 🔴 여기 오는 모듈 파일은 이 파일을 import 하지 않는다(순환) — 토큰은 tokens.ts 에서 가져온다.
 * 2a 에는 기능 모듈이 없다. 2b 부터 붙는다.
 */
const ADMIN_ROUTE_MODULES: readonly Type[] = []

const DEFAULT_ROUTE_PREFIX = 'admin'

const BOOT_CHECK_MESSAGE =
  'configureAdminApp(app) 을 app.init() · listen() 전에 불러야 한다 — Express json replacer 가 admin-shared ' +
  'bigintJsonReplacer 가 아니다(bigint 를 담은 응답이 500 이 된다). admin-shared 가 두 벌 설치돼 있어도 이렇게 보인다.'

@Module({})
export class AdminServerModule implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<unknown>,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  static forRoot(options: AdminServerOptions & AdminServerStaticOptions): DynamicModule {
    const { routePrefix, ...resolved } = options
    return buildAdminServerModule(
      { routePrefix },
      { provide: ADMIN_SERVER_OPTIONS, useValue: resolved },
      [],
      ADMIN_ROUTE_MODULES,
    )
  }

  /** 기본 경로 — env 를 부팅 뒤에 읽는다(ESM 은 import 를 먼저 평가해 `forRoot` 인자가 `loadDotEnv()` 보다 먼저 돈다). */
  static forRootAsync(options: AdminServerAsyncOptions): DynamicModule {
    return buildAdminServerModule(
      { routePrefix: options.routePrefix },
      {
        provide: ADMIN_SERVER_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      options.imports ?? [],
      ADMIN_ROUTE_MODULES,
    )
  }

  /**
   * 🔴 `configureAdminApp` 을 빠뜨린 앱은 bigint 응답이 조용히 500 이 된다(gise 실측) — 기동에서 멈춘다.
   *    HTTP 어댑터가 없는 컨텍스트(스크립트 · 마이그레이션 보조)는 보지 않는다.
   */
  onApplicationBootstrap(): void {
    const instance = this.adapterHost.httpAdapter?.getInstance?.() as
      { get?: (key: string) => unknown } | undefined
    if (typeof instance?.get !== 'function') return
    if (instance.get('json replacer') !== bigintJsonReplacer) throw new Error(BOOT_CHECK_MESSAGE)
  }

  /** 🔴 풀은 생성 즉시 연결을 시도하고 재시도 타이머를 남긴다(gise) — 쓰는 쪽 main.ts 가 enableShutdownHooks() 를 부른다. */
  async onModuleDestroy(): Promise<void> {
    await this.db.destroy()
  }
}

/** 내부 빌더 — 테스트는 `routeModules` 에 프로브 모듈을 넘긴다. 공개 API 가 아니다(index 에 없다). */
export function buildAdminServerModule(
  staticOptions: AdminServerStaticOptions,
  optionsProvider: Provider,
  imports: NonNullable<ModuleMetadata['imports']>,
  routeModules: readonly Type[],
): DynamicModule {
  const routePrefix = staticOptions.routePrefix ?? DEFAULT_ROUTE_PREFIX
  const routerImports =
    routePrefix === '' || routeModules.length === 0
      ? []
      : [RouterModule.register(routeModules.map((module) => ({ path: routePrefix, module })))]
  return {
    module: AdminServerModule,
    global: true,
    imports: [...imports, ...routerImports],
    providers: [
      optionsProvider,
      {
        provide: KYSELY,
        useFactory: (options: AdminServerOptions) => createAdminKysely(options.db),
        inject: [ADMIN_SERVER_OPTIONS],
      },
      { provide: APP_FILTER, useClass: AdminExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: AdminEnvelopeInterceptor },
    ],
    exports: [ADMIN_SERVER_OPTIONS, KYSELY],
  }
}
```

- [ ] **Step 4: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- admin-server.module`
Expected: PASS — 9 tests. `KYSELY 팩토리` 가 실패하면(오류가 샌다) 멈추고 보고한다 — 스펙 R7 실측과 다르다는 뜻이다.

- [ ] **Step 5: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/admin-server.module.ts packages/admin-server/src/admin-server.module.test.ts
pnpm check
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): AdminServerModule — forRoot · forRootAsync, admin/ prefix, replacer 부팅 검사

- 전역: ADMIN_SERVER_OPTIONS · KYSELY(createAdminKysely) · AdminExceptionFilter · AdminEnvelopeInterceptor
- RouterModule 로 기능 모듈에 routePrefix(기본 admin) — 2a 는 목록이 비고 테스트는 내부 빌더로 잰다
- configureAdminApp 을 빠뜨리면 onApplicationBootstrap 에서 멈춘다, 닫을 때 KYSELY destroy

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 코어 스키마 — 장 7개 · 테이블 타입 · DDL 검사

**Files:**

- Create: `packages/admin-server/src/database/migrations/_shared.ts`
- Create: `packages/admin-server/src/database/migrations/0001_roles.ts` … `0007_sessions.ts`
- Create: `packages/admin-server/src/database/tables/roles.ts` · `users.ts` · `teams.ts` · `team-closure.ts` · `team-user-map.ts` · `user-employment-periods.ts` · `sessions.ts`
- Create: `packages/admin-server/src/database/types.ts`
- Modify: `packages/admin-server/src/database/kysely.ts`(기본 타입 인자)
- Test: `packages/admin-server/src/database/migrations/ddl.test.ts`

**Interfaces:**

- Consumes: Task 2 `adminKyselyPlugins`
- Produces:
  - 장마다 `up(db: Kysely<unknown>): Promise<void>` · `down(db: Kysely<unknown>): Promise<void>`
  - `interface AdminDatabase { roles: AdminRolesTable; users: AdminUsersTable; teams: AdminTeamsTable; teamClosure: AdminTeamClosureTable; teamUserMap: AdminTeamUserMapTable; userEmploymentPeriods: AdminUserEmploymentPeriodsTable; sessions: AdminSessionsTable }`
  - `type AdminSessionRevokeReason = 'rotated' | 'terminated' | 'reuse_detected'`
  - `createAdminKysely<DB = AdminDatabase>(connection): Kysely<DB>`

- [ ] **Step 1: DDL 검사 테스트를 쓴다**

`packages/admin-server/src/database/migrations/ddl.test.ts`:

```ts
import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { adminKyselyPlugins } from '../kysely.js'
import * as roles from './0001_roles.js'
import * as users from './0002_users.js'
import * as teams from './0003_teams.js'
import * as teamClosure from './0004_team_closure.js'
import * as teamUserMap from './0005_team_user_map.js'
import * as userEmploymentPeriods from './0006_user_employment_periods.js'
import * as sessions from './0007_sessions.js'

// 🔴 마이그레이션 DDL 을 소스 문자열이 아니라 **컴파일된 SQL** 로 잰다(hangang migrations-ddl.test.ts).
//    `sql` 템플릿 안의 식별자는 CamelCasePlugin 이 바꾸지 않는다 — hangang 037 이 그 자리에서 실제 DB 적용 때 죽었다.
//    플러그인은 앱과 같은 `adminKyselyPlugins()`.

type Chapter = { up(db: Kysely<unknown>): Promise<void>; down(db: Kysely<unknown>): Promise<void> }

const CHAPTERS: [string, Chapter][] = [
  ['0001_roles', roles],
  ['0002_users', users],
  ['0003_teams', teams],
  ['0004_team_closure', teamClosure],
  ['0005_team_user_map', teamUserMap],
  ['0006_user_employment_periods', userEmploymentPeriods],
  ['0007_sessions', sessions],
]

async function capture(run: (db: Kysely<unknown>) => Promise<void>): Promise<string[]> {
  const statements: string[] = []
  const db = new Kysely<unknown>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new MysqlIntrospector(kysely),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
    plugins: adminKyselyPlugins(),
    log: (event) => {
      if (event.level === 'query') statements.push(event.query.sql)
    },
  })
  await run(db)
  await db.destroy()
  return statements
}

/** 문자열 리터럴 · 백틱 식별자를 비운 나머지 */
function outsideQuotes(statement: string): string {
  return statement.replace(/'(?:[^']|'')*'/g, "''").replace(/`[^`]*`/g, '``')
}

describe.each(CHAPTERS)('%s', (_id, chapter) => {
  it('up — 백틱 식별자는 전부 snake_case', async () => {
    const statements = await capture((db) => chapter.up(db))
    expect(statements.length).toBeGreaterThan(0)
    const identifiers = statements.flatMap((s) =>
      [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? ''),
    )
    expect(identifiers.filter((name) => !/^[a-z0-9_]+$/.test(name))).toEqual([])
  })

  it('🔴 up — 따옴표 밖에 camelCase 토큰이 없다', async () => {
    const statements = await capture((db) => chapter.up(db))
    const camel = statements.flatMap(
      (s) => outsideQuotes(s).match(/\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g) ?? [],
    )
    expect(camel).toEqual([])
  })

  it('up 의 CREATE TABLE 은 InnoDB · utf8mb4_bin 을 명시한다', async () => {
    const statements = await capture((db) => chapter.up(db))
    for (const statement of statements.filter((s) => s.startsWith('create table'))) {
      expect(statement).toContain('engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin')
    }
  })

  it('down 도 돈다', async () => {
    expect((await capture((db) => chapter.down(db))).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- ddl`
Expected: FAIL — `Cannot find module './0001_roles.js'`.

- [ ] **Step 3: 헬퍼와 장을 쓴다**

`packages/admin-server/src/database/migrations/_shared.ts`:

```ts
import { sql } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/migrations/_shared.ts
// 바꾼 점: 이 패키지 장이 쓰는 것만 남겼다(ASCII_CI 뺌).

/**
 * 🔴 모든 `createTable` 의 꼬리에 붙인다. 서버 기본 collation 이 바뀌어도 테이블이 조용히 갈리지 않게 명시한다.
 * 대소문자를 무시해야 하는 컬럼은 `UTF8_CI` 를 컬럼마다 붙인다 — 빠뜨리면 UNIQUE 가 `admin` · `Admin` 을 둘 다 허용한다.
 */
export const TABLE_OPTIONS = sql`engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin`

/** 대소문자를 무시하는 컬럼 — 로그인 아이디 · 사람이 입력하는 이름(UNIQUE · LIKE · 정렬 대상) */
export const UTF8_CI = sql`collate utf8mb4_unicode_ci`

/** 토큰 · 해시 — 대소문자가 값의 일부다 */
export const ASCII_BIN = sql`collate ascii_bin`

/** MariaDB 의 `JSON` 은 `LONGTEXT` 별칭이며 정의상 `utf8mb4_bin` 이다 */
export const JSON_BIN = sql`collate utf8mb4_bin`

/** 컬럼 설명. 정의 시점에 붙인다(나중의 `ALTER … MODIFY` 우회를 쓰지 않는다) */
export const comment = (text: string) => sql`comment ${sql.lit(text)}`
```

`packages/admin-server/src/database/migrations/0001_roles.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { JSON_BIN, TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/001_roles.migration.ts + 014_roles_role_name_unique.migration.ts
// 바꾼 점:
//  - roleName UNIQUE 를 첫 장에서 건다(hangang 은 014 에서 중복 진단 뒤). 새 스키마라 진단할 기존 행이 없다.
//  - `revision` 을 더했다 — Phase 0 §4 #4(쓰기 보호 revision 기본). 수정 · 삭제 성공마다 서비스가 올리고 이동은 올리지
//    않는다(3b §9).
//  - 인자 타입은 `Kysely<unknown>`(스펙 R2). 🔴 현재의 Database 타입에 묶지 않는다 — 마이그레이션은 얼어붙은 이력이다.
// 🔴 순서상 첫째다 — users 가 이 테이블을 FK 로 참조한다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('roles')
    .addColumn('roleNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('roleName', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('직책 이름')),
    )
    .addColumn('permissions', 'json', (col) =>
      col
        .notNull()
        .modifyFront(JSON_BIN)
        .modifyEnd(comment("권한 키 배열. 전권자는 ['*'] 한 원소")),
    )
    .addColumn('displayOrder', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('화면 표시 순서')),
    )
    // 🔴 'tinyint(1)' 문자열은 Kysely 의 ColumnDataType 폐집합에 없다 — sql 템플릿으로 넘기는 것이 Kysely 문서의 우회다.
    .addColumn('isDefault', sql`tinyint(1)`, (col) =>
      col.notNull().defaultTo(0).modifyEnd(comment('신규 계정의 기본 직책')),
    )
    .addColumn('revision', 'integer', (col) =>
      col
        .unsigned()
        .notNull()
        .defaultTo(0)
        .modifyEnd(comment('낙관적 잠금. 수정 · 삭제마다 오른다(이동은 아님)')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint('uqRolesRoleName', ['roleName'])
    .modifyEnd(TABLE_OPTIONS)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('roles').execute()
}
```

`packages/admin-server/src/database/migrations/0002_users.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/002_users.migration.ts
// 바꾼 점:
//  - `password` 를 varchar(255) 로 — hangang 은 char(128). argon2id 인코딩은 97자 안팎이나 매개변수가 바뀌면 는다(gise).
//    이름은 hangang · crm · axion 의 `password` — 기본 AUTH_REPOSITORY(2b)가 기대는 이름이다.
//  - `revision` 을 더했다(Phase 0 §4 #4). 쓰는 법은 2d 가 정한다.
// 🔴 roleNo 는 NOT NULL + FK restrict(스펙 F15) — 직책 없는 계정이 생기지 않고, 쓰는 중인 역할 삭제는 DB 가 막는다.
// 🔴 관리자 계정은 `users` 를 그대로 쓴다(hangang §7-1) — 인증 가드 · 감사가 users/userNo 를 전제한다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('userNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('userId', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('로그인 아이디')),
    )
    .addColumn('password', 'varchar(255)', (col) =>
      col.notNull().modifyEnd(comment('argon2id 해시. 원문을 저장하지 않는다')),
    )
    .addColumn('userName', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('표시 이름')),
    )
    .addColumn('roleNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('joinAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('현재 활성 재직 사이클의 캐시. 원천은 userEmploymentPeriods')),
    )
    .addColumn('resignAt', 'timestamp', (col) => col.modifyEnd(comment('NULL 이 아니면 퇴사')))
    .addColumn('isPasswordChangeRequired', sql`tinyint(1)`, (col) =>
      col
        .notNull()
        .defaultTo(0)
        .modifyEnd(comment('임시 비밀번호 — 첫 로그인에서 변경을 요구한다')),
    )
    .addColumn('loginFailCount', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('연속 로그인 실패 횟수')),
    )
    .addColumn('lockUntil', 'datetime', (col) => col.modifyEnd(comment('이 시각까지 로그인 잠김')))
    .addColumn('revision', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('낙관적 잠금')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint('uqUsersUserId', ['userId'])
    .addForeignKeyConstraint('fkUsersRole', ['roleNo'], 'roles', ['roleNo'], (cb) =>
      cb.onDelete('restrict').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('users').execute()
}
```

`packages/admin-server/src/database/migrations/0003_teams.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, UTF8_CI, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/003_teams.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).
// 🔴 teamName UNIQUE 가 동시 요청의 최종 방어선이다. 서비스는 그 위반을 ERR_DUPLICATE_TEAM_NAME 으로 바꿔 낸다(3d §9).
// 계층은 teamClosure 에만 있다 — teams 에 parentNo 가 없다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('teams')
    .addColumn('teamNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('teamName', 'varchar(64)', (col) =>
      col.modifyFront(UTF8_CI).notNull().modifyEnd(comment('팀 이름')),
    )
    .addColumn('displayOrder', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('형제 사이 표시 순서')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updateAt', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint('uqTeamsName', ['teamName'])
    .modifyEnd(TABLE_OPTIONS)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('teams').execute()
}
```

`packages/admin-server/src/database/migrations/0004_team_closure.ts`:

```ts
import type { Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/004_team_closure.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).
// 🔴 계층 정보는 여기에만 있다. 트리거 · 프로시저가 없으므로 유지는 전적으로 애플리케이션 책임이다(2e).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('teamClosure')
    .addColumn('ancestorNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('descendantNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('depth', 'integer', (col) =>
      col.unsigned().notNull().defaultTo(0).modifyEnd(comment('0 이면 자기 참조')),
    )
    .addPrimaryKeyConstraint('pkTeamClosure', ['ancestorNo', 'descendantNo'])
    .addForeignKeyConstraint('fkTeamClosureAncestor', ['ancestorNo'], 'teams', ['teamNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .addForeignKeyConstraint(
      'fkTeamClosureDescendant',
      ['descendantNo'],
      'teams',
      ['teamNo'],
      (cb) => cb.onDelete('cascade').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxTeamClosureDescendant')
    .on('teamClosure')
    .columns(['descendantNo'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('teamClosure').execute()
}
```

`packages/admin-server/src/database/migrations/0005_team_user_map.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/005_team_user_map.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('teamUserMap')
    .addColumn('teamNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('userNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('joinAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('이 팀에 배정된 시각')),
    )
    .addPrimaryKeyConstraint('pkTeamUserMap', ['teamNo', 'userNo'])
    .addForeignKeyConstraint('fkTeamUserMapTeam', ['teamNo'], 'teams', ['teamNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .addForeignKeyConstraint('fkTeamUserMapUser', ['userNo'], 'users', ['userNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema.createIndex('idxTeamUserMapUser').on('teamUserMap').columns(['userNo']).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('teamUserMap').execute()
}
```

`packages/admin-server/src/database/migrations/0006_user_employment_periods.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/008_user_employment_periods.migration.ts
// 바꾼 점: 없음(인자 타입만 — 스펙 R2).
// 🔴 userNo FK 는 RESTRICT — 계정을 지우는 경로를 만들지 않는다. 퇴사는 resignAt 으로 표현한다(hangang).
// ⚠️ "활성 사이클은 계정당 하나" 는 DB 가 강제하지 못한다(MariaDB 에 부분 UNIQUE 인덱스가 없다) — 서비스(2d)가 지킨다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('userEmploymentPeriods')
    .addColumn('periodNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('userNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('joinAt', 'date', (col) => col.notNull().modifyEnd(comment('입사일')))
    .addColumn('resignAt', 'date', (col) => col.modifyEnd(comment('NULL 이면 활성 사이클')))
    .addColumn('reason', 'varchar(255)', (col) => col.modifyEnd(comment('퇴사 · 재입사 사유')))
    .addColumn('recordedTimezone', 'varchar(64)', (col) =>
      col.notNull().modifyEnd(comment('기록 시점 프로세스 TZ. 패키지는 항상 UTC')),
    )
    .addColumn('createdBy', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('기록한 관리자. 최초 입사 행은 NULL')),
    )
    .addColumn('createAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addForeignKeyConstraint('fkUserEmploymentPeriodsUser', ['userNo'], 'users', ['userNo'], (cb) =>
      cb.onDelete('restrict').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxUserEmploymentPeriodsUserJoin')
    .on('userEmploymentPeriods')
    .columns(['userNo', 'joinAt'])
    .execute()

  await db.schema
    .createIndex('idxUserEmploymentPeriodsActive')
    .on('userEmploymentPeriods')
    .columns(['userNo', 'resignAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('userEmploymentPeriods').execute()
}
```

`packages/admin-server/src/database/migrations/0007_sessions.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: hangang-home apps/api/src/core/database/migrations/006_sessions.migration.ts + 011_sessions_revoke_reason.migration.ts
//       + ssworks-gise-home 003_session_grace.migration.ts(유예창 컬럼)
// 바꾼 점:
//  - `deviceInfo` → `userAgent` — admin-shared `adminSessionSchema` 의 필드 이름이다. 응답에서 바꿔 담지 않는다.
//  - 유예창 컬럼 `revokedAt` · `replacedBySessionNo` 를 처음부터 둔다(gise 003, `replacedBySessionNo` 는 bigint). Phase 0
//    §4 #6 이 유예창을 옵션으로 정했고 쓸지는 2b 가 정한다.
//  - 🔴 `lastAccessAt` 에 `ON UPDATE` 를 두지 않는다 — 폐기 UPDATE 에도 반응해 마지막 활동 시각이 바뀐다. 앱이 직접 쓴다.
//  - 🔴 `loginAt` 은 앱이 넣을 수 있다 — 회전은 새 행을 만들고 옛 행의 loginAt 을 옮겨 담는다(2b). hangang 은 DB 기본값뿐이라
//    살아 있는 행의 "로그인 시각" 이 마지막 회전 시각이 됐다.
// 🔴 refresh 토큰 원문을 저장하지 않는다 — sha256 hex 64자만(hangang). 덤프 한 장이 유효 토큰 전량 유출이 되지 않는다.
// 🔴 `revokedReason` 은 'rotated' 만 재사용 판정 대상이다. 'terminated'(명시적 종료) · 'reuse_detected'(탐지 연쇄 폐기)는
//    "세션이 끝났다" 로만 응답한다 — 관리자 강제 종료가 재사용 탐지로 오인돼 전 기기가 로그아웃되던 문제를 닫는다(hangang 011).
// 🔴 `expireAt` · `revokedAt` 은 datetime — timestamp NOT NULL 을 DEFAULT 없이 두면 동작이 서버 전역
//    explicit_defaults_for_timestamp 에 달린다(hangang §16).
// 🔴 `replacedBySessionNo` 에 자기 참조 FK · 인덱스를 두지 않는다 — 읽기만 하고 조건으로 검색하지 않는다(gise 003).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('sessions')
    .addColumn('sessionNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('userNo', 'bigint', (col) => col.unsigned().notNull())
    .addColumn('refreshTokenHash', 'char(64)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('sha256(refresh 토큰) hex. 원문을 저장하지 않는다')),
    )
    .addColumn('userAgent', 'varchar(512)', (col) => col.modifyEnd(comment('User-Agent 원문')))
    .addColumn('ipAddress', 'varchar(45)', (col) =>
      col.modifyEnd(comment('로그인 시점 IP. IPv4-mapped IPv6 최대 45자')),
    )
    .addColumn('loginAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('최초 로그인 시각. 회전이 옮겨 담는다')),
    )
    .addColumn('lastAccessAt', 'timestamp', (col) =>
      col
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP`)
        .modifyEnd(comment('마지막 활동. 앱이 쓴다')),
    )
    .addColumn('expireAt', 'datetime', (col) =>
      col.notNull().modifyEnd(comment('refresh 만료. 애플리케이션이 항상 값을 넣는다')),
    )
    .addColumn('isRevoked', sql`tinyint(1)`, (col) =>
      col.notNull().defaultTo(0).modifyEnd(comment('폐기됨(회전 · 종료 · 재사용 탐지)')),
    )
    .addColumn('revokedReason', 'varchar(16)', (col) =>
      col.modifyEnd(comment("NULL | 'rotated' | 'terminated' | 'reuse_detected'")),
    )
    .addColumn('revokedAt', 'datetime', (col) =>
      col.modifyEnd(comment('폐기 시각. 유예창 판정 기준')),
    )
    .addColumn('replacedBySessionNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('회전으로 이 세션을 대체한 새 세션. 최초 회전만 기록한다')),
    )
    .addUniqueConstraint('uqSessionsRefreshTokenHash', ['refreshTokenHash'])
    .addForeignKeyConstraint('fkSessionsUser', ['userNo'], 'users', ['userNo'], (cb) =>
      cb.onDelete('cascade').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema.createIndex('idxSessionsUser').on('sessions').columns(['userNo']).execute()
  await db.schema.createIndex('idxSessionsExpireAt').on('sessions').columns(['expireAt']).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('sessions').execute()
}
```

- [ ] **Step 4: 테이블 타입**

`packages/admin-server/src/database/tables/roles.ts`:

```ts
import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/roles.table.ts
// 바꾼 점: `revision` 추가. `permissions` 의 읽기 타입을 unknown 으로 — 드라이버 autoJsonMap 이 파싱된 값과 문자열 둘 다
//   줄 수 있어 `readJsonColumn` + zod 를 거치게 한다(gise). 프로젝트 권한 타입은 패키지가 모른다.

export interface AdminRolesTable {
  roleNo: Generated<bigint>
  roleName: string
  /** JSON 문자열 배열. 쓰기는 `JSON.stringify`, 읽기는 `readJsonColumn` + zod */
  permissions: ColumnType<unknown, string, string>
  displayOrder: Generated<number>
  isDefault: Generated<boolean>
  revision: Generated<number>
  createAt: ColumnType<Date, never, never>
  updateAt: ColumnType<Date, never, never>
}
```

`packages/admin-server/src/database/tables/users.ts`:

```ts
import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/users.table.ts
// 바꾼 점: `revision` 추가.

export interface AdminUsersTable {
  userNo: Generated<bigint>
  userId: string
  /** argon2id 해시. 원문이 들어오는 일이 없어야 한다 */
  password: string
  userName: string
  roleNo: bigint
  /** 현재 활성 재직 사이클의 캐시 — 원천은 userEmploymentPeriods. DB 기본값이 있어 넣을 때 생략할 수 있다 */
  joinAt: ColumnType<Date, Date | undefined, Date>
  /** NULL 이 아니면 퇴사 */
  resignAt: Date | null
  isPasswordChangeRequired: Generated<boolean>
  loginFailCount: Generated<number>
  /** NULL 이 아니고 미래면 로그인 잠김 */
  lockUntil: Date | null
  revision: Generated<number>
  createAt: ColumnType<Date, never, never>
  updateAt: ColumnType<Date, never, never>
}
```

`packages/admin-server/src/database/tables/teams.ts`:

```ts
import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/teams.table.ts
// 바꾼 점: 없음.

export interface AdminTeamsTable {
  teamNo: Generated<bigint>
  teamName: string
  displayOrder: Generated<number>
  createAt: ColumnType<Date, never, never>
  updateAt: ColumnType<Date, never, never>
}
```

`packages/admin-server/src/database/tables/team-closure.ts`:

```ts
// 정본: hangang-home apps/api/src/core/database/tables/team-closure.table.ts
// 바꾼 점: 없음.

export interface AdminTeamClosureTable {
  ancestorNo: bigint
  descendantNo: bigint
  /** 0 이면 자기 참조 */
  depth: number
}
```

`packages/admin-server/src/database/tables/team-user-map.ts`:

```ts
import type { ColumnType } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/team-user-map.table.ts
// 바꾼 점: 없음.

export interface AdminTeamUserMapTable {
  teamNo: bigint
  userNo: bigint
  /** DB 기본값이 있어 넣을 때 생략할 수 있다 */
  joinAt: ColumnType<Date, Date | undefined, Date>
}
```

`packages/admin-server/src/database/tables/user-employment-periods.ts`:

```ts
import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/user-employment-periods.table.ts
// 바꾼 점: 없음.

export interface AdminUserEmploymentPeriodsTable {
  periodNo: Generated<bigint>
  userNo: bigint
  /** 입사일(DATE) */
  joinAt: Date
  /** NULL 이면 활성 사이클 */
  resignAt: Date | null
  reason: string | null
  /** 기록 시점 프로세스 TZ. 패키지는 항상 'UTC' */
  recordedTimezone: string
  /** 기록한 관리자. 최초 입사 행은 NULL */
  createdBy: bigint | null
  createAt: ColumnType<Date, never, never>
}
```

`packages/admin-server/src/database/tables/sessions.ts`:

```ts
import type { ColumnType, Generated } from 'kysely'

// 정본: hangang-home apps/api/src/core/database/tables/sessions.table.ts + gise 003(유예창 컬럼)
// 바꾼 점: `deviceInfo` → `userAgent`, `loginAt` 을 넣을 수 있게, `lastAccessAt` 을 쓸 수 있게, 유예창 컬럼 둘.

/** 🔴 `'rotated'` 만 재사용 판정 대상이다. `null` 은 아직 폐기되지 않은 세션 */
export type AdminSessionRevokeReason = 'rotated' | 'terminated' | 'reuse_detected'

export interface AdminSessionsTable {
  sessionNo: Generated<bigint>
  userNo: bigint
  /** 🔴 sha256(토큰) hex 64자. 이름이 원문을 암시하면 나중에 누군가 원문을 넣는다(hangang) */
  refreshTokenHash: string
  userAgent: string | null
  ipAddress: string | null
  /** 🔴 회전이 새 행에 옛 값을 옮겨 담는다 — 넣을 수 있고 고칠 수 없다 */
  loginAt: ColumnType<Date, Date | undefined, never>
  /** 🔴 ON UPDATE 없음 — 앱이 직접 쓴다 */
  lastAccessAt: ColumnType<Date, Date | undefined, Date>
  expireAt: Date
  isRevoked: Generated<boolean>
  revokedReason: AdminSessionRevokeReason | null
  revokedAt: Date | null
  replacedBySessionNo: bigint | null
}
```

`packages/admin-server/src/database/types.ts`:

```ts
import type { AdminRolesTable } from './tables/roles.js'
import type { AdminSessionsTable } from './tables/sessions.js'
import type { AdminTeamClosureTable } from './tables/team-closure.js'
import type { AdminTeamUserMapTable } from './tables/team-user-map.js'
import type { AdminTeamsTable } from './tables/teams.js'
import type { AdminUserEmploymentPeriodsTable } from './tables/user-employment-periods.js'
import type { AdminUsersTable } from './tables/users.js'

// 정본: hangang-home apps/api/src/core/database/types.ts(테이블 파일 분리 + 조합)
// 바꾼 점: 코어 7키만. 쓰는 쪽은 `interface Database extends AdminDatabase { posts: PostsTable }` 로 넓힌다 — 코어 테이블에
//   컬럼을 더하려면 `users: AdminUsersTable & { email: string | null }`. 🔴 패키지 코드는 더한 컬럼을 모르므로 NOT NULL
//   확장 컬럼은 DEFAULT 를 둬야 한다(Phase 0 §5).

export interface AdminDatabase {
  roles: AdminRolesTable
  users: AdminUsersTable
  teams: AdminTeamsTable
  teamClosure: AdminTeamClosureTable
  teamUserMap: AdminTeamUserMapTable
  userEmploymentPeriods: AdminUserEmploymentPeriodsTable
  sessions: AdminSessionsTable
}

export type {
  AdminRolesTable,
  AdminSessionsTable,
  AdminTeamClosureTable,
  AdminTeamUserMapTable,
  AdminTeamsTable,
  AdminUserEmploymentPeriodsTable,
  AdminUsersTable,
}
export type { AdminSessionRevokeReason } from './tables/sessions.js'
```

`packages/admin-server/src/database/kysely.ts` 에서 `createAdminKysely` 선언 한 줄과 import 를 바꾼다:

```ts
import type { AdminDatabase } from './types.js'
```

```ts
export function createAdminKysely<DB = AdminDatabase>(connection: AdminDbConnection): Kysely<DB> {
```

- [ ] **Step 5: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- ddl`
Expected: PASS — 7장 × 4 = 28. camelCase 토큰이 걸리면 그 장의 `sql` 조각에 식별자를 쓴 것이다 — 빌더 메서드로 바꾼다.

- [ ] **Step 6: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/database
pnpm check
git add packages/admin-server/src/database
git commit -m "$(cat <<'EOF'
feat(admin-server): 코어 스키마 7장 · AdminDatabase 타입

- roles · users · teams · teamClosure · teamUserMap · userEmploymentPeriods · sessions(hangang 바탕)
- 바꾼 점: roles · users revision, roleName UNIQUE 를 첫 장에, password varchar(255), userAgent 이름,
  세션 유예창 컬럼, loginAt 넣기 가능 · lastAccessAt ON UPDATE 없음, users.roleNo NOT NULL + restrict
- DDL 검사: 컴파일된 SQL 의 식별자가 snake_case, 따옴표 밖 camelCase 없음(hangang 037)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 마이그레이션 목록 · 스텁 검사 · 진입점

**Files:**

- Create: `packages/admin-server/src/database/migrations/index.ts` · `index.test.ts`
- Create: `packages/admin-server/src/runner.ts`
- Modify: `packages/admin-server/src/index.ts`(전체)
- Test: `packages/admin-server/src/runner-graph.test.ts`

**Interfaces:**

- Consumes: Task 1~7 의 공개 이름 전부
- Produces:
  - `ADMIN_MIGRATIONS: readonly ['0001_roles', '0002_users', '0003_teams', '0004_team_closure', '0005_team_user_map', '0006_user_employment_periods', '0007_sessions']` · `type AdminMigrationId`
  - `assertAdminMigrationStubs(folder: string | URL): void` · `findStubProblems(found: readonly StubReference[]): string[]` · `interface StubReference { id: string; file: string }`
  - 내부(공개 아님): `adminMigrationRecord(): Record<string, Migration>`(Task 9 하네스가 쓴다)

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/database/migrations/index.test.ts`:

```ts
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ADMIN_MIGRATIONS,
  adminMigrationRecord,
  assertAdminMigrationStubs,
  findStubProblems,
} from './index.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('ADMIN_MIGRATIONS', () => {
  it('0001~0007 순서', () => {
    expect(ADMIN_MIGRATIONS).toEqual([
      '0001_roles',
      '0002_users',
      '0003_teams',
      '0004_team_closure',
      '0005_team_user_map',
      '0006_user_employment_periods',
      '0007_sessions',
    ])
  })

  it('🔴 장 파일 이름과 ID 가 같다 — 스텁의 `migrations/<id>` 가 dist 의 그 파일로 풀린다', () => {
    const files = readdirSync(here)
      .filter((name) => /^\d{4}_[a-z_]+\.ts$/.test(name))
      .map((name) => name.replace(/\.ts$/, ''))
      .sort()
    expect(files).toEqual([...ADMIN_MIGRATIONS])
  })

  it('adminMigrationRecord 는 장마다 up · down', () => {
    const record = adminMigrationRecord()
    expect(Object.keys(record)).toEqual([...ADMIN_MIGRATIONS])
    for (const migration of Object.values(record)) {
      expect(typeof migration.up).toBe('function')
      expect(typeof migration.down).toBe('function')
    }
  })
})

const all = ADMIN_MIGRATIONS.map((id, index) => ({ id, file: `00${index + 1}_admin.ts` }))

describe('findStubProblems', () => {
  it('다 있고 순서가 맞으면 문제 없음', () => {
    expect(findStubProblems(all)).toEqual([])
  })

  it('빠진 장', () => {
    expect(findStubProblems(all.filter((ref) => ref.id !== '0003_teams'))).toEqual([
      '빠진 장 0003_teams',
    ])
  })

  it('🔴 순서 어긋남 — FK 때문에 roles 가 users 앞이어야 한다', () => {
    const swapped = [all[1]!, all[0]!, ...all.slice(2)]
    expect(findStubProblems(swapped)).toEqual([
      '파일 이름 순서가 장 순서와 다르다 — 지금: 0002_users, 0001_roles, 0003_teams, 0004_team_closure, ' +
        '0005_team_user_map, 0006_user_employment_periods, 0007_sessions / 맞는 순서: 0001_roles, 0002_users, ' +
        '0003_teams, 0004_team_closure, 0005_team_user_map, 0006_user_employment_periods, 0007_sessions',
    ])
  })

  it('모르는 장 · 겹친 장', () => {
    expect(
      findStubProblems([
        ...all,
        { id: '0099_nope', file: 'x.ts' },
        { id: '0001_roles', file: 'y.ts' },
      ]),
    ).toEqual([
      '모르는 장 0099_nope (x.ts)',
      '장 0001_roles 가 두 파일에 있다 (001_admin.ts, y.ts)',
    ])
  })
})

describe('assertAdminMigrationStubs', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ak-stub-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeStubs(ids: readonly string[]): void {
    ids.forEach((id, index) => {
      writeFileSync(
        join(dir, `00${index + 1}_admin_${id.slice(5)}.migration.ts`),
        `export { up, down } from '@ssworks/admin-server/migrations/${id}'\n`,
      )
    })
  }

  it('다 있으면 통과 — 프로젝트 장 · .d.ts 는 무시', () => {
    writeStubs(ADMIN_MIGRATIONS)
    writeFileSync(join(dir, '100_posts.migration.ts'), 'export async function up() {}\n')
    writeFileSync(
      join(dir, '001_admin_roles.migration.d.ts'),
      "from '@ssworks/admin-server/migrations/0099_nope'\n",
    )
    expect(() => assertAdminMigrationStubs(dir)).not.toThrow()
    expect(() => assertAdminMigrationStubs(pathToFileURL(dir))).not.toThrow()
  })

  it('한 파일 안에서 같은 ID 를 두 번 써도(주석 등) 한 번으로 센다', () => {
    writeStubs(ADMIN_MIGRATIONS)
    writeFileSync(
      join(dir, '001_admin_roles.migration.ts'),
      "// @ssworks/admin-server/migrations/0001_roles\nexport { up, down } from '@ssworks/admin-server/migrations/0001_roles'\n",
    )
    expect(() => assertAdminMigrationStubs(dir)).not.toThrow()
  })

  it('🔴 빠진 장을 모아 한 번에 던진다', () => {
    writeStubs(ADMIN_MIGRATIONS.slice(0, 5))
    expect(() => assertAdminMigrationStubs(dir)).toThrow(
      /빠진 장 0006_user_employment_periods\n- 빠진 장 0007_sessions/,
    )
  })

  it('없는 폴더는 경로를 담아 던진다', () => {
    expect(() => assertAdminMigrationStubs(join(dir, 'none'))).toThrow(
      '마이그레이션 폴더를 읽지 못했다',
    )
  })
})
```

`packages/admin-server/src/runner-graph.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- migrations/index runner-graph`
Expected: FAIL — `Cannot find module './index.js'`(migrations) · `runner.ts` 없음(ENOENT).

- [ ] **Step 3: 구현**

`packages/admin-server/src/database/migrations/index.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Migration } from 'kysely/migration'
import * as roles from './0001_roles.js'
import * as users from './0002_users.js'
import * as teams from './0003_teams.js'
import * as teamClosure from './0004_team_closure.js'
import * as teamUserMap from './0005_team_user_map.js'
import * as userEmploymentPeriods from './0006_user_employment_periods.js'
import * as sessions from './0007_sessions.js'

// 코어 장 목록과 스텁 검사(Phase 2 결정 ③ S1).
//
// 쓰는 쪽은 자기 마이그레이션 폴더에 장마다 한 줄 스텁을 둔다:
//   export { up, down } from '@ssworks/admin-server/migrations/0001_roles'
// kysely-ctl 은 모듈의 `up` 만 본다(hangang 테넌트 폴더 스텁 실증). 번호는 쓰는 쪽이 정해 확장 ALTER 를 사이에 끼운다.
//
// 🔴 provider 로 자동 병합하지 않는 이유: Kysely Migrator 는 이름순으로 정렬하고 이미 적용된 장보다 앞에 새 장이 오면
//    거부한다(allowUnorderedMigrations: false). 패키지 장과 프로젝트 장이 따로 자라면 언젠가 그렇게 된다(스펙 §1-5).

export const ADMIN_MIGRATIONS = [
  '0001_roles',
  '0002_users',
  '0003_teams',
  '0004_team_closure',
  '0005_team_user_map',
  '0006_user_employment_periods',
  '0007_sessions',
] as const

export type AdminMigrationId = (typeof ADMIN_MIGRATIONS)[number]

const CHAPTERS: Readonly<Record<AdminMigrationId, Migration>> = {
  '0001_roles': roles,
  '0002_users': users,
  '0003_teams': teams,
  '0004_team_closure': teamClosure,
  '0005_team_user_map': teamUserMap,
  '0006_user_employment_periods': userEmploymentPeriods,
  '0007_sessions': sessions,
}

/** 패키지 테스트 하네스용 — 장 모듈을 Kysely `Migrator` provider 모양으로. 🔴 공개 API 가 아니다(쓰는 쪽은 스텁). */
export function adminMigrationRecord(): Record<string, Migration> {
  return Object.fromEntries(ADMIN_MIGRATIONS.map((id) => [id, CHAPTERS[id]]))
}

export interface StubReference {
  id: string
  file: string
}

const STUB_SPECIFIER = /@ssworks\/admin-server\/migrations\/(\d{4}_[a-z_]+)/g
const MIGRATION_FILE = /\.m?[jt]s$/
const DECLARATION_FILE = /\.d\.m?ts$/

/** 순수 판정 — 파일 이름순으로 모은 스텁 참조에서 문제를 문장으로. */
export function findStubProblems(found: readonly StubReference[]): string[] {
  const problems: string[] = []
  const known = new Set<string>(ADMIN_MIGRATIONS)
  const firstFile = new Map<string, string>()
  const order: string[] = []
  for (const { id, file } of found) {
    if (!known.has(id)) {
      problems.push(`모르는 장 ${id} (${file})`)
    } else if (firstFile.has(id)) {
      problems.push(`장 ${id} 가 두 파일에 있다 (${firstFile.get(id)}, ${file})`)
    } else {
      firstFile.set(id, file)
      order.push(id)
    }
  }
  for (const id of ADMIN_MIGRATIONS) if (!firstFile.has(id)) problems.push(`빠진 장 ${id}`)
  const expected = ADMIN_MIGRATIONS.filter((id) => firstFile.has(id))
  if (order.join() !== expected.join()) {
    problems.push(
      `파일 이름 순서가 장 순서와 다르다 — 지금: ${order.join(', ')} / 맞는 순서: ${expected.join(', ')}`,
    )
  }
  return problems
}

/**
 * 쓰는 쪽 마이그레이션 폴더의 스텁을 확인한다 — 빠진 장 · 순서 어긋남 · 모르는 · 겹친 ID 를 **한 번에** 모아 던진다.
 * `kysely.config.ts` 에서 부르면 `kysely migrate` 가 시작 전에 멈춘다. `folder` 는 kysely-ctl `migrationFolder` 와 같이
 * cwd 기준이다. 파일 이름순은 `Array#sort`(Kysely Migrator 와 같은 비교).
 */
export function assertAdminMigrationStubs(folder: string | URL): void {
  const dir = folder instanceof URL ? fileURLToPath(folder) : folder
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (error) {
    throw new Error(`마이그레이션 폴더를 읽지 못했다: ${dir}`, { cause: error })
  }
  const found: StubReference[] = []
  for (const file of names
    .filter((name) => MIGRATION_FILE.test(name) && !DECLARATION_FILE.test(name))
    .sort()) {
    const ids = new Set<string>()
    for (const match of readFileSync(join(dir, file), 'utf8').matchAll(STUB_SPECIFIER))
      ids.add(match[1] ?? '')
    for (const id of ids) found.push({ id, file })
  }
  const problems = findStubProblems(found)
  if (problems.length > 0) {
    throw new Error(
      `코어 마이그레이션 스텁이 맞지 않는다 (${dir}):\n- ${problems.join('\n- ')}\n` +
        "스텁 한 줄: export { up, down } from '@ssworks/admin-server/migrations/<id>'",
    )
  }
}
```

`packages/admin-server/src/runner.ts`:

```ts
// @ssworks/admin-server/runner — Nest 를 싣지 않는 것만. kysely.config.ts(마이그레이션 러너) · 시드 스크립트 ·
// main.ts 의 NestFactory 전 단계가 쓴다.
// 🔴 이 파일에서 닿는 상대 import 어디에도 @nestjs/* · express 가 없어야 한다(runner-graph.test.ts 가 지킨다).

export { parseDotEnv, loadDotEnv, requireEnv } from './config/env.js'
export { isEffectiveUtc, assertUtcTimezone } from './config/timezone.js'
export {
  type AdminDbConnection,
  adminPoolConfig,
  adminDbConnectionFromEnv,
  poolEnvInt,
} from './database/connection.js'
export { adminKyselyPlugins, createAdminKysely } from './database/kysely.js'
export { BooleanTransformPlugin } from './database/boolean-transform.plugin.js'
export { runQuery, runWriteTransaction } from './database/run.js'
export { mapError } from './database/map-error.js'
export { readJsonColumn } from './database/json.js'
export {
  ADMIN_MIGRATIONS,
  type AdminMigrationId,
  assertAdminMigrationStubs,
} from './database/migrations/index.js'
export type {
  AdminDatabase,
  AdminRolesTable,
  AdminUsersTable,
  AdminTeamsTable,
  AdminTeamClosureTable,
  AdminTeamUserMapTable,
  AdminUserEmploymentPeriodsTable,
  AdminSessionsTable,
  AdminSessionRevokeReason,
} from './database/types.js'
```

`packages/admin-server/src/index.ts` 전체:

```ts
// @ssworks/admin-server — 관리자 API 공통 NestJS 모듈 (Phase 2).
// 진입점: `.`(전부) · `./runner`(Nest 무의존) · `./migrations/<id>`(코어 장 하나 — 스텁이 가리킨다).

export * from './runner.js'

export { AdminServerModule } from './admin-server.module.js'
export type {
  AdminServerOptions,
  AdminServerStaticOptions,
  AdminServerAsyncOptions,
} from './options.js'
export { KYSELY, ADMIN_SERVER_OPTIONS } from './tokens.js'

export { configureAdminApp, type ConfigureAdminAppOptions } from './http/configure-admin-app.js'
export { AdminEnvelopeInterceptor, RawResponse } from './http/envelope.interceptor.js'
export { AdminExceptionFilter } from './http/exception.filter.js'
export { ZodValidationPipe, ParseBigIntPipe } from './http/pipes.js'
export { validationError } from './http/validation.js'
```

- [ ] **Step 4: 통과를 본다**

Run: `pnpm --filter @ssworks/admin-server test -- migrations/index runner-graph`
Expected: PASS — index 11 · runner-graph 2.

- [ ] **Step 5: 빌드 산출물을 확인한다**

Run: `pnpm --filter @ssworks/admin-server build`
Expected: 성공. `packages/admin-server/dist/` 에 `index.js` · `runner.js` · `database/migrations/0001_roles.js` … `0007_sessions.js` 가 있고 `test-support/` 와 `*.test.js` 가 **없다**.

- [ ] **Step 6: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src
pnpm check
git add packages/admin-server/src
git commit -m "$(cat <<'EOF'
feat(admin-server): 진입점 — runner(Nest 무의존) · index, ADMIN_MIGRATIONS · assertAdminMigrationStubs

- assertAdminMigrationStubs: 빠진 장 · 순서 어긋남 · 모르는 · 겹친 ID 를 한 번에 모아 던진다
- runner 의 import 그래프에 Nest · Express 가 없음을 테스트로 지킨다
- 장 파일 이름 = 장 ID(스텁의 migrations/<id> 가 dist 로 풀린다)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 실 MariaDB — 하네스 · DB 테스트 · CI 잡

**Files:**

- Create: `packages/admin-server/vitest.db.config.ts`
- Create: `packages/admin-server/src/test-support/db-url.ts` · `db-global-setup.ts` · `db.ts`
- Create: `packages/admin-server/src/database/migrations/migrations.db.test.ts`
- Create: `packages/admin-server/src/database/database.db.test.ts`
- Modify: `packages/admin-server/package.json`(script `test:db`)
- Modify: `package.json`(root scripts)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: Task 2 `createAdminKysely` · `readJsonColumn`, Task 3 `runQuery` · `runWriteTransaction`, Task 7 `AdminDatabase`, Task 8 `adminMigrationRecord` · `ADMIN_MIGRATIONS`
- Produces(테스트 전용): `testDbServer(): { host: string; port: number; user: string; password: string }` · `createTestDatabase(options?: { migrate?: boolean }): Promise<TestDatabase>` · `interface TestDatabase { name: string; db: Kysely<AdminDatabase>; migrator: Migrator; drop(): Promise<void> }`

- [ ] **Step 1: 스크립트 · 설정**

`packages/admin-server/package.json` 의 `scripts` 에 한 줄 더한다:

```json
    "test:db": "vitest run --config vitest.db.config.ts"
```

루트 `package.json` 의 `scripts` 에 세 줄 더한다(`"test:watch"` 다음):

```json
    "test:db": "pnpm --filter @ssworks/admin-server test:db",
    "db:test:up": "docker run -d --name admin-kit-test-db -e MARIADB_ROOT_PASSWORD=admin-kit-test -p 33306:3306 mariadb:11.4",
    "db:test:down": "docker rm -f admin-kit-test-db",
```

`packages/admin-server/vitest.db.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

// 실 MariaDB 층 — `pnpm test:db`(패키지 폴더에서 돈다). 루트 projects 글롭(`vitest.config.*`)에 안 잡혀 `pnpm check` 에서
// 빠진다. 접속은 ADMIN_TEST_DB_URL, 없으면 `pnpm db:test:up` 컨테이너(스펙 R6).
export default defineConfig({
  test: {
    name: 'admin-server-db',
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
    globalSetup: ['./src/test-support/db-global-setup.ts'],
    // 테스트 파일마다 데이터베이스를 따로 만들므로 병렬로 돌아도 된다.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
```

- [ ] **Step 2: 하네스**

`packages/admin-server/src/test-support/db-url.ts`:

```ts
// 테스트 DB 서버 주소. 🔴 비밀번호를 메시지 · 로그에 담지 않는다.
const DEFAULT_URL = 'mariadb://root:admin-kit-test@127.0.0.1:33306'

export interface TestDbServer {
  host: string
  port: number
  user: string
  password: string
}

export function testDbServer(): TestDbServer {
  const url = new URL(process.env.ADMIN_TEST_DB_URL ?? DEFAULT_URL)
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  }
}
```

`packages/admin-server/src/test-support/db-global-setup.ts`:

```ts
import { createConnection } from 'mariadb'
import { testDbServer } from './db-url.js'

/** 서버가 받을 때까지 60초 기다린다(컨테이너 기동 직후). 못 붙으면 건너뛰지 않고 실패한다. */
export default async function setup(): Promise<void> {
  const server = testDbServer()
  const deadline = Date.now() + 60_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const connection = await createConnection({ ...server, connectTimeout: 2_000 })
      await connection.end()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }
  throw new Error(
    `MariaDB(${server.host}:${server.port})에 붙지 못했다 — 로컬이면 \`pnpm db:test:up\` 을 먼저 실행한다. ` +
      '다른 서버는 ADMIN_TEST_DB_URL 로 준다.',
    { cause: lastError },
  )
}
```

`packages/admin-server/src/test-support/db.ts`:

```ts
import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { Migrator } from 'kysely/migration'
import { createConnection } from 'mariadb'
import { createAdminKysely } from '../database/kysely.js'
import { adminMigrationRecord } from '../database/migrations/index.js'
import type { AdminDatabase } from '../database/types.js'
import { testDbServer } from './db-url.js'

// 테스트 파일마다 새 데이터베이스를 만들고 끝나면 지운다. 장은 패키지 안의 같은 모듈을 Kysely Migrator 로 돌린다 —
// 쓰는 쪽 스텁이 재export 하는 바로 그 모듈이다.

export interface TestDatabase {
  name: string
  db: Kysely<AdminDatabase>
  migrator: Migrator
  drop(): Promise<void>
}

export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const server = testDbServer()
  const name = `akt_${randomBytes(6).toString('hex')}`
  const admin = await createConnection(server)
  try {
    await admin.query(`create database \`${name}\` character set utf8mb4 collate utf8mb4_bin`)
  } finally {
    await admin.end()
  }

  const db = createAdminKysely<AdminDatabase>({ ...server, database: name, connectionLimit: 4 })
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => adminMigrationRecord() },
  })
  if (options.migrate !== false) {
    const { error } = await migrator.migrateToLatest()
    if (error) throw error
  }

  return {
    name,
    db,
    migrator,
    async drop() {
      await db.destroy()
      const connection = await createConnection(server)
      try {
        await connection.query(`drop database if exists \`${name}\``)
      } finally {
        await connection.end()
      }
    },
  }
}
```

- [ ] **Step 3: DB 테스트를 쓴다**

`packages/admin-server/src/database/migrations/migrations.db.test.ts`:

```ts
import { sql } from 'kysely'
import { NO_MIGRATIONS } from 'kysely/migration'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../../test-support/db.js'
import { ADMIN_MIGRATIONS } from './index.js'

const CORE_TABLES = [
  'roles',
  'sessions',
  'team_closure',
  'team_user_map',
  'teams',
  'user_employment_periods',
  'users',
]

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase({ migrate: false })
})

afterAll(async () => {
  await t?.drop()
})

async function coreTables(): Promise<string[]> {
  const rows = await sql<{ tableName: string }>`
    select table_name from information_schema.tables where table_schema = ${t.name}
  `.execute(t.db)
  return rows.rows
    .map((row) => row.tableName)
    .filter((name) => !name.startsWith('kysely_'))
    .sort()
}

describe('코어 마이그레이션(실 MariaDB 11.4)', () => {
  it('up → down → up', async () => {
    const first = await t.migrator.migrateToLatest()
    expect(first.error).toBeUndefined()
    expect(first.results?.map((result) => [result.migrationName, result.status])).toEqual(
      ADMIN_MIGRATIONS.map((id) => [id, 'Success']),
    )
    expect(await coreTables()).toEqual(CORE_TABLES)

    const down = await t.migrator.migrateTo(NO_MIGRATIONS)
    expect(down.error).toBeUndefined()
    expect(await coreTables()).toEqual([])

    const again = await t.migrator.migrateToLatest()
    expect(again.error).toBeUndefined()
    expect(await coreTables()).toEqual(CORE_TABLES)
  })

  it('collation · NULL · ON UPDATE · 타입을 스키마에서 잰다', async () => {
    const result = await sql<{
      tableName: string
      columnName: string
      collationName: string | null
      isNullable: string
      extra: string
      columnType: string
    }>`
      select table_name, column_name, collation_name, is_nullable, extra, column_type
        from information_schema.columns where table_schema = ${t.name}
    `.execute(t.db)
    const column = (table: string, name: string) => {
      const found = result.rows.find((row) => row.tableName === table && row.columnName === name)
      if (!found) throw new Error(`${table}.${name} 없음`)
      return found
    }
    expect(column('users', 'user_id').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('users', 'user_name').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('roles', 'role_name').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('teams', 'team_name').collationName).toBe('utf8mb4_unicode_ci')
    expect(column('sessions', 'refresh_token_hash').collationName).toBe('ascii_bin')
    expect(column('users', 'password').collationName).toBe('utf8mb4_bin')
    expect(column('users', 'role_no').isNullable).toBe('NO')
    expect(column('roles', 'update_at').extra.toLowerCase()).toContain('on update')
    // 🔴 폐기 UPDATE 가 마지막 활동 시각을 바꾸지 않는다
    expect(column('sessions', 'last_access_at').extra.toLowerCase()).not.toContain('on update')
    expect(column('sessions', 'replaced_by_session_no').columnType).toBe('bigint(20) unsigned')
    expect(column('sessions', 'user_agent').columnType).toBe('varchar(512)')
  })

  it('🔴 제약 이름은 snake_case(CamelCasePlugin 이 이름도 바꾼다 — 스펙 R3)', async () => {
    const result = await sql<{ tableName: string; constraintName: string; constraintType: string }>`
      select table_name, constraint_name, constraint_type
        from information_schema.table_constraints where table_schema = ${t.name}
    `.execute(t.db)
    const names = result.rows
      .filter((row) => row.constraintType !== 'CHECK' && row.constraintType !== 'PRIMARY KEY')
      .map((row) => `${row.tableName}.${row.constraintName}`)
      .sort()
    expect(names).toEqual(
      [
        'roles.uq_roles_role_name',
        'users.uq_users_user_id',
        'users.fk_users_role',
        'teams.uq_teams_name',
        'team_closure.fk_team_closure_ancestor',
        'team_closure.fk_team_closure_descendant',
        'team_user_map.fk_team_user_map_team',
        'team_user_map.fk_team_user_map_user',
        'user_employment_periods.fk_user_employment_periods_user',
        'sessions.uq_sessions_refresh_token_hash',
        'sessions.fk_sessions_user',
      ].sort(),
    )
  })

  it('인덱스', async () => {
    const result = await sql<{ indexName: string }>`
      select distinct index_name from information_schema.statistics where table_schema = ${t.name}
    `.execute(t.db)
    const names = result.rows.map((row) => row.indexName)
    for (const expected of [
      'idx_team_closure_descendant',
      'idx_team_user_map_user',
      'idx_user_employment_periods_user_join',
      'idx_user_employment_periods_active',
      'idx_sessions_user',
      'idx_sessions_expire_at',
    ]) {
      expect(names).toContain(expected)
    }
  })
})
```

`packages/admin-server/src/database/database.db.test.ts`:

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import { sql, type Generated } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { readJsonColumn } from './json.js'
import { runQuery, runWriteTransaction } from './run.js'

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
})

afterAll(async () => {
  await t?.drop()
})

async function insertRole(roleName: string): Promise<bigint> {
  const result = await t.db
    .insertInto('roles')
    .values({ roleName, permissions: JSON.stringify(['*']) })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

async function insertUser(roleNo: bigint, userId: string): Promise<bigint> {
  const result = await t.db
    .insertInto('users')
    .values({ userId, password: 'hash', userName: '사용자', roleNo })
    .executeTakeFirstOrThrow()
  return result.insertId as bigint
}

async function rejection(promise: Promise<unknown>): Promise<BusinessError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof BusinessError) return error
    throw error
  }
  throw new Error('거부되지 않았다')
}

describe('왕복', () => {
  it('bigint PK · boolean · revision · JSON 배열', async () => {
    const roleNo = await insertRole('왕복 확인')
    expect(typeof roleNo).toBe('bigint')
    const role = await t.db
      .selectFrom('roles')
      .selectAll()
      .where('roleNo', '=', roleNo)
      .executeTakeFirstOrThrow()
    expect(role.roleNo).toBe(roleNo)
    expect(role.isDefault).toBe(false)
    expect(role.revision).toBe(0)
    expect(readJsonColumn(role.permissions)).toEqual(['*'])
  })

  it('🔴 Date 가 같은 순간으로 돌아온다(timezone Z)', async () => {
    const roleNo = await insertRole('시각 확인')
    const userNo = await insertUser(roleNo, 'time-check')
    const lockUntil = new Date('2026-03-04T05:06:07.000Z')
    await t.db.updateTable('users').set({ lockUntil }).where('userNo', '=', userNo).execute()
    const user = await t.db
      .selectFrom('users')
      .select(['lockUntil'])
      .where('userNo', '=', userNo)
      .executeTakeFirstOrThrow()
    expect(user.lockUntil?.toISOString()).toBe('2026-03-04T05:06:07.000Z')
  })

  it('🔴 JSON 컬럼 안쪽 snake 키를 바꾸지 않는다(maintainNestedObjectKeys)', async () => {
    await sql`create table json_probe (probe_no bigint unsigned primary key auto_increment, payload json not null)`.execute(
      t.db,
    )
    const probe = t.db.withTables<{ jsonProbe: { probeNo: Generated<bigint>; payload: unknown } }>()
    await probe
      .insertInto('jsonProbe')
      .values({ payload: JSON.stringify({ inner_key: { deep_key: 1 } }) })
      .execute()
    const row = await probe.selectFrom('jsonProbe').selectAll().executeTakeFirstOrThrow()
    expect(readJsonColumn(row.payload)).toEqual({ inner_key: { deep_key: 1 } })
  })

  it('세션 — loginAt 을 넣을 수 있고 폐기 UPDATE 가 lastAccessAt 을 바꾸지 않는다', async () => {
    const roleNo = await insertRole('세션 확인')
    const userNo = await insertUser(roleNo, 'session-check')
    const loginAt = new Date('2026-01-01T00:00:00.000Z')
    const lastAccessAt = new Date('2026-01-02T00:00:00.000Z')
    const inserted = await t.db
      .insertInto('sessions')
      .values({
        userNo,
        refreshTokenHash: 'a'.repeat(64),
        userAgent: 'Mozilla/5.0',
        ipAddress: '203.0.113.7',
        loginAt,
        lastAccessAt,
        expireAt: new Date('2026-02-01T00:00:00.000Z'),
      })
      .executeTakeFirstOrThrow()
    const sessionNo = inserted.insertId as bigint
    await t.db
      .updateTable('sessions')
      .set({ isRevoked: true, revokedReason: 'terminated', revokedAt: new Date() })
      .where('sessionNo', '=', sessionNo)
      .execute()
    const session = await t.db
      .selectFrom('sessions')
      .selectAll()
      .where('sessionNo', '=', sessionNo)
      .executeTakeFirstOrThrow()
    expect(session.loginAt.toISOString()).toBe(loginAt.toISOString())
    expect(session.lastAccessAt.toISOString()).toBe(lastAccessAt.toISOString())
    expect(session.isRevoked).toBe(true)
    expect(session.revokedReason).toBe('terminated')
  })
})

describe('mapError 실물', () => {
  it('🔴 UNIQUE(대소문자만 다른 아이디 — ci) → ERR_COMMON_DUPLICATED, 메시지에 snake 제약 이름', async () => {
    const roleNo = await insertRole('UNIQUE 확인')
    await insertUser(roleNo, 'Admin')
    const error = await rejection(runQuery(() => insertUser(roleNo, 'admin')))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_DUPLICATED)
    const cause = error.cause as { code?: string; message?: string }
    expect(cause.code).toBe('ER_DUP_ENTRY')
    expect(cause.message).toContain('uq_users_user_id')
  })

  it('쓰는 중인 역할 삭제 → ERR_COMMON_IN_USE', async () => {
    const roleNo = await insertRole('사용 중')
    await insertUser(roleNo, 'in-use')
    const error = await rejection(
      runQuery(() => t.db.deleteFrom('roles').where('roleNo', '=', roleNo).execute()),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_IN_USE)
  })

  it('없는 역할로 사용자 삽입 → ERR_COMMON_BAD_REQUEST', async () => {
    const error = await rejection(runQuery(() => insertUser(999_999n, 'no-role')))
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_BAD_REQUEST)
  })
})

describe('runWriteTransaction', () => {
  it('안에서 던지면 롤백된다', async () => {
    const before = await t.db
      .selectFrom('roles')
      .select(({ fn }) => fn.countAll<bigint>().as('n'))
      .executeTakeFirstOrThrow()
    const error = await rejection(
      runWriteTransaction(t.db, async (trx) => {
        await trx
          .insertInto('roles')
          .values({ roleName: '롤백될 역할', permissions: '[]' })
          .execute()
        throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, '중간 실패')
      }),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_CONFLICT)
    const after = await t.db
      .selectFrom('roles')
      .select(({ fn }) => fn.countAll<bigint>().as('n'))
      .executeTakeFirstOrThrow()
    expect(after.n).toBe(before.n)
  })

  it('안의 드라이버 오류도 코드 있는 오류로', async () => {
    await insertRole('트랜잭션 중복')
    const error = await rejection(
      runWriteTransaction(t.db, async (trx) => {
        await trx
          .insertInto('roles')
          .values({ roleName: '트랜잭션 중복', permissions: '[]' })
          .execute()
      }),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_COMMON_DUPLICATED)
  })
})
```

- [ ] **Step 4: 컨테이너를 띄우고 돌린다**

Run: `pnpm db:test:up`
Expected: 컨테이너 id 한 줄. 이미 있으면 `Conflict. The container name "/admin-kit-test-db" is already in use` — 그때는 `docker start admin-kit-test-db` 로 띄운다.

Run: `pnpm test:db`
Expected: PASS — migrations 4 · database 9. 실패 원인이 접속이면(60초 뒤 "`pnpm db:test:up` 을 먼저") 컨테이너 상태(`docker ps`)를 본다.

- [ ] **Step 5: CI 에 DB 잡**

`.github/workflows/ci.yml` 의 `jobs:` 아래, `check:` 잡 다음에 더한다:

```yaml
db:
  runs-on: ubuntu-latest
  services:
    mariadb:
      image: mariadb:11.4
      env:
        MARIADB_ROOT_PASSWORD: admin-kit-test
      ports:
        - 33306:3306
      options: >-
        --health-cmd="healthcheck.sh --connect --innodb_initialized"
        --health-interval=5s
        --health-timeout=5s
        --health-retries=20
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v6

    - uses: actions/setup-node@v4
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'

    - run: pnpm install --frozen-lockfile

    - name: DB Test
      run: pnpm test:db
      env:
        ADMIN_TEST_DB_URL: mariadb://root:admin-kit-test@127.0.0.1:33306
```

- [ ] **Step 6: 전체 검사 · 포맷 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server package.json .github/workflows/ci.yml
pnpm check
pnpm test:db
git add packages/admin-server package.json .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
test(admin-server): 실 MariaDB 층 — 하네스 · 마이그레이션 · DB 경계 테스트, CI db 잡

- pnpm test:db(vitest.db.config.ts), pnpm db:test:up/down(mariadb:11.4, 포트 33306), 파일마다 새 데이터베이스
- 7장 up → down → up, collation · ON UPDATE · 제약 이름(snake) 실측
- mapError 실물(UNIQUE ci · FK restrict · 없는 참조), runWriteTransaction 롤백, bigint · boolean · Date · JSON 왕복
- CI: services mariadb 11.4 로 필수 잡

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 문서 · changeset

**Files:**

- Modify: `packages/admin-server/README.md`(전체)
- Create: `.changeset/admin-server-foundation.md`
- Modify: `docs/01-phase0.md`(§8 admin-server 행)
- Modify: `docs/HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 테스트 수를 잰다**

Run: `pnpm test 2>&1 | tail -5` 와 `pnpm test:db 2>&1 | tail -5`
Expected: 워크스페이스 전체 테스트 수(예: 1055 + admin-server 분) · DB 테스트 수. 아래 문서의 `<워크스페이스 수>` · `<server 수>` · `<db 수>` 자리에 **이 출력의 숫자**를 적는다.

- [ ] **Step 2: README**

`packages/admin-server/README.md` 전체:

````md
# @ssworks/admin-server

관리자 API 공통 NestJS 모듈 — NestJS 12 · Kysely 0.29 · MariaDB. **Phase 2 진행 중**이고 `private: true` 라 아직 발행하지 않는다(Phase 2 마지막 PR 뒤 첫 발행).

지금(PR 2a) 들어 있는 것은 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마 7장이다. 인증 · 세션 · 감사 · 사용자 · 역할 · 팀 · 약관 · IP 접근 제어는 다음 PR 에서 붙는다 — 지도는 저장소 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1.

## 설치

```bash
pnpm add @ssworks/admin-server @ssworks/admin-shared zod \
  @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 \
  kysely@^0.29 mariadb @kim5257/kysely-mariadb-dialect@^0.2 reflect-metadata rxjs
```

- Node 22 이상, ESM 전용. tsconfig 는 `module` · `moduleResolution` `NodeNext`, `experimentalDecorators` · `emitDecoratorMetadata` 를 켠다.
- Express 만 지원한다(`@nestjs/platform-express`).

## 진입점

| import                                  | 내용                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@ssworks/admin-server`                 | 전부                                                                                        |
| `@ssworks/admin-server/runner`          | Nest 를 싣지 않는 것만 — `kysely.config.ts` · 시드 스크립트 · `main.ts` 의 `NestFactory` 전 |
| `@ssworks/admin-server/migrations/<id>` | 코어 마이그레이션 장 하나(스텁이 가리킨다)                                                  |

## 최소 배선

```ts
// src/main.ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { assertUtcTimezone, configureAdminApp, loadDotEnv } from '@ssworks/admin-server'
import { AppModule } from './app.module.js'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('api')
const app = await NestFactory.create<NestExpressApplication>(AppModule)
configureAdminApp(app) // 🔴 빠뜨리면 app.init() 에서 멈춘다
app.setGlobalPrefix('api') // 관리자 라우트는 /api/admin/…
app.enableShutdownHooks() // 종료 때 DB 풀을 닫는다
await app.listen(4000)
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common'
import { AdminServerModule, adminDbConnectionFromEnv } from '@ssworks/admin-server'
import { projectErrors } from './errors.js'

@Module({
  imports: [
    // 🔴 forRootAsync — env 를 부팅 뒤에 읽는다. forRoot({ db: adminDbConnectionFromEnv() }) 는 import 평가 때 돌아
    //    main.ts 의 loadDotEnv() 보다 먼저다.
    AdminServerModule.forRootAsync({
      useFactory: () => ({ db: adminDbConnectionFromEnv(), errorCodes: projectErrors }),
    }),
  ],
})
export class AppModule {}
```

```ts
// kysely.config.ts — Nest 를 싣지 않는다
import { defineConfig } from 'kysely-ctl'
import {
  adminDbConnectionFromEnv,
  assertAdminMigrationStubs,
  assertUtcTimezone,
  createAdminKysely,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('./.env', import.meta.url))
assertUtcTimezone('마이그레이션 러너')
assertAdminMigrationStubs('src/database/migrations') // 빠진 스텁 · 순서 어긋남이면 시작 전에 멈춘다

export default defineConfig({
  kysely: () => createAdminKysely(adminDbConnectionFromEnv()), // 앱과 같은 풀 옵션 · 플러그인
  migrations: { migrationFolder: 'src/database/migrations' },
})
```

코어 장마다 마이그레이션 폴더에 한 줄 스텁을 둔다. 번호는 프로젝트가 정한다 — 코어 장 순서(roles → users → …)만 지킨다.

```ts
// src/database/migrations/001_admin_roles.migration.ts
export { up, down } from '@ssworks/admin-server/migrations/0001_roles'
```

| 장 ID                          | 테이블                    |
| ------------------------------ | ------------------------- |
| `0001_roles`                   | `roles`                   |
| `0002_users`                   | `users`                   |
| `0003_teams`                   | `teams`                   |
| `0004_team_closure`            | `team_closure`            |
| `0005_team_user_map`           | `team_user_map`           |
| `0006_user_employment_periods` | `user_employment_periods` |
| `0007_sessions`                | `sessions`                |

🔴 패키지가 새 장을 내면 changeset 이 알린다 — 스텁 한 줄을 더한다. `assertAdminMigrationStubs` 가 빠진 장을 잡는다. 시드(첫 관리자 계정 · 역할)는 프로젝트 몫이다.

## 환경 변수

| 이름                    | 필수 | 기본  | 뜻                                                                 |
| ----------------------- | ---- | ----- | ------------------------------------------------------------------ |
| `DB_HOST`               | 예   |       |                                                                    |
| `DB_PORT`               |      | 3306  | 양의 정수가 아니면 기동 실패                                       |
| `DB_USER`               | 예   |       |                                                                    |
| `DB_PASSWORD`           | 예   |       |                                                                    |
| `DB_NAME`               | 예   |       | gise 처럼 `DB_DATABASE` 를 쓰면 `AdminDbConnection` 을 직접 만든다 |
| `DB_POOL_LIMIT`         |      | 10    | `× API 프로세스 수` 가 DB `max_connections` 여유 안이어야 한다     |
| `DB_ACQUIRE_TIMEOUT_MS` |      | 10000 |                                                                    |
| `TZ`                    | 예   |       | `UTC` — 아니면 `assertUtcTimezone` 이 기동을 멈춘다                |

풀 안전 옵션(`timezone: 'Z'` · 숫자 옵션 넷 · `logParam: false`)은 바꿀 수 없다.

## 응답 계약

- 성공 `{ success: true, data }` — 컨트롤러는 값만 돌려준다. bigint 는 `"BigInt(n)"`, Date 는 ISO 문자열(admin-shared 코덱). 반환값이 없으면 `data: null`. 봉투를 빼려면 `@RawResponse()`(웹훅 · 헬스 체크).
- 실패 `{ success: false, code, message, details? }` — 서비스는 admin-shared `BusinessError` 만 던진다. 상태는 코드표(`errorCodes` 또는 코어 표)가 정한다. 5xx 는 고정 문구이고 원문 · `cause` · `details` 는 로그로만 간다.
- 검증 — `@Body(new ZodValidationPipe(schema))`. 실패는 400 `ERR_COMMON_VALIDATION` + `details.issues[{ path, code, message }]`(`path` 는 배열, 보낸 원문은 싣지 않음). 서비스가 필드 오류를 낼 때는 `validationError([{ path: ['currentPassword'], message }])`. 경로 번호는 `@Param('teamNo', ParseBigIntPipe)`.
- DB 접근은 `runQuery(() => …)` · `runWriteTransaction(db, (trx) => …)` 로 감싼다 — 드라이버 오류가 코드 있는 오류(UNIQUE → `ERR_COMMON_DUPLICATED`, FK restrict → `ERR_COMMON_IN_USE` …)가 된다. 🔴 재인증(argon2)을 트랜잭션 안에서 부르지 않는다.
- 쿼리는 extended 파서다(`filter[key]=…` 가 객체). 값 검증은 zod 로.

## 코어 스키마와 내 테이블

```ts
import type { AdminDatabase } from '@ssworks/admin-server'

export interface Database extends AdminDatabase {
  posts: PostsTable
}

// 주입: constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}
```

- 코어 테이블에 컬럼을 더하려면 `users: AdminUsersTable & { email: string | null }` 와 프로젝트 ALTER 장. 🔴 패키지 코드는 더한 컬럼을 모르므로 NOT NULL 확장 컬럼은 DEFAULT 를 둔다.
- 제약 · 인덱스 이름은 DB 에서 snake_case 다(`uq_users_user_id`) — `CamelCasePlugin` 이 바꾼다.
- JSON 컬럼(`roles.permissions`)은 `readJsonColumn()` + zod 로 읽는다.

## admin-ui 와 맞물리기

```ts
createApiClient({
  baseURL: '/api/admin',
  refreshPath: '/auth/refresh',
  noRetryPaths: ['/auth/login'],
})
```

봉투(`envelope: 'success-data'`)와 bigint 코덱은 admin-ui 기본값과 같다. 오류 `code` · `details.issues` 는 `ApiError` · `toFieldErrors` 가 그대로 읽는다.

## 테스트(이 저장소)

```bash
pnpm db:test:up   # docker mariadb:11.4, 포트 33306
pnpm test:db      # 실 MariaDB 층 — ADMIN_TEST_DB_URL 로 다른 서버
pnpm db:test:down
```

`pnpm check` 는 DB 없이 돈다(단위 · DB 없는 HTTP 계약). CI 는 `db` 잡이 `pnpm test:db` 를 필수로 돈다.
````

- [ ] **Step 3: changeset**

`.changeset/admin-server-foundation.md`:

```md
---
'@ssworks/admin-server': minor
---

**쓰는 쪽이 할 일(첫 발행 때):** peer 를 설치한다 — `pnpm add @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 kysely@^0.29 mariadb @kim5257/kysely-mariadb-dialect@^0.2 reflect-metadata rxjs zod @ssworks/admin-shared`(Node 22 이상). `main.ts` 에서 `configureAdminApp(app)` 을 `listen()` 전에 부른다(빠뜨리면 기동에서 멈춘다). `kysely.config.ts` 는 `@ssworks/admin-server/runner` 의 `createAdminKysely` · `assertAdminMigrationStubs` 를 쓰고, 마이그레이션 폴더에 코어 장 스텁 7개(`export { up, down } from '@ssworks/admin-server/migrations/0001_roles'` …)를 둔다.

admin-server 기반(Phase 2 PR 2a): `AdminServerModule.forRoot` · `forRootAsync`(`admin/` prefix · `KYSELY`), `configureAdminApp`, 응답 봉투(`@RawResponse()`), `AdminExceptionFilter`, `ZodValidationPipe` · `ParseBigIntPipe` · `validationError`, `runQuery` · `runWriteTransaction` · `mapError` · `readJsonColumn`, `AdminDatabase` 와 코어 스키마 7장(`ADMIN_MIGRATIONS`), `loadDotEnv` · `requireEnv` · `assertUtcTimezone`. 아직 `private` 이라 npm 에 나가지 않는다.
```

- [ ] **Step 4: 진행 문서**

`docs/01-phase0.md` §8 표의 admin-server 행을 바꾼다:

```md
| `@ssworks/admin-server` | 골격(package.json·tsconfig·placeholder) | **Phase 2 PR 2a 완료**(브랜치 `feat/admin-server-foundation`) — `AdminServerModule` · `configureAdminApp` · 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 스키마 7장 · runner 진입점. <server 수> 테스트 + 실 MariaDB <db 수>(`pnpm test:db`). 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` · 플랜 `docs/superpowers/plans/2026-10-08-admin-server-foundation.md`. 다음 2b 인증 |
```

그리고 §8 표 아래 "다음: Phase 2 admin-server." 를 "다음: Phase 2 PR 2b 인증(2a 스펙 §1-3)." 으로 바꾼다.

`docs/HANDOFF.md`:

- 머리 줄 `# HANDOFF — 2026-10-01` 을 `# HANDOFF — 2026-10-08` 로.
- "지금 상태" 표의 `@ssworks/admin-server` 행을: `Phase 2 진행. **PR 2a**(기반 · 코어 스키마 — `AdminServerModule`·`configureAdminApp`· 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 7장 · runner)는`feat/admin-server-foundation`에서 구현 완료. <server 수> 테스트 + 실 MariaDB <db 수>. 아직`private: true`(첫 발행은 Phase 2 끝 — 결정 ⑥ V1). 지도는 2a 스펙 §1`.
- "검증" 행 끝에: `PR 2a 는 Windows 에서 pnpm check · pnpm test:db(Docker mariadb:11.4) 초록, 쓰는 쪽 스모크(%TEMP%\akss — 스텁 → kysely migrate → tsc → 기동 → 요청) 통과.`(Task 11 결과로 적는다)
- "다음 플랜" 행을: `Phase 2 PR 2b 인증 — 스펙부터(2a 스펙 §1-3 의 2b 행 · 3c §9 · Phase 0 §4 #5 · #6). 직전 PR 2a: 스펙 docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md · 플랜 docs/superpowers/plans/2026-10-08-admin-server-foundation.md`.
- "발행 전에 사람이 해야 하는 것" 에 두 줄을 더한다:
  - `**Version Packages PR #2(0.3.0)는 2a 를 main 에 넣기 전에 머지한다**(Phase 2 결정 ⓪ M1).`
  - `**admin-server 첫 발행은 Phase 2 끝**(결정 ⑥ V1) — 2f 와 확인용 앱 실서버 확인 뒤 private 을 지우고 사람이 로컬 2FA 로. 그 뒤 Trusted Publisher 등록.`

`CLAUDE.md`:

- 패키지 표의 `packages/admin-server` 행 성격을 `NestJS 12 모듈 (Phase 2 진행 — 2a 기반 · 코어 스키마 완료)` 로.
- "### `@ssworks/admin-server` (Phase 2)" 절 끝에 더한다:

```md
- 진입점 셋: `.`(전부) · `./runner`(Nest 무의존 — `runner-graph.test.ts` 가 지킨다) · `./migrations/<id>`(코어 장, 쓰는 쪽 스텁이 가리킨다). 장 파일 이름 = 장 ID.
- 데코레이터가 붙은 시그니처의 인터페이스 · 타입 별칭은 `import type`(TS1272), DI 로 받는 클래스는 일반 import.
- 장은 `Kysely<unknown>` 을 받는다. 제약 · 인덱스 이름은 DB 에서 snake_case(`CamelCasePlugin`).
- 테스트 세 층: 단위 · DB 없는 HTTP(프로브 모듈, `src/test-support/`)는 `pnpm check`, 실 MariaDB(`*.db.test.ts`)는 `pnpm db:test:up` 뒤 `pnpm test:db`(CI `db` 잡 필수).
```

- 진행 표에서 `**Phase 2 — admin-server** | **다음**` 행을 두 행으로 바꾼다:

```md
| Phase 2 PR 2a — 기반 · 코어 스키마(`AdminServerModule` · 봉투 · 예외 필터 · 검증 파이프 · DB 연결 · 코어 7장 · runner) | 완료 | 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` · 플랜 `docs/superpowers/plans/2026-10-08-admin-server-foundation.md` |
| **Phase 2 PR 2b — 인증** | **다음** | 2a 스펙 §1-3 |
```

- [ ] **Step 5: 포맷 · 검사 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/README.md .changeset/admin-server-foundation.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md
pnpm check
git add packages/admin-server/README.md .changeset/admin-server-foundation.md docs/01-phase0.md docs/HANDOFF.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: PR 2a — admin-server README(배선 · 스텁 · 환경 변수 · 응답 계약), changeset, 진행 문서

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: 쓰는 쪽 스모크 · 최종 검증

저장소 밖 짧은 경로(`%TEMP%\akss`)의 최소 Nest 앱에 패킹 tarball 을 설치해 **스텁 → `kysely migrate` → `tsc` → 기동 → 요청**까지 본다. 저장소 파일은 결과 기록 외에 바꾸지 않는다(고칠 것이 나오면 해당 Task 의 파일을 고치고 스펙 §13 에 R 항목을 더한다).

**Files:**

- Create(저장소 밖): `%TEMP%\akss\` 아래 앱 파일들
- Modify(결과 기록): `docs/HANDOFF.md` "검증" 행

- [ ] **Step 1: tarball 을 만든다**

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server build
mkdir -p "$TEMP/akss"
pnpm --filter @ssworks/admin-shared pack --pack-destination "$TEMP/akss"
pnpm --filter @ssworks/admin-server pack --pack-destination "$TEMP/akss"
ls "$TEMP/akss"
```

Expected: `ssworks-admin-shared-<판>.tgz` · `ssworks-admin-server-<판>.tgz`(판은 그때의 `package.json` — PR #2 머지 여부에 따라 0.2.0 또는 0.3.0). 아래 `package.json` 의 파일 이름을 그 이름으로 맞춘다.

Run: `tar -tzf "$TEMP"/akss/ssworks-admin-server-*.tgz | grep -c "package/dist/database/migrations/000[1-7]_.*\.js$"`
Expected: `7`. 그리고 `tar -tzf … | grep -E "test-support|\.test\.js"` 가 아무것도 내지 않는다.

- [ ] **Step 2: 앱 파일을 쓴다**

`%TEMP%\akss\package.json`:

```json
{
  "name": "akss",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.1.2",
    "@nestjs/core": "^12.1.2",
    "@nestjs/platform-express": "^12.1.2",
    "@ssworks/admin-server": "file:./ssworks-admin-server-0.2.0.tgz",
    "@ssworks/admin-shared": "file:./ssworks-admin-shared-0.2.0.tgz",
    "kysely": "^0.29.6",
    "mariadb": "^3.5.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "kysely-ctl": "^0.21.0",
    "typescript": "~5.9.2"
  }
}
```

`%TEMP%\akss\tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`%TEMP%\akss\.env`:

```
DB_HOST=127.0.0.1
DB_PORT=33306
DB_USER=root
DB_PASSWORD=admin-kit-test
DB_NAME=akss
```

`%TEMP%\akss\kysely.config.ts`:

```ts
import { defineConfig } from 'kysely-ctl'
import {
  adminDbConnectionFromEnv,
  assertAdminMigrationStubs,
  assertUtcTimezone,
  createAdminKysely,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('./.env', import.meta.url))
assertUtcTimezone('마이그레이션 러너')
assertAdminMigrationStubs('src/migrations')

export default defineConfig({
  kysely: () => createAdminKysely(adminDbConnectionFromEnv()),
  migrations: { migrationFolder: 'src/migrations' },
})
```

`%TEMP%\akss\src\migrations\` 에 스텁 7개 — 파일 이름과 내용:

```
001_admin_roles.ts                    export { up, down } from '@ssworks/admin-server/migrations/0001_roles'
002_admin_users.ts                    export { up, down } from '@ssworks/admin-server/migrations/0002_users'
003_admin_teams.ts                    export { up, down } from '@ssworks/admin-server/migrations/0003_teams'
004_admin_team_closure.ts             export { up, down } from '@ssworks/admin-server/migrations/0004_team_closure'
005_admin_team_user_map.ts            export { up, down } from '@ssworks/admin-server/migrations/0005_team_user_map'
006_admin_user_employment_periods.ts  export { up, down } from '@ssworks/admin-server/migrations/0006_user_employment_periods'
007_admin_sessions.ts                 export { up, down } from '@ssworks/admin-server/migrations/0007_sessions'
```

`%TEMP%\akss\src\migrations\100_posts.ts`(프로젝트 장 — 코어 users 를 FK 로 참조해 순서를 잰다):

```ts
import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('posts')
    .addColumn('postNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('title', 'varchar(200)', (col) => col.notNull())
    .addColumn('authorNo', 'bigint', (col) => col.unsigned().notNull())
    .addForeignKeyConstraint('fkPostsAuthor', ['authorNo'], 'users', ['userNo'])
    .modifyEnd(sql`engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin`)
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('posts').execute()
}
```

`%TEMP%\akss\src\database.ts`:

```ts
import type { AdminDatabase } from '@ssworks/admin-server'
import type { Generated } from 'kysely'

interface PostsTable {
  postNo: Generated<bigint>
  title: string
  authorNo: bigint
}

export interface Database extends AdminDatabase {
  posts: PostsTable
}
```

`%TEMP%\akss\src\posts.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common'
import { KYSELY, ParseBigIntPipe, ZodValidationPipe, runQuery } from '@ssworks/admin-server'
import { BusinessError } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from './database.js'

const createPostSchema = z.object({ title: z.string().min(2), authorNo: z.coerce.bigint() })
type CreatePost = z.infer<typeof createPostSchema>

@Controller('posts')
export class PostsController {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  @Get()
  async list() {
    const items = await runQuery(() =>
      this.db.selectFrom('posts').selectAll().orderBy('postNo').execute(),
    )
    return { items, total: BigInt(items.length) }
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createPostSchema)) body: CreatePost) {
    const result = await runQuery(() =>
      this.db.insertInto('posts').values(body).executeTakeFirstOrThrow(),
    )
    return { postNo: result.insertId }
  }

  @Get(':postNo')
  async one(@Param('postNo', ParseBigIntPipe) postNo: bigint) {
    const post = await runQuery(() =>
      this.db.selectFrom('posts').selectAll().where('postNo', '=', postNo).executeTakeFirst(),
    )
    if (!post) throw new BusinessError('ERR_NO_POST', '게시글이 없습니다.')
    return post
  }
}
```

`%TEMP%\akss\src\app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { AdminServerModule, adminDbConnectionFromEnv } from '@ssworks/admin-server'
import { defineErrorCodes } from '@ssworks/admin-shared'
import { PostsController } from './posts.controller.js'

const projectErrors = defineErrorCodes({ ERR_NO_POST: 'ERR_NO_POST' }, { ERR_NO_POST: 404 })

@Module({
  imports: [
    AdminServerModule.forRootAsync({
      useFactory: () => ({ db: adminDbConnectionFromEnv(), errorCodes: projectErrors }),
    }),
  ],
  controllers: [PostsController],
})
export class AppModule {}
```

`%TEMP%\akss\src\main.ts`:

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { assertUtcTimezone, configureAdminApp, loadDotEnv } from '@ssworks/admin-server'
import { AppModule } from './app.module.js'

loadDotEnv(new URL('../.env', import.meta.url))
assertUtcTimezone('akss')
const app = await NestFactory.create<NestExpressApplication>(AppModule)
configureAdminApp(app)
app.setGlobalPrefix('api')
app.enableShutdownHooks()
await app.listen(4100)
```

`%TEMP%\akss\check.mjs`:

```js
const base = 'http://127.0.0.1:4100/api'
const json = { 'content-type': 'application/json' }
async function show(label, response) {
  console.log(label, response.status, await response.text())
}
// 서버가 뜰 때까지 기다린다(최대 20초) — sleep 대신
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${base}/posts`)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error('서버가 뜨지 않았다 — server.log 를 본다')
}
await waitForServer()
await show(
  'create',
  await fetch(`${base}/posts`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ title: '첫 글', authorNo: 1 }),
  }),
)
await show('list', await fetch(`${base}/posts`))
await show('one', await fetch(`${base}/posts/1`))
await show('missing', await fetch(`${base}/posts/999`))
await show(
  'invalid',
  await fetch(`${base}/posts`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ title: 'x', authorNo: 1 }),
  }),
)
await show(
  'fk',
  await fetch(`${base}/posts`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ title: '없는 작성자', authorNo: 999 }),
  }),
)
await show('notfound', await fetch(`${base}/nope`))
```

- [ ] **Step 3: 설치 · 타입 검사 · 빌드**

```bash
cd "$TEMP/akss"
pnpm install
pnpm build
```

Expected: 설치 성공, `tsc` 오류 0(`skipLibCheck: false` — 패키지 d.ts 를 잰다). 제3자 d.ts 의 오류만 나면 그 내용을 기록하고 `skipLibCheck: true` 로 한 번 더 돌려 패키지 쪽 오류가 없음을 확인한다.

- [ ] **Step 4: 마이그레이션**

```bash
pnpm db:test:up   # 저장소 루트에서 — 이미 떠 있으면 생략
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "create database if not exists akss"
cd "$TEMP/akss"
TZ=UTC npx kysely migrate latest
```

Expected: 8장(스텁 7 + `100_posts`) 적용 성공. 스텁 하나를 지운 채 한 번 돌려 `assertAdminMigrationStubs` 가 "빠진 장" 으로 시작 전에 멈추는지 보고 되돌린다.

- [ ] **Step 5: 기동 · 요청**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test akss -e "insert into roles (role_name, permissions) values ('admin-role', '[\"*\"]'); insert into users (user_id, password, user_name, role_no) values ('admin', 'x', 'admin', 1)"
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
```

Expected:

- `create 201 {"success":true,"data":{"postNo":"BigInt(1)"}}`
- `list 200 {"success":true,"data":{"items":[{"postNo":"BigInt(1)","title":"첫 글","authorNo":"BigInt(1)"}],"total":"BigInt(1)"}}`
- `one 200 {"success":true,"data":{"postNo":"BigInt(1)",…}}`
- `missing 404 {"success":false,"code":"ERR_NO_POST","message":"게시글이 없습니다."}`
- `invalid 400 {"success":false,"code":"ERR_COMMON_VALIDATION",…"issues":[{"path":["title"],…}]}}`
- `fk 400 {"success":false,"code":"ERR_COMMON_BAD_REQUEST","message":"참조 대상이 없습니다."}`
- `notfound 404 {"success":false,"code":"ERR_COMMON_NOT_FOUND",…}`

`check.mjs` 가 "서버가 뜨지 않았다" 로 끝나면 `server.log` 를 본다(접속 정보 · TZ · `configureAdminApp` 부팅 검사). 셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다.

- [ ] **Step 6: 정리 · 최종 검사 · 기록**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
cd <저장소 루트>
pnpm check
pnpm test:db
pnpm format:check
git status --short
```

Expected: 셋 다 초록. `git status` 에 `NUL` 이나 의도하지 않은 파일이 없다. `docs/HANDOFF.md` "검증" 행에 스모크 결과(Task 10 Step 4 문구)를 반영해 커밋한다:

```bash
git add docs/HANDOFF.md
git commit -m "$(cat <<'EOF'
docs: PR 2a 쓰는 쪽 스모크 결과 — 스텁 → kysely migrate → tsc → 기동 → 요청

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: 마무리 확인**

`superpowers:finishing-a-development-branch` 로 사용자에게 머지 방식을 묻는다. 🔴 `main` 에 넣기 전에 Version Packages PR #2 를 사람이 머지했는지 확인한다(결정 ⓪ M1). push 는 사람이 한다.

---

## 스펙 대조표 (자체 검토)

| 스펙                                                                 | Task                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| §1 지도 · 결정 · 공통 결정                                           | 스펙 자체(커밋 `e1a0f18`), 진행 문서 Task 10            |
| F1 진입점 셋 · runner 무의존                                         | Task 1(exports) · Task 8(runner · index · runner-graph) |
| F2 forRootAsync · 정적 routePrefix                                   | Task 5(options) · Task 6                                |
| F3 RouterModule prefix · 토큰 분리                                   | Task 5(tokens) · Task 6                                 |
| F4 봉투 · `@RawResponse` · 파일 통과                                 | Task 5                                                  |
| F5 replacer 부팅 검사                                                | Task 6                                                  |
| F6 · F7 필터(직접 직렬화 · 소독 · 5xx 마스킹 · 로그)                 | Task 4(json-safe) · Task 5                              |
| F8 검증 이슈(path 배열 · input 제외 · ko)                            | Task 4 · Task 5                                         |
| F9 `ParseBigIntPipe`                                                 | Task 4 · Task 5                                         |
| F10 `mapError`                                                       | Task 3 · Task 9(실물)                                   |
| F11 `loadDotEnv` · BOM(R4)                                           | Task 1                                                  |
| F12 풀 안전 옵션                                                     | Task 2 · Task 9(timezone 왕복)                          |
| F13 플러그인 순서 · maintainNestedObjectKeys                         | Task 2 · Task 9(JSON 왕복)                              |
| F14 · F15 코어 장 · 바꾼 점 · roleNo                                 | Task 7 · Task 9(information_schema)                     |
| F16 스텁 검사                                                        | Task 8 · Task 11                                        |
| F17 `readJsonColumn`                                                 | Task 2 · Task 9                                         |
| §5-2 `onModuleDestroy` · `KYSELY`                                    | Task 6                                                  |
| §5-4 `validationError`                                               | Task 4                                                  |
| §7 의존성 · engines                                                  | Task 1                                                  |
| §9 테스트 계약 세 층                                                 | Task 1~9                                                |
| §10 README · changeset · 진행 문서 · ⓐ(스펙 커밋에서 끝남)           | Task 10                                                 |
| §12 위험 1 · 3 · 4(R1 해소), 2(판 차이 — 구현 중 §13), 5 · 6(스모크) | Task 1 Step 3 · Task 11                                 |
| 스모크 · 계약 검증(작업 지시 §3)                                     | Task 5 · 6 · 9 · 11                                     |
