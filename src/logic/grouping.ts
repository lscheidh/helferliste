import type { Shift } from '../types'

export interface ShiftStatus {
  taken: number
  open: number
  full: boolean
}

export interface HasShiftId {
  shift_id: string
}

export function shiftStatus(shift: Shift, signups: HasShiftId[]): ShiftStatus {
  const taken = signups.filter(s => s.shift_id === shift.id).length
  const open = Math.max(0, shift.capacity - taken)
  return { taken, open, full: open === 0 }
}

export interface DayGroup {
  day: string
  areas: { area: string; shifts: Shift[] }[]
}

export function groupByDay(shifts: Shift[]): DayGroup[] {
  const days: DayGroup[] = []
  for (const shift of shifts) {
    let d = days.find(x => x.day === shift.day)
    if (!d) {
      d = { day: shift.day, areas: [] }
      days.push(d)
    }
    let a = d.areas.find(x => x.area === shift.area)
    if (!a) {
      a = { area: shift.area, shifts: [] }
      d.areas.push(a)
    }
    a.shifts.push(shift)
  }
  return days
}

export function progress(shifts: Shift[], signups: HasShiftId[]): { taken: number; total: number } {
  let taken = 0
  let total = 0
  for (const shift of shifts) {
    total += shift.capacity
    taken += Math.min(shiftStatus(shift, signups).taken, shift.capacity)
  }
  return { taken, total }
}

export function formatDay(isoDay: string): string {
  const d = new Date(isoDay + 'T00:00:00')
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'long' })
  const dm = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  return `${weekday}, ${dm}`
}

export function addDays(isoDay: string, days: number): string {
  const d = new Date(isoDay + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
