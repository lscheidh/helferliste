const KEY = 'helfer_my_signups'

export interface MySignup {
  signupId: string
  shiftId: string
}

function isMySignup(x: unknown): x is MySignup {
  return typeof x === 'object' && x !== null
    && typeof (x as MySignup).signupId === 'string'
    && typeof (x as MySignup).shiftId === 'string'
}

export function getMySignups(): MySignup[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isMySignup) : []
  } catch {
    return []
  }
}

export function rememberSignup(signupId: string, shiftId: string): void {
  localStorage.setItem(KEY, JSON.stringify([...getMySignups(), { signupId, shiftId }]))
}

export function forgetSignup(signupId: string): void {
  localStorage.setItem(KEY, JSON.stringify(getMySignups().filter(x => x.signupId !== signupId)))
}
