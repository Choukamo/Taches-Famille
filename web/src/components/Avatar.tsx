import type { Member } from '../lib/types'

export function Avatar({ m, size = 36 }: { m: Pick<Member, 'name' | 'color'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: m.color, fontSize: size * 0.42 }} title={m.name}>
      {m.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Avatars({ members, size = 28 }: { members: Member[]; size?: number }) {
  return (
    <span className="avatars">
      {members.map((m) => <Avatar key={m.id} m={m} size={size} />)}
    </span>
  )
}
