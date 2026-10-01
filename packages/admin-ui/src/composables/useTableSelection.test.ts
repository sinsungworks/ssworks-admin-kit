import { describe, expect, it } from 'vitest'
import { useTableSelection } from './useTableSelection.js'

describe('useTableSelection', () => {
  it('처음에는 아무것도 선택되지 않는다', () => {
    const s = useTableSelection<number>()
    expect(s.mode.value).toBe('include')
    expect(s.isSelected(1)).toBe(false)
    expect(s.selectedCount(10)).toBe(0)
  })

  it('toggle 은 선택과 해제를 오간다', () => {
    const s = useTableSelection<string>()
    s.toggle('a')
    expect(s.isSelected('a')).toBe(true)
    expect(s.selectedCount(5)).toBe(1)
    s.toggle('a')
    expect(s.isSelected('a')).toBe(false)
    expect(s.selectedCount(5)).toBe(0)
  })

  it('bigint 키를 쓴다', () => {
    const s = useTableSelection<bigint>()
    s.toggle(1n)
    expect(s.isSelected(1n)).toBe(true)
    expect(s.isSelected(2n)).toBe(false)
  })

  it('selectAll 은 반전 모드라 toggle 이 제외가 된다', () => {
    const s = useTableSelection<number>()
    s.selectAll()
    expect(s.mode.value).toBe('exclude')
    expect(s.isSelected(99)).toBe(true)
    expect(s.selectedCount(100)).toBe(100)
    s.toggle(99)
    expect(s.isSelected(99)).toBe(false)
    expect(s.selectedCount(100)).toBe(99)
  })

  it('deselectAll 은 include 모드로 되돌리고 비운다', () => {
    const s = useTableSelection<number>()
    s.selectAll()
    s.toggle(1)
    s.deselectAll()
    expect(s.mode.value).toBe('include')
    expect(s.isSelected(1)).toBe(false)
    expect(s.selectedCount(10)).toBe(0)
  })

  it('toggleAll 은 현재 페이지가 모두 선택이면 해제, 아니면 전체 선택한다', () => {
    const s = useTableSelection<number>()
    s.toggleAll([1, 2, 3])
    expect(s.mode.value).toBe('exclude')
    expect(s.isSelected(1)).toBe(true)
    s.toggleAll([1, 2, 3])
    expect(s.mode.value).toBe('include')
    expect(s.isSelected(1)).toBe(false)
  })

  it('toggleAll 은 빈 페이지에서 전체 선택으로 간다', () => {
    const s = useTableSelection<number>()
    s.toggleAll([])
    expect(s.mode.value).toBe('exclude')
  })

  it('headerState 는 checked · indeterminate 를 계산한다', () => {
    const s = useTableSelection<number>()
    expect(s.headerState([])).toEqual({ checked: false, indeterminate: false })
    expect(s.headerState([1, 2])).toEqual({ checked: false, indeterminate: false })
    s.toggle(1)
    expect(s.headerState([1, 2])).toEqual({ checked: false, indeterminate: true })
    s.toggle(2)
    expect(s.headerState([1, 2])).toEqual({ checked: true, indeterminate: false })
  })

  it('retain 은 include 모드에서 사라진 키를 정리한다', () => {
    const s = useTableSelection<number>()
    s.toggle(1)
    s.toggle(2)
    s.toggle(3)
    s.retain([2, 3, 4])
    expect(s.isSelected(1)).toBe(false)
    expect(s.isSelected(2)).toBe(true)
    expect(s.selectedCount(10)).toBe(2)
  })

  it('retain 은 exclude 모드에서는 아무것도 바꾸지 않는다', () => {
    const s = useTableSelection<number>()
    s.selectAll()
    s.toggle(1)
    s.retain([2])
    expect(s.isSelected(1)).toBe(false)
    expect(s.isSelected(5)).toBe(true)
  })
})
