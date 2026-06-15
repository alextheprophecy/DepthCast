# @depthcast/cli

Bake depth maps offline so production sites ship a tiny runtime instead of a 50 MB model.

```bash
npx @depthcast/cli precompute hero.jpg -o hero.depth.png
```

Then in the browser, inference is skipped entirely:

```ts
import { createDepthcast } from 'depthcast'

await createDepthcast('/hero.jpg', { depthMap: '/hero.depth.png' })
```

### Options

```
depthcast precompute <image> [options]

  -o, --out <file>     Output PNG (default: <image>.depth.png)
      --model <id>     HF depth model id
      --quality <q>    low | medium | high   (default: high)
      --max <px>       Downscale longest edge before inference (default: 1024)
      --invert         Write near = dark instead of near = bright
```

MIT.
