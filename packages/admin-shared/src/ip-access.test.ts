import { describe, expect, it } from 'vitest'
import {
  IP_ACCESS_SCHEMA_MESSAGES,
  adminIpPreviewQuerySchema,
  adminIpRuleCreateSchema,
  adminIpRuleUpdateSchema,
  applicableIpLayer,
  evaluateIpAccess,
  ipCidrSchema,
  ipInCidr,
  ipScopeProblem,
  isValidCidr,
  isValidIp,
  isValidIpScope,
  normalizeIp,
  parseCidr,
  type IpRule,
  type IpSubject,
} from './ip-access.js'

// 정본: hangang-home apps/api/src/core/utils/request-ip.util.test.ts · modules/ip-access/ip-evaluation.test.ts ·
//       ip-access.dto.test.ts — 헤더 순서(getClientIp) 테스트는 옮기지 않는다(서버 clientIpOf 가 잰다).

const subject: IpSubject = { userNo: 1n, teamNos: [10n] }
const rule = (
  scopeType: IpRule['scopeType'],
  cidr: string,
  scopeRefNo: bigint | null = null,
): IpRule => ({ scopeType, scopeRefNo, cidr })

describe('normalizeIp · isValidIp', () => {
  it('IPv4-mapped 를 IPv4 로, IPv6 루프백을 127.0.0.1 로', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9')
    expect(normalizeIp('::FFFF:203.0.113.9')).toBe('203.0.113.9')
    expect(normalizeIp('::1')).toBe('127.0.0.1')
    expect(normalizeIp('0:0:0:0:0:0:0:1')).toBe('127.0.0.1')
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
  })

  it('🔴 주소 하나로 읽히는 것만 — 쉼표로 이어 붙은 중복 헤더 · 빈 값 · 글자는 거짓', () => {
    expect(isValidIp('203.0.113.9')).toBe(true)
    expect(isValidIp('::ffff:127.0.0.1')).toBe(true)
    expect(isValidIp('2001:db8::1')).toBe(true)
    expect(isValidIp('1.2.3.4, 5.6.7.8')).toBe(false)
    expect(isValidIp('2001:db8::1, ::2')).toBe(false)
    expect(isValidIp('')).toBe(false)
    expect(isValidIp('localhost')).toBe(false)
    expect(isValidIp('010.0.0.1')).toBe(false)
  })
})

describe('ipInCidr — IPv4', () => {
  it('전역 허용이 모든 v4 를 통과시킨다', () => {
    expect(ipInCidr('203.0.113.9', '0.0.0.0/0')).toBe(true)
  })

  it('프리픽스 경계를 정확히 본다', () => {
    expect(ipInCidr('192.168.1.255', '192.168.1.0/24')).toBe(true)
    expect(ipInCidr('192.168.2.0', '192.168.1.0/24')).toBe(false)
    expect(ipInCidr('10.0.0.255', '10.0.0.0/23')).toBe(true)
    expect(ipInCidr('10.0.1.255', '10.0.0.0/23')).toBe(true)
    expect(ipInCidr('10.0.2.0', '10.0.0.0/23')).toBe(false)
  })

  it('/32 는 한 주소만', () => {
    expect(ipInCidr('203.0.113.9', '203.0.113.9/32')).toBe(true)
    expect(ipInCidr('203.0.113.10', '203.0.113.9/32')).toBe(false)
  })

  it('Review Focus 1 — 호스트 비트가 남은 CIDR 도 네트워크처럼 매칭한다', () => {
    expect(isValidCidr('203.0.113.9/24')).toBe(true)
    expect(ipInCidr('203.0.113.200', '203.0.113.9/24')).toBe(true)
    expect(ipInCidr('203.0.114.1', '203.0.113.9/24')).toBe(false)
  })

  it('잘못된 표기를 거부한다', () => {
    expect(ipInCidr('203.0.113.9', '203.0.113.9')).toBe(false)
    expect(ipInCidr('203.0.113.9', '203.0.113.9/33')).toBe(false)
    expect(ipInCidr('256.0.0.1', '0.0.0.0/0')).toBe(false)
    expect(ipInCidr('010.0.0.1', '0.0.0.0/0')).toBe(false)
  })
})

