# Implementation Plan: esbuild Migration

## Overview

Migrate the build system from SystemJS/jspm (runtime transpilation) to esbuild (build-time bundling). 12 tasks covering dependency updates, source code migration, build scripts, and verification.

## Tasks

- [x] 1. Update package.json and install dependencies: Remove jspm, add esbuild (^0.21.0), upgrade typescript to ^5.5.0, upgrade electron-log to ^5.0.0, add "type": "module", set "engines": { "node": ">=22" }, set "main": "dist/app.js", update all scripts (build, dev, start, typecheck, package, make), run npm install successfully.
  - **Requirements:** 8.1, 8.2, 8.3, 10.2

- [ ] 2. Convert lib/noise.js to ESM and update floor.ts: Add `export { SimplexNoise }` to lib/noise.js, update lib/noise.d.ts to `export declare const SimplexNoise: any`, change floor.ts import from `import 'lib/noise'` to `import { SimplexNoise } from 'lib/noise'`.
  - **Requirements:** 1.4, 9.2

- [ ] 3. Update tsconfig.json for modern TypeScript: Set module ESNext, moduleResolution bundler, target ES2020, strict true, noEmit true, esModuleInterop true, skipLibCheck true, resolveJsonModule true, add paths for bare specifiers (sensors, display, floor, prod, lib/noise), update include globs.
  - **Requirements:** 7.1, 7.2, 7.3

- [ ] 4. Fix TypeScript type errors for TS 5.x strict mode: Fix BLSource.read() return type, remove unused Display import in main.ts, replace deprecated substr with substring, fix implicit any and null check issues, confirm tsc --noEmit exits 0.
  - **Requirements:** 7.3, 7.5

- [ ] 5. Create build.mjs (production build script): Use esbuild JS API with entry points [main.ts, behs/*.js], outdir dist, bundle true, splitting true, format esm, target chrome126, platform browser, alias map for bare specifiers, external electron, JSON loader, minify+treeshake for prod, copy static assets, transform HTML files, run tsc --noEmit, exit with correct codes.
  - **Requirements:** 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.1, 6.2, 6.4

- [ ] 6. Migrate main.ts from SystemJS to native ESM: Replace System.import("electron") with dynamic import(), replace System.import("behs/...") with import('./behs/...'), verify prod.json import works with esbuild JSON loader, remove all System references, wrap initialization in async IIFE or use top-level await, ensure self-initialization without onload.
  - **Requirements:** 2.1, 2.3, 3.5, 8.6

- [ ] 7. Transform HTML files: Remove SystemJS/config.js script tags and onload from both index.html and dev.html, add script type=module src=main.js, preserve div#scene and stylesheet link in both, preserve form controls in dev.html.
  - **Requirements:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

- [ ] 8. Create dev.mjs (development workflow script): Use esbuild context API with watch true, same alias/format as build.mjs but sourcemap true and minify false, copy/transform assets on startup, spawn Electron with --dev flag, log rebuild results to terminal, preserve last good bundle on error.
  - **Requirements:** 5.1, 5.2, 5.3, 5.4, 5.5

- [ ] 9. Update forge.config.js for dist/ output: Point packagerConfig at dist/ for app source, verify electron-forge package produces a working package, verify electron-forge make produces an installer, ensure app.js paths resolve correctly in packaged output.
  - **Requirements:** 4.2, 4.5, 6.3

- [ ] 10. Delete legacy SystemJS/jspm files: Delete config.js, packages/ directory, for-reference/ directory, out/ directory, update .gitignore (remove packages/ entry, add dist/), verify build and dev still work after deletion.
  - **Requirements:** 8.4, 8.6

- [ ] 11. End-to-end verification: Run npm run build (exits 0, dist/ matches design), run npm run dev (Electron launches, behavior renders), test sensor dropdown and mouse checkbox, verify production build (no sourcemaps, minified), verify npm run package, test behavior switching, verify BLAST semaphore callback, verify nightly restart, fresh clone test (npm install → npm run dev works).
  - **Requirements:** 9.1–9.9, 10.1–10.4, 5.2, 6.3, 8.5

- [ ] 12. Update README.md: Remove SystemJS/jspm references, document npm run build/dev/typecheck, document dist/ structure, update behavior writing section for ESM imports, remove config.js/packages references.
  - **Requirements:** 8.5

## Task Dependency Graph

```json
{
  "waves": [
    [1],
    [2, 3],
    [4],
    [5, 6, 7],
    [8, 9],
    [10],
    [11],
    [12]
  ]
}
```

## Notes

- Task 4 must be completed iteratively — run `tsc --noEmit` after each fix until zero errors
- Task 5 and 6 are tightly coupled — the build script must handle the new import patterns
- Task 10 is destructive — commit all prior work before deleting legacy files
- Task 11 is the integration gate — all prior tasks must pass before declaring done
- `app.js` stays CommonJS and is never processed by esbuild — it's only copied to dist/
