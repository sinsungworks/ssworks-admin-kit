import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Migration } from 'kysely/migration'
import * as roles from './0001_roles.js'
import * as users from './0002_users.js'
import * as teams from './0003_teams.js'
import * as teamClosure from './0004_team_closure.js'
import * as teamUserMap from './0005_team_user_map.js'
import * as userEmploymentPeriods from './0006_user_employment_periods.js'
import * as sessions from './0007_sessions.js'

// 코어 장 목록과 스텁 검사(Phase 2 결정 ③ S1).
//
// 쓰는 쪽은 자기 마이그레이션 폴더에 장마다 한 줄 스텁을 둔다:
//   export { up, down } from '@ssworks/admin-server/migrations/0001_roles'
// kysely-ctl 은 모듈의 `up` 만 본다(hangang 테넌트 폴더 스텁 실증). 번호는 쓰는 쪽이 정해 확장 ALTER 를 사이에 끼운다.
//
// 🔴 provider 로 자동 병합하지 않는 이유: Kysely Migrator 는 이름순으로 정렬하고 이미 적용된 장보다 앞에 새 장이 오면
//    거부한다(allowUnorderedMigrations: false). 패키지 장과 프로젝트 장이 따로 자라면 언젠가 그렇게 된다(스펙 §1-5).

export const ADMIN_MIGRATIONS = [
  '0001_roles',
  '0002_users',
  '0003_teams',
  '0004_team_closure',
  '0005_team_user_map',
  '0006_user_employment_periods',
  '0007_sessions',
] as const

export type AdminMigrationId = (typeof ADMIN_MIGRATIONS)[number]

const CHAPTERS: Readonly<Record<AdminMigrationId, Migration>> = {
  '0001_roles': roles,
  '0002_users': users,
  '0003_teams': teams,
  '0004_team_closure': teamClosure,
  '0005_team_user_map': teamUserMap,
  '0006_user_employment_periods': userEmploymentPeriods,
  '0007_sessions': sessions,
}

/** 패키지 테스트 하네스용 — 장 모듈을 Kysely `Migrator` provider 모양으로. 🔴 공개 API 가 아니다(쓰는 쪽은 스텁). */
export function adminMigrationRecord(): Record<string, Migration> {
  return Object.fromEntries(ADMIN_MIGRATIONS.map((id) => [id, CHAPTERS[id]]))
}

export interface StubReference {
  id: string
  file: string
}

const STUB_SPECIFIER = /@ssworks\/admin-server\/migrations\/(\d{4}_[a-z_]+)/g
const MIGRATION_FILE = /\.m?[jt]s$/
const DECLARATION_FILE = /\.d\.m?ts$/

/** 순수 판정 — 파일 이름순으로 모은 스텁 참조에서 문제를 문장으로. */
export function findStubProblems(found: readonly StubReference[]): string[] {
  const problems: string[] = []
  const known = new Set<string>(ADMIN_MIGRATIONS)
  const firstFile = new Map<string, string>()
  const order: string[] = []
  for (const { id, file } of found) {
    if (!known.has(id)) {
      problems.push(`모르는 장 ${id} (${file})`)
    } else if (firstFile.has(id)) {
      problems.push(`장 ${id} 가 두 파일에 있다 (${firstFile.get(id)}, ${file})`)
    } else {
      firstFile.set(id, file)
      order.push(id)
    }
  }
  for (const id of ADMIN_MIGRATIONS) if (!firstFile.has(id)) problems.push(`빠진 장 ${id}`)
  const expected = ADMIN_MIGRATIONS.filter((id) => firstFile.has(id))
  if (order.join() !== expected.join()) {
    problems.push(
      `파일 이름 순서가 장 순서와 다르다 — 지금: ${order.join(', ')} / 맞는 순서: ${expected.join(', ')}`,
    )
  }
  return problems
}

/**
 * 쓰는 쪽 마이그레이션 폴더의 스텁을 확인한다 — 빠진 장 · 순서 어긋남 · 모르는 · 겹친 ID 를 **한 번에** 모아 던진다.
 * `kysely.config.ts` 에서 부르면 `kysely migrate` 가 시작 전에 멈춘다. `folder` 는 kysely-ctl `migrationFolder` 와 같이
 * cwd 기준이다. 파일 이름순은 `Array#sort`(Kysely Migrator 와 같은 비교).
 */
export function assertAdminMigrationStubs(folder: string | URL): void {
  const dir = folder instanceof URL ? fileURLToPath(folder) : folder
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (error) {
    throw new Error(`마이그레이션 폴더를 읽지 못했다: ${dir}`, { cause: error })
  }
  const found: StubReference[] = []
  for (const file of names
    .filter((name) => MIGRATION_FILE.test(name) && !DECLARATION_FILE.test(name))
    .sort()) {
    const ids = new Set<string>()
    for (const match of readFileSync(join(dir, file), 'utf8').matchAll(STUB_SPECIFIER))
      ids.add(match[1] ?? '')
    for (const id of ids) found.push({ id, file })
  }
  const problems = findStubProblems(found)
  if (problems.length > 0) {
    throw new Error(
      `코어 마이그레이션 스텁이 맞지 않는다 (${dir}):\n- ${problems.join('\n- ')}\n` +
        "스텁 한 줄: export { up, down } from '@ssworks/admin-server/migrations/<id>'",
    )
  }
}
