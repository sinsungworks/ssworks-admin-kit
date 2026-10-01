# @ssworks/admin-shared

관리자 페이지의 **프레임워크 무의존 계약**. 브라우저 번들(Vue)과 NestJS 양쪽이 같은 코드를 import 한다.

```bash
pnpm add @ssworks/admin-shared zod
```

| export                                                                                    | 역할                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definePermissions(catalog, { extraValues? })`                                            | 권한 카탈로그 팩토리 — `PERMISSIONS`(+`ALL:'*'`), `ALL_PERMISSION_VALUES`, `permissionSchema`, `isPermission`, `toPermissions`, `hasPermission`, `hasAnyPermission`, `coversPermissions`, `createCheck` |
| `hasPermission` / `hasAnyPermission` / `coversPermissions`                                | 판정 순수함수. `'*'` 정확 일치 단락, AND/OR, 빈 인자 false                                                                                                                                              |
| `createPermissionCheck(granted)` · `PermissionCheck<P>`                                   | 메뉴·가드·화면이 공유하는 판정기                                                                                                                                                                        |
| `defineScopes(resources)`                                                                 | own/team/all 범위 축(선택). `expandScopes`, `rawScopesSchema`                                                                                                                                           |
| `CommonErrorCodes` · `defineErrorCodes(codes, status)` · `BusinessError`                  | 에러 코드 + HTTP 상태 단일표. Nest 무의존 예외                                                                                                                                                          |
| `createSuccessRespSchema` · `errorRespSchema` · `ApiResp<T>`                              | 응답 봉투 `{success:true,data}` / `{success:false,code,message,details?}`                                                                                                                               |
| `validationDetailsSchema`                                                                 | `ERR_COMMON_VALIDATION` 의 `details.issues` 계약                                                                                                                                                        |
| `createQuerySchema` · `createPaginatedRespSchema` · `toListQuery`                         | 목록 조회 규약 — 페이지·다중 정렬·필터, `total: bigint`                                                                                                                                                 |
| `parseJSON` · `stringifyJSON` · `bigintJsonReviver` · `bigintJsonReplacer` · `toWireSafe` | `"BigInt(n)"` 와이어 표기 코덱 (B9 이스케이프)                                                                                                                                                          |

```ts
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'

export const permissions = definePermissions({
  ORG_USERS_READ: 'org.users:read',
  ORG_USERS_WRITE: 'org.users:write',
})
export type Permission = PermissionOf<typeof permissions> // 'org.users:read' | 'org.users:write' | '*'
```
