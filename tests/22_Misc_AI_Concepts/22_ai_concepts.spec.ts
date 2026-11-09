import { test, expect, Locator, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/chat.html'); });

async function ask(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

// ==== BASIC 1: Wait for a streamed answer to finish ====
// > A chat answer arrives word by word (streaming). Do NOT read the text right after clicking Send. Wait for the "done" signal your app shows, then assert. Here the status line changes from "Typing..." to "Done".
test('wait for the stream to finish', async ({ page }) => {
  await ask(page, 'What is Playwright?');
  await expect(page.locator('#status')).toHaveText('Typing...');
  await expect(page.locator('#status')).toHaveText('Done');
  await expect(page.locator('[data-role="assistant"]')).toContainText('You asked: What is Playwright?');
});

// ==== BASIC 2: Never compare an AI answer word for word ====
// > A real model gives different wording every time. Assert on what MUST be true: key facts, key words, structure, length limits. Use `toContainText` with a regex or several checks.
test('assert on meaning, not exact words', async ({ page }) => {
  await ask(page, 'Tell me about waiting');
  await expect(page.locator('#status')).toHaveText('Done');
  const answer = page.locator('[data-role="assistant"]');
  await expect(answer).toContainText(/hello/i);
  await expect(answer).toContainText(/waiting/);
  await expect(answer).toContainText(/stream/i);
  const text = (await answer.innerText()).trim();
  expect(text.length).toBeGreaterThan(20);
  expect(text.length).toBeLessThan(500);
});

// ==== BASIC 3: Check that text arrives progressively ====
// > The first words should appear BEFORE the whole answer is ready. Poll the text length while the status is still "Typing...".
test('first words appear before the end', async ({ page }) => {
  await ask(page, 'streaming check');
  const answer = page.locator('[data-role="assistant"]');
  await expect.poll(async () => (await answer.innerText()).length, { timeout: 3000 }).toBeGreaterThan(5);
  await expect(page.locator('#status')).toHaveText('Typing...');            // still streaming
  await expect(page.locator('#status')).toHaveText('Done');
});

// ==== INTERMEDIATE 1: Replace the model with a fixed answer (mock) ====
// > For stable tests of your UI, intercept the model call and return a known answer. Now you can use exact assertions. Use the real model only in a few separate, tolerant tests.
test('mock the model for an exact answer', async ({ page }) => {
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'Paris is the capital of France.' }));
  await ask(page, 'Capital of France?');
  await expect(page.locator('[data-role="assistant"]')).toHaveText('Paris is the capital of France.');
  await expect(page.locator('#status')).toHaveText('Done');
});

// ==== INTERMEDIATE 2: A slow model ====
// > Delay the answer to test the waiting state: the Send button should be disabled, the Stop button enabled, the status "Typing...".
test('slow response shows the loading state', async ({ page }) => {
  await page.route('**/api/chat', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Late answer' });
  });
  await ask(page, 'slow one');
  await expect(page.locator('#status')).toHaveText('Typing...');
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('Done');
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
});

// ==== INTERMEDIATE 3: When the model fails ====
// > AI services fail: rate limits (429), overload (503), network errors. The UI must show a friendly message and recover. Test each case.
for (const status of [429, 500, 503]) {
  test(`error ${status} is shown to the user`, async ({ page }) => {
    await page.route('**/api/chat', (route) => route.fulfill({ status, body: 'error' }));
    await ask(page, 'hello');
    await expect(page.locator('#status')).toHaveText(`Error: HTTP ${status}`);
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();        // the user can try again
  });
}

test('network failure is shown to the user', async ({ page }) => {
  await page.route('**/api/chat', (route) => route.abort('failed'));
  await ask(page, 'hello');
  await expect(page.locator('#status')).toContainText('Error');
});

// ==== INTERMEDIATE 4: The Stop button ====
// > Users can stop a long answer. After Stop the status says "Stopped", the partial text stays, and the full answer never arrives.
test('stop generating', async ({ page }) => {
  await ask(page, 'a long question please');
  await expect.poll(async () => (await page.locator('[data-role="assistant"]').innerText()).length).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#status')).toHaveText('Stopped');
  const partial = await page.locator('[data-role="assistant"]').innerText();
  expect(partial).not.toContain('Playwright tests should wait');
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
});

// ==== INTERMEDIATE 5: Check what is sent to the model ====
// > Inspect the request. The prompt must be there, and sensitive data must NOT be sent. This is a privacy test.
test('the request contains the prompt and no secrets', async ({ page }) => {
  const requestPromise = page.waitForRequest('**/api/chat');
  await ask(page, 'Summarise my order');
  const request = await requestPromise;
  const payload = request.postDataJSON();
  expect(payload).toEqual({ message: 'Summarise my order' });
  expect(JSON.stringify(payload).toLowerCase()).not.toMatch(/password|token|secret/);
  expect(request.headers()['authorization']).toBeUndefined();
});

// ==== INTERMEDIATE 6: A chat must be accessible ====
// > A conversation area should be a `log` region and the status a live `status` region, so screen readers announce new messages. An EMPTY region has no size, so Playwright counts it as hidden: use `toBeAttached()` until it has content.
test('chat accessibility roles', async ({ page }) => {
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeAttached();
  await expect(page.getByRole('status')).toHaveText('Idle');
  await expect(page.getByRole('button', { name: 'Thumbs up' })).toBeVisible();
  await page.getByRole('button', { name: 'Thumbs down' }).click();
  await expect(page.getByText('Thanks for the feedback: down')).toBeVisible();
});

