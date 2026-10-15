import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 정본: ssworks-gise-home apps/api/test/legal/legal-append-only.test.ts(소스 텍스트 게이트 · 여는 괄호까지만 비교)
// 바꾼 점: 이 패키지는 테스트가 src 안에 있다 — `*.test.ts` · test-support 를 뺀다(이 파일 자신이 찾는 글자를 담는다). 원시
//   SQL(`update legal_documents` · `delete from legal_documents`)도 찾고, 대소문자를 무시한다.
// 🔴 legalDocuments 는 append-only 다(2e 스펙 공통 11) — 동의한 문서가 사후에 바뀌면 동의 기록의 증거 능력이 사라진다.
//    실행 결과가 아니라 코드 존재 자체를 잠근다. 장 폴더는 뺀다 — down() 의 dropTable 은 마이그레이션 CLI 의 스키마
//    롤백이지 요청 경로의 행 변형이 아니다(gise).

const SRC = fileURLToPath(new URL('../', import.meta.url))
const MIGRATIONS = join('database', 'migrations') + sep
const TEST_SUPPORT = 'test-support' + sep
const FORBIDDEN = [
  "updateTable('legalDocuments",
  "deleteFrom('legalDocuments",
  'update legal_documents',
  'delete from legal_documents',
]

function sources(): { path: string; content: string }[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter(
      (entry) =>
        entry.endsWith('.ts') &&
        !entry.endsWith('.test.ts') &&
        !entry.startsWith(MIGRATIONS) &&
        !entry.startsWith(TEST_SUPPORT),
    )
    .map((entry) => ({ path: entry, content: readFileSync(join(SRC, entry), 'utf8') }))
}

describe('약관 append-only 정적 검사(2e 스펙 공통 11)', () => {
  it('🔴 legalDocuments 에 UPDATE · DELETE 경로가 없다', () => {
    const found = sources()
    // 🔴 빈 목록은 공허하게 통과한다 — 약관 서비스를 실제로 읽었는지 함께 본다
    expect(found.map((source) => source.path)).toContain(join('legal', 'legal.service.ts'))
    for (const { path, content } of found) {
      const lower = content.toLowerCase()
      for (const pattern of FORBIDDEN) {
        expect(lower.includes(pattern.toLowerCase()), `${path} 에 ${pattern}`).toBe(false)
      }
    }
  })
})
