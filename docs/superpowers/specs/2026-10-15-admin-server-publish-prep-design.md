# admin-server 첫 발행 준비 설계 (Phase 2 PR 2f-2b)

작성일: 2026-10-15 · 상태: 확정(구현 전) · 선행: 2a 스펙 `docs/superpowers/specs/2026-10-08-admin-server-foundation-design.md` §4 · ⑤ E1 · 버전 범위, 2f-1 스펙 `docs/superpowers/specs/2026-10-15-admin-server-ip-access-design.md` P1 · §9, `.changeset/README.md` "0.x 동안의 peer 범위", `docs/HANDOFF.md` "PR 2a 최종 리뷰가 넘긴 것" · "PR 2e-2 최종 리뷰가 넘긴 것" · "PR 2f-1 최종 리뷰가 넘긴 것"

이 문서는 2f-2b 의 범위만 쓴다. DB 연결의 안전 옵션 고정은 2a 스펙, IP 평가 · 층 판정은 2f-1 스펙이 그대로 유효하고, 이 문서가 바꾸는 줄은 §12 에 모았다.

## 1. 목표

admin-server 첫 발행(결정 ⑥ V1) 앞의 막힌 것을 걷어낸다. 브랜치 `feat/admin-server-publish-prep`. 끝 상태:

- **관리형 DB 에 붙는다** — `AdminDbConnection` 이 TLS(`ssl`) · 유닉스 소켓(`socketPath`)을 받고, `adminDbConnectionFromEnv` 가 env 셋(`DB_SSL` · `DB_SSL_CA` · `DB_SOCKET_PATH`)을 읽는다. 앱과 마이그레이션 러너가 같은 `adminPoolConfig` 를 지난다. 지금의 env · 객체는 그대로 동작한다.
- **발행 peer 가 거짓말하지 않는다** — admin-server 의 peer `@ssworks/admin-shared` 가 `^0` 대신 실제로 쓰는 최소 버전 `>=0.4.0 <1.0.0` 으로 나간다. changesets 가 0.x minor 에서 major 로 올리지 않는다(드라이런 · pack 으로 확인).
- **`skipLibCheck: false` 소비자가 깨지지 않는다** — admin-shared `dist/pagination.d.ts` TS2536 3건이 없어지고, 발행 d.ts 를 그렇게 검사하는 게이트 `check:dts` 가 생긴다.
- **IP 파서가 표기상 틀린 것을 받지 않고 맞는 것을 거부하지 않는다** — §5-5 의 규칙 넷 · 측정표.

쓰는 쪽이 할 일: 없음. 선택 env 셋이 생겼다(§9).

PR 순서: 2f-2a → **2f-2b** → (사람) push → Version Packages PR #3 이 0.4.0 으로 다시 열린다 → Trusted Publisher 확인 뒤 머지 · 승인 → 확인용 앱 실서버 확인 → admin-server 첫 발행(`private` 해제 · 로컬 2FA).

## 2. 결정

### 2-1. 경계 결정 (2026-10-15, 브레인스토밍 — 모두 권장안)

| #             | 확정                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ① PR #3 순서  | **V1** — Version Packages PR #3 은 2f-2b 가 main 에 들어간 뒤 머지한다. 0.4.0 하나에 2c ~ 2f-2b 가 모두 실린다 — admin-shared patch 가 0.4.0 에 접혀 느슨한 파서 · TS2536 이 0.4.0 으로 나가지 않고, admin-server 첫 발행도 0.4.0(세 패키지 같은 번호). 지금 0.4.0 을 기다리는 소비자는 없다(admin-shared 의 0.4.0 추가분은 admin-server 만 쓴다, admin-ui 는 변경 없음) |
| ② PR 단위     | **S1** — A(admin-server) · B(admin-shared)를 한 PR 로. ① 로 둘 다 PR #3 전에 main 에 있어야 하고, 드라이런은 둘이 들어간 상태에서 한 번에 잰다                                                                                                                                                                                                                           |
| ③ TLS env     | **T1** — 검증하는 두 가지만 env 로 연다: `DB_SSL=true`(시스템 CA · MariaDB 11.4.1+ 자체 서명은 드라이버 지문 검증) · `DB_SSL_CA=<PEM 파일 경로>`(그 CA 로 체인 · 호스트 이름 검증). 검증 끄기 · 호스트 이름 생략 · 클라이언트 인증서는 코드로(`{ ...adminDbConnectionFromEnv(), ssl: {...} }`, README 예제). env 한 줄로 검증이 꺼지지 않는다                            |
| ④ 루프백 CIDR | **L1** — 루프백 접기(`::1` → `127.0.0.1`)는 `/128` 에만. 그 밖의 프리픽스는 비트 그대로 IPv6 망이다(`::1/64` = `::/64`, `::1/120` = `::/120`)                                                                                                                                                                                                                            |
| ⑤ 설계 묶음   | 설계 ① DB 연결, ② peer 하한 · 발행 형태 검증, ③ TS2536 · `check:dts`, ④ IP 파서(규칙 4 — v4-mapped 영역은 점 표기만 — 포함), ⑤ 검증 · 스모크 · 문서 승인                                                                                                                                                                                                                 |

