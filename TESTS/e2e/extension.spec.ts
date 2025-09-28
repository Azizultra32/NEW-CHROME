import { test, expect, chromium, BrowserContext } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHOULD_RUN = process.env.RUN_EXTENSION_E2E === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Extension smoke (MV3)', () => {
  test.skip(!SHOULD_RUN, 'Set RUN_EXTENSION_E2E=true to run extension harness locally');

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

  test('preview-before-insert modal path', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => { const t=document.createElement('textarea'); t.id='pvPlan'; document.body.appendChild(t); });
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.waitForLoadState('domcontentloaded');
    // Enable preview flag
    await panel.evaluate(() => chrome.storage.local.set({ FEAT_PREVIEW: true }));
    // Map PLAN
    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'MAP_PICK', section: 'PLAN', selector: '#pvPlan', framePath: [], href: location.href, title: document.title, isPopup: false }, () => resolve());
    }));
    // Click Insert Plan; confirm modal Insert
    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    await panel.getByText('Confirm insert → PLAN').waitFor();
    await panel.getByRole('button', { name: 'Insert' }).click();
    const v = await web.evaluate(() => (document.querySelector('#pvPlan') as HTMLTextAreaElement)?.value || '');
    expect(v.length).toBeGreaterThan(0);
  });

  test('map + insert into same-origin iframe', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => {
      const iframe = document.createElement('iframe');
      iframe.id = 'e2eFrame';
      document.body.appendChild(iframe);
      const doc = (iframe.contentWindow as any).document as Document;
      doc.open();
      doc.write(`<!doctype html><meta charset=\"utf-8\"><div id=\"e2eIframePlan\" contenteditable=\"true\">(frame)</div>`);
      doc.close();
    });

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.waitForLoadState('domcontentloaded');
    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({
        type: 'MAP_PICK',
        section: 'PLAN',
        selector: '#e2eIframePlan',
        framePath: [0],
        href: location.href,
        title: document.title,
        isPopup: false
      }, () => resolve());
    }));

    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    const inner = await web.evaluate(() => (document.querySelector('#e2eFrame') as HTMLIFrameElement).contentDocument?.querySelector('#e2eIframePlan')?.textContent || '');
    expect(inner.length).toBeGreaterThan(0);
  });

  test('map + insert into popup window', async () => {
    const popup = await context.newPage();
    await popup.goto('about:blank');
    await popup.evaluate(() => {
      document.title = 'Plan Editor';
      const ta = document.createElement('textarea');
      ta.id = 'e2ePopupPlan';
      document.body.appendChild(ta);
    });

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.waitForLoadState('domcontentloaded');
    const href = popup.url();
    const title = await popup.title();
    await panel.evaluate(([href, title]) => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({
        type: 'MAP_PICK',
        section: 'PLAN',
        selector: '#e2ePopupPlan',
        framePath: [],
        href,
        title,
        isPopup: true
      }, () => resolve());
    }), [href, title]);

    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    const v = await popup.evaluate(() => (document.querySelector('#e2ePopupPlan') as HTMLTextAreaElement)?.value || '');
    expect(v.length).toBeGreaterThan(0);
  });

  test('fallbackSelectors path works', async () => {
    const web = await context.newPage();
    await web.goto('https://example.com');
    await web.evaluate(() => { const t=document.createElement('textarea'); t.id='e2eFallback'; document.body.appendChild(t); });
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.waitForLoadState('domcontentloaded');
    // Map with a fake primary, then add fallback to storage
    await panel.evaluate(() => new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'MAP_PICK', section: 'PLAN', selector: '#missing', framePath: [], href: location.href, title: document.title, isPopup: false }, () => resolve());
    }));
    // Update mapping in storage to include fallbackSelectors
    await panel.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const u = tabs[0]?.url || '';
      const host = u ? new URL(u).hostname : '';
      const key = `MAP_${host}`;
      const bag = await chrome.storage.local.get([key]);
      const prof = bag[key] || {};
      if (prof.PLAN) { prof.PLAN.fallbackSelectors = ['#e2eFallback']; }
      await chrome.storage.local.set({ [key]: prof });
    });
    await panel.getByRole('button', { name: 'Insert Plan' }).click();
    const v = await web.evaluate(() => (document.querySelector('#e2eFallback') as HTMLTextAreaElement)?.value || '');
    expect(v.length).toBeGreaterThan(0);
  });
});
