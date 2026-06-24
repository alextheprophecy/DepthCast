/**
 * Public type contract for depthcast.
 *
 * The whole library is designed around two workflows:
 *
 *  1. Runtime mode  — pass an image, we run depth estimation in the browser.
 *  2. Precompute mode — pass an image *and* a `depthMap` you baked offline
 *     (e.g. with the `depthcast` CLI). No 50 MB model is shipped to visitors.
 */

/** Anything we know how to turn into pixels. */
export type ImageSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap
  | ImageData
  | string // URL
  | File
  | Blob

/** A depth map you computed ahead of time (precompute workflow). */
export type DepthSource = ImageData | HTMLCanvasElement | HTMLImageElement | ImageBitmap | string

export type Device = 'webgpu' | 'wasm' | 'auto'

export type Quality = 'low' | 'medium' | 'high'

/**
 * How disocclusion (the holes revealed behind foreground objects as the
 * camera moves) is handled. This is the technically interesting part.
 *
 * - `feather`  — fade out fragments across steep depth edges. Cheap, hides
 *                the worst rubber-sheet stretching. The default.
 * - `inpaint`  — synthesize a background layer (push–pull hole filling) and
 *                render it behind the foreground, so revealed regions show
 *                plausible fill instead of stretched smears. The "3D photo" look.
 * - `none`     — raw displaced mesh, no edge treatment (fastest, ugliest).
 */
export type EdgeHandling = 'feather' | 'inpaint' | 'none'

export type ControlMode = 'pointer' | 'gyro' | 'scroll' | 'orbit' | 'none'

export type ProgressStage = 'model' | 'inference' | 'depth' | 'build'

export interface DepthcastOptions {
  /** HF depth-estimation model id. Default `onnx-community/depth-anything-v2-small`. */
  model?: string
  /** Execution backend. Default `auto` (webgpu, falling back to wasm). */
  device?: Device
  /** Preset bundling mesh resolution + model dtype. Default `medium`. */
  quality?: Quality
  /** Bring-your-own depth map; when provided, inference is skipped entirely. */
  depthMap?: DepthSource
  /**
   * Depth Anything emits *inverse* depth (near = bright). Set `false` if your
   * BYO map uses near = dark. Default `true`.
   */
  depthNearIsBright?: boolean
  /** Disocclusion strategy. Default `feather`. */
  edgeHandling?: EdgeHandling
  /** Displacement strength, roughly 0..1. Default `0.5`. */
  intensity?: number
  /** Parallax motion smoothing, 0 (snappy) .. 1 (very floaty). Default `0.12`. */
  damping?: number
  /** Input device that drives parallax. Default `pointer`. */
  controls?: ControlMode
  /** Downscale the longest image edge to this many px before inference. Default `1024`. */
  maxResolution?: number
  /** Background behind/around the subject. Default `'blur'`. */
  background?: 'blur' | 'mirror' | { color: string }
  /** Honor `prefers-reduced-motion` by disabling autoplay/parallax. Default `true`. */
  respectReducedMotion?: boolean
  /** Progress callback for model download, inference and scene build. */
  onProgress?: (stage: ProgressStage, pct: number) => void
}

/** A keyframed camera move for `play()` / `exportVideo()`. */
export interface CameraPath {
  /** Sample the path at `t` in 0..1, returning normalized parallax + zoom. */
  sample(t: number): { x: number; y: number; zoom: number }
  /** Loop duration in seconds. */
  duration: number
}

/** Built-in named camera animations. */
export type CameraPreset = 'orbit' | 'sway' | 'dolly' | 'float'

export interface ExportOptions {
  path?: CameraPath | CameraPreset
  durationMs?: number
  fps?: number
  width?: number
  height?: number
  /** Video bitrate in bits/s. Default 8_000_000. */
  bitrate?: number
  mimeType?: string
}

export interface DepthScene {
  /** The canvas the scene renders into. */
  readonly canvas: HTMLCanvasElement
  /** The computed (or supplied) depth map, exposed for reuse/precompute. */
  readonly depthMap: ImageData
  /** Attach the canvas to the DOM and start the render loop. */
  mount(container: HTMLElement): this
  /** Manually drive parallax; x,y in -1..1. Overrides automatic controls. */
  setParallax(x: number, y: number): void
  /** Update options live (intensity, controls, edgeHandling, …). */
  update(options: Partial<DepthcastOptions>): void
  /** Play an animated camera loop. */
  play(animation?: CameraPath | CameraPreset): void
  /** Pause animation/parallax. */
  pause(): void
  /** Render a camera loop to a WebM video Blob. */
  exportVideo(opts?: ExportOptions): Promise<Blob>
  /** Tear down GL resources, listeners and the render loop. */
  dispose(): void
}

/** Result of `estimateDepth` — the reusable core of the precompute workflow. */
export interface DepthResult {
  /** Normalized 8-bit depth, near = bright. Suitable to save as a PNG. */
  depth: ImageData
  width: number
  height: number
}
