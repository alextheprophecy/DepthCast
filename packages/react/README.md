# @depthcast/react

React wrapper for [depthcast](https://github.com/alextheprophecy/depthcast) — drop-in interactive 3D pop-out images.

```bash
npm i depthcast @depthcast/react
```

```tsx
import { Depth3D } from '@depthcast/react'
;<Depth3D src="/cat.jpg" intensity={0.5} controls="pointer" style={{ height: 480 }} />
```

SSR-safe (Next.js / Remix): renders nothing on the server, hydrates cleanly. Cheap option changes (`intensity`, `controls`, `edgeHandling`, `damping`) update live without rebuilding the scene.

MIT.
