// 릴리스 발행 단계 — `pnpm release` 가 빌드 뒤에 부른다(release.yml 의 changesets/action publish).
//
// 정본: 신규. changesets 의 `changeset publish` 를 대신한다.
//
// 🔴 바로 공개하지 않고 **스테이징**한다. npm Trusted Publisher 를 "Allow npm publish" 없이(stage only)
//    등록해 두었으므로 `pnpm publish` 는 거부된다. 공개는 사람이 `pnpm stage approve <stage-id>` 로
//    2FA 승인할 때 일어난다 — CI 가 뚫려도 승인 없이는 아무것도 공개되지 않는다.
// 🔴 "이번 푸시에서 버전이 바뀌었고 아직 공개되지 않은" 패키지만 올린다. changesets/action 은
//    changeset 이 없는 **모든** main 푸시에서 이 단계를 부르는데, 스테이징된 버전도 같은 버전 번호를
//    점유해서 승인 전에 다시 올리면 거부된다. 그대로 `pnpm stage publish -r` 를 부르면 승인을
//    기다리는 동안 main 푸시마다 Release 가 빨갛게 깨진다.
//
// 기준 커밋: RELEASE_BASE_SHA(release.yml 이 `github.event.before` 로 넘긴다 — 한 번에 여러 커밋을
// 푸시해도 놓치지 않는다). 없거나 history 에 없으면 HEAD^1.
// `--dry-run` 을 넘기면 pnpm stage publish 에 그대로 전달한다(업로드하지 않는다).

import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REGISTRY = 'https://registry.npmjs.org'
const dryRun = process.argv.includes('--dry-run')

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function resolveBase() {
  const candidate = process.env.RELEASE_BASE_SHA
  if (candidate && !/^0+$/.test(candidate)) {
    try {
      return git('rev-parse', '--verify', `${candidate}^{commit}`)
    } catch {
      console.warn(`기준 커밋 ${candidate} 가 history 에 없다 — HEAD^1 로 비교한다.`)
    }
  }
  return git('rev-parse', 'HEAD^1')
}

function versionAt(base, file) {
  try {
    return JSON.parse(git('show', `${base}:${file}`)).version ?? null
  } catch {
    return null // 기준 커밋에 없던 패키지
  }
}

async function isPublished(name, version) {
  const res = await fetch(`${REGISTRY}/${name.replace('/', '%2f')}/${version}`, {
    headers: { 'cache-control': 'no-cache' },
  })
  if (res.status === 200) return true
  if (res.status === 404) return false
  throw new Error(`${name}@${version} 공개 여부 조회 실패: HTTP ${res.status}`)
}

const base = resolveBase()
const candidates = readdirSync('packages', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const file = `packages/${d.name}/package.json`
    return { dir: join('packages', d.name), file, pkg: JSON.parse(readFileSync(file, 'utf8')) }
  })
  .filter(({ pkg }) => !pkg.private)

let failed = false
for (const { dir, file, pkg } of candidates) {
  const id = `${pkg.name}@${pkg.version}`
  const before = versionAt(base, file)
  if (before === pkg.version) {
    console.warn(`건너뜀 ${id} — ${base.slice(0, 7)} 이후 버전이 그대로다.`)
    continue
  }
  if (await isPublished(pkg.name, pkg.version)) {
    console.warn(`건너뜀 ${id} — 이미 공개됐다.`)
    continue
  }
  console.warn(`스테이징 ${id} (이전 ${before ?? '없음'})`)
  const args = ['stage', 'publish', ...(dryRun ? ['--dry-run'] : [])]
  const r = spawnSync('pnpm', args, {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) {
    failed = true
    console.error(
      `스테이징 실패 ${id}. 처음 발행하는 패키지라면 Trusted Publisher 를 등록할 수 없으니 ` +
        '첫 버전은 사람이 로컬에서 `pnpm --filter <패키지> publish` 로 올린다(.changeset/README.md).',
    )
  }
}

if (failed) process.exit(1)
