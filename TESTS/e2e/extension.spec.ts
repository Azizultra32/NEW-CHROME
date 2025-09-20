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
  });
});

