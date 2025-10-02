/**
 * PHI Re-hydration Utilities
 *
 * Restores original PHI values from tokenized transcripts received from backend.
 * Handles encryption/decryption of PHI maps in browser IndexedDB.
 */

export type PHIMap = Record<string, string>; // "NAME:1" → "John Doe"

export interface EncryptedPHIMap {
  encrypted: string; // Base64 encoded ciphertext
  iv: string; // Base64 encoded initialization vector
}

/**
 * Re-hydrate tokenized text by replacing tokens with original PHI
 * @param tokenizedText - Text with [TYPE:N] tokens
 * @param phiMap - Token → value mapping
 * @returns Original text with PHI restored
 */
export function rehydrateTranscript(
  tokenizedText: string,
  phiMap: PHIMap
): string {
  let result = tokenizedText;

  // Replace all tokens with original values
  for (const [token, value] of Object.entries(phiMap)) {
    const tokenPattern = `[${token}]`;
    result = result.replaceAll(tokenPattern, value);
  }

  return result;
}

/**
 * Generate encryption key for PHI storage
 * @returns CryptoKey for AES-GCM encryption
 */
export async function generatePHIKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt PHI map for storage
 * @param phiMap - PHI token mapping
 * @param key - Encryption key
 * @returns Encrypted data with IV
 */
export async function encryptPHIMap(
  phiMap: PHIMap,
  key: CryptoKey
): Promise<EncryptedPHIMap> {
  const plaintext = new TextEncoder().encode(JSON.stringify(phiMap));

  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Convert to Base64 for storage
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

/**
 * Decrypt PHI map from storage
 * @param encryptedData - Encrypted PHI map with IV
 * @param key - Decryption key
 * @returns Decrypted PHI map
 */
export async function decryptPHIMap(
  encryptedData: EncryptedPHIMap,
  key: CryptoKey
): Promise<PHIMap> {
  // Decode from Base64
  const ciphertext = Uint8Array.from(atob(encryptedData.encrypted), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoded = new TextDecoder().decode(plaintext);
  return JSON.parse(decoded);
}

/**
 * Store PHI map in IndexedDB (encrypted)
 * @param encounterId - Encounter ID
 * @param phiMap - PHI mapping
 * @param key - Encryption key (stored in memory only)
 */
export async function storePHIMap(
  encounterId: string,
  phiMap: PHIMap,
  key: CryptoKey
): Promise<void> {
  const encrypted = await encryptPHIMap(phiMap, key);

  // Use chrome.storage.local for simpler implementation
  // In production, consider IndexedDB for larger datasets
  const storageKey = `phi_map_${encounterId}`;

  await chrome.storage.local.set({
    [storageKey]: {
      ...encrypted,
      encounterId,
      timestamp: Date.now()
    }
  });
}

/**
 * Load PHI map from storage
 * @param encounterId - Encounter ID
 * @param key - Decryption key
 * @returns Decrypted PHI map or null if not found
 */
export async function loadPHIMap(
  encounterId: string,
  key: CryptoKey
): Promise<PHIMap | null> {
  const storageKey = `phi_map_${encounterId}`;

  const result = await chrome.storage.local.get([storageKey]);
  const stored = result[storageKey];

  if (!stored) {
    return null;
  }

  return await decryptPHIMap(
    {
      encrypted: stored.encrypted,
      iv: stored.iv
    },
    key
  );
}

/**
 * Delete PHI map from storage
 * @param encounterId - Encounter ID
 */
export async function deletePHIMap(encounterId: string): Promise<void> {
  const storageKey = `phi_map_${encounterId}`;
  await chrome.storage.local.remove([storageKey]);
}

/**
 * Get statistics about PHI in map
 * @param phiMap - PHI mapping
 * @returns Stats by PHI type
 */
export function getPHIStats(phiMap: PHIMap): Record<string, number> {
  const stats: Record<string, number> = {};

  for (const token of Object.keys(phiMap)) {
    const type = token.split(':')[0];
    stats[type] = (stats[type] || 0) + 1;
  }

  return stats;
}

/**
 * Validate PHI map integrity
 * @param phiMap - PHI mapping
 * @returns Validation result
 */
export function validatePHIMap(phiMap: PHIMap): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check format
  for (const [token, value] of Object.entries(phiMap)) {
    if (!token.match(/^[A-Z]+:\d+$/)) {
      errors.push(`Invalid token format: ${token}`);
    }

    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`Invalid value for token ${token}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Session key manager (in-memory only)
 * Keys are generated per encounter and never persisted
 */
class PHIKeyManager {
  private keys: Map<string, CryptoKey> = new Map();

  async getOrCreateKey(encounterId: string): Promise<CryptoKey> {
    if (!this.keys.has(encounterId)) {
      const key = await generatePHIKey();
      this.keys.set(encounterId, key);
    }

    return this.keys.get(encounterId)!;
  }

  deleteKey(encounterId: string): void {
    this.keys.delete(encounterId);
  }

  clear(): void {
    this.keys.clear();
  }
}

// Singleton instance
export const phiKeyManager = new PHIKeyManager();