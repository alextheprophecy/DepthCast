<div align="center">

# erasecast

**Click an object — it's gone. In the browser.**
Segment anything, erase it, fill the hole. No upload. No server. One import.

[![npm](https://img.shields.io/badge/npm-erasecast-7ee787)](https://www.npmjs.com/package/erasecast)
[![license](https://img.shields.io/badge/license-MIT-7ee787)](./LICENSE)

```bash
npm i erasecast
```

</div>

---

## Why

"Magic eraser" is one of the most-loved features on phones — but on the web every path hits a wall:

- **Cloud erasers** (Cleanup.pictures, Adobe Express…) **upload your photo to a server** — rate-limited, paid, and a privacy cost.
- **[lama-cleaner](https://github.com/Sanster/lama-cleaner) / ComfyUI** are Python + local GPU — not embeddable in a web app.
- **Browser SAM2 / LaMa demos** exist but are **one-off demos with no packaged API**, and they smear at high resolution.

`erasecast` closes the gap: **click → precise mask → inpaint → seamless composite**, 100% client-side, in a package you `import`. Selection uses [SAM2](https://github.com/facebookresearch/segment-anything-2); fill uses [LaMa](https://github.com/advimman/lama); both run in `onnxruntime-web` on WebGPU. **Your images never leave the device.**

Same family as [**depthcast**](https://github.com/alextheprophecy/depthcast): wrap strong models, then **own the hard compositing problem** nobody packages well.

## Quickstart

```ts
import { createEraser } from 'erasecast'

const eraser = await createEraser('/photo.jpg')
eraser.mount(document.getElementById('app')!)

await eraser.selectAt(420, 310) // SAM2 click → mask
const cleaned = await eraser.erase() // ImageData with the object removed
```

### React

```tsx
import { Eraser } from '@erasecast/react'

export default function Editor() {
  return <Eraser src="/photo.jpg" onErase={(blob) => download(blob)} />
}
```

Click an object, brush to refine, undo/redo — all local. `<Eraser />` is **SSR-safe**.

## The interesting part: seamless high-res inpainting

LaMa runs at **512×512**. Real photos are 2–12 MP. Downscaling the whole image to 512 blurs exactly
where the user is looking; naïve tiling leaves **visible seams**. erasecast owns this:

- **Mask-aware tiling** — only inpaint tiles that intersect the (dilated) mask.
- **Context-padded tiles** — each tile carries surrounding pixels so LaMa has real context to borrow.
- **Overlap + feather/Poisson blend** — adjacent tiles overlap and blend, so no seam where they meet.
- **Edge-band recomposite** — only the masked region (plus a soft feather) is replaced; the rest of the photo stays **pixel-for-pixel original**.
- **Progressive refinement** — instant low-res preview, then sharpen tiles in the background.

Selectable via `strategy`: **`tiled`** _(default)_ / `single` / `progressive` — mirroring depthcast's `edgeHandling`.

## Two modes

### 1. Runtime — the magic ✨
Interactive editor: click/brush to select, erase, undo/redo. Models lazy-load from CDN and cache after first use.

### 2. Batch — production 🚀
A CLI to clean folders headlessly given masks (or auto-detected objects), for build pipelines and bulk cleanup.

```bash
npx @erasecast/cli remove product.jpg --mask sticker.png -o product.clean.png
npx @erasecast/cli remove ./shots/*.jpg --auto "price tag" -o ./clean/
```

## How it works

```
input → loader (keep full-res original)
      → segment (SAM2 · click/box/brush → mask · WebGPU→WASM)
      → refine  (dilate + feather band)
      → inpaint (LaMa, per tile) → compositor (mask-aware tiling + feather/Poisson blend)
      → recomposite only the masked band over the untouched original
```

See [`PLAN.md`](./PLAN.md) for the full design, feasibility analysis and roadmap.

## Packages

| package | what |
| --- | --- |
| [`erasecast`](./packages/core) | framework-agnostic core |
| [`@erasecast/react`](./packages/react) | `<Eraser />` wrapper |
| [`@erasecast/cli`](./packages/cli) | batch `remove` offline |

## License

MIT © [alextheprophecy](https://github.com/alextheprophecy). Model weights are downloaded from Hugging Face under their respective (permissive) licenses.
