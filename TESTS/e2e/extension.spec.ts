import { test, expect, chromium, BrowserContext } from '@playwright/test';
import { join } from 'path';

test.describe('Extension smoke (MV3)', () => {
  test.skip(!!process.env.CI, 'Skip extension harness in CI runners');

  let context: BrowserContext;
  let extensionId = '';

  test.beforeAll(async () => {
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
    // MV3: extract extension id from service workers
    const sw = await context.waitForEvent('serviceworker');
    const url = sw.url();
    const m = url.match(/^chrome-extension:\/\/([a-p]{32})\//);
    if (!m) throw new Error('Extension ID not found from service worker URL: ' + url);
    extensionId = m[1];
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('sidepanel renders', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(page.getByText('Ready for “assist …” commands')).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Feature Flags')).toBeVisible();
    // Open EHR test page via button
    const [ehr] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Open EHR Test Page' }).click()
    ]);
    await ehr.waitForLoadState('domcontentloaded');
    await expect(ehr.getByText('AssistMD Test EHR')).toBeVisible();
    await ehr.close();
  });

  test('map + insert into live page', async () => {
    // Prepare a normal web page and inject a textarea
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => {
      const ta = document.createElement('textarea');
      ta.id = 'e2ePlan';
      ta.style.width = '400px';
      ta.style.height = '80px';
      document.body.appendChild(ta);
    });

    // Open sidepanel and simulate mapping via runtime message
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.waitForLoadState('domcontentloaded');
    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({
        type: 'MAP_PICK',
        section: 'PLAN',
        selector: '#e2ePlan',
        framePath: [],
        href: location.href,
        title: document.title,
        isPopup: false
      }, () => resolve());
    }));

    // Click Insert Plan (will insert '(empty)' if no transcript)
    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    // Verify textarea value now contains something (e.g., '(empty)')
    const v = await web.evaluate(() => (document.querySelector('#e2ePlan') as HTMLTextAreaElement)?.value || '');
    expect(v.length).toBeGreaterThan(0);
  });
});
