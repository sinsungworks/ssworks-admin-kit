# admin-kit 편집기 이미지 업로드 — 서버(PR 2h) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` 의 서버 쪽을 만든다 — admin-shared 계약(키 · 정책 · 스키마 · 오류 코드 · 감사 액션 · `collectUploadKeys`), admin-server `AdminUploadsModule`(`POST /admin/uploads?purpose=` 원시 이미지 → `sharp` 재인코딩 → 저장소 → 행, `DELETE /admin/uploads/:purpose/:yyyy/:mm/:file`, 첨부 도우미, 정리 잡), `AdminMediaModule`(`GET /media/...` 공개 중계 — 첨부된 것만), 저장소 인터페이스 + 파일 시스템 + S3 호환(서브패스), 장 `0013_uploads`, 용도 → 권한 가드 선언, 약관 발행의 첨부.

**Architecture:** 편집 중 그림은 브라우저 `blob:` 이고 서버는 저장 단계에서만 본다(스펙 §1). 업로드 한 건은 "스트림 읽기(415 · 413) → 미첨부 상한(409) → 재인코딩(문 · 트랜잭션 밖) → 저장소 PUT → 짧은 INSERT" 이고, 본문 저장(약관 발행 · 앱 라우트)이 같은 트랜잭션에서 `attachUploads` 로 본문 속 키를 그 문서에 붙인다. 중계는 신원을 읽지 않고 첨부된 행만 200 이다. 저장 실패의 되돌림(클라이언트 `DELETE`)이 못 지운 것은 정리 잡이 치운다. 권한은 전역 가드의 넷째 선언 `@RequireUploadPurpose()` — 용도(쿼리 · 경로)를 코어 옵션 `uploads.purposes` 로 푼다.

**Tech Stack:** NestJS 12.1(ESM · NodeNext) · Kysely 0.29 + MariaDB 11.4 / 12.3 · zod 4 · sharp 0.35 · `@aws-sdk/client-s3` 3(선택 peer) · vitest 5 · supertest · TypeScript 6.0

**Spec:** `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` — §1 · §2-1 ①~⑧ · §2-2 U1~U14 · §2-3 S1~S6 · §4-1 · §4-2 · §5 · §6 · §7 · §8 · §9-1 · §9-2 · §9-4 · §10 · §12. 어긋나면 스펙이 이기되, 이 플랜이 스펙을 **정정**하는 자리는 각 Task 에 `스펙 정정` 으로 적었고 Task 17 이 §13 에 옮긴다. 정본은 ringside(`C:\workspace\ssworks-ringside` — 읽기만) 의 §3 표 파일들이다. 직전 서버 플랜 `docs/superpowers/plans/2026-10-15-admin-server-ip-access.md`(모듈 · 장 · HTTP 테스트 모양)을 참고한다.

**구현자 규칙(모든 Task):** 테스트를 먼저 만들고 **구현 전에 돌려 RED 를 보고서에 붙인다**(실패 메시지 몇 줄 · 명령과 출력). 그다음 구현 · GREEN · 커밋. 🔴 표시가 붙은 테스트는 구현 뒤 해당 줄을 일부러 되돌려 RED 를 한 번 더 보고 되돌린다. 리뷰어는 이 플랜의 해당 Task 와 Global Constraints 를 **먼저 다 읽고** 리뷰한다.

## Global Constraints

- ESM 전용 · `module: NodeNext`. 내부 상대 import 는 `.js` 확장자. `console.log` 금지(`Logger.warn` · `error` · 정리 건수는 `Logger.log`).
- `admin-server/src` 는 `import type` 분리 규칙의 예외다(DI 메타데이터) — 단 데코레이터가 붙은 시그니처에 쓰는 **인터페이스 · 타입 별칭은 `import type`**(TS1272: `AdminPrincipal` · `ResolvedUploadsConfig` · `Request` · `Response` · `UploadPurposeQuery` …), DI 로 받는 **클래스는 일반 import**(`AdminUploadsService` · `EncodeGate`).
- 정본에서 옮긴 파일은 머리 주석에 `정본:` · `바꾼 점:` · `🔴` 를 적는다(ringside 경로는 `ssworks-ringside apps/api/src/uploads/...` 식으로).
- 🔴 **정규식에 백슬래시 문자 클래스(`\d` · `\s` · `\b`)를 쓰지 않는다** — `[0-9]` · `[ \t]` · `[^>]*` 로 적는다(Write/Edit 도구가 `\u` 꼴을 디코드한다 — 메모리 규칙).
- 🔴 **업로드 요청 순서**(스펙 U3): `readImageBody`(Content-Type · Content-Encoding 415 → 길이 413) → 미첨부 셈(비잠금 · 트랜잭션 없음) → `EncodeGate.run(encodeUpload)` → 저장소 `put`(던지면 503) → INSERT(실패면 객체 best-effort 삭제). **트랜잭션이 없다**(문장 하나).
- 🔴 **첨부는 트랜잭션 안 · `uploads` 가 잠금 순서의 마지막**(스펙 §5-6): 약관은 가드 행 → `legalDocuments` INSERT → `attachUploads`. 첨부의 읽기는 `storageKey IN (...) ORDER BY uploadNo FOR UPDATE` 하나다 — 비잠금 SELECT 를 두지 않는다(스냅샷 격리 ON 에서 1020).
- 🔴 **중계는 첨부된 행만**(`refType IS NOT NULL AND deletedAt IS NULL`) — 어떤 경로로도 미첨부 · 지움 표시를 내보내지 않는다. 신원 · 쿠키를 읽지 않는다.
- 🔴 **`.` 진입점은 `storage/s3.ts` · `@aws-sdk/client-s3` 를 import 하지 않는다**(Task 5 정적 검사). `./runner` 는 `sharp` 도 끌어오지 않는다(`runner-graph.test.ts`).
- 🔴 저장소 호출은 서비스가 감싼다 — `put · get · delete` 가 던지면 `uploadUnavailable()`(503) + `logger.warn`. 저장소 예외가 그 바깥으로 나가지 않는다(정리 잡은 그 행을 남기고 센다).
- 이름(스펙 §4): 키 `UPLOAD_KEY_PATTERN` · 용도 `UPLOAD_PURPOSE_PATTERN` · `DEFAULT_MEDIA_PATH = '/api/media'` · `DEFAULT_UPLOAD_POLICY` · 토큰 `ADMIN_UPLOADS_CONFIG` · 메타 키 `REQUIRE_UPLOAD_PURPOSE = 'admin-kit:upload-purpose'` · 선언 `@RequireUploadPurpose()` · 장 `0013_uploads` · 표 `uploads`(열 `upload_no · storage_key · purpose · uploaded_by_user_no · bytes · width · height · ref_type · ref_id · attached_at · deleted_at · created_at`) · 인덱스 `uq_uploads_storage_key` · `idx_uploads_uploader` · `idx_uploads_ref` · `idx_uploads_deleted` · FK `fk_uploads_uploaded_by` · 라우트 `@Controller('uploads')` · `@Controller('media')` · 감사 `upload.create` 「이미지 올리기」 · `upload.delete` 「이미지 지우기」 · 대상 `upload` 「업로드」 · 오류 코드 여섯(`ERR_UPLOAD_*`).
- 문구(한 곳씩): admin-server `uploads/errors.ts` `UPLOAD_MESSAGES`: `unsupportedType` = `지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)` · `tooLarge` = `이미지가 너무 큽니다.` · `invalidImage` = `이미지를 읽을 수 없습니다.` · `limit` = `이미지 수가 한도를 넘었습니다.` · `notFound` = `이미지를 찾을 수 없습니다.` · `unavailable` = `이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.`. admin-shared `UPLOAD_SCHEMA_MESSAGES.purpose` = `용도는 영문 · 숫자 · _ 1~32자여야 합니다.`. 🔴 `tooLarge` 문구에 숫자를 박지 않는다 — 상한은 정책이라 `details.maxBytes` 로 싣는다(스펙 §6 표의 "(장당 최대 10MB)" 를 정정 — Task 17).
- 테스트: 단위 · DB 없는 HTTP 는 `*.test.ts`(`pnpm check`), 실 MariaDB 는 `*.db.test.ts`(`pnpm db:test:up` 컨테이너). DB 테스트 하나는 `pnpm --filter @ssworks/admin-server test:db <이름>`(`--` 없이), 단위는 `pnpm --filter @ssworks/admin-server test <이름>` · `pnpm --filter @ssworks/admin-shared test <이름>`. lint 는 루트 `pnpm lint`, 타입은 `pnpm --filter <패키지> typecheck`.
- 🔴 `pnpm test:db` 는 한 번에 하나만. 🔴 `createTestDatabase()` 는 `beforeAll` 에서만. `seedRole` 기본 권한은 `['*']` 이므로 늘 `permissions` 를 명시한다. bigint 가 든 HTTP 본문은 `stringifyJSON` 으로 보낸다.
- 🔴 admin-shared 를 고친 뒤에는 **`pnpm --filter @ssworks/admin-shared build`** 를 다시 돌려야 admin-server · admin-ui 가 본다(`dist/` import). Task 1 · 2 끝에 반드시.
- 테스트 픽스처 이미지는 파일로 두지 않고 **테스트 안에서 `sharp` 로 만든다**(`sharp({ create })` · `sharp([a, b], { join: { animated: true } })`) — 바이너리를 저장소에 넣지 않는다.
- `sharp` · `@aws-sdk/client-s3` 는 admin-server 의 devDependency 이기도 하다 — `pnpm check` 에서 실 sharp 가 돈다. CI(ubuntu) · Windows 로컬 모두 사전 빌드 바이너리(`@img/sharp-*`)라 빌드 스크립트 승인이 필요 없다. `pnpm install` 이 "Ignored build scripts" 를 띄우면 `pnpm-workspace.yaml` `allowBuilds` 에 그 패키지를 `true` 로 더한다.

---

### Task 1: admin-shared 계약 `uploads.ts`

**Files:**

- Create: `packages/admin-shared/src/uploads.ts`
- Create: `packages/admin-shared/src/uploads.test.ts`
- Modify: `packages/admin-shared/src/index.ts`(끝에 export 블록)

- [ ] **Step 1: 테스트를 쓴다** — `packages/admin-shared/src/uploads.test.ts`

````ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEDIA_PATH,
  DEFAULT_UPLOAD_POLICY,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_PURPOSE_PATTERN,
  UPLOAD_SCHEMA_MESSAGES,
  adminUploadCreatedSchema,
  collectUploadKeys,
  isUploadKey,
  uploadPurposeOf,
  uploadPurposeQuerySchema,
  uploadUrl,
} from './uploads.js'

const KEY = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'
const KEY2 = 'legal/2026/11/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.webp'

describe('키 모양(스펙 U1)', () => {
  it('용도 · 연월 · base64url 32자 · .webp — 대소문자를 가른다', () => {
    expect(isUploadKey(KEY)).toBe(true)
    expect(isUploadKey('notice_v2/2026/01/abcdefghijklmnopqrstuvwxyz012345.webp')).toBe(true)
    expect(isUploadKey('legal/2026/11/abc-_ABC0123456789abcdefghijklmn.webp')).toBe(true)
  })

  it('🔴 형식 밖 — 용도의 `-` · 한 자리 월 · 31자 · 33자 · 다른 확장자 · 대문자 확장자 · 앞뒤 공백 · 경로 탐색', () => {
    for (const bad of [
      'a-b/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.png',
      'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.WEBP',
      ` ${KEY}`,
      `${KEY} `,
      '../2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      `${KEY}/..`,
      'legal/2026/11/../AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
      `${'A'.repeat(33)}/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp`,
      '',
    ]) {
      expect(isUploadKey(bad), bad).toBe(false)
    }
  })

  it('uploadPurposeOf · uploadUrl · 용도 패턴', () => {
    expect(uploadPurposeOf(KEY)).toBe('legal')
    expect(uploadPurposeOf('nope')).toBeNull()
    expect(uploadUrl(KEY)).toBe(`/api/media/${KEY}`)
    expect(uploadUrl(KEY, '/media')).toBe(`/media/${KEY}`)
    expect(DEFAULT_MEDIA_PATH).toBe('/api/media')
    expect(UPLOAD_PURPOSE_PATTERN.test('A'.repeat(32))).toBe(true)
    expect(UPLOAD_PURPOSE_PATTERN.test('A'.repeat(33))).toBe(false)
    expect(UPLOAD_PURPOSE_PATTERN.test('bad kind')).toBe(false)
    expect(UPLOAD_PURPOSE_PATTERN.test('약관')).toBe(false)
  })
})

describe('collectUploadKeys(스펙 §4-1 — 렌더 위에서 센다)', () => {
  it('렌더된 <img src> 중 우리 경로 · 키 모양만 — 처음 나온 순서 · 겹침 없음 · 제목 있는 그림도', () => {
    const md = [
      `![a](/api/media/${KEY})`,
      `![b](/api/media/${KEY2} "제목")`,
      `![a 다시](/api/media/${KEY})`,
    ].join('\n\n')
    expect(collectUploadKeys(md)).toEqual([KEY, KEY2])
  })

  it('🔴 코드 블록 · 인라인 코드 · 링크 · 다른 경로 · data: · 쿼리가 붙은 것은 키가 아니다', () => {
    const md = [
      '```',
      `![x](/api/media/${KEY})`,
      '```',
      `\`![y](/api/media/${KEY2})\``,
      `[링크](/api/media/${KEY2})`,
      `![z](/files/${KEY})`,
      '![d](data:image/png;base64,AAAA)',
      `![q](/api/media/${KEY}?x=1)`,
      `![f](/api/media/${KEY}#top)`,
    ].join('\n\n')
    expect(collectUploadKeys(md)).toEqual([])
  })

  it('글자 문단 속 · 목록 항목 · 참조식 그림도 센다(렌더가 <img> 를 내는 자리면 어디든)', () => {
    const md = [
      `앞 ![a](/api/media/${KEY}) 뒤`,
      `- 항목 ![b](/api/media/${KEY2})`,
      '![c][ref]',
      `[ref]: /api/media/${KEY}`,
    ].join('\n\n')
    expect(collectUploadKeys(md)).toEqual([KEY, KEY2])
  })

  it('mediaPath 인자 — 다른 접두사로 세고, 어긋나면 비어 있다', () => {
    const md = `![a](/media/${KEY})`
    expect(collectUploadKeys(md, '/media')).toEqual([KEY])
    expect(collectUploadKeys(md)).toEqual([])
  })

  it('빈 본문은 []', () => {
    expect(collectUploadKeys('')).toEqual([])
    expect(collectUploadKeys('그림 없음')).toEqual([])
  })
})

describe('정책 · 스키마(스펙 S6 · §4-1)', () => {
  it('기본값 · 얼림 · 받는 형식 넷', () => {
    expect(DEFAULT_UPLOAD_POLICY).toEqual({
      maxBytes: 10_485_760,
      maxLongEdge: 2048,
      maxInputPixels: 40_000_000,
      maxFrames: 100,
      webpQuality: 82,
      maxPerBody: 20,
      maxPendingPerUser: 50,
      pendingTtlHours: 24,
    })
    expect(Object.isFrozen(DEFAULT_UPLOAD_POLICY)).toBe(true)
    expect(UPLOAD_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    expect(Object.isFrozen(UPLOAD_SCHEMA_MESSAGES)).toBe(true)
  })

  it('uploadPurposeQuerySchema — 형식 밖 · 빠짐은 거부, 문구는 UPLOAD_SCHEMA_MESSAGES.purpose', () => {
    expect(uploadPurposeQuerySchema.parse({ purpose: 'legal' })).toEqual({ purpose: 'legal' })
    const bad = uploadPurposeQuerySchema.safeParse({ purpose: 'bad kind' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error.issues[0]?.message).toBe(UPLOAD_SCHEMA_MESSAGES.purpose)
    expect(uploadPurposeQuerySchema.safeParse({}).success).toBe(false)
  })

  it('adminUploadCreatedSchema — 키 모양 · 양의 정수', () => {
    const created = { key: KEY, url: `/api/media/${KEY}`, width: 10, height: 20, bytes: 300 }
    expect(adminUploadCreatedSchema.parse(created)).toEqual(created)
    expect(adminUploadCreatedSchema.safeParse({ ...created, key: 'x' }).success).toBe(false)
    expect(adminUploadCreatedSchema.safeParse({ ...created, width: 0 }).success).toBe(false)
    expect(adminUploadCreatedSchema.safeParse({ ...created, bytes: 1.5 }).success).toBe(false)
  })
})
````

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @ssworks/admin-shared test uploads`
Expected: FAIL — `Cannot find module './uploads.js'`

- [ ] **Step 3: 구현** — `packages/admin-shared/src/uploads.ts`

```ts
import { z } from 'zod'
import { renderMarkdown } from './markdown.js'

// 편집기 이미지 업로드 계약 — admin-server(업로드 · 첨부 · 중계)와 admin-ui(useImageAttachments)가 같은 키 모양 · 정책 · 키 모으기를
// 본다(스펙 docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md §2-2 U1 · §2-3 S6 · §4-1).
//
// 정본: ssworks-ringside packages/shared/src/contracts/uploads.ts(키 · 받는 형식)
//       + packages/shared/src/uploads/render.ts(collectMediaKeys — 렌더 출력의 <img src> 에서 키를 모은다)
// 바꾼 점:
//  - 키 접두사가 `post|article` 고정이 아니라 **용도**다(서버 옵션 uploads.purposes — 약관 종류와 같은 폭 ^[A-Za-z0-9_]{1,32}$).
//  - 정책 기본값(DEFAULT_UPLOAD_POLICY)을 여기 둔다 — 서버 옵션이 덮고 클라이언트는 같은 값으로 **먼저** 거른다(최종 판정은 서버).
//  - collectUploadKeys 는 HTML 이 아니라 Markdown 을 받아 안에서 renderMarkdown 을 부른다 — 서버 첨부 · 본문당 장수 · 클라이언트
//    남은 칸이 같은 함수 하나를 쓴다. mediaPath 가 인자다(기본 '/api/media').
// 🔴 키 패턴은 경로 탐색 문자(`..` · 공백 · `%` · `?`)를 품을 수 없다 — 저장소 · 중계 · 첨부가 이 패턴을 지난 키만 받는다.
// 🔴 정규식에 백슬래시 문자 클래스를 쓰지 않는다(`[0-9]`) — 저장소 도구 규약.

export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number]

/** 용도 — 영숫자 · `_` 1~32자(약관 종류와 같은 폭). 키의 첫 조각이자 서버 옵션 uploads.purposes 의 키 */
export const UPLOAD_PURPOSE_PATTERN = /^[A-Za-z0-9_]{1,32}$/
/** `<용도>/<yyyy>/<mm>/<base64url 32자>.webp` — 저장 형식은 언제나 WebP(서버가 다시 만든다) */
export const UPLOAD_KEY_PATTERN =
  /^([A-Za-z0-9_]{1,32})\/[0-9]{4}\/[0-9]{2}\/[A-Za-z0-9_-]{32}\.webp$/
/** 본문에 적는 공개 경로의 기본값 — 앱 전역 접두사 `api` + 중계 컨트롤러 `media` */
export const DEFAULT_MEDIA_PATH = '/api/media'

export interface UploadPolicy {
  /** 장당 상한(원본 · 재인코딩 결과 둘 다) — 바이트 */
  maxBytes: number
  /** 긴 변이 이보다 크면 비율을 지켜 줄인다(px). 키우지는 않는다 */
  maxLongEdge: number
  /** 너비 × 프레임 높이 × 프레임 수 상한 — 풀기 전에 머리로 검사한다(픽셀 폭탄) */
  maxInputPixels: number
  /** 움짤 프레임 상한 */
  maxFrames: number
  /** WebP 품질 1~100 */
  webpQuality: number
  /** 본문 하나에 넣을 수 있는 서로 다른 그림 수 — 클라이언트가 먼저, 서버 첨부가 최종 */
  maxPerBody: number
  /** 사람당 미첨부(올렸지만 아직 어느 본문에도 붙지 않은) 상한 */
  maxPendingPerUser: number
  /** 미첨부가 이 시간을 넘기면 정리 잡이 지움 표시한다 */
  pendingTtlHours: number
}

export const DEFAULT_UPLOAD_POLICY: Readonly<UploadPolicy> = Object.freeze({
  maxBytes: 10_485_760,
  maxLongEdge: 2048,
  maxInputPixels: 40_000_000,
  maxFrames: 100,
  webpQuality: 82,
  maxPerBody: 20,
  maxPendingPerUser: 50,
  pendingTtlHours: 24,
})

export function isUploadKey(value: string): boolean {
  return UPLOAD_KEY_PATTERN.test(value)
}

/** 키의 용도(첫 조각) — 키 모양이 아니면 null */
export function uploadPurposeOf(key: string): string | null {
  return UPLOAD_KEY_PATTERN.exec(key)?.[1] ?? null
}

/** 본문 · 응답에 적는 공개 주소 `<mediaPath>/<키>` — 서버 응답 url 과 클라이언트 셈이 같은 함수다 */
export function uploadUrl(key: string, mediaPath: string = DEFAULT_MEDIA_PATH): string {
  return `${mediaPath}/${key}`
}

/** markdown-it(html:false) 의 그림 출력 모양 — `<img src="…" alt="…">`. 속성 값은 escapeHtml 을 거쳐 `"` 가 없다 */
const IMG_SRC = /<img src="([^"]*)"/g

/**
 * Markdown 본문의 우리 그림 키 — renderMarkdown 출력의 `<img src>` 중 `<mediaPath>/<키 모양>` 인 것만, 처음 나온 순서 · 겹침 없음.
 * 🔴 렌더를 거치므로 코드 블록 · 인라인 코드 안의 `![](…)` 글자와 링크 `[x](/api/media/…)`(`<a>`)는 키가 아니다 — "보이는 그림 =
 *    첨부하는 그림"(서버 첨부 · 본문당 장수 · 클라이언트 남은 칸이 모두 이 함수). 쿼리 · 조각이 붙은 주소는 키 모양이 아니라 뺀다.
 */
export function collectUploadKeys(
  markdown: string,
  mediaPath: string = DEFAULT_MEDIA_PATH,
): string[] {
  const prefix = `${mediaPath}/`
  const keys = new Set<string>()
  for (const match of renderMarkdown(markdown).matchAll(IMG_SRC)) {
    const src = match[1] ?? ''
    if (!src.startsWith(prefix)) continue
    const key = src.slice(prefix.length)
    if (UPLOAD_KEY_PATTERN.test(key)) keys.add(key)
  }
  return [...keys]
}

/** 스키마 문구 — 서버 400 의 칸 오류로 나간다(admin-server 문구 덮기 표 `uploadsSchema`) */
export const UPLOAD_SCHEMA_MESSAGES = Object.freeze({
  purpose: '용도는 영문 · 숫자 · _ 1~32자여야 합니다.',
})

export const uploadPurposeSchema = z
  .string()
  .regex(UPLOAD_PURPOSE_PATTERN, UPLOAD_SCHEMA_MESSAGES.purpose)

/** `POST /admin/uploads?purpose=` 의 쿼리 */
export const uploadPurposeQuerySchema = z.object({ purpose: uploadPurposeSchema })
export type UploadPurposeQuery = z.infer<typeof uploadPurposeQuerySchema>

/** 업로드 응답 — `url` 은 서버가 `uploadUrl(key, mediaPath)` 로 조립한다. 클라이언트는 url 만 본문에 넣는다 */
export const adminUploadCreatedSchema = z.object({
  key: z.string().regex(UPLOAD_KEY_PATTERN),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
})
export type AdminUploadCreated = z.infer<typeof adminUploadCreatedSchema>
```

- [ ] **Step 4: index export** — `packages/admin-shared/src/index.ts` 끝(IP 접근 제어 블록 뒤)에 더한다

```ts
export {
  UPLOAD_CONTENT_TYPES,
  UPLOAD_PURPOSE_PATTERN,
  UPLOAD_KEY_PATTERN,
  DEFAULT_MEDIA_PATH,
  DEFAULT_UPLOAD_POLICY,
  UPLOAD_SCHEMA_MESSAGES,
  isUploadKey,
  uploadPurposeOf,
  uploadUrl,
  collectUploadKeys,
  uploadPurposeSchema,
  uploadPurposeQuerySchema,
  adminUploadCreatedSchema,
  type UploadContentType,
  type UploadPolicy,
  type UploadPurposeQuery,
  type AdminUploadCreated,
} from './uploads.js'
```

- [ ] **Step 5: GREEN · 빌드**

Run: `pnpm --filter @ssworks/admin-shared test uploads && pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared build`
Expected: 테스트 전부 PASS · 빌드 성공(`dist/uploads.js` · `dist/uploads.d.ts`)

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-shared/src/uploads.ts packages/admin-shared/src/uploads.test.ts packages/admin-shared/src/index.ts
git commit -m "feat(admin-shared): 업로드 계약 — 키 모양 · 정책 기본값 · 스키마 · collectUploadKeys(PR 2h Task 1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: admin-shared 오류 코드 여섯 · 감사 액션 셋

**Files:**

- Modify: `packages/admin-shared/src/error-codes.ts`(`CommonErrorCodes` · `COMMON_ERROR_STATUS`)
- Modify: `packages/admin-shared/src/audit.ts`(`CoreAuditActions` · `CoreAuditTargets` · 라벨 둘)
- Modify: `packages/admin-shared/src/audit.test.ts`(개수 · 목록)
- Create: `packages/admin-shared/src/error-codes.uploads.test.ts`

- [ ] **Step 1: 테스트** — `packages/admin-shared/src/error-codes.uploads.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  CORE_AUDIT_ACTION_LABELS,
  CORE_AUDIT_TARGET_LABELS,
  CoreAuditActions,
  CoreAuditTargets,
} from './audit.js'
import { COMMON_ERROR_STATUS, CommonErrorCodes } from './error-codes.js'

describe('업로드 오류 코드(스펙 §6 표)', () => {
  it('여섯 코드와 상태', () => {
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE]).toBe(415)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_TOO_LARGE]).toBe(413)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE]).toBe(400)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_LIMIT]).toBe(409)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_NOT_FOUND]).toBe(404)
    expect(COMMON_ERROR_STATUS[CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE]).toBe(503)
  })
})

describe('업로드 감사 카탈로그(스펙 U13)', () => {
  it('액션 둘 · 대상 하나 · 라벨', () => {
    expect(CoreAuditActions.UPLOAD_CREATE).toBe('upload.create')
    expect(CoreAuditActions.UPLOAD_DELETE).toBe('upload.delete')
    expect(CoreAuditTargets.UPLOAD).toBe('upload')
    expect(CORE_AUDIT_ACTION_LABELS['upload.create']).toBe('이미지 올리기')
    expect(CORE_AUDIT_ACTION_LABELS['upload.delete']).toBe('이미지 지우기')
    expect(CORE_AUDIT_TARGET_LABELS.upload).toBe('업로드')
  })
})
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @ssworks/admin-shared test error-codes.uploads`
Expected: FAIL — `ERR_UPLOAD_UNSUPPORTED_TYPE` 가 `undefined`

- [ ] **Step 3: 구현** — `error-codes.ts` 의 `CommonErrorCodes` 에서 `ERR_TEAM_HAS_IP_RULES` 줄 뒤(객체 닫기 전)에:

```ts

  // ── 업로드(편집기 이미지 — 스펙 2026-11-01-admin-kit-image-uploads) ─────────────────────
  /** Content-Type · 매직 바이트가 JPEG · PNG · WebP · GIF 밖, 또는 Content-Encoding 이 붙은 본문 */
  ERR_UPLOAD_UNSUPPORTED_TYPE: 'ERR_UPLOAD_UNSUPPORTED_TYPE',
  /** 원본 또는 재인코딩 결과가 장당 상한을 넘는다 — `details.maxBytes` */
  ERR_UPLOAD_TOO_LARGE: 'ERR_UPLOAD_TOO_LARGE',
  /** 머리를 못 읽음 · 픽셀 · 프레임 초과 · 디코드 실패 · 시간 초과 — `details.reason` */
  ERR_UPLOAD_INVALID_IMAGE: 'ERR_UPLOAD_INVALID_IMAGE',
  /** 사람당 미첨부 상한 · 본문당 장수 초과 — `details.limit` */
  ERR_UPLOAD_LIMIT: 'ERR_UPLOAD_LIMIT',
  /** 없음 · 남의 것 · 첨부됨 · 지움 표시 · 용도 불일치 — 🔴 사유를 가르지 않는다(열거 방어) */
  ERR_UPLOAD_NOT_FOUND: 'ERR_UPLOAD_NOT_FOUND',
  /** 저장소 꺼짐 · 오류 · 재인코딩 대기 초과 */
  ERR_UPLOAD_UNAVAILABLE: 'ERR_UPLOAD_UNAVAILABLE',
```

`COMMON_ERROR_STATUS` 의 `ERR_TEAM_HAS_IP_RULES` 줄 뒤에:

```ts

  [CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE]: 415,
  [CommonErrorCodes.ERR_UPLOAD_TOO_LARGE]: 413,
  [CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE]: 400,
  [CommonErrorCodes.ERR_UPLOAD_LIMIT]: 409,
  [CommonErrorCodes.ERR_UPLOAD_NOT_FOUND]: 404,
  [CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE]: 503,
