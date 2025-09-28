import { test, expect, chromium, BrowserContext } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RUN_E2E = process.env.RUN_EXTENSION_E2E === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('AssistMD Smart Paste flows', () => {
  test.skip(!RUN_E2E, 'Set RUN_EXTENSION_E2E=true to run extension harness locally');

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
    let sw;
    try {
      sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
    } catch (err) {
      await context.close();
      test.skip(`Extension service worker did not start: ${(err as Error).message}`);
      return;
    }
    const url = sw.url();
    const m = url.match(/^chrome-extension:\/\/([a-p]{32})\//);
    if (!m) {
      await context.close();
      test.skip('Extension ID not found from service worker URL');
      return;
    }
    extensionId = m[1];
  });

  test.afterAll(async () => {
    await context?.close();
  });

  async function openPanel() {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForLoadState('domcontentloaded');
    return page;
  }

  async function primeGuard(panel: any) {
    // Seed an unconfirmed fingerprint so guard prompt can show when needed
    await panel.evaluate(async () => {
      await chrome.storage.session.set({ FP_E2E: { fp: 'fp-e2e', preview: 'E2E Patient' } });
      await chrome.storage.local.remove(['ASSIST_CONFIRMED_FP']);
    });
  }

  async function confirmGuard(panel: any) {
    await panel.evaluate(async () => {
      await chrome.storage.session.set({ FP_E2E: { fp: 'fp-e2e', preview: 'E2E Patient' } });
      await chrome.storage.local.set({ ASSIST_CONFIRMED_FP: { fp: 'fp-e2e', preview: 'E2E Patient' } });
    });
  }

  test('permissions banner and request path', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => {
      const ta = document.createElement('textarea');
      ta.id = 'perm-plan';
      document.body.appendChild(ta);
    });

    const panel = await openPanel();
    await confirmGuard(panel);

    // Force permissions.contains/request to deny first
    await panel.evaluate(() => {
      const perms: any = chrome.permissions;
      perms.contains = async () => false;
      let granted = false;
      perms.request = async () => {
        if (!granted) {
          granted = true;
          return false;
        }
        return true;
      };
    });

    // Map PLAN to textarea via runtime message
    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({
        type: 'MAP_PICK',
        section: 'PLAN',
        selector: '#perm-plan',
        framePath: [],
        href: 'https://example.com',
        title: 'Example Domain',
        isPopup: false
      }, () => resolve());
    }));

    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    await expect(panel.getByText('Permissions needed')).toBeVisible();

    // Second request should succeed
    await panel.evaluate(() => {
      const perms: any = chrome.permissions;
      perms.contains = async () => true;
    });
    await panel.getByRole('button', { name: 'Request' }).click();
    await expect(panel.getByText('Permissions needed')).toBeHidden({ timeout: 5000 });
  });

  test('guard confirmation and remap prompt', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => {
      const ta = document.createElement('textarea');
      ta.id = 'guard-plan';
      document.body.appendChild(ta);
    });

    const panel = await openPanel();
    await primeGuard(panel);

    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({
        type: 'MAP_PICK',
        section: 'PLAN',
        selector: '#missing-plan',
        framePath: [],
        href: 'https://example.com',
        title: 'Example Domain',
        isPopup: false
      }, () => resolve());
    }));

    await panel.evaluate(() => {
      const perms: any = chrome.permissions;
      perms.contains = async () => true;
      perms.request = async () => true;
    });

    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    await expect(panel.getByText('Confirm patient before inserting')).toBeVisible();

    await panel.getByRole('button', { name: 'Confirm patient' }).click();
    await expect(panel.getByText('Confirm patient before inserting')).toBeHidden({ timeout: 5000 });

    // Verify remap banner since selector missing
    await expect(panel.getByText('PLAN field missing or not editable')).toBeVisible();
    await panel.getByRole('button', { name: 'Remap now' }).click();
    await expect(panel.getByText('PLAN field missing or not editable')).toBeHidden({ timeout: 5000 });
  });

  test('recovery banner restore & host templates', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');

    const panel = await openPanel();

    await panel.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        ASSIST_BACKUP_SNAPSHOT_V1: {
          ts: Date.now(),
          data: {
            'MAP_example.com': {
              PLAN: { section: 'PLAN', selector: '#rest-plan', strategy: 'value', verified: true }
            },
            'TPL_example.com_PLAN': 'Host PLAN template'
          }
        }
      });
    });

    await panel.reload();
    await panel.waitForLoadState('domcontentloaded');
    await expect(panel.getByText('Recovery snapshot found')).toBeVisible();

    await panel.getByRole('button', { name: 'Restore Now' }).click();
    await expect(panel.getByText('Recovery snapshot found')).toBeHidden({ timeout: 5000 });

    await panel.getByRole('button', { name: 'Settings' }).click();
    const tpl = await panel.evaluate(async () => {
      const bag = await chrome.storage.local.get(['TPL_example.com_PLAN']);
      return bag['TPL_example.com_PLAN'] as string | undefined;
    });
    expect(tpl).toBe('Host PLAN template');
  });

  test('target chooser allows selecting fallback selector', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => {
      const a = document.createElement('textarea');
      a.id = 'planA';
      const b = document.createElement('textarea');
      b.id = 'planB';
      document.body.appendChild(a);
      document.body.appendChild(b);
    });

    const panel = await openPanel();
    await confirmGuard(panel);

    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({
        type: 'MAP_PICK',
        section: 'PLAN',
        selector: '#planA',
        framePath: [],
        href: 'https://example.com',
        title: 'Example Domain',
        isPopup: false
      }, () => resolve());
    }));

    await panel.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const host = tabs[0]?.url ? new URL(tabs[0]!.url!).hostname : '';
      const key = `MAP_${host}`;
      const bag = await chrome.storage.local.get([key]);
      const prof = bag[key] || {};
      if (prof.PLAN) {
        prof.PLAN.fallbackSelectors = ['#planB'];
        await chrome.storage.local.set({ [key]: prof });
      }
    });

    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    await panel.getByText('Select target').waitFor();
    await panel.getByRole('radio', { name: '#planB' }).check();
    await panel.getByRole('button', { name: 'Continue' }).click();

    await web.waitForFunction(() => {
      const a = (document.querySelector('#planA') as HTMLTextAreaElement) || null;
      const b = (document.querySelector('#planB') as HTMLTextAreaElement) || null;
      return !!b && b.value.length > 0 && !!a && a.value.length === 0;
    });

    const [valueA, valueB] = await web.evaluate(() => [
      (document.querySelector('#planA') as HTMLTextAreaElement).value,
      (document.querySelector('#planB') as HTMLTextAreaElement).value
    ]);
    expect(valueA).toBe('');
    expect(valueB.length).toBeGreaterThan(0);
  });
});
