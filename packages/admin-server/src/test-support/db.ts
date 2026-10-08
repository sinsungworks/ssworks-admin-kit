import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { Migrator } from 'kysely/migration'
import { createConnection } from 'mariadb'
import { createAdminKysely } from '../database/kysely.js'
import { adminMigrationRecord } from '../database/migrations/index.js'
import type { AdminDatabase } from '../database/types.js'
import { testDbServer } from './db-url.js'

// 테스트 파일마다 새 데이터베이스를 만들고 끝나면 지운다. 장은 패키지 안의 같은 모듈을 Kysely Migrator 로 돌린다 —
// 쓰는 쪽 스텁이 재export 하는 바로 그 모듈이다.

export interface TestDatabase {
  name: string
  db: Kysely<AdminDatabase>
  migrator: Migrator
  drop(): Promise<void>
}

export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const server = testDbServer()
  const name = `akt_${randomBytes(6).toString('hex')}`
  const admin = await createConnection(server)
  try {
    await admin.query(`create database \`${name}\` character set utf8mb4 collate utf8mb4_bin`)
  } finally {
    await admin.end()
  }

  const db = createAdminKysely<AdminDatabase>({ ...server, database: name, connectionLimit: 4 })
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => adminMigrationRecord() },
  })
  async function drop(): Promise<void> {
    try {
      await db.destroy()
    } finally {
      const connection = await createConnection(server)
      try {
        await connection.query(`drop database if exists \`${name}\``)
      } finally {
        await connection.end()
      }
    }
  }

  if (options.migrate !== false) {
    // 실패하면 beforeAll 이 t 를 못 받아 afterAll 이 지울 수 없다 — 여기서 정리하고 던진다.
    try {
      const { error } = await migrator.migrateToLatest()
      if (error) throw error
    } catch (error) {
      await drop()
      throw error
    }
  }

  return { name, db, migrator, drop }
}
