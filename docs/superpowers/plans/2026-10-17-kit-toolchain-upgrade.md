# 킷 버전 상향 (0.5.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ringside 계약 고정(2026-10-30) 전에 Pinia 4 peer · TS 6.0.3 · vitest 5 · eslint 10 · MariaDB 11.4+12.3 매트릭스로 올린 킷 0.5.0 을 낼 수 있는 브랜치와, 따라 올라간 템플릿 `preset/admin` 로컬 커밋 둘, ringside 고칠 목록을 만든다.

**Architecture:** 도구를 하나씩 올리고(커밋마다 `pnpm check` 초록), 마지막에 peer 범위 · changeset · CI 매트릭스를 더한다. 발행물은 상향 전후 `dist` diff · changeset 드라이런 tarball · 소비 앱 스모크 둘(브라우저 · 서버) · 템플릿 clone 으로 검증한다. 공개 API 는 admin-ui 의 peer `pinia` 하나만 바뀐다.

**Tech Stack:** pnpm 12.8.1 워크스페이스 · TypeScript 6.0.3 · vitest 5.0.5 · eslint 10.13 · typescript-eslint 8.71.2 · Vue 3.5 · Vuetify 4.2 · Pinia 4.1 · NestJS 12 · Kysely 0.29 · MariaDB 11.4 / 12.3(Docker) · Windows 11 + Git Bash

**Spec:** `docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md`

## Global Constraints

- 올리는 값(그대로 옮겨 적는다): `typescript ~6.0.3` · `vitest ^5.0.5` · `eslint ^10.13.0` · `@eslint/js ^10.0.1` · `typescript-eslint ^8.71.2` · admin-ui peer `pinia: ^4.0.0` · admin-ui dev `pinia ^4.1.0` · admin-ui dev `@vue/devtools-api ^8.2.1` · 루트 `engines.node >=22.13.0`.
- 그대로 두는 것: `globals` 16 · `happy-dom` 20 · `@changesets/cli` 2 · `.nvmrc` 24 · admin-server `engines.node >=22` · admin-ui peer `@ssworks/admin-shared: workspace:^0` · admin-server peer `workspace:>=0.4.0 <1.0.0` · `.changeset/config.json` · `release.yml` · `scripts/stage-release.mjs`. 나머지 devDeps 는 `pnpm -r update --no-save`(범위 안 최신, 잠금 파일만)로만 바꾼다.
- `@vue/devtools-api` 를 admin-ui **peer 에 넣지 않는다**(dev 에만).
- 공개 API(export · 시그니처 · 런타임 동작)를 바꾸지 않는다. 예외는 도구가 찾은 킷 결함을 고친 것뿐이고, 그때는 changeset 에 한 줄을 더하고 스펙 §13 에 적는다.
- 테스트가 재던 의미를 바꾸지 않는다. 단언을 지우거나 약하게 하지 않는다. 설정으로 옛 동작을 되살리는 것은 예외로만 하고 설정 옆에 이유를 주석으로 적는다. eslint 규칙을 통째로 끄지 않는다. `ignoreDeprecations` 를 쓰지 않는다.
- Windows: `/dev/null` 리디렉션 금지(NUL 파일이 생긴다). 임시 파일은 `C:/Users/kim52/AppData/Local/Temp/ak5/` 아래에 **포그라운드로** 만든다(긴 경로에서는 pnpm 설치가 os error 3). 개행은 LF. 파일을 python 으로 다시 쓰지 않는다.
- `pnpm test:db` 를 겹쳐 돌리지 않는다. 기존 `admin-kit-test-db`(mariadb:11.4 · 33306)는 지우거나 멈추지 않는다. 12.3 은 `admin-kit-test-db-12` · 33307 이다.
- ringside 는 `gh api` 로 읽기만 한다. 템플릿은 `preset/admin` 브랜치에서만 커밋한다(`master` · `preset/db` · `preset/auth` 금지). 참조 프로젝트는 읽기만 한다.
- `git push` · PR · `pnpm release` · `npm publish` · `pnpm stage approve` 는 하지 않는다(사람 몫).
- 커밋: 한국어 conventional commits, 끝 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 서브에이전트를 쓰면 `model` 을 항상 명시한다(태스크 머리의 권장 티어).

## Review Focus

1. **Pinia 3 을 쓰는 앱이 admin-ui 0.5.0 을 설치한다** → 설치가 조용히 지나가지 않고, admin-ui 와 `pinia@"^4.0.0"` 을 짚는 peer 경고(또는 오류)가 나와야 한다. → Task 7 Step 7.
2. **Pinia 4 를 쓰면서 `@vue/devtools-api` 를 빠뜨린 앱**(`autoInstallPeers: false`) → 설치가 Pinia 의 빠진 peer 를 알려야 한다. 빌드 결과를 기록해 README 문장("함께 설치")의 근거로 쓴다. → Task 7 Step 8.
3. **TypeScript 5.9 소비자가 TS 6 으로 만든 d.ts 를 읽는다**(`skipLibCheck: false`) → `@ssworks/*` d.ts 에서 오류 0. → Task 7 Step 6.
4. **TS 6 기본값 그대로인 소비자**(`noUncheckedSideEffectImports` 켜짐)가 `import '@ssworks/admin-ui/style.css'` 를 쓴다 → 해석 오류(TS2882) 없음. → Task 7 Step 5.
5. **CI 의 `pnpm install --frozen-lockfile`** 이 다시 만든 잠금 파일과 package.json 에 맞는다(킷 · 템플릿 ⓐ). 킷은 `format:check` 도 통과해야 한다. → Task 11 Step 7 · Task 8 Step 6.

## 경로 · 이름 (모든 태스크 공통)

| 이름        | 값                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 킷          | `C:/Users/kim52/workspace/ssworks-admin-kit` (Git Bash `/c/Users/kim52/workspace/ssworks-admin-kit`) — 브랜치 `chore/kit-toolchain-upgrade` |
| 템플릿      | `C:/Users/kim52/workspace/kim5257-project-template` — 브랜치 `preset/admin`(시작 `9355035`)                                                 |
| `AK5`       | `C:/Users/kim52/AppData/Local/Temp/ak5` (Git Bash `/c/Users/kim52/AppData/Local/Temp/ak5`)                                                  |
| `AK5/tools` | 직접 쓴 스크립트(count · dist-diff · html2txt)                                                                                              |
| `AK5/base`  | 기준선 · 리포트 · diff 출력                                                                                                                 |
| `AK5/tgz`   | 0.5.0 tarball 셋(Task 6)                                                                                                                    |
| 12.3 DB     | 컨테이너 `admin-kit-test-db-12` · `mariadb://root:admin-kit-test@127.0.0.1:33307`                                                           |
| 검증 기록   | `docs/verification/2026-10-17-kit-toolchain-upgrade.md`                                                                                     |

---

### Task 1: 기준선 · 범위 안 갱신 · TypeScript 6.0.3

권장 티어: `sonnet`

**Files:**

- Create: `docs/verification/2026-10-17-kit-toolchain-upgrade.md`
- Create(저장소 밖): `AK5/tools/count.mjs`
- Modify: `package.json` · `packages/admin-shared/package.json` · `packages/admin-ui/package.json` · `packages/admin-server/package.json`(각 `devDependencies.typescript`), `pnpm-lock.yaml`
- Modify(필요한 만큼): TS 6 이 새로 잡은 오류가 난 소스 · tsconfig

**Interfaces:**

- Produces: `AK5/tools/count.mjs <vitest-json>` — 패키지별 통과 · 실패 수와 실패 목록을 찍는다(Task 3 · 5 가 쓴다). `AK5/base/dist-before/<패키지>/` — 상향 전 dist(Task 6 이 비교한다). 기준선 수(검증 기록 §1).

- [ ] **Step 1: 임시 폴더와 셈 스크립트**

```bash
node -e "for (const d of ['base','tools','tgz']) require('fs').mkdirSync('C:/Users/kim52/AppData/Local/Temp/ak5/'+d,{recursive:true})"
```

`C:/Users/kim52/AppData/Local/Temp/ak5/tools/count.mjs` 를 Write 로 만든다:

```js
// vitest JSON 리포트를 패키지별로 센다. 인자: 리포트 경로
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const byPackage = {}
const failures = []
for (const file of report.testResults) {
  const name = file.name.replace(/\\/g, '/')
  const key = name.match(/packages\/([^/]+)\//)?.[1] ?? 'other'
  const bucket = (byPackage[key] ??= { files: 0 })
  bucket.files++
  for (const a of file.assertionResults) {
    bucket[a.status] = (bucket[a.status] ?? 0) + 1
    if (a.status === 'failed') {
      const first = (a.failureMessages?.[0] ?? '').split('\n')[0]
      failures.push(`${name.slice(name.indexOf('packages/'))} › ${a.fullName}\n    ${first}`)
    }
  }
  if (file.status === 'failed' && file.assertionResults.length === 0) {
    failures.push(`${name} (파일 실패) ${(file.message ?? '').split('\n')[0]}`)
  }
}
console.log(
  JSON.stringify(
    {
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      byPackage,
    },
    null,
    2,
  ),
)
for (const f of failures) console.log('FAIL', f)
```

- [ ] **Step 2: 단위 기준선**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
git status --short   # ' M .claude/settings.json' 하나뿐이어야 한다(커밋하지 않는 로컬 권한)
pnpm exec vitest run --reporter=json --outputFile=C:/Users/kim52/AppData/Local/Temp/ak5/base/unit-before.json
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/count.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/unit-before.json
```

Expected: `failed: 0`, FAIL 줄 없음. `byPackage` 의 admin-shared · admin-ui · admin-server 의 `passed` · `files` 를 적어 둔다(HANDOFF 기준 266 · 886 · 597 근처 — 값은 실측을 쓴다).

- [ ] **Step 3: 실 DB 기준선(11.4)**

```bash
docker ps -a --filter name=admin-kit-test-db --format "{{.Names}} {{.Image}} {{.Status}}"
```

`admin-kit-test-db mariadb:11.4 Up …` 이어야 한다. `Exited` 면 `docker start admin-kit-test-db`(PC 재시작 뒤 — `db:test:up` 이 아니다). 남아 있는 데이터베이스 목록을 적어 둔다(Task 11 정리 확인용):

```bash
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -N -e "show databases"
pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts --reporter=json --outputFile=C:/Users/kim52/AppData/Local/Temp/ak5/base/db114-before.json
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/count.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/db114-before.json
```

Expected: `failed: 0`(HANDOFF 기준 468 근처). 20초 시간 초과 한 건이면 한 번 더 돌리고 기록한다(메모리 — 흔들림). 두 번 다 실패하면 멈추고 보고한다(상향 전부터 빨간 것이다).

- [ ] **Step 4: 발행물 기준선**

```bash
pnpm build
node -e "const fs=require('fs');for (const p of ['admin-shared','admin-ui','admin-server']) fs.cpSync('packages/'+p+'/dist','C:/Users/kim52/AppData/Local/Temp/ak5/base/dist-before/'+p,{recursive:true})"
```

- [ ] **Step 5: 검증 기록 뼈대**

`docs/verification/2026-10-17-kit-toolchain-upgrade.md` 를 Write 로 만든다. `<…>` 는 Step 2 · 3 의 실측값으로 채운다:

```markdown
# 킷 버전 상향 검증 (2026-10-17)

