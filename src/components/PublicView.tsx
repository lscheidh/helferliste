import { useState } from 'react'
import { useHelferData } from '../hooks/useHelferData'
import { formatDay, groupByDay, progress } from '../logic/grouping'
import { getMySignups } from '../logic/storage'
import ShiftCard from './ShiftCard'

export default function PublicView() {
  const { event, shifts, signups, loading, error, reload } = useHelferData()
  const [activeDay, setActiveDay] = useState<string | null>(null)

  if (loading) return <p className="info">Lade Helferliste…</p>
  if (error) return <p className="info error">Fehler beim Laden: {error}</p>
  if (!event) return <p className="info">Aktuell ist keine Helferliste freigeschaltet.</p>

  const days = groupByDay(shifts)
  const day = activeDay ?? days[0]?.day ?? null
  const current = days.find(d => d.day === day)
  const mySignups = getMySignups()

  return (
    <div className="container">
      <h1>{event.name} – Helferliste</h1>
      <p className="subtitle">
        Trag dich einfach mit deinem Namen in eine Schicht ein. Danke für deine Unterstützung!
      </p>
      <nav className="tabs">
        {days.map(d => {
          const p = progress(d.areas.flatMap(a => a.shifts), signups)
          return (
            <button
              key={d.day}
              className={d.day === day ? 'tab active' : 'tab'}
              onClick={() => setActiveDay(d.day)}
            >
              {formatDay(d.day)}
              <span className="tab-progress">{p.taken} / {p.total} besetzt</span>
            </button>
          )
        })}
      </nav>
      {current?.areas.map(a => (
        <section key={a.area}>
          <h2>{a.area}</h2>
          {a.shifts.map(s => (
            <ShiftCard
              key={s.id}
              shift={s}
              signups={signups.filter(x => x.shift_id === s.id)}
              mySignup={mySignups.find(m => m.shiftId === s.id)}
              onChanged={reload}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
