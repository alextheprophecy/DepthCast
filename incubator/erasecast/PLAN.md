# erasecast — project plan

> **One line:** _Click an object — it's gone. Private, in your browser._
> Point or brush at anything, **SAM2** turns the click into a precise mask, **LaMa** inpaints the
> hole, and a **high-resolution tiled compositor** stitches the result back **without seams** —
> 100% client-side, no upload, no server.

erasecast belongs to the same family as [depthcast](https://github.com/alextheprophecy/depthcast):
**wrap a strong recent model, then own the genuinely hard rendering/compositing problem nobody
packages well** — and ship it as one `import` with a runtime mode and a precompute/batch CLI.

---

## 1. The gap (why this earns stars)

"Magic eraser" is one of the most-loved features on phones, yet on the web every path has a wall:

| Existing path | Wall |
| --- | --- |
| **Cloud erasers** (Cleanup.pictures, Adobe, etc.) | Upload your photo to a **server**; rate-limited, paid, **privacy cost**. |
| **`lama-cleaner` / ComfyUI** | Python + local GPU; not embeddable in a web app. |
| **Browser SAM2 / LaMa demos** | Scattered one-off demos — **no packaged library**, and they break down at high resolution. |
| **Photoshop content-aware fill** | Desktop, manual, not a library. |

There is **no `npm i` library that does the full select→erase pipeline client-side and survives
high-resolution images.** That is the gap.

## 2. Why it's feasible now

- **SAM2** (`sam2-hiera-tiny`) has ONNX exports — encoder (~134 MB, fixed 1024²) + a tiny decoder —
  and **runs in `onnxruntime-web` on WebGPU** today. Click → mask, interactively.
- **LaMa** has ONNX exports (~200 MB, 51 M params, fixed 512²) that run in `onnxruntime-web`, and it
  **generalizes well past its training resolution** — which is exactly what makes tiling viable.
- Both are permissively usable and fully client-side, so images **never leave the device** — a real
  differentiator versus every cloud eraser.

**Sources:** SAM2 ONNX (`sam2_hiera_tiny.encoder.onnx` ≈134 MB, 1024² input) + browser SAM2 demos;
LaMa-ONNX (`Carve/LaMa-ONNX`, 512² fixed, ~200 MB) + `onnxruntime-web` inpainting write-ups.

## 3. The one genuinely hard problem we own: **seamless high-res inpainting**

depthcast owns _disocclusion_. erasecast owns the **tiled, seam-free, high-resolution composite.**

LaMa runs at 512². Real photos are 2–12 MP. Naïvely downscaling to 512, inpainting, and upscaling
gives a blurry mush exactly where the user is looking. Naïve tiling gives **visible seams** and
**wasted compute** (you re-inpaint tiles that don't touch the mask). Owning this is the moat:

- **Mask-aware tiling** — only run LaMa on tiles whose region intersects the (dilated) mask.
- **Context-padded tiles** — each tile is cropped with surrounding context so LaMa has real pixels to
  borrow from, then center-cropped back.
- **Overlap + feathered blend** — adjacent tiles overlap; we **feather/Poisson-blend** the overlap so
  there is no visible seam where tiles meet.
- **Mask dilation + edge-band recompositing** — only the masked region (plus a small feather band) is
  taken from the inpaint; everything outside is the **original untouched pixels**, so we never soften
  the rest of the image.
- **Progressive refinement** — show a fast low-res result instantly, then refine tiles in the
  background (the perceived-speed trick).

Strategies are selectable (mirrors depthcast's `edgeHandling`): `tiled` _(default)_ / `single`
(downscale-once, fastest) / `progressive`.

## 4. Architecture (mirrors depthcast)

```
input → loader (normalize, keep full-res original)
      → segment   (onnxruntime-web · SAM2 · WebGPU→WASM)  click/box/brush → mask
      → refine    (mask dilation + feather band)
      → inpaint   (onnxruntime-web · LaMa, per tile)
      → compositor (THE HARD PART: mask-aware tiling + overlap feather/Poisson blend)
      → original-pixel recomposite (only masked band changes)
```

The masking, tiling/overlap math, dilation and blend are **pure and unit-tested**; model I/O is
isolated behind small adapters so SAM2/LaMa can be swapped (e.g. MAT, ZITS, future models).

## 5. Two modes (the depthcast pattern)

1. **Runtime — magic ✨**: interactive editor. Click/brush to select, erase, undo/redo — all local.
   Models lazy-load from CDN and cache in the browser after first use.
2. **Precompute / batch — production 🚀**: a CLI to clean a folder of images headlessly given masks
   (or auto-detected objects), for build pipelines and bulk cleanup.

```bash
npx @erasecast/cli remove product.jpg --mask sticker.png -o product.clean.png
npx @erasecast/cli remove ./shots/*.jpg --auto "price tag" -o ./clean/   # SAM2 text-ish/auto masks
```

## 6. Public API (sketch)

```ts
const eraser = await createEraser('/photo.jpg', {
  samModel: 'onnx-community/sam2-hiera-tiny',
  inpaintModel: 'Carve/LaMa-ONNX',
  device: 'auto',          // webgpu → wasm
  strategy: 'tiled',       // 'tiled' | 'single' | 'progressive'
  tileSize: 512,
  overlap: 64,             // feathered blend band between tiles
  maskDilation: 16,        // grow the mask so edges of the object are caught
  feather: 8,              // soft recomposite band against the original
})

eraser.mount(el)                       // interactive canvas
const mask = await eraser.selectAt(x, y)  // SAM2 click → mask (positive)
eraser.addPoint(x, y, false)              // negative point to subtract
eraser.brush(path, { add: true })         // manual brush
const result = await eraser.erase()       // returns cleaned ImageData
eraser.undo(); eraser.redo()
const blob = await eraser.toBlob('image/png')
eraser.dispose()
```

React: `<Eraser src="/photo.jpg" onErase={(blob) => …} />` — interactive, SSR-safe.

## 7. Roadmap

- [ ] SAM2 click/box select in browser (encoder cache + fast decoder)
- [ ] LaMa single-pass inpaint (downscale mode)
- [ ] **Mask-aware tiled compositor** with overlap feather blend (the moat)
- [ ] Brush + add/subtract points, undo/redo history
- [ ] React `<Eraser/>` + batch CLI
- [ ] Poisson blending option for tricky gradients
- [ ] Auto-detect mode (text prompt → mask) via open-vocab detector
- [ ] Object *replace* (swap LaMa for a diffusion fill) as an opt-in plugin

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Combined model download (~330 MB+) | Lazy-load + browser cache; encoder loads on first interaction; quantize where possible; precompute/batch path needs no client models. |
| LaMa weak on large/structured holes | Tiling + context padding; expose `strategy`; roadmap diffusion-fill plugin for hard cases. |
| Seams at tile boundaries | Overlap + feather/Poisson blend; only recomposite the masked band over the untouched original. |
| Memory on big images | Stream tiles; cap working resolution with opt-in full-res refine; release tensors aggressively. |
| WebGPU availability | WASM fallback (slower but functional). |
