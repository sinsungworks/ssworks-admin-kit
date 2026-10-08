import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ADMIN_MIGRATIONS,
  adminMigrationRecord,
  assertAdminMigrationStubs,
  findStubProblems,
} from './index.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('ADMIN_MIGRATIONS', () => {
  it('0001~0007 순서', () => {
    expect(ADMIN_MIGRATIONS).toEqual([
      '0001_roles',
      '0002_users',
      '0003_teams',
      '0004_team_closure',
      '0005_team_user_map',
      '0006_user_employment_periods',
      '0007_sessions',
    ])
  })

  it('🔴 장 파일 이름과 ID 가 같다 — 스텁의 `migrations/<id>` 가 dist 의 그 파일로 풀린다', () => {
    const files = readdirSync(here)
      .filter((name) => /^\d{4}_[a-z_]+\.ts$/.test(name))
      .map((name) => name.replace(/\.ts$/, ''))
      .sort()
    expect(files).toEqual([...ADMIN_MIGRATIONS])
  })

  it('adminMigrationRecord 는 장마다 up · down', () => {
    const record = adminMigrationRecord()
    expect(Object.keys(record)).toEqual([...ADMIN_MIGRATIONS])
    for (const migration of Object.values(record)) {
      expect(typeof migration.up).toBe('function')
      expect(typeof migration.down).toBe('function')
    }
  })
})

const all = ADMIN_MIGRATIONS.map((id, index) => ({ id, file: `00${index + 1}_admin.ts` }))

describe('findStubProblems', () => {
  it('다 있고 순서가 맞으면 문제 없음', () => {
    expect(findStubProblems(all)).toEqual([])
  })

  it('빠진 장', () => {
    expect(findStubProblems(all.filter((ref) => ref.id !== '0003_teams'))).toEqual([
      '빠진 장 0003_teams',
    ])
  })

  it('🔴 순서 어긋남 — FK 때문에 roles 가 users 앞이어야 한다', () => {
    const swapped = [all[1]!, all[0]!, ...all.slice(2)]
    expect(findStubProblems(swapped)).toEqual([
      '파일 이름 순서가 장 순서와 다르다 — 지금: 0002_users, 0001_roles, 0003_teams, 0004_team_closure, ' +
        '0005_team_user_map, 0006_user_employment_periods, 0007_sessions / 맞는 순서: 0001_roles, 0002_users, ' +
        '0003_teams, 0004_team_closure, 0005_team_user_map, 0006_user_employment_periods, 0007_sessions',
    ])
  })

  it('모르는 장 · 겹친 장', () => {
    expect(
      findStubProblems([
        ...all,
        { id: '0099_nope', file: 'x.ts' },
        { id: '0001_roles', file: 'y.ts' },
      ]),
    ).toEqual([
      '모르는 장 0099_nope (x.ts)',
      '장 0001_roles 가 두 파일에 있다 (001_admin.ts, y.ts)',
    ])
  })
})

describe('assertAdminMigrationStubs', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ak-stub-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeStubs(ids: readonly string[]): void {
    ids.forEach((id, index) => {
      writeFileSync(
        join(dir, `00${index + 1}_admin_${id.slice(5)}.migration.ts`),
        `export { up, down } from '@ssworks/admin-server/migrations/${id}'\n`,
      )
    })
  }

  it('다 있으면 통과 — 프로젝트 장 · .d.ts 는 무시', () => {
    writeStubs(ADMIN_MIGRATIONS)
    writeFileSync(join(dir, '100_posts.migration.ts'), 'export async function up() {}\n')
    writeFileSync(
      join(dir, '001_admin_roles.migration.d.ts'),
      "from '@ssworks/admin-server/migrations/0099_nope'\n",
    )
    expect(() => assertAdminMigrationStubs(dir)).not.toThrow()
    expect(() => assertAdminMigrationStubs(pathToFileURL(dir))).not.toThrow()
  })

  it('한 파일 안에서 같은 ID 를 두 번 써도(주석 등) 한 번으로 센다', () => {
    writeStubs(ADMIN_MIGRATIONS)
    writeFileSync(
      join(dir, '001_admin_roles.migration.ts'),
      "// @ssworks/admin-server/migrations/0001_roles\nexport { up, down } from '@ssworks/admin-server/migrations/0001_roles'\n",
    )
    expect(() => assertAdminMigrationStubs(dir)).not.toThrow()
  })

  it('🔴 빠진 장을 모아 한 번에 던진다', () => {
    writeStubs(ADMIN_MIGRATIONS.slice(0, 5))
    expect(() => assertAdminMigrationStubs(dir)).toThrow(
      /빠진 장 0006_user_employment_periods\n- 빠진 장 0007_sessions/,
    )
  })

  it('없는 폴더는 경로를 담아 던진다', () => {
    expect(() => assertAdminMigrationStubs(join(dir, 'none'))).toThrow(
      '마이그레이션 폴더를 읽지 못했다',
    )
  })
})
