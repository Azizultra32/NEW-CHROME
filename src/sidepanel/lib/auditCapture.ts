import { phiKeyManager } from './phi-rehydration';

async function encryptString(data: string, key: CryptoKey): Promise<{ ivB64: string; ciphertextB64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(data);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
  return { ivB64: toB64(iv), ciphertextB64: toB64(ct) };
}

export async function captureAndSendScreenshot(encounterId: string, apiBase: string, label: string = 'post_insert'): Promise<boolean> {
  try {
    // Capture visible tab as data URL (PNG)
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
    if (!dataUrl) return false;
    // Encrypt with encounter session key
    const key = await phiKeyManager.getOrCreateKey(encounterId);
    const payload = JSON.stringify({ label, dataUrl, ts: Date.now() });
    const { ivB64, ciphertextB64 } = await encryptString(payload, key);
    // Send to backend
    const res = await fetch(`${apiBase}/v1/audit/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encounterId, iv: ivB64, data: ciphertextB64, label, ts: Date.now() })
    });
    return res.ok;
  } catch {
    return false;
  }
}

