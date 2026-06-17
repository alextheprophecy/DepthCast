# erasecast

Client-side magic eraser — click an object, it's gone. SAM2 select + LaMa inpaint, high-res tiled and
seamless, 100% in the browser. Your images never leave the device.

```bash
npm i erasecast
```

```ts
import { createEraser } from 'erasecast'

const eraser = await createEraser('/photo.jpg')
eraser.mount(document.getElementById('app')!)
await eraser.selectAt(420, 310) // SAM2 click → mask
const cleaned = await eraser.erase()
```

Framework-agnostic core: SAM2 selection + LaMa inpainting (WebGPU→WASM via onnxruntime-web) and a pure,
unit-tested **mask-aware tiled compositor** (context-padded tiles + overlap feather blend) that keeps
high-res results seamless and the untouched regions pixel-for-pixel original.

📖 Full docs, design and roadmap: **https://github.com/alextheprophecy/erasecast**

MIT.