### 2-2. 공통 결정 (이의 없음)

1. **하위 호환.** 지금의 env 일곱과 `{ host, user, password, database }` 객체는 같은 풀 옵션을 낸다. 새 칸 · env 는 모두 선택이다.
2. **값을 메시지에 담지 않는다.** env 오류는 이름만, 파일 오류는 이름 + errno 코드만(2a — `DB_PORT` 는 자격증명과 같은 줄에 있다).
3. **러너는 Nest 무의존 그대로.** `connection.ts` 는 `node:fs` 만 더한다(`runner-graph.test.ts` 가 지킨다).
4. **공개 함수 시그니처는 바뀌지 않는다** — admin-shared `normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr` · `createQuerySchema` 는 같은 이름 · 같은 인자다. 바뀌는 것은 판정과 d.ts 표기다.
5. **범위 밖**: admin-ui peer(`^0` 그대로), 확인용 앱 실서버 확인, `private` 해제 · 첫 발행, `DB_SSL_MODE` 같은 모드 문자열, 소켓 실접속 테스트(§10).

## 3. 정본

없다 — 참조 프로젝트 넷(hangang · gise · axion · crm)은 DB TLS · 소켓을 쓰지 않는다. 근거는 드라이버다.

- **mariadb 3.5.4** `ConnectionConfig`: `socketPath?: string`(있으면 host · port 무시), `ssl?: boolean | (SecureContextOptions & { rejectUnauthorized?: boolean })`.
- `lib/connection.js` `createSecureContext`: `ssl: true` 이거나 `rejectUnauthorized` 가 꺼지지 않았고, 비밀번호가 있고, `ssl.ca` 가 없고, 소켓이 아니고, 서버가 MariaDB 11.4.1+ 이면 **지문 검증**을 쓴다 — TLS 층에서는 자체 서명을 받고, 인증 끝의 OK 패킷에 실린 해시(비밀번호 해시 · seed · 인증서 지문)로 인증서를 검증한다. `ssl.ca` 를 주면 지문 검증이 꺼지고 Node TLS 가 체인 · 호스트 이름을 검증한다.
- `lib/config/connection-options.js`: 받은 `opts.ssl` 객체의 `rejectUnauthorized` 를 **직접 다시 쓴다** — 넘기기 전에 복사한다(§5-1).
- 테스트 DB(`mariadb:11.4.13`, CI `db` 잡과 같은 이미지)는 TLS 를 기본으로 켠다(`have_ssl=YES`, `ssl_cert` 비어 있음 — 자체 서명 자동 생성). 2026-10-15 실측.

## 4. 공개 API

### 4-1. admin-server

```ts
/** DB 접속 정보. 풀 안전 옵션은 `adminPoolConfig()` 가 고정하고 여기서는 바꾸지 못한다. */
export interface AdminDbConnection {
  /** TCP 호스트. 🔴 `socketPath` 와 둘 중 하나만 */
  host?: string
  /** 기본 3306. `socketPath` 와 함께 쓰지 않는다 */
  port?: number
  /** 유닉스 소켓(Windows 는 명명 파이프 `\\.\pipe\…`). 🔴 `host` · `port` · `ssl` 과 함께 쓰지 않는다 */
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
  connectionLimit?: number
  acquireTimeout?: number
}
```

- `host` 가 필수에서 선택으로 바뀐다 — 객체를 만드는 쪽은 그대로 컴파일된다. admin-server 는 미발행이라 읽는 쪽의 깨짐은 없다.
- 판별 합집합 타입은 쓰지 않는다 — `{ ...adminDbConnectionFromEnv(), ssl: {...} }` 예제가 컴파일되지 않는다. 배타는 런타임 검사(§5-1).
- `adminDbConnectionFromEnv(env?)` · `adminPoolConfig(connection)` · `poolEnvInt` 의 시그니처는 그대로다. 새 export 없음.

env(§5-2):

