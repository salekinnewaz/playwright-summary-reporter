# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-11-19

### Added

- **GitHub-Flavored Alert Card** at the top of the report — a green `> [!TIP]` for a fully
  passing run, a red `> [!CAUTION]` otherwise, carrying the status, pass rate and the full
  result breakdown.
- **Proportional Unicode health bar** (12 blocks: 🟩 🟥 🟨 ⬜) rendered inline in the alert
  card, with largest-remainder allocation so the segments always sum to the total.
- **KPI summary table** with high-contrast bold numbers for Passed, Failed, Flaky, Skipped,
  Total, Pass Rate and Duration.
- **Native Mermaid pie chart** titled *Test Results Distribution*, rendering only the
  non-zero result categories.
- **Deterministic failure classification** — every failure is categorised as
  `🎯 Assertion`, `⏱️ Timeout`, `🔍 Locator` or `💥 Runtime` and rendered as a badge column
  in the Failed Tests table.
- **Copy-ready re-run command** — a bash block with `npx playwright test <file>:<line>`
  targeting only the failed tests.
- **AI debugging prompt accordion** — a collapsed `<details>` block bundling every failure
  with its location, error message and triage guidelines for Copilot / Claude / Cursor.
- **Relative duration bars** in the Slowest Tests table (10 segments) showing each test's
  duration relative to the slowest.
- **Collapsible sections** via the new `collapsibleDetails` option.

### Changed

- `timedOut` is now a **sub-classification of Failed** rather than a separate bucket, so the
  four result buckets are mutually exclusive and collectively exhaustive. The invariant
  `Total === Passed + Failed + Flaky + Skipped` now holds across every table, the chart and
  the KPI strip. `timedOut` remains available as a sub-count and is surfaced as a timeout
  badge and in the alert card.
- The build now asserts the count invariant and throws a descriptive error rather than
  silently rendering inconsistent totals.

### New Options

- `includeChart` (default `true`) — render the Mermaid pie chart.
- `includeRerunCommand` (default `true`) — render the copy-ready re-run command block.
- `includeAiPrompt` (default `true`) — render the AI debugging prompt accordion.
- `collapsibleDetails` (default `false`) — wrap long sections in `<details>` accordions.

## [2.0.0] - 2026-11-19

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

[2.1.0]: https://github.com/salekinnewaz/playwright-summary-reporter/releases/tag/v2.1.0
[2.0.0]: https://github.com/salekinnewaz/playwright-summary-reporter/releases/tag/v2.0.0