```

`audit.ts`: `CoreAuditActions` 의 `IP_ACCESS_DELETE` 줄 뒤에 `UPLOAD_CREATE: 'upload.create',` · `UPLOAD_DELETE: 'upload.delete',`. `CoreAuditTargets` 의 `IP_ACCESS_RULE` 줄 뒤에 `UPLOAD: 'upload',`. `CORE_AUDIT_ACTION_LABELS` 끝에 `'upload.create': '이미지 올리기',` · `'upload.delete': '이미지 지우기',`. `CORE_AUDIT_TARGET_LABELS` 끝에 `upload: '업로드',`. 머리 주석 "코어 액션은 … IP(2f-1)" 뒤에 ` · 업로드(2h)` 를 더한다.

- [ ] **Step 4: 기존 개수 테스트 갱신** — `audit.test.ts`

- 15행 제목 `액션 33 · 대상 6` → `액션 35 · 대상 7`, 16행 `toHaveLength(33)` → `toHaveLength(35)`.
- `Object.values(CoreAuditTargets)` 기대 배열 끝(`'ipAccessRule'` 뒤)에 `'upload'`.
- `CORE_AUDIT_TARGET_LABELS` 정렬 목록의 `'team'` 과 `'user'` 사이에 `'upload'`.
- 122행 `catalog.ACTION_VALUES` `toHaveLength(34)` → `toHaveLength(36)`. 그 아래 `catalog.TARGET_VALUES` 기대 배열의 `'ipAccessRule'` 뒤에 `'upload'`(프로젝트 대상 `'post'` 앞).

- [ ] **Step 5: GREEN · 빌드**

Run: `pnpm --filter @ssworks/admin-shared test && pnpm --filter @ssworks/admin-shared typecheck && pnpm --filter @ssworks/admin-shared build`
Expected: 전부 PASS(`COMMON_ERROR_STATUS` 는 `Record<CommonErrorCode, number>` 라 빠뜨리면 typecheck 가 멈춘다)

- [ ] **Step 6: admin-ui 가 깨지지 않았는지**

Run: `pnpm --filter @ssworks/admin-ui test`
Expected: PASS(admin-ui 는 코어 액션을 열거하지 않는다 — 묶음은 접두사다. `upload.*` 는 개별 항목으로 보인다. 묶음 추가는 PR #3k)

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-shared/src/error-codes.ts packages/admin-shared/src/audit.ts packages/admin-shared/src/audit.test.ts packages/admin-shared/src/error-codes.uploads.test.ts
git commit -m "feat(admin-shared): 업로드 오류 코드 여섯 · 감사 액션 upload.create/delete · 대상 upload(PR 2h Task 2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: admin-server 의존성 · 서브패스 선언

**Files:**

- Modify: `packages/admin-server/package.json`(`exports` · `peerDependencies` · `peerDependenciesMeta` · `devDependencies`)
- Modify: `packages/admin-server/README.md`(「설치」 — Task 17 에서 본문, 여기서는 peer 줄만)

- [ ] **Step 1: package.json** — 아래를 더한다(기존 키 유지 · 알파벳 순)

```jsonc
"exports": {
  // 기존 ".", "./runner", "./migrations/*" 다음
  "./storage/s3": {
    "types": "./dist/storage/s3.d.ts",
    "import": "./dist/storage/s3.js"
  },
  "./package.json": "./package.json"
},
"peerDependencies": {
  // 기존 + 아래 둘
  "@aws-sdk/client-s3": "^3.0.0",
  "sharp": "^0.35.0"
},
"peerDependenciesMeta": {
  "@aws-sdk/client-s3": { "optional": true }
},
"devDependencies": {
  // 기존 + 아래 둘(정확 판은 `npm view` 최신 — 2026-11-01 기준 3.1161.0 · 0.35.5)
  "@aws-sdk/client-s3": "^3.1161.0",
  "sharp": "^0.35.5"
}
```

- [ ] **Step 2: 설치 · 확인**

Run: `pnpm install` (루트)
Expected: lockfile 갱신. "Ignored build scripts" 경고가 뜨면 `pnpm-workspace.yaml` `allowBuilds` 에 그 패키지 이름을 `true` 로 더하고 다시 `pnpm install`.

Run: `node -e "import('sharp').then(m => m.default({ create: { width: 2, height: 2, channels: 3, background: '#000' } }).webp().toBuffer()).then(b => console.log(b.length > 0))"` (`packages/admin-server` 폴더에서)
Expected: `true`

- [ ] **Step 3: 기존 검사가 그대로 초록인지**

Run: `pnpm --filter @ssworks/admin-server test && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS(아직 import 하는 코드가 없다 — `check:dts` 의 `dist/storage/s3.d.ts` 는 Task 5 에서 더한다)

- [ ] **Step 4: 커밋**

```bash
git add packages/admin-server/package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore(admin-server): sharp · @aws-sdk/client-s3(선택) peer · ./storage/s3 서브패스 선언(PR 2h Task 3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 저장소 인터페이스 · 파일 시스템 구현 · 시험용 메모리 저장소

**Files:**

- Create: `packages/admin-server/src/storage/object-storage.ts`
- Create: `packages/admin-server/src/storage/file-system.ts`
- Create: `packages/admin-server/src/storage/file-system.test.ts`
- Create: `packages/admin-server/src/test-support/memory-storage.ts`

- [ ] **Step 1: 테스트** — `storage/file-system.test.ts`

```ts
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileSystemStorage } from './file-system.js'

const KEY = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ak-fs-storage-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createFileSystemStorage(스펙 S2)', () => {
  it('put → get 왕복 — 하위 폴더를 만들고 내용 · 길이가 같다, 같은 키에 다시 쓰면 덮는다', async () => {
    const storage = createFileSystemStorage({ root })
    await storage.put(KEY, Buffer.from('first'), 'image/webp')
    const first = await storage.get(KEY)
    expect(first).not.toBeNull()
    expect(first?.contentLength).toBe(5)
    expect((await drain(first!.body)).toString()).toBe('first')

    await storage.put(KEY, Buffer.from('second!'), 'image/webp')
    const second = await storage.get(KEY)
    expect(second?.contentLength).toBe(7)
    expect((await drain(second!.body)).toString()).toBe('second!')
  })

  it('🔴 임시 파일이 남지 않는다 — put 은 .tmp 에 쓰고 rename 한다', async () => {
    const storage = createFileSystemStorage({ root })
    await storage.put(KEY, Buffer.from('x'), 'image/webp')
    expect(readdirSync(join(root, 'legal', '2026', '11'))).toEqual([
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp',
    ])
  })

  it('없는 키는 null · delete 는 없어도 성공(멱등)', async () => {
    const storage = createFileSystemStorage({ root })
    expect(await storage.get(KEY)).toBeNull()
    await expect(storage.delete(KEY)).resolves.toBeUndefined()
    await storage.put(KEY, Buffer.from('x'), 'image/webp')
    await storage.delete(KEY)
    expect(await storage.get(KEY)).toBeNull()
    await expect(storage.delete(KEY)).resolves.toBeUndefined()
  })

  it('🔴 root 밖을 가리키는 키는 세 동작 모두 던진다(경로 탐색)', async () => {
    const storage = createFileSystemStorage({ root })
    for (const bad of ['../outside.webp', 'legal/../../x.webp', '/etc/passwd']) {
      await expect(storage.put(bad, Buffer.from('x'), 'image/webp')).rejects.toThrow('root 밖')
      await expect(storage.get(bad)).rejects.toThrow('root 밖')
      await expect(storage.delete(bad)).rejects.toThrow('root 밖')
    }
  })

  it('폴더를 가리키는 키의 get 은 null', async () => {
    const storage = createFileSystemStorage({ root })
    await storage.put(KEY, Buffer.from('x'), 'image/webp')
    expect(await storage.get('legal/2026/11')).toBeNull()
  })
})
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test file-system`
Expected: FAIL — `Cannot find module './file-system.js'`

- [ ] **Step 3: 인터페이스** — `storage/object-storage.ts`

```ts
import type { Readable } from 'node:stream'

// 저장소 추상(스펙 S1) — 업로드 서비스 · 중계 · 정리가 이 셋만 부른다. 구현은 파일 시스템(file-system.ts) · S3 호환(s3.ts — 서브패스) ·
// 시험용 메모리(test-support/memory-storage.ts).
// 정본: ssworks-ringside packages/db/src/uploads/storage.ts `ObjectStorage`
// 바꾼 점: `list` 가 없다(고아 객체 대조는 비범위 — 스펙 §11). 키는 admin-shared UPLOAD_KEY_PATTERN 을 지난 것만 온다 — 구현은 그래도
//   경로 탐색을 한 번 더 막는다(저장소를 앱 코드가 직접 부를 수도 있다).
// 🔴 서비스가 호출을 감싼다(던지면 503 ERR_UPLOAD_UNAVAILABLE) — 구현은 자기 오류를 그대로 던지면 된다.

export interface StoredObject {
  body: Readable
  contentLength: number
}

export interface AdminObjectStorage {
  /** 같은 키에 다시 쓰면 덮는다 */
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** 없으면 null. 스트림은 부르는 쪽이 소비 · 파기한다 */
  get(key: string): Promise<StoredObject | null>
  /** 없어도 성공(멱등) */
  delete(key: string): Promise<void>
}
```

- [ ] **Step 4: 파일 시스템 구현** — `storage/file-system.ts`

```ts
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { AdminObjectStorage, StoredObject } from './object-storage.js'

// 파일 시스템 저장소(스펙 S2) — 의존성 없음. 개발 · 테스트 · 단일 서버 배포용. 중계(AdminMediaModule)가 같은 폴더를 읽는다.
// 정본: 없음(ringside 는 S3 만 썼다).
// 🔴 키는 패턴을 지난 것만 오지만 resolve 뒤 root 안인지 다시 본다 — 저장소를 다른 코드가 부를 수도 있다.
// 🔴 put 은 임시 이름에 쓰고 rename 한다 — 중계가 반쪽 파일을 읽지 않게(rename 은 같은 파일 시스템 안에서 원자적).
//    실패하면 임시 파일을 지운다.

export interface FileSystemStorageOptions {
  /** 객체를 둘 폴더(절대 · 상대 — 상대는 process.cwd 기준). 없으면 put 때 만든다 */
  root: string
}

export function createFileSystemStorage(options: FileSystemStorageOptions): AdminObjectStorage {
  const root = resolve(options.root)

  const pathOf = (key: string): string => {
    const full = resolve(root, key)
    if (!full.startsWith(root + sep)) throw new Error(`저장소 키가 root 밖을 가리킨다: ${key}`)
    return full
  }

  return {
    async put(key, body) {
      const full = pathOf(key)
      await mkdir(dirname(full), { recursive: true })
      const temp = `${full}.${randomBytes(6).toString('hex')}.tmp`
      try {
        await writeFile(temp, body)
        await rename(temp, full)
      } catch (error) {
        await rm(temp, { force: true })
        throw error
      }
    },

    async get(key): Promise<StoredObject | null> {
      const full = pathOf(key)
      let size: number
      try {
        const info = await stat(full)
        if (!info.isFile()) return null
        size = info.size
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
      return { body: createReadStream(full), contentLength: size }
    },

    async delete(key) {
      await rm(pathOf(key), { force: true })
    },
  }
}
```

- [ ] **Step 5: 시험용 메모리 저장소** — `test-support/memory-storage.ts`

```ts
import { Readable } from 'node:stream'
import type { AdminObjectStorage, StoredObject } from '../storage/object-storage.js'

// 테스트 전용 — 메모리 저장소(HTTP · 정리 · 약관 첨부 테스트). `failNext(op)` 는 그 동작을 한 번 던지게 한다. 🔴 빌드에서 빠진다.
// 정본: ssworks-ringside packages/db/src/uploads/storage.ts `MemoryObjectStorage`(list · lastModified 제외)

export type StorageOperation = 'put' | 'get' | 'delete'

export class MemoryObjectStorage implements AdminObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>()
  private readonly failing = new Set<StorageOperation>()

  failNext(operation: StorageOperation): void {
    this.failing.add(operation)
  }

  private check(operation: StorageOperation): void {
    if (this.failing.delete(operation)) {
      throw new Error(`메모리 저장소 — 시험용 실패(${operation})`)
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.check('put')
    this.objects.set(key, { body: Buffer.from(body), contentType })
  }

  async get(key: string): Promise<StoredObject | null> {
    this.check('get')
    const stored = this.objects.get(key)
    if (stored === undefined) return null
    return { body: Readable.from([stored.body]), contentLength: stored.body.length }
  }

  async delete(key: string): Promise<void> {
    this.check('delete')
    this.objects.delete(key)
  }
}
```

- [ ] **Step 6: GREEN**

Run: `pnpm --filter @ssworks/admin-server test file-system && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-server/src/storage packages/admin-server/src/test-support/memory-storage.ts
git commit -m "feat(admin-server): 저장소 인터페이스 AdminObjectStorage · 파일 시스템 구현 · 시험용 메모리 저장소(PR 2h Task 4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: S3 호환 저장소(서브패스) · `.` 진입점 격리 검사

**Files:**

- Create: `packages/admin-server/src/storage/s3.ts`
- Create: `packages/admin-server/src/storage/s3.test.ts`
- Create: `packages/admin-server/src/test-support/import-graph.ts`(`runner-graph.test.ts` 의 `collectImports` 를 옮긴다)
- Modify: `packages/admin-server/src/runner-graph.test.ts`(옮긴 함수를 import)
- Create: `packages/admin-server/src/storage/s3-isolation.test.ts`
- Modify: `packages/admin-server/tsconfig.dts.json`(`files` 에 `dist/storage/s3.d.ts`)

- [ ] **Step 1: import 그래프 도우미를 옮긴다** — `test-support/import-graph.ts`

```ts
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// 테스트 전용 — 소스의 상대 import 를 따라가 바깥 패키지를 모은다(runner-graph · s3-isolation 이 쓴다). 🔴 빌드에서 빠진다.

const SPECIFIER =
  /(?:^|[ \t\r\n;])(import|export)[ \t]*(type[ \t]+)?(?:[A-Za-z0-9_*{}, \t\r\n]*?[ \t\r\n]from[ \t]*)?['"]([^'"]+)['"]/g

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
```

`runner-graph.test.ts`: 파일 안의 `SPECIFIER` 상수와 `export function collectImports(...)` 정의를 지우고 `import { collectImports } from './test-support/import-graph.js'` 로 바꾼다(`readFileSync` import 도 지운다). `SRC` · 두 `it` 는 그대로.

Run: `pnpm --filter @ssworks/admin-server test runner-graph`
Expected: PASS(옮기기만 했다)

- [ ] **Step 2: 격리 테스트** — `storage/s3-isolation.test.ts`

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectImports } from '../test-support/import-graph.js'

// 🔴 `@aws-sdk/client-s3` 는 선택 peer 다 — `.` 진입점(index.ts) · `./runner` 가 끌어오면 SDK 없는 앱이 기동에서 죽는다(스펙 S3).
//    S3 구현은 서브패스 `@ssworks/admin-server/storage/s3` 로만 닿는다. sharp 도 러너에는 없어야 한다.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('S3 저장소 격리', () => {
  it('index.ts 그래프에 storage/s3.ts · @aws-sdk/client-s3 가 없다', () => {
    const { files, packages } = collectImports(resolve(SRC, 'index.ts'))
    expect(
      files.some((file) =>
        file.endsWith(`storage${process.platform === 'win32' ? '\\' : '/'}s3.ts`),
      ),
    ).toBe(false)
    expect(packages.filter((name) => name.startsWith('@aws-sdk/'))).toEqual([])
  })

  it('runner.ts 그래프에 sharp · @aws-sdk 가 없다', () => {
    const { packages } = collectImports(resolve(SRC, 'runner.ts'))
    expect(packages.filter((name) => name === 'sharp' || name.startsWith('@aws-sdk/'))).toEqual([])
  })

  it('대조 — storage/s3.ts 자체는 @aws-sdk/client-s3 를 끌어온다(탐지기가 살아 있다)', () => {
    expect(collectImports(resolve(SRC, 'storage', 's3.ts')).packages).toContain(
      '@aws-sdk/client-s3',
    )
  })
})
```

- [ ] **Step 3: S3 테스트** — `storage/s3.test.ts`

```ts
import { Readable } from 'node:stream'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { createS3ObjectStorage, type S3ClientLike } from './s3.js'

const KEY = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
const ACCESS = 'AKIAIOSFODNN7EXAMPLE'

/** 명령마다 답을 정하는 가짜 클라이언트 — 받은 명령을 모은다 */
function fakeClient(answer: (command: unknown) => unknown) {
  const sent: unknown[] = []
  const client: S3ClientLike = {
    send: vi.fn(async (command: unknown) => {
      sent.push(command)
      return answer(command)
    }),
    destroy: vi.fn(),
  }
  return { client, sent }
}

const s3Error = (name: string, status?: number, message = `${name} happened`) =>
  Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } })

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

describe('createS3ObjectStorage(스펙 S3)', () => {
  it('put — Bucket · prefix 붙은 Key · Body · ContentType · ContentLength', async () => {
    const { client, sent } = fakeClient(() => ({}))
    const storage = createS3ObjectStorage({ bucket: 'b', prefix: 'admin/', client })
    await storage.put(KEY, Buffer.from('abc'), 'image/webp')
    expect(sent[0]).toBeInstanceOf(PutObjectCommand)
    expect((sent[0] as PutObjectCommand).input).toEqual({
      Bucket: 'b',
      Key: `admin/${KEY}`,
      Body: Buffer.from('abc'),
      ContentType: 'image/webp',
      ContentLength: 3,
    })
  })

  it('get — Node 스트림 · ContentLength 를 돌려주고, NoSuchKey · 404 는 null', async () => {
    const { client, sent } = fakeClient(() => ({
      Body: Readable.from([Buffer.from('xy')]),
      ContentLength: 2,
    }))
    const storage = createS3ObjectStorage({ bucket: 'b', client })
    const got = await storage.get(KEY)
    expect(sent[0]).toBeInstanceOf(GetObjectCommand)
    expect((sent[0] as GetObjectCommand).input).toEqual({ Bucket: 'b', Key: KEY })
    expect(got?.contentLength).toBe(2)
    expect((await drain(got!.body)).toString()).toBe('xy')

    const missing = createS3ObjectStorage({
      bucket: 'b',
      client: fakeClient(() => {
        throw s3Error('NoSuchKey', 404)
      }).client,
    })
    expect(await missing.get(KEY)).toBeNull()
    const notFound = createS3ObjectStorage({
      bucket: 'b',
      client: fakeClient(() => {
        throw s3Error('Unknown', 404)
      }).client,
    })
    expect(await notFound.get(KEY)).toBeNull()
  })

  it('🔴 NoSuchBucket 은 null 이 아니라 던진다(설정 오류를 덮지 않는다)', async () => {
    const storage = createS3ObjectStorage({
      bucket: 'b',
      client: fakeClient(() => {
        throw s3Error('NoSuchBucket', 404)
      }).client,
    })
    await expect(storage.get(KEY)).rejects.toThrow('NoSuchBucket')
  })

  it('delete — 명령을 보내고 NoSuchKey 는 삼킨다, 다른 오류는 던진다', async () => {
    const { client, sent } = fakeClient(() => ({}))
    await createS3ObjectStorage({ bucket: 'b', client }).delete(KEY)
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand)
    await expect(
      createS3ObjectStorage({
        bucket: 'b',
        client: fakeClient(() => {
          throw s3Error('NoSuchKey', 404)
        }).client,
      }).delete(KEY),
    ).resolves.toBeUndefined()
    await expect(
      createS3ObjectStorage({
        bucket: 'b',
        client: fakeClient(() => {
          throw s3Error('AccessDenied', 403)
        }).client,
      }).delete(KEY),
    ).rejects.toThrow('AccessDenied')
  })

  it('🔴 던지는 오류의 문구 · 속성에서 접근 키 · 비밀 키를 가린다', async () => {
    const error = Object.assign(new Error(`signature failed for ${ACCESS} with ${SECRET}`), {
      name: 'SignatureDoesNotMatch',
      $metadata: { httpStatusCode: 403 },
      StringToSign: `AWS4-HMAC ${SECRET}`,
    })
    const storage = createS3ObjectStorage({
      bucket: 'b',
      credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET },
      client: fakeClient(() => {
        throw error
      }).client,
    })
    const caught = await storage
      .put(KEY, Buffer.from('x'), 'image/webp')
      .catch((e: unknown) => e as Error & { StringToSign: string })
    expect(caught.message).toBe('signature failed for *** with ***')
    expect(caught.StringToSign).toBe('AWS4-HMAC ***')
    expect(caught.name).toBe('SignatureDoesNotMatch')
  })

  it('시간 제한 — timeoutMs 안에 답이 없으면 던진다', async () => {
    const client: S3ClientLike = {
      send: (_command, options) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason))
        }),
      destroy: vi.fn(),
    }
    const storage = createS3ObjectStorage({ bucket: 'b', client, timeoutMs: 20 })
    await expect(storage.get(KEY)).rejects.toThrow('20ms 안에 답하지 않았다')
  })

  it('destroy 는 클라이언트를 닫는다', () => {
    const { client } = fakeClient(() => ({}))
    createS3ObjectStorage({ bucket: 'b', client }).destroy()
    expect(client.destroy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 4: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test s3`
Expected: FAIL — `Cannot find module './s3.js'`(s3-isolation 의 대조 테스트도 실패)

- [ ] **Step 5: 구현** — `storage/s3.ts`

```ts
import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import type { AdminObjectStorage, StoredObject } from './object-storage.js'

// S3 호환 저장소(스펙 S3) — 서브패스 `@ssworks/admin-server/storage/s3`. 🔴 `.` 진입점(index.ts)은 이 파일을 import 하지 않는다 —
//   `@aws-sdk/client-s3` 는 선택 peer 라 SDK 없는 앱이 기동해야 한다(storage/s3-isolation.test.ts 가 지킨다).
// 정본: ssworks-ringside packages/db/src/uploads/storage.ts createS3ObjectStorage(시간 제한 · 키 가림 · NoSuchKey 판정 · 체크섬 옵션)
// 바꾼 점: 설정을 SDK 모양 그대로 받는다(endpoint · region · credentials · forcePathStyle) · prefix · list · ensureBucket 없음 ·
//   시험용 client 주입. 🔴 공개 d.ts 에 SDK 타입을 내지 않는다(S3ClientLike) — check:dts 가 SDK 의 d.ts 를 skipLibCheck:false 로 읽지 않게.

export interface S3StorageOptions {
  bucket: string
  /** 기본 'us-east-1' — S3 호환 공급자는 대개 아무 값이면 된다 */
  region?: string
  /** S3 호환 공급자(R2 · MinIO · NCP …)의 엔드포인트. AWS 면 생략 */
  endpoint?: string
  credentials?: { accessKeyId: string; secretAccessKey: string }
  /** 경로형 주소(MinIO · 일부 공급자) */
  forcePathStyle?: boolean
  /** 키 앞에 붙일 접두사 — 버킷을 나눠 쓸 때. 끝 `/` 까지 적는다(`'admin/'`) */
  prefix?: string
  /** 호출 하나의 시간 제한(ms). 기본 10000 */
  timeoutMs?: number
  /** 시험용 — SDK 클라이언트 대신 쓸 것 */
  client?: S3ClientLike
}

/** SDK 클라이언트의 쓰는 면만 — 공개 d.ts 가 SDK 타입을 끌어오지 않게 */
export interface S3ClientLike {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>
  destroy(): void
}

export interface S3ObjectStorage extends AdminObjectStorage {
  /** keep-alive 소켓을 닫는다 — 앱 종료 때 */
  destroy(): void
}

const DEFAULT_TIMEOUT_MS = 10_000
const CONNECT_TIMEOUT_MS = 3_000

function errorFacts(error: unknown): { name: string | null; status: number | null } {
  if (typeof error !== 'object' || error === null) return { name: null, status: null }
  const { name, $metadata } = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
  const status = $metadata?.httpStatusCode
  return {
    name: typeof name === 'string' ? name : null,
    status: typeof status === 'number' ? status : null,
  }
}

/** 객체가 없다(NoSuchKey · 404). 버킷 없음(NoSuchBucket)은 설정 오류라 덮지 않는다 */
function isMissingObject(error: unknown): boolean {
  const { name, status } = errorFacts(error)
  return name !== 'NoSuchBucket' && (name === 'NoSuchKey' || status === 404)
}

/**
 * 던질 오류의 문구 · 스택 · 자기 문자열 속성에서 접근 키 · 비밀 키를 '***' 로 가린다(제자리) — 서버 로그가 오류 원문을 싣는다.
 * 긴 값부터 가린다(짧은 값이 긴 값의 일부일 때 반쯤 남지 않게). 바꿀 수 없는 속성은 건너뛴다
 */
function maskSecrets<T>(error: T, secrets: readonly string[]): T {
  if (!(error instanceof Error)) return error
  const ordered = secrets.filter((secret) => secret !== '').sort((a, b) => b.length - a.length)
  if (ordered.length === 0) return error
  const mask = (text: string) =>
    ordered.reduce((out, secret) => out.replaceAll(secret, '***'), text)
  const fields = error as unknown as Record<string, unknown>
  for (const name of new Set(['message', 'stack', ...Object.keys(error)])) {
    const value = fields[name]
    if (typeof value !== 'string') continue
    try {
      fields[name] = mask(value)
    } catch {
      // 읽기 전용 — 그대로 둔다
    }
  }
  return error
}

/** 호출 하나에 시간 제한 — AbortSignal.timeout() 대신 타이머를 send 가 끝나면 지운다(흐르는 본문까지 끊지 않게) */
async function withTimeout<T>(
  timeoutMs: number,
  run: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error(`저장소가 ${timeoutMs}ms 안에 답하지 않았다`)),
    timeoutMs,
  )
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

function sdkClient(options: S3StorageOptions, timeoutMs: number): S3ClientLike {
  return new S3Client({
    region: options.region ?? 'us-east-1',
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
    forcePathStyle: options.forcePathStyle ?? false,
    // S3 호환 공급자가 모두 받는 체크섬만 — SDK 기본(WHEN_SUPPORTED)은 CRC 머리글을 더해 일부 공급자가 거부한다
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      connectionTimeout: Math.min(CONNECT_TIMEOUT_MS, timeoutMs),
      socketTimeout: timeoutMs,
    },
  }) as unknown as S3ClientLike
}

export function createS3ObjectStorage(options: S3StorageOptions): S3ObjectStorage {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = options.client ?? sdkClient(options, timeoutMs)
  const bucket = options.bucket
  const prefix = options.prefix ?? ''
  const secrets = options.credentials
    ? [options.credentials.accessKeyId, options.credentials.secretAccessKey]
    : []
  const masked = <T>(error: T) => maskSecrets(error, secrets)
  const keyOf = (key: string) => `${prefix}${key}`

  return {
    async put(key, body, contentType) {
      try {
        await withTimeout(timeoutMs, (abortSignal) =>
          client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: keyOf(key),
              Body: body,
              ContentType: contentType,
              ContentLength: body.length,
            }),
            { abortSignal },
          ),
        )
      } catch (error) {
        throw masked(error)
      }
    },

    async get(key): Promise<StoredObject | null> {
      let output: GetObjectCommandOutput
      try {
        output = (await withTimeout(timeoutMs, (abortSignal) =>
          client.send(new GetObjectCommand({ Bucket: bucket, Key: keyOf(key) }), { abortSignal }),
        )) as GetObjectCommandOutput
      } catch (error) {
        if (isMissingObject(error)) return null
        throw masked(error)
      }
      const body = output.Body
      if (!(body instanceof Readable)) {
        // 웹 스트림이면 취소해 소켓을 돌려준다
        if (body instanceof ReadableStream) void body.cancel().catch(() => {})
        throw new Error('저장소 응답 본문이 Node 스트림이 아니다')
      }
      if (output.ContentLength === undefined) {
        body.destroy()
        throw new Error('저장소 응답에 Content-Length 가 없다')
      }
      return { body, contentLength: output.ContentLength }
    },

    async delete(key) {
      try {
        await withTimeout(timeoutMs, (abortSignal) =>
          client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyOf(key) }), {
            abortSignal,
          }),
        )
      } catch (error) {
        // S3 의 DeleteObject 는 없는 키에도 204 다 — 이름 있는 NoSuchKey 만 삼킨다. 이름 없는 404(프록시 · 잘못된 엔드포인트)는 던진다
        if (errorFacts(error).name !== 'NoSuchKey') throw masked(error)
      }
    },

    destroy() {
      client.destroy()
    },
  }
}
```

- [ ] **Step 6: `tsconfig.dts.json`** — `"files": ["dist/index.d.ts", "dist/runner.d.ts", "dist/storage/s3.d.ts"]`

- [ ] **Step 7: GREEN · 빌드 · d.ts 검사**

Run: `pnpm --filter @ssworks/admin-server test storage && pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server build && pnpm --filter @ssworks/admin-server check:dts`
Expected: PASS. `check:dts` 가 SDK d.ts 오류를 내면 `dist/storage/s3.d.ts` 가 `@aws-sdk/client-s3` 를 import 하고 있는 것이다 — 공개 시그니처에서 SDK 타입을 뺀다(`GetObjectCommandOutput` 은 구현 안 캐스트에만).

- [ ] **Step 8: 커밋**

```bash
git add packages/admin-server/src/storage packages/admin-server/src/test-support/import-graph.ts packages/admin-server/src/runner-graph.test.ts packages/admin-server/tsconfig.dts.json
git commit -m "feat(admin-server): S3 호환 저장소 서브패스 ./storage/s3 · 진입점 격리 검사(PR 2h Task 5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 장 `0013_uploads` · 표 타입

**Files:**

- Create: `packages/admin-server/src/database/migrations/0013_uploads.ts`
- Create: `packages/admin-server/src/database/tables/uploads.ts`
- Modify: `packages/admin-server/src/database/types.ts`
- Modify: `packages/admin-server/src/database/migrations/index.ts` · `index.test.ts`
- Modify: `packages/admin-server/src/database/migrations/ddl.test.ts`(장 목록 · 새 describe)
- Modify: `packages/admin-server/src/database/migrations/migrations.db.test.ts`(`CORE_TABLES`)

- [ ] **Step 1: 단위 테스트 갱신** — `index.test.ts`

- 기대 배열 둘(`'0001~0012 순서'` → 제목 `'0001~0013 순서'`)의 끝에 `'0013_uploads'`.
- `🔴 순서 어긋남` 기대 문자열 둘(지금 · 맞는 순서)의 끝 `0012_ip_access_rules` 뒤에 `, 0013_uploads`.
- `🔴 빠진 장을 모아 한 번에 던진다` 에 `expect(() => assertAdminMigrationStubs(dir)).toThrow('빠진 장 0013_uploads')` 한 줄.

