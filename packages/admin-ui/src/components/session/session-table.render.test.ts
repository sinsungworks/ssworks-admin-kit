// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, type Component } from 'vue'
import { VDataTableServer } from 'vuetify/components'
import { vuetify } from '../../test/setup.js'
import SessionTable from './SessionTable.vue'
import { formatDateTime, type SessionTableRow } from './session-table.js'

// 정본: ssworks-gise-home apps/admin/test/me-page.test.ts 의 세션 표 규칙(현재 행에 버튼 없음 · 같은 요약 행을
//       접근 이름으로 구분 · busy 잠금)을 킷 DataTableBody 위에서 다시 잰다.

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const row = (over: Partial<SessionTableRow>): SessionTableRow => ({
  sessionNo: 1n,
  userAgent: CHROME_WIN,
  ipAddress: '10.0.0.1',
  loginAt: '2026-10-05T00:00:00.000Z',
  lastAccessAt: '2026-10-05T01:00:00.000Z',
  expireAt: '2026-10-12T01:00:00.000Z',
  isCurrent: false,
  ...over,
})

const ROWS: SessionTableRow[] = [
  row({ sessionNo: 1n, isCurrent: true, userId: 'kim', userName: '김' }),
  row({
    sessionNo: 2n,
    userAgent: SAFARI_IPHONE,
    lastAccessAt: '2026-10-05T02:00:00.000Z',
    userId: 'kim',
    userName: '김',
  }),
  row({
    sessionNo: 3n,
    userAgent: SAFARI_IPHONE,
    lastAccessAt: '2026-10-05T03:00:00.000Z',
    userId: 'lee',
    userName: '이',
  }),
]

