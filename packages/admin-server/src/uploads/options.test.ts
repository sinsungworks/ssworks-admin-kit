import { describe, expect, it } from 'vitest'
import { MemoryObjectStorage } from '../test-support/memory-storage.js'
import { resolveUploadsConfig } from './options.js'

const storage = new MemoryObjectStorage()
const PERMISSIONS = { 'legal.publish': 'setting.legal:publish', 'teams.manage': 'org.teams:write' }

const resolve = (
  uploads: unknown,
  hasLegal = true,
  permissions: Record<string, string> = PERMISSIONS,
) => resolveUploadsConfig({ uploads, permissions } as never, hasLegal, 'AdminUploadsModule')

function messageOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('던지지 않았다')
}

describe('resolveUploadsConfig(스펙 U7 · U14 · S6)', () => {
  it('최소 옵션 — 기본값: mediaPath /api/media · 정책 기본 · 정리 60분 · legal 용도 자동(AdminLegalModule 이 있을 때)', () => {
    const config = resolve({ storage })
    expect(config.storage).toBe(storage)
    expect(config.mediaPath).toBe('/api/media')
    expect(config.policy.maxBytes).toBe(10_485_760)
    expect(config.sweepIntervalMs).toBe(3_600_000)
    expect([...config.purposes.entries()]).toEqual([
      ['legal', { slot: 'legal.publish', permissions: [] }],
    ])
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('약관 모듈이 없으면 legal 용도도 없다', () => {
    expect(resolve({ storage }, false).purposes.size).toBe(0)
  })

  it('앱 용도 — 슬롯 또는 권한 키 · 정책 일부 덮기 · 정리 끔 · mediaPath', () => {
    const config = resolve({
      storage,
      mediaPath: '/media',
      purposes: {
        notice: { permissions: ['board.posts:write'] },
        team_doc: { slot: 'teams.manage' },
      },
      policy: { maxBytes: 1_000, maxPerBody: 3 },
      sweep: false,
    })
    expect(config.mediaPath).toBe('/media')
    expect(config.policy).toEqual({
      ...config.policy,
      maxBytes: 1_000,
      maxPerBody: 3,
      maxLongEdge: 2048,
    })
    expect(config.sweepIntervalMs).toBeNull()
    expect(config.purposes.get('notice')).toEqual({
      slot: null,
      permissions: ['board.posts:write'],
    })
    expect(config.purposes.get('team_doc')).toEqual({ slot: 'teams.manage', permissions: [] })
    expect(resolve({ storage, sweep: { intervalMinutes: 5 } }).sweepIntervalMs).toBe(300_000)
  })

  it('🔴 옵션이 없으면 기동에서 멈춘다 — 무엇을 더할지 문구에', () => {
    for (const uploads of [undefined, null, 'x']) {
      expect(messageOf(() => resolve(uploads))).toBe(
        "AdminUploadsModule 은 uploads 옵션이 있어야 한다 — AdminServerModule 옵션에 uploads: { storage: createFileSystemStorage({ root: './uploads' }) } 를 더한다.",
      )
    }
  })

  it('🔴 문제를 모아 한 번에 — 저장소 모양 · mediaPath · 용도 이름 · legal 겹침 · slot/permissions 둘 다 또는 둘 다 없음 · 모르는 슬롯 · 이어지지 않은 슬롯 · 빈 권한 키 · 정책 · 정리', () => {
    const message = messageOf(() =>
      resolve({
        storage: { put() {} },
        mediaPath: '/api/files',
        purposes: {
          legal: { slot: 'legal.publish' },
          'bad kind': { slot: 'teams.manage' },
          both: { slot: 'teams.manage', permissions: ['x'] },
          none: {},
          unknown: { slot: 'nope' },
          unwired: { slot: 'ipAccess.manage' },
          empty: { permissions: [' '] },
        },
        policy: { maxBytes: 0, webpQuality: 101, maxPerBody: 1.5 },
        sweep: { intervalMinutes: 0 },
      }),
    )
    expect(message).toBe(
      'AdminUploadsModule 의 uploads 옵션이 맞지 않다 — ' +
        [
          'uploads.storage 는 put · get · delete 를 가진 저장소여야 한다(createFileSystemStorage · createS3ObjectStorage)',
          "uploads.mediaPath 는 '/media' 로 끝나는 경로여야 한다(예: '/api/media'): \"/api/files\"",
          'uploads.purposes.legal — legal 용도는 AdminLegalModule 이 자동으로 등록한다(빼라)',
          `uploads.purposes["bad kind"] — 용도는 영숫자 · '_' 1~32자여야 한다`,
          'uploads.purposes.both — slot 과 permissions 중 하나만 적는다',
          'uploads.purposes.none — slot 또는 permissions 가 있어야 한다',
          'uploads.purposes.unknown — 모르는 슬롯: nope',
          'uploads.purposes.unwired — 슬롯 ipAccess.manage 가 permissions 에 이어지지 않았다',
          'uploads.purposes.empty — permissions 는 빈 문자열이 아닌 권한 키의 배열이어야 한다',
          'uploads.policy.maxBytes 는 1 이상의 정수여야 한다: 0',
          'uploads.policy.webpQuality 는 1~100 의 정수여야 한다: 101',
          'uploads.policy.maxPerBody 는 1 이상의 정수여야 한다: 1.5',
          'uploads.sweep.intervalMinutes 는 1 이상의 정수여야 한다: 0',
        ].join(' / '),
    )
  })

  it('정책이 객체가 아님 · 모르는 정책 키 · sweep 이 숫자 · 용도 값이 객체가 아님 — 각각 문제 한 줄', () => {
    expect(messageOf(() => resolve({ storage, policy: 'x' }))).toContain(
      'uploads.policy 는 객체여야 한다',
    )
    expect(messageOf(() => resolve({ storage, policy: { foo: 1 } }))).toContain(
      'uploads.policy 에 모르는 키: foo',
    )
    expect(messageOf(() => resolve({ storage, sweep: 5 }))).toContain(
      'uploads.sweep 는 false 또는 { intervalMinutes } 여야 한다',
    )
    expect(messageOf(() => resolve({ storage, purposes: { notice: 'x' } }))).toContain(
      'uploads.purposes.notice — { slot } 또는 { permissions } 객체여야 한다',
    )
    expect(messageOf(() => resolve({ storage, purposes: 'x' }))).toContain(
      'uploads.purposes 는 { 용도: { slot | permissions } } 객체여야 한다',
    )
  })

  it('🔴 정리 주기 상한 — Node 타이머 상한(2^31-1 ms)을 넘는 분은 기동에서 멈춘다(넘기면 1 ms 마다 돈다)', () => {
    expect(resolve({ storage, sweep: { intervalMinutes: 35_791 } }).sweepIntervalMs).toBe(
      35_791 * 60_000,
    )
    expect(messageOf(() => resolve({ storage, sweep: { intervalMinutes: 35_792 } }))).toContain(
      'uploads.sweep.intervalMinutes 는 35791 이하여야 한다(Node 타이머 상한): 35792',
    )
    expect(messageOf(() => resolve({ storage, sweep: { intervalMinutes: 43_200 } }))).toContain(
      'uploads.sweep.intervalMinutes 는 35791 이하여야 한다(Node 타이머 상한): 43200',
    )
  })

  it('mediaPath — 루트 · 접두사 여럿 · 끝 슬래시 · 비어 있음', () => {
    expect(resolve({ storage, mediaPath: '/media' }).mediaPath).toBe('/media')
    expect(resolve({ storage, mediaPath: '/api/v1/media' }).mediaPath).toBe('/api/v1/media')
    expect(messageOf(() => resolve({ storage, mediaPath: '/api/media/' }))).toContain(
      "uploads.mediaPath 는 '/media' 로 끝나는",
    )
    expect(messageOf(() => resolve({ storage, mediaPath: '' }))).toContain(
      "uploads.mediaPath 는 '/media' 로 끝나는",
    )
    expect(messageOf(() => resolve({ storage, mediaPath: 'api/media' }))).toContain(
      "uploads.mediaPath 는 '/media' 로 끝나는",
    )
  })
})
