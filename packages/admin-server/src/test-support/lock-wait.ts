// 테스트 전용 — SHOW ENGINE INNODB STATUS 출력에서 행 잠금을 기다리는 스레드를 고른다(2e 스펙 이월 4 · §14 R1-6).
// 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 🔴 information_schema.innodb_trx(· innodb_lock_waits)를 쓰지 않는다 — InnoDB 가 서버 전역 캐시로 내고 마지막 읽기에서
//    0.1초가 지나지 않으면 새로 고치지 않는다. 병렬로 도는 테스트 파일이 서로의 폴링을 막고, 앞 테스트의 낡은 캐시가
//    "대기 중" 으로 보여 너무 일찍 커밋한다(프로브 실측). STATUS 는 캐시 없이 그 순간을 낸다.
// 🔴 TRANSACTIONS 절만 읽는다 — LATEST DETECTED DEADLOCK 절에 지난 교착의 thread id 와 LOCK WAIT 글자가 남는다.

const NEWLINE = String.fromCharCode(10)
const DASHES = /^-{4,}$/
const TITLE = /^[A-Z][A-Z0-9 /]*$/
const THREAD = /thread id ([0-9]+)/

/** 절 머리(대시 줄 · 대문자 제목 · 대시 줄)로 절을 나누고, TRANSACTIONS 절의 `LOCK WAIT` 트랜잭션 블록의 thread id 를 낸다 */
export function lockWaitThreadIds(status: string): string[] {
  const lines = status.split(NEWLINE).map((line) => line.trimEnd())
  const ids: string[] = []
  let inTransactions = false
  let block: string[] = []
  const flush = (): void => {
    if (block.some((line) => line.startsWith('LOCK WAIT'))) {
      const id = THREAD.exec(block.join(NEWLINE))?.[1]
      if (id !== undefined) ids.push(id)
    }
    block = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const title = lines[index + 1] ?? ''
    if (DASHES.test(line) && TITLE.test(title) && DASHES.test(lines[index + 2] ?? '')) {
      if (inTransactions) flush()
      inTransactions = title === 'TRANSACTIONS'
      index += 2
      continue
    }
    if (!inTransactions) continue
    if (line.startsWith('---TRANSACTION ')) flush()
    block.push(line)
  }
  if (inTransactions) flush()
  return ids
}
