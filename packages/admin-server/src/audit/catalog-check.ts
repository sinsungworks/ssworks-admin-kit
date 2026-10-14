import type { Type } from '@nestjs/common'
import { MetadataScanner, type DiscoveryService, type Reflector } from '@nestjs/core'
import type { AuditCatalog } from '@ssworks/admin-shared'
import { AUDIT_META, IS_PUBLIC } from '../tokens.js'
import type { AuditDeclaration } from './audit.decorator.js'

// 정본: kim5257-crm-v5 apps/global/backend/src/core/decorators/audit-action-catalog.spec.ts(소스를 훑는 드리프트 검사 —
//       라벨에서 39개가 조용히 빠졌다) + hangang route-audit.test.ts(@Public 라우트에 @Audit 금지)
// 바꾼 점: 테스트가 아니라 기동 검사다 — 쓰는 쪽 컨트롤러까지 Nest 가 실제로 등록한 것을 훑는다(2c 스펙 §5-8, §14 R1-3 실측).

/** 스캔으로 모은 한 줄 — `@Audit` 선언(`options`) 에 컨트롤러 · 메서드 · @Public 여부를 붙인 것 */
export interface CollectedAuditDeclaration {
  controller: string
  method: string
  options: AuditDeclaration
  isPublic: boolean
}

/** 앱의 모든 컨트롤러 메서드에서 `@Audit` 선언을 모은다(메서드 → 클래스 순으로 읽는다 — 인터셉터와 같다) */
export function collectAuditDeclarations(
  discovery: DiscoveryService,
  reflector: Reflector,
): CollectedAuditDeclaration[] {
  const scanner = new MetadataScanner()
  const found: CollectedAuditDeclaration[] = []
  for (const wrapper of discovery.getControllers()) {
    const metatype = wrapper.metatype as Type | null | undefined
    const instance = wrapper.instance as object | null | undefined
    if (metatype == null || instance == null) continue
    const prototype = Object.getPrototypeOf(instance) as object
    for (const method of scanner.getAllMethodNames(prototype)) {
      const handler: unknown = (prototype as Record<string, unknown>)[method]
      if (typeof handler !== 'function') continue
      const targets = [handler, metatype]
      const options = reflector.getAllAndOverride<AuditDeclaration | undefined>(AUDIT_META, targets)
      if (options == null) continue
      const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true
      found.push({ controller: metatype.name, method, options, isPublic })
    }
  }
  return found
}

/** 순수 판정 — 카탈로그에 없는 액션 · 대상 종류, 기록되지 않을 @Public 선언 */
export function findAuditProblems(
  declarations: readonly CollectedAuditDeclaration[],
  catalog: AuditCatalog,
): string[] {
  const problems: string[] = []
  for (const { controller, method, options, isPublic } of declarations) {
    const where = `${controller}.${method}`
    if (!catalog.isAuditAction(options.action)) {
      problems.push(`${where}: 카탈로그에 없는 액션 '${options.action}'`)
    }
    if (options.targetType !== undefined && !catalog.isAuditTarget(options.targetType)) {
      problems.push(`${where}: 카탈로그에 없는 대상 종류 '${options.targetType}'`)
    }
    if (isPublic) {
      problems.push(`${where}: @Public 라우트의 @Audit 은 기록되지 않는다(주체가 없다)`)
    }
  }
  return problems
}