| env              | 필수              | 기본 | 비고                                                                                                             |
| ---------------- | ----------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| `DB_SOCKET_PATH` |                   |      | 있으면 소켓. `DB_HOST` · `DB_PORT` · `DB_SSL=true` · `DB_SSL_CA` 와 함께 쓰면 기동 실패                          |
| `DB_HOST`        | 예(소켓이 아니면) |      |                                                                                                                  |
| `DB_SSL`         |                   | 끔   | `true` · `false` 만(앞뒤 공백 무시 · 소문자). 그 밖은 기동 실패                                                  |
| `DB_SSL_CA`      |                   |      | PEM 파일 경로. 있으면 TLS 를 켜고 그 CA 로 검증. `DB_SSL=false` 와 함께 쓰거나 못 읽거나 PEM 이 아니면 기동 실패 |

peer:

```json
"@ssworks/admin-shared": "workspace:>=0.4.0 <1.0.0"
```

발행 시 `>=0.4.0 <1.0.0`. devDependencies 의 `workspace:*` 는 그대로.

### 4-2. admin-shared

- `createQuerySchema` — 반환 타입의 `sortBy` 가 d.ts 에서 `TSortable[number]` 기반으로 표기된다(§5-4). `z.output` · `z.input` 은 같다.
- IP 파서 다섯(`normalizeIp` · `isValidIp` · `parseCidr` · `isValidCidr` · `ipInCidr`) — 판정이 §5-5 로 바뀐다. `ipCidrSchema` · `evaluateIpAccess` 는 이것을 따라간다.

### 4-3. 저장소 스크립트

- 루트 `check:dts` = `pnpm -r --if-present check:dts`. `check` = `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:dts`. CI `check` 잡의 Build 다음에 같은 단계.
- admin-shared · admin-server 에 `check:dts` = `tsc -p tsconfig.dts.json`(§5-4).

## 5. 동작

### 5-1. `adminPoolConfig` — 접속 대상과 TLS

"있다" = 비어 있지 않은 문자열(`host` · `socketPath`) · truthy(`ssl`) · 정의됨(`port`).

| 입력                             | 결과                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `host` 만                        | `host` · `port ?? 3306` (지금과 같다)                                                     |
| `socketPath` 만                  | `socketPath` — `host` · `port` 키 없음                                                    |
| `host` · `socketPath` 둘 다      | 던짐 `AdminDbConnection 은 host 와 socketPath 중 하나만 둔다`                             |
| 둘 다 없음                       | 던짐 `AdminDbConnection 에 host 나 socketPath 가 없다`                                    |
| `socketPath` + `port` 또는 `ssl` | 던짐 `socketPath 는 port · ssl 과 함께 쓰지 않는다`                                       |
| `ssl: true`                      | `ssl: true`                                                                               |
| `ssl: {…}`                       | `ssl: { ...connection.ssl }` — 🔴 얕은 복사(드라이버가 `rejectUnauthorized` 를 다시 쓴다) |
| `ssl` 없음 · `false`             | `ssl` 키 없음(지금과 같은 모양)                                                           |

던지는 시점은 풀을 만드는 때 — 앱은 `createAdminKysely`(모듈 초기화), 러너는 `kysely.config.ts` 평가. 안전 옵션(timezone `Z` · 숫자 넷 · `logParam: false` · 풀 크기 · 대기)은 그대로다.

### 5-2. `adminDbConnectionFromEnv`

1. `DB_SOCKET_PATH` 가 있으면 소켓 모드. `DB_HOST` · `DB_PORT` 중 하나라도 있으면 던짐 `DB_SOCKET_PATH 는 DB_HOST · DB_PORT 와 함께 쓰지 않는다`. `DB_SSL`(값이 `false` 가 아닌 것) · `DB_SSL_CA` 가 있으면 던짐 `DB_SOCKET_PATH 는 DB_SSL · DB_SSL_CA 와 함께 쓰지 않는다`.
2. 필수: `DB_USER` · `DB_PASSWORD` · `DB_NAME`, 소켓 모드가 아니면 `DB_HOST`. 빠지면 `필수 환경변수가 없다: DB_HOST(또는 DB_SOCKET_PATH), DB_USER, DB_NAME` 꼴(빠진 것만, 지금 순서).
3. `DB_SSL` — 앞뒤 공백을 뗀 값이 빈 값 · `false` 면 끔, `true` 면 켬, 그 밖은 던짐 `DB_SSL 은 true 나 false 여야 한다`.
4. `DB_SSL_CA` — 있으면 `DB_SSL=false` 일 때 던짐 `DB_SSL=false 와 DB_SSL_CA 는 함께 쓰지 않는다`. 아니면 `readFileSync(path, 'utf8')`. 실패하면 던짐 `DB_SSL_CA 파일을 읽지 못했다(<errno 코드>)`, 내용에 `-----BEGIN CERTIFICATE-----` 가 없으면 던짐 `DB_SSL_CA 가 PEM 인증서가 아니다`. 결과 `ssl: { ca }`(`DB_SSL` 이 비었어도 켬).
5. 결과 객체 — TCP: 지금 모양 + (켰으면) `ssl`. 소켓: `{ socketPath, user, password, database, connectionLimit, acquireTimeout }`.

