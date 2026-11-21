# admin-kit IP 접근 제어 — 확장 범위 설계

작성일: 2026-11-21 · 상태: 확정(구현 전) · 요청: `C:\workspace\ssworks-atlas-launcher-admin\docs\superpowers\specs\2026-11-21-admin-kit-ip-extra-scope-request.md`(출고 관리 서비스 — 읽기만) · 선행: 2f-1 스펙 `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md`(층 · 평가 · 잔존 · 자기 잠금 · 미리보기), 2f-2b 스펙 `docs/superpowers/specs/2026-10-15-admin-server-publish-prep-design.md` §5-5(IP 파서), 3g 스펙 `docs/superpowers/specs/2026-10-18-admin-ui-audit-ip-design.md`(IP 화면), 3i 스펙 `docs/superpowers/specs/2026-10-20-admin-kit-ringside-feedback-2-design.md`(층 목록 `scopes`), 2g(전권 전용 `ipAccess.manage`)

이 문서는 IP 접근 제어에 **확장 범위**(관리자 밖 주체에 거는 IP 규칙)를 더하는 범위만 쓴다. 코어 층(사용자 > 팀 > 전체)의 평가 · 잔존 · 자기 잠금 · 미리보기는 2f-1 스펙이 그대로 유효하고, 이 문서가 바꾸는 줄은 §8 에 모았다.

## 1. 목표

첫 소비자는 노트북 출고 관리 서비스(`ssworks-atlas-launcher-admin`)다. 출고 USB 토큰으로 부르는 노트북 API(`@Public()` + 쓰는 쪽 가드)를 출고 장소의 공인 IP 로 제한한다. 사용자 결정(2026-11-21, 요청 문서 §1)은 이 제한을 프로젝트 표가 아니라 **킷 IP 접근 제어의 범위 종류**로 두는 것이다 — IP 규칙 화면 하나에서 「전체 · 팀 · 사용자」 와 나란히 「출고 토큰」 을 고른다.

킷이 내는 것은 일반 장치다 — 「관리자 밖 주체(장치 토큰 · 외부 API 키 …)에 거는 IP 규칙」. 출고 토큰이라는 도메인은 훅과 어댑터로만 들어온다(A/B/X 의 A — 장치, 토큰 표는 X).

브랜치 `feat/ip-extra-scopes`. 끝 상태:

- **서버 옵션** `ipAccess.extraScopes` — 범위 이름 · 범위 전체 층 켜고 끄기 · 대상 훅(잠금 읽기 · 이름). 없으면 지금과 완전히 같다.
- **기존 라우트** `/admin/ip-access` 의 목록 · 만들기 · 수정 · 삭제가 확장 범위를 받는다 — `revision` · 재인증 · 감사 · `parseCidr` 그대로, 슬롯도 그대로(`ipAccess.read` · `ipAccess.manage`).
- **두 층 판정** admin-shared `evaluateScopedIpAccess` — 대상 층 → 범위 전체 층 → 거부. 코어 규칙과 서로 섞이지 않는다(양방향).
- **쓰는 쪽 읽기** `AdminIpExtraScopeService` — `allows` · `rulesOf` · `countRulesOf` · `clientIpOf`.
- **화면** `useIpAccessRules` 의 `extraScopes` · 한 범위 모드 `focus` · 미리 채운 `openCreate(prefill)`.
- **판** 세 패키지 0.15.0(minor), admin-server · admin-ui 의 admin-shared peer 하한 0.15.0.

쓰는 쪽이 할 일: 서버 옵션 · 화면 옵션 · 노트북 API 가드(§10). 장 스텁은 늘지 않는다.

## 2. 결정

### 2-1. 경계 결정 (2026-11-21, 브레인스토밍)

| #            | 확정                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 권한(R7)   | **R7 을 하지 않는다**(사용자 결정). IP 규칙 화면과 `/admin/ip-access` 는 지금처럼 `ipAccess.read` · `ipAccess.manage`(전권 전용) 보유자만 쓴다. 출고 담당자는 IP 를 직접 추가하지 않는다 — 출고장 IP 추가가 필요하면 IP 규칙 권한자에게 요청한다. 그래서 라우트 가드 · 권한 슬롯 · 전권 전용 검사는 바뀌지 않는다. 범위별 권한 키 옵션도 두지 않는다(적으면 기동에서 멈춘다) |
| ② 권장 항목  | 나머지 권장은 모두 한다 — R2 범위 전체 층 켜고 끄기, R6-1 한 범위 모드, R8 규칙 수 조회                                                                                                                                                                                                                                                                                      |
| ③ 설계 네 절 | ① 공유 계약 · 판정, ② 서버, ③ 화면, ④ 시험 · 기록 · 판 · 인계를 차례로 승인받았다                                                                                                                                                                                                                                                                                            |

### 2-2. 공통 결정

1. **하위 호환(R1).** `ipAccess.extraScopes` 가 없거나 비었으면 동작 · 응답 · SQL 의 결과가 지금과 같다. 새 장이 없다 — `scope_type varchar(16)` 와 인덱스 `idxIpAccessRulesScope(scopeType, scopeRefNo)` 가 장 0012 에 이미 있다. 타입은 `scopeType` 을 `string` 으로 넓히는 것뿐이고, 지금 소비자 둘(sseng-home · ringside)과 템플릿은 그 칸으로 분기하지 않는다(2026-11-21 확인).
2. **R3 분리는 두 겹이다.** 관리자 판정 쪽은 ⓐ 읽는 쿼리가 코어 셋만 고르고(§4-5) ⓑ `evaluateIpAccess` 가 모르는 범위를 무시한다. 확장 판정 쪽은 ⓐ 읽는 쿼리가 그 범위만 고르고 ⓑ `evaluateScopedIpAccess` 가 그 범위 행만 보며 코어 이름이면 던진다.
3. **잠금 규칙은 코어에 그대로.** 코어 범위 쓰기는 2f-1 §5-3 그대로(잔존 가드 행이 첫 문장). `ipAccessRules` 를 잠그는 곳은 여전히 IP 쓰기의 대상 행뿐이다.
4. **범위 밖**: R7(①), 확장 범위의 미리보기(관리자를 잠글 수 없다 — 할 것이 없다), 쓰는 쪽 연쇄 검사(토큰 삭제 409 등 — 킷은 `countRulesOf` 만), 토큰 표 · 발급 · 출고 시도 기록 · 노트북 API 가드 · `ERR_SHIPPING_*`(요청 문서 §5).

