// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, type Component } from 'vue'
import { ApiError } from '../../api/error.js'
import {
  buttonByText,
  installIntersectionObserver,
  installVisualViewport,
  vuetify,
} from '../../test/setup.js'
import TeamUserList from './TeamUserList.vue'
import type { TeamUserPage, TeamUserQuery, TeamUserRow } from './team-user-list.js'

// 정본: hangang-home apps/admin/src/components/org/team-user-list.render.test.ts(팀 없으면 조회 안 함 · ID 검색은 제출 때만 ·
//       하위 팀 포함 · 팀 바뀌면 선택 해제 · 실패 문구 · reload · 응답 경합)에 쪽 나눔(3d ⑧)을 더했다.

installVisualViewport()

interface Member extends TeamUserRow {
  roleName: string
}

const member = (userNo: number, userName: string, roleName = '사원'): Member => ({
  userNo: BigInt(userNo),
  userId: `user${userNo}`,
  userName,
  roleName,
})
const many = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => member(from + i, `사람${from + i}`))
const page = (items: Member[], total: number | bigint): TeamUserPage<Member> => ({ items, total })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let wrapper: VueWrapper | null = null
let io: ReturnType<typeof installIntersectionObserver>

beforeEach(() => {
  io = installIntersectionObserver()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  io.restore()
  vi.restoreAllMocks()
})

async function setup(props: Record<string, unknown>, slots: Record<string, unknown> = {}) {
  wrapper = mount(TeamUserList as unknown as Component, {
    attachTo: document.body,
    props: { teamNo: 2n, ...props },
    slots,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

const text = () => document.body.textContent ?? ''
const rowNames = () =>
  [...document.querySelectorAll('.v-list-item-title')].map((e) => (e.textContent ?? '').trim())
const lastQuery = (load: { mock: { lastCall?: unknown[] } }) =>
  load.mock.lastCall![0] as TeamUserQuery
const moreButton = () =>
  [...document.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes('더 불러오기'),
  )
const apiError = (status: number) =>
  new ApiError('서버 오류', {
    status,
    code: status === 403 ? 'ERR_COMMON_FORBIDDEN' : 'ERR_COMMON_INTERNAL',
    raw: null,
  })

/** pageSize 2 · total 5 인 팀 — 1쪽 [1,2] · 2쪽 [3,4] · 3쪽 [5] */
const pagedLoad = () =>
  vi.fn(async (q: TeamUserQuery) => {
    const all = many(1, 5)
    const start = (q.page - 1) * q.itemsPerPage
    return page(all.slice(start, start + q.itemsPerPage), 5)
  })

describe('TeamUserList — 조회 조건', () => {
  it('팀이 없으면 조회하지 않고 안내하며, 하위 팀 포함이 잠긴다', async () => {
    const load = vi.fn()
    await setup({ teamNo: null, load })
    expect(load).not.toHaveBeenCalled()
    expect(text()).toContain('팀을 고르면 인원이 보입니다.')
    expect(document.querySelector<HTMLInputElement>('input[name="recursive"]')!.disabled).toBe(true)
  })

  it('팀을 받으면 첫 쪽을 조회하고, 위에는 총계만 보인다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준', '팀장'), member(2, '이서연')], 2))
    await setup({ load })
    expect(lastQuery(load)).toStrictEqual({
      teamNo: 2n,
      recursive: false,
      page: 1,
      itemsPerPage: 100,
    })
    expect(rowNames()).toEqual(['김민준', '이서연'])
    expect(text()).toContain('user1')
    expect(text()).toContain('총 2명')
  })

  it('pageSize 를 itemsPerPage 로 보낸다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load, pageSize: 20 })
    expect(lastQuery(load).itemsPerPage).toBe(20)
  })

  it('하위 팀 포함을 켜면 recursive: true 로 첫 쪽부터 다시', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="recursive"]').setValue(true)
    await flushPromises()
    expect(lastQuery(load)).toMatchObject({ recursive: true, page: 1 })
  })

  it('검색은 제출할 때만 — 비우고 제출하면 keyword 를 싣지 않는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="userId"]').setValue('user1')
    expect(load).toHaveBeenCalledTimes(1)
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(lastQuery(load).keyword).toBe('user1')
    await wrapper!.find('input[name="userId"]').setValue('')
    await wrapper!.find('form').trigger('submit')
    await flushPromises()
    expect(lastQuery(load)).not.toHaveProperty('keyword')
  })

  it('🔴 칸에 쳐 두고 제출 안 한 글자는 쓰지 않는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="userId"]').setValue('kim')
    await wrapper!.find('form').trigger('submit')
    await wrapper!.find('input[name="userId"]').setValue('lee')
    await wrapper!.find('input[name="recursive"]').setValue(true)
    await flushPromises()
    expect(lastQuery(load).keyword).toBe('kim')
  })

  it('팀을 바꿔도 하위 팀 포함 · 적용된 검색어는 남는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    await wrapper!.find('input[name="recursive"]').setValue(true)
    await wrapper!.find('input[name="userId"]').setValue('kim')
    await wrapper!.find('form').trigger('submit')
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    expect(lastQuery(load)).toStrictEqual({
      teamNo: 3n,
      recursive: true,
      keyword: 'kim',
      page: 1,
      itemsPerPage: 100,
    })
  })
})