/** 시간대와 무관한 표기 — 접근 이름 비교를 결정적으로 한다 */
const utc = (iso: string) => iso.slice(0, 16).replace('T', ' ')

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountTable(
  props: Record<string, unknown> = {},
  slots: Record<string, unknown> = {},
) {
  wrapper = mount(SessionTable as Component, {
    props: { sessions: ROWS, formatDate: utc, ...props },
    slots,
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const headers = () =>
  [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '')
const bodyRows = () => [...document.querySelectorAll('tbody tr')]
const buttonByLabel = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const buttonsByText = (text: string, root: ParentNode = document) =>
  [...root.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text)

describe('SessionTable — 열', () => {
  it('기본 열은 기기 · IP · 마지막 활동 · 만료 · 동작이다', async () => {
    await mountTable()
    expect(headers()).toEqual(['기기', 'IP', '마지막 활동', '만료', ''])
  })

  it('사용자 · 로그인 열을 켜고 IP · 만료 열을 끌 수 있다', async () => {
    await mountTable({ showUser: true, showLoginAt: true, showIp: false, showExpireAt: false })
    expect(headers()).toEqual(['사용자', '기기', '로그인', '마지막 활동', ''])
    expect(bodyRows()[0]?.textContent).toContain('김 (kim)')
  })

  it('기기 칸은 요약 · 현재 칩 · 원문, 원문이 없으면 "기기 정보 없음" 만', async () => {
    await mountTable({ sessions: [ROWS[0]!, row({ sessionNo: 9n, userAgent: null })] })
    const [current, unknown] = bodyRows()
    expect(current?.textContent).toContain('Chrome · Windows')
    expect(current?.textContent).toContain('이 기기')
    expect(current?.textContent).toContain(CHROME_WIN)
    expect(unknown?.textContent).toContain('기기 정보 없음')
    expect(unknown?.textContent).not.toContain('이 기기')
  })

  it('IP 가 없으면 - 를 보인다', async () => {
    await mountTable({ sessions: [row({ ipAddress: null })] })
    expect(bodyRows()[0]?.querySelectorAll('td')[1]?.textContent?.trim()).toBe('-')
  })

  it('formatDate 를 안 주면 브라우저 현지 시각 YYYY-MM-DD HH:mm, 틀린 값은 원문 그대로', () => {
    const date = new Date('2026-10-05T01:02:00.000Z')
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(formatDateTime('2026-10-05T01:02:00.000Z')).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    )
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })
})

describe('SessionTable — 동작', () => {
  it('🔴 현재 세션 행에는 끝내기가 없고 로그아웃 안내를 보인다', async () => {
    await mountTable()
    const current = bodyRows()[0]!
    expect(buttonsByText('끝내기', current)).toHaveLength(0)
    expect(current.textContent).toContain('이 기기는 로그아웃으로 끝냅니다.')
    expect(buttonsByText('끝내기')).toHaveLength(2)
  })

  it('🔴 요약이 같은 행은 접근 이름(마지막 활동 시각)으로 구분되고, 누르면 그 행으로 revoke 를 낸다', async () => {
    const w = await mountTable()
    const second = buttonByLabel('Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 02:00)')
    const third = buttonByLabel('Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 03:00)')
    expect(second).not.toBeNull()
    expect(third).not.toBeNull()
    third!.click()
    await flushPromises()
    expect(w.emitted('revoke')).toEqual([[ROWS[2]]])
  })

  it('사용자 열이 보이면 접근 이름 앞에 이름이 붙는다', async () => {
    await mountTable({ showUser: true })
    expect(
      buttonByLabel('이 · Safari · iOS 세션 끝내기 (마지막 활동 2026-10-05 03:00)'),
    ).not.toBeNull()
  })

  it('canRevokeUser 면 현재 행을 포함해 모든 행에 "사용자 전체 끊기" 가 있고 revokeUser 를 낸다', async () => {
    const w = await mountTable({ canRevokeUser: true })
    expect(buttonsByText('사용자 전체 끊기')).toHaveLength(3)
    buttonByLabel('김(kim) 사용자 전체 끊기')!.click()
    await flushPromises()
    expect(w.emitted('revokeUser')).toEqual([[ROWS[0]]])
  })

  it('canRevoke 가 거짓이면 끝내기 버튼이 없다', async () => {
    await mountTable({ canRevoke: false })
    expect(buttonsByText('끝내기')).toHaveLength(0)
  })

  it('busy 동안 동작 버튼이 모두 잠긴다', async () => {
    await mountTable({ busy: true, canRevokeUser: true })
    const buttons = [...buttonsByText('끝내기'), ...buttonsByText('사용자 전체 끊기')]
    expect(buttons.length).toBe(5)
    expect(buttons.every((button) => button.disabled)).toBe(true)
  })
})

describe('SessionTable — 빈 목록 · 두 모드', () => {
  it('빈 목록은 emptyText, #no-data 슬롯이 있으면 그것', async () => {
    await mountTable({ sessions: [] })
    expect(document.body.textContent).toContain('로그인된 세션이 없습니다.')
    wrapper?.unmount()
    await mountTable({ sessions: [], emptyText: '세션 없음' })
    expect(document.body.textContent).toContain('세션 없음')
    wrapper?.unmount()
    await mountTable({ sessions: [] }, { 'no-data': () => h('p', '슬롯 문구') })
    expect(document.body.textContent).toContain('슬롯 문구')
  })

  it('전량 모드(itemsLength 없음)는 쪽 이동 없이 행을 전부 그린다', async () => {
    const many = Array.from({ length: 25 }, (_, i) => row({ sessionNo: BigInt(i + 1) }))
    await mountTable({ sessions: many })
    expect(document.querySelector('.v-data-table-footer')).toBeNull()
    expect(bodyRows()).toHaveLength(25)
  })

  it('서버 페이징 모드(itemsLength 있음)는 쪽 이동을 보이고 쪽 모델을 낸다', async () => {
    const w = await mountTable({ itemsLength: 45, page: 1, itemsPerPage: 20 })
    expect(document.querySelector('.v-data-table-footer')).not.toBeNull()
    w.findComponent(VDataTableServer).vm.$emit('update:page', 2)
    await flushPromises()
    expect(w.emitted('update:page')?.at(-1)).toEqual([2])
  })
})
