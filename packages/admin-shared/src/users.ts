import { z } from 'zod'

// 사용자 · 계정 코어 계약 — Phase 2 서버(@ssworks/admin-server AdminUsersModule)와 쓰는 쪽 사용자 관리 화면(B)이 같은
// 모양을 본다.
//
// 정본: hangang-home apps/admin/src/api/users.api.ts(행 · 퇴사 · 재입사 · 퇴사일 본문) + ssworks-gise-home 계정 DTO(생성
//       응답 { user, temporaryPassword }) + kim5257-crm-v5 · ssworks-axion-admin(팀 하나)
// 바꾼 점:
//  - 날짜는 'YYYY-MM-DD' 문자열(입사일 · 퇴사일)과 효력 시각 resignAt(ISO)으로 나눈다(2d 스펙 ⑤ Z1 · §2-2 #13). hangang ·
//    axion 은 날짜를 UTC 자정 시각으로 실어 브라우저 시간대에 따라 하루가 밀렸다.
//  - 생성 응답 키는 item(킷 응답 모양), 임시 비밀번호 키는 temporaryPassword(3c D1).
//  - 팀은 하나(teamNo: bigint | null — ⑨ T1). 행의 팀은 대표 팀(가장 작은 teamNo — 2b R34).
//  - 🔴 객체에 `.refine()` 을 걸지 않는다(3b §11 R1). 필드 수준 검사(달력 날짜 · trim)는 쓰는 쪽 `.omit()` · `.extend()` 를
//    막지 않는다(2d 스펙 §14 R7-6). "바꿀 값 없음" 검사도 없다 — revision 만 와도 저장이다.

export const USER_ID_MAX_LENGTH = 64
export const USER_NAME_MAX_LENGTH = 64
export const EMPLOYMENT_REASON_MAX_LENGTH = 255

/** 연도 1000~9999(DATE 열 범위) · 월 · 일 두 자리. 🔴 서버는 입사 · 효력 시각(TIMESTAMP)이 담기는 1970 ~ 2038-01 만 받는다(밖은 400) */
const CALENDAR_DATE = /^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/

function isCalendarDate(value: string): boolean {
  // 🔴 모양이 틀린 값은 여기서 통과시킨다 — 모양 문구 하나만 내고 "없는 날짜" 를 겹쳐 내지 않는다
  if (!CALENDAR_DATE.test(value)) return true
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/** 'YYYY-MM-DD' — 실제 달력 날짜만(2026-02-30 거부 · 윤일 허용) */
export const calendarDateSchema = z
  .string()
  .regex(CALENDAR_DATE, '날짜는 YYYY-MM-DD 로 적습니다.')
  .refine(isCalendarDate, '없는 날짜입니다.')

const userIdSchema = z.string().trim().min(1).max(USER_ID_MAX_LENGTH)
const userNameSchema = z.string().trim().min(1).max(USER_NAME_MAX_LENGTH)
const reasonSchema = z.string().trim().max(EMPLOYMENT_REASON_MAX_LENGTH).nullable()
/** 🔴 Phase 0 §4 "쓰기 보호는 revision 기본". 수정 · 퇴사 · 퇴사일 · 재입사가 올린다(⑧ V1) */
const revisionSchema = z.number().int().min(0)

export const adminUserSchema = z.object({
  userNo: z.bigint(),
  userId: z.string(),
  userName: z.string(),
  roleNo: z.bigint(),
  roleName: z.string(),
  /** 대표 팀(가장 작은 teamNo). 무소속이면 null */
  teamNo: z.bigint().nullable(),
  teamName: z.string().nullable(),
  /** 마지막 재직 구간의 입사일(원천). 이력이 없는 시드 계정은 users.joinAt 의 기준 시간대 날짜 */
  joinDate: calendarDateSchema,
  /** 마지막 재직 구간의 퇴사일. 재직 중이면 null */
  resignDate: calendarDateSchema.nullable(),
  /** 퇴사 효력 시각(기준 시간대의 퇴사일 다음 날 0시 — 2b ④ R1). 미래면 퇴사 예정 */
  resignAt: z.iso.datetime().nullable(),
  isPasswordChangeRequired: z.boolean(),
  /** 잠김이 미래일 때만. 아니면 null(gise) */
  lockUntil: z.iso.datetime().nullable(),
  revision: revisionSchema,
  createAt: z.iso.datetime(),
  /** 편집 폼이 보이는 값이 바뀐 시각 — 로그인 실패 · 비밀번호 변경은 바꾸지 않는다(⑧ U1) */
  updateAt: z.iso.datetime(),
})

export const adminUserCreateSchema = z.object({
  userId: userIdSchema,
  userName: userNameSchema,
  roleNo: z.bigint(),
  teamNo: z.bigint().nullable(),
  /** 없으면 기준 시간대의 오늘 */
  joinDate: calendarDateSchema.optional(),
})

/** 🔴 temporaryPassword 는 이 응답에서 한 번만 보인다 — 서버는 저장하지도 감사에 남기지도 않는다 */
export const adminUserCreateResultSchema = z.object({
  item: adminUserSchema,
  temporaryPassword: z.string().min(1),
})

/** 부분 갱신. 🔴 revision 만 필수 — 낙관적 잠금은 끄는 경로가 없다. teamNo: null 은 "소속 없음", 생략은 "그대로" */
export const adminUserUpdateSchema = z.object({
  revision: revisionSchema,
  userName: userNameSchema.optional(),
  roleNo: z.bigint().optional(),
  teamNo: z.bigint().nullable().optional(),
  /** 마지막 재직 구간의 입사일 정정 */
  joinDate: calendarDateSchema.optional(),
})

/** 퇴사 — 퇴사일 당일까지 근무한다. 지금 막으려면 어제 날짜(⑤ Z1) */
export const adminUserResignSchema = z.object({
  resignDate: calendarDateSchema,
  reason: reasonSchema.optional(),
})

/** 퇴사일 정정 — 마지막 구간만. reason 을 생략하면 그대로 둔다 */
export const adminUserResignDateSchema = z.object({
  resignDate: calendarDateSchema,
  reason: reasonSchema.optional(),
})

/** 재입사 — 직전 퇴사일 다음 날부터 */
export const adminUserRehireSchema = z.object({
  joinDate: calendarDateSchema,
  reason: reasonSchema.optional(),
})

export const adminEmploymentPeriodSchema = z.object({
  periodNo: z.bigint(),
  joinDate: calendarDateSchema,
  resignDate: calendarDateSchema.nullable(),
  reason: z.string().nullable(),
  /** 기록 시점 프로세스 TZ — 패키지는 늘 'UTC'(어느 기준 시간대로 셈했는지는 감사 meta 가 남긴다) */
  recordedTimezone: z.string(),
  /** 기록한 관리자. 최초 입사 행은 null */
  createdBy: z.bigint().nullable(),
  createdByName: z.string().nullable(),
  createAt: z.iso.datetime(),
})

export type AdminUser = z.infer<typeof adminUserSchema>
export type AdminUserCreate = z.infer<typeof adminUserCreateSchema>
export type AdminUserCreateResult = z.infer<typeof adminUserCreateResultSchema>
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>
export type AdminUserResign = z.infer<typeof adminUserResignSchema>
export type AdminUserResignDate = z.infer<typeof adminUserResignDateSchema>
export type AdminUserRehire = z.infer<typeof adminUserRehireSchema>
export type AdminEmploymentPeriod = z.infer<typeof adminEmploymentPeriodSchema>
