import { describe, expect, it } from 'vitest'
import { lockWaitThreadIds } from './lock-wait.js'

// 표본은 플랜 전 프로브가 뜬 MariaDB 11.4.13 출력을 줄인 것이다(2e 스펙 §14 R1-6). 🔴 교착 절에도 LOCK WAIT 와 thread id 가
// 남는다 — TRANSACTIONS 절만 읽어야 한다.
const NEWLINE = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

const LINES = [
  '=====================================',
  '2026-10-14 11:57:20 0x7d09743af6c0 INNODB MONITOR OUTPUT',
  '=====================================',
  '------------------------',
  'LATEST DETECTED DEADLOCK',
  '------------------------',
  '2026-10-14 11:57:15 0x75095bfb46c0',
  '*** (1) TRANSACTION:',
  'TRANSACTION 207600, ACTIVE 0 sec inserting',
  'LOCK WAIT 3 lock struct(s), heap size 1128, 2 row lock(s)',
  'MariaDB thread id 6167, OS thread handle 1, query id 1 172.17.0.1 root Update',
  '------------',
  'TRANSACTIONS',
  '------------',
  'Trx id counter 207643',
  'LIST OF TRANSACTIONS FOR EACH SESSION:',
  '---TRANSACTION (0x7d09901b0c80), not started',
  '0 lock struct(s), heap size 1128, 0 row lock(s)',
  '---TRANSACTION 207642, ACTIVE 0 sec starting index read',
  'mysql tables in use 1, locked 1',
  'LOCK WAIT 2 lock struct(s), heap size 1128, 1 row lock(s)',
  'MariaDB thread id 6221, OS thread handle 137479560963776, query id 154452 172.17.0.1 root Statistics',
  'select * from t where id = 1 for update',
  '------- TRX HAS BEEN WAITING 207633 us FOR THIS LOCK TO BE GRANTED:',
  'RECORD LOCKS space id 8951 page no 3 n bits 320 index PRIMARY of table `akst`.`t` trx id 207642 lock_mode X locks rec but not gap waiting',
  '',
  '------------------',
  '---TRANSACTION 207641, ACTIVE 0 sec',
  '2 lock struct(s), heap size 1128, 1 row lock(s)',
  'MariaDB thread id 6220, OS thread handle 137479558198976, query id 154450 172.17.0.1 root ',
  '--------',
  'FILE I/O',
  '--------',
  'Pending flushes (fsync): 0',
]

describe('lockWaitThreadIds', () => {
  it('🔴 TRANSACTIONS 절의 대기 블록만 — 교착 절의 지난 대기 · 돌고 있는 트랜잭션은 뺀다', () => {
    expect(lockWaitThreadIds(LINES.join(NEWLINE))).toEqual(['6221'])
  })

  it('CRLF 줄바꿈도 읽는다', () => {
    expect(lockWaitThreadIds(LINES.join(CRLF))).toEqual(['6221'])
  })

  it('MySQL 표기(MySQL thread id)도 · 대기가 여럿이면 모두', () => {
    const lines = LINES.map((line) =>
      line.replace('MariaDB thread id 6220', 'MySQL thread id 6220'),
    )
    const index = lines.indexOf('2 lock struct(s), heap size 1128, 1 row lock(s)')
    lines.splice(index, 0, 'LOCK WAIT 2 lock struct(s), heap size 1128, 1 row lock(s)')
    expect(lockWaitThreadIds(lines.join(NEWLINE))).toEqual(['6221', '6220'])
  })

  it('TRANSACTIONS 절이 없으면 빈 배열', () => {
    expect(lockWaitThreadIds('')).toEqual([])
    expect(lockWaitThreadIds(LINES.slice(0, 11).join(NEWLINE))).toEqual([])
  })
})
