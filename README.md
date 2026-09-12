# pi-extensions

A collection of [Pi](https://pi.dev) coding-agent extensions, maintained by
[playhard.pro](https://playhard.pro) and structured as an npm workspaces monorepo.

Each package under [`packages/`](./packages) is an independent, publishable Pi package.

## Packages

| Package | Description |
| --- | --- |
| [`@playhard.pro/pi-deepseek-balance`](./packages/pi-deepseek-balance) | Shows the DeepSeek account balance in the footer status bar. |

## Requirements

- [Node.js](https://nodejs.org) `>= 20.19`
- [Pi](https://pi.dev) (`@earendil-works/pi-coding-agent`) for running the extensions

## Installation

### Install a single extension from npm

```bash
pi install npm:@playhard.pro/pi-deepseek-balance
```

### Install everything from this repository

```bash
pi install git:github.com/playhard-pro/pi-extensions
```

### Install a local checkout

```bash
git clone https://github.com/playhard-pro/pi-extensions.git
cd pi-extensions
npm install
pi install ./packages/pi-deepseek-balance
```

### Try an extension without installing

```bash
pi -e ./packages/pi-deepseek-balance/extensions/pi-deepseek-balance.ts
```

After installing, restart Pi or run `/reload`. Manage installations with `pi list` and
`pi remove npm:@playhard.pro/pi-deepseek-balance`.

See each package README for extension-specific usage instructions.

## Repository layout

```
pi-extensions/
├── packages/
│   └── pi-deepseek-balance/
│       ├── extensions/                      # Pi extension entry points (loaded via jiti)
│       │   └── pi-deepseek-balance.ts
│       ├── tests/                           # Unit tests (Vitest)
│       │   └── pi-deepseek-balance.test.ts
│       ├── package.json                     # Pi manifest + npm metadata
│       ├── tsconfig.json
│       ├── README.md
│       └── LICENSE
├── eslint.config.js                         # Flat ESLint config
├── vitest.config.ts                         # Shared Vitest config
├── tsconfig.base.json                       # Shared TypeScript options
├── tsconfig.json                            # Root typecheck project
├── package.json                             # Workspace root + dev scripts
├── scripts/
│   └── release.mjs                          # Version bump + commit + tag helper
├── .github/workflows/release.yml            # Publishes tagged packages to npm
└── README.md
```

Pi discovers extensions through the `pi` field in each `package.json` or the conventional
`extensions/` directory. Extensions are TypeScript modules loaded at runtime via
[jiti](https://github.com/unjs/jiti) — no build step is required.

## Development

```bash
npm install        # install workspace dependencies

npm run typecheck  # type-check all packages (tsc --noEmit)
npm run lint       # lint with ESLint
npm run lint:fix   # lint and auto-fix
npm test           # run the Vitest suite once
npm run test:watch # run tests in watch mode
npm run check      # typecheck + lint + test
```

Run a command for a single workspace:

```bash
npm test --workspace @playhard.pro/pi-deepseek-balance
npm run typecheck --workspace @playhard.pro/pi-deepseek-balance
```

### Adding a new extension package

1. Create `packages/<package-name>/`.
2. Add an entry point at `packages/<package-name>/extensions/<package-name>.ts` that exports a
   default `(pi: ExtensionAPI) => void` function. See the
   [Pi extensions documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md).
3. Add a `package.json` with the `pi-package` keyword, a `pi.extensions` manifest, and the Pi core
   packages as `peerDependencies` with a `"*"` range (they are bundled with Pi and must not be
   re-bundled).
4. Add `tsconfig.json` extending `../../tsconfig.base.json`.
5. Add tests under `tests/*.test.ts`.
6. Document installation and usage in a package-local `README.md` and add it to the table above.

Keep runtime third-party dependencies in `dependencies`; keep Pi core packages in
`peerDependencies`. See the [Pi packages documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
for the full packaging rules.

## Releasing

Releases are automated with GitHub Actions. Publishing a tagged version runs the full
`typecheck + lint + test` suite and then `npm publish` with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements).

### One-time setup

1. Create an npm **Automation** (or Granular Access) token for the packages' scope.
2. Add it to the GitHub repository as a secret named `NPM_TOKEN`
   (Settings → Secrets and variables → Actions → New repository secret).
3. Make sure the scope exists and your npm account can publish to it (scoped packages publish
   publicly thanks to `publishConfig.access`).

### Cutting a release

Use the release helper from the repository root:

```bash
# Bump, commit, and tag locally (does not push)
npm run release -- pi-deepseek-balance patch

# Bump, commit, tag, and push — this triggers the publish workflow
npm run release -- pi-deepseek-balance minor --push

# Prerelease
npm run release -- pi-deepseek-balance prerelease --preid beta --push
```

The helper accepts `patch | minor | major | prepatch | preminor | premajor | prerelease` or an
explicit version, plus `--preid <id>`, `--push`, and `--dry-run`. It creates a tag of the form
`<package-dir>@<version>` (e.g. `pi-deepseek-balance@0.1.0`).

Pushing that tag triggers [`.github/workflows/release.yml`](./.github/workflows/release.yml), which:

1. Resolves the package from the tag and verifies the tag version matches `package.json`.
2. Runs `npm ci` and `npm run check`.
3. Publishes the matching workspace with `npm publish --access public --provenance`.

To release without the helper:

```bash
npm version patch --workspace @playhard.pro/pi-deepseek-balance --no-git-tag-version
git commit -am "release(@playhard.pro/pi-deepseek-balance): v0.1.1"
git tag pi-deepseek-balance@0.1.1
git push && git push origin pi-deepseek-balance@0.1.1
```

### Manual publish (fallback)

```bash
npm login
npm run check
npm publish --workspace @playhard.pro/pi-deepseek-balance --access public
```

## License

[MIT](./LICENSE) © playhard.pro