### 2-3. 설계 결정

| #   | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | **이름 규칙** — `IP_EXTRA_SCOPE_TYPE_PATTERN = /^[a-z][A-Za-z0-9]{0,15}$/`(영소문자로 시작 · 영숫자 · 1~16자 — 열 폭 16 · `ascii_bin`). 코어 이름과 **대소문자 무시**로 겹치면 안 된다(`Global` 금지). 서버 기동 · 화면 setup 이 같은 함수 `isIpExtraScopeTypeName()` 을 쓴다                                                                                                                                                            |
| X2  | **갈래** — 범위 종류는 두 갈래다: 코어(`global` · `team` · `user`)와 확장 범위 하나하나. 수정으로 `scopeType` 을 바꾸는 것은 **코어 안에서만** 된다. 코어↔확장 · 확장끼리는 400 `issues[scopeType]`(지우고 새로 만든다). 갈래마다 잠금 · 셈 규칙이 달라 한 쓰기에 섞지 않는다                                                                                                                                                            |
| X3  | **확장 쓰기는 잔존 밖** — 잔존 가드 행 · 전권자 셈 · 자기 잠금 판정을 하지 않는다(확장 규칙은 관리자 판정에 쓰이지 않으므로 바꿀 수 있는 것이 없다 — R3a). 순서는 대상 규칙 행 `FOR UPDATE`(수정 · 삭제) → 쓰는 쪽 `target.lock(trx, refNo)` → 쓰기. `LockedWrite` 주석의 "잔존이 필요 없는 갈래는 `steps.write(await steps.lock())`" 꼴                                                                                                 |
| X4  | **갈래 고르기** — 만들기는 본문의 `scopeType` 으로, 수정 · 삭제는 트랜잭션 **밖에서** 대상 규칙의 `scopeType` 을 비잠금으로 먼저 읽어 고른다. 대상이 없으면 코어 갈래로 보낸다(지금처럼 재인증 → 트랜잭션 안 `lockRule` 404 — 순서가 그대로). 트랜잭션 안에서 잠근 행의 갈래가 먼저 읽은 것과 다르면 409 `ERR_COMMON_REVISION_CONFLICT`(X2 때문에 일어날 수 없지만 방어한다)                                                             |
| X5  | **대상 훅** — 확장 범위마다 `target.lock(trx, refNo) → Promise<boolean>`(쓰기 트랜잭션 안 · 대상 행 `FOR UPDATE` · 있으면 true)와 `target.names(db, refNos) → Promise<ReadonlyMap<bigint, string>>`(목록 · 응답 · 없는 번호는 뺀다). 요청 문서의 `exists` 는 `lock` 으로 합쳤다 — 있는지 확인과 잠금 읽기가 같은 쿼리다. 🔴 훅은 **메서드 꼴**로 선언한다 — 쓰는 쪽이 `Transaction<Database>` 로 적어도 들어간다(메서드 매개변수 이변성) |
| X6  | **잠금 순서** — 킷: 규칙 행 → 쓰는 쪽 대상 행. 🔴 쓰는 쪽은 자기 트랜잭션에서 `ipAccessRules` 행을 잠그지 않는다(토큰 행 → 규칙 행 순서가 되어 교착). 규칙 수는 `countRulesOf` 로 비잠금으로 센다                                                                                                                                                                                                                                        |
| X7  | **범위 전체 층(R2)** — `wholeScope`(기본 true). 꺼지면 ⓐ `scopeRefNo: null` 만들기 · 수정이 400 `issues[scopeRefNo]` ⓑ 서버 읽기(`rulesOf` · `allows`)가 그 범위의 NULL 행을 뺀다(판정에서 빠진다) ⓒ 이미 있는 NULL 행은 목록에 남고 지울 수 있다. 공유 판정 함수는 이 설정을 모른다 — 읽기가 거른 규칙을 받는다                                                                                                                         |
| X8  | **등록이 빠진 범위의 행**(옵션에서 지운 범위) — 목록에 보이고(`scopeName: null`) 삭제만 된다. 수정은 400 `issues[scopeType]`. 판정에는 어디서도 쓰이지 않는다                                                                                                                                                                                                                                                                            |
| X9  | **미리보기는 코어만** — 쿼리 스키마는 코어 셋 그대로라 확장 `scopeType` 은 400. 미리보기의 규칙 읽기도 코어 셋만이라 확장 규칙 번호의 `op=update` · `delete` 는 404. 화면은 확장 규칙에 미리보기를 부르지 않는다(§5-4)                                                                                                                                                                                                                   |
| X10 | **쓰는 쪽 읽기는 서비스** — `AdminIpExtraScopeService`(전역 IP 모듈이 낸다). 등록되지 않은 범위 이름을 받으면 `Error` 를 던진다(설정 오류 — 쓰는 쪽 가드가 500 → 막힘, fail-closed). 쓰는 쪽이 `ipAccessRules` 를 직접 질의하는 데 기대지 않게 한다(R4b)                                                                                                                                                                                 |
| X11 | **화면 선택지 키** — 확장 범위마다 선택지가 둘이다: 대상 하나(키 = 범위 이름)와 범위 전체(키 = `<이름>:*`). 폼의 `scopeType` 은 이 키이고, 본문을 만들 때 `{ scopeType: <이름>, scopeRefNo: null }` 로 푼다. `:*` 는 서버 이름에 들어갈 수 없어 대상 칸에 친 글자와 섞이지 않는다                                                                                                                                                        |
| X12 | **한 범위 모드는 값** — `focus` 는 게터가 아니라 setup 때의 값이다. 다른 대상을 보이려면 쓰는 쪽이 `:key` 로 다시 만든다 — 편집 중에 대상이 바뀌는 경합을 만들지 않는다                                                                                                                                                                                                                                                                  |

## 3. 공유 계약 (admin-shared `ip-access.ts`)

### 3-1. 이름 · 갈래

```ts
export const IP_EXTRA_SCOPE_TYPE_PATTERN = /^[a-z][A-Za-z0-9]{0,15}$/

/** 코어 셋(global · team · user)인가 */
export function isCoreIpScopeType(type: string): type is IpScopeType

/** 확장 범위 이름으로 쓸 수 있는가 — 패턴 ∧ 코어 이름과 대소문자 무시로 다름(X1) */
export function isIpExtraScopeTypeName(name: string): boolean
```

