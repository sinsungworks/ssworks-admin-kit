// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { installVisualViewport, vuetify } from '../test/setup.js'
import AdminToast from './AdminToast.vue'
import { createToast, DEFAULT_TOAST_TIMEOUT_MS, useToast } from './toast.js'

// VSnackbar 는 오버레이다 — VDialog 와 같은 전제.
installVisualViewport()

describe('createToast — 앱 하나에 상태 하나', () => {
  it('색별 timeout 과 메시지를 상태에 싣는다', () => {
    const toast = createToast()
    toast.error('실패했습니다')
    expect(toast.state).toMatchObject({
      show: true,
      message: '실패했습니다',
      color: 'error',
      timeout: DEFAULT_TOAST_TIMEOUT_MS.error,
    })
    toast.dismiss()
    expect(toast.state.show).toBe(false)
  })

  it('timeouts 를 덮어쓸 수 있다', () => {
    const toast = createToast({ timeouts: { success: 1000 } })
    toast.success('저장됨')
    expect(toast.state.timeout).toBe(1000)
    toast.info('안내')
    expect(toast.state.timeout).toBe(DEFAULT_TOAST_TIMEOUT_MS.info)
  })

  it('🔴 인스턴스가 둘이면 상태도 둘이다 — 모듈 싱글턴이 아니다', () => {
    const a = createToast()
    const b = createToast()
    a.warning('a')
    expect(b.state.show).toBe(false)
  })
})

describe('useToast / AdminToast — provide/inject', () => {
  const Consumer = defineComponent({
    setup() {
      const toast = useToast()
      return () => h('button', { onClick: () => toast.success('완료') }, '알림')
    },
  })

  it('컴포넌트가 inject 로 받고, AdminToast 가 같은 상태를 그린다', async () => {
    const toast = createToast()
    const w = mount(
      defineComponent({
        components: { Consumer, AdminToast },
        template: '<div><Consumer /><AdminToast /></div>',
      }),
      { global: { plugins: [vuetify, toast] }, attachTo: document.body },
    )
    await w.get('button').trigger('click')
    expect(toast.state.message).toBe('완료')
    expect(w.findComponent(AdminToast).exists()).toBe(true)
    w.unmount()
    document.body.innerHTML = ''
  })

  it('🔴 플러그인 없이 useToast 를 부르면 던진다 — 조용히 아무 표시도 안 하는 상태를 막는다', () => {
    expect(() => mount(Consumer, { global: { plugins: [vuetify] } })).toThrow(/createToast/)
  })
})

describe('AdminToast — 표시 시간(브라우저 확인 P9)', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  /** 실제 VSnackbar 의 타이머를 가짜 시계로 돌린다 */
  async function setup() {
    vi.useFakeTimers()
    const toast = createToast()
    wrapper = mount(AdminToast, { global: { plugins: [vuetify, toast] }, attachTo: document.body })
    await ticks()
    return toast
  }

  async function ticks() {
    for (let i = 0; i < 5; i += 1) await nextTick()
  }

  async function elapse(ms: number) {
    vi.advanceTimersByTime(ms)
    await ticks()
  }

  it('하나만 띄우면 색별 시간 뒤 닫힌다', async () => {
    const toast = await setup()
    toast.error('실패')
    await ticks()
    await elapse(5900)
    expect(toast.state.show).toBe(true)
    await elapse(200)
    expect(toast.state.show).toBe(false)
  })

  it('🔴 떠 있는 동안 새 토스트를 띄우면 시간을 처음부터 다시 센다 — 두 번째 오류도 6초', async () => {
    const toast = await setup()
    toast.error('오류 A')
    await ticks()
    await elapse(4000)
    toast.error('오류 B')
    await ticks()
    await elapse(5000)
    expect(toast.state.show, '두 번째가 2초 만에 닫히면 안 된다').toBe(true)
    expect(toast.state.message).toBe('오류 B')
    await elapse(1100)
    expect(toast.state.show).toBe(false)
  })

  it('🔴 같은 문구를 다시 띄워도 처음부터 다시 센다', async () => {
    const toast = await setup()
    toast.success('저장했습니다.')
    await ticks()
    await elapse(2500)
    toast.success('저장했습니다.')
    await ticks()
    await elapse(2500)
    expect(toast.state.show).toBe(true)
  })

  it('다시 열리기를 기다리는 사이 dismiss 하면 다시 열리지 않는다', async () => {
    const toast = await setup()
    toast.info('안내 A')
    await ticks()
    toast.info('안내 B')
    toast.dismiss()
    await ticks()
    expect(toast.state.show).toBe(false)
  })
})
