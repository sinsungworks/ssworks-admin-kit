import { BusinessError, CommonErrorCodes, type CommonErrorCode } from '@ssworks/admin-shared'

// 정본: hangang-home apps/api/src/core/utils/error.util.ts(mapError · 매핑 표 · 원본 cause 보존)
//       + ssworks-axion-admin(ER_ROW_IS_REFERENCED_2) + ssworks-gise-home apps/api/src/core/database/run.ts
// 바꾼 점:
//  - `BusinessException extends HttpException` 대신 admin-shared `BusinessError`(Nest 무의존). 상태는 예외 필터가 코드표로
//    정한다 — 같은 코드가 두 상태로 나가지 않는다.
//  - FK restrict(`ER_ROW_IS_REFERENCED_2`)는 `ERR_COMMON_IN_USE` — hangang 은 CONFLICT 였다. admin-shared 에 전용 코드가 있다.
//  - 풀 대기 초과(`ER_GET_CONNECTION_TIMEOUT`, mariadb 45028)를 UNAVAILABLE 로 더했다.
//  - 🔴 `safeExecute` 는 옮기지 않는다 — 매핑 표를 보지 않아 락 타임아웃이 INTERNAL 로 뭉개졌다(hangang 주석).
//
// 드라이버 오류는 `code` 문자열로 가른다 — mariadb 3.5 `SqlError` 는 서버 오류면 `ErrorCodes[errno]`, 클라이언트 오류
// (45000~45999)면 그 키를 `code` 에 싣는다.
// 🔴 UNIQUE 를 도메인 코드로 바꾸는 일(팀 이름 → ERR_DUPLICATE_TEAM_NAME)은 그 모듈이 제약 이름(snake — 스펙 R3)을 보고
//    여기 오기 전에 한다.

const MAPPINGS: ReadonlyMap<string, { code: CommonErrorCode; message: string }> = new Map([
  [
    'ER_DUP_ENTRY',
    { code: CommonErrorCodes.ERR_COMMON_DUPLICATED, message: '이미 존재하는 값입니다.' },
  ],
  [
    'ER_ROW_IS_REFERENCED_2',
    {
      code: CommonErrorCodes.ERR_COMMON_IN_USE,
      message: '다른 데이터가 참조하고 있어 처리할 수 없습니다.',
    },
  ],
  [
    'ER_NO_REFERENCED_ROW_2',
    { code: CommonErrorCodes.ERR_COMMON_BAD_REQUEST, message: '참조 대상이 없습니다.' },
  ],
  // 🔴 데드락(1213) · 락 대기 초과(1205)는 긴 트랜잭션의 증상이다(hangang §8-5).
  [
    'ER_LOCK_DEADLOCK',
    {
      code: CommonErrorCodes.ERR_COMMON_CONFLICT,
      message: '동시 처리 충돌입니다. 다시 시도해 주세요.',
    },
  ],
  [
    'ER_LOCK_WAIT_TIMEOUT',
    {
      code: CommonErrorCodes.ERR_COMMON_TIMEOUT,
      message: '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    },
  ],
  [
    'ETIMEDOUT',
    {
      code: CommonErrorCodes.ERR_COMMON_TIMEOUT,
      message: '처리가 지연되고 있습니다. 다시 시도해 주세요.',
    },
  ],
  [
    'ECONNREFUSED',
    {
      code: CommonErrorCodes.ERR_COMMON_UNAVAILABLE,
      message: '데이터베이스에 연결할 수 없습니다.',
    },
  ],
  [
    'ER_GET_CONNECTION_TIMEOUT',
    {
      code: CommonErrorCodes.ERR_COMMON_UNAVAILABLE,
      message: '데이터베이스에 연결할 수 없습니다.',
    },
  ],
])

function driverCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/** 드라이버 오류 → 코드 있는 `BusinessError`. `BusinessError` 는 그대로. 원본은 `cause` 로만 간다. */
export function mapError(error: unknown): BusinessError {
  if (error instanceof BusinessError) return error
  const code = driverCode(error)
  const mapping = code === undefined ? undefined : MAPPINGS.get(code)
  if (mapping) return new BusinessError(mapping.code, mapping.message, undefined, { cause: error })
  // 🔴 원본을 cause 로 매단다. 상류(crm)는 여기서 원본을 버려 500 의 실제 원인을 로그에서도 못 찾았다(hangang).
  return new BusinessError(
    CommonErrorCodes.ERR_COMMON_INTERNAL,
    '일시적인 오류가 발생했습니다.',
    undefined,
    {
      cause: error,
    },
  )
}
