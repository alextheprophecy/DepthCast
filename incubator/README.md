# incubator — two new CV projects, scaffolded

This folder holds **two complete, self-contained project scaffolds** designed as siblings to
depthcast, plus the brainstorm that produced them. Each subfolder is its own pnpm monorepo
(`packages/core` + `react` + `cli` + `apps/demo`) and is meant to graduate into **its own GitHub repo**.

| project | one-liner | model | the hard problem it owns |
| --- | --- | --- | --- |
| [**lightcast**](./lightcast) | Relight any photo from one image, in the browser | Metric3D v2 (normals + depth) | **de-lighting** (albedo recovery) |
| [**erasecast**](./erasecast) | Click an object — it's gone, in the browser | SAM2 + LaMa | **seamless high-res tiled inpainting** |

Each has a full `PLAN.md` (gap analysis, feasibility, architecture, API, roadmap, risks) and a
sellable `README.md`.

## Why they live here (for now)

The plan was to create two standalone GitHub repos. The automation's GitHub integration is **scoped to
`alextheprophecy/depthcast` only** and isn't permitted to create new repositories
(`403 Resource not accessible by integration`), so the scaffolds were committed here instead. They are
structured to extract cleanly with zero edits.

## Graduating one into its own repo

1. Create the empty repo on GitHub (e.g. `alextheprophecy/lightcast`).
2. From the depthcast repo root:

   ```bash
   ./incubator/split-repo.sh lightcast git@github.com:alextheprophecy/lightcast.git
   ```

   This copies `incubator/lightcast/` into a fresh git repo (preserving the file tree), makes an
   initial commit, and pushes to the new remote. Repeat for `erasecast`.

Alternatively, grant the integration repo-creation scope (or add the new repos to this session via the
`add_repo` tooling) and they can be created + pushed directly.
