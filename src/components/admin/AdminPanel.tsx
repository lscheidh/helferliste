import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  addDays, composeTimeLabel, computeInsertIndex, eventDays, findTimeConflict, formatDay, groupByDay,
  parseTimeRange, splitTimeLabel,
} from '../../logic/grouping'
import type { HelferEvent, Shift, Signup } from '../../types'

const EMPTY_SHIFT = {
  day: '', beginTime: '', endTime: '', area: '', title: '', capacity: 1, note: '',
}
type ShiftDraft = typeof EMPTY_SHIFT

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export default function AdminPanel() {
  const [events, setEvents] = useState<HelferEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [signups, setSignups] = useState<Signup[]>([])
  const [draft, setDraft] = useState<ShiftDraft>(EMPTY_SHIFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newAreaMode, setNewAreaMode] = useState(false)
  const [timeWarning, setTimeWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from('helfer_events').select('*').order('date_from')
    if (error) { setError(error.message); return }
    setEvents(data ?? [])
    if (data && data.length > 0) {
      setSelectedEventId(prev => prev ?? (data.find(e => e.is_active) ?? data[data.length - 1]).id)
    }
  }, [])

  const loadShifts = useCallback(async () => {
    if (!selectedEventId) { setShifts([]); setSignups([]); return }
    const { data: sh, error: e1 } = await supabase
      .from('helfer_shifts').select('*')
      .eq('event_id', selectedEventId).order('day').order('sort_order')
    if (e1) { setError(e1.message); return }
    setShifts(sh ?? [])
    if (!sh || sh.length === 0) { setSignups([]); return }
    const { data: su, error: e2 } = await supabase
      .from('helfer_signups').select('*').in('shift_id', sh.map(s => s.id)).order('created_at')
    if (e2) { setError(e2.message); return }
    setSignups(su ?? [])
  }, [selectedEventId])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => { loadShifts() }, [loadShifts])

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null
  const existingAreas = [...new Set(shifts.map(s => s.area))].sort()

  async function setActive(eventId: string) {
    setError(null)
    const { error: e1 } = await supabase.from('helfer_events').update({ is_active: false }).eq('is_active', true)
    if (e1) { setError(e1.message); return }
    const { error: e2 } = await supabase.from('helfer_events').update({ is_active: true }).eq('id', eventId)
    if (e2) setError(e2.message)
    loadEvents()
  }

  async function createEvent() {
    setError(null)
    const name = prompt('Name des Turniers (z. B. "Turnier 2027"):')
    if (!name) return
    const dateFrom = prompt('Erster Tag (JJJJ-MM-TT):')
    const dateTo = prompt('Letzter Tag (JJJJ-MM-TT):')
    if (!dateFrom || !dateTo) return
    if (!isIsoDate(dateFrom) || !isIsoDate(dateTo)) { setError('Datum bitte im Format JJJJ-MM-TT angeben.'); return }
    const { error } = await supabase.from('helfer_events')
      .insert({ name, date_from: dateFrom, date_to: dateTo, is_active: false })
    if (error) { setError(error.message); return }
    loadEvents()
  }

  async function copyEvent() {
    setError(null)
    if (!selectedEvent) return
    const name = prompt('Name des neuen Turniers:', selectedEvent.name.replace(/\d{4}/, m => String(Number(m) + 1)))
    if (!name) return
    const dateFrom = prompt('Erster Tag des neuen Turniers (JJJJ-MM-TT):')
    if (!dateFrom) return
    if (!isIsoDate(dateFrom)) { setError('Datum bitte im Format JJJJ-MM-TT angeben.'); return }
    const offset = Math.round(
      (new Date(dateFrom + 'T00:00:00').getTime() - new Date(selectedEvent.date_from + 'T00:00:00').getTime()) / 86400000
    )
    const dateTo = addDays(selectedEvent.date_to, offset)
    const { data: ev, error: e1 } = await supabase.from('helfer_events')
      .insert({ name, date_from: dateFrom, date_to: dateTo, is_active: false })
      .select().single()
    if (e1 || !ev) { setError(e1?.message ?? 'Anlegen fehlgeschlagen'); return }
    const copies = shifts.map(({ id: _id, event_id: _eventId, day, ...rest }) => ({
      ...rest,
      event_id: ev.id,
      day: addDays(day, offset),
    }))
    if (copies.length > 0) {
      const { error: e2 } = await supabase.from('helfer_shifts').insert(copies)
      if (e2) { setError(e2.message); return }
    }
    setSelectedEventId(ev.id)
    loadEvents()
  }

  async function persistOrder(orderedShifts: { id: string; sort_order: number }[]) {
    const updates = orderedShifts
      .map((s, index) => ({ id: s.id, from: s.sort_order, to: index }))
      .filter(u => u.from !== u.to)
    await Promise.all(updates.map(u => supabase.from('helfer_shifts').update({ sort_order: u.to }).eq('id', u.id)))
  }

  async function saveShift(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEventId) return
    setError(null)

    const timeLabel = composeTimeLabel(draft.beginTime, draft.endTime)
    const newRange = parseTimeRange(timeLabel)
    if (newRange) {
      const conflict = findTimeConflict(
        shifts,
        { day: draft.day, area: draft.area, title: draft.title, range: newRange },
        editingId ?? undefined
      )
      if (conflict) {
        setError(`Für "${draft.title}" gibt es an diesem Tag im Bereich "${draft.area}" bereits eine überschneidende Uhrzeit (${conflict.time_label}).`)
        return
      }
    }

    const payload = {
      event_id: selectedEventId,
      day: draft.day,
      time_label: timeLabel,
      area: draft.area,
      title: draft.title,
      capacity: Number(draft.capacity),
      note: draft.note.trim() || null,
    }

    const original = editingId ? shifts.find(s => s.id === editingId) ?? null : null
    const needsReposition = !editingId
      || !original || original.day !== draft.day || original.area !== draft.area || original.time_label !== timeLabel

    if (editingId) {
      const { error } = await supabase.from('helfer_shifts').update(payload).eq('id', editingId)
      if (error) { setError(error.message); return }
      if (needsReposition) {
        const dayShifts = shifts.filter(s => s.day === draft.day && s.id !== editingId)
        const insertIndex = computeInsertIndex(dayShifts, { area: draft.area, time_label: timeLabel })
        const finalOrder: { id: string; sort_order: number }[] = [
          ...dayShifts.slice(0, insertIndex),
          { id: editingId, sort_order: -1 },
          ...dayShifts.slice(insertIndex),
        ]
        await persistOrder(finalOrder)
      }
    } else {
      const dayShifts = shifts.filter(s => s.day === draft.day)
      const insertIndex = computeInsertIndex(dayShifts, { area: draft.area, time_label: timeLabel })
      const { data: created, error } = await supabase.from('helfer_shifts').insert(payload).select().single()
      if (error || !created) { setError(error?.message ?? 'Anlegen fehlgeschlagen'); return }
      const finalOrder: { id: string; sort_order: number }[] = [
        ...dayShifts.slice(0, insertIndex),
        { id: created.id, sort_order: -1 },
        ...dayShifts.slice(insertIndex),
      ]
      await persistOrder(finalOrder)
    }

    setDraft(EMPTY_SHIFT)
    setEditingId(null)
    setNewAreaMode(false)
    setTimeWarning(null)
    loadShifts()
  }

  async function moveShift(s: Shift, direction: 'up' | 'down') {
    setError(null)
    const areaShifts = shifts.filter(x => x.day === s.day && x.area === s.area)
    const index = areaShifts.findIndex(x => x.id === s.id)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= areaShifts.length) return
    const other = areaShifts[targetIndex]
    const { error: e1 } = await supabase.from('helfer_shifts').update({ sort_order: other.sort_order }).eq('id', s.id)
    if (e1) { setError(e1.message); return }
    const { error: e2 } = await supabase.from('helfer_shifts').update({ sort_order: s.sort_order }).eq('id', other.id)
    if (e2) { setError(e2.message); return }
    loadShifts()
  }

  function startEdit(s: Shift) {
    setEditingId(s.id)
    setNewAreaMode(false)
    const { begin, end, exact } = splitTimeLabel(s.time_label)
    setTimeWarning(exact ? null : `Ursprünglicher Zeittext "${s.time_label}" ließ sich nicht vollständig übernehmen – bitte Beginn/Ende prüfen.`)
    setDraft({
      day: s.day, beginTime: begin, endTime: end, area: s.area, title: s.title,
      capacity: s.capacity, note: s.note ?? '',
    })
  }

  function duplicateShift(s: Shift) {
    setEditingId(null)
    setNewAreaMode(false)
    setTimeWarning(null)
    setDraft({
      day: s.day, beginTime: '', endTime: '', area: s.area, title: s.title,
      capacity: s.capacity, note: s.note ?? '',
    })
  }

  async function deleteShift(id: string) {
    setError(null)
    if (!confirm('Schicht samt Eintragungen löschen?')) return
    const { error } = await supabase.from('helfer_shifts').delete().eq('id', id)
    if (error) { setError(error.message); return }
    loadShifts()
  }

  async function deleteSignup(id: string) {
    setError(null)
    if (!confirm('Diesen Helfer-Eintrag entfernen?')) return
    const { error } = await supabase.from('helfer_signups').delete().eq('id', id)
    if (error) { setError(error.message); return }
    loadShifts()
  }

  return (
    <div className="container">
      <h1>Admin – Helferliste</h1>
      <div className="admin-row">
        <a href="#/">Zur öffentlichen Ansicht</a>
        <a href="#/print">Druckansicht</a>
        <button className="link" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </div>
      {error && <p className="error">{error}</p>}

      <h2>Turnier</h2>
      <div className="admin-row">
        <select value={selectedEventId ?? ''} onChange={e => {
          setSelectedEventId(e.target.value)
          setEditingId(null)
          setDraft(EMPTY_SHIFT)
          setNewAreaMode(false)
          setTimeWarning(null)
        }}>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name}{ev.is_active ? ' (aktiv)' : ''}
            </option>
          ))}
        </select>
        {selectedEvent && !selectedEvent.is_active && (
          <button className="btn" onClick={() => setActive(selectedEvent.id)}>Aktiv schalten</button>
        )}
        <button className="link" onClick={createEvent}>Neues Turnier</button>
        <button className="link" onClick={copyEvent}>Turnier kopieren</button>
      </div>

      <h2>{editingId ? 'Schicht bearbeiten' : 'Neue Schicht'}</h2>
      <form onSubmit={saveShift} className="admin-form">
        <label htmlFor="shift-day">Tag</label>
        <select
          id="shift-day"
          value={draft.day}
          onChange={e => setDraft({ ...draft, day: e.target.value })}
          required
        >
          <option value="">-- Tag wählen --</option>
          {(selectedEvent ? eventDays(selectedEvent.date_from, selectedEvent.date_to) : []).map(day => (
            <option key={day} value={day}>{formatDay(day)}</option>
          ))}
        </select>

        <label htmlFor="shift-begin">Beginn</label>
        <input id="shift-begin" type="time" value={draft.beginTime} onChange={e => setDraft({ ...draft, beginTime: e.target.value })} required />

        <label htmlFor="shift-end">Ende (optional – leer lassen für einen einzelnen Zeitpunkt, z. B. eine Prüfung)</label>
        <input id="shift-end" type="time" value={draft.endTime} onChange={e => setDraft({ ...draft, endTime: e.target.value })} />
        {timeWarning && <p className="error">{timeWarning}</p>}

        <label htmlFor="shift-area">Bereich (Abschnitt auf der Liste)</label>
        {newAreaMode ? (
          <input
            id="shift-area"
            value={draft.area}
            onChange={e => setDraft({ ...draft, area: e.target.value })}
            placeholder="Name des neuen Bereichs"
            required
            autoFocus
          />
        ) : (
          <select
            id="shift-area"
            value={existingAreas.includes(draft.area) ? draft.area : ''}
            onChange={e => {
              if (e.target.value === '__new__') {
                setNewAreaMode(true)
                setDraft(d => ({ ...d, area: '' }))
                return
              }
              setDraft({ ...draft, area: e.target.value })
            }}
            required
          >
            <option value="">-- Bereich wählen --</option>
            {existingAreas.map(a => <option key={a} value={a}>{a}</option>)}
            <option value="__new__">+ Neuer Bereich…</option>
          </select>
        )}
        {newAreaMode && (
          <button type="button" className="link" onClick={() => { setNewAreaMode(false); setDraft(d => ({ ...d, area: '' })) }}>
            Bestehenden Bereich wählen
          </button>
        )}

        <label htmlFor="shift-title">Aufgabe</label>
        <input id="shift-title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="z. B. Bonkasse" required />

        <label htmlFor="shift-capacity">Benötigte Helfer (Soll-Besetzung, kein Maximum)</label>
        <input id="shift-capacity" type="number" min={1} value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} required />

        <label htmlFor="shift-note">Hinweis (optional, erscheint in Klammern hinter der Aufgabe)</label>
        <input id="shift-note" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="z. B. nur Ausgabe" />

        <div className="admin-row">
          <button className="btn" type="submit">{editingId ? 'Speichern' : 'Anlegen'}</button>
          {editingId && (
            <button className="link" type="button" onClick={() => { setEditingId(null); setDraft(EMPTY_SHIFT); setNewAreaMode(false); setTimeWarning(null) }}>
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <h2>Schichten</h2>
      {groupByDay(shifts).map(d => (
        <section key={d.day}>
          <h2>{formatDay(d.day)}</h2>
          {d.areas.map(a => (
            <div key={a.area}>
              <strong>{a.area}</strong>
              {a.shifts.map((s, i) => {
                const su = signups.filter(x => x.shift_id === s.id)
                return (
                  <div key={s.id} className="shift">
                    <div className="shift-head">
                      <strong>{s.time_label}</strong> – {s.title} ({su.length}/{s.capacity})
                      {s.note && <span className="note"> ({s.note})</span>}
                    </div>
                    <ul className="names">
                      {su.map(x => (
                        <li key={x.id}>
                          {x.name}{x.phone ? ` (${x.phone})` : ''}
                          <button className="link" onClick={() => deleteSignup(x.id)}>entfernen</button>
                        </li>
                      ))}
                    </ul>
                    <div className="admin-row">
                      <button className="link" disabled={i === 0} onClick={() => moveShift(s, 'up')} title="Nach oben">▲</button>
                      <button className="link" disabled={i === a.shifts.length - 1} onClick={() => moveShift(s, 'down')} title="Nach unten">▼</button>
                      <button className="link" onClick={() => startEdit(s)}>bearbeiten</button>
                      <button className="link" onClick={() => duplicateShift(s)}>duplizieren</button>
                      <button className="link" onClick={() => deleteShift(s.id)}>löschen</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
