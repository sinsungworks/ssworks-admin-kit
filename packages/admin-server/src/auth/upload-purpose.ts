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

/** 요청의 용도 — query.purpose 또는 params.purpose 하나 — 둘 다면 null. 문자열 하나가 아니거나 형식 밖이면 null */
export function requestedUploadPurpose(req: { query?: unknown; params?: unknown }): string | null {
  const fromQuery = (req.query as Record<string, unknown> | undefined)?.purpose
  const fromParams = (req.params as Record<string, unknown> | undefined)?.purpose
  // 🔴 둘 다 있으면 거부 — 가드가 핸들러와 다른 값을 볼 수 없게(POST 는 쿼리만 · DELETE 는 경로만 보낸다)
  if (fromQuery !== undefined && fromParams !== undefined) return null
  const raw = fromQuery ?? fromParams
  return typeof raw === 'string' && UPLOAD_PURPOSE_PATTERN.test(raw) ? raw : null
}

/**
 * 용도의 권한을 가졌는가 — 슬롯이면 permissions 맵의 키(hasPermission — '*' 는 정확 일치), 아니면 적힌 키 전부(AND).
 * 🔴 모르는 용도 · 이어지지 않은 슬롯 · 표 없음 · null · 빈 권한 목록은 거짓 — 가드의 fail-closed 를 그대로 잇는다.
 *    빈 목록은 해석이 이미 막지만 여기서도 막는다 — hasPermission(['*']) 은 요구가 없어도 참이다
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
