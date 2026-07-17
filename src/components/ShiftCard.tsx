import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { shiftStatus } from '../logic/grouping'
import { forgetSignup, rememberSignup } from '../logic/storage'
import type { MySignup } from '../logic/storage'
import type { PublicSignup, Shift } from '../types'

interface Props {
  shift: Shift
  signups: PublicSignup[]
  mySignup: MySignup | undefined
  onChanged: () => void
}

export default function ShiftCard({ shift, signups, mySignup, onChanged }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const status = shiftStatus(shift, signups)

  async function signUp(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return
    setBusy(true)
    setMessage(null)
    const { data, error } = await supabase.rpc('helfer_signup', {
      p_shift_id: shift.id,
      p_name: name.trim(),
      p_phone: phone.trim() || null,
    })
    setBusy(false)
    if (error) {
      setMessage(error.message.includes('SHIFT_FULL')
        ? 'Diese Schicht ist inzwischen voll besetzt.'
        : 'Eintragen fehlgeschlagen – bitte später erneut versuchen.')
      onChanged()
      return
    }
    rememberSignup(data as string, shift.id)
    setShowForm(false)
    setName('')
    setPhone('')
    onChanged()
  }

  async function cancel() {
    if (busy || !mySignup) return
    setBusy(true)
    const { error } = await supabase.rpc('helfer_cancel_signup', { p_signup_id: mySignup.signupId })
    setBusy(false)
    if (error) {
      setMessage('Austragen fehlgeschlagen – bitte später erneut versuchen.')
      onChanged()
      return
    }
    forgetSignup(mySignup.signupId)
    setMessage(null)
    onChanged()
  }

  return (
    <div className={status.full ? 'shift full' : 'shift open'}>
      <div className="shift-head">
        <strong>{shift.time_label}</strong> – {shift.title}
        {shift.note && <span className="note"> ({shift.note})</span>}
      </div>
      <div className="shift-status">
        {status.full ? '✓ Voll besetzt' : `Noch ${status.open} Helfer gesucht`}
      </div>
      <ul className="names">
        {signups.map((s, i) => (
          <li key={i}>{s.name}</li>
        ))}
      </ul>
      {mySignup && (
        <button className="link" disabled={busy} onClick={cancel}>
          Meinen Eintrag austragen
        </button>
      )}
      {!status.full && !showForm && !mySignup && (
        <button className="btn" onClick={() => setShowForm(true)}>Eintragen</button>
      )}
      {showForm && (
        <form onSubmit={signUp} className="signup-form">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" required />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon (optional)" />
          <button className="btn" type="submit" disabled={busy}>Eintragen</button>
          <button className="link" type="button" onClick={() => setShowForm(false)}>Abbrechen</button>
        </form>
      )}
      {message && <p className="error">{message}</p>}
    </div>
  )
}
