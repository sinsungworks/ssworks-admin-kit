# admin-server 첫 발행 준비 Implementation Plan (Phase 2 PR 2f-2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin-server 첫 발행 앞의 막힌 것 넷을 걷어낸다 — DB TLS · 소켓, 발행 peer 하한, admin-shared `pagination.d.ts` TS2536, IP 파서 조이기.

**Architecture:** admin-server 는 `connection.ts` 한 파일(`AdminDbConnection` · `adminPoolConfig` · `adminDbConnectionFromEnv`)에서 앱 · 러너가 함께 쓰는 풀 옵션에 `ssl` · `socketPath` 를 더한다. admin-shared 는 `pagination.ts` 한 줄 타입 표기와 `ip-access.ts` 파서 세 함수(`normalizeIp` · `parseIpv6` · `parseCidr`)만 고친다. 발행 형태는 `check:dts` 게이트(발행 d.ts 를 `skipLibCheck: false` 로)와 드라이런 worktree(`changeset version` · `pack`)로 잰다.

**Tech Stack:** TypeScript 5.9 · zod 4 · NestJS 12 · Kysely 0.29 · mariadb 3.5.4 · MariaDB 11.4 · vitest 4 · pnpm 12 · changesets 2.31.

**Spec:** `docs/superpowers/specs/2026-10-15-admin-server-publish-prep-design.md` — 플랜은 스펙을 근거로 한다. 실행자는 둘 다 읽는다. 브랜치 `feat/admin-server-publish-prep`(이미 있음 — 스펙 커밋 `f94d604`).

## Global Constraints

- 하위 호환: 지금의 env 일곱(`DB_HOST` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` · `DB_POOL_LIMIT` · `DB_ACQUIRE_TIMEOUT_MS`)과 `{ host, user, password, database }` 객체는 지금과 같은 풀 옵션을 낸다(스펙 §2-2 1).
- 🔴 오류 메시지에 값 · 경로를 담지 않는다 — env 는 이름만, 파일 오류는 이름 + errno 코드만(스펙 §2-2 2). Node 의 `readFileSync` 오류 메시지는 경로를 담는다 — 그대로 다시 던지지 않는다.
- 러너 진입점은 Nest 무의존 그대로 — `connection.ts` 는 `node:fs` 만 더한다(`runner-graph.test.ts`).
- admin-shared 공개 함수 시그니처는 그대로(`normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `createQuerySchema`). 새 공개 export 없음 — admin-server 도 새 export 없음.
- peer 표기는 정확히 `"@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0"`(발행 시 `>=0.4.0 <1.0.0`). admin-ui peer `workspace:^0` 은 건드리지 않는다.
- 코드 규약(CLAUDE.md): prettier(세미콜론 없음 · 작은따옴표 · 100자), `import type` 분리(단 `admin-server/src` 의 DI 예외), 상대 import 는 `.js`, `console.log` 금지, 정규식에 백슬래시 문자 클래스 금지(`[0-9]` · `[.]` 로 쓴다 — admin-shared `ip-access.ts` 규칙), `🔴` 주석은 "지우면 사고가 나는 이유".
- 🔴 코드 · 문서에 백슬래시를 쓰지 않는다 — 도구 입력에서 이스케이프가 풀리거나 사라진다(메모). 개행은 `String.fromCharCode(10)` 이나 진짜 줄바꿈, Windows 명명 파이프는 말로 적는다.
- 🔴 `> /dev/null` · `2>/dev/null` 금지(Windows 에서 `NUL` 파일을 만든다). 개행 LF.
- admin-shared 를 고친 뒤에는 `pnpm --filter @ssworks/admin-shared build` 를 다시 돌려야 admin-server · admin-ui 가 본다.
- admin-server 린트는 루트에서 `pnpm exec eslint packages/admin-server/src`(패키지에 lint 스크립트 없음). admin-shared 는 `pnpm exec eslint packages/admin-shared/src`.
- 실 DB 테스트 전에 `docker ps --filter name=admin-kit-test-db --format "{{.Names}} {{.Status}}"` 가 `Up` 인지 본다. 꺼져 있으면 `docker start admin-kit-test-db`(Docker Desktop 먼저). 🔴 `pnpm test:db` 를 겹쳐 돌리지 않는다.
- 저장소 밖 폴더(`$TEMP/ak2fb` · `$TEMP/akss`)는 **포그라운드** 명령으로 만든다. Git Bash 의 `$TEMP` 는 Windows 경로(사용자 폴더의 `AppData/Local/Temp`)다. `tar` 에 `C:` 로 시작하는 경로를 주지 않는다(원격 호스트로 읽는다) — 그 폴더로 `cd` 한 뒤 상대 경로로.
- 커밋: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push` 는 하지 않는다.

## Review Focus

1. **공백만 든 `DB_SOCKET_PATH` · `DB_SSL_CA`(`'  '`)** — 없는 것으로 본다(TCP · TLS 끔). `.env` 의 `DB_SOCKET_PATH=` 뒤 공백 한 칸으로 소켓 모드가 되면 안 된다 → Task 3 Step 1 테스트.
2. **`DB_SSL_CA` 가 디렉터리이거나 못 읽는 파일** — 메시지는 `DB_SSL_CA 파일을 읽지 못했다(<코드>)` 이고 경로가 없다(플랫폼마다 코드가 다를 수 있다 — 형식만 단언) → Task 3 Step 1 테스트.
3. **`DB_SSL=false` + `DB_SOCKET_PATH`** — 허용(끔은 소켓과 충돌하지 않는다). 소켓 쪽 `.env` 에 `DB_SSL=false` 를 남겨도 기동한다 → Task 3 Step 1 테스트.
4. **객체 `{ host: '', socketPath }`** — 빈 `host` 는 없는 것, 소켓 모드(배타 오류 아님) → Task 3 Step 1 테스트.
5. **대문자 16진 v4-mapped(`::FFFF:7F00:1/128`)** — 규칙 4 로 거부. 소문자만 재면 대소문자 경로가 비어 있다 → Task 2 Step 1 테스트.

---

### Task 1: admin-shared `createQuerySchema` d.ts — TS2536 과 `check:dts` 게이트

**Files:**

- Create: `packages/admin-shared/tsconfig.dts.json`
- Create: `packages/admin-server/tsconfig.dts.json`
- Modify: `packages/admin-shared/package.json`(scripts) · `packages/admin-server/package.json`(scripts)
- Modify: `package.json`(루트 scripts)
- Modify: `.github/workflows/ci.yml`(check 잡)
- Modify: `packages/admin-shared/src/pagination.ts:117-131`(`createQuerySchema`)
- Test: `packages/admin-shared/src/pagination.test.ts`
- Modify: `CLAUDE.md:22`(명령어 주석) · `.claude/commands/check.md:2,7`

**Interfaces:**

- Consumes: 없음.
- Produces: 루트 `pnpm check:dts`(= `pnpm -r --if-present check:dts`), 패키지 `check:dts`(= `tsc -p tsconfig.dts.json`). `pnpm check` 가 build 뒤에 `check:dts` 를 돈다. Task 6 이 worktree 에서 `pnpm check:dts` 를 부른다.

- [ ] **Step 1: 게이트를 만든다(아직 고치지 않는다)**

`packages/admin-shared/tsconfig.dts.json`(새):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "types": []
  },
  "files": ["dist/index.d.ts"]
}
```

`packages/admin-server/tsconfig.dts.json`(새):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "types": ["node"]
  },
  "files": ["dist/index.d.ts", "dist/runner.d.ts"],
  "include": ["dist/database/migrations/*.d.ts"]
}
```

두 `package.json` 의 `scripts` 에 `"typecheck"` 다음 줄로 더한다:

```json
    "check:dts": "tsc -p tsconfig.dts.json",
```

루트 `package.json` `scripts` — `"build"` 다음 줄에 `"check:dts": "pnpm -r --if-present check:dts",` 를 더하고, `"check"` 를 바꾼다:

```json
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:dts",
```

`.github/workflows/ci.yml` check 잡 — `Build` 단계 다음에 더한다:

```yaml
- name: Declaration Check
  run: pnpm check:dts
```

왜 이렇게(주석을 JSON 에 쓸 수 없어 여기 적는다 — Step 7 에서 CLAUDE.md 에도 옮긴다): 발행 d.ts 를 `skipLibCheck: false` 소비자처럼 검사한다(스펙 §5-4). admin-shared 는 브라우저 소비자 기준이라 DOM 을 넣는다 — lib 에 DOM 도 `@types/node` 도 없으면 zod 자체 d.ts 가 `File` 등을 못 찾아 4건이 난다(실측). admin-server 는 Node 소비자 기준(`types: ["node"]`). admin-ui 는 넣지 않는다 — 자기 d.ts 는 0건이지만 Vuetify 4.2 d.ts 가 `skipLibCheck: false` 에서 수백 건이라 그 소비자는 어차피 `true` 다.

- [ ] **Step 2: 게이트가 3건을 잡는지 본다**

Run:

```bash
pnpm --filter @ssworks/admin-shared build && pnpm --filter @ssworks/admin-server build && pnpm check:dts
```

Expected: FAIL — `packages/admin-shared` 의 `check:dts` 에서 `dist/pagination.d.ts(78,…): error TS2536: Type 'TSortable[number]' cannot be used to index type '{ [k_1 in TSortable[number]]: k_1; } extends infer T_2 …'` 3건. 다른 오류가 있으면 멈추고 보고한다(main dist 실측은 3건뿐이었다).

admin-server 쪽도 따로 본다 — `pnpm --filter @ssworks/admin-server check:dts` 가 같은 3건(`../admin-shared/dist/pagination.d.ts`)만 내야 한다.

- [ ] **Step 3: 타입 테스트를 더한다(고치기 전에도 통과한다 — 고친 뒤 추론이 그대로인지 지키는 회귀 가드)**

`packages/admin-shared/src/pagination.test.ts` — 첫 줄 import 를 바꾼다:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest'
```

`describe('createQuerySchema — 정렬 · 필터', …)` 안, `it('filterShape 를 생략해도 된다', …)` 다음에 더한다:

```ts
it('타입 — 출력 sortBy 는 정렬 칸 배열, 입력은 단일값 · 배열 · 생략(2f-2b TS2536 고침 뒤에도 같다)', () => {
  type Out = z.output<typeof schema>
  type In = z.input<typeof schema>
  expectTypeOf<Out['sortBy']>().toEqualTypeOf<('createAt' | 'userName')[]>()
  expectTypeOf<Out['sortOrder']>().toEqualTypeOf<('asc' | 'desc')[]>()
  expectTypeOf<In['sortBy']>().toEqualTypeOf<
    'createAt' | 'userName' | ('createAt' | 'userName')[] | undefined
  >()
  expectTypeOf<Out['filter']>().toEqualTypeOf<{ userId?: string; teamNo?: bigint } | undefined>()
  // @ts-expect-error 정렬 칸 밖 값은 컴파일 오류다
  const wrong: Out['sortBy'] = ['password']
  expect(wrong).toEqual(['password'])
})
```

Run: `pnpm --filter @ssworks/admin-shared typecheck && pnpm exec vitest run packages/admin-shared/src/pagination.test.ts`
Expected: PASS(스크래치 프로토타입에서 네 동등성이 고치기 전후 모두 성립했다).

- [ ] **Step 4: 고친다**

`packages/admin-shared/src/pagination.ts` 의 `createQuerySchema` 안:

```ts
const columnSchema = z.enum(sortableColumns)
```

을 바꾼다:

```ts
// 🔴 타입을 적어 둔다 — z.enum 의 추론 반환 타입(Flatten 조건부 타입)이 d.ts 에 풀려 나와 skipLibCheck: false
//    소비자에서 TS2536 3건이 났다(2f-2b 스펙 §5-4). 출력 · 입력은 같다(pagination.test.ts 의 타입 테스트).
const columnSchema: z.ZodType<TSortable[number], TSortable[number]> = z.enum(sortableColumns)
```

- [ ] **Step 5: 게이트가 0건인지 본다**

Run:

```bash
pnpm --filter @ssworks/admin-shared build && pnpm --filter @ssworks/admin-server build && pnpm check:dts && pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-server typecheck && pnpm exec vitest run packages/admin-shared/src/pagination.test.ts packages/admin-shared/src/audit.test.ts
```

Expected: 모두 PASS. `check:dts` 는 두 패키지 모두 출력 없이 끝난다. admin-server typecheck 는 `users.query.ts` · `sessions.query.ts` 의 `createQuerySchema` 사용처를 지킨다.

- [ ] **Step 6: 문서 두 곳의 단계 목록을 맞춘다**

`CLAUDE.md` 명령어 블록의 줄:

```
pnpm check                              # lint → typecheck → test → build
```

을 바꾼다:

```
pnpm check                              # lint → typecheck → test → build → check:dts
pnpm check:dts                          # 발행 d.ts 를 skipLibCheck: false 로(admin-shared · admin-server — build 뒤)
```

같은 블록 아래 문단(`admin-ui 는 @ssworks/admin-shared 를 dist/ 로 import 한다 …`) 끝에 한 문장을 더한다: `check:dts 는 발행 d.ts 를 쓰는 쪽처럼 검사한다 — admin-shared 는 DOM lib(브라우저 소비자), admin-server 는 @types/node(Node 소비자). admin-ui 는 Vuetify d.ts 가 skipLibCheck: false 에서 깨져 넣지 않는다.`

`.claude/commands/check.md` — 2행 `description` 의 `(lint → typecheck → test → build)` 를 `(lint → typecheck → test → build → check:dts)` 로, 7행의 `(lint / typecheck / test / build)` 를 `(lint / typecheck / test / build / check:dts)` 로.

- [ ] **Step 7: 포맷 · 린트 · 커밋**

