import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildAiPrompt, buildRerunCommand, formatSummary } from '../src/formatter';
import type { SummaryData, TestRecord } from '../src/types';
import {
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
} from '../src/utils';

function makeTest(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    title: 'suite › should work',
    project: 'chromium',
    file: 'tests/example.spec.ts',
    line: 10,
    duration: 100,
    retries: 0,
    outcome: 'passed',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<SummaryData> = {}): SummaryData {
  return {
    title: 'Playwright Test Summary',
    status: 'PASSED',
    total: 1,
    passed: 1,
    failed: 0,
    flaky: 0,
    skipped: 0,
    timedOut: 0,
    duration: 1000,
    passRate: 100,
    tests: [makeTest()],
    projects: [
      { project: 'chromium', total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, duration: 1000 },
    ],
    ...overrides,
  };
}

/**
 * Builds a summary whose counts are internally consistent, so that the tests
 * exercise the rendering rather than the arithmetic.
 */
function makeConsistentSummary(
  counts: { passed: number; failed: number; flaky: number; skipped: number },
  overrides: Partial<SummaryData> = {},
): SummaryData {
  const total = counts.passed + counts.failed + counts.flaky + counts.skipped;
  const denominator = total - counts.skipped;

  return makeSummary({
    total,
    ...counts,
    passRate: denominator > 0 ? (counts.passed / denominator) * 100 : 0,
    ...overrides,
  });
}

