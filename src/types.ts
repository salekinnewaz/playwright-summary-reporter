/**
 * Options accepted by the `playwright-summary-reporter` reporter.
 *
 * Every option is optional; defaults are resolved in `resolveOptions()`.
 */
export interface SummaryReporterOptions {
  /** Path of the Markdown file to write. Default: `'playwright-summary.md'`. */
  outputFile?: string;
  /** Heading used at the top of the report. Default: `'Playwright Test Summary'`. */
  title?: string;
  /** Append the report to `GITHUB_STEP_SUMMARY` when the env var is set. Default: `true`. */
  writeToGitHubSummary?: boolean;
  /** Render the "Failed Tests" section. Default: `true`. */
  showFailedTests?: boolean;
  /** Render the "Flaky Tests" section. Default: `true`. */
  showFlakyTests?: boolean;
  /** Number of slowest tests to list; `0` disables the section. Default: `5`. */
  showSlowestTests?: number;
  /** Maximum length of an error message before truncation. Default: `250`. */
  maxErrorLength?: number;
  /** Render the per-project breakdown table. Default: `true`. */
  includeProjectBreakdown?: boolean;
}

/**
 * Backwards-compatible alias for {@link SummaryReporterOptions}.
 *
 * @deprecated Use {@link SummaryReporterOptions} instead.
 */
export type MarkdownSummaryOptions = SummaryReporterOptions;

/** Fully resolved options — every field has a concrete value. */
export type ResolvedOptions = Required<SummaryReporterOptions>;

/** The outcome of a single test, after all retries are accounted for. */
export type TestOutcome = 'passed' | 'failed' | 'flaky' | 'skipped' | 'timedOut';

/** Overall status of the test run. */
export type RunStatus = 'PASSED' | 'FAILED' | 'TIMEDOUT' | 'INTERRUPTED';

/** Per-project aggregate counts. */
export interface ProjectStats {
  project: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  duration: number;
}

/** A single recorded test result. */
export interface TestRecord {
  title: string;
  project: string;
  file: string;
  line: number;
  duration: number;
  retries: number;
  outcome: TestOutcome;
  error?: string;
}

/** Everything the formatter needs to render a report. */
export interface SummaryData {
  title: string;
  status: RunStatus;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  timedOut: number;
  duration: number;
  passRate: number;
  tests: TestRecord[];
  projects: ProjectStats[];
}

/** The subset of reporter options that influence rendering. */
export interface FormatOptions {
  showSlowestTests?: number;
  includeProjectBreakdown?: boolean;
  showFailedTests?: boolean;
  showFlakyTests?: boolean;
}
