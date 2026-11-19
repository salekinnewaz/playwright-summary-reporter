import * as fs from 'fs';
import * as path from 'path';

import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

import { formatSummary } from './formatter';
import type {
  ProjectStats,
  ResolvedOptions,
  RunStatus,
  SummaryData,
  SummaryReporterOptions,
  TestOutcome,
  TestRecord,
} from './types';
import { cleanErrorMessage, classifyFailure, resolveOptions } from './utils';

/**
 * `playwright-summary-reporter` — a zero-dependency Playwright reporter that
 * writes a clean Markdown summary of the test run.
 *
 * ```ts
 * reporter: [['playwright-summary-reporter', { outputFile: 'test-summary.md' }]]
 * ```
 */
export default class PlaywrightSummaryReporter implements Reporter {
  private readonly options: ResolvedOptions;
  private readonly records = new Map<string, TestRecord>();
  private startTime = 0;
  private expectedTests = 0;

  constructor(options?: SummaryReporterOptions) {
    this.options = resolveOptions(options);
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.expectedTests = this.countTests(suite);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // A test emits one result per retry attempt. We key records by the test id
    // so each attempt replaces the previous one — the last attempt is the one
    // that carries the final verdict, and the test is counted exactly once.
    const key = test.id;
    const outcome = this.resolveOutcome(test, result);
    const error = this.resolveError(result);

    this.records.set(key, {
      title: this.resolveTitle(test),
      project: this.resolveProject(test),
      file: this.resolveFile(test),
      line: test.location?.line ?? 0,
      duration: result.duration,
      retries: result.retry,
      outcome,
      ...(error ? { error } : {}),
      ...(outcome === 'failed' || outcome === 'timedOut'
        ? { category: classifyFailure(error, outcome) }
        : {}),
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const duration = this.startTime > 0 ? Date.now() - this.startTime : 0;
    const data = this.buildSummary(result, duration);
    const markdown = formatSummary(data, this.options);

    this.writeFile(markdown);
    this.appendToGitHubSummary(markdown);

    console.log(`✅ Summary written to ${path.resolve(this.options.outputFile)}`);
  }

  /**
   * Counts the tests Playwright expects to run.
   *
   * `suite.allTests()` flattens the whole tree, so a test that runs in two
   * projects is counted twice — once per project — matching how results are
   * recorded in `onTestEnd`.
   */
  private countTests(suite: Suite): number {
    return suite.allTests().length;
  }

  /** Maps a Playwright test/result pair onto one of our outcome buckets. */
  private resolveOutcome(test: TestCase, result: TestResult): TestOutcome {
    if (result.status === 'skipped') {
      return 'skipped';
    }

    if (result.status === 'timedOut') {
      return 'timedOut';
    }

    // `test.outcome()` is the authoritative final verdict: it accounts for
    // retries and for tests that were expected to fail.
    switch (test.outcome()) {
      case 'skipped':
        return 'skipped';
      case 'flaky':
        return 'flaky';
      case 'expected':
        return 'passed';
      case 'unexpected':
        return result.status === 'passed' ? 'passed' : 'failed';
      default:
        return result.status === 'passed' ? 'passed' : 'failed';
    }
  }

  /** The full title path, dropping empty root segments. */
  private resolveTitle(test: TestCase): string {
    const segments = test.titlePath().filter((segment) => segment.length > 0);

    // `titlePath()` starts with the spec file name. The file is already shown
    // in the Location column, so drop it to avoid repeating it in the title.
    if (segments.length > 1 && this.isFileSegment(segments[0] ?? '', test)) {
      segments.shift();
    }

    return segments.join(' › ');
  }

  /** Whether a title path segment is the spec file name. */
  private isFileSegment(segment: string, test: TestCase): boolean {
    const file = test.location?.file;

    if (!file) {
      return false;
    }

    return segment === file || segment === path.basename(file);
  }

  /** The project (browser) the test belongs to. */
  private resolveProject(test: TestCase): string {
    // The suite hierarchy is `root` -> `project` -> `file` -> `describe` -> ...
    // so the closest ancestor of type `project` identifies the project.
    let suite: Suite | undefined = test.parent;

    while (suite) {
      if (suite.type === 'project') {
        const name = suite.title;

        if (name) {
          return name;
        }

        // An unnamed default project reports an empty title — fall back to the
        // configured browser name.
        return suite.project()?.use?.browserName ?? 'default';
      }

      suite = suite.parent;
    }

    return 'default';
  }

  /** The test file path, relative to the current working directory. */
  private resolveFile(test: TestCase): string {
    const file = test.location?.file ?? test.titlePath()[0] ?? '';
    const relative = path.relative(process.cwd(), file);

    return relative && !relative.startsWith('..') ? relative : file;
  }

  /** The cleaned error message for a failed result, if any. */
  private resolveError(result: TestResult): string | undefined {
    const raw = result.error?.message ?? result.error?.stack;

    if (!raw) {
      return undefined;
    }

    return cleanErrorMessage(raw, this.options.maxErrorLength);
  }

  /** Aggregates the recorded tests into the data the formatter needs. */
  private buildSummary(result: FullResult, duration: number): SummaryData {
    const tests = [...this.records.values()];

    const passed = tests.filter((t) => t.outcome === 'passed').length;
    const flaky = tests.filter((t) => t.outcome === 'flaky').length;
    const skipped = tests.filter((t) => t.outcome === 'skipped').length;

    // A timeout is a *kind of* failure, not a separate bucket. Folding it into
    // `failed` is what guarantees the core invariant:
    //   total === passed + failed + flaky + skipped
    const failed = tests.filter((t) => t.outcome === 'failed' || t.outcome === 'timedOut').length;

    // Sub-count of `failed` — used for the timeout badge, never added to totals.
    const timedOut = tests.filter((t) => t.outcome === 'timedOut').length;

    const total = tests.length;

    // The four buckets are mutually exclusive and collectively exhaustive, so
    // this invariant must always hold. Guard it loudly rather than silently
    // rendering a summary whose numbers do not add up.
    if (passed + failed + flaky + skipped !== total) {
      throw new Error(
        `[playwright-summary-reporter] Inconsistent test counts: ` +
          `passed(${passed}) + failed(${failed}) + flaky(${flaky}) + skipped(${skipped}) ` +
          `= ${passed + failed + flaky + skipped}, but total is ${total}.`,
      );
    }

    // Pass rate excludes skipped tests from the denominator.
    const denominator = total - skipped;
    const passRate = denominator > 0 ? (passed / denominator) * 100 : 0;

    return {
      title: this.options.title,
      status: this.resolveStatus(result, failed),
      total,
      passed,
      failed,
      flaky,
      skipped,
      timedOut,
      duration,
      passRate,
      tests,
      projects: this.buildProjectStats(tests),
    };
  }

  /** Overall run status. */
  private resolveStatus(result: FullResult, failures: number): RunStatus {
    if (result.status === 'timedout') {
      return 'TIMEDOUT';
    }

    if (result.status === 'interrupted') {
      return 'INTERRUPTED';
    }

    return failures > 0 ? 'FAILED' : 'PASSED';
  }

  /** Per-project aggregates, sorted by project name. */
  private buildProjectStats(tests: TestRecord[]): ProjectStats[] {
    const byProject = new Map<string, ProjectStats>();

    for (const test of tests) {
      const stats = byProject.get(test.project) ?? {
        project: test.project,
        total: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
        duration: 0,
      };

      stats.total += 1;
      stats.duration += test.duration;

      switch (test.outcome) {
        case 'passed':
          stats.passed += 1;
          break;
        case 'failed':
          stats.failed += 1;
          break;
        case 'timedOut':
          stats.failed += 1;
          break;
        case 'flaky':
          stats.flaky += 1;
          break;
        case 'skipped':
          stats.skipped += 1;
          break;
      }

      byProject.set(test.project, stats);
    }

    return [...byProject.values()].sort((a, b) => a.project.localeCompare(b.project));
  }

  /** Writes the report to disk, creating the parent directory if needed. */
  private writeFile(markdown: string): void {
    const target = path.resolve(this.options.outputFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, markdown, 'utf8');
  }

  /** Appends the report to the GitHub Actions job summary when available. */
  private appendToGitHubSummary(markdown: string): void {
    if (!this.options.writeToGitHubSummary) {
      return;
    }

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;

    if (!summaryPath) {
      return;
    }

    try {
      fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
      fs.appendFileSync(summaryPath, markdown, 'utf8');
    } catch (error) {
      console.warn(
        `⚠️  Could not write to GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export { buildAiPrompt, buildRerunCommand, formatSummary } from './formatter';
export {
  buildDurationBar,
  buildHealthBar,
  cleanErrorMessage,
  classifyFailure,
  collapseWhitespace,
  escapeMarkdown,
  failureCategoryMeta,
  formatDuration,
  formatPassRate,
  resolveOptions,
  stripAnsi,
  FAILURE_CATEGORIES,
} from './utils';
export type {
  FailureCategory,
  FailureCategoryMeta,
  FormatOptions,
  MarkdownSummaryOptions,
  ProjectStats,
  ResolvedOptions,
  ResultBucket,
  RunStatus,
  SummaryData,
  SummaryReporterOptions,
  TestOutcome,
  TestRecord,
} from './types';