describe('stripAnsi', () => {
  it('removes ANSI colour codes', () => {
    const raw = '[31mFAILED[39m expected true to be false';
    expect(stripAnsi(raw)).toBe('FAILED expected true to be false');
  });

  it('removes bold and underline sequences', () => {
    expect(stripAnsi('[1m[4mbold[24m')).toBe('bold');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});

describe('escapeMarkdown', () => {
  it('escapes pipe characters so tables do not break', () => {
    expect(escapeMarkdown('a | b')).toBe('a \\| b');
  });

  it('escapes multiple pipes', () => {
    expect(escapeMarkdown('|x|y|')).toBe('\\|x\\|y\\|');
  });

  it('leaves text without pipes untouched', () => {
    expect(escapeMarkdown('no pipes')).toBe('no pipes');
  });
});

describe('collapseWhitespace', () => {
  it('collapses newlines and repeated spaces', () => {
    expect(collapseWhitespace('line1\n\n  line2   tail')).toBe('line1 line2 tail');
  });
});

describe('cleanErrorMessage', () => {
  it('strips ANSI and collapses newlines', () => {
    const raw = '[31mError:[39m expected |a| to equal b\nat foo.ts:1';
    const cleaned = cleanErrorMessage(raw, 250);

    expect(cleaned).not.toContain('');
    expect(cleaned).not.toContain('\n');
    expect(cleaned).toContain('|a|');
  });

  it('truncates messages longer than maxLength', () => {
    const cleaned = cleanErrorMessage('x'.repeat(500), 50);
    expect(cleaned.length).toBeLessThanOrEqual(51);
    expect(cleaned.endsWith('…')).toBe(true);
  });

  it('does not truncate messages within the limit', () => {
    expect(cleanErrorMessage('short error', 250)).toBe('short error');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(450)).toBe('450ms');
  });

  it('formats seconds with one decimal', () => {
    expect(formatDuration(12400)).toBe('12.4s');
  });

  it('formats whole seconds without decimals', () => {
    expect(formatDuration(12000)).toBe('12s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(75000)).toBe('1m 15s');
  });

  it('formats whole minutes', () => {
    expect(formatDuration(60000)).toBe('1m');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });
});

describe('formatPassRate', () => {
  it('formats whole percentages', () => {
    expect(formatPassRate(100)).toBe('100%');
  });

  it('formats fractional percentages', () => {
    expect(formatPassRate(92.55)).toBe('92.6%');
  });

  it('formats zero', () => {
    expect(formatPassRate(0)).toBe('0%');
  });
});

describe('resolveOptions', () => {
  it('applies defaults', () => {
    expect(resolveOptions()).toEqual({
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
    });
  });

  it('overrides defaults with user options', () => {
    const resolved = resolveOptions({ outputFile: 'out.md', showSlowestTests: 0 });
    expect(resolved.outputFile).toBe('out.md');
    expect(resolved.showSlowestTests).toBe(0);
  });

  it('allows the new dashboard flags to be toggled', () => {
    const resolved = resolveOptions({
      includeChart: false,
      includeRerunCommand: false,
      includeAiPrompt: false,
      collapsibleDetails: true,
    });

    expect(resolved.includeChart).toBe(false);
    expect(resolved.includeRerunCommand).toBe(false);
    expect(resolved.includeAiPrompt).toBe(false);
    expect(resolved.collapsibleDetails).toBe(true);
  });
});

describe('classifyFailure', () => {
  it('classifies assertion failures', () => {
    expect(classifyFailure('Error: expect(received).toBe(expected)', 'failed')).toBe('assertion');
  });

  it('classifies timeouts', () => {
    expect(classifyFailure('Error: Test timeout of 5000ms exceeded.', 'timedOut')).toBe('timeout');
  });

  it('classifies locator problems', () => {
    expect(classifyFailure('Error: locator.waitFor: Timeout 5000ms exceeded', 'failed')).toBe('timeout');
    expect(classifyFailure('Error: strict mode violation: locator resolved to 2 elements', 'failed')).toBe(
      'locator',
    );
  });

  it('falls back to runtime for unknown failures', () => {
    expect(classifyFailure('Error: something exploded', 'failed')).toBe('runtime');
  });

  it('never classifies a passing test', () => {
    expect(classifyFailure(undefined, 'passed')).toBe('runtime');
  });

  it('exposes a badge and label for every category', () => {
    expect(failureCategoryMeta('assertion')).toEqual({
      id: 'assertion',
      badge: '🎯',
      label: 'Assertion',
    });
    expect(failureCategoryMeta('timeout').badge).toBe('⏱️');
    expect(failureCategoryMeta('locator').badge).toBe('🔍');
    expect(failureCategoryMeta('runtime').badge).toBe('💥');
  });
});

describe('buildHealthBar', () => {
  it('always renders exactly 12 segments', () => {
    const bar = buildHealthBar({ passed: 5, failed: 2, flaky: 1, skipped: 1 }, 12);
    expect([...bar]).toHaveLength(12);
  });

  it('renders only the relevant blocks', () => {
    const bar = buildHealthBar({ passed: 12, failed: 0, flaky: 0, skipped: 0 }, 12);
    expect(bar).toBe('🟩'.repeat(12));
  });

  it('allocates segments proportionally', () => {
    const bar = buildHealthBar({ passed: 6, failed: 3, flaky: 3, skipped: 0 }, 12);
    expect([...bar].filter((c) => c === '🟩')).toHaveLength(6);
    expect([...bar].filter((c) => c === '🟥')).toHaveLength(3);
    expect([...bar].filter((c) => c === '🟨')).toHaveLength(3);
  });

  it('returns blank blocks when there are no tests', () => {
    expect(buildHealthBar({ passed: 0, failed: 0, flaky: 0, skipped: 0 }, 12)).toBe('⬜'.repeat(12));
  });
});

describe('buildDurationBar', () => {
  it('renders 10 segments', () => {
    expect([...buildDurationBar(1000, 1000, 10)]).toHaveLength(10);
  });

  it('renders a full bar for the slowest test', () => {
    expect(buildDurationBar(5000, 5000, 10)).toBe('█'.repeat(10));
  });

  it('renders an empty bar for a zero duration', () => {
    expect(buildDurationBar(0, 5000, 10)).toBe('░'.repeat(10));
  });

  it('renders a proportional bar', () => {
    expect(buildDurationBar(2500, 5000, 10)).toBe('█'.repeat(5) + '░'.repeat(5));
  });
});

describe('buildRerunCommand', () => {
  it('targets only the failed tests by file and line', () => {
    const command = buildRerunCommand([
      makeTest({ outcome: 'failed', file: 'a.spec.ts', line: 10 }),
      makeTest({ outcome: 'failed', file: 'b.spec.ts', line: 22 }),
    ]);

    expect(command).toBe('npx playwright test a.spec.ts:10 b.spec.ts:22');
  });

  it('includes timed out tests', () => {
    const command = buildRerunCommand([makeTest({ outcome: 'timedOut', file: 'c.spec.ts', line: 5 })]);
    expect(command).toBe('npx playwright test c.spec.ts:5');
  });

  it('de-duplicates identical locations', () => {
    const command = buildRerunCommand([
      makeTest({ outcome: 'failed', file: 'a.spec.ts', line: 10 }),
      makeTest({ outcome: 'failed', file: 'a.spec.ts', line: 10, title: 'other' }),
    ]);

    expect(command).toBe('npx playwright test a.spec.ts:10');
  });

  it('returns an empty string when nothing failed', () => {
    expect(buildRerunCommand([makeTest()])).toBe('');
  });
});

describe('buildAiPrompt', () => {
  it('includes the failing test details', () => {
    const prompt = buildAiPrompt(
      [makeTest({ outcome: 'failed', error: 'expected 1 to be 2', file: 'x.spec.ts', line: 3 })],
      'My Run',
    );

    expect(prompt).toContain('My Run');
    expect(prompt).toContain('x.spec.ts:3');
    expect(prompt).toContain('expected 1 to be 2');
  });

  it('returns an empty string when nothing failed', () => {
    expect(buildAiPrompt([makeTest()], 'My Run')).toBe('');
  });
});

describe('formatSummary — alert card', () => {
  it('renders a green TIP alert for a fully passing run', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 3, failed: 0, flaky: 0, skipped: 0 }));

    expect(markdown).toContain('> [!TIP]');
    expect(markdown).not.toContain('> [!CAUTION]');
    expect(markdown).toContain('✅ PASSED');
  });

  it('renders a red CAUTION alert when tests failed', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 1, flaky: 0, skipped: 0 }));

    expect(markdown).toContain('> [!CAUTION]');
    expect(markdown).not.toContain('> [!TIP]');
    expect(markdown).toContain('❌ FAILED');
  });

  it('renders a CAUTION alert when tests are merely flaky', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 1, skipped: 0 }));

    expect(markdown).toContain('> [!CAUTION]');
  });

  it('includes the health bar', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 6, failed: 3, flaky: 3, skipped: 0 }));

    expect(markdown).toContain('🟩'.repeat(6));
    expect(markdown).toContain('Health Bar');
  });
});

