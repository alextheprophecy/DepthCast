# depthcast

Turn any image into an interactive 3D pop-out in the browser — automatic depth, no server, no manual depth map.

```bash
npm i depthcast
```

```ts
import { createDepthcast } from 'depthcast'

const scene = await createDepthcast('/cat.jpg', { intensity: 0.5, controls: 'pointer' })
scene.mount(document.getElementById('app')!)
```

Framework-agnostic core: depth via [Depth Anything V2](https://huggingface.co/onnx-community/depth-anything-v2-small) (WebGPU→WASM) + a hand-written, dependency-free WebGL2 displacement renderer with push–pull background inpainting for occlusion.

📖 Full docs, API reference and the two-mode (runtime vs precompute) guide: **https://github.com/alextheprophecy/depthcast**

MIT.
