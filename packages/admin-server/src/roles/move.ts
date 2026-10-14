// 정본: hangang-home apps/api/src/modules/roles/roles.service.ts updateDisplayOrder(구간 재번호)
// 바꾼 점: 목표값을 [가장 작은 값, 가장 큰 값] 으로 자른다 — hangang 은 자르지 않아 큰 값이 구멍을 남겼다(2d 스펙 §2-2 공통 3).
//   계산을 순수 함수로 뺐다.

export interface RoleMovePlan {
  from: number
  /** 잘린 목표값 */
  to: number
  /** 다른 역할의 순서를 한 칸 옮길 구간(양끝 포함). 같은 자리면 null */
  shift: { delta: 1 | -1; min: number; max: number } | null
}

export function planRoleMove(
  from: number,
  requested: number,
  lo: number,
  hi: number,
): RoleMovePlan {
  const to = Math.min(Math.max(requested, lo), hi)
  if (to === from) return { from, to, shift: null }
  return from < to
    ? { from, to, shift: { delta: -1, min: from + 1, max: to } }
    : { from, to, shift: { delta: 1, min: to, max: from - 1 } }
}
