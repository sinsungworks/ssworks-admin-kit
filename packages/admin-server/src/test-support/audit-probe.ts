import { Body, Controller, Module, Post, Req } from '@nestjs/common'
import { BusinessError, CommonErrorCodes } from '@ssworks/admin-shared'
import type { Request } from 'express'
import { Audit } from '../audit/audit.decorator.js'
import { attachAuditMeta } from '../audit/audit-bag.js'
import { SelfOnly } from '../auth/decorators.js'

// 테스트 전용 — 쓰는 쪽 라우트처럼 @Audit 을 달고 meta 를 붙인다(2c 스펙 §9-3). 🔴 빌드에서 빠진다(tsconfig.build.json).
// 이 모듈은 AdminAuditModule 과 다른 모듈이다 — 전역 인터셉터가 쓰는 쪽 컨트롤러에도 걸리는지 잰다.

// 🔴 ADMIN_ROUTE_MODULES 밖의 모듈이라 RouterModule 이 /admin 을 붙이지 않는다 — 컨트롤러 경로에 직접 쓴다.
@Controller('admin/auditprobe')
export class AuditProbeController {
  /** 본문을 그대로 meta 로 — 비밀 키가 가려지는지 잰다 */
  @SelfOnly()
  @Audit({ action: 'probe.write', targetType: 'probe' })
  @Post('item/:itemNo')
  write(@Req() req: Request, @Body() body: Record<string, unknown>) {
    attachAuditMeta(req, body)
    return { ok: true }
  }

  @SelfOnly()
  @Audit({ action: 'probe.write', targetType: 'probe' })
  @Post('fail')
  fail(): never {
    throw new BusinessError(CommonErrorCodes.ERR_COMMON_CONFLICT, '겹친다')
  }

  @SelfOnly()
  @Post('plain')
  plain() {
    return { ok: true }
  }
}

@Module({ controllers: [AuditProbeController] })
export class AuditProbeModule {}
