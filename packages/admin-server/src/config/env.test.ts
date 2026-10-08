import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDotEnv, parseDotEnv, requireEnv } from './env.js'

describe('parseDotEnv', () => {
  it('주석 · 빈 줄 · 등호 없는 줄을 건너뛴다', () => {
    expect(parseDotEnv('# 주석\n\nNOEQ\nA=1\r\nB = two \n')).toEqual({ A: '1', B: 'two' })
  })

  it('첫 = 뒤는 전부 값이다 — base64 패딩이 남는다', () => {
    expect(parseDotEnv('SECRET=abc==\n')).toEqual({ SECRET: 'abc==' })
  })

  it('양끝 따옴표를 벗긴다', () => {
    expect(parseDotEnv(`A="x y"\nB='z'`)).toEqual({ A: 'x y', B: 'z' })
  })

  it('빈 값은 넣지 않는다', () => {
    expect(parseDotEnv('A=\nB=""\n')).toEqual({})
  })

  it('🔴 머리의 UTF-8 BOM 을 벗긴다 — 메모장이 저장한 .env 의 첫 키가 사라지지 않는다', () => {
    expect(parseDotEnv('﻿DB_HOST=db\nDB_USER=app\n')).toEqual({ DB_HOST: 'db', DB_USER: 'app' })
  })
})

describe('loadDotEnv', () => {
  const keys = ['AK_ENV_A', 'AK_ENV_B']
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ak-env-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    for (const key of keys) delete process.env[key]
  })

  it('파일 값을 채우되 이미 있는 키는 덮지 않는다', () => {
    const file = join(dir, '.env')
    writeFileSync(file, 'AK_ENV_A=from-file\nAK_ENV_B=from-file\n')
    process.env.AK_ENV_A = 'from-process'
    loadDotEnv(file)
    expect(process.env.AK_ENV_A).toBe('from-process')
    expect(process.env.AK_ENV_B).toBe('from-file')
  })

  it('URL 인자를 받는다', () => {
    const file = join(dir, '.env')
    writeFileSync(file, 'AK_ENV_A=from-url\n')
    loadDotEnv(pathToFileURL(file))
    expect(process.env.AK_ENV_A).toBe('from-url')
  })

  it('없는 파일은 조용히 넘긴다 — 운영 컨테이너에는 .env 가 없다', () => {
    expect(() => loadDotEnv(join(dir, 'none.env'))).not.toThrow()
  })

  it('🔴 디렉터리 경로는 던진다 — 읽어야 할 파일을 못 읽은 채 기동하지 않는다', () => {
    const sub = join(dir, 'is-dir')
    mkdirSync(sub)
    expect(() => loadDotEnv(sub)).toThrow()
  })
})

describe('requireEnv', () => {
  afterEach(() => {
    delete process.env.AK_REQ_SET
  })

  it('없는 키의 이름만 담고 값은 담지 않는다', () => {
    process.env.AK_REQ_SET = 'secret-value'
    let message = ''
    try {
      requireEnv(['AK_REQ_SET', 'AK_REQ_MISSING_1', 'AK_REQ_MISSING_2'])
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('필수 환경변수가 없다: AK_REQ_MISSING_1, AK_REQ_MISSING_2')
  })

  it('다 있으면 통과', () => {
    process.env.AK_REQ_SET = 'x'
    expect(() => requireEnv(['AK_REQ_SET'])).not.toThrow()
  })
})
