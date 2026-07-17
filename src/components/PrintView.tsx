import { useHelferData } from '../hooks/useHelferData'
import { formatDay, groupByDay } from '../logic/grouping'

export default function PrintView() {
  const { event, shifts, signups, loading, error } = useHelferData()

  if (loading) return <p className="info">Lade…</p>
  if (error) return <p className="info error">Fehler: {error}</p>
  if (!event) return <p className="info">Kein aktives Turnier.</p>

  return (
    <div className="print-container">
      <button className="btn no-print" onClick={() => window.print()}>Drucken</button>
      <h1>{event.name} – Helferliste</h1>
      {groupByDay(shifts).map(d => (
        <section key={d.day} className="print-day">
          <h2>{formatDay(d.day)}</h2>
          {d.areas.map(a => (
            <div key={a.area}>
              <h3>{a.area}</h3>
              <table>
                <thead>
                  <tr><th>Zeit</th><th>Aufgabe</th><th>Helfer</th></tr>
                </thead>
                <tbody>
                  {a.shifts.map(s => {
                    const names = signups.filter(x => x.shift_id === s.id).map(x => x.name)
                    while (names.length < s.capacity) names.push('____________')
                    return (
                      <tr key={s.id}>
                        <td>{s.time_label}</td>
                        <td>{s.title}{s.note ? ` (${s.note})` : ''}</td>
                        <td>{names.join(', ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