스펙 `docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md` · 플랜 `docs/superpowers/plans/2026-10-17-kit-toolchain-upgrade.md` · 브랜치 `chore/kit-toolchain-upgrade`

## 0. 요약

(Task 11 에서 쓴다)

## 1. 기준선 (상향 전 — TS 5.9.3 · vitest 4.1.11 · eslint 9.39.5 · Windows · Node 24.21)

| 층                    | admin-shared  | admin-ui | admin-server | 합계 |
| --------------------- | ------------- | -------- | ------------ | ---- |
| 단위(`pnpm test`)     | <통과 / 파일> | <…>      | <…>          | <…>  |
| 실 DB 11.4(`test:db`) | —             | —        | <…>          | <…>  |

테스트 DB 11.4 의 데이터베이스(정리 확인용): <show databases 결과>

## 2. 도구 상향 — 고친 것

### 2-1. TypeScript 6.0.3

| 파일 | 오류 | 고친 것 | 발행물 영향 |
| ---- | ---- | ------- | ----------- |

### 2-2. eslint 10 · typescript-eslint 8.71

### 2-3. vitest 5

### 2-4. Pinia 4

## 3. 실 DB — MariaDB 11.4 · 12.3

## 4. 발행물 비교 (V3)

## 5. changeset 드라이런 (V4)

## 6. 소비 앱 스모크 (V5 · V6)

## 7. 템플릿 preset/admin (V7)

## 8. ringside 에 고칠 것

## 9. 정리 · 남은 것
```

- [ ] **Step 6: 범위 안 최신으로(잠금 파일만)**

```bash
pnpm -r update --no-save
git diff --stat
```

Expected: `pnpm-lock.yaml` 만 바뀐다. package.json 이 바뀌었으면 `git checkout -- '**/package.json' package.json` 으로 되돌리고 원인을 기록한다.

```bash
pnpm check
```

Expected: 초록. 빨가면 상향 전 도구의 패치 · 마이너가 깬 것이다 — superpowers:systematic-debugging 으로 원인을 찾고, 고칠 수 없으면 그 패키지만 잠금 파일에서 이전 판으로 되돌린다(`pnpm -r update <패키지>@<이전 판> --no-save`). 기록 §2 첫 줄에 적는다.

```bash
git add pnpm-lock.yaml docs/verification/2026-10-17-kit-toolchain-upgrade.md
git commit -m "chore: devDeps 를 범위 안 최신으로 — 잠금 파일만 · 상향 검증 기록 뼈대

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: TypeScript 6.0.3**

네 파일에서 `"typescript": "~5.9.2"` 를 `"typescript": "~6.0.3"` 으로 바꾼다(Edit): `package.json` · `packages/admin-shared/package.json` · `packages/admin-ui/package.json` · `packages/admin-server/package.json`.

```bash
pnpm install
pnpm exec tsc -v
```

Expected: `Version 6.0.3`. pnpm 이 typescript-eslint · vue-tsc 의 peer 경고를 내면 기록한다(typescript-eslint 8.71 의 peer 는 `<6.1.0` 이라 없어야 한다).

- [ ] **Step 8: typecheck · build · check:dts · test · lint 를 차례로 초록으로**

```bash
pnpm typecheck
```

오류가 나면 하나씩 다음을 한다. ① TS 6 의 무엇 때문인지 가른다: 폐기 옵션 · 새 기본값(`rootDir` · `types` · `noUncheckedSideEffectImports` · `strict`) · 더 엄격해진 추론. ② 설정 문제면 tsconfig 에 **명시**로 고친다. ③ 코드 문제면 코드를 고친다(동작을 바꾸지 않는 타입 표기). ④ 검증 기록 §2-1 표에 한 줄 적는다. 그다음 같은 명령을 다시 돌린다. 공개 함수 시그니처를 바꿔야만 풀리는 오류면 멈추고 보고한다.

```bash
pnpm build && pnpm check:dts
```

같은 방법으로 초록까지. admin-ui build 는 `vue-tsc --noEmit -p tsconfig.build.json && vite build` 이다. vite-plugin-dts(unplugin-dts)가 TS 6 에서 실패하면 멈추고 보고한다(스펙 §12-2).

```bash
pnpm test && pnpm lint
```

Expected: 둘 다 초록. `decorator-metadata.test.ts` 가 TS 6 emit 의 `design:paramtypes` 를 잰다 — 실패하면 킷 결함 후보이니 systematic-debugging 으로 간다.

- [ ] **Step 9: 커밋**

```bash
pnpm format:check
git add package.json packages/*/package.json pnpm-lock.yaml docs/verification/2026-10-17-kit-toolchain-upgrade.md
git add -u packages   # TS 6 때문에 고친 소스 · tsconfig 가 있으면
git status --short    # .claude/settings.json 은 올리지 않는다
git commit -m "chore: TypeScript 6.0.3 — 셋 + 루트 devDeps ~6.0.3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: eslint 10 · @eslint/js 10 · typescript-eslint 8.71.2

권장 티어: `sonnet`

**Files:**

- Modify: `package.json`(`devDependencies` 의 `eslint` · `@eslint/js` · `typescript-eslint`, `engines.node`), `pnpm-lock.yaml`
- Modify(필요한 만큼): 새 규칙이 잡은 소스, `eslint.config.js`(폐기 API 가 깨질 때만)

**Interfaces:**

- Consumes: Task 1 의 TS 6.0.3 워크스페이스

- [ ] **Step 1: 올리기**

`package.json` devDependencies: `"@eslint/js": "^10.0.1"` · `"eslint": "^10.13.0"` · `"typescript-eslint": "^8.71.2"`. 같은 파일의 `"engines": { "node": ">=22.0.0" }` 를 `">=22.13.0"` 으로(eslint 10 · vitest 5 의 하한 — 저장소 개발용, 패키지 engines 는 그대로).

```bash
pnpm install
pnpm exec eslint --version
```

Expected: `v10.13.x`.

- [ ] **Step 2: 규칙별로 세기**

```bash
pnpm exec eslint . -f json -o C:/Users/kim52/AppData/Local/Temp/ak5/base/eslint10.json; echo exit=$?
node -e "const r=require('C:/Users/kim52/AppData/Local/Temp/ak5/base/eslint10.json');const c={};for(const f of r)for(const m of f.messages){const k=(m.ruleId??'(parse)')+' '+(m.severity===2?'error':'warn');c[k]=(c[k]??0)+1}console.log(c);for(const f of r)for(const m of f.messages)console.log(f.filePath.replace(/.*ssworks-admin-kit./,''),m.line,m.ruleId,m.message)"
```

`exit=0` 이고 메시지가 없으면 Step 4 로 간다.

- [ ] **Step 3: 고치기**

규칙마다 코드를 고친다(규칙을 끄지 않는다). 거짓 양성이면 그 줄에만 `// eslint-disable-next-line <규칙> -- <이유>` 를 단다.

🔴 `preserve-caught-error`(catch 안에서 새 오류를 던질 때 `cause` 요구)가 admin-server 를 잡으면 `{ cause: error }` 를 더한다. 그 뒤 응답 본문에 `cause` 가 새지 않는지 확인한다:

```bash
grep -n "cause" packages/admin-server/src/http/exception.filter.ts packages/admin-server/src/http/*.ts
pnpm --filter @ssworks/admin-server test
```

`resolveErrorResponse` 가 본문을 `code` · `message` · `details` 로만 만들면 된다. 본문에 오류 객체를 펼치는 곳이 있으면 멈추고 보고한다(2a R9 마스킹).

고친 것은 검증 기록 §2-2 에 `규칙 · 건수 · 고친 방법` 으로 적는다.

- [ ] **Step 4: 초록 확인 · 커밋**

```bash
pnpm check && pnpm format:check
git add package.json pnpm-lock.yaml docs/verification/2026-10-17-kit-toolchain-upgrade.md
git add -u packages eslint.config.js
git commit -m "chore: ESLint 10 · @eslint/js 10 · typescript-eslint 8.71.2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: vitest 5.0.5

권장 티어: `sonnet`

**Files:**

- Modify: `package.json` · `packages/*/package.json`(`devDependencies.vitest`), `pnpm-lock.yaml`
- Modify(필요한 만큼): 새 기본값으로 깨진 `*.test.ts`, 필요하면 `packages/*/vitest.config.ts`, `.gitignore`(`.vitest/` 가 생기면)

**Interfaces:**

- Consumes: `AK5/tools/count.mjs`, `AK5/base/unit-before.json` · `db114-before.json`(Task 1)

- [ ] **Step 1: 올리기**

네 파일에서 `"vitest": "^4.1.10"` 를 `"vitest": "^5.0.5"` 로 바꾼다.

```bash
pnpm install
pnpm exec vitest --version
```

Expected: `vitest/5.0.5`.

- [ ] **Step 2: 첫 실행 · 실패 목록**

```bash
pnpm exec vitest run --reporter=json --outputFile=C:/Users/kim52/AppData/Local/Temp/ak5/base/unit-v5-first.json; echo exit=$?
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/count.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/unit-v5-first.json
```

FAIL 줄을 다음 범주로 가른다(스펙 §5-2). 범주별 파일 수를 검증 기록 §2-3 에 적는다.

| 범주                                     | 알아보는 법                                                                                                                  | 고치는 법                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 모의 함수 기본 초기화                    | `beforeAll` · 모듈 최상단의 `mockReturnValue` · `mockResolvedValue` · `mockImplementation` 이 두 번째 테스트부터 `undefined` | 그 설정을 `beforeEach` 로 옮긴다                                                                 |
| await 하지 않은 비동기 단언              | "not awaited" 류 메시지 · `expect(p).resolves/rejects` 앞에 `await` 없음                                                     | `await expect(p).rejects.toThrow(…)`. 붙이자 단언이 실패하면 킷 결함 후보 → systematic-debugging |
| 호이스팅 위치                            | `vi.mock` · `vi.hoisted` 가 최상단 밖이라는 오류                                                                             | 파일 최상단으로 옮긴다                                                                           |
| `toThrow("")` · 제목 `$` · pretty-format | 메시지 문자열 비교 차이                                                                                                      | 그 단언만 새 표기에 맞춘다(의미는 그대로)                                                        |
| happy-dom window 변경                    | `installVisualViewport()` · window 속성 정의 오류                                                                            | 도우미가 새 동작(window 를 직접 바꿀 수 있음)에 맞게 정의하도록 고친다                           |

🔴 "모의 함수 기본 초기화" 범주가 **15 파일을 넘으면** 멈추고 사람에게 묻는다(고칠지 · 그 패키지 `vitest.config.ts` 에 이유 주석과 함께 `clearMocks: false` 를 둘지).

예 — 모의 함수 초기화:

```ts
// 전
const fetchMe = vi.fn().mockResolvedValue(user)
beforeAll(() => {
  /* … */
})

