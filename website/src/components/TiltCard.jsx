import { useRef } from 'react'

/**
 * Pointer-reactive card: subtle 3D tilt plus a light glare that follows the
 * cursor. Falls back to a plain div on touch (no pointer-move events fire).
 */
export default function TiltCard({ className = '', glare = true, max = 7, children }) {
  const ref = useRef(null)

  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${
      (px - 0.5) * max
    }deg) translateY(-6px)`
    el.style.setProperty('--gx', `${px * 100}%`)
    el.style.setProperty('--gy', `${py * 100}%`)
  }

  const onLeave = () => {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`group relative transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {glare && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(420px circle at var(--gx,50%) var(--gy,50%), rgba(201,162,39,0.16), transparent 62%)',
          }}
        />
      )}
      {children}
    </div>
  )
}
