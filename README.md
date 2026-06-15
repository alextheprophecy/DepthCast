<div align="center">

# depthcast

**Turn any image into an interactive 3D pop-out — in the browser.**
Automatic depth. No server. No hand-made depth map. One import.

[![npm](https://img.shields.io/npm/v/depthcast?color=6ee7ff)](https://www.npmjs.com/package/depthcast)
[![bundle size](https://img.shields.io/badge/core-~15kb-6ee7ff)](https://bundlephobia.com/package/depthcast)
[![license](https://img.shields.io/badge/license-MIT-6ee7ff)](./LICENSE)
[![CI](https://github.com/alextheprophecy/depthcast/actions/workflows/ci.yml/badge.svg)](https://github.com/alextheprophecy/depthcast/actions)

```bash
npm i depthcast
```

</div>

---

## Why

The "fake 3D photo / parallax" effect is everywhere, but every existing path has a wall:

- **[DepthFlow](https://github.com/BrokenSource/DepthFlow)** is Python + GPU shaders and renders **videos** — great offline, not embeddable in a web app.
- **Codrops / Pixi tutorials** look amazing but require you to **paint a depth map by hand in Photoshop**. That's the universal blocker.
- **TF.js Portrait Depth** auto-generates depth but is **portrait-only and dated**.

`depthcast` closes the gap: **image → automatic depth → interactive 3D**, 100% client-side, in a package you `import`. Depth runs in the browser via [Depth Anything V2](https://huggingface.co/onnx-community/depth-anything-v2-small) on WebGPU; rendering is a hand-written WebGL2 displacement pipeline with **zero peer dependencies** (no three.js).

## Quickstart

### Vanilla

```ts
import { createDepthcast } from 'depthcast'

const scene = await createDepthcast('/cat.jpg', { intensity: 0.5, controls: 'pointer' })
scene.mount(document.getElementById('app')!)
```

That's the whole thing. Move your mouse — the cat pops.

### React

```tsx
import { Depth3D } from '@depthcast/react'

export default function Hero() {
  return <Depth3D src="/cat.jpg" intensity={0.5} controls="pointer" style={{ height: 480 }} />
}
```

`<Depth3D />` is **SSR-safe** — it renders nothing on the server and hydrates cleanly in Next.js / Remix.

## Two modes (this is the important part)

A 50 MB model download per visitor is a non-starter for production. So depthcast has two first-class workflows:

### 1. Runtime — the magic ✨

Pass an image, depth is estimated in-browser. Perfect for prototyping, demos, and tools where the user brings their own image. The model is lazy-loaded from the HF CDN and **cached in the browser** after first use.

```ts
await createDepthcast(userUploadedFile) // depth computed on the fly
```

### 2. Precompute — production-ready 🚀

Bake the depth map **once, offline** with the CLI. Ship `image + depthmap.png + ~15 KB of runtime`. **No model is ever sent to your visitors.**

```bash
npx @depthcast/cli precompute hero.jpg -o hero.depth.png
```

```ts
// In the browser — inference is skipped entirely.
await createDepthcast('/hero.jpg', { depthMap: '/hero.depth.png' })
```

|                    | Runtime                       | Precompute                      |
| ------------------ | ----------------------------- | ------------------------------- |
| Shipped to visitor | ~15 KB runtime + ~50 MB model | ~15 KB runtime + a PNG          |
| First paint        | seconds (download + infer)    | instant                         |
| Best for           | tools, prototypes, UGC        | portfolios, hero sections, prod |

## The interesting part: occlusion

When the camera moves, regions **behind** foreground objects become visible — but a flat displaced mesh has no texture there and "rubber-sheets" into ugly smears. This is the one genuinely hard problem, and depthcast gives you three strategies via `edgeHandling`:

- **`feather`** _(default)_ — fade fragments across steep depth edges so the stretch is hidden. Cheap, runs anywhere.
- **`inpaint`** — synthesize a **background layer** with foreground silhouettes removed and filled (a **push–pull image pyramid**, the classic "3D photo" approach), rendered behind the displaced foreground. Revealed gaps show plausible background instead of smears.
- **`none`** — raw mesh, fastest, ugliest.

```ts
await createDepthcast('/portrait.jpg', { edgeHandling: 'inpaint' })
```

## API

```ts
const scene = await createDepthcast(input, options)
```

**`input`** — `HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap | ImageData | string (URL) | File | Blob`

**`options`** (all optional):

| option                 | type                                                   | default                                  | notes                                     |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------- | ----------------------------------------- |
| `model`                | `string`                                               | `onnx-community/depth-anything-v2-small` | any HF depth-estimation model id          |
| `device`               | `'webgpu' \| 'wasm' \| 'auto'`                         | `'auto'`                                 | webgpu → wasm fallback                    |
| `quality`              | `'low' \| 'medium' \| 'high'`                          | `'medium'`                               | mesh resolution + model dtype             |
| `depthMap`             | `ImageData \| string \| …`                             | —                                        | bring-your-own depth (skips inference)    |
| `edgeHandling`         | `'feather' \| 'inpaint' \| 'none'`                     | `'feather'`                              | disocclusion strategy                     |
| `intensity`            | `number`                                               | `0.5`                                    | displacement strength                     |
| `damping`              | `number`                                               | `0.12`                                   | parallax smoothing                        |
| `controls`             | `'pointer' \| 'gyro' \| 'scroll' \| 'orbit' \| 'none'` | `'pointer'`                              | input driver                              |
| `maxResolution`        | `number`                                               | `1024`                                   | downscale before inference                |
| `background`           | `'blur' \| 'mirror' \| { color }`                      | `'blur'`                                 | surround / fill                           |
| `respectReducedMotion` | `boolean`                                              | `true`                                   | honors `prefers-reduced-motion`           |
| `onProgress`           | `(stage, pct) => void`                                 | —                                        | `model` / `inference` / `depth` / `build` |

**Returns `DepthScene`:**

```ts
interface DepthScene {
  canvas: HTMLCanvasElement
  depthMap: ImageData
  mount(container: HTMLElement): this
  setParallax(x: number, y: number): void // -1..1, drive from anything
  update(options: Partial<DepthcastOptions>): void
  play(animation?: CameraPath | CameraPreset): void // 'orbit' | 'sway' | 'dolly' | 'float'
  pause(): void
  exportVideo(opts?): Promise<Blob> // WebM
  dispose(): void
}
```

### Export a loop to WebM

```ts
const blob = await scene.exportVideo({ path: 'orbit', durationMs: 4000, fps: 30 })
```

## How it works

```
input → loader (normalize + downscale)
      → depth   (transformers.js · Depth Anything V2 · WebGPU→WASM)
      → inpaint (push–pull background synthesis for disocclusion)
      → renderer (hand-written WebGL2: displaced grid mesh + edge-feather shader)
      → controls (pointer · gyro · scroll · orbit) + damped camera loop
```

The depth normalization, camera math, and inpaint masking are pure and unit-tested; the renderer is dependency-free WebGL2 (custom GLSL, tiny mat4 helpers).

## Browser support

- **WebGPU** (Chrome/Edge 121+, and others) for fast inference.
- **WASM** fallback everywhere transformers.js runs.
- Rendering needs **WebGL2** (universal in modern browsers).

## Packages

| package                                | what                       |
| -------------------------------------- | -------------------------- |
| [`depthcast`](./packages/core)         | framework-agnostic core    |
| [`@depthcast/react`](./packages/react) | `<Depth3D />` wrapper      |
| [`@depthcast/cli`](./packages/cli)     | `precompute` depth offline |

## Roadmap

- [x] Auto depth in-browser + WebGL2 displacement
- [x] `feather` + push–pull `inpaint` occlusion
- [x] precompute CLI · WebM export · React wrapper
- [ ] true layered-depth multi-plane rendering
- [ ] `react-three-fiber` adapter (`<DepthMesh />`)
- [ ] WebGPU renderer path

## License

MIT © [alextheprophecy](https://github.com/alextheprophecy). Model weights are downloaded from Hugging Face under their respective (permissive) licenses.