// 후
const fetchMe = vi.fn()
beforeEach(() => {
  fetchMe.mockResolvedValue(user)
})
```

- [ ] **Step 3: 단위 초록 · 수 비교**

```bash
pnpm exec vitest run --reporter=json --outputFile=C:/Users/kim52/AppData/Local/Temp/ak5/base/unit-after.json
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/count.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/unit-after.json
```

Expected: `failed: 0`. 패키지마다 `passed` ≥ `unit-before.json` 의 값. 줄었으면 `vitest list` 로 사라진 테스트를 찾는다(정적 파싱 · 제목 변경 · `test.for` 제목 `$` 따옴표 때문일 수 있다). 원인을 기록하고, 실제로 빠졌다면 되살린다.

- [ ] **Step 4: 실 DB 11.4 초록 · 수 비교**

```bash
pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts --reporter=json --outputFile=C:/Users/kim52/AppData/Local/Temp/ak5/base/db114-v5.json
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/count.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/db114-v5.json
```

Expected: `failed: 0`, `passed` = `db114-before.json` 의 값. 실패는 Step 2 와 같은 범주로 고친다.

- [ ] **Step 5: 부산물 · 커밋**

```bash
git status --short
```

`.vitest/` 같은 새 폴더가 보이면 `.gitignore` 에 한 줄(`.vitest/`)을 더한다(vitest 5 는 리포트 · 첨부를 `.vitest/` 에 쓴다).

```bash
pnpm check && pnpm format:check
git add package.json packages/*/package.json pnpm-lock.yaml docs/verification/2026-10-17-kit-toolchain-upgrade.md
git add -u packages .gitignore
git commit -m "chore: Vitest 5.0.5 — 새 기본값(모의 함수 초기화 · await 안 한 단언)에 맞춘 테스트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: admin-ui peer Pinia 4 · README · changeset

권장 티어: `haiku`

**Files:**

- Modify: `packages/admin-ui/package.json`, `pnpm-lock.yaml`, `packages/admin-ui/README.md:6` · `:80`
- Create: `.changeset/pinia-4-toolchain.md`

**Interfaces:**

- Produces: `.changeset/pinia-4-toolchain.md`(Task 6 이 "동작 변경 없음" 문장 뒤에 V3 요약을 더한다)

- [ ] **Step 1: 매니페스트**

`packages/admin-ui/package.json`:

- `peerDependencies.pinia`: `"^3.0.0"` → `"^4.0.0"`
- `devDependencies.pinia`: `"^3.0.4"` → `"^4.1.0"`
- `devDependencies` 에 `"@vue/devtools-api": "^8.2.1"` 를 `"@vitejs/plugin-vue"` 줄과 `"@vue/test-utils"` 줄 사이에 더한다(가나다순).

```bash
pnpm install
pnpm --filter @ssworks/admin-ui list pinia @vue/devtools-api
```

Expected: `pinia 4.1.0` · `@vue/devtools-api 8.2.1`. 설치 출력에 pinia peer 경고가 없어야 한다.

- [ ] **Step 2: 테스트**

```bash
pnpm --filter @ssworks/admin-ui test
```

Expected: 초록(`store/app-store.test.ts` · `wiring.integration.test.ts` 가 Pinia 4 의 `createPinia` · `defineStore` 를 쓴다). 실패하면 systematic-debugging — Pinia 4 의 변경은 ESM 전용 · devtools-api 뿐이라 실패는 킷 결함 후보다.

- [ ] **Step 3: README**

`packages/admin-ui/README.md` 6행:

```bash
pnpm add @ssworks/admin-ui @ssworks/admin-shared vue vuetify vue-router pinia@^4 @vue/devtools-api@^8 axios
```

80행(peer 표의 pinia 줄)을 다음으로 바꾼다:

```markdown
| `pinia` | 예 | `createAppStore` — **4.x**. Pinia 4 의 필수 peer `@vue/devtools-api` 8 을 함께 설치한다 |
```

```bash
pnpm exec prettier --write packages/admin-ui/README.md
```

- [ ] **Step 4: changeset**

`.changeset/pinia-4-toolchain.md` 를 Write 로 만든다:

```markdown
---
'@ssworks/admin-ui': minor
'@ssworks/admin-shared': patch
'@ssworks/admin-server': patch
---

**쓰는 쪽이 할 일:** admin-ui 를 쓰는 앱은 `pnpm add pinia@^4 @vue/devtools-api@^8` — admin-ui 의 peer `pinia` 가 `^4.0.0` 이 됐다(Pinia 3 은 더 받지 않는다). `@vue/devtools-api` 는 Pinia 4 의 필수 peer 다(admin-ui 는 import 하지 않아 peer 로 두지 않는다). admin-shared · admin-server 만 쓰는 앱은 할 일 없음.

admin-ui: peer `pinia ^4.0.0`. 코드는 바뀌지 않았다 — Pinia 4 의 변경은 ESM 전용 · devtools-api 8 뿐이다(4.1.0 에서 시험).

admin-shared · admin-server: TypeScript 6.0.3 으로 빌드한 dist · d.ts. 동작 변경 없음. 저장소 도구는 TypeScript 6.0.3 · Vitest 5 · ESLint 10 · typescript-eslint 8.71 이고, 실 DB 테스트는 MariaDB 11.4 · 12.3 두 버전에서 돈다.
```

```bash
pnpm changeset status --verbose
```

Expected: admin-ui minor · admin-shared patch · admin-server patch, 새 버전 셋 다 `0.5.0`.

- [ ] **Step 5: 커밋**

```bash
pnpm check && pnpm format:check
git add packages/admin-ui/package.json packages/admin-ui/README.md pnpm-lock.yaml .changeset/pinia-4-toolchain.md
git commit -m "feat(admin-ui): peer pinia ^4 — Pinia 4 · @vue/devtools-api 8 설치 안내 · changeset(0.5.0)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

검증 기록 §2-4 에 `list` 결과 · 테스트 수를 적는다(다음 커밋에 함께 올린다).

---

### Task 5: MariaDB 11.4 + 12.3 매트릭스 · 12.3 스크립트 · 12.3 에서 test:db 초록

권장 티어: `sonnet`

**Files:**

- Modify: `.github/workflows/ci.yml`(`db` 잡), `package.json`(scripts), `packages/admin-server/src/database/connection.tls.db.test.ts:68`, `packages/admin-server/src/database/migrations/migrations.db.test.ts:48`, `packages/admin-server/README.md`(「테스트(이 저장소)」), `CLAUDE.md`(「명령어」 · admin-server 절의 "CI `db` 잡 필수")
- Modify(필요한 만큼): 12.3 에서만 깨지는 `*.db.test.ts` 또는 킷 결함 소스

**Interfaces:**

- Produces: 루트 scripts `db:test:up:12.3` · `db:test:down:12.3`, 컨테이너 `admin-kit-test-db-12`(Task 11 에서 지운다)

- [ ] **Step 1: CI 매트릭스**

`.github/workflows/ci.yml` 의 `db:` 잡을 통째로 다음으로 바꾼다(`check` 잡은 그대로):

```yaml
db:
  name: db (${{ matrix.mariadb }})
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      # 11.4 — 스냅샷 격리 기본 OFF · 12.3 — 기본 ON(11.6.2+). 둘 다 필수 검사다(main ruleset).
      mariadb: ['11.4', '12.3']
  services:
    mariadb:
      image: mariadb:${{ matrix.mariadb }}
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

- [ ] **Step 2: 로컬 12.3 스크립트**

`package.json` scripts 의 `"db:test:down"` 줄 바로 뒤에 두 줄을 더한다:

```json
    "db:test:up:12.3": "docker run -d --name admin-kit-test-db-12 -e MARIADB_ROOT_PASSWORD=admin-kit-test -p 33307:3306 mariadb:12.3",
    "db:test:down:12.3": "docker rm -f admin-kit-test-db-12",
```

- [ ] **Step 3: 테스트 이름 버전 중립**

- `packages/admin-server/src/database/connection.tls.db.test.ts:68` `describe('DB TLS — 실 MariaDB 11.4(2f-2b)', …` → `describe('DB TLS — 실 MariaDB(2f-2b)', …`
- `packages/admin-server/src/database/migrations/migrations.db.test.ts:48` `describe('코어 마이그레이션(실 MariaDB 11.4)', …` → `describe('코어 마이그레이션(실 MariaDB)', …`

11.4 에 대해 참인 사실을 적은 주석(FOR SHARE 1064 · TIMESTAMP 범위 · TLS 11.4.1+ · 스냅샷 격리 기본 OFF)은 그대로 둔다.

- [ ] **Step 4: 문서 — admin-server README · CLAUDE.md**

`packages/admin-server/README.md` 「테스트(이 저장소)」의 코드 블록과 그 아래 문장을 다음으로 바꾼다:

````markdown
```bash
pnpm db:test:up        # docker mariadb:11.4, 포트 33306
pnpm test:db           # 실 MariaDB 층 — ADMIN_TEST_DB_URL 로 다른 서버
pnpm db:test:down

pnpm db:test:up:12.3   # docker mariadb:12.3, 포트 33307(컨테이너 admin-kit-test-db-12)
ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm test:db
pnpm db:test:down:12.3
```

`pnpm check` 는 DB 없이 돈다(단위 · DB 없는 HTTP 계약). CI 는 `db (11.4)` · `db (12.3)` 두 잡이 `pnpm test:db` 를 필수로 돈다 — 스냅샷 격리 기본값이 다른 두 서버(11.4 OFF · 12.3 ON)다.
````

`CLAUDE.md` 「명령어」 코드 블록에서 `pnpm test:db` 를 다루는 자리가 없으니, `pnpm changeset` 줄 위에 다음 세 줄을 더한다:

```bash
pnpm db:test:up && pnpm test:db         # 실 MariaDB 11.4(33306)
pnpm db:test:up:12.3                    # 실 MariaDB 12.3(33307) — 아래 한 줄로 돌린다
ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm test:db   # PowerShell: $env:ADMIN_TEST_DB_URL='…'; pnpm test:db
```

`CLAUDE.md` admin-server 절의 `실 MariaDB(\`_.db.test.ts\`)는 \`pnpm db:test:up\` 뒤 \`pnpm test:db\`(CI \`db\` 잡 필수).`를`실 MariaDB(\`_.db.test.ts\`)는 \`pnpm db:test:up\` 뒤 \`pnpm test:db\`(CI \`db (11.4)\` · \`db (12.3)\` 잡 필수 — 12.3 로컬은 \`db:test:up:12.3\` · 포트 33307).` 로 바꾼다.

- [ ] **Step 5: 12.3 띄우기 · 서버 사실 기록**

```bash
docker pull mariadb:12.3
pnpm db:test:up:12.3
node -e "const {execSync}=require('child_process');const t=Date.now();(function f(){try{execSync('docker exec admin-kit-test-db-12 healthcheck.sh --connect --innodb_initialized',{stdio:'ignore'});console.log('ready')}catch{if(Date.now()-t>180000){console.error('timeout');process.exit(1)}setTimeout(f,2000)}})()"
for c in admin-kit-test-db admin-kit-test-db-12; do docker exec $c mariadb -uroot -padmin-kit-test -N -e "select '$c', version(), @@global.innodb_snapshot_isolation, @@have_ssl, @@character_set_server, @@collation_server"; done
```

Expected: `ready`, 두 줄. 검증 기록 §3 에 표로 적는다(버전 · 스냅샷 격리 · TLS · 문자 집합 · 정렬 규칙).

- [ ] **Step 6: 12.3 첫 실행**

```bash
ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm --filter @ssworks/admin-server exec vitest run --config vitest.db.config.ts --reporter=json --outputFile=C:/Users/kim52/AppData/Local/Temp/ak5/base/db123-first.json; echo exit=$?
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/count.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/db123-first.json
```

`failed: 0` 이면 Step 8 로 간다.

- [ ] **Step 7: 12.3 에서만 깨지는 것 고치기**

실패마다 원인을 먼저 가른다(superpowers:systematic-debugging). 스펙 §12-6 의 후보: 전역 스냅샷 격리 ON 가정, `whileHeld` 가 읽는 `SHOW ENGINE INNODB STATUS` 형식, TLS 자체 서명 · 지문 검증, 기본 문자 집합 · 정렬 규칙.

- **테스트가 서버 기본값을 가정했다** → 테스트를 버전 중립으로 고친다. 예: 기본값을 단언하지 말고 `select @@global…` 로 읽은 값을 기준으로 삼는다. 이렇게 고치면 11.4 에서도 같은 의미로 돌아야 한다.
- **킷 결함이다**(12.3 의 실제 사용자가 만날 오동작) → superpowers:test-driven-development 로 고친다. 실패하는 db 테스트는 이미 있다. `.changeset/pinia-4-toolchain.md` 의 그 패키지 문단에 한 줄을 더하고, 스펙 §13 에 적는다.

고친 것은 검증 기록 §3 에 `테스트 · 12.3 증상 · 원인 · 고친 것 · 분류` 로 적는다.

- [ ] **Step 8: 문서대로 두 버전 차례로 초록**

문서에 적은 명령 그대로 돌린다(한 번에 하나씩):

```bash
ADMIN_TEST_DB_URL=mariadb://root:admin-kit-test@127.0.0.1:33307 pnpm test:db
pnpm test:db
```

Expected: 둘 다 초록, 테스트 수가 같다(= `db114-before.json`). 수를 검증 기록 §3 에 적는다. 12.3 컨테이너는 Task 11 까지 둔다.

- [ ] **Step 9: 커밋**

```bash
pnpm check && pnpm format:check
git add .github/workflows/ci.yml package.json CLAUDE.md packages/admin-server/README.md docs/verification/2026-10-17-kit-toolchain-upgrade.md
git add -u packages .changeset
git commit -m "ci: 실 DB 테스트를 MariaDB 11.4 · 12.3 매트릭스로 — db:test:up:12.3(33307) · 테스트 이름 버전 중립

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 발행물 비교 · changeset 드라이런 · 0.5.0 tarball

권장 티어: `sonnet`

**Files:**

- Create(저장소 밖): `AK5/tools/dist-diff.mjs`, `AK5/base/dist-after/`, `AK5/base/dist-diff.txt`, `AK5/tgz/*.tgz`, 임시 worktree `AK5/wt`(이 태스크 안에서 지운다)
- Modify: `.changeset/pinia-4-toolchain.md`(마지막 문단), 검증 기록 §4 · §5

**Interfaces:**

- Consumes: `AK5/base/dist-before/`(Task 1)
- Produces: `AK5/tgz/ssworks-admin-shared-0.5.0.tgz` · `ssworks-admin-ui-0.5.0.tgz` · `ssworks-admin-server-0.5.0.tgz`(Task 7 · 9)

- [ ] **Step 1: 비교 스크립트**

`C:/Users/kim52/AppData/Local/Temp/ak5/tools/dist-diff.mjs` 를 Write 로 만든다:

```js
// 두 dist 묶음을 비교한다. 인자: before 폴더 · after 폴더. .map 은 건너뛴다.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const [before, after] = process.argv.slice(2)
const walk = (root) => {
  const out = []
  const go = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) go(path)
      else if (!name.endsWith('.map')) out.push(relative(root, path).replace(/\\/g, '/'))
    }
  }
  go(root)
  return out
}
const a = new Set(walk(before))
const b = new Set(walk(after))
const onlyBefore = [...a].filter((f) => !b.has(f))
const onlyAfter = [...b].filter((f) => !a.has(f))
const changed = [...a].filter(
  (f) => b.has(f) && readFileSync(join(before, f), 'utf8') !== readFileSync(join(after, f), 'utf8'),
)
console.log(
  `파일 before ${a.size} · after ${b.size} · 사라짐 ${onlyBefore.length} · 새로 ${onlyAfter.length} · 바뀜 ${changed.length}`,
)
for (const f of onlyBefore) console.log('- 사라짐', f)
for (const f of onlyAfter) console.log('+ 새로', f)
for (const f of changed) {
  console.log('\n~ 바뀜', f)
  try {
    execFileSync('git', ['diff', '--no-index', '--no-color', join(before, f), join(after, f)], {
      stdio: 'pipe',
    })
  } catch (error) {
    process.stdout.write(error.stdout.toString())
  }
}
```

- [ ] **Step 2: 상향 뒤 dist 떠서 비교(V3)**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
pnpm build
node -e "const fs=require('fs');for (const p of ['admin-shared','admin-ui','admin-server']) fs.cpSync('packages/'+p+'/dist','C:/Users/kim52/AppData/Local/Temp/ak5/base/dist-after/'+p,{recursive:true})"
for p in admin-shared admin-ui admin-server; do echo "=== $p"; node C:/Users/kim52/AppData/Local/Temp/ak5/tools/dist-diff.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/dist-before/$p C:/Users/kim52/AppData/Local/Temp/ak5/base/dist-after/$p; done > C:/Users/kim52/AppData/Local/Temp/ak5/base/dist-diff.txt
head -c 4000 C:/Users/kim52/AppData/Local/Temp/ak5/base/dist-diff.txt; grep -c "^~ 바뀜" C:/Users/kim52/AppData/Local/Temp/ak5/base/dist-diff.txt
```

`dist-diff.txt` 를 끝까지 읽고, 패키지마다 차이를 분류해 검증 기록 §4 에 적는다.

- **표기만**: 따옴표 · 줄바꿈 · import 순서 · 주석 · 타입 별칭 펼침이 같은 타입 · 번들 청크 이름.
- **의미 있음**: export 가 사라지거나 생김 · 타입이 넓어지거나 좁아짐 · 런타임 코드 변경.

"의미 있음" 이 있으면 원인(어느 커밋 · 어느 도구)을 찾아 적는다. 소비자에게 깨지는 변경이면 멈추고 보고한다.

- [ ] **Step 3: changeset 문장 채우기**

`.changeset/pinia-4-toolchain.md` 마지막 문단의 `동작 변경 없음.` 을 `동작 변경 없음 — <V3 요약 한 문장: 예 "d.ts 차이는 표기 N곳(…)뿐이고 export · 타입 · 런타임 코드는 같다">.` 로 바꾼다.

- [ ] **Step 4: 드라이런 worktree(V4)**

```bash
git add .changeset/pinia-4-toolchain.md docs/verification/2026-10-17-kit-toolchain-upgrade.md
git commit -m "docs: 발행물 비교(TS 5.9 → 6) 결과 — 검증 기록 §4 · changeset 문장

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git worktree add --detach C:/Users/kim52/AppData/Local/Temp/ak5/wt HEAD
cd /c/Users/kim52/AppData/Local/Temp/ak5/wt
pnpm install --frozen-lockfile
pnpm version-packages
node -e "for (const p of ['admin-shared','admin-ui','admin-server']) { const j=require('./packages/'+p+'/package.json'); console.log(p, j.version, JSON.stringify(j.peerDependencies?.['@ssworks/admin-shared'] ?? '-'), JSON.stringify(j.peerDependencies?.pinia ?? '-')) }"
grep -n "^## " packages/*/CHANGELOG.md | head -9
```

Expected: `admin-shared 0.5.0 "-" "-"` · `admin-ui 0.5.0 "workspace:^0" "^4.0.0"` · `admin-server 0.5.0 "workspace:>=0.4.0 <1.0.0" "-"`. 각 CHANGELOG 첫 제목이 `## 0.5.0` 이고 `## 1.0.0` 은 없다. 다르면 멈추고 보고한다.

