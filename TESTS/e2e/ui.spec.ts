import { test, expect } from '@playwright/test';
import { join } from 'path';

test('sidepanel UI renders (file context)', async ({ page }) => {
  const root = join(__dirname, '../../');
  const path = 'file://' + join(root, 'dist/sidepanel.html');
  await page.goto(path);
  await expect(page.getByText('Ready for “assist …” commands')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Recording' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Map Fields' })).toBeVisible();
});

test('ehr test page renders', async ({ page }) => {
  const root = join(__dirname, '../../');
  const path = 'file://' + join(root, 'dist/ehr-test.html');
  await page.goto(path);
  await expect(page.getByText('AssistMD Test EHR')).toBeVisible();
  await expect(page.locator('#hpiBox')).toBeVisible();
});

