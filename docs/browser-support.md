# Browser support policy

lvllvl supports the current stable Chrome, Edge, Firefox, Safari, iOS Safari, and
Chrome for Android browser families. The exact versions resolved from the
lockfile-backed compatibility data are shown by `npm run browsers`.

The supported device classes are:

- desktop and laptop computers with keyboard and pointing-device input, using
  1280 by 720 CSS pixels as the CI reference viewport;
- touch phones in portrait orientation, with 360 by 640 CSS pixels as the
  minimum layout target; and
- touch tablets in portrait orientation.

Previous browser releases, Firefox ESR, other browsers, embedded webviews,
game-console browsers, and smaller viewports may work, but are best-effort rather
than release-gated. WebGL-dependent features also require working WebGL hardware
acceleration. GitHub, Gist, and Google Drive are currently disabled and are
outside the browser support promise.

## Tooling and CI mapping

The `browserslist` field in `package.json` is the machine-readable release policy.
Production JavaScript is limited to ECMA 2020 syntax in
`scripts/browser-policy.mjs`; the build verifier parses every emitted JavaScript
file against that ceiling. Browserslist describes compatible release lines rather
than transpiling the legacy global scripts, so changes that introduce a new web API
still need focused compatibility coverage or an explicit fallback.

Playwright runs the full regression suite in desktop Chromium. A production boot
test also runs in desktop Chromium, Firefox, and WebKit; Chromium and WebKit phone
profiles; and a WebKit tablet profile. Those engines are CI proxies for Chrome and
Edge, Firefox, Safari, Chrome for Android, and iOS/iPadOS Safari. Production loads
no provider scripts or provider endpoints; startup tests verify that those requests
remain absent and that the local application starts offline.

## Performance budgets

The release gate enforces these baseline budgets:

- initial first-party JavaScript and CSS: at most 9,250,000 raw bytes and
  2,100,000 bytes after gzip level 9; and
- first-party production navigation to a visible start page: at most 5,000
  milliseconds on the Playwright CI profiles.

The payload measurement follows local scripts and styles referenced by the
production entry point, including its dynamically selected mobile stylesheet. It
includes no remote provider SDK. The startup measurement includes loading,
parsing, and initializing the local
production application from the preview server. Budget changes should be reviewed
as product decisions and recorded in `CHANGELOG.md`.
