import type { ResolvedOptions, SummaryReporterOptions } from './types';

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
  };
}
