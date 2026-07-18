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

export function composeTimeLabel(begin: string, end: string): string {
  return end ? `${begin} – ${end}` : begin
}

export interface SplitTimeLabel {
  begin: string
  end: string
  exact: boolean
}

export function splitTimeLabel(label: string): SplitTimeLabel {
  const range = label.match(/^(\d{1,2}:\d{2})\s*(?:–|-)\s*(\d{1,2}:\d{2})$/)
  if (range) return { begin: range[1], end: range[2], exact: true }
  const single = label.match(/^(\d{1,2}:\d{2})$/)
  if (single) return { begin: single[1], end: '', exact: true }
  const leading = label.match(/^(\d{1,2}:\d{2})/)
  return { begin: leading ? leading[1] : '', end: '', exact: false }
}

export function parseTimeRange(label: string): [number, number] | null {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const range = label.match(/^(\d{1,2}:\d{2})\s*(?:–|-)\s*(\d{1,2}:\d{2})/)
  if (range) return [toMinutes(range[1]), toMinutes(range[2])]
  const single = label.match(/^(\d{1,2}:\d{2})$/)
  if (single) {
    const t = toMinutes(single[1])
    return [t, t]
  }
  return null
}

export function timeRangesOverlap(a: [number, number], b: [number, number]): boolean {
  const aIsPoint = a[0] === a[1]
  const bIsPoint = b[0] === b[1]
  if (aIsPoint && bIsPoint) return a[0] === b[0]
  return a[0] < b[1] && b[0] < a[1]
}

export interface TimeConflictTarget {
  day: string
  area: string
  title: string
  range: [number, number]
}

export function findTimeConflict(shifts: Shift[], target: TimeConflictTarget, excludeId?: string): Shift | null {
  for (const s of shifts) {
    if (excludeId && s.id === excludeId) continue
    if (s.day !== target.day || s.area !== target.area || s.title !== target.title) continue
    const existingRange = parseTimeRange(s.time_label)
    if (existingRange && timeRangesOverlap(target.range, existingRange)) return s
  }
  return null
}

function startMinutesOfLabel(label: string): number {
  const { begin } = splitTimeLabel(label)
  if (!begin) return Infinity
  const [h, m] = begin.split(':').map(Number)
  return h * 60 + m
}

interface AreaBlock {
  area: string
  startIndex: number
  endIndex: number
}

function areaBlocks(shifts: { area: string }[]): AreaBlock[] {
  const blocks: AreaBlock[] = []
  for (let i = 0; i < shifts.length; i++) {
    const area = shifts[i].area
    const last = blocks[blocks.length - 1]
    if (last && last.area === area) {
      last.endIndex = i
    } else {
      blocks.push({ area, startIndex: i, endIndex: i })
    }
  }
  return blocks
}

/**
 * Findet die Einfügeposition für eine neue/verschobene Schicht innerhalb eines
 * Tages: an der zeitlich passenden Stelle im eigenen Bereich, bzw. für einen
 * neuen Bereich zwischen den bestehenden Bereichs-Blöcken nach deren Startzeit.
 * `orderedShifts` muss bereits in der aktuellen Anzeigereihenfolge sein.
 */
export function computeInsertIndex(
  orderedShifts: { area: string; time_label: string }[],
  newShift: { area: string; time_label: string },
): number {
  const newStart = startMinutesOfLabel(newShift.time_label)
  const blocks = areaBlocks(orderedShifts)
  const sameAreaBlock = blocks.find(b => b.area === newShift.area)

  if (sameAreaBlock) {
    for (let i = sameAreaBlock.startIndex; i <= sameAreaBlock.endIndex; i++) {
      if (startMinutesOfLabel(orderedShifts[i].time_label) > newStart) return i
    }
    return sameAreaBlock.endIndex + 1
  }

  for (const b of blocks) {
    if (startMinutesOfLabel(orderedShifts[b.startIndex].time_label) > newStart) return b.startIndex
  }
  return orderedShifts.length
}

export function eventDays(dateFrom: string, dateTo: string): string[] {
  const days: string[] = []
  let day = dateFrom
  let guard = 0
  while (day <= dateTo && guard < 60) {
    days.push(day)
    day = addDays(day, 1)
    guard++
  }
  return days
}