describe('formatSummary — KPI table', () => {
  it('renders every KPI metric', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 4, failed: 2, flaky: 1, skipped: 1 }));

    expect(markdown).toContain('| Metric | Value |');
    expect(markdown).toContain('✅ Passed');
    expect(markdown).toContain('❌ Failed');
    expect(markdown).toContain('⚠️ Flaky');
    expect(markdown).toContain('⏭️ Skipped');
    expect(markdown).toContain('📊 Total');
    expect(markdown).toContain('🎯 Pass Rate');
    expect(markdown).toContain('⏱️ Duration');
  });

  it('renders the values in bold', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 4, failed: 2, flaky: 1, skipped: 1 }));

    expect(markdown).toContain('| ✅ Passed | **4** |');
    expect(markdown).toContain('| 📊 Total | **8** |');
  });
});

describe('formatSummary — mermaid chart', () => {
  it('renders a pie chart with the correct title', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 4, failed: 2, flaky: 1, skipped: 1 }));

    expect(markdown).toContain('```mermaid');
    expect(markdown).toContain('pie showData');
    expect(markdown).toContain('title Test Results Distribution');
  });

  it('omits zero-value categories', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 4, failed: 0, flaky: 0, skipped: 0 }));

    expect(markdown).toContain('"Passed" : 4');
    expect(markdown).not.toContain('"Failed"');
    expect(markdown).not.toContain('"Flaky"');
    expect(markdown).not.toContain('"Skipped"');
  });

  it('is omitted when includeChart is false', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 4, failed: 0, flaky: 0, skipped: 0 }), {
      includeChart: false,
    });

    expect(markdown).not.toContain('mermaid');
  });
});

