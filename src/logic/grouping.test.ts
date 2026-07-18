import { describe, expect, it } from 'vitest'
import {
  addDays, composeTimeLabel, computeInsertIndex, eventDays, findTimeConflict, formatDay, groupByDay,
  parseTimeRange, progress, shiftStatus, splitTimeLabel, timeRangesOverlap,
} from './grouping'
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

describe('computeInsertIndex', () => {
  it('fügt in eine leere Liste am Anfang ein', () => {
    expect(computeInsertIndex([], { area: 'X', time_label: '10:00' })).toBe(0)
  })

  it('fügt innerhalb eines bestehenden Bereichs an der richtigen Zeitposition ein', () => {
    const existing = [
      { area: 'Getränke & Essen', time_label: '10:00 – 13:00' },
      { area: 'Getränke & Essen', time_label: '13:00 – 15:30' },
    ]
    expect(computeInsertIndex(existing, { area: 'Getränke & Essen', time_label: '11:00 – 12:00' })).toBe(1)
  })

  it('hängt ans Ende eines Bereichs an, wenn die neue Zeit am spätesten ist', () => {
    const existing = [{ area: 'Getränke & Essen', time_label: '10:00 – 13:00' }]
    expect(computeInsertIndex(existing, { area: 'Getränke & Essen', time_label: '15:00 – 17:00' })).toBe(1)
  })

  it('fügt einen neuen Bereich chronologisch zwischen bestehenden Bereichs-Blöcken ein', () => {
    const existing = [
      { area: 'Getränke & Essen', time_label: '10:00 – 13:00' },
      { area: 'Schreiber & Leser', time_label: '17:00' },
    ]
    expect(computeInsertIndex(existing, { area: 'Parcoursdienst', time_label: '14:00' })).toBe(1)
  })

  it('hängt einen neuen, später startenden Bereich ans Ende an', () => {
    const existing = [{ area: 'Getränke & Essen', time_label: '10:00 – 13:00' }]
    expect(computeInsertIndex(existing, { area: 'Parcoursdienst', time_label: '15:00' })).toBe(1)
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

describe('composeTimeLabel', () => {
  it('fügt einen Bindestrich nur bei vorhandenem Ende ein', () => {
    expect(composeTimeLabel('10:00', '12:30')).toBe('10:00 – 12:30')
    expect(composeTimeLabel('11:15', '')).toBe('11:15')
  })
})

describe('splitTimeLabel', () => {
  it('zerlegt einen sauberen Zeitbereich', () => {
    expect(splitTimeLabel('10:00 – 12:30')).toEqual({ begin: '10:00', end: '12:30', exact: true })
  })
  it('zerlegt einen einzelnen Zeitpunkt', () => {
    expect(splitTimeLabel('11:15')).toEqual({ begin: '11:15', end: '', exact: true })
  })
  it('markiert unklaren Text als nicht exakt, behält aber den Anfang', () => {
    expect(splitTimeLabel('15:30 – Ende (ca. 18:45)')).toEqual({ begin: '15:30', end: '', exact: false })
  })
})

describe('parseTimeRange', () => {
  it('parst einen Zeitbereich in Minuten seit Mitternacht', () => {
    expect(parseTimeRange('10:00 – 12:30')).toEqual([600, 750])
  })
  it('parst einen einzelnen Zeitpunkt als Punkt-Intervall', () => {
    expect(parseTimeRange('11:15')).toEqual([675, 675])
  })
  it('gibt null für unparsbaren Text zurück', () => {
    expect(parseTimeRange('15:30 – Ende (ca. 18:45)')).toBeNull()
  })
})

describe('timeRangesOverlap', () => {
  it('erkennt eine echte Überschneidung zweier Bereiche', () => {
    expect(timeRangesOverlap([600, 750], [700, 800])).toBe(true)
  })
  it('erlaubt nahtlos aneinandergrenzende Bereiche', () => {
    expect(timeRangesOverlap([600, 750], [750, 800])).toBe(false)
  })
  it('erkennt identische Zeitpunkte als Konflikt', () => {
    expect(timeRangesOverlap([675, 675], [675, 675])).toBe(true)
  })
  it('erlaubt unterschiedliche Zeitpunkte', () => {
    expect(timeRangesOverlap([675, 675], [700, 700])).toBe(false)
  })
  it('erkennt einen Zeitpunkt innerhalb eines Bereichs', () => {
    expect(timeRangesOverlap([700, 700], [600, 750])).toBe(true)
  })
  it('erlaubt einen Zeitpunkt genau auf der Bereichsgrenze', () => {
    expect(timeRangesOverlap([600, 600], [600, 750])).toBe(false)
  })
})

describe('findTimeConflict', () => {
  const base = [
    mkShift({ id: 'a', day: '2026-09-04', area: 'Getränke & Essen', title: 'Getränke', time_label: '10:00 – 13:00' }),
    mkShift({ id: 'b', day: '2026-09-04', area: 'Getränke & Essen', title: 'Spülmobil', time_label: '10:00 – 13:00' }),
  ]

  it('erlaubt unterschiedliche Aufgaben im selben Bereich zur selben Zeit', () => {
    const conflict = findTimeConflict(base, { day: '2026-09-04', area: 'Getränke & Essen', title: 'Kuchen', range: [600, 780] })
    expect(conflict).toBeNull()
  })

  it('erkennt eine echte Überschneidung derselben Aufgabe', () => {
    const conflict = findTimeConflict(base, { day: '2026-09-04', area: 'Getränke & Essen', title: 'Getränke', range: [660, 720] })
    expect(conflict?.id).toBe('a')
  })

  it('ignoriert die eigene Schicht beim Bearbeiten', () => {
    const conflict = findTimeConflict(base, { day: '2026-09-04', area: 'Getränke & Essen', title: 'Getränke', range: [600, 780] }, 'a')
    expect(conflict).toBeNull()
  })

  it('ignoriert andere Tage und Bereiche', () => {
    expect(findTimeConflict(base, { day: '2026-09-05', area: 'Getränke & Essen', title: 'Getränke', range: [600, 780] })).toBeNull()
    expect(findTimeConflict(base, { day: '2026-09-04', area: 'Parcoursdienst', title: 'Getränke', range: [600, 780] })).toBeNull()
  })
})

describe('eventDays', () => {
  it('listet alle Tage zwischen zwei Daten inklusive', () => {
    expect(eventDays('2026-09-04', '2026-09-06')).toEqual(['2026-09-04', '2026-09-05', '2026-09-06'])
  })
  it('gibt genau einen Tag zurück, wenn Anfang und Ende gleich sind', () => {
    expect(eventDays('2026-09-04', '2026-09-04')).toEqual(['2026-09-04'])
  })
})