`IpScopeType` 은 지금처럼 코어 셋이다. `IP_SCOPE_TYPES` · `ipScopeTypeSchema` · `ipScopeProblem` · `isValidIpScope` · `IpScope` 도 코어 뜻 그대로다.

### 3-2. 타입 넓히기

| 자리                                                             | 지금          | 바뀐 뒤                                                                             |
| ---------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `IpRule.scopeType`                                               | `IpScopeType` | `string` — 관리자 평가는 모르는 값을 무시한다(지금 성질)                            |
| `adminIpRuleSchema.scopeType`(→ `AdminIpRule`)                   | 코어 enum     | `ipRuleScopeTypeSchema` — 코어 셋 ∪ 이름 규칙(X1)                                   |
| `adminIpRuleCreateSchema` · `adminIpRuleUpdateSchema` 의 같은 칸 | 코어 enum     | `ipRuleScopeTypeSchema` — 서버 파이프가 다시 "코어 ∪ 등록된 이름" 으로 좁힌다(§4-2) |
| 미리보기 쿼리 · 응답 층(`layerBefore` · `layerAfter`)            | 코어 enum     | 그대로(X9)                                                                          |

`ipRuleScopeTypeSchema` 의 오류 문구는 `IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid`('범위 이름이 형식에 맞지 않습니다.' — 화면 · 서버 공용 기본 글자)다.

### 3-3. 확장 판정 (R2 · R3b · R4a)

```ts
export interface IpScopedSubject {
  /** 확장 범위 이름 — 🔴 코어 이름이면 던진다 */
  scopeType: string
  /** 그 주체의 번호(예: 출고 토큰 번호) */
  scopeRefNo: bigint
}

/** 이 주소로 이 확장 범위 주체가 들어올 수 있는가 */
export function evaluateScopedIpAccess(
  ip: string | null,
  rules: readonly IpRule[],
  subject: IpScopedSubject,
): boolean
```

1. `ip === null` → `false`.
2. `isCoreIpScopeType(subject.scopeType)` → `throw new Error(...)`(R3b — 코어 규칙이 확장 판정에 들어올 길을 막는다. 프로그래밍 오류).
3. `rule.scopeType === subject.scopeType` 행만 본다 — 코어 행(장 0012 의 `global` 시드 `0.0.0.0/0` · `::/0` 포함)과 다른 확장 범위 행은 보지 않는다.
4. 대상 층 = `scopeRefNo === subject.scopeRefNo` 행. 하나라도 있으면 그것만.
5. 없으면 범위 전체 층 = `scopeRefNo === null` 행.
6. 둘 다 없으면 `false`. 고른 층에서 `ipInCidr` 하나라도 참이면 `true`(파서는 `parseCidr` 하나).

🔴 가장 가까운 층 하나 — 그 토큰에 규칙이 하나라도 있으면 범위 전체 규칙은 보지 않는다(코어와 같은 원리). 토큰 규칙 한 줄이 「모든 출고 USB」 허용을 그 토큰에 대해 지운다.

## 4. 서버 (admin-server)

### 4-1. 옵션 (R1 · R2 · R5)

`AdminServerOptions.ipAccess?: AdminIpAccessOptions`(`ip-access/options.ts` — IP 모듈의 첫 옵션):

```ts
export interface AdminIpAccessOptions {
  /** 관리자 밖 주체에 거는 IP 규칙 범위. 없거나 비면 지금과 같다 */
  extraScopes?: readonly AdminIpExtraScope[]
}

export interface AdminIpExtraScope<DB extends AdminDatabase = AdminDatabase> {
  /** scope_type 값 — 영소문자로 시작하는 영숫자 1~16자 · 코어 이름(global · team · user)과 대소문자 무시로 다름 */
  type: string
  /** 기본 true — scopeRefNo NULL(범위 전체) 규칙을 받고 판정에 쓴다 */
  wholeScope?: boolean
  target: AdminIpScopeTarget<DB>
}

export interface AdminIpScopeTarget<DB extends AdminDatabase = AdminDatabase> {
  /** 🔴 쓰기 트랜잭션 안 — 대상 행을 FOR UPDATE 로 잠그고, 있으면 true. 메서드 꼴(X5) */
  lock(trx: Transaction<DB>, refNo: bigint): Promise<boolean>
  /** 목록 · 응답의 대상 이름. 없는 번호는 빼고 돌려준다 → scopeName null */
  names(db: Kysely<DB>, refNos: readonly bigint[]): Promise<ReadonlyMap<bigint, string>>
}
```

기동에서 멈춘다(문제를 모아 한 번에 — 업로드 옵션과 같은 방식): `ipAccess` 가 객체가 아님 · 모르는 키 · `extraScopes` 가 배열이 아님 · 항목이 객체가 아님 · 항목의 모르는 키(`permissions` 포함 — ①) · 이름 규칙 밖(X1) · 이름 겹침 · `wholeScope` 가 boolean 아님 · `target.lock` · `target.names` 가 함수 아님. 해석 결과 `ResolvedIpAccessConfig.extraScopes: ReadonlyMap<string, ResolvedIpExtraScope>`(`{ type, wholeScope, target }` · 얼린 값).

### 4-2. 본문 파이프

- **만들기**: `scopeType` 이 코어 ∪ 등록된 이름이 아니면 400 `issues[scopeType]`(`IP_ACCESS_MESSAGES.unknownScopeType`). 코어면 지금처럼 `ipScopeProblem`. 확장이면 `scopeRefNo === null ∧ !wholeScope` → 400 `issues[scopeRefNo]`(`wholeScopeOff`).
- **수정**: `scopeType` 이 있으면 같은 등록 검사. 범위 불변식 · 갈래 검사는 병합 결과를 보는 서비스 몫(지금처럼).
- `extraScopes` 가 없으면 파이프가 받는 이름은 코어 셋뿐 — 모르는 `scopeType` 은 지금처럼 400 `ERR_COMMON_VALIDATION` · `issues[scopeType]` 이다. 바뀌는 것은 그 칸 오류의 문구뿐이다(zod enum 기본 글자 → `unknownScopeType`).

### 4-3. 쓰기 (`AdminIpAccessService`)

