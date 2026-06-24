# Contributing to depthcast

Thanks for your interest! depthcast is a pnpm monorepo.

## Setup

```bash
pnpm install
pnpm build        # build the libraries (core → react/cli depend on it)
pnpm dev          # run the demo app (apps/demo) at localhost:5173
```

## Layout

```
packages/core    # `depthcast` — framework-agnostic pipeline + WebGL2 renderer
packages/react   # `@depthcast/react` — <Depth3D /> wrapper
packages/cli     # `@depthcast/cli` — offline depth precompute
apps/demo        # Vite playground (deployed)
spike/           # Phase-0 standalone reference (no build)
```

## Checks (must pass before a PR merges)

```bash
pnpm format      # prettier write
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI runs all of the above. The pure logic (`normalize`, `camera`, `inpaint` masking,
`loader.fitWithin`) is unit-tested with Vitest; please add tests when you touch it.

## Conventions

- `packages/core` stays **dependency-free** at runtime except `@huggingface/transformers`.
  No `three`. The renderer is hand-written WebGL2 on purpose.
- Keep the public API in `packages/core/src/types.ts` small and stable — treat it as a contract.
- Add a changeset for any user-facing change: `pnpm changeset`.

## Releasing

Maintainers run `pnpm changeset version` then `pnpm release` (Changesets → npm).
