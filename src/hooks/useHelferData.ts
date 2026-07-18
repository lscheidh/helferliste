import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { HelferEvent, PublicSignup, Shift } from '../types'

export function useHelferData() {
  const [event, setEvent] = useState<HelferEvent | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [signups, setSignups] = useState<PublicSignup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reloadId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++reloadId.current
    setError(null)
    const { data: events, error: e1 } = await supabase
      .from('helfer_events').select('*').eq('is_active', true).limit(1)
    if (id !== reloadId.current) return
    if (e1) { setError(e1.message); setLoading(false); return }
    const ev = (events ?? [])[0] ?? null
    setEvent(ev)
    if (!ev) { setShifts([]); setSignups([]); setLoading(false); return }

    const { data: sh, error: e2 } = await supabase
      .from('helfer_shifts').select('*')
      .eq('event_id', ev.id)
      .order('day').order('sort_order')
    if (id !== reloadId.current) return
    if (e2) { setError(e2.message); setLoading(false); return }
    setShifts(sh ?? [])

    const { data: su, error: e3 } = await supabase
      .rpc('helfer_public_signups', { p_event_id: ev.id })
    if (id !== reloadId.current) return
    if (e3) { setError(e3.message); setLoading(false); return }
    setSignups(su ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])
  return { event, shifts, signups, loading, error, reload }
}
