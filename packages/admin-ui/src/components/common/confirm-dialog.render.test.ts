// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { buttonByText, installVisualViewport, vuetify } from '../../test/setup.js'
import ConfirmDialog from './ConfirmDialog.vue'

// 정본: hangang-home confirm-dialog.render.test.ts + gise 의 blockedReason 계약.
//
// 🔴 이 파일이 지키는 것은 문구 하나다 — 「되돌릴 수 있는지」. 되돌릴 수 없는 삭제가 「되돌릴 수
//    있습니다」로 안내되면 관리자는 그 문구를 믿고 누른다 — 증상은 삭제된 뒤에야 난다.

installVisualViewport()

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  // VDialog 는 오버레이를 문서로 텔레포트한다 — 지우지 않으면 다음 테스트가 앞 대화상자를 잡는다.
  document.body.innerHTML = ''
})

async function mountDialog(
  props: Partial<{
    reversible: boolean
    submitting: boolean
    title: string
    message: string
    confirmLabel: string
    blockedReason: string | null
  }> & { reversible: boolean },
): Promise<VueWrapper> {
  wrapper = mount(ConfirmDialog, {
    props: {
      modelValue: true,
      title: '게시글을 삭제합니다',
      message: '선택한 3건을 삭제합니다.',
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [vuetify] },
  })
  await flushPromises()
  return wrapper
}

describe('ConfirmDialog — 되돌릴 수 있는지를 문구에 적는다', () => {
  it('🔴 reversible=false 면 되돌릴 수 없다고 적는다', async () => {
    await mountDialog({ reversible: false })
    expect(document.body.textContent).toContain('되돌릴 수 없습니다')
  })

  // 양성 대조 — 「항상 되돌릴 수 없다고 적는다」는 구현을 배제한다.
  it('🔴 reversible=true 면 되돌릴 수 있다고 적고, 없다는 문장은 안 낸다', async () => {
    await mountDialog({ reversible: true })
    expect(document.body.textContent).toContain('되돌릴 수 있습니다')
    expect(document.body.textContent).not.toContain('되돌릴 수 없습니다')
  })

  it('제목과 본문이 그대로 붙는다', async () => {
    await mountDialog({ reversible: false })
    expect(document.body.textContent).toContain('게시글을 삭제합니다')
    expect(document.body.textContent).toContain('선택한 3건을 삭제합니다.')
  })
})

describe('ConfirmDialog — 확인은 제출 중 다시 안 눌린다', () => {
  it('🔴 submitting 중에 확인이 disabled 다 — :loading 은 클릭을 안 막는다', async () => {
    await mountDialog({ reversible: false, submitting: true })
    const btn = buttonByText('확인')
    expect(btn, '가드 — 확인 버튼을 찾았다').toBeTruthy()
    expect(btn!.hasAttribute('disabled')).toBe(true)
  })

  it('🔴 제출 중이 아니면 확인이 열린다', async () => {
    await mountDialog({ reversible: false })
    expect(buttonByText('확인')!.hasAttribute('disabled')).toBe(false)
  })

  it('확인을 누르면 confirm 이 나간다', async () => {
    const w = await mountDialog({ reversible: false })
    buttonByText('확인')!.click()
    await flushPromises()
    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('취소를 누르면 닫힘을 부모에게 알린다', async () => {
    const w = await mountDialog({ reversible: false })
    buttonByText('취소')!.click()
    await flushPromises()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('confirmLabel 로 확인 문구를 바꿀 수 있다', async () => {
    await mountDialog({ reversible: false, confirmLabel: '삭제' })
    expect(buttonByText('삭제')).toBeTruthy()
    expect(buttonByText('확인')).toBeUndefined()
  })
})

describe('ConfirmDialog — blockedReason 이면 확정 버튼이 없다 (gise)', () => {
  // 🔴 비활성이 아니라 **없다**. 비활성 버튼을 남겨 두면 "권한이 없나" 를 의심하며 계속 시도한다.
  it('🔴 사유를 보이고 확정 버튼을 그리지 않으며 취소가 「닫기」가 된다', async () => {
    await mountDialog({
      reversible: false,
      blockedReason: '다른 글이 참조 중이라 지울 수 없습니다',
    })
    expect(document.body.textContent).toContain('다른 글이 참조 중이라 지울 수 없습니다')
    expect(document.body.textContent).not.toContain('선택한 3건을 삭제합니다.')
    expect(buttonByText('확인')).toBeUndefined()
    expect(buttonByText('닫기')).toBeTruthy()
  })
})