- [ ] **Step 5: 0.5.0 tarball**

```bash
pnpm build
for p in admin-shared admin-ui admin-server; do pnpm --filter @ssworks/$p pack --pack-destination C:/Users/kim52/AppData/Local/Temp/ak5/tgz; done
cmd //c dir C:\\Users\\kim52\\AppData\\Local\\Temp\\ak5\\tgz
# 🔴 Git Bash 의 tar 는 `C:/…` 의 `C:` 를 원격 호스트로 읽는다 — /c/… 경로를 쓴다
for t in admin-shared admin-ui admin-server; do tar -xOf /c/Users/kim52/AppData/Local/Temp/ak5/tgz/ssworks-$t-0.5.0.tgz package/package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.name,j.version,JSON.stringify(j.peerDependencies))})"; done
```

Expected: tgz 셋(`ssworks-admin-shared-0.5.0.tgz` · `ssworks-admin-ui-0.5.0.tgz` · `ssworks-admin-server-0.5.0.tgz`)이 디스크에 있다(`dir` 로 확인 — 메모리: 저장소 밖 산출물). 파일 이름이 다르면 Task 7 · 9 의 `file:` 경로를 그 이름으로 쓴다. admin-ui peer 에 `"@ssworks/admin-shared":"^0"` · `"pinia":"^4.0.0"` 가 있고 `@vue/devtools-api` 는 없다. admin-server peer 에 `"@ssworks/admin-shared":">=0.4.0 <1.0.0"` 가 있다.