🔴 메시지에 값 · 경로를 담지 않는다. 경로는 비밀이 아니지만 규약을 하나로 둔다 — 어느 env 인지와 errno 면 고칠 수 있다.

### 5-3. peer 하한 · changesets

- **하한 0.4.0** — admin-server 가 import 하는 admin-shared API(감사 카탈로그 · 사용자 · 팀 · 약관 · IP 액션 · IP 파서 · 스키마)가 모두 처음 실리는 버전. ① V1 로 이번 patch 도 0.4.0 에 실린다.
- **상한 `<1.0.0`** — `^0.4.0` 은 0.5.0 을 덮지 못한다. changesets `determineDependents` 는 peer 가 범위를 벗어나면 의존 패키지를 major 로 올린다(첫 Version Packages PR 의 1.0.0). `>=0.4.0 <1.0.0` 은 0.x minor 를 모두 덮어 `onlyUpdatePeerDependentsWhenOutOfRange: true` 와 맞물린다. 범위 안의 peer 는 `apply-release-plan` 이 다시 쓰지 않는다(`shouldUpdateDependencyBasedOnConfig` — peer 는 범위 밖일 때만).
- **규칙** — admin-server 가 admin-shared 의 새 export 를 쓰기 시작하는 PR 은 하한을 그 export 가 실릴 버전으로 올린다. `.changeset/README.md` 와 CLAUDE.md admin-server 절에 한 줄씩.
- **1.0 으로 갈 때** — 지금처럼 `workspace:^` 로 되돌린다(`.changeset/README.md`).

### 5-4. TS2536 · `check:dts`

원인: `createQuerySchema` 의 `z.enum(sortableColumns)` 반환 타입이 `ZodEnum<Flatten<{ [k in TSortable[number]]: k }>>` 이고, `toArray` 의 출력 `core.output<T>` 가 d.ts 에 `(… extends infer T ? {…} : never)[TSortable[number]]` 로 풀려 나온다 — TS 가 그 조건부 타입을 `TSortable[number]` 로 색인할 수 있음을 증명하지 못한다(3건 = `ZodTransform` 의 출력 1 · 입력 2).

고침(스크래치 프로토타입 확인):

```ts
const columnSchema: z.ZodType<TSortable[number], TSortable[number]> = z.enum(sortableColumns)
```

d.ts 는 `z.ZodType<TSortable[number], TSortable[number], …>` 로 나오고 `skipLibCheck: false` 에서 0건. 정렬 칸 밖 값은 여전히 컴파일 오류다.

`check:dts` — 발행 d.ts 를 쓰는 쪽처럼(`strict` · `skipLibCheck: false` · `module`/`moduleResolution` `nodenext` · `noEmit`) 검사한다.

| 패키지       | 대상                                                                                                                                   | 지금(main dist 실측)      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| admin-shared | `dist/index.d.ts`                                                                                                                      | 3건(pagination)           |
| admin-server | `dist/index.d.ts` · `dist/runner.d.ts` · `dist/database/migrations/*.d.ts`                                                             | admin-shared 3건 말고 0건 |
| admin-ui     | 넣지 않는다 — 자기 d.ts 는 0건이지만 Vuetify 4.2 d.ts 가 `skipLibCheck: false` 에서 수백 건이라 그 소비자는 어차피 `true` 다(주석으로) | —                         |

### 5-5. IP 파서

규칙:

