# lvllvl

The static site is built with Node.js 20 or newer. PHP is not required.

```sh
npm ci
npm run dev
```

The development server performs an initial build, serves `dist/` at
`http://127.0.0.1:5173/`, and rebuilds when files under `src/` change.

For a production build and verification:

```sh
npm run build
npx playwright install chromium
npm test
```

`npm run build` removes and recreates `dist/`. The source files live in `src/`, and the
build configuration is in `scripts/build-config.mjs`. `npm test` verifies the static
dependency closure and runs production-browser smoke tests against the built files.

## Runtime dependencies

The reviewed runtime inventory is maintained in
[`docs/runtime-dependencies.json`](docs/runtime-dependencies.json). Run
`npm run dependencies:update` after changing a browser dependency, then commit the
generated SPDX SBOM and `THIRD_PARTY_NOTICES.md`. `npm run dependencies:check`
rejects stale inventory output, unlisted runtime entry points, unreachable files in
`src/lib`, invalid SPDX license expressions, missing package URLs or time-limited
audit exemptions, package assets whose exact npm version is not locked, and retained
files without an immutable revision, reproduction instructions, ownership, current
review deadline, or named compatibility test.

Package-managed browser files keep their existing public `lib/` URLs through the
mapping in `scripts/build-config.mjs`. The SBOM includes the transitive packages
bundled into those browser files with `DEPENDS_ON` and `CONTAINS` relationships.
The small set of intentionally retained files records its provenance and review data
in the same inventory and is checksum-tracked in both generated artifacts.
`npm run audit:dependencies` scans the installed runtime packages, while CI also
runs OSV-Scanner against the complete SBOM with an SPDX license allowlist on pull
requests, main-branch pushes, and a weekly schedule. Deployment waits for both
the dependency audit and the build/test job.

## License

This maintained version of lvllvl adopts the [MIT License](LICENSE) for new
contributions and for material that the current contributors have authority to
license.

The inherited project has an important licensing caveat. The original repository
did not include an explicit project license, and its original author, James, passed
away before the [license question](https://github.com/jaammees/lvllvl/issues/1) was
resolved. That discussion records the community's understanding that he intended
the published source to be used, hosted, and continued, but it is not itself a
formal license grant. The licensing provenance of inherited code therefore remains
unresolved. Third-party components also retain their own license terms and notices.
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the reviewed inventory.