| 단계             | 코어 갈래(지금 그대로)                                  | 확장 갈래                                                                                   |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 갈래 고르기      | 본문 · 대상 규칙의 `scopeType`(X4)                      | 같음                                                                                        |
| 갈래 검사(수정)  | 본문 `scopeType` 이 확장이면 400 `issues[scopeType]`    | 본문 `scopeType` 이 대상과 다르면 400 `issues[scopeType]`(`scopeTypeLocked`) — 재인증 앞    |
| 재인증           | 트랜잭션 밖                                             | 같음                                                                                        |
| 트랜잭션 첫 문장 | 잔존 가드 행                                            | 대상 규칙 행 `FOR UPDATE`(수정 · 삭제) — 만들기는 `target.lock`(범위 전체면 잠글 것이 없다) |
| 잠금 단계        | 대상 규칙 → `revision` → 병합 불변식 → 팀 · 사용자 행   | 대상 규칙 → 갈래 재확인(X4) → `revision` → 등록 확인(X8) → `wholeScope`(X7) → `target.lock` |
| 대상 없음        | 400 `issues[scopeRefNo]`(`noScopeTeam` · `noScopeUser`) | 400 `issues[scopeRefNo]`(`noScopeTarget`)                                                   |
| 쓰기 뒤          | 자기 잠금 판정 · 후 셈                                  | 없음(X3)                                                                                    |
| 응답 · 감사      | `{ item }` · `setting.ipAccess.*` · diff 네 칸          | 같음 — `item.scopeName` 은 `target.names(trx, [refNo])`                                     |

삭제는 갈래 검사 · 등록 확인 없이 된다(X8 — 등록이 빠진 범위의 행도 지운다).

### 4-4. 목록 (R6a · R8)

`GET /admin/ip-access` — 행 전부(정렬 지금 그대로: `scopeType` 문자 순 → `ruleNo`). 확장 행은 범위마다 그 범위의 `scopeRefNo` 를 모아 `target.names(db, refNos)` 를 **한 번** 부르고, 돌려받은 이름을 `scopeName` 에 싣는다. 받지 못한 번호 · NULL 대상 · 등록이 빠진 범위는 `scopeName: null`. `scopeUserId` 는 확장 행에서 늘 `null`. 훅이 던지면 목록이 500 이다(숨기지 않는다).

### 4-5. 관리자 판정과 떼어 놓기 (R3a)

- `ipRuleSetQuery`(정책 · 잔존 셈 · 자기 잠금이 읽는다)와 `identifiedRulesQuery`(미리보기)에 `where scopeType in ('global', 'team', 'user')` 를 더한다 — 관리자 판정이 확장 행을 **읽지 않는다**.
- `evaluateIpAccess` · `applicableIpLayer` 는 그대로(모르는 범위 무시 — 둘째 겹).
- 정책 진단(`noGlobalRule`)은 그대로다.

### 4-6. 쓰는 쪽 읽기 (`AdminIpExtraScopeService` — R4b · R8)

```ts
@Injectable()
export class AdminIpExtraScopeService {
  /** 요청자 주소 — 관리자 판정 · 세션 · 감사와 같은 출처(코어 clientIp) */
  clientIpOf(req: Request): string | null
  /** 그 범위의 규칙(scopeType · scopeRefNo · cidr). wholeScope 가 꺼졌으면 NULL 행을 뺀다. 비잠금 · 캐시 없음 */
  rulesOf(scopeType: string): Promise<IpRule[]>
  /** 이 주소로 이 주체가 들어올 수 있는가 — 그 대상 · 범위 전체 행만 읽어 evaluateScopedIpAccess */
  allows(scopeType: string, scopeRefNo: bigint, clientIp: string | null): Promise<boolean>
  /** 이 대상을 가리키는 규칙 수. db 에 쓰는 쪽 트랜잭션을 넘길 수 있다 — 🔴 대상 행을 잠근 뒤 첫 비잠금 읽기로 */
  countRulesOf(scopeType: string, scopeRefNo: bigint, db?: Kysely<AdminDatabase>): Promise<number>
}
```

- 등록되지 않은 `scopeType` 은 `Error`(X10). 코어 이름도 등록되지 않은 이름이다.
- `allows` 의 SQL: `scopeType = ? AND (scopeRefNo = ? OR scopeRefNo IS NULL)`(범위 전체가 꺼졌으면 `scopeRefNo = ?` 만) — 인덱스 `idxIpAccessRulesScope`. 매 요청 DB 왕복 하나(요청 문서 R4 — 설치 한 번에 세 번 정도).
- `countRulesOf` 는 `wholeScope` 와 무관하게 그 대상 번호의 행만 센다.
- IP 모듈이 `providers` · `exports` 에 더한다(전역). index 에 서비스와 옵션 타입 셋(`AdminIpAccessOptions` · `AdminIpExtraScope` · `AdminIpScopeTarget`)을 낸다.

### 4-7. 오류 문구 (`IP_ACCESS_MESSAGES` 에 더함 — `messages` 덮어쓰기 대상)

| 키                 | 기본 글자                                                       |
| ------------------ | --------------------------------------------------------------- |
| `unknownScopeType` | `등록되지 않은 범위입니다.`                                     |
| `scopeTypeLocked`  | `이 규칙의 범위 종류는 바꿀 수 없습니다. 지우고 새로 만드세요.` |
| `wholeScopeOff`    | `이 범위의 규칙은 대상을 골라야 합니다.`                        |
| `noScopeTarget`    | `규칙이 가리킬 대상을 찾을 수 없습니다.`                        |

🔴 기본 글자는 다른 키와 겹치지 않게 쓴다(2g — 같은 글자는 함께 바뀐다).

## 5. 화면 (admin-ui)

### 5-1. 옵션 (R6a)

```ts
export interface IpTargetOption {
  refNo: bigint
  name: string
}

export interface IpExtraScopeOption {
  /** 서버 옵션 ipAccess.extraScopes[].type 과 같은 이름 — 쓰는 쪽이 한 상수에서 만든다 */
  type: string
  /** 범위 이름(예: '출고 토큰') — 선택지 · 목록 · 관문 문구 */
  label: string
  /** 범위 전체 이름(예: '모든 출고 USB'). 없으면 범위 전체를 고를 수 없다 — 서버 wholeScope 와 맞춘다 */
  wholeLabel?: string
  /** 대상 검색 → 후보. 없으면 번호 칸 */
  search?: (keyword: string) => Promise<readonly IpTargetOption[]>
  /** 게터 — 기본 () => true. 거짓이면 번호 칸 + 이유 */
  canSearch?: () => boolean
}

// UseIpAccessRulesOptions 에 더함
extraScopes?: readonly IpExtraScopeOption[]
focus?: IpRuleFocus
```

