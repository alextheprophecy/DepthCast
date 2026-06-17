# @erasecast/react

React wrapper for [erasecast](https://github.com/alextheprophecy/erasecast).

```tsx
import { Eraser } from '@erasecast/react'

export default function Editor() {
  return <Eraser src="/photo.jpg" onErase={(blob) => download(blob)} />
}
```

Click an object to remove it. SSR-safe. MIT.
