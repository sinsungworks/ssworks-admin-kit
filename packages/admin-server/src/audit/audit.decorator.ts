import { SetMetadata, type CustomDecorator } from '@nestjs/common'
import { AUDIT_META } from '../tokens.js'

// 정본: hangang-home apps/api/src/core/decorators/audit.decorator.ts + kim5257-crm-v5
//       packages/backend-core/src/core/decorators/audit.decorator.ts(`paramKey`)
// 바꾼 점: 메타 키에 admin-kit: 접두. 액션 · 대상 종류는 카탈로그(admin-shared defineAuditCatalog)에 있어야 한다 —
//   AdminAuditModule 이 기동에서 훑는다(2c 스펙 §5-8). 프로젝트 액션 유니온으로 좁히려면 쓰는 쪽이 감싼다.

export interface AuditOptions {
  action: string
  targetType?: string
  /** 대상 id 로 읽을 경로 변수 이름(crm). 없으면 숫자 경로 변수가 정확히 하나일 때 그것 */
  paramKey?: string
}

/**
 * 이 라우트를 감사 로그에 남긴다 — 성공 · 실패 모두(실패는 핸들러에서 던진 것만, 2c 스펙 ⑧ F1).
 * 🔴 `@Public()` 라우트에는 붙이지 않는다 — 주체가 없어 기록되지 않는다. 붙이면 기동에서 멈춘다(B11).
 */
export function Audit(options: AuditOptions): CustomDecorator<string> {
  return SetMetadata(AUDIT_META, Object.freeze({ ...options }))
}
