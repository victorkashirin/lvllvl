# Architecture migration

lvllvl is moving from one ordered global-script bundle to native ES modules one
feature seam at a time. The remaining legacy graph is declared in
`scripts/build-graph.mjs`; new application code belongs in a governed module
source root.

## Automatic module governance

`src/js/bootstrap.mjs` and every `.mjs` file below `src/js/modules/` are discovered
automatically. The same discovered set drives source verification, production
copying, required-output checks, artifact goldens, and the dependency report. A
new file therefore cannot be hidden by omitting it from a separate manifest:
unreachable files, imports outside the governed roots, and production omissions
all fail the normal checks.

`node scripts/module-boundaries.mjs` parses the graph and prints each module's
layer and direct dependencies. It rejects:

- browser or storage globals outside designated composition/infrastructure
  adapters;
- reverse layer imports;
- cross-package imports that bypass a declared public entry point;
- non-literal dynamic imports and imports outside governed roots;
- unreachable modules; and
- dependency cycles without a specific documented exception.

The layer direction is:

```text
bootstrap/composition
        |
        +--> feature adapters --> application services --> domain modules
        |                              |
        +--> infrastructure adapters --+
```

The source locations are `modules/feature-adapters/`, `modules/application/`,
`modules/domain/`, and `modules/infrastructure/`. `src/js/bootstrap.mjs` is the
composition root and selects concrete adapters. Public entry points and allowed
layer directions live in `moduleGraph`; the module file list does not.

Production imports receive the release query only while being copied to `dist/`,
so source imports remain statically resolvable while deployed modules retain cache
busting.

## Feature lifetime

Every feature declares one of three scopes:

- `application` creates one application-wide instance;
- `context` creates one instance for each editor, document, or route context; and
- `per-use` creates a fresh instance for every activation.

Code loading is single-flight independently of scope. Context activations are
single-flight only for the same context; simultaneous different contexts cannot
receive one another's state. Failed loading and activation remain retryable.
Context and per-use definitions must provide disposal, and the registry exposes
both targeted `dispose()` and `disposeAll()` operations.

The image importer is context-scoped. Disposal releases an optional importer
cleanup hook and restores the editor's compatibility facade, allowing later
reactivation without reloading its code.

## Boundary contracts

Public module ports use checked JSDoc contracts. `tsc -p jsconfig.modules.json`
checks only the governed module graph and its composition declarations; the legacy
tree is intentionally outside this first type-checking boundary. The contract
check, graph check, and legacy-growth check run together through
`npm run architecture:check` and as part of source tests.

`FeatureRegistry.register()` returns a typed feature handle whose activation
context, instance, facade, and disposal target are inferred from the registered
definition. New module callers should retain that handle instead of using the
string-based compatibility methods exposed to the legacy editor.

## Legacy graph non-growth

`tests/fixtures/legacy-main-graph.json` records the current ordered `js/main.js`
inputs. Removing migrated files requires shrinking that baseline. Adding an input
requires a named entry in `legacyGraphExceptions` with a review reason and an
expiry date; missing, stale, invalid, and expired exceptions fail CI. This keeps
the compatibility graph explicit while allowing a time-bounded emergency bridge.
CI compares the fixture with the pull request's base revision (or the preceding
revision on a direct push), so adding a file to both the graph and fixture cannot
bypass the exception policy. The checkout must retain full history for this check.

## Performance baselines

`npm run performance:baseline` builds the production application and records
`docs/performance-baseline.json` on representative Chromium desktop and a
four-times CPU-throttled minimum-mobile profile. The report contains:

- raw and gzip bytes for every initially requested JavaScript and CSS chunk;
- JavaScript parse and execution time through the visible start page;
- start-page and editor-ready timings;
- cold and warm activation time, request count, and request bytes for each measured
  lazy feature; and
- diagnostic heap retention after feature disposal.

Heap retention is marked diagnostic-only because garbage collection and browser
internals make small run-to-run differences unreliable as a hard gate. Existing
global startup and payload budgets remain enforced; per-feature budgets should be
added only after repeated baseline runs establish stable variance.
Activation request bytes include every local resource type and repeated transfers;
the initial chunk table remains limited to unique JavaScript and CSS chunks.

## First migrated feature

The image importer is emitted as `js/features/image-import.js` instead of being part
of the initial `js/main.js` payload. Existing menu, mobile, drag-and-drop, frame
animation, and tile-palette callers use a compatibility facade. The first call to
`start()` loads the feature code once, creates an `ImportImage` for that text-mode
editor, initializes it, and replaces the facade. A failed request remains retryable
and displays a persistent error message.

Use the same sequence for later migrations: identify one host interface, add a
layered module adapter, keep the legacy surface narrow, split the ordered
implementation when justified, add failure and browser activation coverage, then
move internals behind the interface without expanding global access.