setup 에서 던진다: `type` 이 이름 규칙 밖 · 코어 이름 · 범위끼리 겹침 · `focus.scopeType` 이 `extraScopes` 에 없음.

### 5-2. 범위 선택 · 대상 칸 · 목록

- 선택지 순서: 코어 층(`scopes`, 평가 순서) 뒤에 `extraScopes` 순서. 확장 범위마다 「`label`」(대상 하나)과 「`wholeLabel`」(범위 전체 — 있을 때)(X11).
- 수정 중에는 같은 갈래의 선택지만 — 코어 규칙이면 `scopes` 의 코어 층(목록 밖 지금 층은 3i S2 그대로), 확장 규칙이면 그 범위의 둘(X2). 만들기에는 전부.
- 대상 칸: 확장 대상 하나면 `RemoteSearchField`(사용자 칸과 같은 부품 — 후보 글자 = `name`), `search` 가 없거나 `canSearch` 거짓이면 번호 칸 + 이유. 범위 전체 · 전체 층은 대상 칸이 없다.
- 목록 범위 칸: 대상 하나 `출고 토큰 · 작업대 1`(아래 줄 `#12`), 범위 전체 `모든 출고 USB`, 이름 `null` 이면 `출고 토큰 #12` + 「대상 없음 — 아무에게도 걸리지 않음」(지금 `deadTarget`). 화면이 모르는 범위(옵션에 없는 이름)는 이름 그대로 보이고 **삭제만** 된다(수정 버튼 비활성 — X8).
- 권한은 지금 그대로 — `canManage`(= `ipAccess.manage`) 하나가 만들기 · 수정 · 삭제를 가른다(①).

### 5-3. 한 범위 모드 (R6-1)

```ts
export interface IpRuleFocus {
  /** extraScopes 에 있는 확장 범위 */
  scopeType: string
  /** 주면 그 대상의 규칙 + 범위 전체 규칙만, 안 주면 그 범위 전부 */
  scopeRefNo?: bigint
}
```

- 목록은 화면에서 거른다(서버 목록 그대로 — 어댑터 변화 없음).
- 선택지는 그 범위의 둘(또는 하나). `scopeRefNo` 를 주면 대상 칸이 그 대상으로 고정된다(바꿀 수 없음 — 글자는 `openCreate` 의 `scopeName` · 목록의 `scopeName` · 없으면 `#번호`).
- 접속 상태와 변경 영향 카드를 그리지 않는다(바인딩 `showPreviewCard: false`) — 관리자 접속과 무관하다.
- 값이다(X12).

### 5-4. 미리보기 (R6b)

- `IpPreviewTarget` 에 `{ op: 'unrelated' }`, `IpPreviewState` 에 `'unrelated'` 를 더한다. 편집 · 삭제 대상이 확장 범위(등록이 빠진 범위 포함)면 이 상태이고 서버 미리보기를 **부르지 않는다**.
- 카드: 통과 줄 · 기준 줄을 그리지 않고 영향 줄 = `previewUnrelated`('이 규칙은 관리자 접속과 무관합니다 — 이 변경으로 잠기는 관리자는 없습니다.'). `extraScopes` 가 있으면 힌트에 `hintExtraScopes`('확장 범위 규칙(출고 토큰 등)은 관리자 접속 판정에 쓰이지 않고, 관리자 규칙(사용자 · 팀 · 전체)도 확장 범위 판정에 쓰이지 않습니다.' — 기본 글자는 범위 이름을 모르므로 일반어로)를 더한다.
- 관문 창: 영향 줄 = `gateImpactUnrelated`. 「미리보기 없이 저장했다」(`savedWithoutPreview`) 경고를 띄우지 않는다. 전체 허용 경고(`removesGlobalAllow`)는 코어 `global` 규칙에만 — 확장 범위의 `0.0.0.0/0` 은 관리자를 잠그지 않는다.

### 5-5. 다른 화면에서 만들기 (R6c)

```ts
export interface IpRulePrefill {
  /** 코어 층 또는 확장 범위 이름 */
  scopeType: string
  /** null = 전체(코어) · 범위 전체(확장) */
  scopeRefNo: bigint | null
  /** 대상 칸 · 관문 문구에 보일 이름 */
  scopeName?: string
  cidr?: string
  description?: string
}

openCreate: (prefill?: IpRulePrefill) => Promise<boolean>
```

- 미리 채운 편집 패널을 연다 → 저장 → 확인 또는 재인증 창 → 409(자기 잠금 · 잔존) · `revision` · 400 칸 오류 처리 — 지금 흐름 그대로.
- 미리 채운 값은 고친 값이다(닫을 때 버릴지 묻는다). 열 때 고친 값이 있으면 먼저 묻는 것도 지금 그대로.
- `false` 를 돌려준다: `canManage` 거짓 · 진행 중 · 이 화면이 고를 수 없는 선택지(코어면 `scopes` 밖 · `global` 에 대상 · `team`/`user` 에 대상 없음, 확장이면 `extraScopes` 밖 · `wholeLabel` 없는 범위 전체, `focus` 밖).
- 바인딩 `onOpenCreate` 는 지금처럼 인자 없이 부른다.

### 5-6. 바뀌는 공개 모양

