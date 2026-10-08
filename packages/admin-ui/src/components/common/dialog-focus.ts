import { nextTick, watch, type Ref } from 'vue'

/**
 * 킷 대화상자의 포커스 — 열면 첫 칸(주면)으로, 닫히면 열 때 포커스가 있던 곳(보통 연 버튼)으로 돌려준다.
 * 패키지 내부용(index 로 내보내지 않는다). BaseDialog · ConfirmDialog · ReauthDialog 가 쓰고, 그 위에 선
 * TemporaryPasswordDialog · TeamMoveDialog · AdminConfirm · useWriteFlow 관문이 따라온다.
 *
 * 🔴 Vuetify `VDialog` 는 activator 슬롯이 있을 때만 닫힐 때 포커스를 돌려준다. 킷 대화상자는 `v-model` 로 열어
 *    activator 가 없다 — 그대로 두면 포커스가 문서 처음(body)으로 가 키보드 · 화면 낭독기 사용자가 위치를 잃는다
 *    (2026-10-08 브라우저 확인 G4 — 셸 스펙 §8 R17).
 * 🔴 열 때 `VDialog` 는 카드 자체에 포커스를 둔다 — 칸을 받는 대화상자는 그 칸으로 옮긴다(P6). 칸이 카드 안이라
 *    Vuetify 의 afterEnter 가 다시 빼앗지 않는다.
 * 🔴 닫힌 뒤에는 포커스가 아직 대화상자 안(사라지는 버튼)이거나 문서 처음일 때만 옮긴다 — 그사이 사용자가 다른 곳을
 *    눌렀으면 건드리지 않는다. 연 곳이 문서에서 사라졌으면(목록 재조회로 행이 바뀜) 아무것도 하지 않는다.
 */
export function useDialogFocus(
  open: Ref<boolean>,
  initial?: () => HTMLElement | null | undefined,
): void {
  let returnTo: HTMLElement | null = null

  watch(open, async (value, previous) => {
    if (typeof document === 'undefined') return
    if (value && !previous) {
      const active = document.activeElement
      returnTo = active instanceof HTMLElement && active !== document.body ? active : null
      if (initial) await focusWhenReady(initial)
      return
    }
    if (!value && previous) {
      const target = returnTo
      returnTo = null
      await nextTick()
      if (target == null || !target.isConnected) return
      const active = document.activeElement
      const lost =
        active == null || active === document.body || active.closest('.v-overlay') != null
      if (lost) target.focus({ preventScroll: true })
    }
  })
}

/** 대화상자 내용은 열린 뒤에 그려진다(지연 마운트) — 칸이 생길 때까지 몇 틱 기다린다 */
async function focusWhenReady(get: () => HTMLElement | null | undefined): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await nextTick()
    const element = get()
    if (element != null) {
      element.focus({ preventScroll: true })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