describe('ipInCidr — IPv6', () => {
  it('전역 허용 · 축약 · /128', () => {
    expect(ipInCidr('2001:db8::1', '::/0')).toBe(true)
    expect(ipInCidr('2001:db8::1', '2001:db8::/32')).toBe(true)
    expect(ipInCidr('2001:db9::1', '2001:db8::/32')).toBe(false)
    expect(ipInCidr('2001:db8::1', '2001:db8::1/128')).toBe(true)
    expect(ipInCidr('2001:db8::2', '2001:db8::1/128')).toBe(false)
  })

  it('Review Focus 2 — 대문자 · 축약이 섞인 표기도 같은 주소다', () => {
    expect(ipInCidr('2001:DB8::1', '2001:db8:0:0::/32')).toBe(true)
    expect(ipInCidr('2001:db8:0:0:0:0:0:1', '2001:DB8::1/128')).toBe(true)
  })

  it('🔴 계열이 다르면 매칭하지 않는다 — 시드가 0.0.0.0/0 과 ::/0 두 행인 이유', () => {
    expect(ipInCidr('203.0.113.9', '::/0')).toBe(false)
    expect(ipInCidr('2001:db8::1', '0.0.0.0/0')).toBe(false)
  })

  it('🔴 ::1 은 0.0.0.0/0 에 매칭되고 ::/0 에는 안 된다 — 루프백 정규화의 귀결(hangang)', () => {
    expect(ipInCidr('::1', '0.0.0.0/0')).toBe(true)
    expect(ipInCidr('::1', '::/0')).toBe(false)
  })

  it('존 인덱스(%eth0)를 버린다', () => {
    expect(ipInCidr('fe80::1%eth0', 'fe80::/10')).toBe(true)
  })
})

describe('ipInCidr — v4-mapped CIDR(hangang R16)', () => {
  it('v4-mapped CIDR 이 같은 주소의 v4-mapped · 순수 v4 IP 를 통과시킨다', () => {
    expect(ipInCidr('::ffff:203.0.113.9', '::ffff:203.0.113.0/120')).toBe(true)
    expect(ipInCidr('::ffff:203.0.113.9', '::ffff:203.0.114.0/120')).toBe(false)
    expect(ipInCidr('203.0.113.9', '::ffff:203.0.113.0/120')).toBe(true)
  })

  it('🔴 96 미만 프리픽스는 v4 로 표현할 수 없어 거부한다', () => {
    expect(ipInCidr('203.0.113.9', '::ffff:0.0.0.0/64')).toBe(false)
    expect(isValidCidr('::ffff:0.0.0.0/64')).toBe(false)
  })
})

describe('isValidCidr — 검증과 평가가 같은 파서(hangang R30)', () => {
  it('프리픽스가 없거나 숫자가 아니거나 범위를 넘으면 거부한다', () => {
    for (const bad of [
      '203.0.113.0',
      '2001:db8::',
      '203.0.113.0/',
      '203.0.113.0/ab',
      '203.0.113.0/33',
      '2001:db8::/129',
    ]) {
      expect(isValidCidr(bad), bad).toBe(false)
    }
  })

  it('네트워크 주소가 IP 가 아니면 거부한다', () => {
    for (const bad of [
      '203.0.113/24',
      '203.0.113.256/24',
      '010.0.0.0/8',
      '2001:db8:::1/64',
      '',
      '그냥 글자/24',
    ]) {
      expect(isValidCidr(bad), bad).toBe(false)
    }
  })

  it('🔴 통과한 것은 평가에서 반드시 파싱된다 — 자기 네트워크 주소를 통과시킨다', () => {
    for (const cidr of ['0.0.0.0/0', '203.0.113.0/24', '10.0.0.0/8', '2001:db8::/32', '::/0']) {
      expect(isValidCidr(cidr), cidr).toBe(true)
      expect(parseCidr(cidr), cidr).not.toBeNull()
    }
    expect(isValidCidr('::ffff:203.0.113.0/120')).toBe(true)
  })
})