| 자리                       | 변화                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IpRuleForm.scopeType`     | `IpScopeType` → `string`(선택지 키 — X11)                                                                                                                                                                                      |
| `IpPreviewState`           | `'unrelated'` 추가                                                                                                                                                                                                             |
| `IpAccessMessages`         | 키 추가 — 미리보기 · 관문 · 힌트(§5-4)와 대상 칸(`targetSearchHint` · `targetSearchEmpty` · `targetSearchFailed` · `targetNoPermissionHint` · `targetNumberLabel` 류). 기본 문구에 섞여 있어 `messages` 덮어쓰기는 그대로 된다 |
| `UseIpAccessRulesOptions`  | `extraScopes` · `focus` 추가                                                                                                                                                                                                   |
| `IpAccessRules.openCreate` | 선택 인자 `prefill`                                                                                                                                                                                                            |
| `IpAccessManagerBindings`  | 확장 대상 칸 바인딩 · `showPreviewCard` · 행 수정 가능 판정 추가 — `v-bind` 로 넘기므로 쓰는 쪽 변화 없음                                                                                                                      |
| 새 export                  | 타입 `IpExtraScopeOption` · `IpTargetOption` · `IpRuleFocus` · `IpRulePrefill`                                                                                                                                                 |

## 6. 시험 (R9)

| 층                      | 잰다                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin-shared 단위       | 이름 규칙(경계 1 · 16 · 17자, 대문자 시작, 숫자 시작, `Global` · `USER`) · `isCoreIpScopeType` · 두 층 판정(대상 층 우선 · 대상 층이 있으면 범위 전체를 안 봄 · 범위 전체 · 둘 다 없음 · `null` 주소) · 코어 이름이면 던짐 · `global` 시드와 다른 확장 범위 행 무시(R3b) · `evaluateIpAccess` · `applicableIpLayer` 가 확장 행을 무시(R3a) · `ipRuleScopeTypeSchema` 가 받는 · 거부하는 값                                                                                                                                                   |
| admin-server 단위       | 옵션 해석(멈추는 경우 하나하나 · 문제 모아 던지기 · 기본 `wholeScope`) · `ipRuleSetQuery` · `identifiedRulesQuery` 컴파일 SQL 의 코어 조건 · 파이프가 등록된 이름만 받음 · `extraScopes` 없을 때 파이프 결과가 지금과 같음                                                                                                                                                                                                                                                                                                                   |
| DB 없는 HTTP(프로브)    | 확장 범위 만들기 · 수정 · 삭제가 기존 라우트로 됨(훅 대역) · 모르는 범위 400 · 갈래를 넘는 수정 400(재인증 앞) · 미리보기 쿼리의 확장 범위 400                                                                                                                                                                                                                                                                                                                                                                                               |
| 실 MariaDB(11.4 · 12.3) | 훅 `lock` false → 400 · 목록 `scopeName`(훅 이름 · 없는 번호 null · 등록 빠진 범위 null) · `revision` 409 · 재인증 · 감사 행 셋 · `wholeScope` 꺼짐(만들기 400 · `rulesOf` · `allows` 에서 빠짐) · `countRulesOf`(쓰는 쪽 트랜잭션) · **R3a**(확장 규칙을 넣고 지워도 관리자 로그인 · 매 요청 · 갱신 판정, 잔존 409, 자기 잠금, 미리보기 `summary` · `items` 가 그대로) · **R3b**(`global` 시드만 있으면 `allows` false · 범위 전체 · 대상 층 판정) · 확장 쓰기가 잔존 가드 행을 남이 쥔 동안에도 끝남(`whileHeld`) · 등록 빠진 범위 행 삭제 |
| admin-ui 렌더 · 단위    | 선택지 둘(`wholeLabel` 없으면 하나) · 대상 검색 칸 · 번호 칸 대체 · 목록 표기 · 대상 없음 · `'unrelated'`(미리보기 어댑터 호출 0) · 관문 문구 · 한 범위 모드(거르기 · 카드 없음 · 대상 고정) · `openCreate(prefill)` → 패널 값 · 관문 문구 · `false` 경우 · 모르는 범위 행은 삭제만 · 수정 중 갈래 밖 선택지 없음 · setup 던지기                                                                                                                                                                                                             |
| 타입                    | 쓰는 쪽 `interface Database extends AdminDatabase` 의 `Transaction<Database>` 로 적은 훅이 `ipAccess.extraScopes` 에 들어감                                                                                                                                                                                                                                                                                                                                                                                                                  |

검증: `pnpm check` · `pnpm test:db`(11.4 · 12.3) 초록, 패킹 tarball 스모크 — 서버(`skipLibCheck: false` tsc · 기동 · 확장 범위 만들기 → `allows`) · 화면(`/smoke`). 기록은 `docs/verification/2026-11-21-admin-kit-ip-extra-scopes.md`.

## 7. 기록 · 판

- admin-server README 「IP 접근 제어」 에 「확장 범위」 절 — 옵션 · 두 층 판정 · 분리 보장(R3 양방향) · 권한(코어 슬롯만 — ①) · 쓰는 쪽 가드 예 · 잠금 순서(X6) · `wholeScope` · 등록이 빠진 범위 · 공개 서비스. 라우트 표의 행 설명에 확장 범위.
- admin-ui README IP 화면 절 — `extraScopes` · `focus` · `openCreate(prefill)` · 「출고 시도」 같은 다른 화면 배치 예.
- `CLAUDE.md` 바뀌는 줄(§8) · 진행 표 행, `docs/HANDOFF.md`, `docs/01-phase0.md` §8 표.
- changeset **minor** — `fixed` 라 세 패키지 **0.15.0**. 소비자 안내: 확장 범위를 쓰지 않으면 고칠 것 없음, 쓰려면 서버 · 화면 옵션(§10). admin-server · admin-ui 의 peer `@ssworks/admin-shared` 하한 `>=0.15.0 <1.0.0`(새 export 를 쓴다 — `.changeset/README.md`).

## 8. 이 문서가 바꾸는 줄

- `CLAUDE.md` admin-server: 「IP 쓰기(만들기 · 수정 · 삭제)는 `withSuperAdminSurvival(…)` 안이다 …」 → 「**코어 범위**(global · team · user) IP 쓰기는 …」 로 좁히고 한 줄을 더한다 — 확장 범위(`ipAccess.extraScopes`) 쓰기는 잔존 · 가드 행 · 자기 잠금 밖(대상 규칙 행 `FOR UPDATE` → 쓰는 쪽 `target.lock`), 범위 종류는 갈래를 넘어 바꾸지 않는다, 관리자 판정이 읽는 규칙은 코어 셋뿐(`ipRuleSetQuery`) · 확장 판정은 admin-shared `evaluateScopedIpAccess` 하나, 쓰는 쪽은 `ipAccessRules` 를 잠그지 않는다.
- 2f-1 스펙 §2-2 #3 「모듈 옵션이 없다」 → 코어 옵션 `ipAccess` 가 생겼다(확장 범위만 — 코어 층의 고정 동작은 그대로).
- 2f-1 스펙 P2 「규칙 전량(세 열)」 → 코어 셋의 세 열.

## 9. 구현 메모

- `rule-set.ts` 의 코어 조건은 `IP_SCOPE_TYPES` 에서 만든다(목록을 두 번 적지 않는다).
- 목록 이름 붙이기는 `queries.ts` 의 LEFT JOIN 을 그대로 두고, 서비스가 확장 행만 모아 훅을 부른다 — `toRuleView` 가 이름 맵을 받는다.
- 수정 · 삭제의 갈래 미리 읽기(X4)는 `runQuery` 로 감싼 비잠금 한 줄이다. 코어 갈래에 대해서는 결과를 쓰지 않는다(없음 · 코어 → 지금 경로).
- 화면 선택지 키 풀기(`<이름>:*` ↔ `{ scopeType, scopeRefNo: null }`)는 `ip-access.ts` 순수 함수 하나에 둔다(`toCreateBody` · `ruleToForm` · `ipRuleFormProblems` · `formScopeTitle` 이 같은 함수를 쓴다).
- 서버 문구는 §4-7 표 하나 — 파이프 · 서비스가 같은 표에서 가져온다(`messages.test.ts` 정적 검사가 묶음을 본다).

## 10. 소비자 인계 (요청 문서 §6 회신)

출고 관리 서비스 세션이 이 절을 읽고 자기 설계에 반영한다. 0.15.0 이 공개된 뒤(사람이 `pnpm stage approve` — 최소 공개 기간 하루 뒤 설치) 쓴다.

### 10-1. 공개 API

**서버 옵션**(`AdminServerModule.forRootAsync` 의 `useFactory` 결과):

```ts
import type { Kysely, Transaction } from 'kysely'
import type { Database } from './database/types' // interface Database extends AdminDatabase

