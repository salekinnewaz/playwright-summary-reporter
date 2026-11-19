import type {
  FailureCategory,
  FailureCategoryMeta,
  ResolvedOptions,
  SummaryReporterOptions,
  TestOutcome,
} from './types';

/**
 * Matches ANSI escape sequences (SGR colours, cursor movement, OSC sequences…)
 * so they can be stripped from captured Playwright output.
 */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /[][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]/g;

/** Removes ANSI colour/escape codes from a string. */
export function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\[[0-9;]*[A-Za-z]/g, '').replace(ANSI_PATTERN, '');
}

/**
 * Escapes characters that would break a GitHub-Flavored Markdown table cell.
 * Pipes are the important one; backslashes are escaped first so we do not
 * double-escape our own escape characters.
 */
export function escapeMarkdown(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * Collapses all whitespace (including newlines) into single spaces so an error
 * message stays on one line inside a table cell.
 */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Cleans a raw error message: strips ANSI codes, collapses whitespace and
 * truncates to `maxLength` characters.
 *
 * Markdown pipe escaping is deliberately *not* applied here — the formatter
 * escapes pipes when it renders a table cell, so escaping here too would
 * produce a double backslash in the output.
 */
export function cleanErrorMessage(raw: string, maxLength: number): string {
  const cleaned = collapseWhitespace(stripAnsi(raw));

  if (maxLength <= 0 || cleaned.length <= maxLength) {
    return cleaned;
  }

  const truncated = cleaned.slice(0, maxLength);
  // Prefer cutting at the last word boundary so we don't cut mid-word.
  const lastSpace = truncated.lastIndexOf(' ');
  const body = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;

  return `${body.trimEnd()}…`;
}

/**
 * Formats a duration in milliseconds as a human readable string.
 * - `450` -> `450ms`
 * - `12400` -> `12.4s`
 * - `75000` -> `1m 15s`
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0ms';
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const totalSeconds = ms / 1000;

  if (totalSeconds < 60) {
    // One decimal place, trailing `.0` removed.
    const rounded = Math.round(totalSeconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}

/**
 * Formats a pass rate percentage, e.g. `92.5%`.
 */
export function formatPassRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) {
    return '0%';
  }

  const rounded = Math.round(rate * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/**
 * Visual metadata for each deterministic failure classification.
 *
 * The order here is the order in which the classifier tests its patterns, so
 * the most specific signal (a timeout) always wins over a generic one.
 */
export const FAILURE_CATEGORIES: Record<FailureCategory, FailureCategoryMeta> = {
  timeout: { id: 'timeout', badge: '⏱️', label: 'Timeout' },
  locator: { id: 'locator', badge: '🔍', label: 'Locator' },
  assertion: { id: 'assertion', badge: '🎯', label: 'Assertion' },
  runtime: { id: 'runtime', badge: '💥', label: 'Runtime' },
};

/**
 * Deterministically classifies *why* a test failed from its error message.
 *
 * The classification is purely a function of the message text, so the same
 * failure always produces the same badge. Timeouts are recognised first,
 * because a timeout message usually also contains assertion-like wording.
 */
export function classifyFailure(error: string | undefined, outcome: TestOutcome): FailureCategory {
  if (outcome !== 'failed' && outcome !== 'timedOut') {
    return 'runtime';
  }

  const message = (error ?? '').toLowerCase();

  if (message.length === 0) {
    return 'runtime';
  }

  // Timeouts: Playwright's own wording plus the generic variants.
  if (
    outcome === 'timedOut' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('exceeded') ||
    message.includes('test timeout')
  ) {
    return 'timeout';
  }

  // Locator problems: element not found / not visible / strict mode.
  if (
    message.includes('locator') ||
    message.includes('element is not') ||
    message.includes('not visible') ||
    message.includes('waiting for') ||
    message.includes('strict mode violation') ||
    message.includes('resolved to')
  ) {
    return 'locator';
  }

  // Assertion failures: the expectation itself did not hold.
  if (
    message.includes('expect(') ||
    message.includes('expected') ||
    message.includes('received') ||
    message.includes('assertionerror') ||
    message.includes('tobe') ||
    message.includes('toequal')
  ) {
    return 'assertion';
  }

  return 'runtime';
}

/** The badge + label pair for a failure category. */
export function failureCategoryMeta(category: FailureCategory): FailureCategoryMeta {
  return FAILURE_CATEGORIES[category];
}

/**
 * Builds a proportional Unicode health bar from the result distribution.
 *
 * The bar is always exactly `segments` characters wide so that two bars are
 * directly comparable. Segments are allocated by largest-remainder rounding
 * so the counts always sum back to the total.
 */
export function buildHealthBar(
  counts: { passed: number; failed: number; flaky: number; skipped: number },
  segments = 12,
): string {
  const total = counts.passed + counts.failed + counts.flaky + counts.skipped;

  if (total <= 0 || segments <= 0) {
    return '⬜'.repeat(Math.max(0, segments));
  }

  const weighted = [
    { char: '🟩', value: counts.passed },
    { char: '🟥', value: counts.failed },
    { char: '🟨', value: counts.flaky },
    { char: '⬜', value: counts.skipped },
  ];

  const exact = weighted.map((entry) => (entry.value / total) * segments);
  const allocated = exact.map((value) => Math.floor(value));
  let remainder = segments - allocated.reduce((sum, value) => sum + value, 0);

  // Hand out the leftover segments to the largest fractional parts first.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; remainder > 0 && order.length > 0; i += 1) {
    const entry = order[i % order.length];

    if (!entry) {
      break;
    }

    allocated[entry.index] = (allocated[entry.index] ?? 0) + 1;
    remainder -= 1;
  }

  let bar = '';

  weighted.forEach((entry, index) => {
    bar += entry.char.repeat(allocated[index] ?? 0);
  });

  return bar;
}

