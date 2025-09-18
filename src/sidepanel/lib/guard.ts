const CONFIRM_KEY = 'ASSIST_CONFIRMED_FP';

type GuardOk = { ok: true; fp: string; preview?: string };
type GuardFail = { ok: false; reason: 'missing' | 'mismatch' | 'unconfirmed' | 'error'; fp?: string; preview?: string };
export type GuardStatus = GuardOk | GuardFail;

export async function verifyPatientBeforeInsert(): Promise<GuardStatus> {
  try {
    const sessionStore = await chrome.storage.session.get(null);
    const keys = Object.keys(sessionStore).filter((k) => k.startsWith('FP_'));
    if (!keys.length) {
      return { ok: false, reason: 'missing' };
    }
    const latest = sessionStore[keys[keys.length - 1]];
    const fp = typeof latest === 'string' ? latest : latest?.fp;
    const preview = typeof latest === 'string' ? undefined : latest?.preview;
    if (!fp) {
      return { ok: false, reason: 'missing' };
    }

    const confirmedStore = await chrome.storage.local.get([CONFIRM_KEY]);
    const confirmed = confirmedStore[CONFIRM_KEY] as { fp?: string } | undefined;
    if (!confirmed?.fp) {
      return { ok: false, reason: 'unconfirmed', fp, preview };
    }
    if (confirmed.fp !== fp) {
      return { ok: false, reason: 'mismatch', fp, preview };
    }
    return { ok: true, fp, preview };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function confirmPatientFingerprint(fp: string, preview?: string) {
  await chrome.storage.local.set({ [CONFIRM_KEY]: { fp, preview, ts: Date.now() } });
}

export async function clearConfirmedFingerprint() {
  await chrome.storage.local.remove([CONFIRM_KEY]);
}