1. **`::ffff:` 는 점 표기 IPv4 앞에서만 뗀다** — `normalizeIp` 가 `/^::ffff:(?=[0-9]+[.])/i` 일 때만. (지금: 무조건 떼서 `::ffff:1::` → `1::`.)
2. **내장 IPv4 는 주소 전체의 마지막 그룹에만** — `parseIpv6` 가 `::` 가 있으면 뒤쪽에만, 없으면 전체에 `expandEmbeddedIpv4` 를 건다. 앞쪽의 점 표기 그룹은 16진 그룹 검사에서 떨어진다. (지금: 앞쪽에도 걸어 `1.2.3.4::` 를 받는다.)
3. **루프백 접기는 `/128` 에만**(④ L1) — `parseCidr` 가 망 주소를 셋으로 가른다: 점 표기 v4-mapped(규칙 1 의 정규식)면 지금처럼 접고 96 을 뺀다(96 미만 거부) · 루프백 표기(`normalizeIp` 가 `127.0.0.1` 로 바꾸는 `:` 든 문자열)는 `/128` 이면 `127.0.0.1/32`, 아니면 그 문자열을 IPv6 로 비트 그대로 · 나머지는 `normalizeIp` 뒤 그대로. (지금: 루프백도 v4-mapped 처럼 96 을 빼서 `::1/120` → `127.0.0.0/24`, `::1/64` 거부.)
4. **v4-mapped 영역(`::ffff:0:0/96`)은 `::ffff:a.b.c.d` 꼴만** — `parseIpv6` 결과 바이트가 0~9 가 0 이고 10 · 11 이 `0xff` 면 거부한다. 정상 점 표기는 규칙 1 · 3 에서 먼저 떼어지므로 여기 오지 않는다. 규칙 1 만 적용하면 지금은 우연히 거부되던 16진 표기(`::ffff:7f00:1`)가 "저장은 되고 아무도 통과하지 못하는" 규칙이 된다(hangang R16 함정). 지금도 `0:0:0:0:0:ffff:1.2.3.4/128` 이 그렇다.

🔴 CIDR 을 읽는 곳은 `parseCidr` 하나(hangang R30) — 그대로. 🔴 계열이 다르면 늘 false — 그대로.

측정표("지금"은 main dist 실측, 2026-10-15):

| 입력                                                                                | 지금                           | 바뀐 뒤                                       |
| ----------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| `normalizeIp('::ffff:1::')`                                                         | `'1::'`                        | `'::ffff:1::'`                                |
| `isValidCidr('::ffff:1::/120')`                                                     | true                           | **false**(`::` 두 번)                         |
| `isValidIp('1.2.3.4::')` · `isValidIp('1.2.3.4::5')`                                | true · true                    | **false** · **false**                         |
| `isValidIp('::1.2.3.4')`                                                            | true                           | true                                          |
| `isValidIp('::ffff:1:2:3:4:5:6')`                                                   | false                          | **true**                                      |
| `isValidCidr('::1/64')`                                                             | false                          | **true**(`::/64`)                             |
| `ipInCidr('127.0.0.5', '::1/120')`                                                  | true(오독)                     | **false**(`::/120`)                           |
| `ipInCidr('::1', '::1/128')` · `ipInCidr('127.0.0.1', '::1/128')`                   | true · true                    | true · true                                   |
| `ipInCidr('::1', '::1/64')`                                                         | false(형식 오류)               | false(루프백은 v4 로 접힌다 — `::/0` 과 같다) |
| `isValidIp('::ffff:7f00:1')` · `isValidCidr('::ffff:7f00:1/128')`                   | false · false                  | false · false(규칙 4)                         |
| `isValidIp('0:0:0:0:0:ffff:1.2.3.4')` · `isValidCidr('0:0:0:0:0:ffff:1.2.3.4/128')` | true · true(아무도 통과 못 함) | **false** · **false**                         |
| `isValidCidr('::ffff:203.0.113.0/120')` · `isValidIp('::FFFF:1.2.3.4')`             | true · true                    | true · true                                   |

보안 영향 없음 — 규칙은 관리자 입력, 주소는 Node · 엣지가 낸다. IP 파서는 0.4.0 에서 처음 공개되므로 발행본 기준으로 바뀜을 겪는 소비자도 없다.

## 6. 의존성

없음. `node:fs` 는 Node 내장. mariadb peer `^3.4.0` 그대로 — `ssl` · `socketPath` 는 3.x 전부에 있다(지문 검증은 3.4+ — 기존 하한이 이미 3.4).

## 7. 파일

