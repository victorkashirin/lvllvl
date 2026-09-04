# Architecture migration

lvllvl is moving from one ordered global-script bundle to native ES modules one
feature seam at a time. The legacy graph remains declared in
`scripts/build-graph.mjs`; new code must enter through the module graph declared in
the same file.

## Module boundaries

- `src/js/bootstrap.mjs` is the composition root. It may read browser globals and
  passes those dependencies into adapters explicitly.
- `src/js/modules/featureRegistry.mjs` owns feature registration, single-flight
  loading, activation, and retry after a failed load.
- Feature modules under `src/js/modules/` may depend on other modules, but may not
  access browser hosts (`window`, `document`, `navigator`, or web storage),
  `globalThis`, `g_app`, or `eval` directly.
- A feature adapter may expose a small compatibility facade to legacy callers while
  its implementation is loading. The adapter replaces that facade with the real
  feature instance after successful activation.

`node scripts/module-boundaries.mjs` parses every declared module, rejects undeclared
or layer-crossing imports, rejects new global coupling outside the composition root,
and rejects unreachable module files. It runs as part of the normal source and build
verification.

## First migrated feature

The image importer is emitted as `js/features/image-import.js` instead of being part
of the initial `js/main.js` payload. Existing menu, mobile, drag-and-drop, frame
animation, and tile-palette callers use a compatibility facade. The first call to
`start()` loads the feature once, creates `ImportImage`, initializes it with the
text-mode editor interface, and replaces the facade. A failed request remains
retryable and displays a persistent error message.

Use the same sequence for later migrations: identify one host interface, add a
module adapter, keep the legacy surface narrow, split the ordered implementation
into a lazy bundle, add failure and browser activation coverage, then move internals
behind the interface without expanding global access.