- [ ] **Step 6: worktree 지우기 · 기록 · 커밋**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
git worktree remove --force C:/Users/kim52/AppData/Local/Temp/ak5/wt
git worktree list
git status --short
```

Expected: worktree 는 하나(킷)만 남는다. `git status` 는 ` M .claude/settings.json` 뿐이다(드라이런은 worktree 안에서만 바꿨다). 검증 기록 §5 에 Step 4 · 5 의 출력을 적는다.

```bash
git add docs/verification/2026-10-17-kit-toolchain-upgrade.md
git commit -m "docs: changeset 드라이런 — 0.5.0 셋 · peer 그대로 · tarball

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 소비 앱 스모크 — 브라우저(Pinia 4 · TS 6 · TS 5.9) · 서버(TS 6)

권장 티어: `sonnet`

**Files:**

- Create(저장소 밖): `AK5/smoke-ui/**`, `AK5/smoke-server/**`, `AK5/tools/tsc-origins.mjs`
- Modify: 검증 기록 §6

**Interfaces:**

- Consumes: `AK5/tgz/*.tgz`(Task 6)

- [ ] **Step 1: 브라우저 앱 파일**

`C:/Users/kim52/AppData/Local/Temp/ak5/smoke-ui/` 아래에 Write 로 만든다.

`package.json`:

```json
{
  "name": "ak5-smoke-ui",
  "private": true,
  "type": "module",
  "dependencies": {
    "@codemirror/state": "^6.7.6",
    "@he-tree/vue": "^2.10.5",
    "@mdi/font": "^7.4.47",
    "@ssworks/admin-shared": "file:../tgz/ssworks-admin-shared-0.5.0.tgz",
    "@ssworks/admin-ui": "file:../tgz/ssworks-admin-ui-0.5.0.tgz",
    "@vue/devtools-api": "8.2.1",
    "axios": "^1.20.0",
    "codemirror": "^6.0.2",
    "pinia": "4.1.0",
    "vue": "^3.5.44",
    "vue-router": "^5.4.0",
    "vuetify": "^4.2.6",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.10",
    "typescript": "6.0.3",
    "vite": "^8.3.4",
    "vite-plugin-vuetify": "^2.1.3",
    "vue-tsc": "^3.3.13"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
# admin-ui README "Peer 의존" — he-tree 의 하위 의존 vue-demi postinstall 은 Vue 3 에서 할 일이 없다.
allowBuilds:
  vue-demi: false
```

`tsconfig.json`(🔴 `noUncheckedSideEffectImports` 를 적지 않는다 — TS 6 기본값 그대로가 Review Focus 4 다):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": false,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

`vite.config.ts`:

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({ plugins: [vue(), vuetify({ autoImport: true })] })
```

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>ak5 smoke</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/api/client.ts`:

```ts
import { createApiClient } from '@ssworks/admin-ui'

export const client = createApiClient({
  baseURL: '/api/admin',
  refreshPath: '/auth/refresh',
  noRetryPaths: ['/auth/login'],
})

export const { api } = client
```

`src/stores/app.ts`(Pinia 4 의 `defineStore` 타입을 admin-ui d.ts 너머로 잰다):

```ts
import { ApiError, createAppStore, type AdminUserInfo } from '@ssworks/admin-ui'
import { api } from '../api/client'

export const useAppStore = createAppStore<AdminUserInfo>('app', {
  fetchMe: () => api.get<AdminUserInfo>('/auth/me'),
  login: async (credentials) => {
    await api.post('/auth/login', credentials)
  },
  logout: async () => {
    await api.post('/auth/logout')
  },
  isForbidden: (error) => error instanceof ApiError && error.status === 403,
})
```

`src/permissions.ts`(카탈로그 밖 키가 타입 오류인지 — `@ts-expect-error` 가 쓰이지 않으면 그 자체가 오류다):

```ts
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'
import { createUsePermission } from '@ssworks/admin-ui'
import { useAppStore } from './stores/app'

export const permissions = definePermissions({
  ORG_USERS_READ: 'org.users:read',
  ORG_USERS_WRITE: 'org.users:write',
})
export type Permission = PermissionOf<typeof permissions>

export const usePermission = createUsePermission<Permission>(
  () => useAppStore().userInfo?.permissions ?? [],
)

export function narrowed(): boolean {
  const check = usePermission()
  // @ts-expect-error 카탈로그 밖 권한은 타입 오류여야 한다
  return check.hasPermission('nope:x') || check.hasPermission('org.users:read')
}
```

`src/router.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router'
import {
  createAdminGuard,
  createTitleGuard,
  defineAdminRoute,
  installChunkRecovery,
} from '@ssworks/admin-ui'
import { usePermission, type Permission } from './permissions'
import { useAppStore } from './stores/app'

export const routes = [
  defineAdminRoute<Permission>({
    path: '/',
    component: () => import('./pages/HomePage.vue'),
    meta: { title: '홈', permissions: ['org.users:read'], menu: { icon: 'mdi-home' } },
  }),
  defineAdminRoute<Permission>({
    path: '/login',
    component: () => import('./pages/HomePage.vue'),
    meta: { title: '로그인', layout: 'auth', isPublic: true, needNonAuth: true },
  }),
]

export const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(
  createAdminGuard<Permission>({
    ensureInitialized: () => useAppStore().initialize(),
    isAuthorized: () => useAppStore().authorized,
    isPermissionDenied: () => useAppStore().permissionDenied,
    check: usePermission(),
  }),
)
router.afterEach(createTitleGuard('ak5 smoke'))
installChunkRecovery(router)
```

`src/pages/HomePage.vue`:

```vue
<template>
  <div>홈</div>
</template>
```

`src/layouts/default.vue`:

```vue
<script setup lang="ts">
  import { AdminShell, buildMenu } from '@ssworks/admin-ui'
  import { routes } from '../router'
  import type { Permission } from '../permissions'

  const items = buildMenu<Permission>(routes, { groups: [{ key: 'org', title: '조직' }] })
</script>

<template>
  <AdminShell :menu-props="{ items }" :app-bar-props="{ showTeamRole: true }" />
</template>
```

`src/layouts/auth.vue`:

```vue
<script setup lang="ts">
  import { AuthShell } from '@ssworks/admin-ui'
</script>

<template>
  <AuthShell />
</template>
```

`src/App.vue`:

```vue
<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import { VApp } from 'vuetify/components'
  import { AdminConfirm, AdminToast, IpBlockedDialog } from '@ssworks/admin-ui'
  import AuthLayout from './layouts/auth.vue'
  import DefaultLayout from './layouts/default.vue'

  const route = useRoute()
  const layout = computed(() => (route.meta.layout === 'auth' ? AuthLayout : DefaultLayout))
</script>

<template>
  <VApp>
    <component :is="layout" />
    <AdminToast />
    <AdminConfirm />
    <IpBlockedDialog />
  </VApp>
</template>
```

`src/main.ts`(`import * as` 로 모든 export 를 번들에 싣는다 — 런타임 의존 해석을 `vite build` 가 잰다):

```ts
import { createApp, reactive } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import * as AdminUi from '@ssworks/admin-ui'
import { createAdminUi, createConfirm, createToast } from '@ssworks/admin-ui'
import '@ssworks/admin-ui/style.css'
import App from './App.vue'
import { router } from './router'
import { useAppStore } from './stores/app'

console.warn('admin-ui exports', Object.keys(AdminUi).length)

const ipBlock = reactive({ blocked: false, ip: '' })
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(createVuetify())
app.use(createToast())
app.use(createConfirm())
app.use(
  createAdminUi({
    siteName: 'ak5 smoke',
    user: () => useAppStore().userInfo,
    logout: () => useAppStore().logout(),
    ipBlocked: () => ipBlock,
  }),
)
app.mount('#app')
```

- [ ] **Step 2: 설치**

```bash
cd /c/Users/kim52/AppData/Local/Temp/ak5/smoke-ui
pnpm install 2>&1 | tail -30
```

Expected: 설치 성공, `@ssworks/admin-ui` · `pinia` 의 peer 경고 없음. `ERR_PNPM_IGNORED_BUILDS` 로 멈추면 출력에 나온 패키지를 `pnpm-workspace.yaml` 의 `allowBuilds:` 에 `<이름>: false` 로 더하고 다시 돈다(기록).

- [ ] **Step 3: 오류를 출처별로 세는 도구**

`C:/Users/kim52/AppData/Local/Temp/ak5/tools/tsc-origins.mjs` 를 Write 로 만든다:

```js
// tsc · vue-tsc 출력에서 오류를 출처별로 센다. 인자: 출력 파일
import { readFileSync } from 'node:fs'

const lines = readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
const counts = {}
for (const line of lines) {
  const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+)/)
  if (!m) continue
  const path = m[1].replace(/\\/g, '/')
  const origin = path.includes('node_modules/')
    ? (path.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/)?.[1] ??
      'node_modules')
    : 'app'
  const key = `${origin} ${m[2]}`
  counts[key] = (counts[key] ?? 0) + 1
}
console.log(counts)
const kit = Object.entries(counts).filter(
  ([k]) => k.startsWith('@ssworks/') || k.startsWith('app '),
)
console.log(
  kit.length === 0
    ? 'KIT+APP OK (0)'
    : 'KIT+APP ERRORS: ' + JSON.stringify(Object.fromEntries(kit)),
)
```

