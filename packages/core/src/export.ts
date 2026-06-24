import { resolveCameraPath } from './camera'
import type { ExportOptions } from './types'

interface CanvasCaptureTrack extends MediaStreamTrack {
  requestFrame?: () => void
}

function pickMimeType(preferred?: string): string {
  const candidates = [
    preferred,
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].filter(Boolean) as string[]
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return 'video/webm'
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Drive a camera loop and capture it to a WebM Blob via MediaRecorder.
 * `render(x, y, zoom)` must synchronously draw one frame to `canvas`.
 */
export async function exportVideo(
  canvas: HTMLCanvasElement,
  render: (x: number, y: number, zoom: number) => void,
  opts: ExportOptions = {},
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('depthcast: MediaRecorder is not available in this environment')
  }
  const path = resolveCameraPath(opts.path)
  const fps = opts.fps ?? 30
  const durationMs = opts.durationMs ?? path.duration * 1000
  const bitrate = opts.bitrate ?? 8_000_000
  const mimeType = pickMimeType(opts.mimeType)

  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureTrack
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  recorder.start()
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps))
  for (let f = 0; f < totalFrames; f++) {
    const t = f / totalFrames
    const { x, y, zoom } = path.sample(t)
    render(x, y, zoom)
    track.requestFrame?.()
    await delay(1000 / fps)
  }
  recorder.stop()
  return done
}