| 파일                                                                   | 바뀜                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/admin-server/src/database/connection.ts`                     | `AdminDbConnection` 칸 셋, `adminPoolConfig` 배타 · 복사, env 셋 · CA 읽기 |
| `packages/admin-server/src/database/connection.test.ts`                | §8-1                                                                       |
| `packages/admin-server/src/database/connection.tls.db.test.ts`(새)     | §8-2                                                                       |
| `packages/admin-server/src/ip-access/ip-access.http.db.test.ts`        | 기존 "검증 400" 테스트에 한 건(§8-2)                                       |
| `packages/admin-server/package.json`                                   | peer 하한 · `check:dts` · 설명 문구(IP 는 이제 있다)                       |
| `packages/admin-server/tsconfig.dts.json`(새)                          | §5-4                                                                       |
| `packages/admin-server/README.md`                                      | env 표 셋 · TLS · 소켓 절                                                  |
| `packages/admin-shared/src/pagination.ts` · `pagination.test.ts`       | 한 줄 · 타입 테스트                                                        |
| `packages/admin-shared/src/ip-access.ts` · `ip-access.test.ts`         | 규칙 넷 · 측정표                                                           |
| `packages/admin-shared/package.json` · `tsconfig.dts.json`(새)         | `check:dts`                                                                |
| `package.json` · `.github/workflows/ci.yml`                            | `check:dts` · `check`                                                      |
| `pnpm-lock.yaml`                                                       | peer 지정자                                                                |
| `.changeset/admin-server-publish-prep.md`(새) · `.changeset/README.md` | §9                                                                         |
| `CLAUDE.md` · `docs/01-phase0.md` · `docs/HANDOFF.md`                  | §9                                                                         |
| 2a · 2f-1 스펙 §14                                                     | §12                                                                        |

## 8. 테스트 계약

### 8-1. 단위 (`pnpm check`)

- **`adminPoolConfig`**: §5-1 표의 여덟 행 전부. 기존 "안전 옵션 고정" `toEqual` 은 그대로 통과(ssl · socket 키 없음). `ssl` 객체 복사 — 넘긴 객체와 결과의 `ssl` 이 다른 참조이고 넘긴 객체가 바뀌지 않는다.
- **`adminDbConnectionFromEnv`**: 기존 셋 + 소켓 모드 결과(키 모양) · 소켓 + `DB_HOST`/`DB_PORT` · 소켓 + `DB_SSL`/`DB_SSL_CA` · 소켓이면 `DB_HOST` 가 필수가 아님 · 빠진 키 메시지(`DB_HOST(또는 DB_SOCKET_PATH)`) · `DB_SSL` `true` / `false` / 빈 값 / `' true '` / 그 밖(`'1'` · `'TRUE'` · `'yes'` — 던지고 값 없음) · `DB_SSL_CA` 임시 PEM 파일 → `ssl: { ca }` · `DB_SSL=true` + CA → `{ ca }` · `DB_SSL=false` + CA · 없는 경로(`ENOENT` 만, 경로 없음) · PEM 이 아닌 파일. 🔴 모든 오류 메시지가 값 · 경로를 담지 않는다.
- **`runner-graph.test.ts`**: 그대로 초록(`node:fs` 는 허용).
- **admin-shared `pagination.test.ts`**: `expectTypeOf` 로 출력 `sortBy` = `('a' | 'b')[]` · 입력 `sortBy` 가 `'a' | 'b' | ('a' | 'b')[] | undefined`, 정렬 칸 밖 값 `@ts-expect-error`. 실행 동작 테스트는 그대로.
- **admin-shared `ip-access.test.ts`**: §5-5 측정표를 `it.each` 로(바뀐 뒤 칸). 기존 테스트 중 기대가 바뀌는 것은 없어야 한다(있으면 §13 에 적는다).
- **`check:dts`**: 두 패키지 0건.

### 8-2. 실 MariaDB (`pnpm test:db`) — `connection.tls.db.test.ts`

`ADMIN_TEST_DB_URL` 서버(11.4.1+ 전제 — 파일 머리 주석)에 붙는다. 다른 db 테스트처럼 DB 하나를 쓰고, 계정은 서버 전역이라 실행마다 다른 이름을 쓰고 `afterAll` 에서 지운다.

1. `ssl: true` → `SHOW SESSION STATUS LIKE 'Ssl_cipher'` 값이 비어 있지 않다(지문 검증 경로).
2. `ssl` 없음 → `Ssl_cipher` 가 빈 값(기본은 평문 — 하위 호환).
3. `REQUIRE SSL` 계정 → `ssl` 없이 접속 거부(1045) · `ssl: true` 로 성공.
4. env 경로 — `DB_SSL_CA` 에 `tls.rootCertificates[0]`(공인 루트 — 서버 자체 서명을 서명하지 않았다)을 담은 임시 파일 → `createAdminKysely(adminDbConnectionFromEnv(env))` 의 첫 쿼리가 거부된다. `DB_SSL=true` → 첫 쿼리 성공 · `Ssl_cipher` 있음.

풀은 테스트마다 `destroy()`. 실 DB 스위트는 겹쳐 돌리지 않는다.

`ip-access.http.db.test.ts` 의 "검증 400" 테스트에 한 건 — 규칙 만들기 본문 `cidr: '::ffff:1::/120'` → 400 `cidr` 칸 오류(`ipCidrSchema` 가 같은 파서를 지난다).

### 8-3. 리뷰 초점 (플랜 · 리뷰어에게 넘긴다)

- 메시지에 값 · 경로가 새는 자리가 없는가(특히 `readFileSync` 오류를 그대로 다시 던지는 실수 — Node 오류 메시지에는 경로가 들어 있다).
- `adminPoolConfig` 가 `ssl` 을 복사하는가, 안전 옵션이 그대로인가.
- IP 규칙 3 이 v4-mapped 접기와 루프백 접기를 섞지 않는가 — 접히는 경우는 셋뿐(점 표기 v4-mapped · `/128` 루프백 · 접지 않음).
- `check:dts` 가 실제로 3건을 잡았다가(고치기 전) 0건이 되는가 — 게이트가 빈 검사가 아님을 한 번 본다.

## 9. 발행 형태 검증 · 스모크 · 릴리스 · 문서

**드라이런 worktree** — 짧은 경로(`%TEMP%\ak2fb`)에 이 브랜치의 git worktree. 포그라운드 명령으로 만들고 끝나면 지운다.

1. `pnpm install --frozen-lockfile` — 로컬 admin-shared 0.3.0 이 peer 하한 밖인데 통과하는가(경고만인가)를 적는다.
2. `pnpm changeset version` — 세 패키지 0.4.0, admin-server peer 문자열 그대로, 1.0.0 없음.
3. 그 위에 임시 changeset(admin-shared minor)을 더해 다시 → 0.5.0, major 없음, peer 그대로.
4. 2 의 상태(0.4.0)로 되돌려 빌드 → `pnpm --filter … pack`(admin-shared · admin-server) → tarball `package.json` 의 peer `>=0.4.0 <1.0.0`, `private` 인 admin-server 도 pack 되는가.

**쓰는 쪽 스모크**(`%TEMP%\akss`) — 4 의 0.4.0 tarball 로. 앱 파일은 2f-1 플랜 Task 13 Step 3 + 2f-2a 플랜 Task 7 Step 3(정정된 `check.mjs` — refresh 뒤 쿠키 교체).

- `.env` 에 `DB_SSL=true` → `kysely migrate`(러너) → 기동 → `check.mjs` 흐름이 TLS 위에서 그대로.
- 러너 스크립트 `tls-check.mjs` — `Ssl_cipher` 있음 · 엉뚱한 CA 의 `DB_SSL_CA` 거부 · `DB_SSL=maybe` 가 이름만 담은 메시지로 실패.
- 설치된 admin-server 의 peer 표기, `skipLibCheck: false` `tsc` 에서 admin-shared 오류 0건.
- 로컬 MariaDB 로 못 재는 것(관리형 DB 의 CA 묶음 · 호스트 이름 · 소켓)은 README 에 적는다.

**changeset** `.changeset/admin-server-publish-prep.md`:

```md
---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': patch
---