- [ ] **Step 4: TS 6 — vue-tsc(skipLibCheck: false) · 빌드**

```bash
pnpm exec tsc -v
pnpm exec vue-tsc --noEmit -p tsconfig.json > C:/Users/kim52/AppData/Local/Temp/ak5/base/smoke-ui-ts6.txt 2>&1; echo exit=$?
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/tsc-origins.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/smoke-ui-ts6.txt
pnpm exec vite build 2>&1 | tail -15
```

Expected: `Version 6.0.3` · `KIT+APP OK (0)`. vuetify 등 제3자 출처 오류는 개수만 기록한다(알려진 문제 — CLAUDE.md "admin-ui 는 Vuetify d.ts 가 skipLibCheck: false 에서 깨져"). `vite build` 성공(`dist/index.html` 생김). `app` 출처 오류가 스모크 코드의 실수(타입 인자 · prop 이름)면 스모크를 고치고 다시 돈다. 킷 d.ts 때문이면 킷 결함 → systematic-debugging · changeset.

- [ ] **Step 5: TS 6 기본값의 side-effect import(Review Focus 4)**

```bash
grep -c "TS2882\|TS2307" C:/Users/kim52/AppData/Local/Temp/ak5/base/smoke-ui-ts6.txt
```

Expected: `0` — `@ssworks/admin-ui/style.css` · `vuetify/styles` · `@mdi/font/...css` 가 TS 6 기본값(`noUncheckedSideEffectImports`)에서 해석된다.

- [ ] **Step 6: TS 5.9.3 소비자(Review Focus 3)**

```bash
pnpm add -D typescript@5.9.3
pnpm exec vue-tsc --noEmit -p tsconfig.json > C:/Users/kim52/AppData/Local/Temp/ak5/base/smoke-ui-ts59.txt 2>&1; echo exit=$?
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/tsc-origins.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/smoke-ui-ts59.txt
pnpm add -D typescript@6.0.3
```

Expected: `KIT+APP OK (0)`.

- [ ] **Step 7: Pinia 3 소비자(Review Focus 1)**

```bash
pnpm add pinia@3.0.4 2>&1 | tail -20
```

Expected: 출력이 `@ssworks/admin-ui` 와 `pinia@"^4.0.0"` 을 짚는 peer 경고(또는 오류)를 낸다. 실제 문구를 검증 기록 §6 에 옮긴다. 조용히 지나가면 기록하고 보고한다(changeset 안내만으로는 못 알아챈다는 뜻이다).

```bash
pnpm add pinia@4.1.0
```

- [ ] **Step 8: devtools-api 빠뜨림(Review Focus 2)**

`pnpm-workspace.yaml` 끝에 `autoInstallPeers: false` 를 더하고:

```bash
pnpm remove @vue/devtools-api 2>&1 | tail -20
pnpm exec vite build 2>&1 | tail -10; echo build-exit=$?
```

설치 출력의 peer 경고 문구와 빌드 결과(성공 · 실패와 메시지)를 검증 기록 §6 에 적는다. 그런 다음 되돌린다:

```bash
pnpm add @vue/devtools-api@8.2.1
```

`pnpm-workspace.yaml` 에서 `autoInstallPeers: false` 줄을 지운다.

- [ ] **Step 9: 서버 앱 파일(V6)**

`C:/Users/kim52/AppData/Local/Temp/ak5/smoke-server/` 아래에 Write 로 만든다.

`package.json`:

```json
{
  "name": "ak5-smoke-server",
  "private": true,
  "type": "module",
  "dependencies": {
    "@kim5257/kysely-mariadb-dialect": "^0.2.0",
    "@nestjs/common": "^12.1.3",
    "@nestjs/core": "^12.1.3",
    "@nestjs/platform-express": "^12.1.3",
    "@ssworks/admin-server": "file:../tgz/ssworks-admin-server-0.5.0.tgz",
    "@ssworks/admin-shared": "file:../tgz/ssworks-admin-shared-0.5.0.tgz",
    "kysely": "^0.29.6",
    "mariadb": "^3.5.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^24.0.0",
    "typescript": "6.0.3"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "noEmit": true,
    "skipLibCheck": false,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`src/main.ts`:

```ts
import 'reflect-metadata'
import * as AdminServer from '@ssworks/admin-server'
import {
  AdminAuthModule,
  AdminServerModule,
  configureAdminApp,
  type AdminDatabase,
} from '@ssworks/admin-server'
import {
  ADMIN_MIGRATIONS,
  adminDbConnectionFromEnv,
  assertAdminMigrationStubs,
} from '@ssworks/admin-server/runner'
import { down, up } from '@ssworks/admin-server/migrations/0012_ip_access_rules'

export interface Database extends AdminDatabase {}

