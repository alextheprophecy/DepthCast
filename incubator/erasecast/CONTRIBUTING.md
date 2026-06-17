# Contributing to erasecast

Thanks for your interest! erasecast is a pnpm monorepo.

## Setup

```bash
pnpm install
pnpm build        # build the libraries (core → react/cli depend on it)
pnpm dev          # run the demo app (apps/demo) at localhost:5173
```

## Layout

```
packages/core    # `erasecast` — SAM2 select + LaMa inpaint + tiled compositor
packages/react   # `@erasecast/react` — <Eraser /> wrapper
packages/cli     # `@erasecast/cli` — batch object removal
apps/demo        # Vite playground
```

## Checks (must pass before a PR merges)

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Conventions

- `packages/core` keeps model I/O behind small adapters (`segment`, `inpaint`) so models can be
  swapped. Inference via `onnxruntime-web`.
- The masking, tiling/overlap and blend math are **pure and unit-tested**. Add tests when you touch
  the compositor — it's the part that has to be correct.
- Keep the public API in `packages/core/src/types.ts` small and stable — treat it as a contract.