`ddl.test.ts`: 위쪽 `import * as ipAccessRules from './0012_ip_access_rules.js'` 다음에 `import * as uploads from './0013_uploads.js'`, 장 목록 배열의 `['0012_ip_access_rules', ipAccessRules],` 다음에 `['0013_uploads', uploads],`. 파일 끝에 describe 를 더한다(이 파일의 `capture` 도우미를 그대로 쓴다 — `ipAccessRules` describe 의 모양을 따른다):

```ts
describe('0013_uploads', () => {
  it('표 · 인덱스 셋 · UNIQUE · FK SET NULL — 열 이름은 snake_case', async () => {
    const statements = await capture((db) => uploads.up(db))
    const [table, ...rest] = statements
    expect(table).toMatch(/^create table `uploads`/)
    expect(table).toContain('`upload_no` bigint unsigned not null auto_increment primary key')
    expect(table).toContain('`storage_key` varchar(128) collate ascii_bin not null')
    expect(table).toContain('`purpose` varchar(32) collate ascii_bin not null')
    expect(table).toContain('`uploaded_by_user_no` bigint unsigned')
    expect(table).toContain('`ref_type` varchar(64) collate ascii_bin')
    expect(table).toContain('`attached_at` datetime')
    expect(table).toContain('`deleted_at` datetime')
    expect(table).toContain('`created_at` timestamp not null default CURRENT_TIMESTAMP')
    expect(table).toContain('constraint `uq_uploads_storage_key` unique (`storage_key`)')
    expect(table).toContain(
      'constraint `fk_uploads_uploaded_by` foreign key (`uploaded_by_user_no`) references `users` (`user_no`) on delete set null on update cascade',
    )
    expect(table).toMatch(/engine=InnoDB default charset=utf8mb4 collate=utf8mb4_bin$/)
    expect(rest).toEqual([
      'create index `idx_uploads_uploader` on `uploads` (`uploaded_by_user_no`, `upload_no`)',
      'create index `idx_uploads_ref` on `uploads` (`ref_type`, `ref_id`)',
      'create index `idx_uploads_deleted` on `uploads` (`deleted_at`, `created_at`)',
    ])
  })

  it('down 은 표 하나', async () => {
    expect(await capture((db) => uploads.down(db))).toEqual(['drop table `uploads`'])
  })
})
```

`migrations.db.test.ts` `CORE_TABLES`: `'teams',` 다음에 `'uploads',`(정렬 — `uploads` < `user_employment_periods`).

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test migrations`
Expected: FAIL — `Cannot find module './0013_uploads.js'` · 순서 배열 불일치

- [ ] **Step 3: 장** — `database/migrations/0013_uploads.ts`

```ts
import { sql, type Kysely } from 'kysely'
import { ASCII_BIN, TABLE_OPTIONS, comment } from './_shared.js'

