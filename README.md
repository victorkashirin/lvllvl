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
npm test
```

`npm run build` removes and recreates `dist/`. The source files live in `src/`, and the
build configuration is in `scripts/build-config.mjs`.
