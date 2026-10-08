import { readFileSync } from 'node:fs'

// 정본: hangang-home apps/api/src/core/config/env.ts + ssworks-gise-home apps/api/src/core/config/env.ts
// 바꾼 점:
//  - `.env` 경로를 인자로 받는다. 정본은 자기 파일 위치에서 저장소 루트까지 단계를 셌는데 패키지는 그 깊이를 모른다.
//    🔴 `process.cwd()` 를 기본값으로 두지 않는다 — 실행 위치에 따라 조용히 빗나간다(정본 주석).
//  - 없는 파일(`ENOENT`)만 조용히 넘기고 그 밖의 읽기 오류는 던진다(gise). hangang 은 모든 오류를 삼켰다.
//  - 머리의 UTF-8 BOM 을 벗긴다 — 메모장이 저장한 `.env` 의 첫 키가 사라졌다(스펙 R4).
//  - 의존성을 쓰지 않는다 — 자격증명이 지나는 경로에 서드파티를 넣지 않는다(hangang).

/** `.env` 원문을 파싱한다. 순수 함수 — 파일도 `process.env` 도 건드리지 않는다. */
export function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const text = raw.startsWith('\uFEFF') ? raw.slice(1) : raw
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sep = trimmed.indexOf('=')
    if (sep < 0) continue
    const key = trimmed.slice(0, sep).trim()
    // 🔴 첫 '=' 뒤는 전부 값이다. base64 시크릿의 '=' 패딩이 잘리면 JWT 서명이 조용히 갈린다(gise).
    const value = trimmed
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (key && value) out[key] = value
  }
  return out
}

/**
 * `.env` 를 `process.env` 에 채운다.
 *
 * 🔴 이미 있는 키를 덮지 않는다 — 운영에서는 시크릿 주입이 `process.env` 를 먼저 채운다.
 * 🔴 값을 로그 · 오류 메시지에 담지 않는다.
 */
export function loadDotEnv(file: string | URL): void {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    // 운영 컨테이너에는 `.env` 가 없다 — 없는 것이 정상이다. 권한 · 디렉터리 오류까지 삼키면 읽어야 할 파일을 못 읽은
    // 채 기동이 성공하고, 증상은 나중에 "환경변수가 없다" 로만 나타난다(gise).
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const [key, value] of Object.entries(parseDotEnv(raw))) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

/** 없는 키의 **이름만** 담아 던진다. 🔴 값은 담지 않는다. */
export function requireEnv(keys: readonly string[]): void {
  const missing = keys.filter((key) => !process.env[key])
  if (missing.length > 0) throw new Error(`필수 환경변수가 없다: ${missing.join(', ')}`)
}
