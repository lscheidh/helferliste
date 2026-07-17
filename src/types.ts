export interface HelferEvent {
  id: string
  name: string
  date_from: string
  date_to: string
  is_active: boolean
  created_at: string
}

export interface Shift {
  id: string
  event_id: string
  day: string
  time_label: string
  area: string
  title: string
  capacity: number
  note: string | null
  sort_order: number
}

export interface Signup {
  id: string
  shift_id: string
  name: string
  phone: string | null
  created_at: string
}

export type PublicSignup = Pick<Signup, 'shift_id' | 'name' | 'created_at'>
