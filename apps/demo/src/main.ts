import { createDepthcast, type DepthScene, type DepthcastOptions } from 'depthcast'
import { env } from '@huggingface/transformers'

// --- Make the hosted demo work on static hosting (GitHub Pages) + mobile ---
// transformers.js bundles a dev build of onnxruntime-web that isn't on any
// public CDN, so we must use the WASM binary Vite emitted next to our bundle
// (same-origin) — NOT a CDN wasmPaths override. Pages also can't send COOP/COEP,
// so SharedArrayBuffer (threaded WASM) is unavailable: force single-threaded.
// WebGPU's jsep module isn't bundled for the web build, so we run on WASM.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const dropzone = $<HTMLDivElement>('dropzone')
const viewport = $<HTMLDivElement>('viewport')
const fileInput = $<HTMLInputElement>('file')
const progress = $<HTMLDivElement>('progress')
const progressBar = progress.querySelector('.bar') as HTMLElement
const progressText = progress.querySelector('span') as HTMLElement
const controls = $<HTMLElement>('controls')
const samplesEl = $<HTMLDivElement>('samples')

const SAMPLES = [
  'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=1000&q=80',
  'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=1000&q=80',
  'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=1000&q=80',
  'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1000&q=80',
]

let scene: DepthScene | null = null

const STAGE_LABELS: Record<string, string> = {
  model: 'Downloading model',
  inference: 'Estimating depth',
  depth: 'Loading depth',
  build: 'Building scene',
}

function setProgress(stage: string, pct: number) {
  progress.hidden = false
  progressBar.style.setProperty('--pct', `${Math.round(pct)}%`)
  progressText.textContent = `${STAGE_LABELS[stage] ?? stage}… ${Math.round(pct)}%`
}

async function load(src: string | File) {
  scene?.dispose()
  scene = null
  dropzone.hidden = true
  viewport.hidden = false
  controls.hidden = true
  setProgress('model', 0)

  const options: DepthcastOptions = {
    intensity: Number($<HTMLInputElement>('intensity').value),
    edgeHandling: $<HTMLSelectElement>('edge').value as DepthcastOptions['edgeHandling'],
    controls: $<HTMLSelectElement>('ctrl').value as DepthcastOptions['controls'],
    // Same-origin single-threaded WASM + q8 model keeps inference viable here.
    device: 'wasm',
    quality: 'low',
    maxResolution: isMobile ? 640 : 832,
    onProgress: setProgress,
  }

  try {
    scene = await createDepthcast(src, options)
    scene.mount(viewport)
    progress.hidden = true
    controls.hidden = false
  } catch (err) {
    progressText.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// --- dropzone ---
dropzone.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0]
  if (f) void load(f)
})
;['dragover', 'dragenter'].forEach((t) =>
  dropzone.addEventListener(t, (e) => {
    e.preventDefault()
    dropzone.classList.add('drag')
  }),
)
;['dragleave', 'drop'].forEach((t) =>
  dropzone.addEventListener(t, () => dropzone.classList.remove('drag')),
)
dropzone.addEventListener('drop', (e) => {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) void load(f)
})

// --- samples ---
for (const url of SAMPLES) {
  const img = new Image()
  img.src = url
  img.loading = 'lazy'
  img.addEventListener('click', () => void load(url))
  samplesEl.appendChild(img)
}

// --- live controls ---
$<HTMLInputElement>('intensity').addEventListener('input', (e) =>
  scene?.update({ intensity: Number((e.target as HTMLInputElement).value) }),
)
$<HTMLSelectElement>('ctrl').addEventListener('change', (e) =>
  scene?.update({
    controls: (e.target as HTMLSelectElement).value as DepthcastOptions['controls'],
  }),
)
$<HTMLSelectElement>('edge').addEventListener('change', (e) =>
  scene?.update({
    edgeHandling: (e.target as HTMLSelectElement).value as DepthcastOptions['edgeHandling'],
  }),
)
$<HTMLButtonElement>('play').addEventListener('click', () => scene?.play('orbit'))
$<HTMLButtonElement>('export').addEventListener('click', async () => {
  if (!scene) return
  const btn = $<HTMLButtonElement>('export')
  btn.textContent = 'Rendering…'
  try {
    const blob = await scene.exportVideo({ path: 'orbit', durationMs: 4000 })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'depthcast.webm'
    a.click()
  } finally {
    btn.textContent = '⬇ Export WebM'
  }
})