describe('formatSummary — failed tests', () => {
  it('renders the type badge column', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 0, failed: 2, flaky: 0, skipped: 0 },
        {
          tests: [
            makeTest({ outcome: 'failed', category: 'assertion', error: 'boom' }),
            makeTest({ outcome: 'timedOut', category: 'timeout', error: 'too slow' }),
          ],
        },
      ),
    );

    expect(markdown).toContain('| Type | Test | Project | Location | Error |');
    expect(markdown).toContain('🎯 Assertion');
    expect(markdown).toContain('⏱️ Timeout');
  });

  it('renders the re-run command block', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 0, failed: 1, flaky: 0, skipped: 0 },
        { tests: [makeTest({ outcome: 'failed', file: 'a.spec.ts', line: 10 })] },
      ),
    );

    expect(markdown).toContain('🔁 Re-run only failed tests');
    expect(markdown).toContain('```bash');
    expect(markdown).toContain('npx playwright test a.spec.ts:10');
  });

  it('omits the re-run command when includeRerunCommand is false', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 0, failed: 1, flaky: 0, skipped: 0 },
        { tests: [makeTest({ outcome: 'failed' })] },
      ),
      { includeRerunCommand: false },
    );

    expect(markdown).not.toContain('Re-run only failed tests');
  });

  it('renders the AI prompt accordion', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 0, failed: 1, flaky: 0, skipped: 0 },
        { tests: [makeTest({ outcome: 'failed', error: 'boom' })] },
      ),
    );

    expect(markdown).toContain('<details>');
    expect(markdown).toContain('🤖 AI Debugging Prompt (click to copy for Copilot / Claude / Cursor)');
    expect(markdown).toContain('boom');
  });

  it('omits the AI prompt when includeAiPrompt is false', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 0, failed: 1, flaky: 0, skipped: 0 },
        { tests: [makeTest({ outcome: 'failed' })] },
      ),
      { includeAiPrompt: false },
    );

    expect(markdown).not.toContain('AI Debugging Prompt');
  });

  it('omits the failed section when showFailedTests is false', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 0, failed: 1, flaky: 0, skipped: 0 },
        { tests: [makeTest({ outcome: 'failed' })] },
      ),
      { showFailedTests: false },
    );

    expect(markdown).not.toContain('Failed Tests');
  });
});

describe('formatSummary — flaky tests', () => {
  it('renders an expanded flaky table', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 1, failed: 0, flaky: 1, skipped: 0 },
        { tests: [makeTest({ outcome: 'flaky', retries: 2, duration: 500 })] },
      ),
    );

    expect(markdown).toContain('### ⚠️ Flaky Tests');
    expect(markdown).toContain('| Test | Project | Retries | Duration | Location |');
    // The flaky table must not be collapsed behind a details accordion.
    expect(markdown).not.toContain('<summary>⚠️ Flaky Tests</summary>');
  });

  it('omits the flaky section when there are no flaky tests', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 }));
    expect(markdown).not.toContain('Flaky Tests');
  });
});

describe('formatSummary — slowest tests', () => {
  it('renders the relative duration bar', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 2, failed: 0, flaky: 0, skipped: 0 },
        {
          tests: [
            makeTest({ title: 'slow', duration: 5000 }),
            makeTest({ title: 'fast', duration: 500 }),
          ],
        },
      ),
      { showSlowestTests: 5 },
    );

    expect(markdown).toContain('| Test | Project | Duration | Relative |');
    // The bar is relative to the slowest test in the set (5000ms), so the
    // slowest renders full and 500ms renders a single segment.
    expect(markdown).toContain('`██████████`');
    expect(markdown).toContain('`█░░░░░░░░░`');
  });

  it('scales the duration bar relative to the slowest test', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 2, failed: 0, flaky: 0, skipped: 0 },
        {
          tests: [
            makeTest({ title: 'slow', duration: 4000 }),
            makeTest({ title: 'half', duration: 2000 }),
          ],
        },
      ),
      { showSlowestTests: 5 },
    );

    expect(markdown).toContain('`██████████`');
    expect(markdown).toContain('`█████░░░░░`');
  });

  it('wraps the slowest section in a details accordion when enabled', () => {
    const markdown = formatSummary(
      makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 }),
      { showSlowestTests: 5, collapsibleDetails: true },
    );

    expect(markdown).toContain('<summary>🐢 Slowest Tests</summary>');
  });

  it('does not wrap the slowest section by default', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 }));

    expect(markdown).toContain('### 🐢 Slowest Tests');
    expect(markdown).not.toContain('<summary>🐢 Slowest Tests</summary>');
  });

  it('sorts by duration descending and respects the limit', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 3, failed: 0, flaky: 0, skipped: 0 },
        {
          tests: [
            makeTest({ title: 'fast', duration: 10 }),
            makeTest({ title: 'medium', duration: 500 }),
            makeTest({ title: 'slow', duration: 5000 }),
          ],
        },
      ),
      { showSlowestTests: 2 },
    );

    expect(markdown).toContain('slow');
    expect(markdown).toContain('medium');
    expect(markdown).not.toContain('| fast |');
  });

  it('excludes skipped tests from the slowest tests table', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 1, failed: 0, flaky: 0, skipped: 1 },
        {
          tests: [
            makeTest({ title: 'skipped slow', duration: 9000, outcome: 'skipped' }),
            makeTest({ title: 'normal', duration: 100 }),
          ],
        },
      ),
      { showSlowestTests: 5 },
    );

    expect(markdown).not.toContain('skipped slow');
  });

  it('omits the slowest section when showSlowestTests is 0', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 }), {
      showSlowestTests: 0,
    });

    expect(markdown).not.toContain('Slowest Tests');
  });
});