**쓰는 쪽이 할 일:** 없음. admin-server 는 이제 `@ssworks/admin-shared` `>=0.4.0 <1.0.0` 을 peer 로 요구한다(첫 발행 때 같은 번호끼리 설치한다).

admin-server 첫 발행 준비(Phase 2 PR 2f-2b): `AdminDbConnection` 에 TLS(`ssl` — mariadb 드라이버 옵션 그대로) · 유닉스 소켓(`socketPath`), `host` 는 선택(둘 중 하나만 — 아니면 기동 실패). `adminDbConnectionFromEnv` 가 `DB_SSL=true`(시스템 CA · MariaDB 11.4.1+ 자체 서명은 드라이버 지문 검증) · `DB_SSL_CA`(PEM 파일 — 그 CA 로 검증) · `DB_SOCKET_PATH` 를 읽는다. 검증 끄기 · 호스트 이름 생략 · 클라이언트 인증서는 코드로(README). 앱과 마이그레이션 러너가 같은 풀 옵션을 쓴다. 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: `skipLibCheck: false` 에서 `dist/pagination.d.ts` 의 TS2536 3건(`createQuerySchema`)을 없앴다 — 추론 결과는 같다. IP 파서: `::ffff:` 는 점 표기 IPv4 앞에서만 떼고, 내장 IPv4 는 마지막 그룹에만, `::1` 접기는 `/128` 에만(`::1/64` 은 IPv6 망), v4-mapped 영역은 `::ffff:a.b.c.d` 꼴만 받는다.
```

**문서**

- admin-server README — "DB" env 표에 셋, TLS 절(11.4 무설정 TLS 와 지문 검증 · `require_secure_transport` / `REQUIRE SSL` 권장 · 코드 예제: 호스트 이름 생략 `checkServerIdentity: () => undefined`(Cloud SQL 처럼 인증서 이름이 접속 주소와 다를 때) · mTLS `key` · `cert` · 🔴 `rejectUnauthorized: false` 경고), 소켓 절(Windows 명명 파이프 · host · port · ssl 과 배타).
- `.changeset/README.md` "0.x 동안의 peer 범위" — admin-ui `^0` · admin-server `>=하한 <1.0.0` 과 이유, 하한 규칙(§5-3).
- CLAUDE.md — admin-server 규약에 peer 하한 규칙 한 줄 · 명령어에 `check:dts` · 진행표(2f-2b 완료, 다음 = PR #3 머지 전 Trusted Publisher 확인 → 확인용 앱 실서버 → 첫 발행).
- `docs/01-phase0.md` §8 · `docs/HANDOFF.md` — 지금 상태 · 다음 플랜 · "넘긴 것" 절의 닫음 표기(2a: TLS · TS2536, 2e-2: peer 하한, 2f-1: 파서) · 이 PR 이 넘긴 것.

## 10. 비범위 · 보류

- **admin-ui peer** — `^0` 그대로(0.2.0 · 0.3.0 이 이미 `^0` 으로 나갔다). 필요해지면 같은 규칙으로.
- **모드 문자열 env**(`DB_SSL_MODE`) · env 로 검증 끄기 — ③ T1. 코드 예제로.
- **소켓 실접속 테스트** — Windows · CI 서비스 컨테이너에서 닿지 않는다. 설정 단위 테스트 + README.
- **확인용 앱 실서버 확인 · `private` 해제 · 첫 발행** — main 병합 뒤 따로(사람이 push · 발행).
- **v4-mapped 16진 표기의 클라이언트 주소** — Node 는 점 표기만 낸다. 규칙 4 로 거부(fail-closed)되는 것으로 둔다.

## 11. 플랜에서 먼저 확인할 위험

1. **pnpm 이 importer 자신의 peer 를 로컬 버전과 대조하는가** — `workspace:>=0.4.0 <1.0.0` 인데 로컬 admin-shared 가 0.3.0. `strictPeerDependencies: false` · `autoInstallPeers: false` 라 많아야 경고로 본다. 오류면 Task 를 멈추고 보고(대안: 드라이런 worktree 에서만 바꿔 재고 PR #3 머지 뒤 별도 커밋 — 사용자 결정).
2. **pnpm 의 `workspace:` 치환** — 공백 든 범위가 pack 에서 그대로 나가는가(코드상 `workspace:` 만 떼어야 한다). §9 의 4 가 잰다.
3. **`check:dts` 의 admin-server 대상** — `dist/database/migrations/*.d.ts` 글롭을 tsconfig `include` 로. Windows · Linux 같은 결과.
4. **지문 검증 전제** — 비밀번호 있는 계정 · 11.4.1+ · 소켓 아님. 테스트 DB 의 root 와 새 계정 모두 만족. `REQUIRE SSL` 계정의 인증 플러그인이 지문 검증을 지원하는가(`mysql_native_password` — 3.5.4 `authentication.js` 가 지원).
5. **`tls.rootCertificates[0]` 거부 문구** — 드라이버가 TLS 오류를 어떤 코드로 내는지(단언은 "거부된다" 까지만, 문구는 적어 둔다).
6. **Windows 긴 경로 · 백그라운드 산출물** — worktree · 스모크는 짧은 `%TEMP%` 경로 · 포그라운드(메모 두 건).

## 12. 선행 문서 정정

- 2a 스펙 §14 — "`AdminDbConnection` 에 TLS · `socketPath` 가 없다 → 2f-2b 에서 더함(`host` 선택), peer `workspace:^0`(유지) → `workspace:>=0.4.0 <1.0.0`" 한 줄.
- 2f-1 스펙 §14 — "파서 규칙 넷(2f-2b 스펙 §5-5) — P1 의 함수 이름 · 단일 파서 원칙은 그대로" 한 줄.

## 13. 구현 중 정정

- **R1 — 용어 정정(최종 리뷰).** "시스템 CA" 는 Node 기본 CA 묶음이다(OS 신뢰 저장소가 아니다 — 사설 CA 는 DB_SSL_CA · NODE_EXTRA_CA_CERTS). README · 주석 · changeset 을 고쳤다. 동작은 같다.
