type TelemetryEvent = {
  ts: number;
  name: string;
  data?: any;
};

const KEY = 'ASSIST_TELEMETRY_V1';
const LIMIT = 500;

async function readAll(): Promise<TelemetryEvent[]> {
  try {
    const bag = await chrome.storage.local.get([KEY]);
    const arr = Array.isArray(bag[KEY]) ? bag[KEY] : [];
    return arr as TelemetryEvent[];
  } catch {
    return [];
  }
}

async function writeAll(items: TelemetryEvent[]) {
  try {
    const trimmed = items.slice(-LIMIT);
    await chrome.storage.local.set({ [KEY]: trimmed });
  } catch {}
}

export async function recordEvent(name: string, data?: any) {
  const items = await readAll();
  items.push({ ts: Date.now(), name, data });
  await writeAll(items);
}

export async function recordLatency(name: string, ms: number, data?: any) {
  await recordEvent(name, { ms, ...(data || {}) });
}

export async function exportTelemetry(): Promise<string> {
  const items = await readAll();
  return JSON.stringify({ ts: Date.now(), items }, null, 2);
}

export async function clearTelemetry() {
  try { await chrome.storage.local.remove([KEY]); } catch {}
}

export async function getRecent(n = 50): Promise<TelemetryEvent[]> {
  const items = await readAll();
  return items.slice(-n);
}