// 정본: ssworks-ringside packages/db/src/migrations/1792292005397_create_uploads.ts(열 구성 · 인덱스 셋 · 미첨부 24시간)
// 바꾼 점:
//  - 이름은 admin-shared 계약(storageKey · refType · refId · uploadedByUserNo) · camelCase 열(CamelCasePlugin) · PK uploadNo.
//  - 올린 사람 FK 는 users SET NULL(약관 발행자와 같다) — 계정을 지워도 첨부된 그림은 남는다. ringside 는 RESTRICT.
//  - CHECK(ref_type ⇔ ref_id ⇔ attached_at) 는 두지 않는다 — 쓰는 곳이 attach.ts · sweep.ts 둘뿐이고 MariaDB CHECK 는 옵티마이저 힌트가 없다.
//  - mime 열이 없다 — 저장 형식은 언제나 WebP(스펙 U1).
//  - attached_at · deleted_at 은 DATETIME(앱 시계 · UTC 프로세스) — TIMESTAMP 는 첫 열에 암묵 DEFAULT/ON UPDATE 가 붙는 판이 있다.
// 🔴 ref_type 폭 64 = CoreAuditTargets 폭(AUDIT_TARGET_TYPE_MAX_LENGTH) — 첨부 대상 이름을 감사 대상 이름과 같은 값으로 쓴다(스펙 §2 끝).
// 🔴 idx_uploads_uploader(uploaded_by_user_no, upload_no) 는 미첨부 셈, idx_uploads_deleted(deleted_at, created_at) 는 정리 잡의
//    두 문장(미첨부 보관 초과 · 지움 표시 묶음)이 탄다.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('uploads')
    .addColumn('uploadNo', 'bigint', (col) => col.unsigned().primaryKey().autoIncrement())
    .addColumn('storageKey', 'varchar(128)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(
          comment('<용도>/<yyyy>/<mm>/<base64url 32자>.webp — admin-shared UPLOAD_KEY_PATTERN'),
        ),
    )
    .addColumn('purpose', 'varchar(32)', (col) =>
      col
        .notNull()
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('용도. 폐집합의 정본은 옵션 uploads.purposes')),
    )
    .addColumn('uploadedByUserNo', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('올린 관리자. NULL = 계정이 지워졌다')),
    )
    .addColumn('bytes', 'integer', (col) =>
      col.unsigned().notNull().modifyEnd(comment('저장한 WebP 크기')),
    )
    .addColumn('width', 'integer', (col) => col.unsigned().notNull())
    .addColumn('height', 'integer', (col) =>
      col.unsigned().notNull().modifyEnd(comment('움짤은 한 프레임 높이')),
    )
    .addColumn('refType', 'varchar(64)', (col) =>
      col
        .modifyFront(ASCII_BIN)
        .modifyEnd(comment('첨부 대상 종류(감사 대상 이름 — legalDocument …). NULL = 미첨부')),
    )
    .addColumn('refId', 'bigint', (col) =>
      col.unsigned().modifyEnd(comment('첨부 대상 번호. 다형 참조라 FK 가 없다')),
    )
    .addColumn('attachedAt', 'datetime', (col) => col.modifyEnd(comment('첨부 시각(앱 시계 UTC)')))
    .addColumn('deletedAt', 'datetime', (col) =>
      col.modifyEnd(comment('지움 표시(앱 시계 UTC) — 객체는 정리 잡이 지운 뒤 행을 지운다')),
    )
    .addColumn('createdAt', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addUniqueConstraint('uqUploadsStorageKey', ['storageKey'])
    .addForeignKeyConstraint(
      'fkUploadsUploadedBy',
      ['uploadedByUserNo'],
      'users',
      ['userNo'],
      (cb) => cb.onDelete('set null').onUpdate('cascade'),
    )
    .modifyEnd(TABLE_OPTIONS)
    .execute()

  await db.schema
    .createIndex('idxUploadsUploader')
    .on('uploads')
    .columns(['uploadedByUserNo', 'uploadNo'])
    .execute()
  await db.schema.createIndex('idxUploadsRef').on('uploads').columns(['refType', 'refId']).execute()
  await db.schema
    .createIndex('idxUploadsDeleted')
    .on('uploads')
    .columns(['deletedAt', 'createdAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('uploads').execute()
}
```

`ddl.test.ts` 의 기대 문자열이 Kysely 가 실제로 내는 DDL 과 글자가 다르면(따옴표 · 공백 · 순서) **기대 문자열을 실측으로 고친다** — 의미(열 · 타입 · collation · NULL · FK 동작 · 인덱스 열)가 맞는지만 본다.

- [ ] **Step 4: 표 타입** — `database/tables/uploads.ts`

```ts
import type { ColumnType, Generated } from 'kysely'

// 정본: ssworks-ringside packages/db(uploads 표 타입) — 장 0013 과 같은 열.
// 바꾼 점: camelCase 계약 · uploadedByUserNo nullable(FK SET NULL).

export interface AdminUploadsTable {
  uploadNo: Generated<bigint>
  /** admin-shared UPLOAD_KEY_PATTERN — ascii_bin UNIQUE */
  storageKey: string
  /** 옵션 uploads.purposes 의 키 — 키의 첫 조각과 같다 */
  purpose: string
  /** 올린 관리자. 계정이 지워지면 null */
  uploadedByUserNo: bigint | null
  bytes: number
  width: number
  /** 움짤은 한 프레임 높이 */
  height: number
  /** 첨부 대상 종류(감사 대상 이름). null = 미첨부 */
  refType: string | null
  refId: bigint | null
  attachedAt: Date | null
  /** 지움 표시 — 정리 잡이 객체를 지운 뒤 행을 지운다 */
  deletedAt: Date | null
  /** 🔴 DB 시계 — 넣지도 고치지도 않는다 */
  createdAt: ColumnType<Date, never, never>
}
```

`database/types.ts`: `import type { AdminUploadsTable } from './tables/uploads.js'` 를 더하고 `AdminDatabase` 에 `uploads: AdminUploadsTable`, 아래 `export type { … }` 묶음에 `AdminUploadsTable` 을 더한다. 머리 주석 "코어 11키만" → "코어 12키만".

- [ ] **Step 5: 장 목록** — `database/migrations/index.ts`

`import * as uploads from './0013_uploads.js'` · `ADMIN_MIGRATIONS` 끝 `'0013_uploads',` · `CHAPTERS` 끝 `'0013_uploads': uploads,`.

- [ ] **Step 6: GREEN(단위) · 실 DB**

Run: `pnpm --filter @ssworks/admin-server test migrations && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-server test:db migrations`
Expected: PASS(`up → down → up` 세 번 · `CORE_TABLES` 에 `uploads`)

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-server/src/database
git commit -m "feat(admin-server): 장 0013_uploads · AdminDatabase.uploads(PR 2h Task 6)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 옵션 해석 `uploads/options.ts` · 토큰

**Files:**

- Modify: `packages/admin-server/src/tokens.ts`
- Create: `packages/admin-server/src/uploads/options.ts`
- Create: `packages/admin-server/src/uploads/options.test.ts`
- Modify: `packages/admin-server/src/auth/module-check.ts`(`isModuleRegistered` 를 뽑아 낸다)

- [ ] **Step 1: 토큰** — `tokens.ts` 끝에

```ts
/** 내부 — 해석된 업로드 설정(`ResolvedUploadsConfig`). `AdminUploadsModule`(전역)이 코어 옵션 `uploads` 로 만들고 내보낸다(2h). 권한 가드가 `@Optional()` 로 받는다 */
export const ADMIN_UPLOADS_CONFIG = Symbol('ADMIN_UPLOADS_CONFIG')
/** `@RequireUploadPurpose()` — 전역 권한 가드의 넷째 선언(2h 스펙 U6). 용도는 요청의 `query.purpose` 또는 `params.purpose` */
export const REQUIRE_UPLOAD_PURPOSE = 'admin-kit:upload-purpose'
```

- [ ] **Step 2: 테스트** — `uploads/options.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { resolveUploadsConfig } from './options.js'

const storage = new MemoryObjectStorage()
const PERMISSIONS = { 'legal.publish': 'setting.legal:publish', 'teams.manage': 'org.teams:write' }

const resolve = (
  uploads: unknown,
  hasLegal = true,
  permissions: Record<string, string> = PERMISSIONS,
) => resolveUploadsConfig({ uploads, permissions } as never, hasLegal, 'AdminUploadsModule')

function messageOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('던지지 않았다')
}

describe('resolveUploadsConfig(스펙 U7 · U14 · S6)', () => {
  it('최소 옵션 — 기본값: mediaPath /api/media · 정책 기본 · 정리 60분 · legal 용도 자동(AdminLegalModule 이 있을 때)', () => {
    const config = resolve({ storage })
    expect(config.storage).toBe(storage)
    expect(config.mediaPath).toBe('/api/media')
    expect(config.policy.maxBytes).toBe(10_485_760)
    expect(config.sweepIntervalMs).toBe(3_600_000)
    expect([...config.purposes.entries()]).toEqual([
      ['legal', { slot: 'legal.publish', permissions: [] }],
    ])
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('약관 모듈이 없으면 legal 용도도 없다', () => {
    expect(resolve({ storage }, false).purposes.size).toBe(0)
  })

  it('앱 용도 — 슬롯 또는 권한 키 · 정책 일부 덮기 · 정리 끔 · mediaPath', () => {
    const config = resolve({
      storage,
      mediaPath: '/media',
      purposes: {
        notice: { permissions: ['board.posts:write'] },
        team_doc: { slot: 'teams.manage' },
      },
      policy: { maxBytes: 1_000, maxPerBody: 3 },
      sweep: false,
    })
    expect(config.mediaPath).toBe('/media')
    expect(config.policy).toEqual({
      ...config.policy,
      maxBytes: 1_000,
      maxPerBody: 3,
      maxLongEdge: 2048,
    })
    expect(config.sweepIntervalMs).toBeNull()
    expect(config.purposes.get('notice')).toEqual({
      slot: null,
      permissions: ['board.posts:write'],
    })
    expect(config.purposes.get('team_doc')).toEqual({ slot: 'teams.manage', permissions: [] })
    expect(resolve({ storage, sweep: { intervalMinutes: 5 } }).sweepIntervalMs).toBe(300_000)
  })

  it('🔴 옵션이 없으면 기동에서 멈춘다 — 무엇을 더할지 문구에', () => {
    for (const uploads of [undefined, null, 'x']) {
      expect(messageOf(() => resolve(uploads))).toBe(
        "AdminUploadsModule 은 uploads 옵션이 있어야 한다 — AdminServerModule 옵션에 uploads: { storage: createFileSystemStorage({ root: './uploads' }) } 를 더한다.",
      )
    }
  })

  it('🔴 문제를 모아 한 번에 — 저장소 모양 · mediaPath · 용도 이름 · legal 겹침 · slot/permissions 둘 다 또는 둘 다 없음 · 모르는 슬롯 · 이어지지 않은 슬롯 · 빈 권한 키 · 정책 · 정리', () => {
    const message = messageOf(() =>
      resolve({
        storage: { put() {} },
        mediaPath: '/api/files',
        purposes: {
          legal: { slot: 'legal.publish' },
          'bad kind': { slot: 'teams.manage' },
          both: { slot: 'teams.manage', permissions: ['x'] },
          none: {},
          unknown: { slot: 'nope' },
          unwired: { slot: 'ipAccess.manage' },
          empty: { permissions: [' '] },
        },
        policy: { maxBytes: 0, webpQuality: 101, maxPerBody: 1.5 },
        sweep: { intervalMinutes: 0 },
      }),
    )
    expect(message).toBe(
      'AdminUploadsModule 의 uploads 옵션이 맞지 않다 — ' +
        [
          'uploads.storage 는 put · get · delete 를 가진 저장소여야 한다(createFileSystemStorage · createS3ObjectStorage)',
          "uploads.mediaPath 는 '/media' 로 끝나는 경로여야 한다(예: '/api/media'): \"/api/files\"",
          'uploads.purposes.legal — legal 용도는 AdminLegalModule 이 자동으로 등록한다(빼라)',
          `uploads.purposes["bad kind"] — 용도는 영숫자 · '_' 1~32자여야 한다`,
          'uploads.purposes.both — slot 과 permissions 중 하나만 적는다',
          'uploads.purposes.none — slot 또는 permissions 가 있어야 한다',
          'uploads.purposes.unknown — 모르는 슬롯: nope',
          'uploads.purposes.unwired — 슬롯 ipAccess.manage 가 permissions 에 이어지지 않았다',
          'uploads.purposes.empty — permissions 는 빈 문자열이 아닌 권한 키의 배열이어야 한다',
          'uploads.policy.maxBytes 는 1 이상의 정수여야 한다: 0',
          'uploads.policy.webpQuality 는 1~100 의 정수여야 한다: 101',
          'uploads.policy.maxPerBody 는 1 이상의 정수여야 한다: 1.5',
          'uploads.sweep.intervalMinutes 는 1 이상의 정수여야 한다: 0',
        ].join(' / '),
    )
  })

  it('mediaPath — 루트 · 접두사 여럿 · 끝 슬래시 · 비어 있음', () => {
    expect(resolve({ storage, mediaPath: '/media' }).mediaPath).toBe('/media')
    expect(resolve({ storage, mediaPath: '/api/v1/media' }).mediaPath).toBe('/api/v1/media')
    expect(messageOf(() => resolve({ storage, mediaPath: '/api/media/' }))).toContain(
      "uploads.mediaPath 는 '/media' 로 끝나는",
    )
    expect(messageOf(() => resolve({ storage, mediaPath: '' }))).toContain(
      "uploads.mediaPath 는 '/media' 로 끝나는",
    )
    expect(messageOf(() => resolve({ storage, mediaPath: 'api/media' }))).toContain(
      "uploads.mediaPath 는 '/media' 로 끝나는",
    )
  })
})
```

- [ ] **Step 3: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test uploads/options`
Expected: FAIL — `Cannot find module './options.js'`

- [ ] **Step 4: `module-check.ts`** — 일반 판정을 뽑아 낸다(기존 함수는 그대로 두고 그것을 쓴다)

```ts
import type { ModulesContainer, Type } from '@nestjs/core' // 🔴 Type 은 @nestjs/common 에서
```

정확히는:

```ts
import type { Type } from '@nestjs/common'
import type { ModulesContainer } from '@nestjs/core'
import { AdminAuthModule } from './admin-auth.module.js'

// (머리 주석 그대로 + 한 줄) 2h: 업로드 모듈이 약관 모듈 유무로 legal 용도를 자동 등록한다 — 같은 훑기를 일반화했다.

/** 그 모듈 클래스가 앱에 등록돼 있는가(동적 모듈도 metatype 이 같은 클래스다) */
export function isModuleRegistered(modules: ModulesContainer, type: Type): boolean {
  return [...modules.values()].some((ref) => ref.metatype === type)
}

export function assertAuthModuleRegistered(modules: ModulesContainer, moduleName: string): void {
  if (!isModuleRegistered(modules, AdminAuthModule)) {
    throw new Error(
      `${moduleName} 은 AdminAuthModule 이 있어야 한다 — 인증 · 권한 가드 없이 라우트가 열린다. AppModule 에 AdminAuthModule 을 import 한다.`,
    )
  }
}
```

- [ ] **Step 5: 구현** — `uploads/options.ts`

```ts
import {
  DEFAULT_MEDIA_PATH,
  DEFAULT_UPLOAD_POLICY,
  UPLOAD_PURPOSE_PATTERN,
  type UploadPolicy,
} from '@ssworks/admin-shared'
import {
  ADMIN_PERMISSION_SLOTS,
  type AdminPermissionMap,
  type AdminPermissionSlot,
} from '../auth/permission-slots.js'
import type { AdminServerOptions } from '../options.js'
import type { AdminObjectStorage } from '../storage/object-storage.js'

// 정본: 없음 — 2h 스펙 U7 · U14 · S6. 약관 종류 옵션(legal/options.ts)과 같은 방식(문제를 모아 한 번에 · 기동에서 멈춤).
// 🔴 legal 용도는 AdminLegalModule 이 등록돼 있을 때만 자동으로 들어간다 — 앱이 같은 이름을 적으면 멈춘다(두 곳이 다른 권한을 주장할 수 없게).
// 🔴 mediaPath 는 '/media' 로 끝나야 한다 — 중계 컨트롤러 경로가 'media' 로 고정이라(데코레이터는 정적) 앞 조각만 앱 전역 접두사다.

export interface AdminUploadPurposeOptions {
  /** 패키지 슬롯 — 그 슬롯에 이어진 권한 키를 가져야 이 용도로 올릴 수 있다 */
  slot?: AdminPermissionSlot
  /** 앱 권한 키(AND) — 슬롯 대신. 둘 중 하나만 */
  permissions?: readonly string[]
}

export interface AdminUploadsOptions {
  /** 객체 저장소 — `createFileSystemStorage` · `createS3ObjectStorage`(`@ssworks/admin-server/storage/s3`) */
  storage: AdminObjectStorage
  /** 본문에 적는 공개 경로. 기본 '/api/media'. 🔴 '/media' 로 끝나야 한다 — 앞은 앱 전역 접두사 */
  mediaPath?: string
  /** 앱 용도 → 권한. `legal` 은 AdminLegalModule 이 자동 등록한다(적으면 기동에서 멈춤) */
  purposes?: Record<string, AdminUploadPurposeOptions>
  /** admin-shared DEFAULT_UPLOAD_POLICY 를 덮는다 */
  policy?: Partial<UploadPolicy>
  /** 정리 잡 주기. 기본 { intervalMinutes: 60 }. false 면 앱이 `AdminUploadsService.sweep()` 을 직접 돌린다 */
  sweep?: { intervalMinutes?: number } | false
}

export interface UploadPurposeGrant {
  readonly slot: AdminPermissionSlot | null
  readonly permissions: readonly string[]
}

export interface ResolvedUploadsConfig {
  readonly storage: AdminObjectStorage
  readonly mediaPath: string
  readonly purposes: ReadonlyMap<string, UploadPurposeGrant>
  readonly policy: Readonly<UploadPolicy>
  /** null = 끔 */
  readonly sweepIntervalMs: number | null
}

const MEDIA_PATH = /^(\/[A-Za-z0-9_-]+)*\/media$/
const POSITIVE_INT = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

function isStorage(value: unknown): value is AdminObjectStorage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return ['put', 'get', 'delete'].every((name) => typeof candidate[name] === 'function')
}

export function resolveUploadsConfig(
  options: Pick<AdminServerOptions, 'uploads' | 'permissions'>,
  hasLegalModule: boolean,
  moduleName: string,
): ResolvedUploadsConfig {
  const uploads: unknown = options.uploads
  if (typeof uploads !== 'object' || uploads === null) {
    throw new Error(
      `${moduleName} 은 uploads 옵션이 있어야 한다 — AdminServerModule 옵션에 uploads: { storage: createFileSystemStorage({ root: './uploads' }) } 를 더한다.`,
    )
  }
  const input = uploads as Record<string, unknown>
  const permissions: Readonly<AdminPermissionMap> = options.permissions ?? {}
  const problems: string[] = []

  if (!isStorage(input.storage)) {
    problems.push(
      'uploads.storage 는 put · get · delete 를 가진 저장소여야 한다(createFileSystemStorage · createS3ObjectStorage)',
    )
  }

  const mediaPath = input.mediaPath === undefined ? DEFAULT_MEDIA_PATH : input.mediaPath
  if (typeof mediaPath !== 'string' || !MEDIA_PATH.test(mediaPath)) {
    problems.push(
      `uploads.mediaPath 는 '/media' 로 끝나는 경로여야 한다(예: '/api/media'): ${JSON.stringify(mediaPath)}`,
    )
  }

  const purposes = new Map<string, UploadPurposeGrant>()
  if (hasLegalModule) purposes.set('legal', { slot: 'legal.publish', permissions: [] })
  const declared = input.purposes
  if (declared !== undefined) {
    if (typeof declared !== 'object' || declared === null) {
      problems.push('uploads.purposes 는 { 용도: { slot | permissions } } 객체여야 한다')
    } else {
      for (const [name, raw] of Object.entries(declared as Record<string, unknown>)) {
        const place = UPLOAD_PURPOSE_PATTERN.test(name)
          ? `uploads.purposes.${name}`
          : `uploads.purposes[${JSON.stringify(name)}]`
        if (name === 'legal' && hasLegalModule) {
          problems.push(`${place} — legal 용도는 AdminLegalModule 이 자동으로 등록한다(빼라)`)
          continue
        }
        if (!UPLOAD_PURPOSE_PATTERN.test(name)) {
          problems.push(`${place} — 용도는 영숫자 · '_' 1~32자여야 한다`)
          continue
        }
        const grant = resolveGrant(raw, permissions, place, problems)
        if (grant !== null) purposes.set(name, grant)
      }
    }
  }

  const policy = resolvePolicy(input.policy, problems)
  const sweepIntervalMs = resolveSweep(input.sweep, problems)

  if (problems.length > 0) {
    throw new Error(`${moduleName} 의 uploads 옵션이 맞지 않다 — ${problems.join(' / ')}`)
  }
  return Object.freeze({
    storage: input.storage as AdminObjectStorage,
    mediaPath: mediaPath as string,
    purposes,
    policy,
    sweepIntervalMs,
  })
}

function resolveGrant(
  raw: unknown,
  permissions: Readonly<AdminPermissionMap>,
  place: string,
  problems: string[],
): UploadPurposeGrant | null {
  if (typeof raw !== 'object' || raw === null) {
    problems.push(`${place} — { slot } 또는 { permissions } 객체여야 한다`)
    return null
  }
  const { slot, permissions: keys } = raw as { slot?: unknown; permissions?: unknown }
  if (slot !== undefined && keys !== undefined) {
    problems.push(`${place} — slot 과 permissions 중 하나만 적는다`)
    return null
  }
  if (slot === undefined && keys === undefined) {
    problems.push(`${place} — slot 또는 permissions 가 있어야 한다`)
    return null
  }
  if (slot !== undefined) {
    const known: readonly string[] = ADMIN_PERMISSION_SLOTS
    if (typeof slot !== 'string' || !known.includes(slot)) {
      problems.push(`${place} — 모르는 슬롯: ${String(slot)}`)
      return null
    }
    const key = permissions[slot as AdminPermissionSlot]
    if (typeof key !== 'string' || key.trim() === '') {
      problems.push(`${place} — 슬롯 ${slot} 가 permissions 에 이어지지 않았다`)
      return null
    }
    return Object.freeze({ slot: slot as AdminPermissionSlot, permissions: Object.freeze([]) })
  }
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.some((key) => typeof key !== 'string' || key.trim() === '')
  ) {
    problems.push(`${place} — permissions 는 빈 문자열이 아닌 권한 키의 배열이어야 한다`)
    return null
  }
  return Object.freeze({ slot: null, permissions: Object.freeze([...(keys as string[])]) })
}

function resolvePolicy(raw: unknown, problems: string[]): Readonly<UploadPolicy> {
  const policy: UploadPolicy = { ...DEFAULT_UPLOAD_POLICY }
  if (raw === undefined) return Object.freeze(policy)
  if (typeof raw !== 'object' || raw === null) {
    problems.push('uploads.policy 는 객체여야 한다')
    return Object.freeze(policy)
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.hasOwn(DEFAULT_UPLOAD_POLICY, key)) {
      problems.push(`uploads.policy 에 모르는 키: ${key}`)
      continue
    }
    const name = key as keyof UploadPolicy
    if (name === 'webpQuality') {
      if (!POSITIVE_INT(value) || value > 100) {
        problems.push(`uploads.policy.webpQuality 는 1~100 의 정수여야 한다: ${String(value)}`)
        continue
      }
    } else if (!POSITIVE_INT(value)) {
      problems.push(`uploads.policy.${name} 는 1 이상의 정수여야 한다: ${String(value)}`)
      continue
    }
    policy[name] = value
  }
  return Object.freeze(policy)
}

function resolveSweep(raw: unknown, problems: string[]): number | null {
  if (raw === false) return null
  if (raw === undefined) return 60 * 60_000
  if (typeof raw !== 'object' || raw === null) {
    problems.push('uploads.sweep 는 false 또는 { intervalMinutes } 여야 한다')
    return null
  }
  const minutes = (raw as { intervalMinutes?: unknown }).intervalMinutes
  if (minutes === undefined) return 60 * 60_000
  if (!POSITIVE_INT(minutes)) {
    problems.push(`uploads.sweep.intervalMinutes 는 1 이상의 정수여야 한다: ${String(minutes)}`)
    return null
  }
  return minutes * 60_000
}
```

- [ ] **Step 6: GREEN**

Run: `pnpm --filter @ssworks/admin-server test uploads/options module-check && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS. 기대 문구가 실측과 글자 하나 다르면 **구현 문구를 테스트에 맞춘다**(문구는 이 플랜이 정본).

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-server/src/tokens.ts packages/admin-server/src/uploads/options.ts packages/admin-server/src/uploads/options.test.ts packages/admin-server/src/auth/module-check.ts
git commit -m "feat(admin-server): 업로드 옵션 해석(용도 · 정책 · 정리 · mediaPath) · 토큰(PR 2h Task 7)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 오류 표 `uploads/errors.ts` · 문구 덮기 묶음 등록

**Files:**

- Create: `packages/admin-server/src/uploads/errors.ts`
- Modify: `packages/admin-server/src/http/messages.ts` · `messages.test.ts`

- [ ] **Step 1: 테스트 갱신** — `http/messages.test.ts`

- import 에 `UPLOAD_SCHEMA_MESSAGES`(admin-shared) · `import { UPLOAD_MESSAGES } from '../uploads/errors.js'`.
- 첫 `it` 제목 `묶음 여덟` → `묶음 열`. `toEqual({...})` 과 `tables` 둘 다 끝에 `uploads: UPLOAD_MESSAGES,` · `uploadsSchema: UPLOAD_SCHEMA_MESSAGES,`.
- `grouped` 배열에 `'UPLOAD_MESSAGES'`.

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test messages`
Expected: FAIL — `Cannot find module '../uploads/errors.js'`

- [ ] **Step 3: 구현** — `uploads/errors.ts`

```ts
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'

// 정본: ssworks-ringside packages/db/src/uploads/errors.ts(여섯 사유 · details) — 문구는 관리자용으로 다시 썼다.
// 바꾼 점: 한 표에 모은다(legal/errors.ts 와 같은 방식). 상한은 정책이라 문구에 숫자를 박지 않고 details 로 싣는다(화면이 붙인다).
// 🔴 notFound 는 없음 · 남의 것 · 첨부됨 · 지움 표시 · 용도 불일치를 가르지 않는다(열거 방어 — 스펙 U4 · U8).

export const UPLOAD_MESSAGES = Object.freeze({
  unsupportedType: '지원하지 않는 이미지 형식입니다. (JPG · PNG · WebP · GIF)',
  tooLarge: '이미지가 너무 큽니다.',
  invalidImage: '이미지를 읽을 수 없습니다.',
  limit: '이미지 수가 한도를 넘었습니다.',
  notFound: '이미지를 찾을 수 없습니다.',
  unavailable: '이미지 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
})

export type UploadInvalidReason = 'unreadable' | 'too_many_pixels' | 'too_many_frames'

/** 415 — Content-Type · 매직 바이트 · Content-Encoding */
export function uploadUnsupportedType(): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE,
    UPLOAD_MESSAGES.unsupportedType,
  )
}

/** 413 — details.maxBytes 는 정책의 장당 상한 */
export function uploadTooLarge(maxBytes: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE, UPLOAD_MESSAGES.tooLarge, {
    maxBytes,
  })
}

/** 400 — details.reason 으로 사유를 남긴다(화면 문구는 하나) */
export function uploadInvalidImage(reason: UploadInvalidReason): BusinessError {
  return new BusinessError(
    CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
    UPLOAD_MESSAGES.invalidImage,
    { reason },
  )
}

/** 409 — 사람당 미첨부 상한 · 본문당 장수. details.limit */
export function uploadLimit(limit: number): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_LIMIT, UPLOAD_MESSAGES.limit, { limit })
}

/** 404 — 🔴 사유를 가르지 않는다 */
export function uploadNotFound(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND, UPLOAD_MESSAGES.notFound)
}

/** 503 — 저장소 오류 · 재인코딩 대기 초과 */
export function uploadUnavailable(): BusinessError {
  return new BusinessError(CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE, UPLOAD_MESSAGES.unavailable)
}
```

`http/messages.ts`: `import { IP_ACCESS_SCHEMA_MESSAGES, UPLOAD_SCHEMA_MESSAGES } from '@ssworks/admin-shared'` · `import { UPLOAD_MESSAGES } from '../uploads/errors.js'` · `ADMIN_SERVER_DEFAULT_MESSAGES` 끝에 `uploads: UPLOAD_MESSAGES,` · `/** admin-shared 업로드 스키마 문구 */ uploadsSchema: UPLOAD_SCHEMA_MESSAGES,`.

- [ ] **Step 4: GREEN**

Run: `pnpm --filter @ssworks/admin-server test messages && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/uploads/errors.ts packages/admin-server/src/http/messages.ts packages/admin-server/src/http/messages.test.ts
git commit -m "feat(admin-server): 업로드 오류 표 UPLOAD_MESSAGES · 문구 덮기 묶음 uploads · uploadsSchema(PR 2h Task 8)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 재인코딩 `uploads/encode.ts`(sniff · encodeUpload · EncodeGate)

**Files:**

- Create: `packages/admin-server/src/uploads/encode.ts`
- Create: `packages/admin-server/src/uploads/encode.test.ts`
- Create: `packages/admin-server/src/test-support/images.ts`(테스트 픽스처 — sharp 로 만든다)

- [ ] **Step 1: 픽스처 도우미** — `test-support/images.ts`

```ts
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'

// 테스트 전용 — 이미지 픽스처를 sharp 로 만든다(바이너리를 저장소에 두지 않는다). 🔴 빌드에서 빠진다.

export async function pngImage(width = 8, height = 8, background = '#336699'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer()
}

export async function jpegImage(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#993366' } })
    .jpeg()
    .toBuffer()
}

/** EXIF Orientation 6(시계 방향 90°) — autoOrient 가 가로세로를 바꾼다 */
export async function orientedJpeg(width = 20, height = 10): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#000000' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
}

export async function webpImage(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#669933' } })
    .webp()
    .toBuffer()
}

/** 2프레임 GIF 움짤 */
export async function animatedGif(size = 4): Promise<Buffer> {
  const a = await pngImage(size, size, '#ff0000')
  const b = await pngImage(size, size, '#00ff00')
  return sharp([a, b], { join: { animated: true } })
    .gif()
    .toBuffer()
}

/** 압축이 안 되는 잡음 PNG — 결과 크기 상한(413)을 재는 데 쓴다 */
export async function noisyPng(size = 64): Promise<Buffer> {
  return sharp(randomBytes(size * size * 3), { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
}

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>',
)
export const BMP_HEADER = Buffer.from('BM' + '\u0000'.repeat(60), 'latin1')
```

- [ ] **Step 2: 테스트** — `uploads/encode.test.ts`

```ts
import { BusinessError, CommonErrorCodes, DEFAULT_UPLOAD_POLICY } from '@ssworks/admin-shared'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { failure } from '../test-support/errors.js'
import {
  BMP_HEADER,
  SVG,
  animatedGif,
  jpegImage,
  noisyPng,
  orientedJpeg,
  pngImage,
  webpImage,
} from '../test-support/images.js'
import { EncodeGate, encodeUpload, sniffFormat } from './encode.js'

const policy = DEFAULT_UPLOAD_POLICY

async function expectCode(promise: Promise<unknown>, code: string, reason?: string) {
  const error = await failure(promise)
  expect(error.code).toBe(code)
  if (reason !== undefined) expect(error.details).toEqual({ reason })
  return error
}

describe('sniffFormat', () => {
  it('매직 바이트로 넷을 가르고 그 밖은 null', async () => {
    expect(sniffFormat(await pngImage())).toBe('png')
    expect(sniffFormat(await jpegImage())).toBe('jpeg')
    expect(sniffFormat(await webpImage())).toBe('webp')
    expect(sniffFormat(await animatedGif())).toBe('gif')
    expect(sniffFormat(SVG)).toBeNull()
    expect(sniffFormat(BMP_HEADER)).toBeNull()
    expect(sniffFormat(Buffer.alloc(0))).toBeNull()
  })
})

describe('encodeUpload(스펙 S4)', () => {
  it('PNG → WebP · 크기 · 정지 · 입력 형식', async () => {
    const out = await encodeUpload(await pngImage(8, 6), policy)
    expect(sniffFormat(out.data)).toBe('webp')
    expect(out).toMatchObject({ width: 8, height: 6, isAnimated: false, inputFormat: 'png' })
    expect(out.data.length).toBeGreaterThan(0)
  })

  it('🔴 EXIF 방향대로 돌리고 메타데이터는 싣지 않는다', async () => {
    const out = await encodeUpload(await orientedJpeg(20, 10), policy)
    expect(out.width).toBe(10)
    expect(out.height).toBe(20)
    const meta = await sharp(out.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
  })

  it('긴 변이 상한을 넘으면 비율을 지켜 줄인다 · 작으면 키우지 않는다', async () => {
    const shrunk = await encodeUpload(await pngImage(3000, 10), { ...policy, maxLongEdge: 2048 })
    expect(shrunk.width).toBe(2048)
    expect(shrunk.height).toBe(7)
    const kept = await encodeUpload(await pngImage(8, 8), { ...policy, maxLongEdge: 2048 })
    expect(kept.width).toBe(8)
  })

  it('움짤 GIF → 움직이는 WebP(2프레임) · 한 프레임 높이', async () => {
    const out = await encodeUpload(await animatedGif(4), policy)
    expect(out).toMatchObject({ width: 4, height: 4, isAnimated: true, inputFormat: 'gif' })
    expect((await sharp(out.data, { animated: true }).metadata()).pages).toBe(2)
  })

  it('415 — 형식 밖(SVG · BMP · 빈 본문)', async () => {
    for (const input of [SVG, BMP_HEADER, Buffer.alloc(0)]) {
      await expectCode(encodeUpload(input, policy), CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    }
  })

  it('🔴 400 — 픽셀 · 프레임 상한은 풀기 전에, 잘린 파일은 풀다가', async () => {
    await expectCode(
      encodeUpload(await pngImage(10, 10), { ...policy, maxInputPixels: 50 }),
      CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
      'too_many_pixels',
    )
    await expectCode(
      encodeUpload(await animatedGif(), { ...policy, maxFrames: 1 }),
      CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
      'too_many_frames',
    )
    const jpeg = await jpegImage(64, 64)
    await expectCode(
      encodeUpload(jpeg.subarray(0, Math.floor(jpeg.length * 0.6)), policy),
      CommonErrorCodes.ERR_UPLOAD_INVALID_IMAGE,
      'unreadable',
    )
  })

  it('413 — 결과가 장당 상한을 넘으면 details.maxBytes', async () => {
    const error = await expectCode(
      encodeUpload(await noisyPng(64), { ...policy, maxBytes: 500 }),
      CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
    )
    expect(error.details).toEqual({ maxBytes: 500 })
  })
})

describe('EncodeGate(스펙 S5)', () => {
  function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  it('동시 2 — 셋째는 자리가 날 때까지 기다린다', async () => {
    const gate = new EncodeGate(2, 1_000, 8)
    const first = deferred()
    const second = deferred()
    let thirdRan = false
    const a = gate.run(() => first.promise)
    const b = gate.run(() => second.promise)
    const c = gate.run(async () => {
      thirdRan = true
    })
    await Promise.resolve()
    expect(thirdRan).toBe(false)
    first.resolve()
    await a
    await c
    expect(thirdRan).toBe(true)
    second.resolve()
    await b
  })

  it('🔴 대기 초과 · 대기열 가득 → 503 ERR_UPLOAD_UNAVAILABLE(자리를 받지 않는다)', async () => {
    const gate = new EncodeGate(1, 20, 1)
    const hold = deferred()
    const running = gate.run(() => hold.promise)
    const waiting = gate.run(async () => 'late')
    const overflow = gate.run(async () => 'overflow')
    await expectCode(overflow, CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE)
    await expectCode(waiting, CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE)
    hold.resolve()
    await running
    expect(await gate.run(async () => 'next')).toBe('next')
  })

  it('fn 이 던져도 자리를 돌려준다', async () => {
    const gate = new EncodeGate(1, 1_000, 8)
    await expect(
      gate.run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await gate.run(async () => 'ok')).toBe('ok')
  })

  it('uploadUnavailable 은 BusinessError 다', async () => {
    const gate = new EncodeGate(0, 5, 0)
    const error = await failure(gate.run(async () => 1))
    expect(error).toBeInstanceOf(BusinessError)
  })
})
```

- [ ] **Step 3: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test encode`
Expected: FAIL — `Cannot find module './encode.js'`

- [ ] **Step 4: 구현** — `uploads/encode.ts`

```ts
import type { UploadPolicy } from '@ssworks/admin-shared'
import sharp from 'sharp'
import {
  uploadInvalidImage,
  uploadTooLarge,
  uploadUnavailable,
  uploadUnsupportedType,
} from './errors.js'

// 정본: ssworks-ringside apps/api/src/uploads/encode.ts(encodeUpload · EncodeGate · sniffFormat)
// 바꾼 점: 정책 타입이 admin-shared UploadPolicy, 오류 팩토리가 uploads/errors.ts. 그 밖은 그대로(스펙 S4 · S5).
// 🔴 트랜잭션 밖에서 부른다(스트림 읽기 → 재인코딩 → PUT → 짧은 INSERT). 원본 바이트 상한은 readImageBody 가 먼저 본다.

export type UploadInputFormat = 'jpeg' | 'png' | 'webp' | 'gif'

export interface EncodedImage {
  /** WebP(움짤이면 움직이는 WebP) — 메타데이터 없음 */
  data: Buffer
  width: number
  /** 움짤은 한 프레임 높이 */
  height: number
  isAnimated: boolean
  /** 바이트로 본 실제 형식 — Content-Type 과 달라도 이것을 따른다 */
  inputFormat: UploadInputFormat
}

/** 재인코딩 처리 시간 상한(초) — 큰 움짤 · 압축 폭탄이 문 자리를 오래 묶지 않게. 만료는 400 unreadable */
export const ENCODE_TIMEOUT_SECONDS = 15

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 매직 바이트로 본 형식 — 받는 네 형식이 아니면 null. SVG · HEIC · AVIF · TIFF · BMP 는 sharp 가 열어도 여기서 거른다 */
export function sniffFormat(input: Buffer): UploadInputFormat | null {
  if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg'
  if (input.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  const gif = input.subarray(0, 6).toString('latin1')
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif'
  const riff = input.subarray(0, 4).toString('latin1')
  if (riff === 'RIFF' && input.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

/**
 * 검사 · 재인코딩(스펙 S4).
 * 1. 매직 바이트가 jpeg · png · webp · gif 아니면 415
 * 2. 머리(metadata — 픽셀을 풀지 않는다)를 못 읽거나 형식이 다르면 400. 픽셀(너비 × 프레임 높이 × 프레임 수) > maxInputPixels 면 400,
 *    프레임 > maxFrames 면 400 — 풀기 전에 막는다
 * 3. 정지 이미지는 EXIF 방향대로 돌린다(autoOrient — 움짤은 돌리지 않는다)
 * 4. 긴 변 > maxLongEdge 면 비율을 지켜 줄인다(fit inside · 키우지 않음). 움짤은 animated 로 열어 움직이는 WebP
 * 5. 메타데이터(EXIF · GPS · XMP · ICC)는 싣지 않는다 — withMetadata 를 부르지 않는다
 * 6. 결과 > maxBytes 면 413. 풀다 실패 · 시간 초과면 400
 */
export async function encodeUpload(input: Buffer, policy: UploadPolicy): Promise<EncodedImage> {
  const inputFormat = sniffFormat(input)
  if (inputFormat === null) throw uploadUnsupportedType()
  const meta = await sharp(input)
    .metadata()
    .catch(() => {
      throw uploadInvalidImage('unreadable')
    })
  if (meta.format !== inputFormat) throw uploadInvalidImage('unreadable')
  const width = meta.width ?? 0
  const frameHeight = meta.pageHeight ?? meta.height ?? 0
  const frames = meta.pages ?? 1
  if (width <= 0 || frameHeight <= 0) throw uploadInvalidImage('unreadable')
  if (width * frameHeight * frames > policy.maxInputPixels) {
    throw uploadInvalidImage('too_many_pixels')
  }
  if (frames > policy.maxFrames) throw uploadInvalidImage('too_many_frames')

  const animated = frames > 1
  let pipeline = sharp(input, { animated, limitInputPixels: policy.maxInputPixels })
  if (!animated) pipeline = pipeline.autoOrient()
  if (Math.max(width, frameHeight) > policy.maxLongEdge) {
    pipeline = pipeline.resize({
      width: policy.maxLongEdge,
      height: policy.maxLongEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  const data = await pipeline
    .timeout({ seconds: ENCODE_TIMEOUT_SECONDS })
    .webp({ quality: policy.webpQuality })
    .toBuffer()
    .catch(() => {
      throw uploadInvalidImage('unreadable')
    })
  if (data.length > policy.maxBytes) throw uploadTooLarge(policy.maxBytes)

  const out = await sharp(data, { animated }).metadata()
  return {
    data,
    width: out.width ?? 0,
    height: out.pageHeight ?? out.height ?? 0,
    isAnimated: (out.pages ?? 1) > 1,
    inputFormat,
  }
}

/**
 * 프로세스당 동시 재인코딩 문(스펙 S5 — 기본 동시 2 · 대기 5초 · 대기열 8). 자리가 없으면 차례로 기다리고 waitMs 가 넘거나 대기열이
 * 찼으면 503 ERR_UPLOAD_UNAVAILABLE(자리를 받지 않는다). fn 이 끝나면(던져도) 자리를 다음 대기에 바로 넘긴다.
 * Nest 제공자는 `{ provide: EncodeGate, useValue: new EncodeGate() }` — 생성자 인자가 숫자라 클래스 제공자로 두지 않는다.
 */
export class EncodeGate {
  private active = 0
  private readonly queue: (() => void)[] = []

  constructor(
    private readonly concurrency = 2,
    private readonly waitMs = 5_000,
    private readonly maxQueue = 8,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1
      return Promise.resolve()
    }
    if (this.queue.length >= this.maxQueue) return Promise.reject(uploadUnavailable())
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        const index = this.queue.indexOf(grant)
        if (index !== -1) this.queue.splice(index, 1)
        reject(uploadUnavailable())
      }, this.waitMs)
      this.queue.push(grant)
    })
  }

  /** 기다리는 쪽이 있으면 자리를 그대로 넘긴다(active 그대로), 없으면 자리를 비운다 */
  private release(): void {
    const next = this.queue.shift()
    if (next === undefined) this.active -= 1
    else next()
  }
}
```

- [ ] **Step 5: GREEN**

Run: `pnpm --filter @ssworks/admin-server test encode && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS. 축소 테스트의 `height` 가 7 이 아니라 6 이면(sharp 반올림 방식) **기대값을 실측으로** 고치고 보고서에 적는다 — 비율 유지가 요점이다. 잘린 JPEG 가 400 이 아니라 성공하면 `pipeline` 생성에 `{ failOn: 'error' }` 대신 기본(`'warning'`)인지 확인하고, 그래도 통과하면 잘라 내는 비율을 0.3 으로 낮춘다.

- [ ] **Step 6: 커밋**

```bash
git add packages/admin-server/src/uploads/encode.ts packages/admin-server/src/uploads/encode.test.ts packages/admin-server/src/test-support/images.ts
git commit -m "feat(admin-server): sharp 재인코딩(encodeUpload · sniffFormat · EncodeGate)(PR 2h Task 9)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: 본문 읽기 `uploads/read-body.ts`

**Files:**

- Create: `packages/admin-server/src/uploads/read-body.ts`
- Create: `packages/admin-server/src/uploads/read-body.test.ts`

- [ ] **Step 1: 테스트** — `uploads/read-body.test.ts`

```ts
import { Readable } from 'node:stream'
import { CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { failure } from '../test-support/errors.js'
import { isUploadContentType, readImageBody } from './read-body.js'

/** 요청 흉내 — 본문 조각과 머리글 */
function fakeRequest(chunks: Buffer[], headers: Record<string, string> = {}): Request {
  const stream = Readable.from(chunks)
  return Object.assign(stream, {
    headers: { 'content-type': 'image/png', ...headers },
  }) as unknown as Request
}

describe('isUploadContentType', () => {
  it('매개변수 · 대소문자를 무시하고 넷만', () => {
    expect(isUploadContentType('image/png')).toBe(true)
    expect(isUploadContentType('IMAGE/JPEG; charset=binary')).toBe(true)
    expect(isUploadContentType('image/gif')).toBe(true)
    expect(isUploadContentType('image/webp')).toBe(true)
    expect(isUploadContentType('image/svg+xml')).toBe(false)
    expect(isUploadContentType('application/json')).toBe(false)
    expect(isUploadContentType(undefined)).toBe(false)
  })
})

describe('readImageBody(스펙 U2)', () => {
  it('조각을 모아 Buffer 하나로', async () => {
    const body = await readImageBody(fakeRequest([Buffer.from('ab'), Buffer.from('cd')]), 100)
    expect(body.toString()).toBe('abcd')
  })

  it('415 — Content-Type 밖 · Content-Encoding 이 붙음(identity 는 된다) — 본문을 읽기 전에', async () => {
    const wrong = await failure(
      readImageBody(fakeRequest([Buffer.from('x')], { 'content-type': 'text/plain' }), 100),
    )
    expect(wrong.code).toBe(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    const gzip = await failure(
      readImageBody(fakeRequest([Buffer.from('x')], { 'content-encoding': 'gzip' }), 100),
    )
    expect(gzip.code).toBe(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    expect(
      (
        await readImageBody(
          fakeRequest([Buffer.from('x')], { 'content-encoding': 'identity' }),
          100,
        )
      ).toString(),
    ).toBe('x')
  })

  it('🔴 413 — Content-Length 가 상한을 넘으면 읽기 전에, 아니면 읽다가 넘는 순간(details.maxBytes)', async () => {
    const declared = await failure(
      readImageBody(fakeRequest([Buffer.alloc(1)], { 'content-length': '101' }), 100),
    )
    expect(declared.code).toBe(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE)
    expect(declared.details).toEqual({ maxBytes: 100 })

    const chunks = [Buffer.alloc(60), Buffer.alloc(60), Buffer.alloc(60)]
    const request = fakeRequest(chunks)
    const streamed = await failure(readImageBody(request, 100))
    expect(streamed.code).toBe(CommonErrorCodes.ERR_UPLOAD_TOO_LARGE)
    // 남은 본문은 버린다(소켓을 닫지 않는다) — 스트림이 흐르는 상태로 끝까지 간다
    await new Promise<void>((resolve) => request.on('end', resolve).on('close', resolve))
    expect(request.destroyed === true || request.readableEnded === true).toBe(true)
  })

  it('스트림 오류는 그대로 던진다', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('socket hang up'))
      },
    })
    const request = Object.assign(stream, {
      headers: { 'content-type': 'image/png' },
    }) as unknown as Request
    await expect(readImageBody(request, 100)).rejects.toThrow('socket hang up')
  })
})
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test read-body`
Expected: FAIL — `Cannot find module './read-body.js'`

- [ ] **Step 3: 구현** — `uploads/read-body.ts`

```ts
import { UPLOAD_CONTENT_TYPES } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { uploadTooLarge, uploadUnsupportedType } from './errors.js'

// 정본: ssworks-ringside apps/api/src/uploads/upload-body.ts(express.raw 미들웨어 — 이미지 네 형식 · 하드 상한 · inflate:false)
// 바꾼 점: 미들웨어가 아니라 컨트롤러가 부르는 함수다(스펙 U2) — RouterModule 접두사와 무관하고, JSON 파서는 image/* 를 건드리지
//   않아 요청 스트림이 온전하다. Content-Encoding 이 붙은 본문은 풀지 않고 415(압축 폭탄).
// 🔴 상한을 넘는 순간 모으기를 멈추고 `resume()` 으로 남은 본문을 버린 뒤 413 을 던진다 — 소켓을 끊지 않아 클라이언트가 413 을 받는다.
// 🔴 이미지 형식은 CORS 단순 요청 형식이 아니다 — 다른 출처는 사전 요청에서 막힌다(CSRF — 같은 출처 + 비단순 본문 규약).

const UPLOAD_TYPES: ReadonlySet<string> = new Set(UPLOAD_CONTENT_TYPES)

/** Content-Type 의 미디어 형식(매개변수 · 대소문자 무시)이 이미지 네 형식인가 — 실제 형식은 재인코딩이 매직 바이트로 다시 본다 */
export function isUploadContentType(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase()
  return mediaType !== undefined && UPLOAD_TYPES.has(mediaType)
}

function headerOf(req: Request, name: string): string | undefined {
  const value = req.headers[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * 원시 이미지 본문을 Buffer 로 — 415(형식 · 인코딩) → 413(Content-Length) → 스트림(넘는 순간 413).
 * 빈 본문은 빈 Buffer 다(재인코딩의 매직 바이트 검사가 415 를 낸다).
 */
export function readImageBody(req: Request, maxBytes: number): Promise<Buffer> {
  if (!isUploadContentType(headerOf(req, 'content-type'))) {
    return Promise.reject(uploadUnsupportedType())
  }
  const encoding = headerOf(req, 'content-encoding')
  if (encoding !== undefined && encoding.trim().toLowerCase() !== 'identity') {
    return Promise.reject(uploadUnsupportedType())
  }
  const declared = Number(headerOf(req, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return Promise.reject(uploadTooLarge(maxBytes))
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false
    const finish = (done: () => void) => {
      if (settled) return
      settled = true
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      done()
    }
    const onData = (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        finish(() => {
          // 남은 본문은 버린다 — 응답을 보낼 수 있게 소켓은 그대로
          req.resume()
          reject(uploadTooLarge(maxBytes))
        })
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => finish(() => resolve(Buffer.concat(chunks)))
    const onError = (error: Error) => finish(() => reject(error))
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
  })
}
```

- [ ] **Step 4: GREEN**

Run: `pnpm --filter @ssworks/admin-server test read-body && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/uploads/read-body.ts packages/admin-server/src/uploads/read-body.test.ts
git commit -m "feat(admin-server): 업로드 본문 스트림 읽기(415 · 413 · 남은 본문 버림)(PR 2h Task 10)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 용도 선언 `@RequireUploadPurpose()` · 전역 권한 가드의 넷째 분기

**Files:**

- Create: `packages/admin-server/src/auth/upload-purpose.ts`
- Create: `packages/admin-server/src/auth/upload-purpose.test.ts`
- Modify: `packages/admin-server/src/auth/permission.guard.ts`
- Modify: `packages/admin-server/src/auth/permission.guard.test.ts`(넷째 선언 사례)

- [ ] **Step 1: 순수 함수 테스트** — `auth/upload-purpose.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { UploadPurposeGrant } from '../uploads/options.js'
import { grantsUploadPurpose, requestedUploadPurpose } from './upload-purpose.js'

const table = new Map<string, UploadPurposeGrant>([
  ['legal', { slot: 'legal.publish', permissions: [] }],
  ['notice', { slot: null, permissions: ['board.posts:write', 'board.posts:read'] }],
])
const permissions = { 'legal.publish': 'setting.legal:publish' }

describe('requestedUploadPurpose(스펙 U6)', () => {
  it('query.purpose 가 먼저, 없으면 params.purpose — 문자열 하나 · 형식 안일 때만', () => {
    expect(requestedUploadPurpose({ query: { purpose: 'legal' }, params: {} })).toBe('legal')
    expect(requestedUploadPurpose({ query: {}, params: { purpose: 'notice' } })).toBe('notice')
    expect(
      requestedUploadPurpose({ query: { purpose: 'legal' }, params: { purpose: 'notice' } }),
    ).toBe('legal')
    expect(requestedUploadPurpose({ query: { purpose: ['a', 'b'] }, params: {} })).toBeNull()
    expect(requestedUploadPurpose({ query: { purpose: 'bad kind' }, params: {} })).toBeNull()
    expect(requestedUploadPurpose({ query: {}, params: {} })).toBeNull()
  })
})

describe('grantsUploadPurpose', () => {
  it('슬롯 용도 — 이어진 키를 가져야 참, 이어지지 않은 슬롯은 거짓', () => {
    expect(grantsUploadPurpose(table, permissions, ['setting.legal:publish'], 'legal')).toBe(true)
    expect(grantsUploadPurpose(table, permissions, ['*'], 'legal')).toBe(true)
    expect(grantsUploadPurpose(table, permissions, ['setting.legal:read'], 'legal')).toBe(false)
    expect(grantsUploadPurpose(table, {}, ['*'], 'legal')).toBe(false)
  })

  it('권한 키 용도 — 전부(AND) 가져야 참', () => {
    expect(
      grantsUploadPurpose(table, permissions, ['board.posts:write', 'board.posts:read'], 'notice'),
    ).toBe(true)
    expect(grantsUploadPurpose(table, permissions, ['board.posts:write'], 'notice')).toBe(false)
    expect(grantsUploadPurpose(table, permissions, ['*'], 'notice')).toBe(true)
  })

  it('🔴 모르는 용도 · null · 표 없음은 거짓(fail-closed)', () => {
    expect(grantsUploadPurpose(table, permissions, ['*'], 'nope')).toBe(false)
    expect(grantsUploadPurpose(table, permissions, ['*'], null)).toBe(false)
    expect(grantsUploadPurpose(undefined, permissions, ['*'], 'legal')).toBe(false)
  })
})
```

- [ ] **Step 2: 가드 테스트 갱신** — `auth/permission.guard.test.ts` 를 열어 기존 방식(가짜 `ExecutionContext` · `Reflector`)을 따라 사례 셋을 더한다. 기존 도우미 이름이 다르면 그 이름으로 맞춘다. import 에 더한다: `import { REQUIRE_UPLOAD_PURPOSE } from '../tokens.js'` · `import type { ResolvedUploadsConfig } from '../uploads/options.js'` · `AUTH_MESSAGES`(`./errors.js`) 가 없으면 그것도.

```ts
describe('@RequireUploadPurpose(2h 스펙 U6)', () => {
  const uploads = {
    purposes: new Map([['legal', { slot: 'legal.publish', permissions: [] }]]),
  } as unknown as ResolvedUploadsConfig

  it('용도의 권한이 있으면 통과 — query.purpose', () => {
    const guard = new AdminPermissionGuard(
      reflectorWith({ [REQUIRE_UPLOAD_PURPOSE]: true }),
      config,
      uploads,
    )
    expect(
      guard.canActivate(
        httpContext({ permissions: ['setting.legal:publish'] }, { query: { purpose: 'legal' } }),
      ),
    ).toBe(true)
  })

  it('🔴 권한 없음 · 모르는 용도 · 업로드 설정 없음은 403', () => {
    expect(() =>
      new AdminPermissionGuard(
        reflectorWith({ [REQUIRE_UPLOAD_PURPOSE]: true }),
        config,
        uploads,
      ).canActivate(
        httpContext({ permissions: ['setting.legal:read'] }, { query: { purpose: 'legal' } }),
      ),
    ).toThrow(AUTH_MESSAGES.forbidden)
    expect(() =>
      new AdminPermissionGuard(
        reflectorWith({ [REQUIRE_UPLOAD_PURPOSE]: true }),
        config,
        uploads,
      ).canActivate(httpContext({ permissions: ['*'] }, { query: { purpose: 'nope' } })),
    ).toThrow(AUTH_MESSAGES.forbidden)
    expect(() =>
      new AdminPermissionGuard(
        reflectorWith({ [REQUIRE_UPLOAD_PURPOSE]: true }),
        config,
        undefined,
      ).canActivate(httpContext({ permissions: ['*'] }, { query: { purpose: 'legal' } })),
    ).toThrow(AUTH_MESSAGES.forbidden)
  })

  it('선언 없는 라우트의 fail-closed 는 그대로(회귀)', () => {
    expect(() =>
      new AdminPermissionGuard(reflectorWith({}), config, uploads).canActivate(
        httpContext({ permissions: ['*'] }, {}),
      ),
    ).toThrow(AUTH_MESSAGES.noPermissionDeclared)
  })
})
```

`config` 는 그 파일의 `ResolvedAuthConfig` 가짜(`permissions: { 'legal.publish': 'setting.legal:publish' }` 를 포함하게 — 없으면 그 테스트 안에서 `{ ...config, permissions: { 'legal.publish': 'setting.legal:publish' } }`), `httpContext(principal, req)` 는 주체를 `setAdminPrincipal` 로 붙인 요청과 `query` · `params` 를 가진 가짜 컨텍스트다(기존 도우미가 요청 객체를 받지 않으면 둘째 인자를 받게 넓힌다).

- [ ] **Step 3: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test upload-purpose permission.guard`
Expected: FAIL — `Cannot find module './upload-purpose.js'` · 가드 생성자 인자 수

- [ ] **Step 4: 선언 · 해석** — `auth/upload-purpose.ts`

```ts
import { SetMetadata, type CustomDecorator } from '@nestjs/common'
import { UPLOAD_PURPOSE_PATTERN, hasPermission } from '@ssworks/admin-shared'
import { REQUIRE_UPLOAD_PURPOSE } from '../tokens.js'
import type { UploadPurposeGrant } from '../uploads/options.js'
import type { AdminPermissionMap } from './permission-slots.js'

// 정본: 없음 — 2h 스펙 U6. 패키지 라우트의 넷째 권한 선언. 용도(query.purpose · params.purpose)를 코어 옵션 uploads.purposes 로 푼다.
// 🔴 가드는 업로드 모듈을 주입받지 않는다 — 전역 모듈이 내보내는 ADMIN_UPLOADS_CONFIG 를 @Optional() 로 받는다(순환 없음).
//    설정이 없으면(업로드 모듈 미등록) 선언한 라우트는 403 이다(fail-closed).

/** 이 라우트는 요청의 용도가 가리키는 권한을 요구한다 — `POST /uploads?purpose=` · `DELETE /uploads/:purpose/...` */
export function RequireUploadPurpose(): CustomDecorator<string> {
  return SetMetadata(REQUIRE_UPLOAD_PURPOSE, true)
}

/** 요청의 용도 — query.purpose 가 먼저, 없으면 params.purpose. 문자열 하나가 아니거나 형식 밖이면 null */
export function requestedUploadPurpose(req: { query?: unknown; params?: unknown }): string | null {
  const fromQuery = (req.query as Record<string, unknown> | undefined)?.purpose
  const fromParams = (req.params as Record<string, unknown> | undefined)?.purpose
  const raw = fromQuery ?? fromParams
  return typeof raw === 'string' && UPLOAD_PURPOSE_PATTERN.test(raw) ? raw : null
}

/**
 * 용도의 권한을 가졌는가 — 슬롯이면 permissions 맵의 키(hasPermission — '*' 는 정확 일치), 아니면 적힌 키 전부(AND).
 * 🔴 모르는 용도 · 이어지지 않은 슬롯 · 표 없음 · null 은 거짓 — 가드의 fail-closed 를 그대로 잇는다
 */
export function grantsUploadPurpose(
  table: ReadonlyMap<string, UploadPurposeGrant> | undefined,
  permissions: Readonly<AdminPermissionMap>,
  granted: readonly string[],
  purpose: string | null,
): boolean {
  if (table === undefined || purpose === null) return false
  const grant = table.get(purpose)
  if (grant === undefined) return false
  if (grant.slot !== null) {
    const key = permissions[grant.slot]
    return key != null && hasPermission(granted, key)
  }
  return grant.permissions.length > 0 && hasPermission(granted, ...grant.permissions)
}
```

- [ ] **Step 5: 가드 분기** — `auth/permission.guard.ts`

import 에 `Optional` (`@nestjs/common`) · `ADMIN_UPLOADS_CONFIG` · `REQUIRE_UPLOAD_PURPOSE`(tokens) · `import type { ResolvedUploadsConfig } from '../uploads/options.js'` · `import { grantsUploadPurpose, requestedUploadPurpose } from './upload-purpose.js'`. 생성자에 셋째 인자:

```ts
  constructor(
    private readonly reflector: Reflector,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: ResolvedAuthConfig,
    // 🔴 @Optional — 업로드 모듈이 없는 앱에서도 가드는 뜬다. 그때 @RequireUploadPurpose 라우트는 403 이다(2h 스펙 U6)
    @Optional() @Inject(ADMIN_UPLOADS_CONFIG) private readonly uploads?: ResolvedUploadsConfig,
  ) {}
```

`hasAnyOf` 계산 다음에 `const purposeDeclared = flag(REQUIRE_UPLOAD_PURPOSE)`. 조건을 `if (hasSlots || hasRequired || hasAnyOf || purposeDeclared) {` 로 넓히고, `hasAnyOf` 검사 뒤 `return true` 앞에:

```ts
// 넷째 선언(2h 스펙 U6) — 용도(query.purpose · params.purpose)가 가리키는 권한. 모르는 용도 · 설정 없음은 403
if (purposeDeclared) {
  const req = context.switchToHttp().getRequest<Request>()
  const purpose = requestedUploadPurpose(req)
  if (
    !grantsUploadPurpose(
      this.uploads?.purposes,
      this.config.permissions,
      principal.permissions,
      purpose,
    )
  ) {
    throw forbidden()
  }
}
```

머리 주석 "바꾼 점" 끝에 ` - 2h: 넷째 선언 @RequireUploadPurpose — 용도 → 권한(auth/upload-purpose.ts). 업로드 설정은 @Optional.` 한 줄.

- [ ] **Step 6: GREEN**

Run: `pnpm --filter @ssworks/admin-server test upload-purpose permission.guard auth.guard && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS(기존 fail-closed 회귀 포함)

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-server/src/auth/upload-purpose.ts packages/admin-server/src/auth/upload-purpose.test.ts packages/admin-server/src/auth/permission.guard.ts packages/admin-server/src/auth/permission.guard.test.ts
git commit -m "feat(admin-server): @RequireUploadPurpose — 용도 → 권한, 전역 가드의 넷째 선언(PR 2h Task 11)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: 키 · 첨부 도우미 · 서비스(`uploads/keys.ts` · `attach.ts` · `uploads.service.ts`)

**Files:**

- Create: `packages/admin-server/src/uploads/keys.ts` · `keys.test.ts`
- Create: `packages/admin-server/src/uploads/attach.ts` · `attach.db.test.ts`
- Create: `packages/admin-server/src/uploads/uploads.service.ts` · `uploads.service.db.test.ts`
- Create: `packages/admin-server/src/test-support/uploads.ts`(행 시드 · 요청 흉내 · 설정)

- [ ] **Step 1: 키 테스트** — `uploads/keys.test.ts`

```ts
import { isUploadKey } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { newUploadKey } from './keys.js'

describe('newUploadKey(스펙 U1)', () => {
  it('용도 · UTC 연월 · base64url 32자 · .webp — 키 모양을 지난다', () => {
    const key = newUploadKey('legal', new Date('2026-11-01T23:30:00Z'), () =>
      Buffer.alloc(24, 0xff),
    )
    expect(key).toBe(
      'legal/2026/11/____________________________________'.slice(0, 14) + '_'.repeat(32) + '.webp',
    )
    expect(isUploadKey(key)).toBe(true)
    expect(newUploadKey('legal', new Date('2026-12-31T15:30:00Z'))).toMatch(/^legal\/2026\/12\//)
    expect(newUploadKey('legal', new Date('2027-01-01T00:00:00Z'))).toMatch(/^legal\/2027\/01\//)
  })

  it('무작위 24바이트 — 두 번 부르면 다르다 · 바이트 수가 틀리면 던진다', () => {
    expect(newUploadKey('a', new Date())).not.toBe(newUploadKey('a', new Date()))
    expect(() => newUploadKey('a', new Date(), () => Buffer.alloc(3))).toThrow('24바이트')
  })
})
```

(`Buffer.alloc(24, 0xff).toString('base64url')` 는 `_` 32자다 — 첫 단언은 그 사실을 적은 것이다. 실측과 다르면 `'legal/2026/11/' + '_'.repeat(32) + '.webp'` 로 고쳐 적는다.)

- [ ] **Step 2: 키 구현** — `uploads/keys.ts`

```ts
import { randomBytes } from 'node:crypto'

// 정본: ssworks-ringside packages/db/src/uploads/keys.ts newUploadKey
// 바꾼 점: 접두사가 용도 문자열 그대로(옵션 검증을 지난 값). mediaUrl 은 admin-shared uploadUrl.

const RANDOM_BYTES = 24

/** 새 키 `<용도>/<yyyy>/<mm>/<base64url 32자>.webp` — 연월은 UTC. random 은 테스트가 결정적으로 바꾼다 */
export function newUploadKey(
  purpose: string,
  now: Date,
  random: (size: number) => Buffer = randomBytes,
): string {
  const bytes = random(RANDOM_BYTES)
  if (bytes.length !== RANDOM_BYTES) throw new Error(`키 무작위 바이트는 ${RANDOM_BYTES}바이트다`)
  const year = String(now.getUTCFullYear()).padStart(4, '0')
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${purpose}/${year}/${month}/${bytes.toString('base64url')}.webp`
}
```

Run: `pnpm --filter @ssworks/admin-server test uploads/keys` → PASS

- [ ] **Step 3: 테스트 도우미** — `test-support/uploads.ts`

```ts
import { Readable } from 'node:stream'
import type { Request } from 'express'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { newUploadKey } from '../uploads/keys.js'
import { resolveUploadsConfig, type ResolvedUploadsConfig } from '../uploads/options.js'
import { MemoryObjectStorage } from './memory-storage.js'

// 테스트 전용 — 업로드 행 시드 · 요청 흉내 · 설정. 🔴 빌드에서 빠진다.

export interface SeedUploadInput {
  purpose?: string
  uploadedByUserNo: bigint | null
  key?: string
  refType?: string | null
  refId?: bigint | null
  deletedAt?: Date | null
  /** 지나간 시각으로 넣는다(정리 테스트) — createdAt 은 Kysely 로 넣을 수 없어 원시 SQL */
  createdAt?: Date
}

/** 저장소를 거치지 않고 행만 — 첨부 · 정리 · 중계 판정 테스트 */
export async function seedUpload(
  db: Kysely<AdminDatabase>,
  input: SeedUploadInput,
): Promise<{ uploadNo: bigint; key: string }> {
  const key = input.key ?? newUploadKey(input.purpose ?? 'legal', new Date())
  const attached = input.refType != null
  const result = await db
    .insertInto('uploads')
    .values({
      storageKey: key,
      purpose: input.purpose ?? 'legal',
      uploadedByUserNo: input.uploadedByUserNo,
      bytes: 100,
      width: 8,
      height: 8,
      refType: input.refType ?? null,
      refId: attached ? (input.refId ?? 1n) : null,
      attachedAt: attached ? new Date() : null,
      deletedAt: input.deletedAt ?? null,
    })
    .executeTakeFirstOrThrow()
  const uploadNo = result.insertId as bigint
  if (input.createdAt !== undefined) {
    await sql`update uploads set created_at = ${input.createdAt} where upload_no = ${uploadNo}`.execute(
      db,
    )
  }
  return { uploadNo, key }
}

/** 서비스 테스트용 요청 — 본문 조각 · Content-Type */
export function imageRequest(body: Buffer, contentType = 'image/png'): Request {
  return Object.assign(Readable.from([body]), {
    headers: { 'content-type': contentType, 'content-length': String(body.length) },
  }) as unknown as Request
}

/** 메모리 저장소 + 기본 정책(덮기 가능) — 약관 용도 자동 */
export function testUploadsConfig(
  storage: MemoryObjectStorage,
  overrides: { policy?: Record<string, number>; mediaPath?: string; sweep?: false } = {},
): ResolvedUploadsConfig {
  return resolveUploadsConfig(
    {
      uploads: {
        storage,
        mediaPath: overrides.mediaPath ?? '/media',
        policy: overrides.policy,
        sweep: overrides.sweep,
      },
      permissions: { 'legal.publish': 'setting.legal:publish' },
    } as never,
    true,
    'test',
  )
}
```

- [ ] **Step 4: 첨부 DB 테스트** — `uploads/attach.db.test.ts`

```ts
import { CommonErrorCodes, uploadUrl } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { failure } from '../test-support/errors.js'
import { seedUpload } from '../test-support/uploads.js'
import { attachUploads, syncUploads } from './attach.js'

// 첨부 도우미(스펙 U8 · U9) — 트랜잭션 안에서 부른다. 잠금 순서의 마지막.

let t: TestDatabase
let me: SeededUser
let other: SeededUser
const MEDIA = '/media'
const img = (key: string) => `![](${uploadUrl(key, MEDIA)})`

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '첨부', permissions: [] })
  me = await seedUser(t.db, { roleNo: role, userId: 'attach-me' })
  other = await seedUser(t.db, { roleNo: role, userId: 'attach-other' })
})

afterAll(async () => {
  await t?.drop()
})

const inTrx = <T>(
  fn: Parameters<typeof t.db.transaction>[0] extends never
    ? never
    : (trx: typeof t.db) => Promise<T>,
) => t.db.transaction().execute((trx) => fn(trx as unknown as typeof t.db))

async function rowOf(key: string) {
  return t.db
    .selectFrom('uploads')
    .select(['refType', 'refId', 'attachedAt', 'deletedAt'])
    .where('storageKey', '=', key)
    .executeTakeFirstOrThrow()
}

describe('attachUploads', () => {
  it('본인 미첨부 키를 그 문서에 붙인다 — refType · refId · attachedAt, 본문에 없는 키는 그대로', async () => {
    const a = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const b = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const result = await inTrx((trx) =>
      attachUploads(
        trx,
        {
          markdown: `${img(a.key)}\n\n${img(a.key)}`,
          purpose: 'legal',
          refType: 'legalDocument',
          refId: 7n,
          actorUserNo: me.userNo,
        },
        { mediaPath: MEDIA },
      ),
    )
    expect(result).toEqual({ attached: 1, keys: [a.key] })
    expect(await rowOf(a.key)).toMatchObject({ refType: 'legalDocument', refId: 7n })
    expect((await rowOf(a.key)).attachedAt).toBeInstanceOf(Date)
    expect(await rowOf(b.key)).toMatchObject({ refType: null, refId: null, attachedAt: null })
  })

  it('이미 같은 refType 에 붙은 키는 통과하고 refId 는 그대로(약관 새 판이 앞 판 그림을 다시 씀)', async () => {
    const a = await seedUpload(t.db, {
      uploadedByUserNo: other.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const result = await inTrx((trx) =>
      attachUploads(
        trx,
        {
          markdown: img(a.key),
          purpose: 'legal',
          refType: 'legalDocument',
          refId: 2n,
          actorUserNo: me.userNo,
        },
        { mediaPath: MEDIA },
      ),
    )
    expect(result.attached).toBe(0)
    expect(await rowOf(a.key)).toMatchObject({ refType: 'legalDocument', refId: 1n })
  })

  it('그림 없는 본문 · 우리 경로가 아닌 그림은 아무것도 하지 않는다', async () => {
    expect(
      await inTrx((trx) =>
        attachUploads(
          trx,
          {
            markdown: '글자뿐 ![x](https://example.com/a.png)',
            purpose: 'legal',
            refType: 'legalDocument',
            refId: 1n,
            actorUserNo: me.userNo,
          },
          { mediaPath: MEDIA },
        ),
      ),
    ).toEqual({ attached: 0, keys: [] })
  })

  it('🔴 404 — 남의 미첨부 · 지움 표시 · 다른 용도 · 다른 refType 에 첨부됨 · 없는 키. 트랜잭션은 롤백(아무 행도 안 바뀐다)', async () => {
    const mine = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const cases = [
      await seedUpload(t.db, { uploadedByUserNo: other.userNo }),
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() }),
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, purpose: 'notice' }),
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, refType: 'notice', refId: 3n }),
      { key: 'legal/2026/11/' + 'Z'.repeat(32) + '.webp' },
    ]
    for (const bad of cases) {
      const error = await failure(
        inTrx((trx) =>
          attachUploads(
            trx,
            {
              markdown: `${img(mine.key)}\n\n${img(bad.key)}`,
              purpose: 'legal',
              refType: 'legalDocument',
              refId: 9n,
              actorUserNo: me.userNo,
            },
            { mediaPath: MEDIA },
          ),
        ),
      )
      expect(error.code, bad.key).toBe(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND)
      expect(await rowOf(mine.key)).toMatchObject({ refType: null })
    }
  })

  it('🔴 본문당 장수 초과는 409 ERR_UPLOAD_LIMIT(details.limit) — 잠그기 전에', async () => {
    const keys = await Promise.all(
      [1, 2, 3].map(() => seedUpload(t.db, { uploadedByUserNo: me.userNo })),
    )
    const error = await failure(
      inTrx((trx) =>
        attachUploads(
          trx,
          {
            markdown: keys.map((k) => img(k.key)).join('\n\n'),
            purpose: 'legal',
            refType: 'legalDocument',
            refId: 1n,
            actorUserNo: me.userNo,
          },
          { mediaPath: MEDIA, maxPerBody: 2 },
        ),
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_LIMIT)
    expect(error.details).toEqual({ limit: 2 })
  })
})

describe('syncUploads(제자리 수정 문서)', () => {
  it('붙이고, 이 문서에 붙어 있었는데 본문에서 빠진 키는 지움 표시 — 남은 키 · 다른 문서 키는 그대로', async () => {
    const kept = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'notice',
      refId: 10n,
    })
    const dropped = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'notice',
      refId: 10n,
    })
    const elsewhere = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'notice',
      refId: 11n,
    })
    const fresh = await seedUpload(t.db, { uploadedByUserNo: me.userNo, purpose: 'notice' })
    const result = await inTrx((trx) =>
      syncUploads(
        trx,
        {
          markdown: `${img(kept.key)}\n\n${img(fresh.key)}`,
          purpose: 'notice',
          refType: 'notice',
          refId: 10n,
          actorUserNo: me.userNo,
        },
        { mediaPath: MEDIA },
      ),
    )
    expect(result).toEqual({ attached: 1, detached: 1, keys: [kept.key, fresh.key] })
    expect((await rowOf(dropped.key)).deletedAt).toBeInstanceOf(Date)
    expect((await rowOf(kept.key)).deletedAt).toBeNull()
    expect((await rowOf(elsewhere.key)).deletedAt).toBeNull()
    expect(await rowOf(fresh.key)).toMatchObject({ refType: 'notice', refId: 10n })
  })
})
```

(`inTrx` 의 타입 장난이 lint 에 걸리면 `const inTrx = <T>(fn: (trx: Kysely<AdminDatabase>) => Promise<T>) => t.db.transaction().execute(fn)` 로 적는다 — `Transaction<DB>` 는 `Kysely<DB>` 를 넓힌 타입이라 그대로 들어간다.)

- [ ] **Step 5: 첨부 구현** — `uploads/attach.ts`

```ts
import { DEFAULT_MEDIA_PATH, DEFAULT_UPLOAD_POLICY, collectUploadKeys } from '@ssworks/admin-shared'
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import { uploadLimit, uploadNotFound } from './errors.js'

// 정본: ssworks-ringside packages/db/src/uploads/attach.ts attachUploadsIn(키 모으기 · 잠금 · 판정 · 한 UPDATE · 빠진 키 지움 표시)
// 바꾼 점(스펙 U8 · U9):
//  - 첨부(attachUploads)와 빠진 키 지움(syncUploads)을 가른다 — 약관은 append-only 라 앞 판의 그림을 지우면 안 된다.
//  - "이미 같은 refType 에 첨부됨" 은 통과(약관 새 판이 앞 판 그림을 다시 쓴다). refId 는 첫 첨부 그대로.
//  - 잘못된 키는 사유를 가르지 않고 404 하나(열거 방어). ringside 는 400 + details.keys.
//  - 읽기는 `storageKey IN (...) ORDER BY uploadNo FOR UPDATE` 하나 — 비잠금 선행 읽기가 없다(스냅샷 격리 ON 에서 1020).
// 🔴 트랜잭션 안에서, 자기 문서 행을 먼저 잠근 뒤 부른다 — `uploads` 가 잠금 순서의 마지막이다(스펙 §5-6).

export interface AttachUploadsInput {
  /** 저장하려는 본문(Markdown) — 키는 collectUploadKeys 로 모은다 */
  markdown: string
  /** 이 본문의 용도 — 키의 용도와 같아야 한다 */
  purpose: string
  /** 첨부 대상 종류 — 감사 대상 이름과 같은 값(CoreAuditTargets.LEGAL_DOCUMENT …) */
  refType: string
  refId: bigint
  /** 본문을 쓰는 관리자 — 미첨부 키는 이 사람이 올린 것이어야 한다 */
  actorUserNo: bigint
}

export interface AttachUploadsOptions {
  /** 본문에 적힌 공개 경로(옵션 uploads.mediaPath). 기본 DEFAULT_MEDIA_PATH */
  mediaPath?: string
  /** 본문당 장수(정책 maxPerBody). 기본 DEFAULT_UPLOAD_POLICY.maxPerBody */
  maxPerBody?: number
  now?: Date
}

export interface AttachUploadsResult {
  /** 이번에 붙인 수(이미 붙어 있던 것은 세지 않는다) */
  attached: number
  /** 본문의 우리 키 — 처음 나온 순서 */
  keys: string[]
}

export interface SyncUploadsResult extends AttachUploadsResult {
  /** 이 문서에 붙어 있었는데 본문에서 빠져 지움 표시한 수 */
  detached: number
}

/**
 * 본문 속 우리 키를 문서에 붙인다. 키마다 ① 존재 · 미삭제 · 같은 용도 ② 미첨부면 본인이 올린 것, 첨부됐으면 같은 refType —
 * 아니면 404 로 **저장 전체가 실패**한다(트랜잭션 롤백). 본문당 장수 초과는 409(잠그기 전에).
 */
export async function attachUploads(
  trx: Kysely<AdminDatabase>,
  input: AttachUploadsInput,
  options: AttachUploadsOptions = {},
): Promise<AttachUploadsResult> {
  const keys = collectUploadKeys(input.markdown, options.mediaPath ?? DEFAULT_MEDIA_PATH)
  if (keys.length === 0) return { attached: 0, keys }
  const maxPerBody = options.maxPerBody ?? DEFAULT_UPLOAD_POLICY.maxPerBody
  if (keys.length > maxPerBody) throw uploadLimit(maxPerBody)

  const rows = await trx
    .selectFrom('uploads')
    .select(['uploadNo', 'storageKey', 'purpose', 'uploadedByUserNo', 'refType', 'deletedAt'])
    .where('storageKey', 'in', keys)
    .orderBy('uploadNo')
    .forUpdate()
    .execute()
  const byKey = new Map(rows.map((row) => [row.storageKey, row]))
  const toAttach: bigint[] = []
  for (const key of keys) {
    const row = byKey.get(key)
    if (row === undefined || row.deletedAt !== null || row.purpose !== input.purpose) {
      throw uploadNotFound()
    }
    if (row.refType === null) {
      if (row.uploadedByUserNo !== input.actorUserNo) throw uploadNotFound()
      toAttach.push(row.uploadNo)
    } else if (row.refType !== input.refType) {
      throw uploadNotFound()
    }
  }
  if (toAttach.length > 0) {
    await trx
      .updateTable('uploads')
      .set({ refType: input.refType, refId: input.refId, attachedAt: options.now ?? new Date() })
      .where('uploadNo', 'in', toAttach)
      .execute()
  }
  return { attached: toAttach.length, keys }
}

/**
 * 제자리 수정 문서용 — attachUploads 뒤, 같은 refType · refId 에 붙어 있는데 본문에서 빠진 키를 지움 표시한다(객체는 정리 잡이).
 * 🔴 약관(append-only)은 쓰지 않는다. 같은 그림을 두 문서에 적었다가 한쪽에서 빼면 다른 쪽 그림도 깨진다 — README(각각 올린다).
 */
export async function syncUploads(
  trx: Kysely<AdminDatabase>,
  input: AttachUploadsInput,
  options: AttachUploadsOptions = {},
): Promise<SyncUploadsResult> {
  const result = await attachUploads(trx, input, options)
  const inBody = new Set(result.keys)
  const current = await trx
    .selectFrom('uploads')
    .select(['uploadNo', 'storageKey'])
    .where('refType', '=', input.refType)
    .where('refId', '=', input.refId)
    .where('deletedAt', 'is', null)
    .orderBy('uploadNo')
    .forUpdate()
    .execute()
  const gone = current.filter((row) => !inBody.has(row.storageKey)).map((row) => row.uploadNo)
  if (gone.length > 0) {
    await trx
      .updateTable('uploads')
      .set({ deletedAt: options.now ?? new Date() })
      .where('uploadNo', 'in', gone)
      .execute()
  }
  return { ...result, detached: gone.length }
}
```

Run: `pnpm --filter @ssworks/admin-server test:db attach` → PASS

- [ ] **Step 6: 서비스 DB 테스트** — `uploads/uploads.service.db.test.ts`

```ts
import { CommonErrorCodes, adminUploadCreatedSchema, isUploadKey } from '@ssworks/admin-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { failure } from '../test-support/errors.js'
import { pngImage } from '../test-support/images.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { imageRequest, seedUpload, testUploadsConfig } from '../test-support/uploads.js'
import { EncodeGate } from './encode.js'
import { AdminUploadsService } from './uploads.service.js'

let t: TestDatabase
let me: SeededUser
let other: SeededUser
let storage: MemoryObjectStorage
let service: AdminUploadsService
let png: Buffer

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '업로드', permissions: [] })
  me = await seedUser(t.db, { roleNo: role, userId: 'upload-me' })
  other = await seedUser(t.db, { roleNo: role, userId: 'upload-other' })
  storage = new MemoryObjectStorage()
  service = new AdminUploadsService(t.db, testUploadsConfig(storage), new EncodeGate())
  png = await pngImage(8, 6)
})

afterAll(async () => {
  await t?.drop()
})

describe('create(스펙 U3)', () => {
  it('재인코딩 → PUT → INSERT — 응답 모양 · url 은 mediaPath + 키 · 객체와 행이 있다', async () => {
    const created = await service.create(me.userNo, 'legal', imageRequest(png))
    expect(adminUploadCreatedSchema.parse(created.body)).toEqual(created.body)
    expect(isUploadKey(created.body.key)).toBe(true)
    expect(created.body.url).toBe(`/media/${created.body.key}`)
    expect(created.body).toMatchObject({ width: 8, height: 6 })
    expect(storage.objects.get(created.body.key)?.contentType).toBe('image/webp')
    const row = await t.db
      .selectFrom('uploads')
      .selectAll()
      .where('uploadNo', '=', created.uploadNo)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      storageKey: created.body.key,
      purpose: 'legal',
      uploadedByUserNo: me.userNo,
      bytes: created.body.bytes,
      refType: null,
      deletedAt: null,
    })
  })

  it('415 · 413 은 본문 읽기에서 — 행 · 객체가 생기지 않는다', async () => {
    const before = storage.objects.size
    expect(
      (await failure(service.create(me.userNo, 'legal', imageRequest(png, 'text/plain')))).code,
    ).toBe(CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    const small = new AdminUploadsService(
      t.db,
      testUploadsConfig(storage, { policy: { maxBytes: 10 } }),
      new EncodeGate(),
    )
    expect((await failure(small.create(me.userNo, 'legal', imageRequest(png)))).code).toBe(
      CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
    )
    expect(storage.objects.size).toBe(before)
  })

  it('🔴 사람당 미첨부 상한 409 — 첨부된 것 · 지움 표시는 세지 않는다', async () => {
    const limited = new AdminUploadsService(
      t.db,
      testUploadsConfig(storage, { policy: { maxPendingPerUser: 1 } }),
      new EncodeGate(),
    )
    await seedUpload(t.db, { uploadedByUserNo: other.userNo, refType: 'legalDocument', refId: 1n })
    await seedUpload(t.db, { uploadedByUserNo: other.userNo, deletedAt: new Date() })
    await limited.create(other.userNo, 'legal', imageRequest(png))
    const error = await failure(limited.create(other.userNo, 'legal', imageRequest(png)))
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_LIMIT)
    expect(error.details).toEqual({ limit: 1 })
  })

  it('🔴 저장소 PUT 실패는 503 — 행이 생기지 않는다', async () => {
    storage.failNext('put')
    const count = async () =>
      Number(
        (
          await t.db
            .selectFrom('uploads')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .executeTakeFirstOrThrow()
        ).n,
      )
    const before = await count()
    expect((await failure(service.create(me.userNo, 'legal', imageRequest(png)))).code).toBe(
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    )
    expect(await count()).toBe(before)
  })
})

describe('remove(스펙 U4)', () => {
  it('본인 미첨부를 지움 표시 — 객체는 그대로(정리 잡이)', async () => {
    const created = await service.create(me.userNo, 'legal', imageRequest(png))
    expect(await service.remove(me.userNo, created.body.key)).toEqual({
      uploadNo: created.uploadNo,
    })
    const row = await t.db
      .selectFrom('uploads')
      .select('deletedAt')
      .where('uploadNo', '=', created.uploadNo)
      .executeTakeFirstOrThrow()
    expect(row.deletedAt).toBeInstanceOf(Date)
    expect(storage.objects.has(created.body.key)).toBe(true)
  })

  it('🔴 404 — 남의 것 · 첨부됨 · 이미 지움 · 없는 키 · 키 모양 아님', async () => {
    const mine = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const deleted = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    for (const [actor, key] of [
      [other.userNo, mine.key],
      [me.userNo, attached.key],
      [me.userNo, deleted.key],
      [me.userNo, 'legal/2026/11/' + 'Q'.repeat(32) + '.webp'],
      [me.userNo, 'not-a-key'],
    ] as const) {
      expect((await failure(service.remove(actor, key))).code, key).toBe(
        CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
      )
    }
  })
})

describe('isServable · open(중계가 쓴다)', () => {
  it('첨부됨 · 미삭제만 참, 객체 스트림 · 저장소 오류 503', async () => {
    const pending = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const gone = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
      deletedAt: new Date(),
    })
    expect(await service.isServable(pending.key)).toBe(false)
    expect(await service.isServable(attached.key)).toBe(true)
    expect(await service.isServable(gone.key)).toBe(false)
    await storage.put(attached.key, Buffer.from('webp'), 'image/webp')
    expect((await service.open(attached.key))?.contentLength).toBe(4)
    expect(await service.open(pending.key)).toBeNull()
    storage.failNext('get')
    expect((await failure(service.open(attached.key))).code).toBe(
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    )
  })
})
```

- [ ] **Step 7: 서비스 구현** — `uploads/uploads.service.ts`

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import { isUploadKey, uploadUrl, type AdminUploadCreated } from '@ssworks/admin-shared'
import type { Request } from 'express'
import type { Kysely } from 'kysely'
import { runQuery } from '../database/run.js'
import type { AdminDatabase } from '../database/types.js'
import type { StoredObject } from '../storage/object-storage.js'
import { ADMIN_UPLOADS_CONFIG, KYSELY } from '../tokens.js'
import {
  attachUploads,
  syncUploads,
  type AttachUploadsInput,
  type AttachUploadsResult,
  type SyncUploadsResult,
} from './attach.js'
import { EncodeGate, encodeUpload } from './encode.js'
import { uploadLimit, uploadNotFound, uploadUnavailable } from './errors.js'
import { newUploadKey } from './keys.js'
import type { ResolvedUploadsConfig } from './options.js'
import { readImageBody } from './read-body.js'
import { markExpiredUploads, purgeDeletedUploads, type SweepResult } from './sweep.js'

// 정본: ssworks-ringside apps/api/src/uploads/uploads.service.ts(create — 미첨부 셈 · 재인코딩 문 · PUT · INSERT · 실패 정리)
// 바꾼 점(스펙 U3 · U4 · U12): 회원 → 관리자, 정책 · 저장소가 코어 옵션(ResolvedUploadsConfig), release 대신 remove(키 하나) +
//   정리 잡(sweep.ts), 중계가 쓰는 isServable · open, 앱 라우트 · 약관이 쓰는 attach · sync(정책 · mediaPath 를 채운다).
// 🔴 create 에는 트랜잭션이 없다 — 재인코딩 · 저장소 호출이 잠금을 쥔 채 돌지 않게. INSERT 가 실패하면 PUT 한 객체를 best-effort 로 지운다.
// 🔴 저장소 예외는 여기서 503 으로 바뀐다(logger.warn) — 바깥으로 나가지 않는다.

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface CreatedUpload {
  uploadNo: bigint
  body: AdminUploadCreated
}

@Injectable()
export class AdminUploadsService {
  private readonly logger = new Logger(AdminUploadsService.name)

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    @Inject(ADMIN_UPLOADS_CONFIG) private readonly config: ResolvedUploadsConfig,
    private readonly gate: EncodeGate,
  ) {}

  /** 해석된 설정 — 컨트롤러 · 약관 서비스가 mediaPath · 정책을 본다 */
  get settings(): ResolvedUploadsConfig {
    return this.config
  }

  /** `POST /uploads` — 스트림 읽기(415 · 413) → 미첨부 상한(409) → 재인코딩 → PUT → INSERT(실패면 객체 삭제) */
  async create(actorUserNo: bigint, purpose: string, req: Request): Promise<CreatedUpload> {
    const policy = this.config.policy
    const input = await readImageBody(req, policy.maxBytes)
    const pending = await runQuery(() => this.pendingCount(actorUserNo))
    if (pending >= policy.maxPendingPerUser) throw uploadLimit(policy.maxPendingPerUser)
    const encoded = await this.gate.run(() => encodeUpload(input, policy))
    const key = newUploadKey(purpose, new Date())
    await this.storageCall('put', () => this.config.storage.put(key, encoded.data, 'image/webp'))
    let uploadNo: bigint
    try {
      const inserted = await runQuery(() =>
        this.db
          .insertInto('uploads')
          .values({
            storageKey: key,
            purpose,
            uploadedByUserNo: actorUserNo,
            bytes: encoded.data.length,
            width: encoded.width,
            height: encoded.height,
            refType: null,
            refId: null,
            attachedAt: null,
            deletedAt: null,
          })
          .executeTakeFirstOrThrow(),
      )
      if (inserted.insertId === undefined)
        throw new Error('uploads INSERT 가 insertId 를 돌려주지 않았다.')
      uploadNo = inserted.insertId
    } catch (error) {
      await this.config.storage
        .delete(key)
        .catch((reason: unknown) =>
          this.logger.warn(`업로드 행 실패 뒤 객체 정리 실패(${key}) — ${messageOf(reason)}`),
        )
      throw error
    }
    return {
      uploadNo,
      body: {
        key,
        url: uploadUrl(key, this.config.mediaPath),
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.data.length,
      },
    }
  }

  /** `DELETE /uploads/<키>` — 본인 · 미첨부 · 미삭제만 지움 표시(객체는 정리 잡이). 그 밖은 404 */
  async remove(actorUserNo: bigint, key: string): Promise<{ uploadNo: bigint }> {
    if (!isUploadKey(key)) throw uploadNotFound()
    const row = await runQuery(() =>
      this.db
        .selectFrom('uploads')
        .select('uploadNo')
        .where('storageKey', '=', key)
        .where('uploadedByUserNo', '=', actorUserNo)
        .where('refType', 'is', null)
        .where('deletedAt', 'is', null)
        .executeTakeFirst(),
    )
    if (row === undefined) throw uploadNotFound()
    const result = await runQuery(() =>
      this.db
        .updateTable('uploads')
        .set({ deletedAt: new Date() })
        .where('uploadNo', '=', row.uploadNo)
        .where('refType', 'is', null)
        .where('deletedAt', 'is', null)
        .executeTakeFirst(),
    )
    if (Number(result.numUpdatedRows) === 0) throw uploadNotFound()
    return { uploadNo: row.uploadNo }
  }

  /** 앱 쓰기 라우트 · 약관 발행이 트랜잭션 안에서 부른다 — 정책 · mediaPath 를 채운 attachUploads */
  attach(trx: Kysely<AdminDatabase>, input: AttachUploadsInput): Promise<AttachUploadsResult> {
    return attachUploads(trx, input, this.attachOptions())
  }

  /** 제자리 수정 문서용 — 붙이고 빠진 키는 지움 표시 */
  sync(trx: Kysely<AdminDatabase>, input: AttachUploadsInput): Promise<SyncUploadsResult> {
    return syncUploads(trx, input, this.attachOptions())
  }

  /** 중계 — 첨부됨 · 미삭제 행이 있는가. 🔴 미첨부 · 지움 표시는 어떤 경로로도 보이지 않는다 */
  async isServable(key: string): Promise<boolean> {
    const row = await runQuery(() =>
      this.db
        .selectFrom('uploads')
        .select('uploadNo')
        .where('storageKey', '=', key)
        .where('refType', 'is not', null)
        .where('deletedAt', 'is', null)
        .executeTakeFirst(),
    )
    return row !== undefined
  }

  /** 중계 — 객체 스트림(없으면 null). 저장소 오류는 503 */
  open(key: string): Promise<StoredObject | null> {
    return this.storageCall('get', () => this.config.storage.get(key))
  }

  /** 정리 잡(스펙 U11) — 미첨부 보관 초과 지움 표시 → 지움 표시 행의 객체 · 행 삭제(묶음). 멱등 */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const marked = await runQuery(() =>
      markExpiredUploads(this.db, this.config.policy.pendingTtlHours, now),
    )
    const purged = await purgeDeletedUploads(this.db, this.config.storage, (key, reason) =>
      this.logger.warn(`업로드 객체 삭제 실패(${key}) — ${messageOf(reason)}`),
    )
    const result = { marked, ...purged }
    if (marked > 0 || purged.deleted > 0 || purged.failed > 0) {
      this.logger.log(
        `업로드 정리 — 지움 표시 ${marked} · 삭제 ${purged.deleted} · 실패 ${purged.failed}`,
      )
    }
    return result
  }

  private attachOptions() {
    return { mediaPath: this.config.mediaPath, maxPerBody: this.config.policy.maxPerBody }
  }

  /** 미첨부 · 미삭제 수 — idx_uploads_uploader 범위 */
  private async pendingCount(userNo: bigint): Promise<number> {
    const row = await this.db
      .selectFrom('uploads')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('uploadedByUserNo', '=', userNo)
      .where('refType', 'is', null)
      .where('deletedAt', 'is', null)
      .executeTakeFirstOrThrow()
    return Number(row.n)
  }

  private async storageCall<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      this.logger.warn(`저장소 ${operation} 실패 — ${messageOf(error)}`)
      throw uploadUnavailable()
    }
  }
}
```

`sweep.ts` 는 Task 15 에서 만든다 — 이 Task 의 typecheck 를 위해 **지금** 최소 구현을 둔다(Task 15 가 테스트와 함께 완성한다):

```ts
// uploads/sweep.ts — Task 15 에서 테스트와 함께 채운다. 여기서는 서비스가 import 할 모양만.
import type { Kysely } from 'kysely'
import type { AdminDatabase } from '../database/types.js'
import type { AdminObjectStorage } from '../storage/object-storage.js'

export const SWEEP_BATCH = 100

export interface SweepResult {
  marked: number
  deleted: number
  failed: number
}

const HOUR_MS = 3_600_000

/** 미첨부 · 미삭제 · 보관 초과를 지움 표시 — 돌아온 값은 바뀐 행 수 */
export async function markExpiredUploads(
  db: Kysely<AdminDatabase>,
  ttlHours: number,
  now: Date,
): Promise<number> {
  const before = new Date(now.getTime() - ttlHours * HOUR_MS)
  const result = await db
    .updateTable('uploads')
    .set({ deletedAt: now })
    .where('refType', 'is', null)
    .where('deletedAt', 'is', null)
    .where('createdAt', '<', before)
    .executeTakeFirst()
  return Number(result.numUpdatedRows)
}

/** 지움 표시 행을 uploadNo 순 limit 개 — 객체 delete(멱등) → 성공한 행만 DELETE. 저장소 오류 행은 세고 남긴다 */
export async function purgeDeletedUploads(
  db: Kysely<AdminDatabase>,
  storage: AdminObjectStorage,
  onFailure: (key: string, reason: unknown) => void,
  limit: number = SWEEP_BATCH,
): Promise<{ deleted: number; failed: number }> {
  const rows = await db
    .selectFrom('uploads')
    .select(['uploadNo', 'storageKey'])
    .where('deletedAt', 'is not', null)
    .orderBy('uploadNo')
    .limit(limit)
    .execute()
  const done: bigint[] = []
  let failed = 0
  for (const row of rows) {
    try {
      await storage.delete(row.storageKey)
      done.push(row.uploadNo)
    } catch (error) {
      failed += 1
      onFailure(row.storageKey, error)
    }
  }
  if (done.length === 0) return { deleted: 0, failed }
  const result = await db
    .deleteFrom('uploads')
    .where('uploadNo', 'in', done)
    .where('deletedAt', 'is not', null)
    .executeTakeFirst()
  return { deleted: Number(result.numDeletedRows), failed }
}
```

- [ ] **Step 8: GREEN**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server test uploads && pnpm --filter @ssworks/admin-server test:db uploads`
Expected: PASS(`attach.db` · `uploads.service.db`)

- [ ] **Step 9: 커밋**

```bash
git add packages/admin-server/src/uploads packages/admin-server/src/test-support/uploads.ts
git commit -m "feat(admin-server): 업로드 서비스(create · remove · attach · sync · isServable · open) · 첨부 도우미 · 키(PR 2h Task 12)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: 컨트롤러 · `AdminUploadsModule` · 코어 배선 · 모듈 테스트 · HTTP 테스트

**Files:**

- Create: `packages/admin-server/src/uploads/uploads.controller.ts`
- Create: `packages/admin-server/src/uploads/uploads.module.ts`
- Create: `packages/admin-server/src/uploads/uploads.module.test.ts`
- Create: `packages/admin-server/src/uploads/uploads.http.db.test.ts`
- Modify: `packages/admin-server/src/options.ts`(`uploads?`) · `admin-server.module.ts`(`ADMIN_ROUTE_MODULES`)
- Modify: `packages/admin-server/src/test-support/admin-app.ts`(`AdminUploadsModule` · `uploads` 옵션)

- [ ] **Step 1: 모듈 테스트** — `uploads/uploads.module.test.ts`

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuditModule } from '../audit/audit.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import { AdminLegalModule } from '../legal/legal.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { AdminUploadsModule } from './uploads.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const PERMISSIONS = {
  'legal.read': 'setting.legal:read',
  'legal.publish': 'setting.legal:publish',
  'auditLogs.read': 'setting.auditLog:read',
}
const storage = new MemoryObjectStorage()
const apps: { close(): Promise<void> }[] = []

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
})

async function boot(imports: ModuleMetadata['imports'], options: Partial<AdminServerOptions> = {}) {
  const app = await createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db: unreachable,
        auth: { jwtSecret: TEST_JWT_SECRET },
        permissions: PERMISSIONS,
        legal: { kinds: ['TERMS'] },
        uploads: { storage, sweep: false },
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminUploadsModule 배선(스펙 U7 · §4-2)', () => {
  it('뜨면 두 라우트가 /admin/uploads 아래에 있고 쿠키 없이는 401(가드가 본문 · DB 에 닿기 전에 끝난다)', async () => {
    const server = (await boot([AdminAuthModule, AdminUploadsModule])).getHttpServer()
    expect(
      (
        await request(server)
          .post('/admin/uploads?purpose=legal')
          .set('Content-Type', 'image/png')
          .send(Buffer.from('x'))
      ).status,
    ).toBe(401)
    expect(
      (await request(server).delete('/admin/uploads/legal/2026/11/' + 'A'.repeat(32) + '.webp'))
        .status,
    ).toBe(401)
    expect((await request(server).get('/admin/uploads')).status).toBe(404)
  })

  it('🔴 AdminAuthModule 없이는 뜨지 않는다', async () => {
    await expect(boot([AdminUploadsModule])).rejects.toThrow(
      'AdminUploadsModule 은 AdminAuthModule 이 있어야 한다',
    )
  })

  it('🔴 uploads 옵션이 없으면 기동에서 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], { uploads: undefined }),
    ).rejects.toThrow('AdminUploadsModule 은 uploads 옵션이 있어야 한다')
  })

  it('약관 모듈이 있으면 legal 용도가 자동 — 앱이 같은 이름을 적으면 멈춘다', async () => {
    await expect(
      boot([AdminAuthModule, AdminLegalModule, AdminUploadsModule]),
    ).resolves.toBeDefined()
    await expect(
      boot([AdminAuthModule, AdminLegalModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, purposes: { legal: { slot: 'legal.publish' } } },
      }),
    ).rejects.toThrow('legal 용도는 AdminLegalModule 이 자동으로 등록한다')
  })

  it('약관 모듈이 없으면 앱이 legal 용도를 적어도 된다(다른 권한으로)', async () => {
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, purposes: { legal: { permissions: ['x:y'] } } },
      }),
    ).resolves.toBeDefined()
  })

  it('🔴 mediaPath · 슬롯 오류는 기동에서', async () => {
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, mediaPath: '/api/files' },
      }),
    ).rejects.toThrow("uploads.mediaPath 는 '/media' 로 끝나는 경로여야 한다")
    await expect(
      boot([AdminAuthModule, AdminUploadsModule], {
        uploads: { storage, sweep: false, purposes: { notice: { slot: 'teams.manage' } } },
      }),
    ).rejects.toThrow('슬롯 teams.manage 가 permissions 에 이어지지 않았다')
  })

  it('감사 모듈과 함께 뜬다 — upload.create · upload.delete 가 코어 카탈로그에 있다', async () => {
    await expect(
      boot([AdminAuthModule, AdminAuditModule, AdminUploadsModule]),
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test uploads.module`
Expected: FAIL — `Cannot find module './uploads.module.js'`

- [ ] **Step 3: 컨트롤러** — `uploads/uploads.controller.ts`

```ts
import { Controller, Delete, Param, Post, Query, Req } from '@nestjs/common'
import {
  CoreAuditActions,
  CoreAuditTargets,
  isUploadKey,
  uploadPurposeOf,
  uploadPurposeQuerySchema,
  type AdminUploadCreated,
  type UploadPurposeQuery,
} from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta, attachAuditTarget } from '../audit/audit-bag.js'
import { CurrentAdmin } from '../auth/decorators.js'
import type { AdminPrincipal } from '../auth/principal.js'
import { RequireUploadPurpose } from '../auth/upload-purpose.js'
import { ZodValidationPipe } from '../http/pipes.js'
import { uploadNotFound } from './errors.js'
import { AdminUploadsService } from './uploads.service.js'

// 정본: ssworks-ringside apps/api/src/uploads/uploads.controller.ts(POST — 원시 본문 · purpose 쿼리)
// 바꾼 점(스펙 §4-2): 본문은 미들웨어가 아니라 서비스가 스트림으로 읽는다(read-body.ts). release 대신 DELETE 키 하나. 권한은
//   @RequireUploadPurpose(용도 → 권한). 감사 둘(upload.create · upload.delete) — meta 에 바이트 · 본문은 싣지 않는다.
// 🔴 DELETE 경로는 키의 네 조각이다 — Express 5(path-to-regexp v8)는 `:key(*)` 정규식 파라미터를 지원하지 않는다. 가드는
//    `params.purpose` 로 용도를 읽는다.
// 🔴 가드가 먼저다 — 모르는 · 형식 밖 용도는 400 이 아니라 403 이다(스펙 U6). 쿼리 파이프의 400 은 가드를 지난 뒤 잘못된 모양(배열 등)에만.

@Controller('uploads')
export class AdminUploadsController {
  constructor(private readonly uploads: AdminUploadsService) {}

  /** 201 `{ key, url, width, height, bytes }` — 본문은 원시 이미지 바이트(image/jpeg · png · webp · gif) */
  @RequireUploadPurpose()
  @Audit({ action: CoreAuditActions.UPLOAD_CREATE, targetType: CoreAuditTargets.UPLOAD })
  @Post()
  async create(
    @Query(new ZodValidationPipe(uploadPurposeQuerySchema)) query: UploadPurposeQuery,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ): Promise<AdminUploadCreated> {
    const created = await this.uploads.create(admin.userNo, query.purpose, req)
    attachAuditTarget(req, created.uploadNo)
    attachAuditMeta(req, {
      key: created.body.key,
      purpose: query.purpose,
      bytes: created.body.bytes,
      width: created.body.width,
      height: created.body.height,
    })
    return created.body
  }

  /** 본인 · 미첨부만 지움 표시 → `data: null`. 그 밖은 404(사유를 가르지 않는다) */
  @RequireUploadPurpose()
  @Audit({ action: CoreAuditActions.UPLOAD_DELETE, targetType: CoreAuditTargets.UPLOAD })
  @Delete(':purpose/:yyyy/:mm/:file')
  async remove(
    @Param('purpose') purpose: string,
    @Param('yyyy') yyyy: string,
    @Param('mm') mm: string,
    @Param('file') file: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ): Promise<null> {
    const key = `${purpose}/${yyyy}/${mm}/${file}`
    if (!isUploadKey(key)) throw uploadNotFound()
    const removed = await this.uploads.remove(admin.userNo, key)
    attachAuditTarget(req, removed.uploadNo)
    attachAuditMeta(req, { key, purpose: uploadPurposeOf(key) })
    return null
  }
}
```

- [ ] **Step 4: 모듈** — `uploads/uploads.module.ts`

```ts
import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { assertAuthModuleRegistered, isModuleRegistered } from '../auth/module-check.js'
import { AdminLegalModule } from '../legal/legal.module.js'
import type { AdminServerOptions } from '../options.js'
import { ADMIN_SERVER_OPTIONS, ADMIN_UPLOADS_CONFIG } from '../tokens.js'
import { EncodeGate } from './encode.js'
import { resolveUploadsConfig, type ResolvedUploadsConfig } from './options.js'
import { AdminUploadsController } from './uploads.controller.js'
import { AdminUploadsService } from './uploads.service.js'

// 정본: ssworks-ringside apps/api/src/uploads/uploads.module.ts
// 바꾼 점: 패키지 기능 모듈 — 쓰는 쪽 app.module.ts 가 import 하고 코어 모듈이 /admin 접두사를 붙인다. 전역이다(2h 스펙 U6 · U10) —
//   권한 가드가 ADMIN_UPLOADS_CONFIG 를, 약관 서비스 · 앱 라우트가 AdminUploadsService 를 @Optional()/주입으로 받는다. 정리 잡은
//   모듈이 setInterval 로 돌린다(옵션 sweep — false 면 앱 워커 몫).
// 🔴 이 파일은 admin-server.module.ts 를 import 하지 않는다 — 코어 모듈이 이 모듈을 ADMIN_ROUTE_MODULES 로 import 한다.
// 🔴 legal 용도 자동 등록은 AdminLegalModule 의 등록 여부(ModulesContainer)로 정한다 — provider 팩토리 시점에 모든 모듈이 스캔돼 있다.
// 🔴 장 0013_uploads 가 있어야 돈다 — 스텁 검사가 먼저 막는다(모든 장 필수).

@Global()
@Module({
  controllers: [AdminUploadsController],
  providers: [
    {
      provide: ADMIN_UPLOADS_CONFIG,
      useFactory: (options: AdminServerOptions, modules: ModulesContainer): ResolvedUploadsConfig =>
        resolveUploadsConfig(
          options,
          isModuleRegistered(modules, AdminLegalModule),
          'AdminUploadsModule',
        ),
      inject: [ADMIN_SERVER_OPTIONS, ModulesContainer],
    },
    { provide: EncodeGate, useValue: new EncodeGate() },
    AdminUploadsService,
  ],
  exports: [ADMIN_UPLOADS_CONFIG, AdminUploadsService],
})
export class AdminUploadsModule
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AdminUploadsModule.name)
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly modules: ModulesContainer,
    @Inject(ADMIN_UPLOADS_CONFIG) private readonly config: ResolvedUploadsConfig,
    private readonly uploads: AdminUploadsService,
  ) {}

  onModuleInit(): void {
    assertAuthModuleRegistered(this.modules, 'AdminUploadsModule')
  }

  /** 정리 잡(스펙 U11) — 주기마다 sweep. unref 라 프로세스를 붙들지 않는다. 겹쳐 돌아도 멱등 */
  onApplicationBootstrap(): void {
    if (this.config.sweepIntervalMs === null) return
    this.timer = setInterval(() => {
      void this.uploads.sweep().catch((error: unknown) => {
        this.logger.warn(
          `업로드 정리 실패 — ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    }, this.config.sweepIntervalMs)
    this.timer.unref()
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
```

- [ ] **Step 5: 코어 배선**

`options.ts`: `import type { AdminUploadsOptions } from './uploads/options.js'` 와 `messages?` 앞에:

```ts
  /**
   * 편집기 이미지 업로드(2h 스펙 §4-2) — 저장소 · 공개 경로 · 용도 → 권한 · 정책 · 정리. 🔴 `AdminUploadsModule` 을 쓰면 필수 — 없거나
   * 저장소 모양이 아니거나 `mediaPath` 가 '/media' 로 끝나지 않거나 용도 · 정책이 형식 밖이면 기동에서 멈춘다. `legal` 용도는
   * `AdminLegalModule` 이 있으면 자동(`legal.publish` 슬롯) — 적으면 멈춘다.
   */
  uploads?: AdminUploadsOptions
```

`admin-server.module.ts`: `import { AdminUploadsModule } from './uploads/uploads.module.js'`, `ADMIN_ROUTE_MODULES` 끝에 `AdminUploadsModule,`.

`test-support/admin-app.ts`: import `AdminUploadsModule` · `MemoryObjectStorage` · `type AdminUploadsOptions`. `AdminAppOptions` 에

```ts
  /** 업로드(2h). 기본 메모리 저장소 · mediaPath '/media'(테스트 서버는 전역 접두사가 없다) · 정리 끔 · 앱 용도 notice(board.posts:write) */
  uploads?: Partial<AdminUploadsOptions>
```

`forRoot` 옵션에

```ts
          uploads: {
            storage: new MemoryObjectStorage(),
            mediaPath: '/media',
            sweep: false,
            purposes: { notice: { permissions: ['board.posts:write'] } },
            ...options.uploads,
          },
```

imports 의 `AdminIpAccessModule,` 뒤에 `AdminUploadsModule,`.

- [ ] **Step 6: GREEN(단위) · 기존 DB HTTP 테스트가 그대로인지**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server test uploads.module legal.module`
Expected: PASS

Run: `pnpm --filter @ssworks/admin-server test:db legal.http`
Expected: PASS(업로드 모듈이 함께 떠도 약관 HTTP 계약은 그대로 — 그림 없는 본문)

- [ ] **Step 7: HTTP DB 테스트** — `uploads/uploads.http.db.test.ts`

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  CoreAuditActions,
  adminUploadCreatedSchema,
  errorRespSchema,
  isUploadKey,
  parseJSON,
} from '@ssworks/admin-shared'
import request, { type Response } from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { animatedGif, pngImage, SVG } from '../test-support/images.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { seedUpload } from '../test-support/uploads.js'
import { UPLOAD_MESSAGES } from './errors.js'

// 업로드 HTTP 계약(스펙 §4-2 · §9-1) — 실 MariaDB · 메모리 저장소 · 실 sharp. 테스트 앱의 용도: legal(legal.publish) · notice(board.posts:write).

const UPLOADS = '/admin/uploads'
let t: TestDatabase
let app: NestExpressApplication
let small: NestExpressApplication
let storage: MemoryObjectStorage
let publisher: SeededUser
let reader: SeededUser
let editor: SeededUser
let png: Buffer

beforeAll(async () => {
  t = await createTestDatabase()
  const publisherRole = await seedRole(t.db, {
    roleName: '약관',
    permissions: ['setting.legal:read', 'setting.legal:publish'],
  })
  const readerRole = await seedRole(t.db, { roleName: '조회', permissions: ['setting.legal:read'] })
  const editorRole = await seedRole(t.db, { roleName: '게시', permissions: ['board.posts:write'] })
  publisher = await seedUser(t.db, { roleNo: publisherRole, userId: 'up-publisher' })
  reader = await seedUser(t.db, { roleNo: readerRole, userId: 'up-reader' })
  editor = await seedUser(t.db, { roleNo: editorRole, userId: 'up-editor' })
  storage = new MemoryObjectStorage()
  const connection = { ...testDbServer(), database: t.name, connectionLimit: 4 }
  app = await bootAdminApp(connection, { uploads: { storage } })
  small = await bootAdminApp(connection, {
    uploads: { storage, policy: { maxBytes: 200, maxPendingPerUser: 1 } },
  })
  png = await pngImage(8, 8)
})

afterAll(async () => {
  await app?.close()
  await small?.close()
  await t?.drop()
})

type Agent = ReturnType<typeof request.agent>

async function signIn(user: SeededUser, target: NestExpressApplication = app): Promise<Agent> {
  const agent = request.agent(target.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

const upload = (agent: Agent, body: Buffer, purpose = 'legal', type = 'image/png') =>
  agent.post(`${UPLOADS}?purpose=${purpose}`).set('Content-Type', type).send(body)

const data = (response: Response): unknown => parseJSON<{ data: unknown }>(response.text).data

function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status)
  const body = errorRespSchema.parse(response.body)
  expect(body.code).toBe(code)
  if (message !== undefined) expect(body.message).toBe(message)
  return body
}

async function auditRows(action: string) {
  return t.db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', action)
    .orderBy('logNo', 'desc')
    .execute()
}

describe('POST /admin/uploads', () => {
  it('201 — 봉투 안 { key, url, width, height, bytes } · url 은 /media/<키> · 객체 · 행 · 감사 한 줄(meta 에 바이트 없음)', async () => {
    const agent = await signIn(publisher)
    const response = await upload(agent, png).expect(201)
    const created = adminUploadCreatedSchema.parse(data(response))
    expect(isUploadKey(created.key)).toBe(true)
    expect(created.key.startsWith('legal/')).toBe(true)
    expect(created.url).toBe(`/media/${created.key}`)
    expect(storage.objects.has(created.key)).toBe(true)
    const row = await t.db
      .selectFrom('uploads')
      .selectAll()
      .where('storageKey', '=', created.key)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      purpose: 'legal',
      uploadedByUserNo: publisher.userNo,
      refType: null,
    })
    const [audit] = await auditRows(CoreAuditActions.UPLOAD_CREATE)
    expect(audit).toMatchObject({
      targetType: 'upload',
      targetRefNo: row.uploadNo,
      statusCode: 201,
    })
    expect(audit?.meta).toEqual({
      key: created.key,
      purpose: 'legal',
      bytes: created.bytes,
      width: 8,
      height: 8,
    })
  })

  it('GIF 움짤도 된다', async () => {
    const agent = await signIn(publisher)
    const created = adminUploadCreatedSchema.parse(
      data(await upload(agent, await animatedGif(), 'legal', 'image/gif').expect(201)),
    )
    expect(created.width).toBe(4)
  })

  it('🔴 403 — 용도 권한 없음(legal.read 만) · 모르는 용도 · 형식 밖 용도 · 용도 없음', async () => {
    const agent = await signIn(reader)
    expectError(await upload(agent, png), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    const full = await signIn(publisher)
    expectError(await upload(full, png, 'nope'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expectError(await upload(full, png, 'bad%20kind'), 403, CommonErrorCodes.ERR_COMMON_FORBIDDEN)
    expectError(
      await full.post(UPLOADS).set('Content-Type', 'image/png').send(png),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('앱 용도 notice — board.posts:write 를 가진 사람만', async () => {
    expect((await upload(await signIn(editor), png, 'notice')).status).toBe(201)
    expectError(
      await upload(await signIn(publisher), png, 'notice'),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })

  it('415 — Content-Type 밖 · 매직 바이트 밖(SVG 를 image/png 로) · Content-Encoding', async () => {
    const agent = await signIn(publisher)
    expectError(
      await upload(agent, png, 'legal', 'text/plain'),
      415,
      CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE,
      UPLOAD_MESSAGES.unsupportedType,
    )
    expectError(await upload(agent, SVG), 415, CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE)
    expectError(
      await upload(agent, png).set('Content-Encoding', 'gzip'),
      415,
      CommonErrorCodes.ERR_UPLOAD_UNSUPPORTED_TYPE,
    )
  })

  it('413 · 409 — 작은 정책 앱: 장당 200바이트 · 사람당 미첨부 1', async () => {
    const agent = await signIn(publisher, small)
    const big = await pngImage(400, 400)
    const tooLarge = expectError(
      await upload(agent, big),
      413,
      CommonErrorCodes.ERR_UPLOAD_TOO_LARGE,
      UPLOAD_MESSAGES.tooLarge,
    )
    expect(tooLarge.details).toEqual({ maxBytes: 200 })
    await upload(agent, png).expect(201)
    const limit = expectError(
      await upload(agent, png),
      409,
      CommonErrorCodes.ERR_UPLOAD_LIMIT,
      UPLOAD_MESSAGES.limit,
    )
    expect(limit.details).toEqual({ limit: 1 })
  })

  it('🔴 저장소 꺼짐 503 — 행이 남지 않고 감사는 실패로 남는다', async () => {
    const agent = await signIn(publisher)
    storage.failNext('put')
    expectError(
      await upload(agent, png),
      503,
      CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
      UPLOAD_MESSAGES.unavailable,
    )
    const [audit] = await auditRows(CoreAuditActions.UPLOAD_CREATE)
    expect(audit).toMatchObject({
      statusCode: 503,
      errorCode: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE,
    })
  })
})

describe('DELETE /admin/uploads/:purpose/:yyyy/:mm/:file', () => {
  it('본인 미첨부 → 200 data: null · 지움 표시 · 감사 한 줄', async () => {
    const agent = await signIn(publisher)
    const created = adminUploadCreatedSchema.parse(data(await upload(agent, png).expect(201)))
    const response = await agent.delete(`${UPLOADS}/${created.key}`).expect(200)
    expect(parseJSON<{ success: boolean; data: unknown }>(response.text)).toEqual({
      success: true,
      data: null,
    })
    const row = await t.db
      .selectFrom('uploads')
      .select('deletedAt')
      .where('storageKey', '=', created.key)
      .executeTakeFirstOrThrow()
    expect(row.deletedAt).toBeInstanceOf(Date)
    const [audit] = await auditRows(CoreAuditActions.UPLOAD_DELETE)
    expect(audit?.meta).toEqual({ key: created.key, purpose: 'legal' })
  })

  it('🔴 404 — 남의 것 · 첨부됨 · 두 번 지움 · 없는 키 · 키 모양 아님(같은 문구 — 사유를 가르지 않는다)', async () => {
    const mine = await seedUpload(t.db, { uploadedByUserNo: publisher.userNo })
    const theirs = await seedUpload(t.db, { uploadedByUserNo: reader.userNo })
    const attached = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    const me = await signIn(publisher)
    expectError(
      await me.delete(`${UPLOADS}/${theirs.key}`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
      UPLOAD_MESSAGES.notFound,
    )
    expectError(
      await me.delete(`${UPLOADS}/${attached.key}`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
    await me.delete(`${UPLOADS}/${mine.key}`).expect(200)
    expectError(
      await me.delete(`${UPLOADS}/${mine.key}`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
    expectError(
      await me.delete(`${UPLOADS}/legal/2026/11/${'Q'.repeat(32)}.webp`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
    expectError(
      await me.delete(`${UPLOADS}/legal/2026/11/short.webp`),
      404,
      CommonErrorCodes.ERR_UPLOAD_NOT_FOUND,
    )
  })

  it('🔴 용도 권한이 없으면 404 가 아니라 403(가드가 먼저)', async () => {
    const mine = await seedUpload(t.db, { uploadedByUserNo: reader.userNo })
    expectError(
      await (await signIn(reader)).delete(`${UPLOADS}/${mine.key}`),
      403,
      CommonErrorCodes.ERR_COMMON_FORBIDDEN,
    )
  })
})
```

(`theirs` 는 `legal/` 키라 `publisher` 가 가드를 지난 뒤 서비스에서 404 다 — 가드 403 과 섞이지 않는다.)

- [ ] **Step 8: GREEN**

Run: `pnpm --filter @ssworks/admin-server test:db uploads.http`
Expected: PASS

- [ ] **Step 9: 커밋**

```bash
git add packages/admin-server/src/uploads packages/admin-server/src/options.ts packages/admin-server/src/admin-server.module.ts packages/admin-server/src/test-support/admin-app.ts
git commit -m "feat(admin-server): AdminUploadsModule — POST/DELETE /admin/uploads · 코어 배선 · HTTP 계약(PR 2h Task 13)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: 중계 `AdminMediaModule`(`GET /media/:purpose/:yyyy/:mm/:file`)

**Files:**

- Create: `packages/admin-server/src/media/media-http.ts` · `media-http.test.ts`
- Create: `packages/admin-server/src/media/media.controller.ts`
- Create: `packages/admin-server/src/media/media.module.ts` · `media.module.test.ts`
- Create: `packages/admin-server/src/media/media.http.db.test.ts`
- Modify: `packages/admin-server/src/test-support/admin-app.ts`(`AdminMediaModule`)

- [ ] **Step 1: 단위 테스트** — `media/media-http.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  MEDIA_CONTROLLER_PATH,
  MEDIA_MAX_AGE_SECONDS,
  etagMatches,
  mediaEtag,
} from './media-http.js'

describe('media-http(스펙 U5)', () => {
  it('컨트롤러 경로 media · 캐시 600초', () => {
    expect(MEDIA_CONTROLLER_PATH).toBe('media')
    expect(MEDIA_MAX_AGE_SECONDS).toBe(600)
  })

  it('ETag 는 키의 sha256 앞 16자(따옴표) — 같은 키는 같은 값, 다른 키는 다른 값', () => {
    const a = mediaEtag('legal/2026/11/' + 'A'.repeat(32) + '.webp')
    expect(a).toMatch(/^"[0-9a-f]{16}"$/)
    expect(mediaEtag('legal/2026/11/' + 'A'.repeat(32) + '.webp')).toBe(a)
    expect(mediaEtag('legal/2026/11/' + 'B'.repeat(32) + '.webp')).not.toBe(a)
  })

  it('If-None-Match — 목록 · 약한 표기 · * · 없음', () => {
    const etag = '"abc"'
    expect(etagMatches('"abc"', etag)).toBe(true)
    expect(etagMatches('"x", "abc"', etag)).toBe(true)
    expect(etagMatches('W/"abc"', etag)).toBe(true)
    expect(etagMatches('*', etag)).toBe(true)
    expect(etagMatches('"abd"', etag)).toBe(false)
    expect(etagMatches(undefined, etag)).toBe(false)
  })
})
```

- [ ] **Step 2: 모듈 테스트(DB 없음)** — `media/media.module.test.ts`

```ts
import type { ModuleMetadata } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminServerModule } from '../admin-server.module.js'
import { AdminAuthModule } from '../auth/admin-auth.module.js'
import type { AdminServerOptions } from '../options.js'
import { TEST_JWT_SECRET } from '../test-support/auth.js'
import { createHttpApp } from '../test-support/http.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { AdminUploadsModule } from '../uploads/uploads.module.js'
import { AdminMediaModule } from './media.module.js'

const unreachable = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'd' }
const apps: { close(): Promise<void> }[] = []

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
})

async function boot(imports: ModuleMetadata['imports'], options: Partial<AdminServerOptions> = {}) {
  const app = await createHttpApp({
    imports: [
      AdminServerModule.forRoot({
        db: unreachable,
        auth: { jwtSecret: TEST_JWT_SECRET },
        uploads: { storage: new MemoryObjectStorage(), sweep: false },
        ...options,
      }),
      ...(imports ?? []),
    ],
  })
  apps.push(app)
  return app
}

describe('AdminMediaModule 배선(스펙 U5)', () => {
  it('🔴 접두사 밖 · 공개 — /media/… 는 쿠키 없이 닿고, 키 모양이 아니면 DB 를 읽지 않고 404 + no-store', async () => {
    const server = (
      await boot([AdminAuthModule, AdminUploadsModule, AdminMediaModule])
    ).getHttpServer()
    const response = await request(server).get('/media/legal/2026/11/short.webp')
    expect(response.status).toBe(404)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.body).toMatchObject({ success: false, code: 'ERR_UPLOAD_NOT_FOUND' })
    expect((await request(server).get('/admin/media/legal/2026/11/short.webp')).status).toBe(404)
  })

  it('🔴 AdminUploadsModule 없이는 뜨지 않는다', async () => {
    await expect(boot([AdminAuthModule, AdminMediaModule], { uploads: undefined })).rejects.toThrow(
      'AdminMediaModule 은 AdminUploadsModule 이 있어야 한다',
    )
  })
})
```

- [ ] **Step 3: RED 확인**

Run: `pnpm --filter @ssworks/admin-server test media`
Expected: FAIL — `Cannot find module './media-http.js'` · `./media.module.js`

- [ ] **Step 4: 구현** — `media/media-http.ts`

```ts
import { createHash } from 'node:crypto'

// 정본: ssworks-ringside apps/api/src/uploads/media-http.ts(ETag · If-None-Match · 캐시 수명)
// 바꾼 점: 경로가 `media/:purpose/:yyyy/:mm/:file`(Express 5 — 와일드카드 대신 네 파라미터, 스펙 U5). ETag 는 앞 16자.
// 🔴 컨트롤러 경로는 'media' 로 고정이다(데코레이터는 정적) — 공개 경로 옵션 mediaPath 는 '/media' 로 끝나야 한다(uploads/options.ts).

export const MEDIA_CONTROLLER_PATH = 'media'

/** 캐시 수명(초) — 지움 표시가 공유 캐시에서 이 안에 사라진다 */
export const MEDIA_MAX_AGE_SECONDS = 600

/** ETag — 키의 sha256 앞 16자(따옴표). 키의 내용은 바뀌지 않는다(새 그림은 새 키) */
export function mediaEtag(key: string): string {
  return `"${createHash('sha256').update(key).digest('hex').slice(0, 16)}"`
}

/** If-None-Match 가 이 ETag 를 가리키는가 — 목록 · 약한 표기(W/) · `*` */
export function etagMatches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false
  return header.split(',').some((raw) => {
    const tag = raw.trim().replace(/^W\//, '')
    return tag === '*' || tag === etag
  })
}
```

`media/media.controller.ts`:

```ts
import { Controller, Get, Logger, Param, Req, Res, StreamableFile } from '@nestjs/common'
import { isUploadKey } from '@ssworks/admin-shared'
import type { Request, Response } from 'express'
import { Public } from '../auth/decorators.js'
import { RawResponse } from '../http/envelope.interceptor.js'
import { uploadNotFound } from '../uploads/errors.js'
import { AdminUploadsService } from '../uploads/uploads.service.js'
import {
  MEDIA_CONTROLLER_PATH,
  MEDIA_MAX_AGE_SECONDS,
  etagMatches,
  mediaEtag,
} from './media-http.js'

// 정본: ssworks-ringside apps/api/src/uploads/media.controller.ts(판정 → 304 → 스트림 · 실패 no-store · nosniff)
// 바꾼 점(스펙 2-1 ⑤ · U5): 신원 · 쿠키 · 분석글 판정이 없다 — 첨부된 행만 200, 미첨부 · 지움 표시는 404. 캐시는 늘 public.
//   Cross-Origin-Resource-Policy 는 same-site(ringside same-origin) — api.example.com 의 그림을 www.example.com 이 쓸 수 있게,
//   다른 사이트의 핫링크는 막는다(스펙 정정 — Task 17 §13).
// 🔴 @Public — 전역 가드를 지나친다. 🔴 @RawResponse — 봉투를 씌우지 않는다(StreamableFile). 실패는 예외 필터가 봉투 JSON 으로.
// 🔴 ADMIN_ROUTE_MODULES 밖이라 접두사가 붙지 않는다 — 앱 전역 접두사(api)만 앞에 온다 → /api/media/...

@Public()
@RawResponse()
@Controller(MEDIA_CONTROLLER_PATH)
export class AdminMediaController {
  private readonly logger = new Logger(AdminMediaController.name)

  constructor(private readonly uploads: AdminUploadsService) {}

  @Get(':purpose/:yyyy/:mm/:file')
  async get(
    @Param('purpose') purpose: string,
    @Param('yyyy') yyyy: string,
    @Param('mm') mm: string,
    @Param('file') file: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      return await this.serve(`${purpose}/${yyyy}/${mm}/${file}`, req, res)
    } catch (error) {
      // 실패는 캐시하지 않는다 — 첨부되거나 저장소가 돌아오면 바로 보이게
      res.setHeader('Cache-Control', 'no-store')
      throw error
    }
  }

  private async serve(
    key: string,
    req: Request,
    res: Response,
  ): Promise<StreamableFile | undefined> {
    if (!isUploadKey(key)) throw uploadNotFound()
    if (!(await this.uploads.isServable(key))) throw uploadNotFound()
    const etag = mediaEtag(key)
    const cacheControl = `public, max-age=${MEDIA_MAX_AGE_SECONDS}`
    if (etagMatches(req.headers['if-none-match'], etag)) {
      this.setCacheHeaders(res, cacheControl, etag)
      res.status(304)
      return undefined
    }
    const object = await this.uploads.open(key)
    if (object === null) {
      this.logger.warn(`업로드 행은 있는데 객체가 없다(${key})`)
      throw uploadNotFound()
    }
    this.setCacheHeaders(res, cacheControl, etag)
    return new StreamableFile(object.body, {
      type: 'image/webp',
      length: object.contentLength,
      disposition: 'inline',
    }).setErrorHandler((error) => {
      this.logger.warn(`미디어 스트림 오류(${key}) — ${error.message}`)
      if (!res.headersSent) res.status(503)
      res.end()
    })
  }

  private setCacheHeaders(res: Response, cacheControl: string, etag: string): void {
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('ETag', etag)
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  }
}
```

`media/media.module.ts`:

```ts
import { Module, type OnModuleInit } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { isModuleRegistered } from '../auth/module-check.js'
import { AdminUploadsModule } from '../uploads/uploads.module.js'
import { AdminMediaController } from './media.controller.js'

// 정본: 없음 — 2h 스펙 U5. 중계만 있는 모듈. AdminUploadsService 는 전역 업로드 모듈이 준다.
// 🔴 ADMIN_ROUTE_MODULES 에 넣지 않는다 — /admin 접두사 밖이어야 공개 웹이 /api/media/... 로 쓴다. 공개 API 가 따로면 이 모듈만
//    (코어 모듈 + AdminUploadsModule 과 함께) 올린다 — 같은 DB · 같은 저장소.
// 🔴 인증 모듈을 요구하지 않는다(@Public 라우트뿐) — 업로드 모듈만 있으면 된다.

@Module({ controllers: [AdminMediaController] })
export class AdminMediaModule implements OnModuleInit {
  constructor(private readonly modules: ModulesContainer) {}

  onModuleInit(): void {
    if (!isModuleRegistered(this.modules, AdminUploadsModule)) {
      throw new Error(
        'AdminMediaModule 은 AdminUploadsModule 이 있어야 한다 — 업로드 행 · 저장소를 그 모듈이 준다. AppModule 에 AdminUploadsModule 을 import 한다.',
      )
    }
  }
}
```

`test-support/admin-app.ts`: `import { AdminMediaModule } from '../media/media.module.js'`, imports 의 `AdminUploadsModule,` 뒤에 `AdminMediaModule,`.

- [ ] **Step 5: GREEN(단위)**

Run: `pnpm --filter @ssworks/admin-server test media && pnpm --filter @ssworks/admin-server typecheck`
Expected: PASS. 404 응답의 `cache-control` 이 `no-store` 가 아니면 예외 필터가 머리글을 지우는 것이다 — 그때는 필터 쪽을 고치지 말고 컨트롤러에서 `res.setHeader` 대신 `res.set` 을 쓰거나, 필터 코드를 읽어 `response.status().send` 전에 머리글이 보존되는지 확인해 보고서에 적는다.

- [ ] **Step 6: HTTP DB 테스트** — `media/media.http.db.test.ts`

```ts
import type { NestExpressApplication } from '@nestjs/platform-express'
import {
  CommonErrorCodes,
  adminUploadCreatedSchema,
  parseJSON,
  stringifyJSON,
} from '@ssworks/admin-shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAdminApp } from '../test-support/admin-app.js'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { testDbServer } from '../test-support/db-url.js'
import { pngImage } from '../test-support/images.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { seedUpload } from '../test-support/uploads.js'
import { mediaEtag } from './media-http.js'

// 중계 HTTP 계약(스펙 U5 · §9-1) — 업로드 → 미첨부 404 → 약관 발행으로 첨부 → 200 · 304 → 지움 → 404 · 저장소 503.

let t: TestDatabase
let app: NestExpressApplication
let storage: MemoryObjectStorage
let publisher: SeededUser

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, {
    roleName: '약관',
    permissions: ['setting.legal:read', 'setting.legal:publish'],
  })
  publisher = await seedUser(t.db, { roleNo: role, userId: 'media-publisher' })
  storage = new MemoryObjectStorage()
  app = await bootAdminApp(
    { ...testDbServer(), database: t.name, connectionLimit: 4 },
    { uploads: { storage } },
  )
})

afterAll(async () => {
  await app?.close()
  await t?.drop()
})

async function signIn(user: SeededUser) {
  const agent = request.agent(app.getHttpServer())
  await agent
    .post('/admin/auth/login')
    .send({ userId: user.userId, password: user.password })
    .expect(200)
  return agent
}

const anonymous = () => request(app.getHttpServer())

describe('GET /media/:purpose/:yyyy/:mm/:file', () => {
  it('🔴 미첨부는 404(no-store) → 약관 발행이 첨부하면 200 image/webp + 캐시 · ETag · nosniff · CORP same-site → 304', async () => {
    const agent = await signIn(publisher)
    const png = await pngImage(8, 8)
    const created = adminUploadCreatedSchema.parse(
      parseJSON<{ data: unknown }>(
        (
          await agent
            .post('/admin/uploads?purpose=legal')
            .set('Content-Type', 'image/png')
            .send(png)
            .expect(201)
        ).text,
      ).data,
    )
    const pending = await anonymous().get(created.url)
    expect(pending.status).toBe(404)
    expect(pending.headers['cache-control']).toBe('no-store')

    await agent
      .post('/admin/legal-documents')
      .set('Content-Type', 'application/json')
      .send(
        stringifyJSON({ kind: 'TERMS', body: `약관\n\n![](${created.url})`, baseLegalDocNo: null }),
      )
      .expect(201)

    const ok = await anonymous()
      .get(created.url)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(ok.status).toBe(200)
    expect(ok.headers['content-type']).toBe('image/webp')
    expect(ok.headers['cache-control']).toBe('public, max-age=600')
    expect(ok.headers.etag).toBe(mediaEtag(created.key))
    expect(ok.headers['x-content-type-options']).toBe('nosniff')
    expect(ok.headers['cross-origin-resource-policy']).toBe('same-site')
    expect(ok.headers['content-disposition']).toBe('inline')
    expect(Number(ok.headers['content-length'])).toBe(created.bytes)
    expect((ok.body as Buffer).equals(storage.objects.get(created.key)!.body)).toBe(true)

    const cached = await anonymous().get(created.url).set('If-None-Match', mediaEtag(created.key))
    expect(cached.status).toBe(304)
    expect(cached.headers.etag).toBe(mediaEtag(created.key))
  })

  it('🔴 지움 표시된 첨부 · 객체 없는 행은 404, 저장소 오류는 503(no-store)', async () => {
    const deleted = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      refType: 'legalDocument',
      refId: 1n,
      deletedAt: new Date(),
    })
    expect((await anonymous().get(`/media/${deleted.key}`)).status).toBe(404)

    const orphanRow = await seedUpload(t.db, {
      uploadedByUserNo: publisher.userNo,
      refType: 'legalDocument',
      refId: 1n,
    })
    expect((await anonymous().get(`/media/${orphanRow.key}`)).status).toBe(404)

    await storage.put(orphanRow.key, Buffer.from('webp'), 'image/webp')
    storage.failNext('get')
    const down = await anonymous().get(`/media/${orphanRow.key}`)
    expect(down.status).toBe(503)
    expect(down.headers['cache-control']).toBe('no-store')
    expect(down.body).toMatchObject({ code: CommonErrorCodes.ERR_UPLOAD_UNAVAILABLE })
  })
})
```

- [ ] **Step 7: GREEN**

Run: `pnpm --filter @ssworks/admin-server test:db media.http`
Expected: PASS(약관 발행의 첨부는 Task 16 에서 붙인다 — **이 테스트는 Task 16 뒤에 초록이다**. 지금은 첫 테스트의 200 단언에서 RED 로 멈추는 것이 맞다. 보고서에 그렇게 적고 Task 16 Step 6 에서 다시 돌린다.)

- [ ] **Step 8: 커밋**

```bash
git add packages/admin-server/src/media packages/admin-server/src/test-support/admin-app.ts
git commit -m "feat(admin-server): AdminMediaModule — GET /media 공개 중계(첨부된 것만 · ETag · no-store)(PR 2h Task 14)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: 정리 잡 `uploads/sweep.ts` 테스트 · 스케줄 확인

**Files:**

- Create: `packages/admin-server/src/uploads/sweep.db.test.ts`
- Modify: `packages/admin-server/src/uploads/sweep.ts`(Task 12 의 최소 구현에 머리 주석 — 동작은 그대로)

- [ ] **Step 1: 테스트** — `uploads/sweep.db.test.ts`

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { seedRole, seedUser, type SeededUser } from '../test-support/auth.js'
import { createTestDatabase, type TestDatabase } from '../test-support/db.js'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { seedUpload, testUploadsConfig } from '../test-support/uploads.js'
import { EncodeGate } from './encode.js'
import { markExpiredUploads, purgeDeletedUploads } from './sweep.js'
import { AdminUploadsService } from './uploads.service.js'

const HOUR = 3_600_000
let t: TestDatabase
let me: SeededUser
let storage: MemoryObjectStorage

beforeAll(async () => {
  t = await createTestDatabase()
  const role = await seedRole(t.db, { roleName: '정리', permissions: [] })
  me = await seedUser(t.db, { roleNo: role, userId: 'sweep-me' })
})

beforeEach(async () => {
  await t.db.deleteFrom('uploads').execute()
  storage = new MemoryObjectStorage()
})

afterAll(async () => {
  await t?.drop()
})

const keysOf = async () =>
  (await t.db.selectFrom('uploads').select('storageKey').orderBy('uploadNo').execute()).map(
    (r) => r.storageKey,
  )

describe('markExpiredUploads(스펙 U11 ①)', () => {
  it('미첨부 · 미삭제 · 보관 초과만 지움 표시 — 갓 올린 것 · 첨부된 것 · 이미 지운 것은 그대로', async () => {
    const now = new Date()
    const old = await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      createdAt: new Date(now.getTime() - 25 * HOUR),
    })
    await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      createdAt: new Date(now.getTime() - 23 * HOUR),
    })
    await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      refType: 'legalDocument',
      refId: 1n,
      createdAt: new Date(now.getTime() - 48 * HOUR),
    })
    await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      deletedAt: new Date(now.getTime() - 1000),
      createdAt: new Date(now.getTime() - 48 * HOUR),
    })
    expect(await markExpiredUploads(t.db, 24, now)).toBe(1)
    const rows = await t.db.selectFrom('uploads').select(['storageKey', 'deletedAt']).execute()
    expect(
      rows
        .filter((r) => r.deletedAt !== null)
        .map((r) => r.storageKey)
        .sort(),
    ).toEqual(
      [
        old.key,
        rows.find((r) => r.storageKey !== old.key && r.deletedAt !== null)!.storageKey,
      ].sort(),
    )
    expect(await markExpiredUploads(t.db, 24, now)).toBe(0)
  })
})

describe('purgeDeletedUploads(스펙 U11 ②)', () => {
  it('지움 표시 행 — 객체 삭제 뒤 행 삭제, 객체 없는 행도 삭제, 저장소 오류 행은 세고 남긴다(다음 회차)', async () => {
    const a = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    const b = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    const c = await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    const live = await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    await storage.put(a.key, Buffer.from('a'), 'image/webp')
    await storage.put(c.key, Buffer.from('c'), 'image/webp')
    await storage.put(live.key, Buffer.from('l'), 'image/webp')
    storage.failNext('delete') // 첫 delete(a) 가 던진다
    const failures: string[] = []
    const first = await purgeDeletedUploads(t.db, storage, (key) => failures.push(key))
    expect(first).toEqual({ deleted: 2, failed: 1 })
    expect(failures).toEqual([a.key])
    expect(await keysOf()).toEqual([a.key, live.key])
    expect(storage.objects.has(a.key)).toBe(true)
    expect(storage.objects.has(c.key)).toBe(false)
    expect(storage.objects.has(live.key)).toBe(true)

    const second = await purgeDeletedUploads(t.db, storage, () => {})
    expect(second).toEqual({ deleted: 1, failed: 0 })
    expect(await keysOf()).toEqual([live.key])
    expect(storage.objects.has(a.key)).toBe(false)
    void b
  })

  it('limit 묶음 — uploadNo 순으로 limit 개만', async () => {
    for (let i = 0; i < 3; i += 1)
      await seedUpload(t.db, { uploadedByUserNo: me.userNo, deletedAt: new Date() })
    expect(await purgeDeletedUploads(t.db, storage, () => {}, 2)).toEqual({ deleted: 2, failed: 0 })
    expect((await keysOf()).length).toBe(1)
  })
})

describe('AdminUploadsService.sweep', () => {
  it('둘을 이어 돌리고 건수를 돌려준다 — 두 번 돌려도 같은 끝 상태(멱등)', async () => {
    const service = new AdminUploadsService(t.db, testUploadsConfig(storage), new EncodeGate())
    const now = new Date()
    await seedUpload(t.db, {
      uploadedByUserNo: me.userNo,
      createdAt: new Date(now.getTime() - 30 * HOUR),
    })
    await seedUpload(t.db, { uploadedByUserNo: me.userNo })
    expect(await service.sweep(now)).toEqual({ marked: 1, deleted: 1, failed: 0 })
    expect(await service.sweep(now)).toEqual({ marked: 0, deleted: 0, failed: 0 })
    expect((await keysOf()).length).toBe(1)
  })
})
```

- [ ] **Step 2: 실행 — Task 12 의 최소 구현으로 바로 초록인지 본다**

Run: `pnpm --filter @ssworks/admin-server test:db sweep`
Expected: PASS. 🔴 `markExpiredUploads` 첫 테스트는 "보관 초과 미첨부 하나 + 이미 지운 것 하나" 가 지움 표시 상태라 두 키를 비교한다 — 실측이 어긋나면 **단언을 실측으로** 고치되 `old` 가 표시되고 갓 올린 것 · 첨부된 것은 표시되지 않았음을 꼭 단언한다. 빨간 것이 있으면 `sweep.ts` 를 고친다(구현은 Task 12 코드가 정본).

- [ ] **Step 3: 머리 주석** — `uploads/sweep.ts` 첫 줄 주석을 바꾼다

```ts
// 정본: ssworks-ringside packages/db/src/uploads/cleanup.ts(markExpiredUploads · purgeDeletedUploads)
// 바꾼 점(스펙 U11): 지운 글 30일 유예 · 고아 객체 대조가 없다(비범위 §11). 묶음 100. 저장소 호출은 트랜잭션 밖(문장 하나씩).
//   READ COMMITTED 트랜잭션을 두지 않는다 — 문장 하나가 autocommit 이라 갭 잠금이 문장 안에서만 산다.
// 🔴 객체를 먼저 지우고 행을 지운다 — 행을 먼저 지우면 실패한 객체가 영영 남는다(고아 대조가 없다).
// 🔴 멱등 — 여러 인스턴스가 같은 주기로 돌아도 된다(이미 없는 객체의 delete 는 성공, 이미 지운 행은 0건).
```

- [ ] **Step 4: 스케줄 확인(단위)** — `uploads/uploads.module.test.ts` 에 사례 하나를 더한다

```ts
it('정리 주기 — sweep: false 면 타이머가 없고, 켜면 onApplicationBootstrap 에서 걸리고 close 에서 풀린다', async () => {
  const off = await boot([AdminAuthModule, AdminUploadsModule])
  expect((off.get(AdminUploadsModule) as unknown as { timer: unknown }).timer).toBeNull()
  const on = await boot([AdminAuthModule, AdminUploadsModule], {
    uploads: { storage, sweep: { intervalMinutes: 60 } },
  })
  const module = on.get(AdminUploadsModule) as unknown as { timer: unknown }
  expect(module.timer).not.toBeNull()
  await on.close()
  apps.splice(apps.indexOf(on), 1)
  expect(module.timer).toBeNull()
})
```

Run: `pnpm --filter @ssworks/admin-server test uploads.module` → PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/admin-server/src/uploads/sweep.ts packages/admin-server/src/uploads/sweep.db.test.ts packages/admin-server/src/uploads/uploads.module.test.ts
git commit -m "test(admin-server): 업로드 정리 잡 — 지움 표시 · 객체/행 삭제 · 묶음 · 멱등 · 스케줄(PR 2h Task 15)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: 약관 발행이 첨부한다(`legal.service.ts` · `legal.controller.ts`)

**Files:**

- Modify: `packages/admin-server/src/legal/legal.service.ts` · `legal.controller.ts`
- Modify: `packages/admin-server/src/legal/legal.service.db.test.ts`(첨부 describe) · `legal.http.db.test.ts`(감사 meta 에 `attachedUploads`)

- [ ] **Step 1: 서비스 DB 테스트** — `legal/legal.service.db.test.ts` 끝에 describe 를 더한다(import 에 `uploadUrl`(admin-shared) · `MemoryObjectStorage` · `imageRequest, testUploadsConfig, seedUpload` · `EncodeGate` · `AdminUploadsService` · `pngImage`)

```ts
describe('첨부(2h 스펙 U10) — 업로드 모듈이 있을 때', () => {
  const storage = new MemoryObjectStorage()
  let uploads: AdminUploadsService
  let withUploads: AdminLegalService

  beforeAll(() => {
    uploads = new AdminUploadsService(t.db, testUploadsConfig(storage), new EncodeGate())
    withUploads = new AdminLegalService(t.db, uploads)
  })

  it('본문의 우리 그림을 새 판에 붙인다 — refType legalDocument · refId 새 판 번호 · attachedUploads', async () => {
    const created = await uploads.create(actor.userNo, 'legal', imageRequest(await pngImage()))
    const kind = 'svc_attach'
    const result = await withUploads.publish(
      { kind, body: `본문\n\n![](${created.body.url})`, baseLegalDocNo: null },
      actor.userNo,
    )
    expect(result.attachedUploads).toBe(1)
    const row = await t.db
      .selectFrom('uploads')
      .select(['refType', 'refId'])
      .where('uploadNo', '=', created.uploadNo)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ refType: 'legalDocument', refId: result.legalDocNo })

    // 새 판이 앞 판 그림을 그대로 쓴다 — 통과 · refId 그대로 · 이번 첨부 0
    const second = await withUploads.publish(
      { kind, body: `고친 본문\n\n![](${created.body.url})`, baseLegalDocNo: result.legalDocNo },
      actor.userNo,
    )
    expect(second.attachedUploads).toBe(0)
    expect(
      (
        await t.db
          .selectFrom('uploads')
          .select('refId')
          .where('uploadNo', '=', created.uploadNo)
          .executeTakeFirstOrThrow()
      ).refId,
    ).toBe(result.legalDocNo)
  })

  it('🔴 남의 미첨부 키가 본문에 있으면 404 — 판도 들어가지 않는다(롤백)', async () => {
    const other = await seedUser(t.db, { roleNo: role, userId: 'legal-other' })
    const theirs = await seedUpload(t.db, { uploadedByUserNo: other.userNo })
    const kind = 'svc_attach_fail'
    const error = await failure(
      withUploads.publish(
        { kind, body: `![](${uploadUrl(theirs.key, '/media')})`, baseLegalDocNo: null },
        actor.userNo,
      ),
    )
    expect(error.code).toBe(CommonErrorCodes.ERR_UPLOAD_NOT_FOUND)
    expect(await withUploads.current(kind)).toEqual({ item: null })
  })

  it('그림 없는 본문 · 업로드 모듈 없는 서비스는 attachedUploads 0', async () => {
    expect(
      (
        await withUploads.publish(
          { kind: 'svc_attach_none', body: '글자뿐', baseLegalDocNo: null },
          actor.userNo,
        )
      ).attachedUploads,
    ).toBe(0)
    expect(
      (
        await service.publish(
          { kind: 'svc_attach_off', body: '글자뿐', baseLegalDocNo: null },
          actor.userNo,
        )
      ).attachedUploads,
    ).toBe(0)
  })
})
```

(`failure` 는 `../test-support/errors.js`. `role` 은 이 파일 `beforeAll` 의 `role` 변수다.)

- [ ] **Step 2: HTTP 테스트의 감사 meta** — `legal/legal.http.db.test.ts` 에서 발행 감사 행의 `row.meta` 를 `toEqual({...})` 로 정확히 비교하는 세 곳(약 173 · 261 · 419행 — `kind · baseLegalDocNo · contentHash · length`)에 `attachedUploads: 0,` 을 더한다. 400행의 제목 `{ kind, baseLegalDocNo, contentHash, length }` → `{ kind, baseLegalDocNo, contentHash, length, attachedUploads }`.

- [ ] **Step 3: RED 확인**

Run: `pnpm --filter @ssworks/admin-server typecheck`
Expected: FAIL — `AdminLegalService` 생성자가 인자 하나 · `attachedUploads` 없음

- [ ] **Step 4: 서비스** — `legal/legal.service.ts`

import 에 `Optional`(`@nestjs/common`) · `CoreAuditTargets`(admin-shared 값 import — 기존 `import type` 줄과 따로) · `import { AdminUploadsService } from '../uploads/uploads.service.js'`(클래스 — 일반 import). 머리 주석 "바꾼 점" 끝에:

```
//  - 2h: 업로드 모듈이 있으면 INSERT 뒤 같은 트랜잭션에서 본문 속 우리 그림을 새 판에 붙인다(attach — 스펙 U10). 잠금 순서 가드 행 →
//    legalDocuments → uploads. 모듈이 없으면(@Optional null) 건너뛴다 — 우리 경로가 본문에 있어도 평범한 링크다.
```

생성자 · 반환 타입 · publish:

```ts
/** 발행 결과 + 이번에 붙인 그림 수 — 컨트롤러가 감사 meta 에 싣고 응답에서는 뺀다 */
export type LegalPublishOutcome = AdminLegalPublishResult & { attachedUploads: number }

@Injectable()
export class AdminLegalService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<AdminDatabase>,
    // 🔴 @Optional — 업로드 모듈을 쓰지 않는 앱에서도 약관은 뜬다. Nest 는 미해결 provider 를 undefined 로 준다
    @Optional() private readonly uploads?: AdminUploadsService,
  ) {}
```

`publish(...)` 의 반환 타입을 `Promise<LegalPublishOutcome>` 으로, `legalDocNo` 를 얻은 뒤 `return { legalDocNo, contentHash }` 를:

```ts
// 🔴 INSERT 뒤 · 같은 트랜잭션 — uploads 는 잠금 순서의 마지막(2h 스펙 §5-6). 첨부가 던지면 판도 롤백된다
const attached = this.uploads
  ? await this.uploads.attach(trx, {
      markdown: body.body,
      purpose: 'legal',
      refType: CoreAuditTargets.LEGAL_DOCUMENT,
      refId: legalDocNo,
      actorUserNo,
    })
  : { attached: 0 }
return { legalDocNo, contentHash, attachedUploads: attached.attached }
```

- [ ] **Step 5: 컨트롤러** — `legal/legal.controller.ts` `publish`:

```ts
const { attachedUploads, ...result } = await this.legal.publish(body, admin.userNo)
attachAuditTarget(req, result.legalDocNo)
attachAuditMeta(req, {
  kind: body.kind,
  baseLegalDocNo: body.baseLegalDocNo,
  contentHash: result.contentHash,
  length: body.body.length,
  attachedUploads,
})
return result
```

머리 주석 "🔴 감사 meta 에 본문을 싣지 않는다 … 종류 · 기준 판 · 해시 · 길이만" → "… 길이 · 붙인 그림 수만".

- [ ] **Step 6: GREEN**

Run: `pnpm --filter @ssworks/admin-server typecheck && pnpm --filter @ssworks/admin-server test legal && pnpm --filter @ssworks/admin-server test:db legal`
Expected: PASS(`legal.module.test` 의 "업로드 모듈 없이" 배선 포함 · `legal-append-only` 그대로 — attach 는 `uploads` 표의 UPDATE 지 `legalDocuments` 가 아니다. 그 정적 검사가 `updateTable` 글자를 파일 단위로 보면 `legal.service.ts` 에는 그 글자가 없다)

Run: `pnpm --filter @ssworks/admin-server test:db media.http`
Expected: PASS(Task 14 에서 남겨 둔 RED 가 초록)

- [ ] **Step 7: 커밋**

```bash
git add packages/admin-server/src/legal
git commit -m "feat(admin-server): 약관 발행이 본문 그림을 새 판에 첨부(@Optional AdminUploadsService · 감사 attachedUploads)(PR 2h Task 16)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: 공개 API · README · changeset · 문서 · 스펙 정정

**Files:**

- Modify: `packages/admin-server/src/index.ts`
- Modify: `packages/admin-server/README.md`(「설치」 · 「진입점」 · 새 절 「이미지 업로드」 · 「약관」 한 줄)
- Create: `.changeset/admin-kit-image-uploads-server.md`
- Modify: `CLAUDE.md`(진행 표 · admin-server 절) · `docs/01-phase0.md` §8 · `docs/HANDOFF.md`
- Modify: `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §13

- [ ] **Step 1: index.ts** — 끝에

```ts
// 이미지 업로드(PR 2h)
export { AdminUploadsModule } from './uploads/uploads.module.js'
export { AdminMediaModule } from './media/media.module.js'
export { AdminUploadsService, type CreatedUpload } from './uploads/uploads.service.js'
export type {
  AdminUploadsOptions,
  AdminUploadPurposeOptions,
  ResolvedUploadsConfig,
} from './uploads/options.js'
export {
  attachUploads,
  syncUploads,
  type AttachUploadsInput,
  type AttachUploadsOptions,
  type AttachUploadsResult,
  type SyncUploadsResult,
} from './uploads/attach.js'
export {
  markExpiredUploads,
  purgeDeletedUploads,
  SWEEP_BATCH,
  type SweepResult,
} from './uploads/sweep.js'
export { RequireUploadPurpose } from './auth/upload-purpose.js'
export type { AdminObjectStorage, StoredObject } from './storage/object-storage.js'
export { createFileSystemStorage, type FileSystemStorageOptions } from './storage/file-system.js'
export { ADMIN_UPLOADS_CONFIG } from './tokens.js'
```

🔴 `./storage/s3.js` 는 여기 적지 않는다(Task 5 격리 검사).

Run: `pnpm --filter @ssworks/admin-server build && pnpm --filter @ssworks/admin-server check:dts && pnpm --filter @ssworks/admin-server test s3-isolation runner-graph` → PASS

- [ ] **Step 2: README** — `packages/admin-server/README.md`

「설치」 명령 뒤에 한 줄: `pnpm add sharp@^0.35   # 이미지 업로드(AdminUploadsModule) — 재인코딩. S3 호환 저장소를 쓰면 @aws-sdk/client-s3@^3 도`. 「진입점」 표에 행 `| \`@ssworks/admin-server/storage/s3\` | S3 호환 저장소 \`createS3ObjectStorage\`(선택 peer \`@aws-sdk/client-s3\` — 이 서브패스만 끌어온다) |`. 「약관」 절 끝 bullet 하나: `- **본문 그림**: \`AdminUploadsModule\` 이 있으면 발행이 본문 속 \`/api/media/…\` 그림을 새 판에 붙인다(감사 meta \`attachedUploads\`). 없으면 평범한 링크다. 아래 「이미지 업로드」.` 그리고 「IP 접근 제어」 절 앞에 새 절:

````markdown
## 이미지 업로드

편집기(`admin-ui` `MarkdownEditor` + `useImageAttachments`)가 **저장 단계**에 올리는 그림을 받아 WebP 로 다시 만들어 저장소에 두고, 본문 저장이 그 그림을 문서에 **첨부**한다. 첨부된 그림만 공개 경로로 보인다. 스펙 `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md`.

```ts
import {
  AdminMediaModule,
  AdminUploadsModule,
  createFileSystemStorage,
} from '@ssworks/admin-server'
// S3 호환이면: import { createS3ObjectStorage } from '@ssworks/admin-server/storage/s3'

imports: [
  AdminServerModule.forRootAsync({
    useFactory: () => ({
      // …
      uploads: {
        storage: createFileSystemStorage({ root: process.env.UPLOAD_ROOT ?? './uploads' }),
        // storage: createS3ObjectStorage({ bucket, endpoint, region, credentials, forcePathStyle: true }),
        mediaPath: '/api/media', // 본문에 적는 공개 경로 — 전역 접두사 + 'media'
        purposes: { notice: { permissions: ['board.notices:write'] } }, // 앱 용도 → 권한(legal 은 자동)
        policy: { maxPerBody: 10 }, // admin-shared DEFAULT_UPLOAD_POLICY 를 덮는다
        // sweep: false,                                 // 정리 잡을 앱 워커가 돌릴 때
      },
    }),
  }),
  AdminAuthModule,
  AdminLegalModule,
  AdminUploadsModule, // /admin/uploads
  AdminMediaModule, // /media/… — 접두사 밖(공개)
]
```

마이그레이션 스텁: `export { up, down } from '@ssworks/admin-server/migrations/0013_uploads'`. peer `sharp` 를 설치한다(네이티브 — 배포 이미지에서 설치).

| 라우트                                            | 선언                      | 본문 → 응답                                                                                                  | 감사                                                           |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `POST /admin/uploads?purpose=<용도>`              | `@RequireUploadPurpose()` | 원시 이미지 바이트(`Content-Type: image/jpeg · png · webp · gif`) → 201 `{ key, url, width, height, bytes }` | `upload.create`(meta `key · purpose · bytes · width · height`) |
| `DELETE /admin/uploads/<용도>/<yyyy>/<mm>/<파일>` | `@RequireUploadPurpose()` | → `data: null`. 본인 · 미첨부만 — 그 밖은 404                                                                | `upload.delete`(meta `key · purpose`)                          |
| `GET /api/media/<용도>/<yyyy>/<mm>/<파일>`        | `@Public()`               | 첨부된 그림만 `image/webp`(`Cache-Control: public, max-age=600` · `ETag` · 304). 미첨부 · 지움 · 없음은 404  | —                                                              |

- **용도(purpose)** 는 `^[A-Za-z0-9_]{1,32}$` 이고 키의 첫 조각이다. `legal` 은 `AdminLegalModule` 이 있으면 자동(`legal.publish` 슬롯) — `purposes` 에 적으면 기동에서 멈춘다. 앱 용도는 `{ slot }` 또는 `{ permissions: [...] }`(AND) 하나. 용도가 모르는 값 · 권한 없음이면 **403**(400 이 아니다 — 가드가 먼저).
- **본문 저장이 첨부한다** — 앱 쓰기 라우트는 자기 문서 행을 잠근 **뒤**, 같은 트랜잭션에서 `uploads.attach(trx, { markdown, purpose, refType, refId, actorUserNo })`(제자리 수정 문서는 `uploads.sync` — 본문에서 빠진 그림을 지움 표시). `AdminUploadsService` 는 전역이라 바로 주입된다. 본문 속 키가 없음 · 남의 미첨부 · 지움 표시 · 다른 용도 · 다른 종류에 첨부됨이면 404 `ERR_UPLOAD_NOT_FOUND` 로 **저장 전체가 실패**한다. 본문당 장수(`maxPerBody`) 초과는 409 `ERR_UPLOAD_LIMIT`. 🔴 `uploads` 는 잠금 순서의 마지막이다 — 앞에 비잠금 SELECT 를 두지 않는다.
- **refType** 은 감사 대상 이름을 그대로 쓴다(`CoreAuditTargets.LEGAL_DOCUMENT` 등 · 폭 64). 같은 그림을 두 문서에 적었다가 한쪽에서 빼면(`sync`) 다른 쪽 그림도 깨진다 — 문서마다 따로 올린다.
- **mediaPath 와 전역 접두사**: 중계 컨트롤러 경로는 `media` 로 고정이다. 앱이 `app.setGlobalPrefix('api')` 면 실제 경로는 `/api/media/...` 이고 `mediaPath` 기본값과 맞는다. 접두사가 다르면 `mediaPath` 를 `'<접두사>/media'` 로 — `/media` 로 끝나지 않으면 기동에서 멈춘다. 둘이 어긋나면 저장은 되고 그림만 깨진다.
- **공개 API 가 따로면** 그 앱에 코어 모듈 + `AdminUploadsModule` + `AdminMediaModule` 을 올린다(같은 DB · 같은 저장소). `Cross-Origin-Resource-Policy: same-site` 라 `api.example.com` 의 그림을 `www.example.com` 이 쓸 수 있다 — 전혀 다른 사이트에서는 못 쓴다.
- **정리 잡**: 미첨부가 `pendingTtlHours`(24) 를 넘기면 지움 표시 → 지움 표시 행의 객체 · 행을 100개씩 지운다. 기본 60분마다 모듈이 돌린다(멱등 — 인스턴스가 여럿이어도 된다). `sweep: false` 면 앱 워커가 `AdminUploadsService.sweep()` 을 부른다.
- **재인코딩**: 매직 바이트로 형식을 판별하고(SVG · HEIC · BMP 거름), 머리로 픽셀(4천만) · 프레임(100) 상한을 풀기 전에 보고, EXIF 방향대로 돌려 긴 변 2048 로 줄여 WebP(품질 82)로 저장한다. 메타데이터(EXIF · GPS)는 남지 않는다. 움짤은 움직이는 WebP. 프로세스당 동시 2 · 대기열 8 · 대기 5초 초과 503.
- **오류**: 415 `ERR_UPLOAD_UNSUPPORTED_TYPE` · 413 `ERR_UPLOAD_TOO_LARGE`(`details.maxBytes`) · 400 `ERR_UPLOAD_INVALID_IMAGE`(`details.reason`) · 409 `ERR_UPLOAD_LIMIT`(`details.limit`) · 404 `ERR_UPLOAD_NOT_FOUND` · 503 `ERR_UPLOAD_UNAVAILABLE`. 문구는 `messages: { uploads: {...} }` 로 덮는다.
- **저장소**: `createFileSystemStorage({ root })` 는 `<root>/<키>` 에 쓴다(임시 파일 → rename). `createS3ObjectStorage({ bucket, region?, endpoint?, credentials?, forcePathStyle?, prefix?, timeoutMs? })` 는 버킷을 비공개로 두고 중계가 읽는다. 직접 만들려면 `AdminObjectStorage`(`put · get · delete`) 를 구현한다 — 던지면 503 이 된다.
````

- [ ] **Step 3: changeset** — `.changeset/admin-kit-image-uploads-server.md`

```markdown
---
'@ssworks/admin-shared': minor
'@ssworks/admin-server': minor
---

편집기 이미지 업로드의 서버 쪽(PR 2h — `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md`).

- admin-shared: 업로드 계약 `uploads.ts`(`UPLOAD_KEY_PATTERN` · `DEFAULT_UPLOAD_POLICY` · `collectUploadKeys` · `adminUploadCreatedSchema` …), 코어 오류 코드 `ERR_UPLOAD_*` 여섯, 감사 액션 `upload.create` · `upload.delete` · 대상 `upload`.
- admin-server: `AdminUploadsModule`(`POST /admin/uploads?purpose=` 원시 이미지 → `sharp` 재인코딩 → 저장소 · `DELETE /admin/uploads/<키>` · 첨부 `attach` · `sync` · 정리 잡) · `AdminMediaModule`(`GET /media/…` 공개 중계 — 첨부된 것만) · 저장소 `AdminObjectStorage` + `createFileSystemStorage` + 서브패스 `@ssworks/admin-server/storage/s3` · 장 `0013_uploads` · `@RequireUploadPurpose()` · 약관 발행이 본문 그림을 첨부(감사 meta `attachedUploads`).

**쓰는 쪽이 할 일**

1. `pnpm add sharp@^0.35`(필수 peer — 네이티브). S3 호환 저장소면 `pnpm add @aws-sdk/client-s3@^3`.
2. `AdminServerModule` 옵션에 `uploads: { storage, mediaPath?, purposes?, policy?, sweep? }` — `AdminUploadsModule` 을 import 하면 필수(README 「이미지 업로드」).
3. 마이그레이션 스텁 `export { up, down } from '@ssworks/admin-server/migrations/0013_uploads'`.
4. `AppModule` 에 `AdminUploadsModule` · `AdminMediaModule`. 전역 접두사가 `api` 가 아니면 `mediaPath` 를 맞춘다(`'<접두사>/media'`).
5. 업로드 모듈 없이 약관만 쓰는 앱은 바뀌는 것이 없다(발행 감사 meta 에 `attachedUploads: 0` 이 더 실린다).
```

- [ ] **Step 4: 문서**

- `CLAUDE.md` 진행 표: "Phase 4 — 첫 신규 프로젝트" 행 앞에 `| Phase 2 후속 PR 2h — 이미지 업로드 서버(\`AdminUploadsModule\` · \`AdminMediaModule\` · 저장소 fs/S3 · sharp 재인코딩 · 장 0013 · \`@RequireUploadPurpose\` · 약관 첨부) | 완료 | 스펙 \`docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md\` · 플랜 \`docs/superpowers/plans/2026-11-01-admin-server-uploads.md\` |`. `@ssworks/admin-server` 코드 규약 절 끝에 bullet 둘:
  - `- 업로드 한 건은 트랜잭션이 없다 — 스트림 읽기(\`readImageBody\`) → 미첨부 셈 → \`EncodeGate.run(encodeUpload)\` → 저장소 \`put\` → INSERT(실패면 객체 best-effort 삭제). 저장소 예외는 서비스가 503 \`ERR_UPLOAD_UNAVAILABLE\` 로 바꾼다. 첨부(\`attachUploads\`)는 본문을 쓰는 트랜잭션 안 · 자기 문서 행 뒤 · \`uploads\` 가 잠금 순서의 마지막이다. 미디어 라우트는 첨부됨 · 미삭제 행만 내보내고 신원을 읽지 않는다. \`./storage/s3\` 서브패스만 \`@aws-sdk/client-s3\` 를 끌어온다(\`s3-isolation.test.ts\`).`
  - `- 업로드 권한은 \`@RequireUploadPurpose()\`(전역 가드의 넷째 선언) — 용도(\`query.purpose\` · \`params.purpose\`)를 옵션 \`uploads.purposes\` 로 푼다. \`legal\` 용도는 \`AdminLegalModule\` 이 있으면 자동.`
- 패키지 표의 admin-server 성격 칸 끝에 ` · 2h 이미지 업로드`.
- `docs/01-phase0.md` §8 끝에 한 줄: `이미지 업로드 서버 PR 2h(2026-11-0X) 완료 — admin-shared 업로드 계약 · 코어 오류 코드 여섯 · 감사 액션 둘, admin-server \`AdminUploadsModule\`(원시 본문 · sharp 재인코딩 · 저장소 fs/S3 · 첨부 · 정리) · \`AdminMediaModule\`(첨부된 것만 공개 중계) · 장 0013 · \`@RequireUploadPurpose\` · 약관 발행 첨부. PR #3k(admin-ui) 가 다음.`(X 는 완료일).
- `docs/HANDOFF.md` 「지금 상태」 표에 PR 2h 행, 「다음 플랜」 자리에 "PR #3k — admin-ui `useImageAttachments` · 편집기 그림 넣기 · 약관 배선(스펙 §2-4 · §4-3 — 플랜은 `writing-plans` 로 새로 쓴다. peer 하한을 이 PR 이 실리는 admin-shared 판으로)". 「작업 폴더 밖에 남은 것」에 템플릿 `preset/admin` 입력(업로드 옵션 · 스텁 0013 · sharp) 한 줄.

- [ ] **Step 5: 스펙 §13 정정** — `docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md` §13 을 이렇게 채운다

```markdown
## 13. 구현 중 정정 (PR 2h — 2026-11-0X)

- U4 · §4-2: `DELETE /admin/uploads/:key(*)` → `:purpose/:yyyy/:mm/:file`(Express 5 는 정규식 파라미터 없음). 스펙 자체 검토에서 이미 고쳤다.
- U5: `Cross-Origin-Resource-Policy` 는 `same-origin` 이 아니라 **`same-site`** — 공개 웹(www)과 API(api) 가 다른 서브도메인인 배치에서 그림이 막히지 않게. 다른 사이트 핫링크는 그대로 막힌다.
- U14: 중계 컨트롤러 경로는 `media` 고정(데코레이터는 정적) — `mediaPath` 는 `'/media'` 로 끝나야 하고 아니면 기동에서 멈춘다.
- §6 오류 표: `ERR_UPLOAD_TOO_LARGE` 문구에 "(장당 최대 10MB)" 를 박지 않는다 — 상한은 정책이라 `details.maxBytes` 로 싣고 화면이 붙인다.
- §9-2 경합: 같은 사람의 두 발행이 같은 미첨부 키를 쓰면 **둘 다 성공**한다(U8 ② — 둘째는 "이미 같은 refType 에 첨부됨"). 가드 행이 직렬화하므로 교착이 없다. "하나만 성공" 은 남의 키를 쓴 경우(404)다.
- U7: 권한 키가 `permissionCatalog` 안인지는 검사하지 않는다 — 카탈로그는 역할 · 사용자 모듈의 선택 옵션이고 슬롯 검사(이어졌는가)로 충분하다.
- 첨부 결과: `attachUploads` 는 `{ attached, keys }` 를 돌려준다(스펙 `{ attached }` + 키 목록 — `syncUploads` 가 쓴다).
```

- [ ] **Step 6: 포맷 · 커밋**

Run: `pnpm format && pnpm lint`
Expected: 포맷 뒤 lint 초록

```bash
git add packages/admin-server/src/index.ts packages/admin-server/README.md .changeset/admin-kit-image-uploads-server.md CLAUDE.md docs/01-phase0.md docs/HANDOFF.md docs/superpowers/specs/2026-11-01-admin-kit-image-uploads-design.md
git commit -m "docs(admin-server): 이미지 업로드 공개 API · README · changeset · 진행 문서 · 스펙 §13 정정(PR 2h Task 17)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: 전체 검증

- [ ] **Step 1: 전체 검사**

Run: `pnpm check`
Expected: lint → typecheck → test → build → check:dts 전부 초록(세 패키지)

- [ ] **Step 2: 실 MariaDB 둘**

Run: `pnpm db:test:up` 이 떠 있는지 확인 뒤 `pnpm test:db`
Expected: PASS(새 파일 — `attach.db` · `uploads.service.db` · `uploads.http.db` · `media.http.db` · `sweep.db` · `migrations.db` · `legal.service.db` · `legal.http.db`)

Run(PowerShell): `$env:ADMIN_TEST_DB_URL='mariadb://root:admin-kit-test@127.0.0.1:33307'; pnpm test:db`(12.3 컨테이너 `pnpm db:test:up:12.3`)
Expected: PASS

- [ ] **Step 3: 스모크 — 패킹 형태**

Run: `/smoke`(또는 `pnpm --filter @ssworks/admin-server pack` 뒤 임시 앱에서 `import('@ssworks/admin-server/storage/s3')` 가 `@aws-sdk/client-s3` 없이 **import 만으로** 실패하는지 · `import('@ssworks/admin-server')` 는 SDK 없이 성공하는지)
Expected: `.` 는 SDK 없이 로드되고, `./storage/s3` 는 SDK 가 없으면 `ERR_MODULE_NOT_FOUND`(의도한 선택 peer 동작)

- [ ] **Step 4: 보고**

RED/GREEN 기록 · 실측으로 고친 기대값(Task 6 DDL 글자 · Task 9 축소 높이 · Task 15 표시 집합) · 스펙 정정(Task 17 §13) · `sharp` 설치에서 본 것(빌드 스크립트 경고 유무)을 보고서에 적는다. 브랜치는 `superpowers:finishing-a-development-branch` 로 마무리한다 — push 는 사람.

---

## Self-Review(플랜 작성자)

- **스펙 대조**: §2-1 ①~⑧(결정 — Task 전반), U1(Task 1 · 12 keys), U2(Task 10), U3(Task 12 create), U4(Task 12 · 13), U5(Task 14), U6(Task 11), U7(Task 7 · 13), U8 · U9(Task 12 attach), U10(Task 16), U11(Task 12 sweep.ts · 15), U12(Task 12 storageCall), U13(Task 13 감사), U14(Task 7 · 14 — 정정), S1~S3(Task 4 · 5), S4 · S5(Task 9), S6(Task 1 · 7), §4-1(Task 1 · 2), §4-2(Task 13 · 14 · 17 index), §5(흐름 — Task 12 · 13 · 16), §6(Task 8 · 13 HTTP), §7(Task 3), §8(파일 — `uploads/sweep.test.ts` 대신 `sweep.db.test.ts` 하나 · `media.http.test.ts` 대신 `media.module.test.ts` + `media.http.db.test.ts`), §9-1 · §9-2(각 Task 테스트), §9-4(리뷰 초점 — Task 10 소켓 · Task 9 문 · Task 12 되돌림 범위는 PR #3k · Task 14 열거 · Task 16 @Optional), §10(Task 17), §12 위험 1~5(Task 3 · 14 · 11 · 10 · 16). 빠진 것: 없음. §9-1 의 "메타데이터 제거 확인" 은 Task 9 로 옮겼다(HTTP 가 아니라 단위).
- **자리표시**: 모든 코드 단계에 코드가 있다. "기존 도우미 이름에 맞춘다"(Task 11 Step 2) · "ddl 기대 문자열을 실측으로"(Task 6) · "축소 높이 실측"(Task 9) 은 측정값을 적으라는 지시이지 빈칸이 아니다.
- **타입 일관성**: `ResolvedUploadsConfig { storage · mediaPath · purposes: ReadonlyMap<string, UploadPurposeGrant> · policy · sweepIntervalMs }`(Task 7) 를 Task 11 가드 · Task 12 서비스 · Task 13 모듈이 같은 이름으로 쓴다. `UploadPurposeGrant { slot · permissions }` 는 Task 7 정의 · Task 11 import. `attachUploads(trx, input, options) → { attached, keys }` · `syncUploads → + detached`(Task 12) 를 Task 16 · 17 이 그대로 쓴다. `AdminUploadsService` 메서드 `create · remove · attach · sync · isServable · open · sweep · settings`(Task 12) 를 Task 13 컨트롤러(`create · remove`) · Task 14 중계(`isServable · open`) · Task 16 약관(`attach`) · Task 15(`sweep`) 가 쓴다. `purgeDeletedUploads(db, storage, onFailure, limit)` 시그니처가 Task 12 · 15 에서 같다. `MemoryObjectStorage.failNext('put' | 'get' | 'delete')` 가 Task 4 정의 · 12 · 13 · 14 · 15 사용. `imageRequest · seedUpload · testUploadsConfig`(Task 12 test-support) 를 12 · 13 · 14 · 15 · 16 이 쓴다. `isModuleRegistered`(Task 7) 를 Task 13 · 14 가 쓴다. 감사 meta 키 `{ key, purpose, bytes, width, height }` 가 Task 13 컨트롤러 · HTTP 테스트에서 같다.
