# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-19

### Added

- Zero-dependency Playwright custom reporter that generates a Markdown test summary.
- Summary report with total / passed / failed / flaky / skipped counts, pass rate and total duration.
- Per-project breakdown table for multi-browser projects.
- Failed tests table with truncated, ANSI-stripped error messages.
- Flaky tests table including retry counts.
- Slowest tests table with a configurable limit.
- Automatic appending to the GitHub Actions Job Summary via `GITHUB_STEP_SUMMARY`.
- Configurable options: `outputFile`, `title`, `writeToGitHubSummary`, `showFailedTests`,
  `showFlakyTests`, `showSlowestTests`, `maxErrorLength`, `includeProjectBreakdown`.
- TypeScript declarations shipped with the package (`dist/index.d.ts`).

[1.0.0]: https://github.com/salekinnewaz/playwright-summary-reporter/releases/tag/v1.0.0
