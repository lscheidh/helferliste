import { useEffect, useState } from 'react'
import PublicView from './components/PublicView'
import PrintView from './components/PrintView'
import AdminView from './components/admin/AdminView'

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHashRoute()
  if (hash.startsWith('#/admin')) return <AdminView />
  if (hash.startsWith('#/print')) return <PrintView />
  return <PublicView />
}