```bash
pnpm exec prettier --write package.json packages/admin-shared/package.json packages/admin-server/package.json packages/admin-shared/tsconfig.dts.json packages/admin-server/tsconfig.dts.json .github/workflows/ci.yml packages/admin-shared/src/pagination.ts packages/admin-shared/src/pagination.test.ts CLAUDE.md .claude/commands/check.md
pnpm exec eslint packages/admin-shared/src
git add package.json packages/admin-shared/package.json packages/admin-server/package.json packages/admin-shared/tsconfig.dts.json packages/admin-server/tsconfig.dts.json .github/workflows/ci.yml packages/admin-shared/src/pagination.ts packages/admin-shared/src/pagination.test.ts CLAUDE.md .claude/commands/check.md
git commit -m "fix(admin-shared): createQuerySchema d.ts 의 TS2536 3건 — 정렬 칸 스키마 타입 표기, check:dts 게이트(2f-2b)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: admin-shared IP 파서 조이기

**Files:**

- Modify: `packages/admin-shared/src/ip-access.ts:49-150`(`normalizeIp` · `expandEmbeddedIpv4` 호출부 · `parseIpv6` · `parseCidr`)
- Test: `packages/admin-shared/src/ip-access.test.ts`

**Interfaces:**

- Consumes: 없음.
- Produces: 공개 함수 시그니처 그대로. 판정이 스펙 §5-5 로 바뀐다. 모듈 내부 상수 `V4_MAPPED_DOTTED`(export 하지 않는다). Task 4 가 `ipCidrSchema` 를 거치는 HTTP 400 을 잰다(admin-shared 재빌드 필요).

- [ ] **Step 1: 측정표 테스트를 쓴다**

`packages/admin-shared/src/ip-access.test.ts` — `describe('isValidCidr — 검증과 평가가 같은 파서(hangang R30)', …)` 블록 다음, `describe('층 · 평가', …)` 앞에 더한다(import 는 이미 다 있다):

```ts
describe('파서 조이기 — 2f-2b 스펙 §5-5 측정표', () => {
  it('🔴 ::ffff: 는 점 표기 IPv4 앞에서만 뗀다(규칙 1)', () => {
    expect(normalizeIp('::ffff:1::')).toBe('::ffff:1::')
    expect(normalizeIp('::FFFF:1.2.3.4')).toBe('1.2.3.4')
    expect(normalizeIp('::ffff:7f00:1')).toBe('::ffff:7f00:1')
  })

  it.each<[string, boolean]>([
    ['1.2.3.4::', false], // 규칙 2 — 내장 IPv4 는 마지막 그룹에만
    ['1.2.3.4::5', false],
    ['::1.2.3.4', true],
    ['1:2:3:4:5:6:1.2.3.4', true],
    ['::ffff:1:2:3:4:5:6', true], // 규칙 1 — 점 표기가 아니면 떼지 않는다
    ['::FFFF:1.2.3.4', true],
    ['::ffff:7f00:1', false], // 규칙 4 — v4-mapped 영역은 점 표기만
    ['::FFFF:7F00:1', false],
    ['0:0:0:0:0:ffff:1.2.3.4', false],
  ])('isValidIp(%s) → %s', (ip, expected) => {
    expect(isValidIp(ip)).toBe(expected)
  })

  it.each<[string, boolean]>([
    ['::ffff:1::/120', false], // 규칙 1 — 떼지 않으니 :: 가 두 번
    ['::1/64', true], // 규칙 3 — 루프백 접기는 /128 에만
    ['::1/120', true],
    ['::1/128', true],
    ['::ffff:7f00:1/128', false], // 규칙 4
    ['::FFFF:7F00:1/128', false],
    ['0:0:0:0:0:ffff:1.2.3.4/128', false],
    ['::ffff:203.0.113.0/120', true],
    ['::ffff:0.0.0.0/64', false],
  ])('isValidCidr(%s) → %s', (cidr, expected) => {
    expect(isValidCidr(cidr)).toBe(expected)
  })

  it.each<[string, string, boolean]>([
    ['127.0.0.5', '::1/120', false], // 지금은 127.0.0.0/24 로 오독한다
    ['::5', '::1/120', true],
    ['::1', '::1/128', true],
    ['127.0.0.1', '::1/128', true],
    ['0:0:0:0:0:0:0:1', '::1/128', true],
    ['::1', '::1/64', false], // 루프백은 v4 로 접힌다 — ::/0 이 IPv4 를 통과시키지 않는 것과 같다
    ['::2', '::1/64', true],
    ['203.0.113.9', '::ffff:203.0.113.0/120', true],
  ])('ipInCidr(%s, %s) → %s', (ip, cidr, expected) => {
    expect(ipInCidr(ip, cidr)).toBe(expected)
  })

  it('🔴 /128 루프백만 v4 로 접힌다 — 다른 프리픽스는 비트 그대로 IPv6 망(규칙 3)', () => {
    expect(parseCidr('::1/128')).toEqual({ net: new Uint8Array([127, 0, 0, 1]), prefix: 32 })
    const wide = parseCidr('::1/64')
    expect(wide?.net.length).toBe(16)
    expect(wide?.prefix).toBe(64)
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm exec vitest run packages/admin-shared/src/ip-access.test.ts`
Expected: FAIL — 적어도 `normalizeIp('::ffff:1::')`(받은 값 `'1::'`), `isValidIp(1.2.3.4::)`, `isValidIp(::ffff:1:2:3:4:5:6)`, `isValidIp(0:0:0:0:0:ffff:1.2.3.4)`, `isValidCidr(::ffff:1::/120)`, `isValidCidr(::1/64)`, `isValidCidr(0:0:0:0:0:ffff:1.2.3.4/128)`, `ipInCidr(127.0.0.5, ::1/120)`, `ipInCidr(::5, ::1/120)`, `ipInCidr(::2, ::1/64)`, 규칙 3 `parseCidr('::1/64')`. 기존 테스트는 모두 초록.

- [ ] **Step 3: 고친다**

`packages/admin-shared/src/ip-access.ts` — 파일 머리 "바꾼 점" 목록 끝(`//  - 정규식에 백슬래시 문자 클래스를 …` 줄 다음)에 한 줄 더한다:

```ts
//  - 파서 조이기(2f-2b 스펙 §5-5): ::ffff: 는 점 표기 앞에서만 떼고, 내장 IPv4 는 마지막 그룹에만, 루프백 CIDR 접기는 /128 에만,
//    v4-mapped 영역은 ::ffff:a.b.c.d 꼴만 받는다.
```

`PREFIX_DIGITS` 정의 다음에 상수를 더한다:

```ts
/** 점 표기 IPv4 를 담은 v4-mapped 머리. 🔴 점 표기 앞에서만 뗀다 — `::ffff:1::` 을 `1::` 로 바꾸지 않는다 */
const V4_MAPPED_DOTTED = /^::ffff:(?=[0-9]+[.])/i
```

`normalizeIp` 본문의 첫 줄을 바꾼다:

```ts
const unmapped = ip.replace(V4_MAPPED_DOTTED, '')
```

`parseIpv6` 함수 전체를 바꾸고 바로 뒤에 `isV4MappedBytes` 를 더한다(바뀐 곳은 `head` · `tail` 두 줄과 끝의 검사):

```ts
function parseIpv6(ip: string): Uint8Array | null {
  let text = ip
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  const gap = text.indexOf('::')
  if (gap !== text.lastIndexOf('::')) return null
  const split = (part: string): string[] => (part === '' ? [] : part.split(':'))
  // 🔴 내장 IPv4 는 주소 전체의 마지막 그룹에만 — `::` 앞쪽(`1.2.3.4::`)의 점 표기는 아래 16진 그룹 검사에서 떨어진다
  const head = gap >= 0 ? split(text.slice(0, gap)) : expandEmbeddedIpv4(split(text))
  const tail = gap >= 0 ? expandEmbeddedIpv4(split(text.slice(gap + 2))) : []
  if (head === null || tail === null) return null
  const total = head.length + tail.length
  if (gap >= 0 ? total > 8 : total !== 8) return null
  const groups =
    gap >= 0 ? [...head, ...Array.from({ length: 8 - total }, () => '0'), ...tail] : head
  const out = new Uint8Array(16)
  for (let i = 0; i < 8; i += 1) {
    const group = groups[i] ?? ''
    if (!IPV6_GROUP.test(group)) return null
    const value = parseInt(group, 16)
    out[i * 2] = value >> 8
    out[i * 2 + 1] = value & 0xff
  }
  // 🔴 v4-mapped 영역(::ffff:0:0/96)은 `::ffff:a.b.c.d` 꼴만 받는다 — 그 꼴은 normalizeIp · parseCidr 가 먼저 v4 로 접으므로
  //    여기 온 것은 16진 · 풀어 쓴 표기다. 받으면 저장은 되고 아무도 통과하지 못한다(hangang R16).
  if (isV4MappedBytes(out)) return null
  return out
}

/** 앞 80비트가 0 이고 다음 16비트가 ffff — `::ffff:0:0/96` 안의 주소 */
function isV4MappedBytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < 10; i += 1) if (bytes[i] !== 0) return false
  return bytes[10] === 0xff && bytes[11] === 0xff
}
```

`parseCidr` 의 문서 주석과 본문 전체를 바꾼다:

```ts
/**
 * CIDR 하나를 읽는다. 형식이 아니면 null.
 * 🔴 접히는 경우는 둘뿐이다(2f-2b 스펙 §5-5) — 점 표기 v4-mapped(`::ffff:203.0.113.0/120` — 마지막 32비트가 v4 라
 *    프리픽스에서 96 을 빼고, 96 미만이면 v4 로 표현할 수 없어 거부한다 · hangang R16)와 `/128` 루프백(한 주소라
 *    `127.0.0.1/32`). 루프백의 다른 프리픽스는 비트 그대로 IPv6 망이다 — `::1/120` 을 127.0.0.0/24 로 읽지 않는다.
 */
export function parseCidr(cidr: string): ParsedCidr | null {
  const slash = cidr.lastIndexOf('/')
  if (slash < 0) return null
  const prefixText = cidr.slice(slash + 1)
  if (!PREFIX_DIGITS.test(prefixText)) return null
  const rawNet = cidr.slice(0, slash)
  const prefix = Number(prefixText)
  if (V4_MAPPED_DOTTED.test(rawNet)) {
    if (prefix < 96) return null
    return withinFamily(parseIpv4(rawNet.replace(V4_MAPPED_DOTTED, '')), prefix - 96)
  }
  // 여기서 normalizeIp 가 바꾸는 것은 루프백 표기뿐이다(v4-mapped 는 위에서 끝났다)
  const loopback = normalizeIp(rawNet) !== rawNet
  if (loopback && prefix === 128) return withinFamily(parseIpv4('127.0.0.1'), 32)
  return withinFamily(parseIp(rawNet), prefix)
}

function withinFamily(net: Uint8Array | null, prefix: number): ParsedCidr | null {
  if (net === null || prefix > net.length * 8) return null
  return { net, prefix }
}
```

`isValidIp` · `ipInCidr` · `expandEmbeddedIpv4` · `parseIp` 는 그대로다.

- [ ] **Step 4: 통과를 본다**

Run: `pnpm exec vitest run packages/admin-shared/src/ip-access.test.ts && pnpm --filter @ssworks/admin-shared typecheck`
Expected: PASS — 새 describe 전부와 기존 테스트 전부. 기존 테스트의 기대값이 하나라도 바뀌어야 초록이 된다면 멈추고 보고한다(스펙 §8-1 — 바뀌는 기존 기대값은 없어야 한다).

- [ ] **Step 5: admin-shared 를 다시 빌드하고 admin-server 단위 테스트를 돈다**

Run:

```bash
pnpm --filter @ssworks/admin-shared build && pnpm exec vitest run --project admin-server
```

Expected: PASS. (admin-server 는 `dist/` 를 본다. vitest 프로젝트 이름이 다르면 `pnpm --filter @ssworks/admin-server test` 로 돈다.)

- [ ] **Step 6: 포맷 · 린트 · 커밋**

```bash
pnpm exec prettier --write packages/admin-shared/src/ip-access.ts packages/admin-shared/src/ip-access.test.ts
pnpm exec eslint packages/admin-shared/src
git add packages/admin-shared/src/ip-access.ts packages/admin-shared/src/ip-access.test.ts
git commit -m "fix(admin-shared): IP 파서 조이기 — ::ffff: 는 점 표기 앞에서만, 내장 IPv4 는 마지막 그룹, 루프백 접기는 /128, v4-mapped 는 점 표기만(2f-2b)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: admin-server DB 연결 — TLS · 소켓 · env

**Files:**

- Modify: `packages/admin-server/src/database/connection.ts`(전체)
- Test: `packages/admin-server/src/database/connection.test.ts`

**Interfaces:**

- Consumes: 없음.
- Produces:

```ts
export interface AdminDbConnection {
  host?: string
  port?: number
  socketPath?: string
  user: string
  password: string
  database: string
  ssl?: PoolConfig['ssl'] // mariadb: boolean | (SecureContextOptions & { rejectUnauthorized?: boolean })
  connectionLimit?: number
  acquireTimeout?: number
}
export function adminDbConnectionFromEnv(env?: Readonly<Record<string, string | undefined>>): AdminDbConnection
export function adminPoolConfig(connection: AdminDbConnection): PoolConfig
export function poolEnvInt(name: string, fallback: number, env?: …): number // 그대로
```

오류 문구(정확히 — Task 4 · 6 이 단언한다):

| 상황                                         | 메시지                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| 객체 `host` · `socketPath` 둘 다             | `AdminDbConnection 은 host 와 socketPath 중 하나만 둔다`                          |
| 객체 둘 다 없음                              | `AdminDbConnection 에 host 나 socketPath 가 없다`                                 |
| 객체 `socketPath` + `port` 또는 truthy `ssl` | `socketPath 는 port · ssl 과 함께 쓰지 않는다`                                    |
| env 빠짐                                     | `필수 환경변수가 없다: DB_HOST(또는 DB_SOCKET_PATH), DB_USER, DB_NAME`(빠진 것만) |
| env 소켓 + `DB_HOST`/`DB_PORT`               | `DB_SOCKET_PATH 는 DB_HOST · DB_PORT 와 함께 쓰지 않는다`                         |
| env 소켓 + `DB_SSL`(false 아님)/`DB_SSL_CA`  | `DB_SOCKET_PATH 는 DB_SSL · DB_SSL_CA 와 함께 쓰지 않는다`                        |
| `DB_SSL` 이 true · false · 빈 값 밖          | `DB_SSL 은 true 나 false 여야 한다`                                               |
| `DB_SSL=false` + `DB_SSL_CA`                 | `DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다`                                   |
| CA 파일 못 읽음                              | `DB_SSL_CA 파일을 읽지 못했다(<errno 코드>)`                                      |
| CA 파일에 `-----BEGIN CERTIFICATE-----` 없음 | `DB_SSL_CA 가 PEM 인증서가 아니다`                                                |

- [ ] **Step 1: 테스트를 쓴다**

`packages/admin-server/src/database/connection.test.ts` — import 를 바꾼다:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rootCertificates } from 'node:tls'
import { afterAll, describe, expect, it } from 'vitest'
import {
  adminDbConnectionFromEnv,
  adminPoolConfig,
  poolEnvInt,
  type AdminDbConnection,
} from './connection.js'
```

기존 `it('🔴 빠진 이름을 모아 던지고 값은 담지 않는다', …)` 의 기대 문구를 바꾼다:

```ts
expect(() => adminDbConnectionFromEnv({ DB_PASSWORD: 's3cret' })).toThrow(
  '필수 환경변수가 없다: DB_HOST(또는 DB_SOCKET_PATH), DB_USER, DB_NAME',
)
```

파일 끝에 더한다:

```ts
// 2f-2b — TLS · 소켓(스펙 §5-1 · §5-2). PEM 은 Node 내장 공인 루트 하나를 빌려 쓴다(내용은 상관없다 — 형식만 본다).
const PEM = rootCertificates[0]!
const tmp = mkdtempSync(join(tmpdir(), 'akdb-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
const pemFile = join(tmp, 'ca.pem')
writeFileSync(pemFile, PEM)
const notPemFile = join(tmp, 'not-a-cert.txt')
writeFileSync(notPemFile, 'hello')
const aDirectory = join(tmp, 'a-directory')
mkdirSync(aDirectory)

/** 던진 메시지 — 값 · 경로가 새는지 보려고 문자열로 받는다 */
function thrown(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('던지지 않았다')
}

describe('adminPoolConfig — 접속 대상 · TLS(2f-2b)', () => {
  const base = { user: 'u', password: 'p', database: 'd' }

  it('소켓만 — socketPath 를 넘기고 host · port 는 없다', () => {
    const config = adminPoolConfig({ ...base, socketPath: '/run/mysqld/mysqld.sock' })
    expect(config.socketPath).toBe('/run/mysqld/mysqld.sock')
    expect(config).not.toHaveProperty('host')
    expect(config).not.toHaveProperty('port')
    expect(config).toMatchObject({ timezone: 'Z', logParam: false, bigIntAsNumber: false })
  })

  it('Review Focus 4 — 빈 host 는 없는 것이다(소켓 모드)', () => {
    const config = adminPoolConfig({ ...base, host: '', socketPath: '/run/mysqld/mysqld.sock' })
    expect(config.socketPath).toBe('/run/mysqld/mysqld.sock')
    expect(config).not.toHaveProperty('host')
  })

  it('🔴 host 와 socketPath 는 하나만 · 둘 다 없으면 던진다', () => {
    expect(() => adminPoolConfig({ ...base, host: 'h', socketPath: '/s' })).toThrow(
      'AdminDbConnection 은 host 와 socketPath 중 하나만 둔다',
    )
    expect(() => adminPoolConfig({ ...base })).toThrow(
      'AdminDbConnection 에 host 나 socketPath 가 없다',
    )
  })

  it('🔴 socketPath 는 port · ssl 과 함께 쓰지 않는다 — ssl: false 는 괜찮다', () => {
    expect(() => adminPoolConfig({ ...base, socketPath: '/s', port: 3306 })).toThrow(
      'socketPath 는 port · ssl 과 함께 쓰지 않는다',
    )
    expect(() => adminPoolConfig({ ...base, socketPath: '/s', ssl: true })).toThrow(
      'socketPath 는 port · ssl 과 함께 쓰지 않는다',
    )
    expect(adminPoolConfig({ ...base, socketPath: '/s', ssl: false })).not.toHaveProperty('ssl')
  })

  it('ssl: true 는 그대로 · 없거나 false 면 ssl 키가 없다(지금 모양)', () => {
    expect(adminPoolConfig({ ...base, host: 'h', ssl: true }).ssl).toBe(true)
    expect(adminPoolConfig({ ...base, host: 'h' })).not.toHaveProperty('ssl')
    expect(adminPoolConfig({ ...base, host: 'h', ssl: false })).not.toHaveProperty('ssl')
  })

  it('🔴 ssl 객체는 얕은 복사 — 드라이버가 rejectUnauthorized 를 다시 써도 넘긴 객체는 그대로다', () => {
    const ssl = { ca: PEM, rejectUnauthorized: true }
    const config = adminPoolConfig({ ...base, host: 'h', ssl })
    expect(config.ssl).toEqual(ssl)
    expect(config.ssl).not.toBe(ssl)
    ;(config.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized = false
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(adminPoolConfig({ ...base, host: 'h', ssl: {} }).ssl).toEqual({})
  })
})

describe('adminDbConnectionFromEnv — 소켓 · TLS(2f-2b)', () => {
  const creds = { DB_USER: 'app', DB_PASSWORD: 's3cret', DB_NAME: 'admin' }
  const tcp = { ...creds, DB_HOST: 'db' }

  it('소켓 — DB_HOST 없이 읽고 host · port 키가 없다', () => {
    expect(
      adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '/run/mysqld/mysqld.sock' }),
    ).toEqual({
      socketPath: '/run/mysqld/mysqld.sock',
      user: 'app',
      password: 's3cret',
      database: 'admin',
      connectionLimit: 10,
      acquireTimeout: 10_000,
    })
  })

  it('🔴 소켓은 DB_HOST · DB_PORT · DB_SSL=true · DB_SSL_CA 와 함께 쓰지 않는다', () => {
    const socket = { ...creds, DB_SOCKET_PATH: '/s' }
    for (const extra of [{ DB_HOST: 'db' }, { DB_PORT: '3306' }]) {
      expect(() => adminDbConnectionFromEnv({ ...socket, ...extra })).toThrow(
        'DB_SOCKET_PATH 는 DB_HOST · DB_PORT 와 함께 쓰지 않는다',
      )
    }
    for (const extra of [{ DB_SSL: 'true' }, { DB_SSL: 'maybe' }, { DB_SSL_CA: pemFile }]) {
      expect(() => adminDbConnectionFromEnv({ ...socket, ...extra })).toThrow(
        'DB_SOCKET_PATH 는 DB_SSL · DB_SSL_CA 와 함께 쓰지 않는다',
      )
    }
  })

  it('Review Focus 3 — 소켓 + DB_SSL=false 는 기동한다', () => {
    expect(
      adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '/s', DB_SSL: 'false' }),
    ).not.toHaveProperty('ssl')
  })

  it('Review Focus 1 — 공백만 든 DB_SOCKET_PATH · DB_SSL_CA 는 없는 것이다', () => {
    const connection = adminDbConnectionFromEnv({ ...tcp, DB_SOCKET_PATH: '  ', DB_SSL_CA: '  ' })
    expect(connection.host).toBe('db')
    expect(connection).not.toHaveProperty('socketPath')
    expect(connection).not.toHaveProperty('ssl')
    expect(() => adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '  ' })).toThrow(
      '필수 환경변수가 없다: DB_HOST(또는 DB_SOCKET_PATH)',
    )
  })

  it('DB_SSL — true(앞뒤 공백 무시)는 켬, false · 빈 값 · 없음은 끔', () => {
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'true' }).ssl).toBe(true)
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL: ' true ' }).ssl).toBe(true)
    for (const off of [{ DB_SSL: 'false' }, { DB_SSL: '' }, {}]) {
      expect(adminDbConnectionFromEnv({ ...tcp, ...off })).not.toHaveProperty('ssl')
    }
  })

  it.each(['TRUE', '1', 'yes', 'on'])('🔴 DB_SSL=%s 는 던지고 값을 담지 않는다', (raw) => {
    const message = thrown(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL: raw }))
    expect(message).toBe('DB_SSL 은 true 나 false 여야 한다')
  })

  it('DB_SSL_CA — PEM 을 읽어 ssl: { ca } 로 켠다(DB_SSL 이 비었어도 · true 여도)', () => {
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: pemFile }).ssl).toEqual({ ca: PEM })
    expect(adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'true', DB_SSL_CA: pemFile }).ssl).toEqual({
      ca: PEM,
    })
  })

  it('🔴 DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다', () => {
    expect(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'false', DB_SSL_CA: pemFile })).toThrow(
      'DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다',
    )
  })

  it('🔴 Review Focus 2 — 못 읽는 CA 는 errno 코드만, 경로는 담지 않는다', () => {
    const missing = thrown(() =>
      adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: join(tmp, 'nope.pem') }),
    )
    expect(missing).toBe('DB_SSL_CA 파일을 읽지 못했다(ENOENT)')
    const directory = thrown(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: aDirectory }))
    expect(directory).toMatch(/^DB_SSL_CA 파일을 읽지 못했다[(][A-Z]+[)]$/)
    for (const message of [missing, directory]) {
      expect(message).not.toContain(tmp)
      expect(message).not.toContain('akdb-')
    }
  })

  it('PEM 인증서가 아닌 파일은 던진다', () => {
    expect(() => adminDbConnectionFromEnv({ ...tcp, DB_SSL_CA: notPemFile })).toThrow(
      'DB_SSL_CA 가 PEM 인증서가 아니다',
    )
  })

  it('객체에서 adminPoolConfig 까지 — env 의 TLS 가 풀 옵션에 실린다(앱 · 러너 공용)', () => {
    expect(adminPoolConfig(adminDbConnectionFromEnv({ ...tcp, DB_SSL: 'true' })).ssl).toBe(true)
    expect(
      adminPoolConfig(adminDbConnectionFromEnv({ ...creds, DB_SOCKET_PATH: '/s' })).socketPath,
    ).toBe('/s')
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `pnpm exec vitest run packages/admin-server/src/database/connection.test.ts`
Expected: FAIL — 빠진 키 문구, 소켓 · TLS 의 새 테스트 대부분(`socketPath` 가 풀 옵션에 없다 · `ssl` 을 옮기지 않는다 · 배타 오류가 없다). typecheck 도 `host` 필수 때문에 `adminPoolConfig({ ...base, socketPath })` 에서 실패할 수 있다 — 정상이다.

- [ ] **Step 3: 구현한다**

`packages/admin-server/src/database/connection.ts` 전체를 바꾼다:

```ts
import { readFileSync } from 'node:fs'
import type { PoolConfig } from 'mariadb'

// 정본: hangang-home apps/api/src/core/database/pool-options.ts · database.module.ts(createDb),
//       ssworks-gise-home apps/api/src/core/database/pool.ts
// 바꾼 점:
//  - 접속 정보를 `process.env` 에서 직접 읽지 않고 `AdminDbConnection` 으로 받는다. env 를 읽는 자리는
//    `adminDbConnectionFromEnv()` 하나다. 이름은 hangang(`DB_NAME`) — gise 처럼 `DB_DATABASE` 를 쓰는 프로젝트는
//    객체를 직접 만들어 넘긴다.
//  - TLS(`ssl`) · 유닉스 소켓(`socketPath`)을 받는다(2f-2b — 정본 넷 모두 없었다). env 는 검증하는 두 가지
//    (`DB_SSL=true` · `DB_SSL_CA`)와 `DB_SOCKET_PATH` 만 연다 — 검증을 끄는 것은 코드로만(2f-2b 스펙 ③ T1).
//  - 🔴 이 파일은 Nest 를 import 하지 않는다 — 마이그레이션 러너(kysely.config.ts)가 `@ssworks/admin-server/runner`
//    로 읽는다(정본 규약 그대로).

/** DB 접속 정보. 풀 안전 옵션은 `adminPoolConfig()` 가 고정하고 여기서는 바꾸지 못한다. */
export interface AdminDbConnection {
  /** TCP 호스트. 🔴 `socketPath` 와 둘 중 하나만 */
  host?: string
  /** 기본 3306. `socketPath` 와 함께 쓰지 않는다 */
  port?: number
  /** 유닉스 소켓(Windows 는 명명 파이프 경로). 🔴 `host` · `port` · `ssl` 과 함께 쓰지 않는다 */
  socketPath?: string
  user: string
  password: string
  database: string
  /**
   * TLS — mariadb 드라이버 `ssl` 그대로. `true` = 시스템 CA 로 검증(MariaDB 11.4.1+ 의 자체 서명은 드라이버가
   * 비밀번호 지문으로 검증), 객체 = `{ ca, cert, key, servername, checkServerIdentity, rejectUnauthorized … }`.
   * 🔴 `rejectUnauthorized: false` 는 검증을 끈다 — 암호화만 되고 중간자를 막지 못한다.
   */
  ssl?: PoolConfig['ssl']
  /** 풀 크기. 기본 10 — `connectionLimit × API 프로세스 수` 가 DB `max_connections` 여유 안에 들어야 한다(hangang) */
  connectionLimit?: number
  /** 풀에서 연결을 기다리는 한도(ms). 기본 10 000 */
  acquireTimeout?: number
}

type Env = Readonly<Record<string, string | undefined>>

const DEFAULT_PORT = 3306
const DEFAULT_CONNECTION_LIMIT = 10
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000
const PEM_CERTIFICATE = '-----BEGIN CERTIFICATE-----'

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

const REQUIRED_KEYS = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const

/** 앞뒤 공백을 뗀 값. 비면 undefined — 공백만 든 env 는 없는 것으로 본다(새 env 셋만 — 기존 키의 판정은 그대로) */
function envText(env: Env, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}

/** `DB_SSL` — 없음 · 빈 값은 undefined, `true` · `false` 만 받는다. 🔴 값을 메시지에 담지 않는다 */
function sslFlag(env: Env): boolean | undefined {
  const raw = envText(env, 'DB_SSL')
  if (raw === undefined) return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error('DB_SSL 은 true 나 false 여야 한다')
}

/** 🔴 Node 오류 메시지는 경로를 담는다 — 그대로 다시 던지지 않고 errno 코드만 담는다(cause 도 달지 않는다) */
function readCaFile(path: string): string {
  let pem: string
  try {
    pem = readFileSync(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN'
    throw new Error(`DB_SSL_CA 파일을 읽지 못했다(${code})`)
  }
  if (!pem.includes(PEM_CERTIFICATE)) throw new Error('DB_SSL_CA 가 PEM 인증서가 아니다')
  return pem
}

/** env 의 TLS — `DB_SSL_CA` 가 있으면 그 CA 로 검증(지문 검증은 드라이버가 끈다), `DB_SSL=true` 면 시스템 CA */
function tlsFromEnv(env: Env): AdminDbConnection['ssl'] | undefined {
  const flag = sslFlag(env)
  const caPath = envText(env, 'DB_SSL_CA')
  if (caPath !== undefined) {
    if (flag === false) throw new Error('DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다')
    return { ca: readCaFile(caPath) }
  }
  return flag === true ? true : undefined
}

/**
 * `DB_HOST` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` · `DB_POOL_LIMIT` · `DB_ACQUIRE_TIMEOUT_MS` 와
 * `DB_SOCKET_PATH` · `DB_SSL` · `DB_SSL_CA` 를 읽는다(2f-2b 스펙 §5-2).
 */
export function adminDbConnectionFromEnv(env: Env = process.env): AdminDbConnection {
  const socketPath = envText(env, 'DB_SOCKET_PATH')
  if (socketPath !== undefined) {
    // 🔴 접속 대상이 모호하면 기동하지 않는다 — 드라이버는 소켓이 있으면 host · port 를 조용히 무시한다
    if (envText(env, 'DB_HOST') !== undefined || envText(env, 'DB_PORT') !== undefined)
      throw new Error('DB_SOCKET_PATH 는 DB_HOST · DB_PORT 와 함께 쓰지 않는다')
    const ssl = envText(env, 'DB_SSL')
    if ((ssl !== undefined && ssl !== 'false') || envText(env, 'DB_SSL_CA') !== undefined)
      throw new Error('DB_SOCKET_PATH 는 DB_SSL · DB_SSL_CA 와 함께 쓰지 않는다')
  }
  const missing = [
    ...(socketPath === undefined && !env.DB_HOST ? ['DB_HOST(또는 DB_SOCKET_PATH)'] : []),
    ...REQUIRED_KEYS.filter((key) => !env[key]),
  ]
  // 🔴 이름만 담는다. 값은 담지 않는다.
  if (missing.length > 0) throw new Error(`필수 환경변수가 없다: ${missing.join(', ')}`)
  const value = (key: string): string => env[key] ?? ''
  const common = {
    user: value('DB_USER'),
    password: value('DB_PASSWORD'),
    database: value('DB_NAME'),
    connectionLimit: poolEnvInt('DB_POOL_LIMIT', DEFAULT_CONNECTION_LIMIT, env),
    acquireTimeout: poolEnvInt('DB_ACQUIRE_TIMEOUT_MS', DEFAULT_ACQUIRE_TIMEOUT_MS, env),
  }
  if (socketPath !== undefined) return { socketPath, ...common }
  const ssl = tlsFromEnv(env)
  return {
    host: value('DB_HOST'),
    port: poolEnvInt('DB_PORT', DEFAULT_PORT, env),
    ...common,
    ...(ssl === undefined ? {} : { ssl }),
  }
}

/** 접속 대상 — TCP(host · port · ssl) 또는 소켓. 🔴 둘 중 하나만이다(2f-2b 스펙 §5-1). 빈 문자열은 없는 것이다 */
function adminDbTarget(
  connection: AdminDbConnection,
): Pick<PoolConfig, 'host' | 'port' | 'socketPath' | 'ssl'> {
  const hasHost = Boolean(connection.host)
  const hasSocket = Boolean(connection.socketPath)
  if (hasHost && hasSocket)
    throw new Error('AdminDbConnection 은 host 와 socketPath 중 하나만 둔다')
  if (!hasHost && !hasSocket) throw new Error('AdminDbConnection 에 host 나 socketPath 가 없다')
  if (hasSocket) {
    // 소켓은 로컬 연결이다 — 드라이버의 11.4 지문 검증도 소켓에서는 꺼져 TLS 를 얹으면 자체 서명에서 실패한다
    if (connection.port !== undefined || connection.ssl)
      throw new Error('socketPath 는 port · ssl 과 함께 쓰지 않는다')
    return { socketPath: connection.socketPath }
  }
  return {
    host: connection.host,
    port: connection.port ?? DEFAULT_PORT,
    // 🔴 객체는 얕은 복사 — 드라이버(connection-options.js)가 받은 객체의 rejectUnauthorized 를 다시 쓴다
    ...(connection.ssl ? { ssl: connection.ssl === true ? true : { ...connection.ssl } } : {}),
  }
}

/** 풀 옵션의 단일 출처 — 앱과 마이그레이션 러너가 같은 값을 쓴다. 접속 정보 밖의 키는 옮기지 않는다. */
export function adminPoolConfig(connection: AdminDbConnection): PoolConfig {
  return {
    ...adminDbTarget(connection),
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

- [ ] **Step 4: 통과를 본다**

Run:

```bash
pnpm exec vitest run packages/admin-server/src/database/connection.test.ts packages/admin-server/src/runner-graph.test.ts packages/admin-server/src/database/kysely.test.ts && pnpm --filter @ssworks/admin-server typecheck
```

Expected: PASS. `runner-graph` 는 `node:fs` 를 허용한다. typecheck 가 다른 파일(`test-support/db.ts` 의 `{ ...server, database }` 등)에서 `host` 선택화로 깨지면 그 자리를 보고한다 — 선택으로 바뀌었을 뿐이라 깨지지 않아야 한다.

- [ ] **Step 5: 패키지 전체 단위 · 린트 · 커밋**

```bash
pnpm --filter @ssworks/admin-server test
pnpm exec prettier --write packages/admin-server/src/database/connection.ts packages/admin-server/src/database/connection.test.ts
pnpm exec eslint packages/admin-server/src
git add packages/admin-server/src/database/connection.ts packages/admin-server/src/database/connection.test.ts
git commit -m "feat(admin-server): DB TLS · 유닉스 소켓 — AdminDbConnection ssl · socketPath, env DB_SSL · DB_SSL_CA · DB_SOCKET_PATH(2f-2b)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: 패키지 단위 테스트 전부 초록. 린트가 `preserve-caught-error` 같은 규칙으로 `readCaFile` 의 다시 던지기를 잡으면, `cause` 를 달지 않는 이유(경로가 담긴다)를 주석으로 남긴 `eslint-disable-next-line` 으로 막고 보고한다.

---

### Task 4: 실 MariaDB — TLS 접속 · IP CIDR 400

**Files:**

- Create: `packages/admin-server/src/database/connection.tls.db.test.ts`
- Modify: `packages/admin-server/src/ip-access/ip-access.http.db.test.ts:171-197`(기존 "검증 400" 테스트에 한 건)

**Interfaces:**

- Consumes: Task 3 의 `AdminDbConnection`(`ssl`) · `adminDbConnectionFromEnv`(`DB_SSL` · `DB_SSL_CA`) · `createAdminKysely(connection)`(`./kysely.js` — 그대로), test-support `createTestDatabase({ migrate: false })` · `testDbServer()`. Task 2 의 파서(admin-shared 재빌드 뒤).
- Produces: 없음.

실측(2026-10-15, mariadb:11.4.13 · 드라이버 3.5.4 — 플랜 작성 중 잰 값): 평문의 `Ssl_cipher` 는 `''`, `ssl: true` 는 `TLS_AES_256_GCM_SHA384`(지문 검증), 엉뚱한 CA 와 `REQUIRE SSL` 계정의 평문은 **풀을 지나면** 곧바로 실패하지 않고 `acquireTimeout` 뒤 `errno` 45028(`ER_GET_CONNECTION_TIMEOUT`) — 원인은 `cause` 에 `DEPTH_ZERO_SELF_SIGNED_CERT` · `errno` 1045. 그래서 실패 경우는 `acquireTimeout: 2000` 으로 줄인다. 지금 main 의 `adminPoolConfig` 는 `ssl` 을 옮기지 않아 `ssl: true` 도 평문이다(Task 3 전이면 1 이 실패한다).

- [ ] **Step 1: DB 컨테이너를 확인한다**

Run: `docker ps --filter name=admin-kit-test-db --format "{{.Names}} {{.Status}}"`
Expected: `admin-kit-test-db Up …`. 아니면 `docker start admin-kit-test-db` 뒤 다시 본다.

- [ ] **Step 2: TLS 테스트를 쓴다**

`packages/admin-server/src/database/connection.tls.db.test.ts`(새):

```ts
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rootCertificates } from 'node:tls'
import { sql } from 'kysely'
import { createConnection } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { adminDbConnectionFromEnv, type AdminDbConnection } from './connection.js'
import { createAdminKysely } from './kysely.js'

// 실 MariaDB 의 TLS(2f-2b 스펙 §8-2). 🔴 전제: 서버가 MariaDB 11.4.1+ 이고 TLS 를 켰다 — 11.4 는 인증서 설정 없이도
//    자체 서명을 만들어 TLS 를 켠다(CI db 잡 · db:test:up 의 mariadb:11.4). `ssl: true` 는 드라이버가 비밀번호 지문으로
//    그 자체 서명을 검증해 성공한다. 다른 서버(ADMIN_TEST_DB_URL)가 이 전제를 못 맞추면 1 · 3 · 4 가 실패한다.
// 실패는 풀을 지나면 acquireTimeout 뒤 ER_GET_CONNECTION_TIMEOUT(45028)이고 원인은 cause 에 실린다 — 2초로 줄인다.
// 계정은 서버 전역이라 실행마다 이름을 바꾸고 afterAll 에서 지운다.

const FAIL_FAST = 2000
const server = testDbServer()
let t: TestDatabase
const tlsUser = `akt_tls_${randomBytes(4).toString('hex')}`
const tlsPassword = `tls-${randomBytes(8).toString('hex')}`
const tmp = mkdtempSync(join(tmpdir(), 'aktls-'))
const wrongCa = join(tmp, 'wrong-ca.pem')

async function admin<T>(
  run: (query: (text: string) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const connection = await createConnection(server)
  try {
    return await run((text) => connection.query(text))
  } finally {
    await connection.end()
  }
}

/** 패키지 풀(createAdminKysely → adminPoolConfig)로 붙어 이 세션의 TLS 암호군을 읽는다 — 평문이면 '' */
async function cipherVia(connection: AdminDbConnection): Promise<string> {
  const db = createAdminKysely(connection)
  try {
    const { rows } = await sql<{ cipher: string }>`
      select variable_value as cipher from information_schema.session_status
      where variable_name = 'Ssl_cipher'`.execute(db)
    return rows[0]?.cipher ?? ''
  } finally {
    await db.destroy()
  }
}

beforeAll(async () => {
  t = await createTestDatabase({ migrate: false })
  writeFileSync(wrongCa, rootCertificates[0]!) // 공인 루트 — 서버 자체 서명을 서명하지 않았다
  await admin(async (query) => {
    await query(`create user '${tlsUser}'@'%' identified by '${tlsPassword}' require ssl`)
    // DB 이름은 akt_<hex> — 따옴표 없는 식별자로 된다(백틱을 쓰지 않는다)
    await query(`grant select on ${t.name}.* to '${tlsUser}'@'%'`)
  })
})

afterAll(async () => {
  rmSync(tmp, { recursive: true, force: true })
  await admin((query) => query(`drop user if exists '${tlsUser}'@'%'`))
  await t?.drop()
})

describe('DB TLS — 실 MariaDB 11.4(2f-2b)', () => {
  const root = (): AdminDbConnection => ({ ...server, database: t.name })

  it('ssl: true — 지문 검증으로 TLS 가 된다', async () => {
    expect(await cipherVia({ ...root(), ssl: true })).not.toBe('')
  })

  it('ssl 이 없으면 평문이다(기본 — 하위 호환)', async () => {
    expect(await cipherVia(root())).toBe('')
  })

  it('REQUIRE SSL 계정 — 평문은 거부(1045) · ssl: true 는 성공', async () => {
    const account = { ...root(), user: tlsUser, password: tlsPassword }
    await expect(cipherVia({ ...account, acquireTimeout: FAIL_FAST })).rejects.toMatchObject({
      errno: 45028,
      cause: { errno: 1045 },
    })
    expect(await cipherVia({ ...account, ssl: true })).not.toBe('')
  })

  it('env 경로 — DB_SSL=true 는 TLS, 엉뚱한 CA 의 DB_SSL_CA 는 거부된다', async () => {
    const env = {
      DB_HOST: server.host,
      DB_PORT: String(server.port),
      DB_USER: server.user,
      DB_PASSWORD: server.password,
      DB_NAME: t.name,
      DB_ACQUIRE_TIMEOUT_MS: String(FAIL_FAST),
    }
    expect(await cipherVia(adminDbConnectionFromEnv({ ...env, DB_SSL: 'true' }))).not.toBe('')
    await expect(
      cipherVia(adminDbConnectionFromEnv({ ...env, DB_SSL_CA: wrongCa })),
    ).rejects.toMatchObject({ errno: 45028, cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } })
  })
})
```

- [ ] **Step 3: IP CIDR 400 을 더한다**

`packages/admin-server/src/ip-access/ip-access.http.db.test.ts` 의 `it('검증 400 — CIDR 형식 · 범위 불변식(파이프) · 없는 팀(서비스)', …)` 안, 첫 `expect(issues(expectError(bad, …` 블록 다음에 더한다:

```ts
// 2f-2b 파서 조이기 — `::ffff:` 를 점 표기 앞에서만 떼므로 `::` 가 두 번인 표기가 서버 본문에서도 400 이다
const twoGaps = await sendJson(agent.post(IP_PATH), {
  scopeType: 'global',
  scopeRefNo: null,
  cidr: '::ffff:1::/120',
})
expect(issues(expectError(twoGaps, 400, CommonErrorCodes.ERR_COMMON_VALIDATION).details)).toEqual([
  ['cidr', IP_ACCESS_SCHEMA_MESSAGES.cidr],
])
```

- [ ] **Step 4: 실 DB 로 돈다**

Run:

```bash
pnpm --filter @ssworks/admin-shared build
pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts src/database/connection.tls.db.test.ts src/ip-access/ip-access.http.db.test.ts
```

Expected: PASS — TLS 넷(실패 둘은 각 2초 남짓) · IP HTTP 전부. 1 이 `''` 로 실패하면 Task 3 의 `ssl` 옮기기를 본다. 4 의 `cause.code` 가 다르면(드라이버 · Node 판) 받은 값을 보고하고 스펙 §13 에 적은 뒤 그 값으로 단언한다.

- [ ] **Step 5: 실 DB 전체 스위트를 한 번 돈다**

Run: `pnpm test:db`
Expected: 전부 초록. 끝 줄의 테스트 수를 적어 둔다(Task 7 이 쓴다 — 2f-2a 는 464, 새 파일의 넷이 늘어 468 이 기대값 — IP 400 은 기존 테스트 안의 단언이다). 다른 실 DB 스위트를 동시에 돌리지 않는다.

- [ ] **Step 6: 린트 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/src/database/connection.tls.db.test.ts packages/admin-server/src/ip-access/ip-access.http.db.test.ts
pnpm exec eslint packages/admin-server/src
git add packages/admin-server/src/database/connection.tls.db.test.ts packages/admin-server/src/ip-access/ip-access.http.db.test.ts
git commit -m "test(admin-server): 실 MariaDB TLS — ssl: true 지문 검증 · 평문 기본 · REQUIRE SSL · 엉뚱한 CA 거부, IP 두 번 :: 400(2f-2b)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: peer 하한 · changeset · 문서

**Files:**

- Modify: `packages/admin-server/package.json`(peer · `description`)
- Create: `.changeset/admin-server-publish-prep.md`
- Modify: `.changeset/README.md`("0.x 동안의 peer 범위" 절 전체)
- Modify: `packages/admin-server/README.md`(머리 문단 · 설치 · 환경 변수 표 · 새 절 "DB TLS · 소켓")
- Modify: `CLAUDE.md`(admin-server 규약 한 줄)

**Interfaces:**

- Consumes: Task 3 의 env 이름 · 오류 문구. Task 1 의 `check:dts`.
- Produces: peer `"@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0"` — Task 6 이 드라이런 · pack 으로 잰다.

플랜 작성 중 잰 값(2026-10-15): 이 peer 로 바꾼 뒤 `pnpm install` 은 경고 없이 "Lockfile is up to date" 였고(importer 자신의 peer 는 lockfile 에 없다), `pnpm --filter @ssworks/admin-server pack` 의 `package.json` 은 `"@ssworks/admin-shared": ">=0.4.0 <1.0.0"` · `"private": true` 그대로였다. 바꾼 것은 되돌렸다.

- [ ] **Step 1: peer · 설명을 바꾸고 설치를 본다**

`packages/admin-server/package.json`:

- `peerDependencies` 의 `"@ssworks/admin-shared": "workspace:^0",` → `"@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0",`
- `"description"` → `"관리자 API 공통 NestJS 모듈 — 응답 봉투 · 예외 필터 · 검증 파이프 · DB 연결(TLS · 소켓) · 코어 스키마 · 인증 · 세션 · 감사 · 역할 · 사용자 · 팀 · 약관 · IP 접근 제어."`

Run: `pnpm install && pnpm install --frozen-lockfile && git status --short`
Expected: 두 설치 모두 성공. `@ssworks/admin-shared` 에 대한 peer 경고 없음. `git status` 에 `packages/admin-server/package.json` 만(lockfile 이 바뀌었으면 그것도 — 바뀌면 함께 커밋한다).

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/admin-server-publish-prep.md`(새):

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': patch
---

**쓰는 쪽이 할 일:** 없음. admin-server 는 이제 `@ssworks/admin-shared` `>=0.4.0 <1.0.0` 을 peer 로 요구한다(첫 발행 때 같은 번호끼리 설치한다). DB 를 TLS 로 붙이려면 `DB_SSL=true` 나 `DB_SSL_CA`, 유닉스 소켓이면 `DB_SOCKET_PATH`(선택 — README "DB TLS · 소켓").

admin-server 첫 발행 준비(Phase 2 PR 2f-2b): `AdminDbConnection` 에 TLS(`ssl` — mariadb 드라이버 옵션 그대로) · 유닉스 소켓(`socketPath`), `host` 는 선택(`host` 와 `socketPath` 중 하나만 — 아니면 기동 실패, 소켓은 `port` · `ssl` 과 함께 쓰지 않는다). `adminDbConnectionFromEnv` 가 `DB_SSL=true`(시스템 CA · MariaDB 11.4.1+ 자체 서명은 드라이버 지문 검증) · `DB_SSL_CA`(PEM 파일 — 그 CA 로 체인 · 호스트 이름 검증) · `DB_SOCKET_PATH` 를 읽는다. 빠진 env 문구가 `DB_HOST(또는 DB_SOCKET_PATH)` 를 말한다. 검증 끄기 · 호스트 이름 생략 · 클라이언트 인증서는 코드로(README). 앱과 마이그레이션 러너가 같은 풀 옵션을 쓴다. 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: `skipLibCheck: false` 에서 `dist/pagination.d.ts` 의 TS2536 3건(`createQuerySchema`)을 없앴다 — 추론 결과는 같다. IP 파서: `::ffff:` 는 점 표기 IPv4 앞에서만 떼고(`::ffff:1::/120` 거부 · `::ffff:1:2:3:4:5:6` 받음), 내장 IPv4 는 마지막 그룹에만(`1.2.3.4::` 거부), `::1` 접기는 `/128` 에만(`::1/64` 는 IPv6 망 `::/64` · `::1/120` 은 더 이상 127.0.0.0/24 가 아니다), v4-mapped 영역은 `::ffff:a.b.c.d` 꼴만 받는다(`::ffff:7f00:1` · `0:0:0:0:0:ffff:1.2.3.4` 거부).
```

- [ ] **Step 3: `.changeset/README.md` 의 peer 절을 바꾼다**

`## 0.x 동안의 peer 범위` 제목부터 파일 끝까지를 이것으로 바꾼다:

```md
## 0.x 동안의 peer 범위

admin-ui · admin-server 는 admin-shared 를 peer 로 둔다. **`workspace:^` 를 쓰지 않는다** — changesets 는 이것을 `^<현재 버전>` 으로 읽는데, 0.x 에서 `^0.2.0` 은 0.3.0 을 덮지 못한다. peer 가 범위를 벗어나면 changesets 는 의존 패키지를 **major** 로 올리므로, admin-shared 의 minor 한 번에 세 패키지가 1.0.0 이 된다(첫 Version Packages PR 에서 실제로 그랬다).

| 패키지       | peer `@ssworks/admin-shared` | 발행 시          |
| ------------ | ---------------------------- | ---------------- |
| admin-ui     | `workspace:^0`               | `^0`             |
| admin-server | `workspace:>=0.4.0 <1.0.0`   | `>=0.4.0 <1.0.0` |

둘 다 0.x 의 모든 minor 를 덮는다 — `config.json` 의 `onlyUpdatePeerDependentsWhenOutOfRange: true` 와 한 벌이다(범위 안이면 changesets 가 의존 패키지를 올리지도, 범위를 다시 쓰지도 않는다). `fixed` 가 세 패키지를 같은 번호로만 내보내므로 소비자는 같은 번호끼리 설치하면 된다. `workspace:` 뒤의 범위는 pnpm 이 pack · publish 때 그대로 꺼내 쓴다.

**admin-server 의 하한**은 admin-server 가 import 하는 admin-shared API 가 모두 처음 실린 버전이다(0.4.0 — 감사 카탈로그 · 사용자 · 팀 · 약관 · IP 액션 · IP 파서). 🔴 admin-server 가 admin-shared 의 **새 export** 를 쓰기 시작하는 PR 은 하한을 그 export 가 실릴 버전으로 올린다 — 아니면 옛 admin-shared 와 함께 설치돼 런타임에 `undefined` 가 된다(예: `@Audit({ action: CoreAuditActions.X })`). admin-ui 는 0.2.0 · 0.3.0 이 이미 `^0` 으로 나갔다 — 같은 규칙이 필요해지면 그때 하한을 둔다.

**1.0 으로 갈 때** peer 를 `workspace:^` 로 되돌린다. 1.x 에서는 `^1.0.0` 이 이후 minor 를 덮으므로 실험 옵션만으로 major 연쇄가 생기지 않고, 발행 범위도 그 시점 버전(`^1.x.y`)으로 좁혀진다.
```

- [ ] **Step 4: admin-server README 를 고친다**

`packages/admin-server/README.md`:

① 머리 둘째 문단의 마지막 문장("인증 경로 정리 · 첫 발행 준비는 다음 PR(2f-2)이다" 로 시작해 "§1." 로 끝난다)을 바꾼다:

```md
인증 경로 정리(PR 2f-2a)와 첫 발행 준비(PR 2f-2b — DB TLS · 소켓 · peer 하한)까지 들어 있다 — 지도는 저장소 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §1.
```

② "## 설치" 의 목록 끝(`- Express 만 지원한다(…).` 다음)에 한 줄:

```md
- `@ssworks/admin-shared` 는 `>=0.4.0 <1.0.0`(peer) — admin-kit 세 패키지는 같은 번호끼리 설치한다.
```

③ "## 환경 변수" 표에서 `DB_HOST` 행을 바꾸고, `DB_PORT` 행 다음에 하나, `DB_ACQUIRE_TIMEOUT_MS` 행 다음에 둘을 더한다(정렬은 prettier 가 맞춘다):

```md
| `DB_HOST` | 예(소켓이 아니면) | | |
| `DB_SOCKET_PATH` | | | 유닉스 소켓 — 있으면 `DB_HOST` · `DB_PORT` · `DB_SSL=true` · `DB_SSL_CA` 와 함께 쓰면 기동 실패(아래 "DB TLS · 소켓") |
| `DB_SSL` | | 끔 | `true` 면 TLS 로 검증해 붙는다. `true` · `false` 밖이면 기동 실패 |
| `DB_SSL_CA` | | | PEM 파일 경로 — 그 CA 로 검증(TLS 를 켠다). 못 읽거나 PEM 이 아니거나 `DB_SSL=false` 와 함께면 기동 실패 |
```

④ 같은 절 끝 문장 `풀 안전 옵션(…)은 바꿀 수 없다.` 다음에 새 절을 더한다:

````md
### DB TLS · 소켓

- **TLS 켜기**: `DB_SSL=true` — 시스템 CA 로 서버 인증서와 호스트 이름을 검증한다. MariaDB 11.4 이상은 인증서를 설정하지 않아도 TLS 를 켜고 자체 서명 인증서를 만드는데, mariadb 드라이버(3.4+)가 비밀번호에서 나온 지문으로 그 인증서를 검증한다 — 비밀번호 있는 계정 · TCP 접속이면 CA 없이 `DB_SSL=true` 로 된다.
- **CA 고정**: `DB_SSL_CA=/run/secrets/db-ca.pem` — 그 CA 로 체인 · 호스트 이름을 검증한다(TLS 를 켜고, 드라이버의 지문 검증은 꺼진다). 관리형 DB 가 주는 CA 묶음을 여기 둔다.
- **DB 쪽에서도 강제한다**: 서버 `require_secure_transport=ON` 또는 계정 `ALTER USER … REQUIRE SSL` — 앱 설정이 빠져도 평문 접속이 거부된다.
- **env 로 못 하는 것은 코드로** — 검증을 끄는 env 는 없다.

  ```ts
  import { readFileSync } from 'node:fs'

  // 인증서 이름이 접속 주소와 다를 때(Cloud SQL 처럼) — CA 체인만 검증하고 호스트 이름은 건너뛴다.
  // 클라이언트 인증서(mTLS)는 같은 자리에 key · cert 를 더한다.
  const db = {
    ...adminDbConnectionFromEnv(),
    ssl: {
      ca: readFileSync('/run/secrets/db-ca.pem', 'utf8'),
      checkServerIdentity: () => undefined,
    },
  }
  ```

  🔴 `ssl: { rejectUnauthorized: false }` 는 검증을 끈다 — 암호화는 되지만 중간자를 막지 못한다. 쓰지 말고 CA 를 고정한다.

- **소켓**: `DB_SOCKET_PATH=/run/mysqld/mysqld.sock`(Windows 는 명명 파이프 경로). `DB_HOST` · `DB_PORT` · `DB_SSL=true` · `DB_SSL_CA` 와 함께 두면 기동 실패다 — 접속 대상이 모호하고, 소켓은 로컬 연결이라 TLS 를 얹지 않는다. 객체로는 `{ socketPath, user, password, database }`(`host` 와 하나만).
- 앱(`AdminServerModule`)과 러너(`kysely.config.ts`)가 같은 `adminPoolConfig` 를 지나므로 env 하나로 둘 다 바뀐다. 기본은 지금처럼 평문 TCP 다. 오류 메시지는 env 이름(과 파일 오류의 errno 코드)만 담는다.
````

- [ ] **Step 5: CLAUDE.md 에 하한 규칙을 한 줄 더한다**

`CLAUDE.md` "### `@ssworks/admin-server` (Phase 2)" 목록의 첫 줄(`- ESM 전용, …`) 다음에:

```md
- peer `@ssworks/admin-shared` 는 `workspace:>=<하한> <1.0.0` 이다 — admin-shared 의 새 export 를 쓰기 시작하는 PR 은 하한을 그 export 가 실릴 버전으로 올린다(`.changeset/README.md`). DB 접속은 `adminPoolConfig` 하나(앱 · 러너 공용) — `host` 와 `socketPath` 중 하나만, env 는 검증하는 TLS 둘(`DB_SSL=true` · `DB_SSL_CA`)만 연다.
```

- [ ] **Step 6: 포맷(마크다운은 두 번) · 확인 · 커밋**

```bash
pnpm exec prettier --write packages/admin-server/package.json .changeset/admin-server-publish-prep.md .changeset/README.md packages/admin-server/README.md CLAUDE.md
pnpm exec prettier --write .changeset/admin-server-publish-prep.md .changeset/README.md packages/admin-server/README.md CLAUDE.md
pnpm exec prettier --check packages/admin-server/package.json .changeset/admin-server-publish-prep.md .changeset/README.md packages/admin-server/README.md CLAUDE.md
pnpm exec changeset status
git add packages/admin-server/package.json .changeset/admin-server-publish-prep.md .changeset/README.md packages/admin-server/README.md CLAUDE.md
git commit -m "chore(admin-server): peer admin-shared 하한 >=0.4.0 <1.0.0, changeset · README DB TLS · 소켓 · peer 규칙(2f-2b)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: `prettier --check` 초록. `changeset status` 가 세 패키지를 minor 로(fixed) 보인다. (lockfile 이 Step 1 에서 바뀌었으면 `pnpm-lock.yaml` 도 `git add` 한다.)

---

### Task 6: 발행 형태 검증 · 쓰는 쪽 스모크(0.4.0 tarball · TLS)

**Files:**

- Create(저장소 밖): `$TEMP/ak2fb/`(git worktree — 끝나면 지운다), `$TEMP/akss/` 아래 앱 파일들(끝나면 지운다)
- Modify: `docs/superpowers/specs/2026-10-15-admin-server-publish-prep-design.md` §13(잰 값과 다른 것이 있을 때만)

**Interfaces:**

- Consumes: Task 1~5 의 커밋 전부(작업 트리가 깨끗해야 한다). 루트 `pnpm check:dts`. 오류 문구 `DB_SSL 은 true 나 false 여야 한다`.
- Produces: 잰 값 — Task 7 이 HANDOFF "검증" 행에 쓴다(드라이런 버전 · peer 문자열 · 스모크 결과).

- [ ] **Step 1: 준비를 본다**

```bash
git status --short
git log --oneline -6
docker ps --filter name=admin-kit-test-db --format "{{.Names}} {{.Status}}"
echo "$TEMP"
```

Expected: 작업 트리 깨끗, Task 1~5 커밋, 컨테이너 `Up`. `$TEMP` 가 사용자 폴더의 `AppData/Local/Temp` 를 가리키는 Windows 경로.

- [ ] **Step 2: 드라이런 worktree 를 만든다(짧은 경로 · 포그라운드)**

```bash
node -e "require('fs').rmSync(process.env.TEMP + '/ak2fb', { recursive: true, force: true })"
git worktree prune
git worktree add --detach "$TEMP/ak2fb" HEAD
cd "$TEMP/ak2fb" && pnpm install --frozen-lockfile
```

Expected: 설치 성공, `@ssworks/admin-shared` peer 경고 없음(로컬은 아직 0.3.0 — 플랜 작성 때 경고가 없었다). 실패하면 출력 그대로 보고하고 멈춘다(긴 경로 메모 — os error 3 이면 경로를 더 짧게).

- [ ] **Step 3: `changeset version` — 0.4.0 · peer 그대로 · 1.0.0 없음**

```bash
cd "$TEMP/ak2fb" && pnpm exec changeset version
node -e "for (const p of ['admin-shared','admin-ui','admin-server']) { const j = require('./packages/' + p + '/package.json'); console.log(p, j.version, JSON.stringify((j.peerDependencies || {})['@ssworks/admin-shared'] ?? null)) }"
grep -c "^## 1[.]0[.]0" packages/admin-shared/CHANGELOG.md packages/admin-ui/CHANGELOG.md packages/admin-server/CHANGELOG.md
grep -n "^## 0[.]4[.]0" -A 3 packages/admin-shared/CHANGELOG.md | head -8
```

Expected:

```
admin-shared 0.4.0 null
admin-ui 0.4.0 "workspace:^0"
admin-server 0.4.0 "workspace:>=0.4.0 <1.0.0"
```

`## 1.0.0` 은 셋 다 0. admin-shared CHANGELOG 0.4.0 에 Minor Changes(2c ~ 2f-1)와 이번 changeset 의 admin-shared 문단이 있다. 다르면 멈추고 보고한다.

- [ ] **Step 4: 0.4.0 으로 빌드 · 게이트 · pack**

```bash
cd "$TEMP/ak2fb" && pnpm --filter @ssworks/admin-shared build && pnpm --filter @ssworks/admin-server build && pnpm check:dts
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
mkdir -p "$TEMP/akss/src/migrations"
cd "$TEMP/ak2fb" && pnpm --filter @ssworks/admin-shared pack --pack-destination "$TEMP/akss" && pnpm --filter @ssworks/admin-server pack --pack-destination "$TEMP/akss"
cd "$TEMP/akss" && ls && tar -xOzf ssworks-admin-server-0.4.0.tgz package/package.json | grep -nE '"version"|"private"|admin-shared'
cd "$TEMP/akss" && tar -tzf ssworks-admin-server-0.4.0.tgz | grep -E "test-support|[.]test[.]js" || echo "테스트 파일 없음"
```

Expected: `check:dts` 출력 없음. tarball 둘(`ssworks-admin-shared-0.4.0.tgz` · `ssworks-admin-server-0.4.0.tgz`). admin-server `package.json` 에 `"version": "0.4.0"` · `"private": true` · peer `"@ssworks/admin-shared": ">=0.4.0 <1.0.0"`(devDependencies 의 `workspace:*` 는 `"0.4.0"` 으로 나온다 — 소비자와 무관). `테스트 파일 없음`.

- [ ] **Step 5: 다음 minor 모의 — 0.5.0 · major 없음**

Write 도구로 `<$TEMP>/ak2fb/.changeset/zz-sim-minor.md` 를 만든다(`<$TEMP>` 는 Step 1 의 `echo` 값):

```md
---
'@ssworks/admin-shared': minor
---

임시 — 다음 minor 모의(2f-2b 드라이런, 커밋하지 않는다)
```

```bash
cd "$TEMP/ak2fb" && pnpm exec changeset version
node -e "for (const p of ['admin-shared','admin-ui','admin-server']) { const j = require('./packages/' + p + '/package.json'); console.log(p, j.version, JSON.stringify((j.peerDependencies || {})['@ssworks/admin-shared'] ?? null)) }"
```

Expected: 셋 다 `0.5.0`, admin-server peer `"workspace:>=0.4.0 <1.0.0"` 그대로, admin-ui `"workspace:^0"` 그대로. 1.0.0 이 나오면 멈추고 보고한다(하한 설계가 틀렸다).

- [ ] **Step 6: 스모크 앱을 쓴다**

앱 파일은 **2f-2a 플랜 Task 7 Step 3**(`docs/superpowers/plans/2026-10-15-admin-server-auth-paths.md` — 그것이 가리키는 2f-1 플랜 Task 13 Step 3 · 2e-2 · 2d-2 · 2d-1 · 2c · 2a 플랜의 파일 포함)과 같다: `package.json` · `tsconfig.json`(`skipLibCheck: false`) · `.env` · `kysely.config.ts` · `src/main.ts` · `src/seed.ts`(계정 `admin` · `staff`) · `src/app.module.ts` · 스텁 열둘 · `check.mjs`(🔴 2f-2a 의 정정본 — refresh 뒤 쿠키를 `refreshed.cookies` 로 바꿔 쓴다). 그대로 옮기고 바꾸는 것 넷:

① `package.json` — tarball 두 줄을 `file:./ssworks-admin-server-0.4.0.tgz` · `file:./ssworks-admin-shared-0.4.0.tgz` 로, `devDependencies` 에 `"@types/express": "^5.0.6"`(README 설치 절 — 그래야 `skipLibCheck: false` 의 TS7016 이 없다).

② `.env` 끝에 한 줄 — 앱 · 러너 모두 TLS 로 붙는다:

```
DB_SSL=true
```

③ `tls-check.mjs`(새) — 러너 진입점만으로 TLS 를 잰다:

```js
// 2f-2b 스모크 — @ssworks/admin-server/runner 로 DB TLS 를 잰다(Nest 없이)
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rootCertificates } from 'node:tls'
import { sql } from 'kysely'
import {
  adminDbConnectionFromEnv,
  createAdminKysely,
  loadDotEnv,
} from '@ssworks/admin-server/runner'

loadDotEnv(new URL('./.env', import.meta.url))

async function cipher(env, label) {
  try {
    const db = createAdminKysely(adminDbConnectionFromEnv(env))
    try {
      const { rows } =
        await sql`select variable_value as cipher from information_schema.session_status where variable_name = 'Ssl_cipher'`.execute(
          db,
        )
      console.log(label, 'OK', JSON.stringify(rows[0]?.cipher ?? null))
    } finally {
      await db.destroy()
    }
  } catch (error) {
    const firstLine = String(error.message).split(String.fromCharCode(10))[0]
    console.log(label, 'ERR', error.code ?? '-', error.cause?.code ?? '-', firstLine)
  }
}

const wrongCa = join(mkdtempSync(join(tmpdir(), 'akss-ca-')), 'wrong-ca.pem')
writeFileSync(wrongCa, rootCertificates[0])

await cipher(process.env, 'env-ssl-true')
await cipher({ ...process.env, DB_SSL: '' }, 'env-plain')
await cipher({ ...process.env, DB_SSL_CA: wrongCa, DB_ACQUIRE_TIMEOUT_MS: '2000' }, 'env-wrong-ca')
await cipher({ ...process.env, DB_SSL: 'maybe' }, 'env-ssl-maybe')
```

④ 나머지(`check.mjs` 본문 · 시드 · 앱 모듈)는 2f-2a 그대로.

- [ ] **Step 7: 설치 · 빌드 · 마이그레이션(TLS) · 시드**

```bash
cd "$TEMP/akss"
pnpm install
node -e "console.log(require('./node_modules/@ssworks/admin-server/package.json').peerDependencies['@ssworks/admin-shared'])"
pnpm build
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database if exists akss; create database akss"
TZ=UTC npx kysely migrate latest
TZ=UTC node dist/seed.js
```

Expected: 설치 성공 — admin-shared peer 경고 없음(0.4.0 이 `>=0.4.0 <1.0.0` 을 만족). 둘째 줄 `>=0.4.0 <1.0.0`. `pnpm build`(`tsc`, `skipLibCheck: false`) **0건** — admin-shared `pagination.d.ts` TS2536 이 없다(2a 때의 3건이 사라졌다). 마이그레이션 12장(`.env` 의 `DB_SSL=true` — 러너가 TLS 로 돌았다) · 시드 성공(계정 둘). 오류가 있으면 그대로 기록하고 보고한다.

- [ ] **Step 8: 기동 · 요청 · TLS 확인**

```bash
cd "$TEMP/akss"
TZ=UTC node dist/main.js > server.log 2>&1 &
node check.mjs
kill %1
TZ=UTC node tls-check.mjs
```

Expected:

- `check.mjs` — 2f-2a 플랜 Task 7 Step 5 의 기대 출력과 같다(`admin-refresh 200` · `ip-block-staff 201` · `staff-login-blocked-right 401` · `staff-login-blocked-wrong 401` · `ip-unblock-staff 200` · `staff-reset 200` · `staff-refresh-after-reset 401` · `audit-login-blocked 200`). 앱이 `DB_SSL=true` 로 붙어 있다.
- `tls-check.mjs`:
  - `env-ssl-true OK "TLS_…"`(빈 문자열이 아니다 — 실측은 `TLS_AES_256_GCM_SHA384`)
  - `env-plain OK ""`
  - `env-wrong-ca ERR ER_GET_CONNECTION_TIMEOUT DEPTH_ZERO_SELF_SIGNED_CERT …`(2초 남짓)
  - `env-ssl-maybe ERR - - DB_SSL 은 true 나 false 여야 한다`

셸이 `&` · `kill %1` 을 못 쓰면 서버를 별도 백그라운드 명령으로 띄우고 끝나면 그 프로세스를 끝낸다. 로컬 MariaDB 로 못 재는 것(관리형 DB 의 CA 묶음 · 호스트 이름 검증 · 소켓)은 README "DB TLS · 소켓" 에 적힌 대로 둔다.

- [ ] **Step 9: 정리**

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -e "drop database akss"
node -e "require('fs').rmSync(process.env.TEMP + '/akss', { recursive: true, force: true })"
cd /c/Users/kim52/workspace/ssworks-admin-kit && git worktree remove --force "$TEMP/ak2fb" && git worktree prune && git worktree list
git status --short
```

Expected: worktree 목록에 본 저장소만, 작업 트리 깨끗(드라이런의 `changeset version` · 모의 changeset 은 worktree 와 함께 사라졌다 — 본 브랜치에 커밋하지 않는다).

- [ ] **Step 10: 다른 값이 나왔으면 스펙 §13 에 적고 커밋한다**

Step 2~8 의 값이 플랜 기대와 다르면(경고 · 오류 코드 · 버전) `docs/superpowers/specs/2026-10-15-admin-server-publish-prep-design.md` §13 의 `(구현 중 바뀐 것을 여기 적는다.)` 줄을 `- **R1 — <무엇>(Task 6).** <잰 값과 처리>` 로 바꾸고 커밋한다(`docs: 2f-2b 발행 형태 검증 — <요지>`). 모두 기대대로면 커밋하지 않고 값만 Task 7 에 넘긴다.

---

### Task 7: 진행 문서 · 선행 스펙 정정 · 최종 확인

**Files:**

- Modify: `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §14 · `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md` §14(각 한 줄 — 스펙 §12)
- Modify: `docs/01-phase0.md` §8 · `docs/HANDOFF.md` · `CLAUDE.md`(패키지 표 · 진행표)

**Interfaces:**

- Consumes: Task 4 Step 5 의 실 DB 테스트 수, Task 6 의 잰 값.
- Produces: 없음.

- [ ] **Step 1: 최종 확인을 돌린다**

```bash
pnpm check
pnpm format:check
docker ps --filter name=admin-kit-test-db --format "{{.Names}} {{.Status}}"
pnpm test:db
```

Expected: 모두 초록. `pnpm check` 의 admin-server · admin-shared 테스트 수와 `pnpm test:db` 의 수를 적는다(admin-server 단위는 2f-2a 577 에서 Task 3 이 더한 만큼, admin-shared 는 237 에서 Task 1 · 2 가 더한 만큼, 실 DB 는 464 + 4 = 468).

- [ ] **Step 2: 선행 스펙 §14 에 한 줄씩**

`docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §14 끝에:

```md
- **R(2f-2b) — DB TLS · 소켓 · peer 하한(2026-10-15, docs/superpowers/specs/2026-10-15-admin-server-publish-prep-design.md).** `AdminDbConnection` 에 `ssl`(드라이버 옵션 그대로) · `socketPath` 가 더해지고 `host` 가 선택이 됐다(둘 중 하나만 — §5-1). env 에 `DB_SSL` · `DB_SSL_CA` · `DB_SOCKET_PATH`. peer `@ssworks/admin-shared` 는 `workspace:^0`(유지) 대신 `workspace:>=0.4.0 <1.0.0` 이다(2f-2b §5-3).
```

`docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md` §14 끝에:

```md
- **R(2f-2b) — 파서 조이기(2026-10-15, 2f-2b 스펙 §5-5).** `normalizeIp` 는 `::ffff:` 를 점 표기 IPv4 앞에서만 떼고, 내장 IPv4 는 마지막 그룹에만, 루프백 CIDR 접기는 `/128` 에만(`::1/64` = `::/64`), v4-mapped 영역은 `::ffff:a.b.c.d` 꼴만 받는다. P1 의 함수 이름 · 단일 파서 원칙은 그대로다.
```

- [ ] **Step 3: `docs/01-phase0.md` §8**

① admin-server 행의 끝 문구 `다음 2f-2b` 를 아래 블록으로 바꾼다(N · M 은 Step 1 값):

```md
다음 2f-2b. **PR 2f-2b 완료**(`feat/admin-server-publish-prep`, 2026-10-15) — DB TLS(`ssl` · `DB_SSL` · `DB_SSL_CA`) · 소켓(`socketPath` · `DB_SOCKET_PATH`) · peer admin-shared `>=0.4.0 <1.0.0` · `check:dts` 게이트. N 테스트 + 실 MariaDB M. 스펙 `docs/superpowers/specs/2026-10-15-admin-server-publish-prep-design.md` · 플랜 `docs/superpowers/plans/2026-10-15-admin-server-publish-prep.md`. 다음 — Version Packages PR #3(0.4.0) 머지 → 확인용 앱 실서버 확인 → admin-server 첫 발행
```

② admin-shared 행이 있으면 그 끝에 `2f-2b — pagination.d.ts TS2536 · IP 파서 조이기(patch).` 를 더한다.

③ 표 아래 `다음: Phase 2 PR 2f-2b — …` 로 시작하는 줄 전체를 바꾼다:

```md
다음: Version Packages PR #3(0.4.0)을 Trusted Publisher 확인 뒤 머지 · 승인 → 확인용 앱 실서버 확인 → admin-server 첫 발행(결정 ⑥ V1, HANDOFF "다음 플랜").
```

- [ ] **Step 4: `CLAUDE.md` 표 둘**

① 패키지 표의 admin-server 행 괄호 끝 `· 2f-2a 인증 경로 완료)` 를 `· 2f-2a 인증 경로 · 2f-2b 첫 발행 준비 완료)` 로.

② 진행표 — `**Phase 2 PR 2f-2b — 첫 발행 준비(…)**` 로 시작하는 행을 아래 두 행으로 바꾼다(열 정렬은 prettier 가 맞춘다):

```md
| Phase 2 PR 2f-2b — 첫 발행 준비(DB TLS · socketPath · peer 하한 · TS2536 · IP 파서) | 완료 | 스펙 `docs/superpowers/specs/2026-10-15-admin-server-publish-prep-design.md` · 플랜 `docs/superpowers/plans/2026-10-15-admin-server-publish-prep.md` |
| **Version Packages PR #3(0.4.0) 머지 → 확인용 앱 실서버 확인 → admin-server 첫 발행** | **다음** | HANDOFF "다음 플랜" · "발행 전에 사람이 해야 하는 것" |
```

- [ ] **Step 5: `docs/HANDOFF.md`**

① "지금 상태" 표:

- `@ssworks/admin-shared` 행 끝 `237 테스트.` 앞에 문장을 더한다: `PR 2f-2b 가 createQuerySchema d.ts 의 TS2536 3건(skipLibCheck: false 소비자)을 없애고 IP 파서를 조였다(::ffff: 는 점 표기 앞에서만 · 내장 IPv4 는 마지막 그룹 · 루프백 접기 /128 · v4-mapped 는 점 표기만 — patch).` 그리고 `237 테스트` 를 Step 1 의 admin-shared 수로.
- `@ssworks/admin-server` 행 끝 `577 테스트 + 실 MariaDB 464.` 앞에: `**PR 2f-2b**(첫 발행 준비 — AdminDbConnection ssl · socketPath · env DB_SSL · DB_SSL_CA · DB_SOCKET_PATH · peer admin-shared >=0.4.0 <1.0.0 · check:dts 게이트)는 구현 완료(브랜치 feat/admin-server-publish-prep) — **main 병합 · push 는 사람이 한다**.` 그리고 숫자를 Step 1 값으로.
- "검증" 행 끝에: `PR 2f-2b 는 Windows 에서 pnpm check(check:dts 포함) · pnpm test:db 초록. 드라이런 worktree 에서 changeset version 이 세 패키지 0.4.0 · admin-server peer "workspace:>=0.4.0 <1.0.0" 그대로 · 1.0.0 없음, 모의 admin-shared minor 위에서 0.5.0 · major 없음, pack 의 peer ">=0.4.0 <1.0.0". 쓰는 쪽 스모크($TEMP/akss — 0.4.0 tarball · DB_SSL=true 로 migrate · 기동 · 2f-2a 요청 흐름, tls-check: TLS 암호군 · 평문 · 엉뚱한 CA 거부 · DB_SSL=maybe 기동 실패, skipLibCheck: false tsc 0건)를 통과했다.`(Task 6 값이 다르면 그 값으로.)
- "다음 플랜" 행 전체를 바꾼다: `(사람) feat/admin-server-publish-prep 을 main 에 병합 · push → release 워크플로가 Version Packages PR #3 을 0.4.0(2c ~ 2f-2b)으로 다시 연다 → admin-shared · admin-ui Trusted Publisher 확인 뒤 머지 · stage approve → 확인용 앱(%TEMP% 의 aksv) 실서버 확인 → admin-server 첫 발행(private 해제 · 로컬 2FA · 그 뒤 Trusted Publisher 등록 — 결정 ⑥ V1). 직전 PR 2f-2b: 플랜 docs/superpowers/plans/2026-10-15-admin-server-publish-prep.md`

② "발행 전에 사람이 해야 하는 것" — `0.3.0 은 2026-10-15 …` 줄 다음에: `- **Version Packages PR #3 은 2f-2b 가 main 에 들어간 뒤 머지한다**(2f-2b 결정 ① V1) — 0.4.0 하나에 2c ~ 2f-2b 가 실리고 admin-shared patch(TS2536 · 파서)가 0.4.0 에 접힌다. admin-server 첫 발행도 0.4.0 이다(peer admin-shared >=0.4.0 <1.0.0).`

③ "알려진 미확인 · 보류" 의 닫음 표기:

- PR 2a 절의 "첫 발행(Phase 2 끝) 전: AdminDbConnection 에 TLS" 로 시작하는 줄 끝에 ` → **2f-2b 에서 닫음**(ssl · socketPath · env 셋 — 2f-2b 스펙 §5-1 · §5-2)`.
- PR 2a 절의 "admin-shared 별도 patch: skipLibCheck: false 에서" 로 시작하는 줄 끝에 ` → **2f-2b 에서 닫음**(정렬 칸 스키마 타입 표기 · check:dts 게이트)`.
- PR 2e-2 절 `- 첫 발행 전: admin-server peer …` 줄 끝에 ` → **2f-2b 에서 닫음**(>=0.4.0 <1.0.0 — .changeset/README.md 하한 규칙)`.
- PR 2f-1 절 `- admin-shared 파서 조이기(patch): …` 줄 끝에 ` → **2f-2b 에서 닫음**(규칙 넷 — 루프백 접기는 /128 에만 · v4-mapped 는 점 표기만 더함)`.

④ 같은 절 끝에 새 묶음:

```md
- **PR 2f-2b 가 넘긴 것(2026-10-15)**
  - admin-ui peer 는 `^0` 그대로다 — admin-ui 가 admin-shared 의 새 export 를 쓰기 시작하면 admin-server 처럼 `>=하한 <1.0.0` 으로 둔다(`.changeset/README.md`).
  - 소켓 실접속은 재지 않았다(Windows · CI 서비스 컨테이너에서 닿지 않는다) — 설정 단위 테스트만. 관리형 DB 의 CA 묶음 · 호스트 이름 검증도 로컬로는 못 잰다(README "DB TLS · 소켓").
  - 실 DB TLS 테스트는 서버가 MariaDB 11.4.1+ 이고 TLS 를 켰다는 전제다(드라이버 지문 검증) — `ADMIN_TEST_DB_URL` 을 다른 서버로 돌리면 실패할 수 있다.
```

(태스크 리뷰 · 최종 리뷰가 넘긴 것은 리뷰가 끝나면 이 묶음에 더한다.)

- [ ] **Step 6: 포맷(두 번) · 확인 · 커밋**

```bash
pnpm exec prettier --write docs/HANDOFF.md docs/01-phase0.md CLAUDE.md docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md
pnpm exec prettier --write docs/HANDOFF.md docs/01-phase0.md CLAUDE.md docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md
pnpm format:check
git add docs/HANDOFF.md docs/01-phase0.md CLAUDE.md docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md
git commit -m "docs: PR 2f-2b 첫 발행 준비 — 진행 문서 · 선행 스펙 정정 · 검증 기록, 다음은 PR #3 머지 · 실서버 확인 · 첫 발행

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 스펙 대조

| 스펙                                                      | Task                                     |
| --------------------------------------------------------- | ---------------------------------------- |
| §2-1 ① V1(PR #3 순서) · §9 드라이런                       | 6 Step 2~5 · 7 Step 5 ②                  |
| §2-1 ③ T1 · §4-1 · §5-1 · §5-2                            | 3                                        |
| §2-1 ④ L1 · §5-5 규칙 넷 · 측정표                         | 2                                        |
| §4-3 · §5-4(TS2536 · `check:dts`)                         | 1                                        |
| §5-3 peer 하한 · 규칙 문서                                | 5 Step 1 · 3 · 5                         |
| §8-1 단위                                                 | 1 · 2 · 3                                |
| §8-2 실 DB(TLS 넷 · IP 400)                               | 4                                        |
| §8-3 리뷰 초점                                            | Review Focus · 3 · 2                     |
| §9 스모크 · changeset · 문서                              | 5 · 6 · 7                                |
| §11 위험 1 · 2(플랜 작성 중 잼 — 경고 없음 · 그대로 나감) | 5 머리 · 6 Step 2 · 4                    |
| §11 위험 3 · 4 · 5 · 6                                    | 1 Step 2 · 4 머리 · 4 Step 4 · 전역 제약 |
| §12 선행 문서 정정                                        | 7 Step 2                                 |

## 서브에이전트 모델

| Task | 모델     | 이유                                                        |
| ---- | -------- | ----------------------------------------------------------- |
| 1    | `sonnet` | 다중 파일 설정(tsconfig 둘 · scripts 셋 · CI) + 타입 테스트 |
| 2    | `sonnet` | 파서 세 함수의 미묘한 판정(접기 셋 · 바이트 검사)           |
| 3    | `sonnet` | 공개 타입 · env 판정 · 오류 문구 계약                       |
| 4    | `sonnet` | 실 DB · 계정 수명 · 드라이버 오류 모양                      |
| 5    | `sonnet` | 문서 넷의 자리 찾기 · 표 정렬                               |
| 6    | `sonnet` | worktree · 스모크 절차와 기대값 대조(디버깅이 섞일 수 있다) |
| 7    | `sonnet` | 긴 표의 정확한 자리 고치기                                  |
| 최종 | `opus`   | whole-branch 리뷰                                           |
