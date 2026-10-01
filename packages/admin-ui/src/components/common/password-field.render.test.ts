// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { vuetify } from '../../test/setup.js'
import PasswordField from './PasswordField.vue'

describe('PasswordField', () => {
  it('기본은 가려진 입력이고 눈 아이콘으로 토글된다', async () => {
    const w = mount(PasswordField, {
      props: { modelValue: 'secret', label: '비밀번호', name: 'password' },
      global: { plugins: [vuetify] },
    })
    const input = w.get('input')
    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('name')).toBe('password')
    expect(input.attributes('autocomplete')).toBe('off')
    await w.get('.v-field__append-inner i').trigger('click')
    await flushPromises()
    expect(w.get('input').attributes('type')).toBe('text')
  })

  it('v-model 이 양방향으로 흐른다', async () => {
    const w = mount(PasswordField, { props: { modelValue: '' }, global: { plugins: [vuetify] } })
    await w.get('input').setValue('pw')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['pw'])
  })
})
