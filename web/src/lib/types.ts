export type Member = {
  id: string
  name: string
  role: 'parent' | 'child'
  color: string
  sort_order: number
  avail_start: string
  avail_end: string
  alternating: boolean
  present_week_start: string | null
}

export type Assignee = {
  task_id: string
  member_id: string
  last_notified_at: string | null
  notify_count: number
}

export type Task = {
  id: string
  title: string
  note: string | null
  created_by: string
  scheduled_date: string
  interval_minutes: number
  mode: 'direct' | 'roulette'
  candidates: string[]
  status: 'open' | 'done'
  done_by: string | null
  done_at: string | null
  created_at: string
  task_assignees: Assignee[]
}

export type LeaderRow = { member_id: string; total: number; this_month: number; this_week: number }

export type Trade = {
  id: string
  from_member: string
  to_member: string
  requested: string[]
  offered: string[]
  message: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  notified_at: string | null
  result_notified_at: string | null
  created_at: string
  responded_at: string | null
}