export const used = [
  Object.keys(AdminServer).length,
  AdminServerModule,
  AdminAuthModule,
  configureAdminApp,
  ADMIN_MIGRATIONS,
  adminDbConnectionFromEnv,
  assertAdminMigrationStubs,
  up,
  down,
] as const
```

- [ ] **Step 10: 서버 설치 · tsc**

```bash
cd /c/Users/kim52/AppData/Local/Temp/ak5/smoke-server
pnpm install 2>&1 | tail -20
pnpm exec tsc -v
pnpm exec tsc --noEmit -p tsconfig.json > C:/Users/kim52/AppData/Local/Temp/ak5/base/smoke-server-ts6.txt 2>&1; echo exit=$?
node C:/Users/kim52/AppData/Local/Temp/ak5/tools/tsc-origins.mjs C:/Users/kim52/AppData/Local/Temp/ak5/base/smoke-server-ts6.txt
```

Expected: `Version 6.0.3` · `exit=0` · `KIT+APP OK (0)`. `ERR_PNPM_IGNORED_BUILDS` 는 Step 2 와 같이 `pnpm-workspace.yaml` 의 `allowBuilds` 로 푼다(`@nestjs/core` 등 — `false`). 제3자 d.ts 오류(Nest · express)가 나오면 출처와 개수를 기록한다. `@ssworks/` 출처는 0 이어야 한다.

- [ ] **Step 11: 기록 · 커밋**

검증 기록 §6 에 Step 4 ~ 10 의 결과(버전 · 출처별 오류 수 · 빌드 · Review Focus 1 · 2 · 3 · 4 의 실제 출력)를 적는다.

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
pnpm exec prettier --write docs/verification/2026-10-17-kit-toolchain-upgrade.md
git add docs/verification/2026-10-17-kit-toolchain-upgrade.md
git commit -m "docs: 소비 앱 스모크 — Pinia 4 · TS 6 · TS 5.9 · skipLibCheck false · 서버 NodeNext

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 템플릿 커밋 ⓐ — 도구 상향(킷 0.4.1 유지)

권장 티어: `sonnet`

**Files(템플릿 저장소):**

- Modify: `package.json` · `packages/frontend/package.json` · `packages/backend/package.json` · `packages/shared/package.json` · `pnpm-lock.yaml`
- Modify: `packages/frontend/tsconfig.app.json`(`baseUrl` 줄 지움), `packages/shared/tsconfig.json`(`baseUrl` 줄 지움), `CLAUDE.md:42`
- Modify(필요한 만큼): 새 도구가 깬 템플릿 코드 · 테스트

**Interfaces:**

- Produces: 템플릿 `preset/admin` 의 커밋 ⓐ(해시를 킷 검증 기록 §7 에)

- [ ] **Step 1: 시작 상태 · 기준선**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
git branch --show-current     # preset/admin
git status --short            # 비어 있어야 한다
git log --oneline -1          # 9355035
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: 모두 초록. 테스트 수를 적어 둔다(출력의 `Tests  N passed`, 패키지마다). 빨가면 멈추고 보고한다(상향 전부터 빨간 것이다).

- [ ] **Step 2: 매니페스트**

Edit 로 바꾼다:

- `package.json` devDependencies: `"@eslint/js": "^10.0.1"` · `"@typescript-eslint/eslint-plugin": "^8.71.2"` · `"@typescript-eslint/parser": "^8.71.2"` · `"eslint": "^10.13.0"` · `"typescript": "~6.0.3"` · `"typescript-eslint": "^8.71.2"`
- `packages/frontend/package.json` devDependencies: `"eslint": "^10.13.0"` · `"eslint-config-vuetify": "^4.7.2"` · `"typescript": "~6.0.3"` · `"vitest": "^5.0.5"` · `"vue-tsc": "^3.3.13"`
- `packages/backend/package.json` devDependencies: `"typescript": "~6.0.3"`
- `packages/shared/package.json` devDependencies: `"typescript": "~6.0.3"` · `"vitest": "^5.0.5"`

- [ ] **Step 3: TS 6 폐기 옵션 `baseUrl`**

- `packages/frontend/tsconfig.app.json`: `"baseUrl": ".",` 줄을 지운다. `paths` 는 둔다(TS 4.1+ 는 `baseUrl` 없이 tsconfig 폴더 기준으로 푼다).
- `packages/shared/tsconfig.json`: `"baseUrl": "./"` 줄을 지운다(앞 줄 끝 쉼표도 정리). `paths` 가 없어 쓰이지 않던 값이다.

- [ ] **Step 4: 설치 · 검사 넷**

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

깨지면 킷 플랜 Task 1 Step 8 · Task 2 Step 3 · Task 3 Step 2 와 같은 원칙으로 **템플릿 코드**를 고친다(규칙을 끄지 않는다 · 단언 의미 유지 · `ignoreDeprecations` 금지). eslint-config-vuetify 가 eslint 10 에서 설정 오류를 내면 멈추고 보고한다. 테스트 수가 Step 1 보다 줄면 안 된다. 고친 것을 킷 검증 기록 §7 에 적는다.

- [ ] **Step 5: 문서**

`CLAUDE.md:42` `- **런타임**: Node.js 24 / TypeScript 5.9 (ESNext, NodeNext)` → `- **런타임**: Node.js 24 / TypeScript 6.0 (ESNext, NodeNext)`.

```bash
grep -rn -E "5\.9|eslint 9|ESLint 9|vitest 4|Vitest 4" --include=*.md --exclude-dir=node_modules .
```

Expected: 남은 버전 표기 없음(있으면 같이 고친다).

- [ ] **Step 6: frozen-lockfile(Review Focus 5)**

```bash
pnpm install --frozen-lockfile
```

Expected: 성공(템플릿 CI 의 첫 단계).

- [ ] **Step 7: 커밋(템플릿)**

```bash
git add package.json packages/*/package.json pnpm-lock.yaml packages/frontend/tsconfig.app.json packages/shared/tsconfig.json CLAUDE.md
git add -u packages
git status --short
git commit -m "chore: 도구 상향 — TypeScript 6.0.3 · ESLint 10 · Vitest 5 · typescript-eslint 8.71 · eslint-config-vuetify 4.7(baseUrl 지움)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1
```

- [ ] **Step 8: 킷 쪽 기록**

킷 검증 기록 §7 에 커밋 ⓐ 해시 · 바꾼 버전 · 고친 것 · 테스트 수를 적는다(커밋은 Task 9 끝에 함께).

---

### Task 9: 템플릿 커밋 ⓑ — 킷 0.5.0 · Pinia 4(package.json 만) · clone 검증

권장 티어: `sonnet`

**Files(템플릿 저장소):**

- Modify: `packages/frontend/package.json` · `packages/backend/package.json` · `packages/shared/package.json`, `CLAUDE.md:38` · `:46`
- Create(저장소 밖, 이 태스크 안에서 지운다): `AK5/tpl`(clone)

**Interfaces:**

- Consumes: `AK5/tgz/*.tgz`(Task 6), 커밋 ⓐ(Task 8)

- [ ] **Step 1: 매니페스트 · 문서**

- `packages/frontend/package.json` dependencies: `"@ssworks/admin-shared": "0.5.0"` · `"@ssworks/admin-ui": "0.5.0"` · `"pinia": "^4.1.0"`, 그리고 `"@ssworks/admin-ui"` 줄 바로 뒤에 `"@vue/devtools-api": "^8.2.1",`
- `packages/backend/package.json` dependencies: `"@ssworks/admin-server": "0.5.0"` · `"@ssworks/admin-shared": "0.5.0"`
- `packages/shared/package.json` dependencies: `"@ssworks/admin-shared": "0.5.0"`
- `CLAUDE.md:38` 의 `(같은 번호끼리, 지금 0.4.1)` → `(같은 번호끼리, 지금 0.5.0)`.
- `CLAUDE.md:46`(`- **관리자 킷**: … \`@ssworks/admin-server\` 0.4.1`) 줄 끝의 `0.4.1`→`0.5.0 — admin-ui 는 Pinia 4 와 \`@vue/devtools-api\` 8 을 함께 요구한다`.

0.5.0 에는 새 코어 장이 없다 — 스텁을 더하지 않는다(「킷 올리기」 3).

- [ ] **Step 2: 커밋(템플릿 — 잠금 파일 빼고)**

```bash
cd /c/Users/kim52/workspace/kim5257-project-template
git add packages/frontend/package.json packages/backend/package.json packages/shared/package.json CLAUDE.md
git status --short   # pnpm-lock.yaml 은 올리지 않는다
git commit -m "chore: 킷 0.5.0 · Pinia 4 · @vue/devtools-api 8 — 잠금 파일은 릴리스 뒤 amend

🔴 0.5.0 공개 전에는 잠금 파일을 만들 수 없다. 공개 뒤 pnpm install → lint · typecheck · test · build →
git add pnpm-lock.yaml && git commit --amend --no-edit → push. 그 전에 push 하지 않는다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -3
```

- [ ] **Step 3: clone 에서 tarball 로 검증**

```bash
git clone --branch preset/admin C:/Users/kim52/workspace/kim5257-project-template C:/Users/kim52/AppData/Local/Temp/ak5/tpl
cd /c/Users/kim52/AppData/Local/Temp/ak5/tpl
git log --oneline -2   # ⓑ · ⓐ
cat >> pnpm-workspace.yaml <<'EOF'

# 검증 전용(커밋하지 않는다) — 0.5.0 공개 전이라 tarball 에 붙인다.
overrides:
  '@ssworks/admin-shared': 'file:C:/Users/kim52/AppData/Local/Temp/ak5/tgz/ssworks-admin-shared-0.5.0.tgz'
  '@ssworks/admin-ui': 'file:C:/Users/kim52/AppData/Local/Temp/ak5/tgz/ssworks-admin-ui-0.5.0.tgz'
  '@ssworks/admin-server': 'file:C:/Users/kim52/AppData/Local/Temp/ak5/tgz/ssworks-admin-server-0.5.0.tgz'
EOF
pnpm install --no-frozen-lockfile 2>&1 | tail -20
pnpm --filter @project/frontend list pinia @vue/devtools-api @ssworks/admin-ui @ssworks/admin-shared
pnpm --filter @project/backend list @ssworks/admin-server @ssworks/admin-shared
```

Expected: 설치 성공, pinia peer 경고 없음. `pinia 4.1.x` · `@vue/devtools-api 8.2.x` · `@ssworks/* 0.5.0`(file:). pnpm 10 이 `pnpm-workspace.yaml` 의 `overrides` 를 받지 않으면 루트 `package.json` 의 `"pnpm": { "overrides": { … } }` 로 옮겨 다시 돈다(기록).

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: 모두 초록, 테스트 수 = Task 8 Step 4 의 값. 깨지면 원인을 가른다. 킷 결함이면 킷 쪽에서 고친다(systematic-debugging · changeset · tarball 을 Task 6 Step 4 ~ 5 로 다시 만든다). 템플릿 문제면 템플릿을 고쳐 ⓑ 에 amend 한다(잠금 파일은 여전히 빼고).

- [ ] **Step 4: clone 지우기**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
node -e "require('fs').rmSync('C:/Users/kim52/AppData/Local/Temp/ak5/tpl',{recursive:true,force:true})"
cmd //c dir C:\\Users\\kim52\\AppData\\Local\\Temp\\ak5
```

Expected: `tpl` 없음.

- [ ] **Step 5: 킷 쪽 기록 · 커밋**

킷 검증 기록 §7 에 커밋 ⓑ 해시, clone 검증 결과, 그리고 **릴리스 뒤 절차**(설치 → 검사 넷 → 잠금 파일 amend → push)를 적는다.

```bash
pnpm exec prettier --write docs/verification/2026-10-17-kit-toolchain-upgrade.md
git add docs/verification/2026-10-17-kit-toolchain-upgrade.md
git commit -m "docs: 템플릿 preset/admin 두 커밋 — 도구 상향 · 킷 0.5.0(tarball clone 검증)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ringside 에 고칠 것 목록

권장 티어: `sonnet`

**Files:**

- Create(저장소 밖): `AK5/ringside/`(내려받은 문서 — 새 빈 폴더), `AK5/tools/html2txt.mjs`
- Modify: 검증 기록 §8

**Interfaces:**

- Consumes: `packages/admin-server/src/auth/permission-slots.ts`(`ADMIN_PERMISSION_SLOTS` · `assertPermissionSlots`), 템플릿 CLAUDE.md 「킷 올리기」, 이 브랜치의 결정(스펙 §2-1)

- [ ] **Step 1: 내려받기(읽기만)**

```bash
node -e "require('fs').mkdirSync('C:/Users/kim52/AppData/Local/Temp/ak5/ringside',{recursive:true})"
cd /c/Users/kim52/AppData/Local/Temp/ak5/ringside
for f in CLAUDE.md docs/summary.md docs/ringside-dev-plan.html docs/ringside-development-plan.html; do gh api -H "Accept: application/vnd.github.raw" "repos/sinsungworks/ssworks-ringside/contents/$f" > "$(basename $f)"; done
gh api repos/sinsungworks/ssworks-ringside/commits --jq '.[0] | .sha[:7] + " " + .commit.committer.date'
```

마지막 줄(ringside 최신 커밋 · 날짜)을 §8 머리에 적는다.

- [ ] **Step 2: HTML → 텍스트**

`C:/Users/kim52/AppData/Local/Temp/ak5/tools/html2txt.mjs`:

```js
// HTML 을 줄 번호로 짚을 수 있는 텍스트로. 인자: 입력 · 출력
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
let h = readFileSync(input, 'utf8')
h = h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
h = h.replace(/<(h[1-6])[^>]*>/g, (_, t) => '\n\n' + '#'.repeat(Number(t[1])) + ' ')
h = h.replace(/<\/h[1-6]>/g, '\n').replace(/<(br|\/p|\/li|\/tr|\/div|\/pre)[^>]*>/g, '\n')
h = h
  .replace(/<li[^>]*>/g, '- ')
  .replace(/<\/t[dh]>/g, ' | ')
  .replace(/<[^>]+>/g, '')
h = h
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
h = h
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
writeFileSync(output, h)
```

```bash
for f in ringside-dev-plan ringside-development-plan; do node C:/Users/kim52/AppData/Local/Temp/ak5/tools/html2txt.mjs C:/Users/kim52/AppData/Local/Temp/ak5/ringside/$f.html C:/Users/kim52/AppData/Local/Temp/ak5/ringside/$f.txt; done
```

- [ ] **Step 3: 짚을 문장 찾기**

```bash
cd /c/Users/kim52/AppData/Local/Temp/ak5/ringside
grep -n -E "킷|admin-kit|admin-ui|admin-server|admin-shared|미발행|0\.2|0\.3|0\.4|Pinia|pinia|devtools|MariaDB|mariadb|11\.4|12\.3|Node 2|TypeScript|vitest|eslint|0001|0007|0008|teams\.enabled|TLS|템플릿|preset/admin|stage approve|2b|2c|2d|2e|2f|권한 카탈로그|definePermissions" CLAUDE.md summary.md ringside-dev-plan.txt ringside-development-plan.txt > hits.txt
wc -l hits.txt
```

`hits.txt` 의 각 줄을 앞뒤 문맥과 함께 읽는다(`sed -n '<n-3>,<n+3>p' <파일>`). 지금 킷(0.5.0 예정)과 어긋나는 문장만 고른다.

- [ ] **Step 4: 권한 카탈로그 초안(14.4)과 슬롯**

킷 `packages/admin-server/src/auth/permission-slots.ts` 의 `ADMIN_PERMISSION_SLOTS` 와 `assertPermissionSlots` 를 읽고 다음을 정한다. ① 모듈마다 기동에 필요한 슬롯은 무엇인가. ② 슬롯 둘이 같은 키를 가리켜도 되는가. 그다음 기획서 14.3 이 켜는 킷 모듈(운영자 · 역할 · 세션 · 감사 · IP 접근 제어 — 팀 · 약관을 켜는지는 문서에서 확인)과 14.4 초안의 키(`AUDIT_READ` · `ORG_USERS_WRITE` · `ORG_ROLES_WRITE` …)를 대조한다. 빠진 슬롯(예: `sessions.read` · `sessions.manage` · `users.read` · `roles.read` · `ipAccess.read` · `ipAccess.manage`)과 붙일 키 제안을 한 항목으로 적는다.

- [ ] **Step 5: 목록 쓰기**

검증 기록 §8 에 표로 쓴다. 먼저 낡은 가정 넷(스펙 §8 의 1 ~ 4), 그다음 이번 변경으로 생긴 것과 훑으며 찾은 것을 둔다:

```markdown
| #   | 파일 · 위치                                           | 지금 문장                                                   | 고칠 내용                                       | 근거                      |
| --- | ----------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------- |
| 1   | `docs/ringside-dev-plan.html` 14.1 표 admin-server 행 | "킷 Phase 2 진행 — 2a(기반·코어 스키마 7장)만 완료, 미발행" | "Phase 2 완료 — npm 0.5.0(세 패키지 같은 번호)" | 킷 CLAUDE.md 진행표 · npm |
```

위치는 절 번호 + 텍스트 줄 번호(`ringside-dev-plan.txt:<n>`)로 적는다. 같은 문장이 여러 문서에 있으면 한 행에 위치를 모은다.

- [ ] **Step 6: 커밋**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
pnpm exec prettier --write docs/verification/2026-10-17-kit-toolchain-upgrade.md
git add docs/verification/2026-10-17-kit-toolchain-upgrade.md
git commit -m "docs: ringside 에 고칠 것 목록 — 낡은 가정 넷 · 0.5.0 변경 · 권한 슬롯 대조

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 문서 갱신 · 정리 · 최종 확인

권장 티어: `sonnet`

**Files:**

- Modify: `docs/HANDOFF.md`, `CLAUDE.md`(진행표), `docs/01-phase0.md`(§8 끝 두 문단), 검증 기록 §0 · §9, 스펙 §13(구현 중 정정이 있었으면)

- [ ] **Step 1: HANDOFF**

`docs/HANDOFF.md`:

- 1행 `# HANDOFF — 2026-10-16` → `# HANDOFF — 2026-10-17`.
- 「지금 상태」 admin-ui 행 끝에 `· peer pinia ^4(0.5.0 예정 — 킷 상향 2026-10-17)` 를 더한다. 「검증」 행 끝에 한 문장: `킷 버전 상향(2026-10-17 — TS 6.0.3 · vitest 5 · eslint 10 · Pinia 4 peer · MariaDB 11.4 + 12.3)은 pnpm check · test:db 두 버전 · 발행물 diff · 드라이런 · 소비 앱 스모크 · 템플릿 clone 이 통과했다 — docs/verification/2026-10-17-kit-toolchain-upgrade.md.`
- 「다음 플랜」 행: **Phase 4**(ringside 실전 검증 → 1.0)를 다음으로 두고, 그 전에 사람이 할 일(아래 「발행 전에 사람이 해야 하는 것」)을 가리킨다.
- 「발행 전에 사람이 해야 하는 것」 맨 위에 스펙 §10 의 1 ~ 7 을 순서 목록으로 더한다. 기존 "admin-server npm 설정" 항목의 "다음 Version Packages PR" 을 "0.5.0 Version Packages PR" 로 고친다.
- 「킷 상향 준비 메모 (2026-10-17)」 제목을 「킷 상향 결과 (2026-10-17)」 로 바꾼다. 표의 "킷 현재" 열을 "결과" 로 바꾸고 행마다 결과를 적는다(pinia `^4.0.0` · devtools-api peer 아님 / TS 6.0.3 · vitest 5.0.5 · eslint 10.13 · typescript-eslint 8.71.2 / CI 11.4 + 12.3 · 로컬 `db:test:up:12.3` / Node 26 은 10/27 뒤 / 끝남). 아래 글머리는 ringside 목록(검증 기록 §8)을 가리키게 고친다.
- 「알려진 미확인·보류」 끝에 「킷 상향이 넘긴 것(2026-10-17)」을 더한다: Node 26(`.nvmrc` · CI · 로컬 검증 — 10/27 뒤) · `globals` 17 · `happy-dom` 21 · `@changesets/cli` 3 · 템플릿 pnpm 12 · 템플릿 ⓑ 잠금 파일 amend(릴리스 뒤) · 이 브랜치에서 찾은 남은 것(검증 기록 §9).

- [ ] **Step 2: CLAUDE.md 진행표**

`| **킷 버전 상향 — ringside 선행(Pinia 4 peer · TS 6 · vitest 5 · eslint 10 · MariaDB 12.3)** | **다음**(기한 2026-10-30) | HANDOFF 「킷 상향 준비 메모」 · ringside 기획서 15.7 |` 행을 다음으로 바꾼다:

```markdown
| 킷 버전 상향 — ringside 선행(Pinia 4 peer · TS 6 · vitest 5 · eslint 10 · MariaDB 11.4 + 12.3) | 완료(2026-10-17 — 0.5.0 발행 · 템플릿 push 는 사람) | 스펙 `docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md` · 플랜 `docs/superpowers/plans/2026-10-17-kit-toolchain-upgrade.md` · 검증 `docs/verification/2026-10-17-kit-toolchain-upgrade.md` |
```

`| Phase 4 — 첫 신규 프로젝트(ringside) 실전 검증 → 1.0 | 그다음 | …` 의 `그다음` 을 `**다음**` 으로 바꾼다.

- [ ] **Step 3: docs/01-phase0.md §8**

§8 끝의 `다음: 킷 버전 상향(…) → Phase 4 — …` 문단을 두 문단으로 바꾼다:

```markdown
킷 버전 상향(2026-10-17) 완료 — admin-ui peer `pinia ^4.0.0`(devtools-api 는 peer 아님), 저장소 도구 TypeScript 6.0.3 · Vitest 5 · ESLint 10 · typescript-eslint 8.71, 실 DB 테스트 MariaDB 11.4 + 12.3 매트릭스, changeset 하나(0.5.0 — admin-ui minor · 나머지 patch). 템플릿 `preset/admin` 은 도구 상향 커밋과 킷 0.5.0 커밋(잠금 파일은 릴리스 뒤)을 로컬에 두었다(스펙 `docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md` · 플랜 `docs/superpowers/plans/2026-10-17-kit-toolchain-upgrade.md` · 검증 `docs/verification/2026-10-17-kit-toolchain-upgrade.md`). 발행 · push 는 사람이 한다.

다음: Phase 4 — ringside 로 실전 검증 후 A 패키지 1.0 태깅(`docs/00-admin-common-review.md` §4, HANDOFF "다음 플랜"). Node 26 은 26 LTS(10/27) 뒤 별도.
```

- [ ] **Step 4: 정리**

```bash
cd /c/Users/kim52/workspace/ssworks-admin-kit
pnpm db:test:down:12.3
docker ps -a --filter name=admin-kit-test-db --format "{{.Names}} {{.Image}} {{.Status}}"
docker exec admin-kit-test-db mariadb -uroot -padmin-kit-test -N -e "show databases"
```

Expected: `admin-kit-test-db mariadb:11.4 Up …` 한 줄만 남는다. 데이터베이스 목록은 검증 기록 §1 의 것과 같다. 남은 테스트 DB 가 있으면 이름을 확인하고(`admin_kit_test_` 류 — 이 작업이 만든 것만) `drop database` 한다.

```bash
node -e "require('fs').rmSync('C:/Users/kim52/AppData/Local/Temp/ak5',{recursive:true,force:true})"
node -e "console.log(require('fs').existsSync('C:/Users/kim52/AppData/Local/Temp/ak5') ? 'ak5 남음' : 'ak5 없음')"
```

Expected: `ak5 없음`. Glob 로 저장소 루트의 `NUL` 을 찾는다 — 없어야 한다(있으면 `/dev/null` 리디렉션의 흔적이니 지우고 어느 명령이었는지 기록한다). 이미지 `mariadb:12.3` 은 남긴다.

- [ ] **Step 5: 검증 기록 §0 · §9 · 스펙 §13**

- §0 요약: 결정 · 바뀐 버전 · 통과한 검증(V1 ~ V7 한 줄씩) · 고친 결함(없으면 "없음") · 사람이 할 일(스펙 §10)을 적는다.
- §9: 지운 것(12.3 컨테이너 · `AK5` · worktree), 남긴 것(이미지 · 기존 11.4 컨테이너), 넘긴 것.
- 구현 중 사실이 스펙과 달랐으면 스펙 §13 에 한 줄씩 적는다.

- [ ] **Step 6: 커밋**

```bash
pnpm exec prettier --write docs/HANDOFF.md CLAUDE.md docs/01-phase0.md docs/verification/2026-10-17-kit-toolchain-upgrade.md docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md
pnpm exec prettier --write docs/HANDOFF.md CLAUDE.md docs/01-phase0.md docs/verification/2026-10-17-kit-toolchain-upgrade.md docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md
pnpm format:check
git add docs/HANDOFF.md CLAUDE.md docs/01-phase0.md docs/verification/2026-10-17-kit-toolchain-upgrade.md docs/superpowers/specs/2026-10-17-kit-toolchain-upgrade-design.md
git commit -m "docs: 킷 버전 상향 마무리 — HANDOFF · 진행표 · §8 · 검증 기록 요약 · 사람이 할 일

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(prettier 를 두 번 돌린다 — 메모리: 긴 마크다운은 한 번에 수렴하지 않는다.)

- [ ] **Step 7: 최종 확인(Review Focus 5)**

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm format:check
pnpm changeset status --verbose
git status --short
git log --oneline main..HEAD
```

Expected: 모두 초록. `changeset status` 는 0.5.0 셋을 보인다. `git status` 는 ` M .claude/settings.json` 뿐이다. 실패하면 고친 뒤 커밋하고 이 단계를 다시 돈다.

---

## 끝난 뒤

- 브랜치 전체 리뷰(`opus`) — superpowers:requesting-code-review. 초점: peer 범위 · changeset 문장 · CI 매트릭스 문법 · 테스트를 고친 곳의 의미 보존 · 템플릿 두 커밋.
- 마지막 보고에 담을 것: ringside 목록(검증 기록 §8), 사람이 할 일(스펙 §10). 🔴 **Version Packages PR 머지 전 admin-server Trusted Publisher 등록**은 따로 짚는다.
