// @ssworks/admin-shared — 프레임워크 무의존 공통 계약.
// 🔴 이 패키지는 브라우저 번들과 NestJS 양쪽이 소비한다. vue · vuetify · @nestjs/* · node:* 를
//    import 하지 않는다 (eslint `admin-kit/shared-is-framework-free` 가 막는다).

export {
  ALL_PERMISSION,
  type AllPermission,
  type PermissionCheck,
  type PermissionCatalog,
  type PermissionOf,
  type DefinePermissionsOptions,
  hasPermission,
  hasAnyPermission,
  coversPermissions,
  createPermissionCheck,
  definePermissions,
} from './permissions.js'

export {
  SCOPES,
  SCOPE_VALUES,
  scopeSchema,
  scopeCovers,
  type Scope,
  type ScopeCatalog,
  type DefineScopesOptions,
  defineScopes,
} from './scopes.js'

export {
  bigintJsonReviver,
  bigintJsonReplacer,
  parseJSON,
  stringifyJSON,
  toWireSafe,
} from './bigint-json.js'

export {
  CommonErrorCodes,
  COMMON_ERROR_STATUS,
  type CommonErrorCode,
  type ErrorCodeTable,
  type ErrorCodeOf,
  defineErrorCodes,
  BusinessError,
  isBusinessError,
} from './error-codes.js'

export {
  errorRespSchema,
  successRespSchema,
  createSuccessRespSchema,
  isErrorResp,
  isSuccessResp,
  validationIssueSchema,
  validationDetailsSchema,
  type ErrorResp,
  type SuccessResp,
  type ApiResp,
  type ValidationIssue,
  type ValidationDetails,
} from './response.js'

export {
  DEFAULT_ITEMS_PER_PAGE,
  DEFAULT_MAX_ITEMS_PER_PAGE,
  toArray,
  createPaginationQuerySchema,
  paginationQuerySchema,
  paginationRespSchema,
  createPaginatedRespSchema,
  sortOrderSchema,
  parseSortConditions,
  createQuerySchema,
  toListQuery,
  type PaginationQuery,
  type PaginationQueryOptions,
  type Paginated,
  type SortOrder,
  type SortCondition,
  type QuerySchemaOptions,
} from './pagination.js'

export {
  adminRoleSchema,
  adminRoleCreateSchema,
  adminRoleUpdateSchema,
  adminRoleMoveSchema,
  adminRoleRemoveSchema,
  type AdminRole,
  type AdminRoleCreate,
  type AdminRoleUpdate,
  type AdminRoleMove,
  type AdminRoleRemove,
} from './roles.js'
