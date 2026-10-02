# ssworks-admin-kit

웹 서비스마다 반복되는 **관리자 페이지의 공통 부분**(레이아웃·UX·테마·권한·인증·조직 관리)을 버전 있는 npm 패키지로 꺼낸 모노레포다.

kim5257-crm-v5 · ssworks-axion-admin · ssworks-gise-home · hangang-home 네 프로젝트에 복사-수정으로 퍼져 있던 코드를 파일 단위로 대조해(`docs/phase0-reports/`) 정본을 정하고, 프로젝트마다 달라야 하는 것(테마 색·메뉴·권한 카탈로그·페이지)은 **템플릿**으로, 같아야 하는 것(다이얼로그·레이아웃·가드·인증·조직 모듈)은 **패키지**로 가른다.

| 패키지                                           | 역할                                                                                                              | 상태               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------ |
| [`@ssworks/admin-shared`](packages/admin-shared) | 프레임워크 무의존 계약 — 권한 카탈로그 팩토리, scope, 에러 코드, 응답 봉투, 페이지네이션 스키마, BigInt JSON 코덱 | Phase 1            |
| [`@ssworks/admin-ui`](packages/admin-ui)         | Vue 3 + Vuetify 4 — 레이아웃 프리미티브, 다이얼로그, 서버 페이지네이션 표, 토스트, Vuetify 프리셋, 권한 훅        | Phase 1 (1차 범위) |
| [`@ssworks/admin-server`](packages/admin-server) | NestJS — DB 모듈, 인증/세션, 권한 가드, 감사, users/roles/teams 모듈                                              | Phase 2 (골격만)   |

세 패키지는 항상 같은 번호로 함께 오른다(changesets `fixed`). 소비 프로젝트는 "admin-kit 0.x" 한 숫자로 조합을 말하고, **세 패키지를 같은 번호끼리 설치한다** — 0.x 동안 admin-shared peer 범위가 `^0` 이라 번호가 어긋나도 경고가 나지 않는다(`.changeset/README.md`).

## 설치 (소비 프로젝트)

```bash
pnpm add @ssworks/admin-shared @ssworks/admin-ui
# peer: vue ^3.5 · vuetify ^4 · zod ^4
```

```ts
// src/plugins/vuetify.ts — 프로젝트 소유. 테마 색은 여기서 정한다.
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import '@ssworks/admin-ui/style.css'
import { createAdminVuetify } from '@ssworks/admin-ui'

export default createAdminVuetify({
  theme: { themes: { light: { dark: false, colors: { primary: '#1867C0' } } } },
})
```

```ts
// packages/shared/src/permissions.ts — 카탈로그 내용은 프로젝트 소유
import { definePermissions, type PermissionOf } from '@ssworks/admin-shared'

export const permissions = definePermissions({
  ORG_USERS_READ: 'org.users:read',
  ORG_USERS_WRITE: 'org.users:write',
})
export const { PERMISSIONS, ALL_PERMISSION_VALUES, permissionListSchema } = permissions
export type Permission = PermissionOf<typeof permissions>
```

```ts
// src/composables/usePermission.ts — 저장소에 하나뿐인 판정 훅
import { createUsePermission } from '@ssworks/admin-ui'
import type { Permission } from '@myapp/shared'
import { useAppStore } from '../stores/app'

export const usePermission = createUsePermission<Permission>(
  () => useAppStore().userInfo?.permissions ?? [],
)
```

```ts
// src/main.ts
import { createToast } from '@ssworks/admin-ui'
app.use(vuetify).use(createToast())
// App.vue 에 <AdminToast /> 한 번
```

## 개발

```bash
pnpm install
pnpm check          # lint · typecheck · test · build 한 번에
pnpm test:watch
pnpm --filter @ssworks/admin-ui build
```

- Node 24 (`.nvmrc`), pnpm 12 (`packageManager` 로 고정 — corepack/pnpm 이 알아서 맞춘다). pnpm 설정은 `.npmrc` 가 아니라 `pnpm-workspace.yaml` 에 둔다(pnpm 11 부터 `.npmrc` 는 레지스트리·인증만 읽는다).
- 테스트는 vitest. DOM 이 필요한 파일만 머리에 `// @vitest-environment happy-dom` 을 단다.
- 포맷은 prettier(세미콜론 없음 · 작은따옴표 · 100자), 린트는 eslint flat config.

## 발행

1. PR 에서 `pnpm changeset` 으로 변경 수준을 적는다.
2. `main` 에 합쳐지면 release 워크플로가 **Version Packages** PR 을 연다.
3. 그 PR 을 합치면 npm 공개 스코프 `@ssworks` 로 발행된다 (저장소 시크릿 `NPM_TOKEN` 필요).

## 문서

- [`docs/00-admin-common-review.md`](docs/00-admin-common-review.md) — 공용화 방안 검토(패키지 + 템플릿 + 스킬 3층 결정)
- [`docs/01-phase0.md`](docs/01-phase0.md) — Phase 0: 정본 확정 · 확장점 · A/B/X 배정 · 프로토콜 결정
- [`docs/phase0-reports/`](docs/phase0-reports) — 네 프로젝트 파일별 대조 보고서 5편
- [`CLAUDE.md`](CLAUDE.md) — 이 저장소에서 작업할 때의 규약