describe('TeamUserList — 고르기 · 슬롯', () => {
  it('팀이 실제로 바뀌면 고른 사람을 해제한다 — 처음 마운트는 아니다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준')], 1))
    await setup({ load, modelValue: 1n })
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[null]])
  })

  it('🔴 팀이 바뀌면 새 목록이 오기 전에 앞 팀의 행을 치운다 — 다른 팀 사람을 고를 수 없게', async () => {
    const next = deferred<TeamUserPage<Member>>()
    const load = vi.fn((q: TeamUserQuery) =>
      q.teamNo === 2n ? Promise.resolve(page([member(1, '김민준')], 1)) : next.promise,
    )
    await setup({ load })
    expect(rowNames()).toEqual(['김민준'])
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    expect(rowNames()).toEqual([])
    next.resolve(page([member(9, '다른팀')], 1))
    await flushPromises()
    expect(rowNames()).toEqual(['다른팀'])
  })

  it('행을 누르면 고르고, 고른 행이 표시된다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준'), member(2, '이서연')], 2))
    await setup({ load })
    const row = [...document.querySelectorAll<HTMLElement>('.v-list-item')].find((e) =>
      (e.textContent ?? '').includes('이서연'),
    )!
    row.click()
    await flushPromises()
    expect(wrapper!.emitted('update:modelValue')).toEqual([[2n]])
    await wrapper!.setProps({ modelValue: 2n })
    expect(document.querySelector('.v-list-item--active')?.textContent).toContain('이서연')
  })

  it('#item 슬롯으로 행 모양을 바꾼다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준', '팀장')], 1))
    await setup(
      { load },
      {
        item: ({ item }: { item: Member }) =>
          h('span', { class: 'custom' }, `${item.userName} · ${item.roleName}`),
      },
    )
    expect([...document.querySelectorAll('.custom')].map((e) => e.textContent)).toEqual([
      '김민준 · 팀장',
    ])
  })
})