describe('formatSummary — project breakdown', () => {
  it('renders a row per project', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 2, failed: 0, flaky: 0, skipped: 0 },
        {
          projects: [
            { project: 'chromium', total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, duration: 500 },
            { project: 'firefox', total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, duration: 700 },
          ],
        },
      ),
    );

    expect(markdown).toContain('### 📊 Project Breakdown');
    expect(markdown).toContain('chromium');
    expect(markdown).toContain('firefox');
  });

  it('omits the project breakdown when disabled', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 }), {
      includeProjectBreakdown: false,
    });

    expect(markdown).not.toContain('Project Breakdown');
  });
});

describe('formatSummary — footer', () => {
  it('renders the credit line', () => {
    const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 }));

    expect(markdown).toContain(
      '_Generated by [playwright-summary-reporter](https://www.npmjs.com/package/playwright-summary-reporter)_',
    );
  });
});

describe('formatSummary — markdown integrity', () => {
  it('escapes pipes in error messages exactly once', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 0, failed: 1, flaky: 0, skipped: 0 },
        { tests: [makeTest({ outcome: 'failed', error: 'expected |a| to equal b' })] },
      ),
    );

    expect(markdown).toContain('expected \\|a\\| to equal b');
    expect(markdown).not.toContain('\\\\|');
  });

  it('keeps table rows intact when a title contains a pipe', () => {
    const markdown = formatSummary(
      makeConsistentSummary(
        { passed: 1, failed: 0, flaky: 0, skipped: 0 },
        { tests: [makeTest({ title: 'a | b' })] },
      ),
      { showSlowestTests: 5 },
    );

    expect(markdown).toContain('a \\| b');
  });
});