describe('층 · 평가', () => {
  it('🔴 규칙이 하나도 없으면 거부한다(기본 거부)', () => {
    expect(evaluateIpAccess('203.0.113.9', [], subject)).toBe(false)
    expect(applicableIpLayer([], subject)).toBeNull()
  })

  it('🔴 주소가 null 이면 거부한다(fail-closed) — 전역 허용이 있어도', () => {
    expect(evaluateIpAccess(null, [rule('global', '0.0.0.0/0')], subject)).toBe(false)
  })

  it('전역 허용만 있으면 통과한다', () => {
    expect(evaluateIpAccess('203.0.113.9', [rule('global', '0.0.0.0/0')], subject)).toBe(true)
    expect(evaluateIpAccess('2001:db8::1', [rule('global', '::/0')], subject)).toBe(true)
  })

  it('🔴 가장 가까운 층 하나만 — user 규칙이 있으면 global 을 안 본다', () => {
    const rules = [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 1n)]
    expect(applicableIpLayer(rules, subject)).toBe('user')
    expect(evaluateIpAccess('203.0.113.9', rules, subject)).toBe(false)
    expect(evaluateIpAccess('10.1.2.3', rules, subject)).toBe(true)
  })

  it('user 가 없으면 team, team 도 없으면 global — 팀 층은 이 사람의 팀에만', () => {
    const rules = [rule('global', '0.0.0.0/0'), rule('team', '10.0.0.0/8', 10n)]
    expect(applicableIpLayer(rules, subject)).toBe('team')
    expect(evaluateIpAccess('203.0.113.9', rules, subject)).toBe(false)
    expect(evaluateIpAccess('203.0.113.9', rules, { userNo: 1n, teamNos: [99n] })).toBe(true)
    expect(evaluateIpAccess('203.0.113.9', rules, { userNo: 1n, teamNos: [] })).toBe(true)
  })

  it('다른 사람의 user 규칙은 이 사람의 층을 만들지 않는다', () => {
    const rules = [rule('global', '0.0.0.0/0'), rule('user', '10.0.0.0/8', 99n)]
    expect(applicableIpLayer(rules, subject)).toBe('global')
  })

  it('같은 층에 여럿이면 하나라도 맞으면 통과 · 계열이 다른 규칙만 있으면 그 층에서 거부', () => {
    const rules = [rule('user', '10.0.0.0/8', 1n), rule('user', '203.0.113.0/24', 1n)]
    expect(evaluateIpAccess('203.0.113.9', rules, subject)).toBe(true)
    expect(evaluateIpAccess('203.0.113.9', [rule('global', '::/0')], subject)).toBe(false)
  })

  it('모르는 scopeType(옛 행 · 직접 넣은 값)은 어느 층에도 걸리지 않는다', () => {
    const odd = { scopeType: 'role', scopeRefNo: 1n, cidr: '10.0.0.0/8' } as unknown as IpRule
    expect(applicableIpLayer([odd, rule('global', '0.0.0.0/0')], subject)).toBe('global')
  })
})

describe('범위 판정', () => {
  it('global 은 대상이 없어야 하고 team · user 는 있어야 한다', () => {
    expect(ipScopeProblem({ scopeType: 'global', scopeRefNo: null })).toBeNull()
    expect(ipScopeProblem({ scopeType: 'global', scopeRefNo: 1n })).toBe(
      IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden,
    )
    expect(ipScopeProblem({ scopeType: 'team', scopeRefNo: null })).toBe(
      IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired,
    )
    expect(isValidIpScope({ scopeType: 'user', scopeRefNo: 3n })).toBe(true)
    expect(isValidIpScope({ scopeType: 'user', scopeRefNo: null })).toBe(false)
  })
})

