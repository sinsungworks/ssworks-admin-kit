// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
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
