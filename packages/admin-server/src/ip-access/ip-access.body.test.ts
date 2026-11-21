import { BusinessError, IP_ACCESS_SCHEMA_MESSAGES } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { ipAccessConfig, probeScope } from '../test-support/ip-access.js'
import { IP_ACCESS_MESSAGES } from './errors.js'
import { IpRuleCreateBodyPipe, IpRuleUpdateBodyPipe } from './ip-access.body.js'

// 본문 파이프(확장 범위 스펙 §4-2) — DB 없이 파이프를 직접 부른다. 🔴 IP 라우트는 로그인 세션이 있어야 핸들러에 닿으므로
// 라우트 행동은 ip-access.extra.http.db.test.ts 가 잰다.

const extra = ipAccessConfig(false, 'req.ip', {
  extraScopes: [probeScope(), probeScope({ type: 'probeNoWhole', wholeScope: false })],
})

function issuesOf(run: () => unknown): [string, string][] {
  try {
    run()
  } catch (error) {
    if (!(error instanceof BusinessError)) throw error
    return (error.details as { issues: { path: unknown[]; message: string }[] }).issues.map(
      (issue) => [issue.path.join('.'), issue.message],
    )
  }
  throw new Error('통과했다')
}

describe('만들기 파이프', () => {
  it('등록된 확장 범위 — 대상 하나 · 범위 전체를 받는다', () => {
    const pipe = new IpRuleCreateBodyPipe(extra)
    expect(
      pipe.transform({ scopeType: 'probeToken', scopeRefNo: 7n, cidr: '10.0.0.0/8' }),
    ).toMatchObject({
      scopeType: 'probeToken',
      scopeRefNo: 7n,
    })
    expect(
      pipe.transform({ scopeType: 'probeToken', scopeRefNo: null, cidr: '10.0.0.0/8' }).scopeRefNo,
    ).toBeNull()
  })

  it('🔴 모르는 범위 · 꺼진 범위 전체 · 형식 밖 이름', () => {
    const pipe = new IpRuleCreateBodyPipe(extra)
    expect(
      issuesOf(() => pipe.transform({ scopeType: 'gone', scopeRefNo: 1n, cidr: '10.0.0.0/8' })),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
    expect(
      issuesOf(() =>
        pipe.transform({ scopeType: 'probeNoWhole', scopeRefNo: null, cidr: '10.0.0.0/8' }),
      ),
    ).toEqual([['scopeRefNo', IP_ACCESS_MESSAGES.wholeScopeOff]])
    expect(
      issuesOf(() => pipe.transform({ scopeType: 'Bad!', scopeRefNo: 1n, cidr: '10.0.0.0/8' })),
    ).toEqual([['scopeType', IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid]])
  })

  it('🔴 확장 범위가 없는 앱 — 확장 이름은 400 scopeType · 코어 불변식은 지금 그대로', () => {
    const pipe = new IpRuleCreateBodyPipe(ipAccessConfig())
    expect(
      issuesOf(() =>
        pipe.transform({ scopeType: 'probeToken', scopeRefNo: 1n, cidr: '10.0.0.0/8' }),
      ),
    ).toEqual([['scopeType', IP_ACCESS_MESSAGES.unknownScopeType]])
    expect(
      issuesOf(() => pipe.transform({ scopeType: 'global', scopeRefNo: 1n, cidr: '0.0.0.0/0' })),
    ).toEqual([['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden]])
  })
})

describe('수정 파이프', () => {
  it('scopeType 이 있으면 등록 검사 — 없으면 통과(병합 판정은 서비스)', () => {
    const pipe = new IpRuleUpdateBodyPipe(extra)
    expect(pipe.transform({ revision: 0 })).toEqual({ revision: 0 })
    expect(pipe.transform({ scopeType: 'probeToken', revision: 0 }).scopeType).toBe('probeToken')
    expect(issuesOf(() => pipe.transform({ scopeType: 'gone', revision: 0 }))).toEqual([
      ['scopeType', IP_ACCESS_MESSAGES.unknownScopeType],
    ])
  })
})
