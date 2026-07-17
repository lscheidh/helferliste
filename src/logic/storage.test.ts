// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetSignup, getMySignups, rememberSignup } from './storage'

describe('signup storage', () => {
  beforeEach(() => localStorage.clear())

  it('startet leer', () => {
    expect(getMySignups()).toEqual([])
  })

  it('merkt sich Paare und vergisst per signupId', () => {
    rememberSignup('sig-a', 'shift-1')
    rememberSignup('sig-b', 'shift-2')
    expect(getMySignups()).toEqual([
      { signupId: 'sig-a', shiftId: 'shift-1' },
      { signupId: 'sig-b', shiftId: 'shift-2' },
    ])
    forgetSignup('sig-a')
    expect(getMySignups()).toEqual([{ signupId: 'sig-b', shiftId: 'shift-2' }])
  })

  it('übersteht kaputte Daten', () => {
    localStorage.setItem('helfer_my_signups', 'kein json')
    expect(getMySignups()).toEqual([])
    localStorage.setItem('helfer_my_signups', JSON.stringify(['alte-form', { signupId: 'x', shiftId: 'y' }, { nope: 1 }]))
    expect(getMySignups()).toEqual([{ signupId: 'x', shiftId: 'y' }])
  })
})