describe('TeamUserList — 쪽 나눔(스크롤하면 더)', () => {
  it('총계만 보인다 — 받은 수는 보이지 않는다', async () => {
    const load = vi.fn(async () => page(many(1, 100), 130))
    await setup({ load })
    expect(text()).toContain('총 130명')
    expect(text()).not.toContain('100명')
  })

  it('목록 끝 버튼에 남은 수 — 누르면 다음 쪽을 이어 붙인다', async () => {
    const load = pagedLoad()
    await setup({ load, pageSize: 2 })
    expect(moreButton()!.textContent).toContain('더 불러오기(3명 남음)')
    moreButton()!.click()
    await flushPromises()
    expect(lastQuery(load)).toMatchObject({ page: 2, itemsPerPage: 2 })
    expect(rowNames()).toHaveLength(4)
    expect(moreButton()!.textContent).toContain('더 불러오기(1명 남음)')
  })

  it('🔴 목록은 스스로 스크롤 상자가 되지 않는다 — 스크롤은 목록 칸 한 곳(관찰 기준)에서(브라우저 확인 T14)', async () => {
    // VList 는 Vuetify 기본 overflow: auto 다. 목록 칸(PanelLayout 안쪽, 세로 flex) 안에서 줄어들면 VList 가 따로
    // 스크롤해 끝 버튼이 처음부터 보이고, 스크롤하기 전에 다음 쪽을 다 부른다. happy-dom 은 레이아웃을 못 재므로
    // 그 규칙을 지닌 클래스가 붙었는지만 잰다 — 실제 동작은 브라우저에서 요청 수로 확인했다.
    await setup({ load: vi.fn(async () => page(many(1, 2), 5)), pageSize: 2 })
    const list = document.querySelector('.team-user-list .v-list')
    expect(list?.classList.contains('team-user-list__list')).toBe(true)
    expect(list?.closest('.panel-layout__content-inner')).not.toBeNull()
  })

  it('목록 끝이 화면에 들어오면 저절로 다음 쪽', async () => {
    const load = pagedLoad()
    await setup({ load, pageSize: 2 })
    io.reveal()
    await flushPromises()
    expect(lastQuery(load).page).toBe(2)
    io.reveal()
    await flushPromises()
    expect(lastQuery(load).page).toBe(3)
    expect(rowNames()).toHaveLength(5)
    expect(moreButton()).toBeUndefined()
  })

  it('다 받으면 끝 — total 이 틀려도 덜 찬 쪽이 오면 더 부르지 않는다', async () => {
    const load = vi.fn(async (q: TeamUserQuery) =>
      q.page === 1 ? page(many(1, 2), 10) : page(many(3, 1), 10),
    )
    await setup({ load, pageSize: 2 })
    moreButton()!.click()
    await flushPromises()
    expect(rowNames()).toHaveLength(3)
    expect(moreButton()).toBeUndefined()
    io.reveal()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('쪽 사이에 같은 사람이 다시 오면 한 번만 보인다', async () => {
    const load = vi.fn(async (q: TeamUserQuery) =>
      q.page === 1 ? page(many(1, 2), 4) : page(many(2, 2), 4),
    )
    await setup({ load, pageSize: 2 })
    moreButton()!.click()
    await flushPromises()
    expect(rowNames()).toEqual(['사람1', '사람2', '사람3'])
  })

  it('🔴 다음 쪽을 기다리는 사이 팀이 바뀌면 그 응답을 버린다', async () => {
    const second = deferred<TeamUserPage<Member>>()
    const load = vi.fn((q: TeamUserQuery) => {
      if (q.teamNo === 3n) return Promise.resolve(page([member(9, '다른팀')], 1))
      return q.page === 1 ? Promise.resolve(page(many(1, 2), 5)) : second.promise
    })
    await setup({ load, pageSize: 2 })
    moreButton()!.click()
    await flushPromises()
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    second.resolve(page(many(3, 2), 5))
    await flushPromises()
    expect(rowNames()).toEqual(['다른팀'])
  })

  it('다음 쪽이 실패하면 받은 사람은 두고 다시 시도 — 그때까지 자동 불러오기는 멈춘다', async () => {
    let fail = true
    const failure = apiError(500)
    const load = vi.fn(async (q: TeamUserQuery) => {
      if (q.page === 2 && fail) throw failure
      const all = many(1, 5)
      const start = (q.page - 1) * q.itemsPerPage
      return page(all.slice(start, start + q.itemsPerPage), 5)
    })
    await setup({ load, pageSize: 2 })
    io.reveal()
    await flushPromises()
    expect(failure.handled).toBe(true)
    expect(text()).toContain('더 불러오지 못했습니다.')
    expect(rowNames()).toHaveLength(2)
    io.reveal()
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
    fail = false
    buttonByText('다시 시도')!.click()
    await flushPromises()
    expect(rowNames()).toHaveLength(4)
  })

  it('total 이 bigint 여도 숫자로 센다', async () => {
    const load = vi.fn(async () => page([member(1, '김민준')], 7n))
    await setup({ load, pageSize: 1 })
    expect(text()).toContain('총 7명')
    expect(moreButton()!.textContent).toContain('6명 남음')
  })
})

describe('TeamUserList — 실패 · 경합 · reload', () => {
  it('첫 쪽이 실패하면 목록을 비우고 문구 + 다시 시도 — 토스트와 겹치지 않게 handled', async () => {
    const error = apiError(500)
    const load = vi
      .fn()
      .mockResolvedValueOnce(page([member(1, '김민준')], 1))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(page([member(1, '김민준')], 1))
    await setup({ load })
    await (wrapper!.vm as unknown as { reload(): Promise<void> }).reload()
    await flushPromises()
    expect(rowNames()).toEqual([])
    expect(text()).toContain('인원을 불러오지 못했습니다.')
    expect(error.handled).toBe(true)
    buttonByText('다시 시도')!.click()
    await flushPromises()
    expect(rowNames()).toEqual(['김민준'])
  })

  it('403 이면 권한 문구 — 다시 시도는 없다', async () => {
    const load = vi.fn(async () => {
      throw apiError(403)
    })
    await setup({ load })
    expect(text()).toContain(
      '이 팀의 인원을 볼 권한이 없습니다. 권한을 가진 관리자에게 요청하세요.',
    )
    expect(buttonByText('다시 시도')).toBeUndefined()
  })

  it('🔴 늦게 온 첫 쪽 응답은 버린다', async () => {
    const first = deferred<TeamUserPage<Member>>()
    const load = vi.fn((q: TeamUserQuery) =>
      q.teamNo === 2n ? first.promise : Promise.resolve(page([member(9, '다른팀')], 1)),
    )
    await setup({ load })
    await wrapper!.setProps({ teamNo: 3n })
    await flushPromises()
    first.resolve(page([member(1, '김민준')], 1))
    await flushPromises()
    expect(rowNames()).toEqual(['다른팀'])
  })

  it('reload() 는 같은 조건으로 첫 쪽부터 — 팀이 없으면 부르지 않는다', async () => {
    const load = vi.fn(async () => page([], 0))
    await setup({ load })
    const vm = wrapper!.vm as unknown as { reload(): Promise<void> }
    await vm.reload()
    expect(load).toHaveBeenCalledTimes(2)
    expect(lastQuery(load)).toMatchObject({ teamNo: 2n, page: 1 })
    await wrapper!.setProps({ teamNo: null })
    await flushPromises()
    await vm.reload()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
