// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { ApiError } from '../api/error.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import ReauthDialog from '../components/common/ReauthDialog.vue'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import { useWriteFlow, type WriteFlow } from './useWriteFlow.js'

// 정본: hangang-home users.vue `onReauthConfirm` 의 규칙(재인증 실패에 다이얼로그 유지 · 비밀번호 1회
//       전달)과 gise 의 revision 충돌 · 필드 오류를, 실제 다이얼로그에 v-bind 로 붙여 못박는다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(): Promise<WriteFlow> {
  let flow!: WriteFlow
  wrapper = mount(
    defineComponent({
      setup() {
        flow = useWriteFlow()
        return () =>
          h('div', [
            h(ConfirmDialog as Component, flow.confirmDialog.value),
            h(ReauthDialog as Component, flow.reauthDialog.value),
          ])
      },
    }),
    { attachTo: document.body, global: { plugins: [vuetify] } },
  )
  await flushPromises()
  return flow
}

const apiError = (code: string, details?: unknown) =>
  new ApiError(code, { status: 400, code, details, raw: null })

function passwordInput(): HTMLInputElement | null {
  return document.body.querySelector('input[name="currentPassword"]')
}

/** `.value` 대입만으로는 `v-model` 이 안 먹는다 — `input` 이벤트를 손으로 낸다. */
async function typePassword(value: string) {
  const input = passwordInput()
  expect(input, '가드 — 재인증 다이얼로그가 열려 있다').not.toBeNull()
  input!.value = value
  input!.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function click(text: string) {
  const button = buttonByText(text)
  expect(button, `가드 — "${text}" 버튼이 있다`).toBeTruthy()
  button!.click()
  await flushPromises()
}

describe('useWriteFlow — 관문', () => {
  it("gate 'none' 은 바로 실행하고 onSuccess(result) 뒤 true", async () => {
    const flow = await setup()
    const onSuccess = vi.fn()
    expect(await flow.run({ action: async () => 7, onSuccess })).toBe(true)
    expect(onSuccess).toHaveBeenCalledWith(7)
    expect(flow.submitting.value).toBe(false)
  })

  it('실행 중에는 submitting 이고, 그동안의 run() 은 바로 false', async () => {
    const flow = await setup()
    let release!: () => void
    const first = flow.run({ action: () => new Promise<void>((resolve) => (release = resolve)) })
    await flushPromises()
    expect(flow.submitting.value).toBe(true)
    expect(await flow.run({ action: async () => 1 })).toBe(false)
    release()
    expect(await first).toBe(true)
  })

  it("gate 'confirm' 은 ConfirmDialog 를 열고, 확인을 누르면 실행한다", async () => {
    const flow = await setup()
    const action = vi.fn(async () => undefined)
    const pending = flow.run({
      gate: 'confirm',
      reversible: false,
      message: '세션을 끊습니다.',
      action,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('세션을 끊습니다.')
    expect(action).not.toHaveBeenCalled()
    await click('확인')
    expect(await pending).toBe(true)
    expect(action).toHaveBeenCalledTimes(1)
    expect(flow.confirmDialog.value.modelValue).toBe(false)
  })

  it('취소하면 실행하지 않고 false', async () => {
    const flow = await setup()
    const action = vi.fn(async () => undefined)
    const pending = flow.run({ gate: 'confirm', reversible: true, message: '저장합니다.', action })
    await flushPromises()
    await click('취소')
    expect(await pending).toBe(false)
    expect(action).not.toHaveBeenCalled()
  })

  it("🔴 gate 'reauth' 는 입력한 비밀번호를 action 에 한 번 전달하고 바인딩에 남기지 않는다", async () => {
    const flow = await setup()
    const action = vi.fn(async (_ctx: { currentPassword: string }) => undefined)
    const pending = flow.run({ gate: 'reauth', message: '계정을 퇴사 처리합니다.', action })
    await flushPromises()
    await typePassword('my-secret')
    await click('확인')
    expect(await pending).toBe(true)
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith({ currentPassword: 'my-secret' })
    expect(JSON.stringify(flow.reauthDialog.value)).not.toContain('my-secret')
  })

  it('🔴 실행 중에는 ConfirmDialog 확인 버튼이 disabled — :loading 만으로는 클릭이 안 막힌다', async () => {
    const flow = await setup()
    let release!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const pending = flow.run({ gate: 'confirm', reversible: true, message: '저장합니다.', action })
    await flushPromises()
    await click('확인')
    expect(buttonByText('확인')?.disabled).toBe(true)
    buttonByText('확인')?.click()
    await flushPromises()
    expect(action).toHaveBeenCalledTimes(1)
    release()
    expect(await pending).toBe(true)
  })

  it('실행 중에 다이얼로그를 닫으면 요청 결과를 기다려 끝난다 — 섣불리 false 가 아니다', async () => {
    const flow = await setup()
    let release!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const pending = flow.run({ gate: 'confirm', reversible: true, message: '저장합니다.', action })
    await flushPromises()
    await click('확인')
    flow.confirmDialog.value['onUpdate:modelValue'](false)
    await flushPromises()
    expect(flow.confirmDialog.value.modelValue).toBe(false)
    release()
    expect(await pending).toBe(true)
  })
})

describe('useWriteFlow — 결과 분류', () => {
  it('🔴 재인증 실패는 다이얼로그를 연 채 안에 문구를 보이고 handled — 다시 입력하면 이어서 성공', async () => {
    const flow = await setup()
    const failure = new ApiError('현재 비밀번호가 올바르지 않습니다', {
      status: 403,
      code: 'ERR_REAUTH_REQUIRED',
      raw: null,
    })
    const action = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined)
    const pending = flow.run({ gate: 'reauth', action })
    await flushPromises()
    await typePassword('wrong')
    await click('확인')
    expect(failure.handled).toBe(true)
    expect(flow.reauthDialog.value.modelValue).toBe(true)
    expect(document.body.textContent).toContain('현재 비밀번호가 올바르지 않습니다')
    await typePassword('right')
    await click('확인')
    expect(await pending).toBe(true)
    expect(action).toHaveBeenLastCalledWith({ currentPassword: 'right' })
  })

  it('검증 실패는 fieldErrors 를 채우고 handled, 다이얼로그를 닫고 false', async () => {
    const flow = await setup()
    const failure = apiError('ERR_COMMON_VALIDATION', {
      issues: [{ path: ['userId'], message: '이미 쓰는 아이디입니다' }],
    })
    const pending = flow.run({ gate: 'reauth', action: vi.fn().mockRejectedValue(failure) })
    await flushPromises()
    await typePassword('pw')
    await click('확인')
    expect(await pending).toBe(false)
    expect(flow.fieldErrors.value).toEqual({ userId: ['이미 쓰는 아이디입니다'] })
    expect(failure.handled).toBe(true)
    expect(flow.reauthDialog.value.modelValue).toBe(false)
  })

  it('필드로 바꿀 수 없는 검증 실패는 handled 가 아니다 — 전역 토스트가 알린다', async () => {
    const flow = await setup()
    const failure = apiError('ERR_COMMON_VALIDATION', { reason: 'x' })
    expect(await flow.run({ action: vi.fn().mockRejectedValue(failure) })).toBe(false)
    expect(failure.handled).toBe(false)
    expect(flow.fieldErrors.value).toEqual({})
  })

  it('다음 실행을 시작하면 fieldErrors 를 비운다', async () => {
    const flow = await setup()
    const failure = apiError('ERR_COMMON_VALIDATION', {
      issues: [{ path: ['userId'], message: 'm' }],
    })
    await flow.run({ action: vi.fn().mockRejectedValue(failure) })
    expect(flow.fieldErrors.value).not.toEqual({})
    let release!: () => void
    const next = flow.run({ action: () => new Promise<void>((resolve) => (release = resolve)) })
    await flushPromises()
    expect(flow.fieldErrors.value).toEqual({})
    release()
    await next
  })

  it('revision 충돌 — onConflict 가 있으면 부르고 handled, 없으면 handled 아님. 둘 다 false', async () => {
    const flow = await setup()
    const withHandler = apiError('ERR_COMMON_REVISION_CONFLICT')
    const onConflict = vi.fn()
    expect(await flow.run({ action: vi.fn().mockRejectedValue(withHandler), onConflict })).toBe(
      false,
    )
    expect(onConflict).toHaveBeenCalledWith(withHandler)
    expect(withHandler.handled).toBe(true)
    const without = apiError('ERR_COMMON_REVISION_CONFLICT')
    expect(await flow.run({ action: vi.fn().mockRejectedValue(without) })).toBe(false)
    expect(without.handled).toBe(false)
  })

  it('그 밖의 오류는 handled 가 아니다 — 재인증 관문이 아닌 쓰기의 ERR_REAUTH_REQUIRED 도', async () => {
    const flow = await setup()
    const internal = apiError('ERR_COMMON_INTERNAL')
    expect(await flow.run({ action: vi.fn().mockRejectedValue(internal) })).toBe(false)
    expect(internal.handled).toBe(false)
    const reauthOnConfirm = apiError('ERR_REAUTH_REQUIRED')
    const pending = flow.run({
      gate: 'confirm',
      reversible: true,
      message: '저장합니다.',
      action: vi.fn().mockRejectedValue(reauthOnConfirm),
    })
    await flushPromises()
    await click('확인')
    expect(await pending).toBe(false)
    expect(reauthOnConfirm.handled).toBe(false)
    expect(flow.confirmDialog.value.modelValue).toBe(false)
  })

  it('ApiError 가 아닌 예외는 다시 던진다 — 프로그래밍 오류를 삼키지 않고, 다음 실행은 막히지 않는다', async () => {
    const flow = await setup()
    const bug = new TypeError('x is undefined')
    await expect(flow.run({ action: vi.fn().mockRejectedValue(bug) })).rejects.toBe(bug)
    expect(flow.submitting.value).toBe(false)
    expect(await flow.run({ action: async () => 1 })).toBe(true)
  })
})

describe('useWriteFlow — 막히지 않는 흐름', () => {
  const stuck = Symbol('stuck')
  async function settledOrStuck<T>(promise: Promise<T>): Promise<T | typeof stuck> {
    await flushPromises()
    return Promise.race([promise, Promise.resolve(stuck)])
  }
  async function expectNextRunWorks(flow: WriteFlow) {
    expect(await settledOrStuck(flow.run({ action: async () => 1 }))).toBe(true)
  }

  it('🔴 처리 중에 재인증 다이얼로그를 닫은 뒤 ERR_REAUTH_REQUIRED 로 실패해도 false 로 끝나고 handled 가 아니다', async () => {
    const flow = await setup()
    const failure = apiError('ERR_REAUTH_REQUIRED')
    let fail!: (error: unknown) => void
    const action = vi.fn(() => new Promise<void>((_resolve, reject) => (fail = reject)))
    const pending = flow.run({ gate: 'reauth', action })
    await flushPromises()
    await typePassword('pw')
    await click('확인')
    flow.reauthDialog.value['onUpdate:modelValue'](false)
    await flushPromises()
    fail(failure)
    expect(await settledOrStuck(pending)).toBe(false)
    expect(failure.handled).toBe(false)
    expect(flow.reauthDialog.value.modelValue).toBe(false)
    await expectNextRunWorks(flow)
  })

  it('onSuccess 가 던지면 run() 이 그 오류로 reject 하고 다음 실행은 막히지 않는다', async () => {
    const flow = await setup()
    const boom = new Error('onSuccess boom')
    await expect(
      flow.run({
        action: async () => 1,
        onSuccess: () => {
          throw boom
        },
      }),
    ).rejects.toBe(boom)
    expect(flow.submitting.value).toBe(false)
    await expectNextRunWorks(flow)
  })

  it('onConflict 가 던지면 run() 이 그 오류로 reject 하고 다음 실행은 막히지 않는다', async () => {
    const flow = await setup()
    const boom = new Error('onConflict boom')
    const failure = apiError('ERR_COMMON_REVISION_CONFLICT')
    await expect(
      flow.run({
        action: vi.fn().mockRejectedValue(failure),
        onConflict: () => {
          throw boom
        },
      }),
    ).rejects.toBe(boom)
    await expectNextRunWorks(flow)
  })

  it('재인증 관문의 action 이 ApiError 가 아닌 예외를 던지면 reject, 다이얼로그는 닫히고 다음 실행은 막히지 않는다', async () => {
    const flow = await setup()
    const bug = new TypeError('x is undefined')
    const pending = flow.run({ gate: 'reauth', action: vi.fn().mockRejectedValue(bug) })
    const caught = pending.catch((error: unknown) => error)
    await flushPromises()
    await typePassword('pw')
    await click('확인')
    expect(await caught).toBe(bug)
    expect(flow.reauthDialog.value.modelValue).toBe(false)
    await expectNextRunWorks(flow)
  })

  it('재인증 실패 문구가 보이는 상태에서 취소하면 false 로 끝나고 다음 실행은 막히지 않는다', async () => {
    const flow = await setup()
    const failure = new ApiError('현재 비밀번호가 올바르지 않습니다', {
      status: 403,
      code: 'ERR_REAUTH_REQUIRED',
      raw: null,
    })
    const pending = flow.run({ gate: 'reauth', action: vi.fn().mockRejectedValue(failure) })
    await flushPromises()
    await typePassword('wrong')
    await click('확인')
    expect(document.body.textContent).toContain('현재 비밀번호가 올바르지 않습니다')
    await click('취소')
    expect(await settledOrStuck(pending)).toBe(false)
    await expectNextRunWorks(flow)
  })

  it('🔴 비동기 onConflict 가 끝날 때까지 submitting 은 true — 끝나면 false, 다음 실행이 된다', async () => {
    const flow = await setup()
    let finish!: () => void
    const onConflict = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const pending = flow.run({
      action: vi.fn().mockRejectedValue(apiError('ERR_COMMON_REVISION_CONFLICT')),
      onConflict,
    })
    await flushPromises()
    expect(onConflict).toHaveBeenCalledTimes(1)
    expect(flow.submitting.value).toBe(true)
    finish()
    expect(await settledOrStuck(pending)).toBe(false)
    expect(flow.submitting.value).toBe(false)
    await expectNextRunWorks(flow)
  })

  it('🔴 확인 관문이 열린 채 언마운트하면 대기 중인 run() 이 false 로 끝난다', async () => {
    const flow = await setup()
    const pending = flow.run({ gate: 'confirm', reversible: true, action: async () => 1 })
    await flushPromises()
    expect(flow.confirmDialog.value.modelValue).toBe(true)
    wrapper?.unmount()
    wrapper = null
    expect(await settledOrStuck(pending)).toBe(false)
  })
})