// ==== HARD 1: A golden set of questions ====
// > Keep a table of questions and facts that every good answer MUST contain. Run it against the real model on a schedule to catch regressions. Here the demo model echoes the question, so each row checks for its own keywords.
const goldenSet = [
  { question: 'How do I wait in Playwright?', mustContain: ['wait', 'Playwright'] },
  { question: 'Explain locators', mustContain: ['locators'] },
  { question: 'What is a fixture?', mustContain: ['fixture'] },
];
for (const g of goldenSet) {
  test(`golden set: ${g.question}`, async ({ page }) => {
    await ask(page, g.question);
    await expect(page.locator('#status')).toHaveText('Done');
    const answer = page.locator('[data-role="assistant"]');
    for (const word of g.mustContain) await expect(answer).toContainText(word);
  });
}

// ==== HARD 2: A "judge" that scores an answer ====
// > Real teams use a second model as a JUDGE ("LLM as a judge") to score answers against a rubric. The pattern is the same as here: collect the answer, score it, assert the score. This version uses simple rules so it runs anywhere; swap `judge` for a call to a model.
function judge(answer: string, rubric: { mustInclude: string[]; mustNotInclude: string[]; maxWords: number }) {
  const lower = answer.toLowerCase();
  const missing = rubric.mustInclude.filter((w) => !lower.includes(w.toLowerCase()));
  const forbidden = rubric.mustNotInclude.filter((w) => lower.includes(w.toLowerCase()));
  const words = answer.trim().split(/\s+/).length;
  const score = 1 - (missing.length + forbidden.length) / (rubric.mustInclude.length + rubric.mustNotInclude.length) - (words > rubric.maxWords ? 0.5 : 0);
  return { score, missing, forbidden, words };
}

test('judge the answer with a rubric', async ({ page }) => {
  await ask(page, 'Explain streaming');
  await expect(page.locator('#status')).toHaveText('Done');
  const answer = await page.locator('[data-role="assistant"]').innerText();
  const result = judge(answer, { mustInclude: ['stream', 'wait'], mustNotInclude: ['password', 'guarantee'], maxWords: 60 });
  expect(result.missing).toEqual([]);
  expect(result.forbidden).toEqual([]);
  expect(result.score).toBeGreaterThanOrEqual(1);
});

// ==== HARD 3: Normalise before you compare ====
// > Remove the parts that change on every run (dates, ids, extra spaces, case) and compare the rest. Useful for "mostly the same" outputs.
const normalize = (text: string) => text
  .toLowerCase()
  .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
  .replace(/#\d+/g, '<id>')
  .replace(/\s+/g, ' ')
  .trim();

test('normalised comparison', async () => {
  expect(normalize('Order  #4821 shipped on 2026-10-27.')).toBe(normalize('order #1007 shipped on 2025-01-02.'));
});

// ==== HARD 4: Self-healing locators ====
// > A "healing" helper tries the main locator first, then backups, and REPORTS when a backup was used so you fix the primary one. It never hides the problem; it makes it visible. (Playwright's healer agent works on a similar idea but edits code.)
async function resilient(page: Page, candidates: { name: string; locator: Locator }[], used: string[]) {
  for (const { name, locator } of candidates) {
    if ((await locator.count()) === 1) { used.push(name); return locator; }
  }
  throw new Error(`None of the locators matched: ${candidates.map((c) => c.name).join(', ')}`);
}

test('fallback locator is reported', async ({ page }) => {
  const used: string[] = [];
  const send = await resilient(page, [
    { name: 'by test id (broken)', locator: page.getByTestId('send-button') },
    { name: 'by role', locator: page.getByRole('button', { name: 'Send' }) },
  ], used);
  await page.getByLabel('Message').fill('hi');
  await send.click();
  await expect(page.locator('#status')).toHaveText('Done');
  expect(used).toEqual(['by role']);                               // the primary locator needs fixing
  test.info().annotations.push({ type: 'healed', description: `used ${used[0]}` });
});

// ==== HARD 5: Speed limits for AI features ====
// > Measure the time to the first words and to the end. Set budgets that match what users accept.
test('latency budget', async ({ page }) => {
  const started = Date.now();
  await ask(page, 'budget check');
  await expect.poll(async () => (await page.locator('[data-role="assistant"]').innerText()).length, { timeout: 2000 }).toBeGreaterThan(0);
  const firstToken = Date.now() - started;
  await expect(page.locator('#status')).toHaveText('Done', { timeout: 8000 });
  const total = Date.now() - started;
  expect(firstToken).toBeLessThan(2000);
  expect(total).toBeLessThan(8000);
});

// ==== HARD 6: Safety: user text must never run as code ====
// > If a user (or the model) outputs HTML, the page must show it as text, not execute it. This is a basic security test for any AI chat.
test('HTML in a message is shown as text', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', async (d) => { dialogs++; await d.dismiss(); });
  await ask(page, '<img src=x onerror="alert(1)"><b>bold</b>');
  await expect(page.locator('#status')).toHaveText('Done');
  await expect(page.locator('[data-role="user"]')).toHaveText('<img src=x onerror="alert(1)"><b>bold</b>');
  await expect(page.locator('#log img')).toHaveCount(0);
  await expect(page.locator('#log b')).toHaveCount(0);
  expect(dialogs).toBe(0);
});

// ==== HARD 7: Test the same prompt several times ====
// > Because answers vary, run the same prompt a few times and require that EVERY run satisfies the rules. One lucky pass proves little.
for (let run = 1; run <= 3; run++) {
  test(`repeatability run ${run}`, async ({ page }) => {
    await ask(page, 'repeat me');
    await expect(page.locator('#status')).toHaveText('Done');
    await expect(page.locator('[data-role="assistant"]')).toContainText('repeat me');
  });
}
