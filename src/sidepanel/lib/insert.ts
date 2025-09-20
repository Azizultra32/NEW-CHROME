import type { Strategy } from './mapping';

export async function insertTextInto(selector: string, text: string): Promise<Strategy | 'fail'> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return 'fail';

  const execResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel: string, value: string) => {
      const el = document.querySelector(sel) as any;
      if (!el) return 'fail';
      if (el.isContentEditable) {
        el.focus();
        const ok = document.execCommand('insertText', false, value);
        return ok ? 'execCommand' : 'fail';
      }
      if ('value' in el) {
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return 'value';
      }
      return 'fail';
    },
    args: [selector, text]
  }).catch(() => null);

  const directResult = execResult?.[0]?.result as Strategy | 'fail' | undefined;
  if (directResult && directResult !== 'fail') return directResult;

  try {
    await navigator.clipboard.writeText(text);
  } catch {}

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ev = new KeyboardEvent('keydown', {
        key: 'v',
        metaKey: isMac,
        ctrlKey: !isMac,
        bubbles: true
      });
      document.activeElement?.dispatchEvent(ev);
    }
  }).catch(() => {});

  return 'clipboard';
}