describe('TOTAL MATH CONSISTENCY', () => {
  /**
   * The core invariant: a timeout is a kind of failure, so the four buckets
   * must always sum to the total across every table, chart and log line.
   */
  it('holds for a mixed run containing every outcome', async () => {
    const { default: PlaywrightSummaryReporter } = await import('../src/index');

    const reporter = new PlaywrightSummaryReporter({ outputFile: 'unused.md' });

    const makeCase = (id: string, outcome: string, status: string) => ({
      id,
      titlePath: () => ['spec.ts', `test ${id}`],
      location: { file: '/repo/spec.ts', line: 7 },
      parent: { title: 'chromium', type: 'project', parent: undefined, project: () => undefined },
      outcome: () => outcome,
      status,
    });

    reporter.onTestEnd(makeCase('p1', 'expected', 'passed') as never, {
      status: 'passed',
      duration: 10,
      retry: 0,
    } as never);
    reporter.onTestEnd(makeCase('p2', 'expected', 'passed') as never, {
      status: 'passed',
      duration: 20,
      retry: 0,
    } as never);
    reporter.onTestEnd(makeCase('f1', 'unexpected', 'failed') as never, {
      status: 'failed',
      duration: 30,
      retry: 0,
      error: { message: 'boom' },
    } as never);
    reporter.onTestEnd(makeCase('t1', 'unexpected', 'timedOut') as never, {
      status: 'timedOut',
      duration: 40,
      retry: 0,
      error: { message: 'timeout' },
    } as never);
    reporter.onTestEnd(makeCase('t2', 'unexpected', 'timedOut') as never, {
      status: 'timedOut',
      duration: 50,
      retry: 0,
      error: { message: 'timeout' },
    } as never);
    reporter.onTestEnd(makeCase('fl1', 'flaky', 'passed') as never, {
      status: 'passed',
      duration: 60,
      retry: 1,
    } as never);
    reporter.onTestEnd(makeCase('s1', 'skipped', 'skipped') as never, {
      status: 'skipped',
      duration: 0,
      retry: 0,
    } as never);

    const data = (
      reporter as never as { buildSummary(result: unknown, duration: number): SummaryData }
    ).buildSummary({ status: 'failed' }, 100);

    // 2 passed, 1 failed, 2 timed out, 1 flaky, 1 skipped => total 7.
    expect(data.total).toBe(7);
    expect(data.passed).toBe(2);
    expect(data.failed).toBe(3); // 1 failed + 2 timed out
    expect(data.timedOut).toBe(2); // sub-count of failed
    expect(data.flaky).toBe(1);
    expect(data.skipped).toBe(1);

    // THE INVARIANT.
    expect(data.passed + data.failed + data.flaky + data.skipped).toBe(data.total);
    expect(data.timedOut).toBeLessThanOrEqual(data.failed);

    // The rendered summary must agree with the numbers.
    const markdown = formatSummary(data);

    // KPI table total must equal the sum of the four KPI buckets.
    expect(markdown).toContain(`| ✅ Passed | **${data.passed}** |`);
    expect(markdown).toContain(`| ❌ Failed | **${data.failed}** |`);
    expect(markdown).toContain(`| ⚠️ Flaky | **${data.flaky}** |`);
    expect(markdown).toContain(`| ⏭️ Skipped | **${data.skipped}** |`);
    expect(markdown).toContain(`| 📊 Total | **${data.total}** |`);

    // The pie chart slices must sum to the total as well.
    const chartValues = [...markdown.matchAll(/"(?:Passed|Failed|Flaky|Skipped)" : (\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(chartValues.reduce((sum, value) => sum + value, 0)).toBe(data.total);

    // The health bar must have exactly 12 segments.
    const healthBar = markdown.match(/`([🟩🟥🟨⬜]+)`/);
    expect(healthBar).not.toBeNull();
    expect([...(healthBar?.[1] ?? '')]).toHaveLength(12);

    // Every failed test (including timeouts) must appear in the failed table.
    // The badge column is the *first* cell, so match on the badge + the test
    // name to avoid catching the KPI rows that reuse the same emoji.
    const failedRows = markdown
      .split('\n')
      .filter(
        (line) =>
          /^\| (🎯|⏱️|🔍|💥) (Assertion|Timeout|Locator|Runtime) \|/.test(line) &&
          line.includes('| chromium |'),
      );
    expect(failedRows).toHaveLength(data.failed);
  });

  it('keeps per-project breakdowns consistent with the overall totals', async () => {
    const { default: PlaywrightSummaryReporter } = await import('../src/index');

    const reporter = new PlaywrightSummaryReporter({ outputFile: 'unused.md' });

    const makeCase = (id: string, outcome: string, status: string) => ({
      id,
      titlePath: () => ['spec.ts', `test ${id}`],
      location: { file: '/repo/spec.ts', line: 7 },
      parent: { title: 'chromium', type: 'project', parent: undefined, project: () => undefined },
      outcome: () => outcome,
      status,
    });

    reporter.onTestEnd(makeCase('a', 'expected', 'passed') as never, {
      status: 'passed',
      duration: 10,
      retry: 0,
    } as never);
    reporter.onTestEnd(makeCase('b', 'unexpected', 'timedOut') as never, {
      status: 'timedOut',
      duration: 20,
      retry: 0,
      error: { message: 'timeout' },
    } as never);

    const data = (
      reporter as never as { buildSummary(result: unknown, duration: number): SummaryData }
    ).buildSummary({ status: 'failed' }, 100);

    const projectPassed = data.projects.reduce((sum, p) => sum + p.passed, 0);
    const projectFailed = data.projects.reduce((sum, p) => sum + p.failed, 0);
    const projectFlaky = data.projects.reduce((sum, p) => sum + p.flaky, 0);
    const projectSkipped = data.projects.reduce((sum, p) => sum + p.skipped, 0);
    const projectTotal = data.projects.reduce((sum, p) => sum + p.total, 0);

    expect(projectPassed).toBe(data.passed);
    expect(projectFailed).toBe(data.failed);
    expect(projectFlaky).toBe(data.flaky);
    expect(projectSkipped).toBe(data.skipped);
    expect(projectTotal).toBe(data.total);
    expect(projectPassed + projectFailed + projectFlaky + projectSkipped).toBe(data.total);
  });

  it('reports a 0% pass rate when every test was skipped', async () => {
    const { default: PlaywrightSummaryReporter } = await import('../src/index');

    const reporter = new PlaywrightSummaryReporter({ outputFile: 'unused.md' });

    const test = {
      id: 's1',
      titlePath: () => ['spec.ts', 'a test'],
      location: { file: '/repo/spec.ts', line: 7 },
      parent: { title: 'chromium', type: 'project', parent: undefined, project: () => undefined },
      outcome: () => 'skipped',
    };

    reporter.onTestEnd(test as never, { status: 'skipped', duration: 0, retry: 0 } as never);

    const data = (
      reporter as never as { buildSummary(result: unknown, duration: number): SummaryData }
    ).buildSummary({ status: 'passed' }, 100);

    expect(data.passRate).toBe(0);
    expect(data.passed + data.failed + data.flaky + data.skipped).toBe(data.total);
  });
});

describe('retry handling', () => {
  /** Builds a minimal `TestCase`-like object for the reporter. */
  function makeTestCase(id: string, results: unknown[]) {
    return {
      id,
      results,
      titlePath: () => ['spec.ts', 'suite', 'a test'],
      location: { file: '/repo/spec.ts', line: 7 },
      parent: { title: 'chromium', type: 'project', parent: undefined, project: () => undefined },
      outcome: () => 'flaky',
    };
  }

  it('records a retried test once, using its final outcome', async () => {
    const { default: PlaywrightSummaryReporter } = await import('../src/index');

    const reporter = new PlaywrightSummaryReporter({ outputFile: 'unused.md' });
    const test = makeTestCase('test-1', []);

    reporter.onTestEnd(test as never, { status: 'failed', duration: 100, retry: 0, error: undefined } as never);
    reporter.onTestEnd(test as never, { status: 'passed', duration: 120, retry: 1, error: undefined } as never);

    const records = (reporter as never as { records: Map<string, TestRecord> }).records;

    expect(records.size).toBe(1);

    const record = records.get('test-1');

    expect(record?.outcome).toBe('flaky');
    expect(record?.retries).toBe(1);
    expect(record?.duration).toBe(120);
  });

  it('does not double-count a test across retries in the summary', async () => {
    const { default: PlaywrightSummaryReporter } = await import('../src/index');

    const reporter = new PlaywrightSummaryReporter({ outputFile: 'unused.md' });
    const test = makeTestCase('test-2', []);

    reporter.onTestEnd(test as never, { status: 'failed', duration: 100, retry: 0 } as never);
    reporter.onTestEnd(test as never, { status: 'passed', duration: 120, retry: 1 } as never);

    const records = (reporter as never as { records: Map<string, TestRecord> }).records;

    expect(records.size).toBe(1);
  });
});

describe('GITHUB_STEP_SUMMARY append', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-summary-reporter-'));
  const summaryPath = path.join(tmpDir, 'job-summary.md');

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends the markdown to the file referenced by GITHUB_STEP_SUMMARY', async () => {
    const { default: PlaywrightSummaryReporter } = await import('../src/index');

    const previous = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_STEP_SUMMARY = summaryPath;

    try {
      const reporter = new PlaywrightSummaryReporter({ outputFile: path.join(tmpDir, 'out.md') });
      const markdown = formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 }));

      reporter['appendToGitHubSummary'](markdown);

      expect(fs.existsSync(summaryPath)).toBe(true);
      expect(fs.readFileSync(summaryPath, 'utf8')).toContain('## Playwright Test Summary');
    } finally {
      if (previous === undefined) {
        delete process.env.GITHUB_STEP_SUMMARY;
      } else {
        process.env.GITHUB_STEP_SUMMARY = previous;
      }
    }
  });

  it('does not write when writeToGitHubSummary is false', async () => {
    const { default: PlaywrightSummaryReporter } = await import('../src/index');

    const previous = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_STEP_SUMMARY = summaryPath;

    try {
      const reporter = new PlaywrightSummaryReporter({
        outputFile: path.join(tmpDir, 'out.md'),
        writeToGitHubSummary: false,
      });

      reporter['appendToGitHubSummary'](formatSummary(makeConsistentSummary({ passed: 1, failed: 0, flaky: 0, skipped: 0 })));

      expect(fs.existsSync(summaryPath)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.GITHUB_STEP_SUMMARY;
      } else {
        process.env.GITHUB_STEP_SUMMARY = previous;
      }
    }
  });
});
