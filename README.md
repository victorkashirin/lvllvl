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