describe('스키마', () => {
  it('Review Focus 3 — CIDR 의 앞뒤 공백을 떼고 검증한다 · 형식 오류는 한 문구', () => {
    expect(ipCidrSchema.parse(' 10.0.0.0/8 ')).toBe('10.0.0.0/8')
    const failed = ipCidrSchema.safeParse('203.0.113.0')
    expect(failed.success).toBe(false)
    expect(failed.error?.issues.map((issue) => issue.message)).toEqual([
      IP_ACCESS_SCHEMA_MESSAGES.cidr,
    ])
    expect(ipCidrSchema.safeParse('').success).toBe(false)
    expect(ipCidrSchema.safeParse('1'.repeat(44)).success).toBe(false)
  })

  it('만들기 — 설명의 빈 문자열은 null, 범위 불변식은 스키마가 아니라 판정 함수 몫(refine 없음)', () => {
    expect(
      adminIpRuleCreateSchema.parse({
        scopeType: 'global',
        scopeRefNo: null,
        cidr: '0.0.0.0/0',
        description: '  ',
      }),
    ).toEqual({ scopeType: 'global', scopeRefNo: null, cidr: '0.0.0.0/0', description: null })
    // 🔴 refine 이 없어야 서버가 재인증 칸을 extend 한다(zod 4)
    expect(() =>
      adminIpRuleCreateSchema.extend({ currentPassword: adminIpRuleCreateSchema.shape.cidr }),
    ).not.toThrow()
    expect(
      adminIpRuleCreateSchema.safeParse({ scopeType: 'global', scopeRefNo: 1n, cidr: '0.0.0.0/0' })
        .success,
    ).toBe(true)
  })

  it('수정 — revision 만 필수, null 설명은 지우기', () => {
    expect(adminIpRuleUpdateSchema.parse({ revision: 0 })).toEqual({ revision: 0 })
    expect(adminIpRuleUpdateSchema.safeParse({ cidr: '10.0.0.0/8' }).success).toBe(false)
    expect(adminIpRuleUpdateSchema.parse({ revision: 2, description: null })).toEqual({
      revision: 2,
      description: null,
    })
  })

  it('미리보기 쿼리 — op 없음은 지금 상태, 쿼리 문자열의 번호는 bigint 로', () => {
    expect(adminIpPreviewQuerySchema.parse({})).toEqual({})
    expect(
      adminIpPreviewQuerySchema.parse({
        op: 'create',
        scopeType: 'team',
        scopeRefNo: '12',
        cidr: '10.0.0.0/8',
      }),
    ).toEqual({ op: 'create', scopeType: 'team', scopeRefNo: 12n, cidr: '10.0.0.0/8' })
    expect(adminIpPreviewQuerySchema.parse({ op: 'delete', ruleNo: '3' })).toEqual({
      op: 'delete',
      ruleNo: 3n,
    })
  })

  it('미리보기 쿼리 — op 별 빠진 칸 · 범위 불변식은 그 칸의 오류', () => {
    const paths = (input: unknown) =>
      adminIpPreviewQuerySchema
        .safeParse(input)
        .error?.issues.map((issue) => [issue.path.join('.'), issue.message])
    expect(paths({ op: 'update' })).toEqual([
      ['ruleNo', IP_ACCESS_SCHEMA_MESSAGES.previewField],
      ['scopeType', IP_ACCESS_SCHEMA_MESSAGES.previewField],
      ['cidr', IP_ACCESS_SCHEMA_MESSAGES.previewField],
    ])
    expect(paths({ op: 'delete' })).toEqual([['ruleNo', IP_ACCESS_SCHEMA_MESSAGES.previewField]])
    expect(paths({ op: 'create', scopeType: 'user', cidr: '10.0.0.0/8' })).toEqual([
      ['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefRequired],
    ])
    expect(paths({ op: 'create', scopeType: 'global', scopeRefNo: '1', cidr: '::/0' })).toEqual([
      ['scopeRefNo', IP_ACCESS_SCHEMA_MESSAGES.scopeRefForbidden],
    ])
    expect(adminIpPreviewQuerySchema.safeParse({ ruleNo: '-1' }).success).toBe(false)
  })
})
