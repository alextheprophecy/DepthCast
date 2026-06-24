import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  createDepthcast,
  type DepthScene,
  type DepthcastOptions,
  type ImageSource,
} from 'depthcast'

export interface Depth3DProps extends Omit<DepthcastOptions, 'onProgress'> {
  /** Image source: URL string, File/Blob, or any supported element. */
  src: ImageSource
  className?: string
  style?: CSSProperties
  /** Called once the interactive scene is ready. */
  onReady?: (scene: DepthScene) => void
  /** Called on any load/inference error. */
  onError?: (error: unknown) => void
  /** Progress 0..1 across the whole pipeline. */
  onProgress?: (pct: number) => void
}

/**
 * Drop-in interactive 3D pop-out image.
 *
 * SSR-safe: all browser work happens inside an effect, so it renders nothing
 * on the server and hydrates cleanly (Next.js, Remix, …).
 */
export function Depth3D({
  src,
  className,
  style,
  onReady,
  onError,
  onProgress,
  ...options
}: Depth3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<DepthScene | null>(null)
  const [loading, setLoading] = useState(true)

  // Re-create the scene only when the image source changes; cheap option
  // tweaks go through scene.update() below.
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    createDepthcast(src, {
      ...options,
      onProgress: (_stage, pct) => onProgress?.(pct / 100),
    })
      .then((s) => {
        if (cancelled) {
          s.dispose()
          return
        }
        sceneRef.current = s
        if (containerRef.current) s.mount(containerRef.current)
        setLoading(false)
        onReady?.(s)
      })
      .catch((err) => {
        if (!cancelled) onError?.(err)
      })

    return () => {
      cancelled = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [src])

  // Live-update inexpensive options without rebuilding the scene.
  const { intensity, controls, edgeHandling, damping } = options
  useEffect(() => {
    sceneRef.current?.update({ intensity, controls, edgeHandling, damping })
  }, [intensity, controls, edgeHandling, damping])

  return (
    <div
      ref={containerRef}
      className={className}
      data-depthcast-loading={loading || undefined}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    />
  )
}
