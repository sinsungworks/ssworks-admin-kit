# @ssworks/admin-shared

관리자 페이지의 **프레임워크 무의존 계약**. 브라우저 번들(Vue)과 NestJS 양쪽이 같은 코드를 import 한다.

```bash
pnpm add @ssworks/admin-shared zod
```

| export                                                                                                                                                                                                                         | 역할                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definePermissions(catalog, { extraValues? })`                                                                                                                                                                                 | 권한 카탈로그 팩토리 — `PERMISSIONS`(+`ALL:'*'`), `ALL_PERMISSION_VALUES`, `permissionSchema`, `isPermission`, `toPermissions`, `hasPermission`, `hasAnyPermission`, `coversPermissions`, `createCheck` |
| `hasPermission` / `hasAnyPermission` / `coversPermissions`                                                                                                                                                                     | 판정 순수함수. `'*'` 정확 일치 단락, AND/OR, 빈 인자 false                                                                                                                                              |
| `createPermissionCheck(granted)` · `PermissionCheck<P>`                                                                                                                                                                        | 메뉴·가드·화면이 공유하는 판정기                                                                                                                                                                        |
| `defineScopes(resources)`                                                                                                                                                                                                      | own/team/all 범위 축(선택). `expandScopes`, `rawScopesSchema`                                                                                                                                           |
| `CommonErrorCodes` · `defineErrorCodes(codes, status)` · `BusinessError`                                                                                                                                                       | 에러 코드 + HTTP 상태 단일표. Nest 무의존 예외                                                                                                                                                          |
| `createSuccessRespSchema` · `errorRespSchema` · `ApiResp<T>`                                                                                                                                                                   | 응답 봉투 `{success:true,data}` / `{success:false,code,message,details?}`                                                                                                                               |
| `validationDetailsSchema`                                                                                                                                                                                                      | `ERR_COMMON_VALIDATION` 의 `details.issues` 계약                                                                                                                                                        |
| `createQuerySchema` · `createPaginatedRespSchema` · `toListQuery`                                                                                                                                                              | 목록 조회 규약 — 페이지·다중 정렬·필터, `total: bigint`                                                                                                                                                 |
| `parseJSON` · `stringifyJSON` · `bigintJsonReviver` · `bigintJsonReplacer` · `toWireSafe`                                                                                                                                      | `"BigInt(n)"` 와이어 표기 코덱 (B9 이스케이프)                                                                                                                                                          |
| `renderMarkdown(source)`                                                                                                                                                                                                       | 마크다운 → 안전한 HTML(markdown-it `html: false` · `linkify`). 관리자 미리보기 · 서버 공개 렌더 · 공개 웹이 **같은 함수**를 쓴다                                                                        |
| `adminLegalDocumentSchema` · `adminLegalHistoryItemSchema` · `adminLegalCurrentSchema` · `adminLegalHistorySchema` · `adminLegalPublishSchema` · `adminLegalPublishResultSchema` · `legalBodySchema` · `LEGAL_BODY_MAX_LENGTH` | 약관 계약 — 현재본 `{ item \| null }`(null = 미발행), 이력 `{ items }`(본문 없음), 발행 `{ kind, body, baseLegalDocNo }`(해시는 서버만 계산)                                                            |

```ts
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'

export const permissions = definePermissions({
  ORG_USERS_READ: 'org.users:read',
  ORG_USERS_WRITE: 'org.users:write',
})
export type Permission = PermissionOf<typeof permissions> // 'org.users:read' | 'org.users:write' | '*'
```

## 마크다운 렌더

`renderMarkdown` 은 약관처럼 관리자가 쓰고 사용자가 동의하는 본문을 그린다. 🔴 관리자 미리보기(admin-ui `MarkdownView`)와 공개 쪽(서버가 내는 `bodyHtml` · 공개 웹)이 이 함수 하나를 써야 "관리자가 본 미리보기" 와 "사용자가 동의한 원문" 이 갈리지 않는다. `html: false` 가 저장형 XSS 방어의 전부다 — 옵션을 바꾸지 않는다. `markdown-it` 은 이 패키지의 의존으로 함께 설치된다.

```ts
import { renderMarkdown } from '@ssworks/admin-shared'

// 공개 조회 응답(예) — 미발행이면 404(fail-closed)
return {
  kind,
  legalDocNo: doc.legalDocNo,
  bodyHtml: renderMarkdown(doc.body),
  publishedAt: doc.publishedAt,
}
```

발행은 `baseLegalDocNo`(편집을 시작한 판, 미발행이면 null)를 싣는다. 서버는 같은 종류의 발행을 직렬화하고, 지금 시행본 번호가 다르면 409 `ERR_COMMON_REVISION_CONFLICT`, 본문이 시행본과 같으면 409 `ERR_COMMON_CONFLICT` 를 낸다(`docs/superpowers/specs/2026-10-07-admin-ui-legal-design.md` §9).
