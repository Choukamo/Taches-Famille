import { useEffect, useRef, useState } from 'react'
import type { Member } from '../lib/types'

type Props = {
  candidates: Member[]
  winners: Member[]
  title: string
  onClose: () => void
  autoSpin?: boolean
}

function drawWheel(canvas: HTMLCanvasElement, members: Member[], angle: number) {
  const dpr = window.devicePixelRatio || 1
  const size = canvas.clientWidth
  if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2, cy = size / 2, r = size / 2 - 6
  const n = members.length
  const slice = (Math.PI * 2) / n
  for (let i = 0; i < n; i++) {
    const start = angle + i * slice
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, start, start + slice)
    ctx.closePath()
    ctx.fillStyle = members[i].color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(start + slice / 2)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.font = `800 ${Math.max(14, size / 14)}px Nunito, sans-serif`
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 4
    ctx.fillText(members[i].name, r - 18, 0)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 6
  ctx.stroke()
}

export function Wheel({ candidates, winners, title, onClose, autoSpin = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle')
  const angleRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    drawWheel(c, candidates, angleRef.current)
  }, [candidates])

  const spin = () => {
    if (phase === 'spinning') return
    const c = ref.current!
    const n = candidates.length
    const idx = Math.max(0, candidates.findIndex((m) => m.id === winners[0]?.id))
    const slice = (Math.PI * 2) / n
    // La flèche est en haut (-90°). On veut que le centre du secteur gagnant finisse sous la flèche.
    const target = -Math.PI / 2 - (idx * slice + slice / 2) + (Math.random() - 0.5) * slice * 0.6
    const turns = 5 + Math.floor(Math.random() * 3)
    const start = angleRef.current
    const normalizedStart = ((start % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const normalizedTarget = ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    let delta = normalizedTarget - normalizedStart
    if (delta < 0) delta += Math.PI * 2
    const total = delta + turns * Math.PI * 2
    const duration = 4200
    const t0 = performance.now()
    setPhase('spinning')
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      angleRef.current = start + total * eased
      drawWheel(c, candidates, angleRef.current)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else {
        setPhase('done')
        if (navigator.vibrate) navigator.vibrate([60, 40, 60])
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    if (autoSpin) {
      const t = setTimeout(spin, 500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const winnerNames = winners.map((w) => w.name)
  const label = winnerNames.length > 1
    ? winnerNames.slice(0, -1).join(', ') + ' et ' + winnerNames[winnerNames.length - 1]
    : winnerNames[0]

  return (
    <div className="overlay" onClick={phase === 'done' ? onClose : undefined}>
      <div className="sheet fade-in" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="muted small">Roulette pour</p>
          <h2>{title}</h2>
        </div>
        <div className="wheel-wrap">
          <div className="wheel-pointer" />
          <canvas ref={ref} />
          <div className="wheel-center" />
        </div>
        {phase === 'done' ? (
          <div className="fade-in stack" style={{ alignItems: 'center' }}>
            <p className="muted">{winners.length > 1 ? 'Les tirés au sort sont' : 'La personne tirée au sort est'}</p>
            <h1 style={{ color: winners[0]?.color }}>{label}</h1>
            <button className="btn big block" onClick={onClose}>OK</button>
          </div>
        ) : phase === 'idle' ? (
          <button className="btn big block" onClick={spin}>Lancer la roulette</button>
        ) : (
          <p className="muted">Ça tourne…</p>
        )}
      </div>
    </div>
  )
}
