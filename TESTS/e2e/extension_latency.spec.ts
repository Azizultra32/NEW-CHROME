import { test, expect, chromium, BrowserContext } from '@playwright/test';

test.describe('Insert latency + guard flow (local)', () => {
  test.skip(!!process.env.CI, 'Headful extension tests are local-only');

  let context: BrowserContext;
  let extensionId = '';

  test.beforeAll(async () => {
    const { join } = await import('path');
    const root = join(__dirname, '../../');
    const dist = join(root, 'dist');
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${dist}`,
        `--load-extension=${dist}`,
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    });
    const sw = await context.waitForEvent('serviceworker');
    const m = sw.url().match(/^chrome-extension:\/\/([a-p]{32})\//);
    if (!m) throw new Error('Extension ID not found');
    extensionId = m[1];
  });

  test.afterAll(async () => { await context?.close(); });

  test('insert latency under 1200ms and guard confirm works', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => {
      const ta = document.createElement('textarea');
      ta.id = 'latencyPlan'; ta.style.width='400px'; ta.style.height='80px';
      document.body.appendChild(ta);
    });
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.waitForLoadState('domcontentloaded');
    // Clear confirmed fingerprint; set session FP via EHR_DEMOGRAPHICS
    await panel.evaluate(() => chrome.storage.local.remove(['ASSIST_CONFIRMED_FP']));
    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'EHR_DEMOGRAPHICS', demo: {}, fp: 'e2e', preview: 'E2E · 01-01-1970 · MRN••00' }, () => resolve());
    }));
    // Map PLAN to textarea
    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'MAP_PICK', section: 'PLAN', selector: '#latencyPlan', framePath: [], href: location.href, title: document.title, isPopup: false }, () => resolve());
    }));
    // Measure insert latency
    const start = Date.now();
    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    // Confirm guard
    await panel.getByRole('button', { name: 'Confirm patient' }).click();
    await panel.getByText('Patient confirmed').waitFor();
    await web.waitForFunction(() => (document.querySelector('#latencyPlan') as HTMLTextAreaElement)?.value?.length > 0);
    const dur = Date.now() - start;
    console.log('Insert latency (ms):', dur);
    expect(dur).toBeLessThan(1200);
  });
});

