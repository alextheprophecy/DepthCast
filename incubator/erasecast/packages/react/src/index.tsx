import { useEffect, useRef } from 'react'
import { createEraser, type EraserOptions, type EraserSession } from 'erasecast'

export interface EraserProps extends EraserOptions {
  src: string
  className?: string
  style?: React.CSSProperties
  /** Called with the cleaned image whenever the user erases. */
  onErase?: (blob: Blob) => void
  onReady?: (session: EraserSession) => void
}

/**
 * Interactive object-removal canvas. Click to select (SAM2), then erase (LaMa).
 * SSR-safe: initializes only after mount.
 */
export function Eraser({ src, className, style, onErase, onReady, ...options }: EraserProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let session: EraserSession | undefined
    let cancelled = false
    const host = ref.current
    if (!host) return

    createEraser(src, options).then((s) => {
      if (cancelled) {
        s.dispose()
        return
      }
      session = s
      s.mount(host)

      // Click to select, then erase; emit the result.
      s.canvas.addEventListener('click', async (e) => {
        const rect = s.canvas.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * s.canvas.width
        const y = ((e.clientY - rect.top) / rect.height) * s.canvas.height
        await s.selectAt(x, y)
        await s.erase()
        if (onErase) onErase(await s.toBlob())
      })

      onReady?.(s)
    })

    return () => {
      cancelled = true
      session?.dispose()
      if (host) host.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  return <div ref={ref} className={className} style={{ position: 'relative', ...style }} />
}
