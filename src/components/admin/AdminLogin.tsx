import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('lukasscheidhauer@gmx.de')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('Anmeldung fehlgeschlagen – E-Mail/Passwort prüfen.')
  }

  return (
    <div className="container">
      <h1>Admin-Anmeldung</h1>
      <form onSubmit={login} className="admin-form">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail" type="email" required />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort" type="password" required />
        <button className="btn" type="submit" disabled={busy}>Anmelden</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
