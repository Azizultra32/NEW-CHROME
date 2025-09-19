// Helpers for reading runtime/environment hints inside the side panel bundle without
// assuming Node globals exist. The extension runs in the browser, so we lean on
// optional chaining and fall back to user overrides when available.

type MaybeNodeProcess = { env?: Record<string, string | undefined> };

type MaybeImportMetaEnv = ImportMeta & {
  env?: {
    MODE?: string;
    mode?: string;
    NODE_ENV?: string;
    DEV?: string;
  };
};

type AssistConfig = {
  DEV_TOOLS?: boolean;
};

const assistGlobal = globalThis as typeof globalThis & {
  process?: MaybeNodeProcess;
  __ASSIST_CONFIG__?: AssistConfig;
};

const DEV_STORAGE_KEY = 'assist:devtools';

function parseBoolean(value: string | null | undefined) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'on', 'enable'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'disable'].includes(normalized)) return false;
  return undefined;
}

function readDevPreferenceFromStorage() {
  try {
    const raw = assistGlobal.localStorage?.getItem?.(DEV_STORAGE_KEY);
    return parseBoolean(raw);
  } catch {
    return undefined;
  }
}

function readDevPreferenceFromConfig() {
  const flag = assistGlobal.__ASSIST_CONFIG__?.DEV_TOOLS;
  return typeof flag === 'boolean' ? flag : undefined;
}

function readNodeEnv() {
  return assistGlobal.process?.env?.NODE_ENV;
}

function readImportMetaMode() {
  try {
    const metaEnv = (import.meta as MaybeImportMetaEnv).env;
    return metaEnv?.MODE ?? metaEnv?.mode ?? metaEnv?.NODE_ENV ?? metaEnv?.DEV;
  } catch {
    return undefined;
  }
}

// Resolves whether development-only UI should render. Order of precedence:
// 1. Manual override via localStorage (`assist:devtools`), useful for debugging in prod builds.
// 2. Flag provided by the injected Assist config object.
// 3. Standard build-time NODE_ENV shims.
export function detectDevelopmentBuild() {
  const storagePreference = readDevPreferenceFromStorage();
  if (typeof storagePreference === 'boolean') {
    return storagePreference;
  }

  const configFlag = readDevPreferenceFromConfig();
  if (typeof configFlag === 'boolean') {
    return configFlag;
  }

  const nodeEnv = readNodeEnv();
  if (typeof nodeEnv === 'string') {
    return nodeEnv !== 'production';
  }

  const metaMode = readImportMetaMode();
  if (typeof metaMode === 'string') {
    return metaMode !== 'production';
  }

  return false;
}

export const isDevelopmentBuild = detectDevelopmentBuild();

