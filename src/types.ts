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
  /** Render the Mermaid pie chart of the result distribution. Default: `true`. */
  includeChart?: boolean;
  /** Render the copy-ready "re-run only failed tests" command block. Default: `true`. */
  includeRerunCommand?: boolean;
  /** Render the collapsible AI debugging prompt accordion. Default: `true`. */
  includeAiPrompt?: boolean;
  /** Wrap long sections in collapsible `<details>` accordions. Default: `false`. */
  collapsibleDetails?: boolean;
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

/**
 * The four mutually exclusive result buckets used for all aggregate maths.
 *
 * `timedOut` is deliberately *not* a bucket of its own — a timeout is a kind of
 * failure. This guarantees the invariant:
 *
 * ```text
 * total === passed + failed + flaky + skipped
 * ```
 *
 * where `failed` already includes every timed-out test.
 */
export type ResultBucket = 'passed' | 'failed' | 'flaky' | 'skipped';

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

/**
 * A deterministic classification of *why* a test failed, derived from its
 * error message. Used for the badge column in the Failed Tests table.
 */
export type FailureCategory = 'assertion' | 'timeout' | 'locator' | 'runtime';

/** The visual badge + label for each failure category. */
export interface FailureCategoryMeta {
  /** Stable machine-readable identifier. */
  id: FailureCategory;
  /** Emoji badge rendered in the table cell. */
  badge: string;
  /** Human readable label, e.g. `'Assertion'`. */
  label: string;
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
  /** Deterministically derived failure classification. Only set for failures. */
  category?: FailureCategory;
}

/** Everything the formatter needs to render a report. */
export interface SummaryData {
  title: string;
  status: RunStatus;
  /** Total tests executed. Always equals `passed + failed + flaky + skipped`. */
  total: number;
  passed: number;
  /** Failed tests, *including* every timed-out test. */
  failed: number;
  flaky: number;
  skipped: number;
  /**
   * How many of the `failed` tests were timeouts. This is a sub-count of
   * `failed`, never an additional bucket.
   */
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
  includeChart?: boolean;
  includeRerunCommand?: boolean;
  includeAiPrompt?: boolean;
  collapsibleDetails?: boolean;
}