/**
 * Builds a relative 10-segment duration bar for the Slowest Tests table.
 *
 * `max` is the longest duration in the set, so the slowest test always renders
 * a full bar and relative speed is immediately readable.
 */
export function buildDurationBar(duration: number, max: number, segments = 10): string {
  if (segments <= 0) {
    return '';
  }

  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(max) || max <= 0) {
    return '░'.repeat(segments);
  }

  const filled = Math.max(1, Math.round((duration / max) * segments));
  const clamped = Math.min(segments, filled);

  return '█'.repeat(clamped) + '░'.repeat(segments - clamped);
}

/** Default values for every reporter option. */
export const DEFAULT_OPTIONS: ResolvedOptions = {
  outputFile: 'playwright-summary.md',
  title: 'Playwright Test Summary',
  writeToGitHubSummary: true,
  showFailedTests: true,
  showFlakyTests: true,
  showSlowestTests: 5,
  maxErrorLength: 250,
  includeProjectBreakdown: true,
  includeChart: true,
  includeRerunCommand: true,
  includeAiPrompt: true,
  collapsibleDetails: false,
};

/**
 * Merges user supplied options with the defaults. Unknown keys are ignored and
 * `undefined` values fall back to the default.
 */
export function resolveOptions(options?: SummaryReporterOptions): ResolvedOptions {
  const merged = { ...DEFAULT_OPTIONS, ...(options ?? {}) };

  return {
    outputFile: merged.outputFile ?? DEFAULT_OPTIONS.outputFile,
    title: merged.title ?? DEFAULT_OPTIONS.title,
    writeToGitHubSummary: merged.writeToGitHubSummary ?? DEFAULT_OPTIONS.writeToGitHubSummary,
    showFailedTests: merged.showFailedTests ?? DEFAULT_OPTIONS.showFailedTests,
    showFlakyTests: merged.showFlakyTests ?? DEFAULT_OPTIONS.showFlakyTests,
    showSlowestTests: merged.showSlowestTests ?? DEFAULT_OPTIONS.showSlowestTests,
    maxErrorLength: merged.maxErrorLength ?? DEFAULT_OPTIONS.maxErrorLength,
    includeProjectBreakdown: merged.includeProjectBreakdown ?? DEFAULT_OPTIONS.includeProjectBreakdown,
    includeChart: merged.includeChart ?? DEFAULT_OPTIONS.includeChart,
    includeRerunCommand: merged.includeRerunCommand ?? DEFAULT_OPTIONS.includeRerunCommand,
    includeAiPrompt: merged.includeAiPrompt ?? DEFAULT_OPTIONS.includeAiPrompt,
    collapsibleDetails: merged.collapsibleDetails ?? DEFAULT_OPTIONS.collapsibleDetails,
  };
}
