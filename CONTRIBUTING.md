# Contributing to playwright-summary-reporter

Thanks for taking the time to contribute! 🎉

This project is a **zero-dependency** Playwright custom reporter. Every change is expected to keep
that promise — no new runtime dependencies.

## Code of Conduct

Be respectful and constructive. Issues and pull requests are reviewed by the maintainer,
[Md Salekin Newaz](https://github.com/salekinnewaz).

## Getting Started

### Fork and clone

```bash
git clone https://github.com/<your-username>/playwright-summary-reporter.git
cd playwright-summary-reporter
```

### Install dependencies

```bash
npm install
```

Node.js **18 or newer** is required.

### Build

```bash
npm run build
```

This cleans `dist/` and compiles `src/` to JavaScript plus TypeScript declarations via `tsc`.

### Test

```bash
npm test          # unit tests (vitest run)
npm run typecheck # type-check without emitting
```

There is also an end-to-end suite that runs the reporter against the example Playwright config:

```bash
npm run test:e2e
```

### Full local check

```bash
npm run typecheck && npm run build && npm test
```

This is the same sequence the `prepublishOnly` script runs, so running it locally guarantees a
clean publish.

## Project Layout

```
src/
  index.ts      # Reporter entry point (Playwright reporter interface)
  formatter.ts  # Markdown rendering
  utils.ts      # Aggregation, ANSI stripping, duration formatting
  types.ts      # Public option and result types
tests/          # vitest unit tests
examples/       # Runnable example Playwright config + specs
```

## Making a Change

1. Create a branch off `main`:

   ```bash
   git checkout -b feat/your-change
   ```

2. Make your change, keeping the source formatted consistently with the surrounding code.

3. Add or update tests in `tests/` for any behavioural change.

4. Verify everything passes:

   ```bash
   npm run typecheck && npm run build && npm test
   ```

5. Update `README.md` if you change or add a user-facing option, and add an entry to
   `CHANGELOG.md` under an **Unreleased** heading.

6. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) style message:

   ```bash
   git commit -m "feat(formatter): add project breakdown toggle"
   ```

## Pull Requests

- Open your PR against `main` and describe **what** changed and **why**.
- Link any related issue with `Fixes #123`.
- CI must be green — type-check, build, and unit tests all run on every PR.
- Keep the diff focused; unrelated refactors make review harder.

## Reporting Bugs

Open an issue at
[github.com/salekinnewaz/playwright-summary-reporter/issues](https://github.com/salekinnewaz/playwright-summary-reporter/issues).

A good bug report includes:

- The version of `playwright-summary-reporter` and `@playwright/test`
- Your `playwright.config.ts` reporter configuration
- A minimal reproduction (a failing spec is ideal)
- The actual output vs. the expected output
- Node.js version and OS

For security issues, please follow [SECURITY.md](./SECURITY.md) instead.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](./LICENSE).
