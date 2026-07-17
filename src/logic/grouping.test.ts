import { describe, expect, it } from 'vitest'
import { addDays, formatDay, groupByDay, progress, shiftStatus } from './grouping'
import type { Shift } from '../types'

function mkShift(over: Partial<Shift>): Shift {
  return {
    id: 's1', event_id: 'e1', day: '2026-09-04', time_label: '10:00',
    area: 'Getränke & Essen', title: 'Getränke', capacity: 2, note: null, sort_order: 1,
    ...over,
  }
}

describe('shiftStatus', () => {
  it('zählt nur Signups der eigenen Schicht', () => {
    const shift = mkShift({ id: 's1', capacity: 3 })
    const signups = [{ shift_id: 's1' }, { shift_id: 'anders' }]
    expect(shiftStatus(shift, signups)).toEqual({ taken: 1, open: 2, full: false })
  })
  it('meldet voll bei Soll-Besetzung erreicht', () => {
    const shift = mkShift({ capacity: 1 })
    expect(shiftStatus(shift, [{ shift_id: 's1' }])).toEqual({ taken: 1, open: 0, full: true })
  })
})

describe('groupByDay', () => {
  it('gruppiert nach Tag und Bereich in Eingabereihenfolge', () => {
    const shifts = [
      mkShift({ id: 'a', day: '2026-09-04', area: 'Getränke & Essen' }),
      mkShift({ id: 'b', day: '2026-09-04', area: 'Parcoursdienst' }),
      mkShift({ id: 'c', day: '2026-09-05', area: 'Getränke & Essen' }),
      mkShift({ id: 'd', day: '2026-09-04', area: 'Getränke & Essen' }),
    ]
    const days = groupByDay(shifts)
    expect(days.map(d => d.day)).toEqual(['2026-09-04', '2026-09-05'])
    expect(days[0].areas.map(a => a.area)).toEqual(['Getränke & Essen', 'Parcoursdienst'])
    expect(days[0].areas[0].shifts.map(s => s.id)).toEqual(['a', 'd'])
  })
})

describe('progress', () => {
  it('summiert Soll und Ist, überzählige Signups zählen nicht doppelt', () => {
    const shifts = [mkShift({ id: 's1', capacity: 2 }), mkShift({ id: 's2', capacity: 1 })]
    const signups = [
      { shift_id: 's1' },
      { shift_id: 's2' },
      { shift_id: 's2' },
    ]
    expect(progress(shifts, signups)).toEqual({ taken: 2, total: 3 })
  })
})

describe('formatDay', () => {
  it('formatiert deutsch mit Wochentag', () => {
    expect(formatDay('2026-09-04')).toBe('Freitag, 04.09.')
  })
})

describe('addDays', () => {
  it('verschiebt ISO-Datum um n Tage', () => {
    expect(addDays('2025-09-05', 364)).toBe('2026-09-04')
  })
  it('bleibt über Zeitumstellungen korrekt', () => {
    expect(addDays('2026-03-27', 3)).toBe('2026-03-30')
    expect(addDays('2026-10-23', 3)).toBe('2026-10-26')
  })
})