ipAccess: {
  extraScopes: [
    {
      type: SHIPPING_TOKEN_SCOPE, // 'shippingToken' — shared 상수, 화면과 같은 값
      wholeScope: true, // 기본 true — 「모든 출고 USB」 규칙(scopeRefNo NULL)
      target: {
        async lock(trx: Transaction<Database>, refNo: bigint) {
          const row = await trx
            .selectFrom('shippingTokens')
            .select('tokenNo')
            .where('tokenNo', '=', refNo)
            .forUpdate()
            .executeTakeFirst()
          return row !== undefined // 폐기된 토큰을 막으려면 여기서 false
        },
        async names(db: Kysely<Database>, refNos: readonly bigint[]) {
          const rows = await db
            .selectFrom('shippingTokens')
            .select(['tokenNo', 'tokenName'])
            .where('tokenNo', 'in', refNos)
            .execute()
          return new Map(rows.map((row) => [row.tokenNo, row.tokenName]))
        },
      },
    },
  ],
},
```

- 이름 규칙: 영소문자로 시작하는 영숫자 1~16자 · 코어 이름(대소문자 무시)과 다름. 어기면 기동에서 멈춘다. `permissions` 같은 키도 멈춘다(R7 없음).
- 훅은 메서드 꼴로 적는다(위처럼). `names` 는 빈 배열로 불리지 않는다.

**노트북 API 가드**(`@Public()` 컨트롤러 — 매 요청):

```ts
import { AdminIpExtraScopeService } from '@ssworks/admin-server'

@Injectable()
export class ShippingIpGuard implements CanActivate {
  constructor(private readonly ip: AdminIpExtraScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const tokenNo = shippingTokenOf(req) // 토큰 가드가 먼저 실은 번호
    const allowed = await this.ip.allows(SHIPPING_TOKEN_SCOPE, tokenNo, this.ip.clientIpOf(req))
    if (!allowed) throw new BusinessError(ShippingErrorCodes.ERR_SHIPPING_IP_NOT_ALLOWED, '…')
    return true
  }
}
```

- `clientIpOf(req)` 는 관리자 판정과 같은 출처(코어 `clientIp: 'x-real-ip'` — 템플릿 그대로)다. 직접 헤더를 읽지 않는다.
- 판정 함수만 필요하면 admin-shared `evaluateScopedIpAccess(ip, rules, { scopeType, scopeRefNo })` 와 `this.ip.rulesOf(scopeType)` 를 쓴다 — `allows` 가 그 둘이다.
- 규칙 수: `this.ip.countRulesOf(SHIPPING_TOKEN_SCOPE, tokenNo, trx?)` — 토큰을 지우는 길을 만들면 토큰 행을 `FOR UPDATE` 로 잠근 **뒤** 첫 비잠금 읽기로 센다. 🔴 쓰는 쪽 트랜잭션에서 `ipAccessRules` 행을 잠그지 않는다(킷 순서는 규칙 행 → 토큰 행 — 교착).
- 등록되지 않은 범위 이름을 넘기면 `Error`(500) — 오타가 막힘으로 드러난다.

**화면**(`useIpAccessRules` — 어댑터는 지금 그대로 `/ip-access`):

```ts
const shippingScope: IpExtraScopeOption = {
  type: SHIPPING_TOKEN_SCOPE,
  label: '출고 토큰',
  wholeLabel: '모든 출고 USB', // 서버 wholeScope: true 와 맞춘다
  search: (keyword) => api.get('/shipping/tokens/search', { params: { keyword } }), // → { refNo, name }[]
}

// IP 규칙 설정 화면 — 코어 층과 나란히
const ip = useIpAccessRules({ ...adapters, canManage, extraScopes: [shippingScope] })

// 토큰 상세 · 「출고 시도」 옆 패널 — 한 범위 모드(토큰마다 :key 로 다시 만든다)
const tokenIp = useIpAccessRules({
  ...adapters,
  canManage,
  extraScopes: [shippingScope],
  focus: { scopeType: SHIPPING_TOKEN_SCOPE, scopeRefNo: token.tokenNo },
})

