import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { addDays, formatDay, groupByDay } from '../../logic/grouping'
import type { HelferEvent, Shift, Signup } from '../../types'

const EMPTY_SHIFT = {
  day: '', time_label: '', area: '', title: '', capacity: 1, note: '', sort_order: 0,
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

  async function saveShift(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEventId) return
    setError(null)
    const payload = {
      event_id: selectedEventId,
      day: draft.day,
      time_label: draft.time_label,
      area: draft.area,
      title: draft.title,
      capacity: Number(draft.capacity),
      note: draft.note.trim() || null,
      sort_order: Number(draft.sort_order),
    }
    const { error } = editingId
      ? await supabase.from('helfer_shifts').update(payload).eq('id', editingId)
      : await supabase.from('helfer_shifts').insert(payload)
    if (error) { setError(error.message); return }
    setDraft(EMPTY_SHIFT)
    setEditingId(null)
    loadShifts()
  }

  function startEdit(s: Shift) {
    setEditingId(s.id)
    setDraft({
      day: s.day, time_label: s.time_label, area: s.area, title: s.title,
      capacity: s.capacity, note: s.note ?? '', sort_order: s.sort_order,
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
        <input type="date" value={draft.day} onChange={e => setDraft({ ...draft, day: e.target.value })} required />
        <input value={draft.time_label} onChange={e => setDraft({ ...draft, time_label: e.target.value })} placeholder="Zeit (z. B. 10:00 – 12:30)" required />
        <input value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })} placeholder="Bereich (z. B. Getränke & Essen)" required />
        <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Aufgabe (z. B. Bonkasse)" required />
        <input type="number" min={1} value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} placeholder="Benötigte Helfer" required />
        <input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Hinweis (optional)" />
        <input type="number" value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })} placeholder="Sortierung" />
        <div className="admin-row">
          <button className="btn" type="submit">{editingId ? 'Speichern' : 'Anlegen'}</button>
          {editingId && (
            <button className="link" type="button" onClick={() => { setEditingId(null); setDraft(EMPTY_SHIFT) }}>
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
              {a.shifts.map(s => {
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
                      <button className="link" onClick={() => startEdit(s)}>bearbeiten</button>
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
