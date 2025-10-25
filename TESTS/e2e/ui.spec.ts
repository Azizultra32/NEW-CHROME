import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('sidepanel UI renders (file context)', async ({ page }) => {
  const root = join(__dirname, '../../');
  const path = 'file://' + join(root, 'dist/sidepanel.html');
  await page.addInitScript(() => {
    const noop = () => {};
    const asyncNoop = async () => {};
    const tabs = [{ id: 1, url: 'https://example.com', title: 'Example', active: true, lastFocusedWindow: true }];
    (window as any).chrome = {
      storage: {
        local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        session: { get: async () => ({}), set: async () => {} }
      },
      runtime: {
        sendMessage: async () => ({}),
        onMessage: { addListener: noop, removeListener: noop },
        getURL: (path: string) => `chrome-extension://test/${path}`
      },
      tabs: {
        query: async () => tabs,
        sendMessage: async () => ({}),
        update: asyncNoop
      },
      scripting: { executeScript: async () => [{ result: 'ok' }] },
      windows: { update: asyncNoop },
      permissions: {
        contains: async () => true,
        request: async () => true
      }
    } as any;
    (navigator as any).clipboard = {
      writeText: asyncNoop
    };
  });
  await page.goto(path);
  await expect(page.locator('#root')).toHaveCount(1);
});

test('ehr test page renders', async ({ page }) => {
  const root = join(__dirname, '../../');
  const path = 'file://' + join(root, 'dist/ehr-test.html');
  await page.goto(path);
  await expect(page.getByText('AssistMD Test EHR')).toBeVisible();
  await expect(page.locator('#hpiBox')).toBeVisible();
});
