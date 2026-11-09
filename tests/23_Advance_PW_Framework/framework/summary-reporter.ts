import fs from 'fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// A custom reporter: writes reports/summary.md after every run.
export default class SummaryReporter implements Reporter {
  private counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  private failures: string[] = [];
  private started = Date.now();

  onTestEnd(test: TestCase, result: TestResult) {
    // A failed attempt that will be retried is not the final result yet.
    if ((result.status === 'failed' || result.status === 'timedOut') && result.retry < test.retries) return;
    const outcome = test.outcome();
    if (outcome === 'expected') this.counts.passed++;
    else if (outcome === 'flaky') this.counts.flaky++;
    else if (outcome === 'skipped') this.counts.skipped++;
    else if (result.status !== 'skipped') { this.counts.failed++; this.failures.push(`- ${test.titlePath().slice(2).join(' > ')}`); }
  }

  onEnd(result: FullResult) {
    const seconds = ((Date.now() - this.started) / 1000).toFixed(1);
    const lines = ['# Run summary', '', `Status: **${result.status}**  Duration: ${seconds}s`, '',
      '| Passed | Failed | Flaky | Skipped |', '|---|---|---|---|',
      `| ${this.counts.passed} | ${this.counts.failed} | ${this.counts.flaky} | ${this.counts.skipped} |`, '',
      ...(this.failures.length ? ['## Failures', ...this.failures, ''] : [])];
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync('reports/summary.md', lines.join('\n'));
  }
}
