// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import AdminConfirm from '../confirm/AdminConfirm.vue'
import { createConfirm } from '../confirm/confirm.js'
import { buttonByText, installVisualViewport, vuetify } from '../test/setup.js'
import { useDirtyGuard } from './useDirtyGuard.js'

installVisualViewport()

const mounted: { unmount: () => void }[] = []

/** README 최소 배선처럼 App 에 RouterView 와 `<AdminConfirm />` 을 함께 둔다 */
async function setupWithKitDialog(options?: { message?: string }) {
  const dirty = ref(false)
  const Form = defineComponent({
    setup() {
      useDirtyGuard(() => dirty.value, options)
      return () => h('div', 'form')
    },
  })
  const Other = defineComponent({ render: () => h('div', 'other') })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form', component: Form },
      { path: '/other', component: Other },
    ],
  })
  await router.push('/form')
  await router.isReady()
  const confirm = createConfirm()
  const wrapper = mount(
    defineComponent({ render: () => h('div', [h(RouterView), h(AdminConfirm as Component)]) }),
    { attachTo: document.body, global: { plugins: [router, vuetify, confirm] } },
  )
  await flushPromises()
  mounted.push(wrapper)
  return { dirty, router }
}

const dialog = () => document.querySelector<HTMLElement>('.v-overlay--active')

async function setup(options?: { message?: string }) {
  const dirty = ref(false)
  const Form = defineComponent({
    setup() {
      useDirtyGuard(() => dirty.value, options)
      return () => h('div', 'form')
    },
  })
  const Other = defineComponent({ render: () => h('div', 'other') })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form', component: Form },
      { path: '/other', component: Other },
    ],
  })
  await router.push('/form')
  await router.isReady()
  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  mounted.push(wrapper)
  return { dirty, router, wrapper }
}

function fireUnload() {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
  window.dispatchEvent(event)
  return event
}

describe('useDirtyGuard', () => {
  // 🔴 happy-dom 에 window.confirm 이 없다 — spyOn 이 되도록 먼저 심고, 끝나면 되돌린다.
  const original = window.confirm
  beforeEach(() => {
    window.confirm = () => true
  })
  afterEach(() => {
    // 이전 테스트의 beforeunload 리스너가 남으면 다음 테스트를 오염시킨다.
    mounted.splice(0).forEach((w) => w.unmount())
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    window.confirm = original
  })

  it('🔴 킷 확인 창이 있으면 그것으로 묻는다 — 머물기면 그대로, 브라우저 기본 창은 쓰지 않는다', async () => {
    const native = vi.spyOn(window, 'confirm')
    const { dirty, router } = await setupWithKitDialog()
    dirty.value = true
    const navigation = router.push('/other')
    await flushPromises()
    const text = dialog()?.textContent ?? ''
    expect(text).toContain('화면 떠나기')
    expect(text).toContain('저장하지 않은 변경 사항이 있습니다. 이 화면을 벗어나시겠습니까?')
    buttonByText('머물기', dialog()!)!.click()
    await navigation
    expect(router.currentRoute.value.path).toBe('/form')
    expect(native).not.toHaveBeenCalled()
  })

  it('킷 확인 창에서 떠나기면 이동한다 — 문구는 옵션 그대로', async () => {
    const { dirty, router } = await setupWithKitDialog({ message: '고친 역할이 있습니다.' })
    dirty.value = true
    const navigation = router.push('/other')
    await flushPromises()
    expect(dialog()?.textContent).toContain('고친 역할이 있습니다.')
    buttonByText('떠나기', dialog()!)!.click()
    await navigation
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('dirty + confirm false 면 이동을 막는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { dirty, router } = await setup()
    dirty.value = true
    await router.push('/other')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/form')
  })

  it('dirty + confirm true 면 이동을 허용한다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { dirty, router } = await setup()
    dirty.value = true
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('dirty 가 아니면 confirm 을 묻지 않는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { router } = await setup()
    await router.push('/other')
    expect(confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('기본 문구는 gise 의 한국어 문구이고 옵션으로 바꾼다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const first = await setup()
    first.dirty.value = true
    await first.router.push('/other')
    expect(confirm).toHaveBeenLastCalledWith(
      '저장하지 않은 변경 사항이 있습니다. 이 화면을 벗어나시겠습니까?',
    )
    first.wrapper.unmount()

    const second = await setup({ message: 'Discard changes?' })
    second.dirty.value = true
    await second.router.push('/other')
    expect(confirm).toHaveBeenLastCalledWith('Discard changes?')
    second.wrapper.unmount()
  })

  it('beforeunload 는 dirty 일 때만 preventDefault · returnValue 를 건다', async () => {
    const { dirty, wrapper } = await setup()
    const clean = fireUnload()
    expect(clean.defaultPrevented).toBe(false)

    dirty.value = true
    const event = fireUnload()
    expect(event.defaultPrevented).toBe(true)
    expect(event.returnValue).toBe('')
    wrapper.unmount()
  })

  it('언마운트하면 beforeunload 리스너를 뗀다', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { dirty, wrapper } = await setup()
    const added = add.mock.calls.find(([type]) => type === 'beforeunload')
    expect(added).toBeDefined()

    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('beforeunload', added![1])

    dirty.value = true
    expect(fireUnload().defaultPrevented).toBe(false)
  })
})