// 「출고 시도」 의 [이 IP 허용] — canManage() 일 때만 보인다
await tokenIp.openCreate({
  scopeType: SHIPPING_TOKEN_SCOPE,
  scopeRefNo: attempt.tokenNo, // null = 모든 출고 USB
  scopeName: attempt.tokenName,
  cidr: '203.0.113.7/32', // IPv6 는 쓰는 쪽이 /64 로
  description: '2026-11-21 출고 시도에서 허용',
})
```

- `openCreate` 는 미리 채운 편집 패널을 연다 — 같은 `<IpAccessManager v-bind="tokenIp.manager.value" />` 가 화면에 있어야 한다(대화상자 · 옆 패널 배치는 쓰는 쪽). 저장 → 확인 또는 재인증 창 → 오류 처리는 킷 흐름이다. 돌려받는 값이 `false` 면 열리지 않았다(권한 · 진행 중 · 고를 수 없는 선택지).
- 목록의 대상 칸은 서버가 `names` 로 붙인 이름이다. 검색 어댑터(`search`)는 쓰는 쪽 API 다.

### 10-2. 권한 동작

- **R7 은 하지 않았다**(사용자 결정 2026-11-21). 확장 범위 규칙도 코어 슬롯으로만 다룬다 — 목록 `ipAccess.read`, 만들기 · 수정 · 삭제 `ipAccess.manage`(킷이 전권 전용으로 강제 — 일반 역할에 넣으면 400 · 기동 검사).
- 출고 담당자는 IP 를 직접 추가하지 않는다. 출고장 IP 추가가 필요하면 IP 규칙 권한자(전권 관리자)에게 요청한다 — 「출고 시도」 화면의 [이 IP 허용]은 `ipAccess.manage` 키가 있을 때만 보이고, 누르는 사람은 IP 규칙 권한자다.
- 범위별 권한 키 옵션은 없다 — 적으면 기동에서 멈춘다.

### 10-3. 두 층 판정과 분리 보장 (R2 · R3)

- **판정**(`evaluateScopedIpAccess` · `allows`): 주소 `null` → 거부. 그 범위 행만 본다. 그 토큰의 규칙이 하나라도 있으면 그것만(가장 가까운 층 하나), 없으면 범위 전체 규칙(`scopeRefNo` NULL), 둘 다 없으면 거부. 고른 층에서 CIDR 하나라도 맞으면 통과(파서 `parseCidr` — 관리자 규칙과 같다). 🔴 토큰 규칙 한 줄이 「모든 출고 USB」 허용을 그 토큰에 대해 지운다.
- **`wholeScope: false`**: 범위 전체 규칙을 만들 · 고칠 수 없고(400), 이미 있는 행은 판정에서 빠진다(목록에는 남아 지울 수 있다).
- **관리자 → 확장 차단(R3b)**: 코어 규칙(장 0012 의 `global` 시드 `0.0.0.0/0` · `::/0` 포함)은 확장 판정에 쓰이지 않는다 — 읽기가 그 범위만 고르고, 판정 함수가 그 범위 행만 보며 코어 이름이면 던진다. 출고 규칙이 하나도 없으면 노트북 API 는 어디서도 거부다.
- **확장 → 관리자 차단(R3a)**: 확장 규칙은 관리자 로그인 · 매 요청 · 토큰 갱신의 IP 판정, 전권자 잔존 셈, 자기 잠금 판정, 미리보기의 잠김 목록 어디에도 쓰이지 않는다 — 관리자 판정의 규칙 읽기가 코어 셋만 고르고, 관리자 평가 함수도 모르는 범위를 무시한다. 확장 규칙 쓰기는 잔존 가드 · 자기 잠금 검사를 지나지 않는다(바꿀 수 있는 것이 없다).
- **대상이 사라진 규칙(R8)**: 목록 `scopeName: null` — 화면은 「출고 토큰 #12 · 대상 없음 — 아무에게도 걸리지 않음」. 판정은 그 번호로 오는 토큰이 없으니 아무도 통과하지 못한다. 연쇄 검사(토큰 삭제 409)는 쓰는 쪽 몫 — `countRulesOf` 를 쓴다.
- **수정 제한**: 확장 규칙의 범위 종류는 바꿀 수 없다(코어로 · 다른 확장 범위로 400 — 지우고 새로 만든다). 대상(토큰 ↔ 다른 토큰 ↔ 모든 출고 USB) · CIDR · 설명은 바꿀 수 있다.
- **옵션에서 범위를 지우면**: 남은 행은 목록에 보이고 삭제만 된다. 판정에는 쓰이지 않는다(`allows` 는 등록되지 않은 이름에 던진다).

### 10-4. 판 · peer

- 세 패키지 **0.15.0**(minor · `fixed`). 확장 범위를 쓰지 않는 소비자는 고칠 것이 없다.
- `@ssworks/admin-server` · `@ssworks/admin-ui` 의 peer `@ssworks/admin-shared` 하한 **`>=0.15.0 <1.0.0`** — 세 패키지를 함께 0.15.0 으로 올린다.
- 새 장 없음 — 마이그레이션 스텁을 더하지 않는다.

### 10-5. 요구 중 하지 않은 것 · 바꾼 것

| 요구                               | 처리                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R7 범위별 권한                     | **하지 않음** — 사용자 결정(2026-11-21): IP 규칙 관리는 IP 규칙 권한자만. 출고 담당자는 권한자에게 요청한다(§10-2)                                 |
| R4 예시 `ipRulesOfScope(db, type)` | 쿼리 함수 대신 주입 서비스 `AdminIpExtraScopeService`(`rulesOf` · `allows`) — 범위 등록 · `wholeScope` 를 아는 쪽이 읽어야 거른 결과가 판정과 같다 |
| R5 예시 훅 `exists · lock · names` | `exists` 를 `lock` 으로 합쳤다 — 있는지 확인과 잠금 읽기가 같은 쿼리(X5)                                                                           |
| R5 수정의 범위 종류 바꾸기         | 킷 결정: 코어 안에서만. 확장 규칙의 범위 종류는 바꿀 수 없다(X2)                                                                                   |
| R2 옵션 이름 `allowAll`            | `wholeScope` — `allowAll` 은 「모든 주소 허용」 으로 읽힌다                                                                                        |
| R6b 확장 범위 미리보기             | 미리보기를 부르지 않고 「관리자 접속과 무관」 으로 보인다(§5-4) — 확장 규칙의 쓰는 쪽 영향(어느 토큰이 막히나) 미리보기는 없다                     |
| R6-1 한 범위 모드                  | 게터가 아니라 값(`focus`) — 토큰을 바꿔 보이려면 `:key` 로 다시 만든다(X12)                                                                        |
