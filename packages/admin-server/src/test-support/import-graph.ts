import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// 테스트 전용 — 소스의 상대 import 를 따라가 바깥 패키지를 모은다(runner-graph · s3-isolation 이 쓴다). 🔴 빌드에서 빠진다.

const SPECIFIER =
  /(?:^|[ \t\r\n;])(import|export)[ \t]*(type[ \t]+)?(?:[A-Za-z0-9_*{}, \t\r\n]*?[ \t\r\n]from[ \t]*)?['"]([^'"]+)['"]/g

export function collectImports(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      if (match[2]) continue // import type · export type — 실행 시 불러오지 않는다
      const specifier = match[3]!
      if (specifier.startsWith('.'))
        queue.push(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')))
      else packages.add(specifier)
    }
  }
  return { files: [...files], packages: [...packages] }
}
