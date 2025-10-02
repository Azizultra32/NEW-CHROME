/**
 * Encryption Utilities
 *
 * AES-GCM encryption for PHI mapping tables and sensitive data.
 * Uses Node.js crypto module (Web Crypto API compatible).
 */

import { webcrypto } from 'node:crypto';
const { subtle } = webcrypto;

/**
 * Generate a new AES-GCM key
 * @returns {Promise<CryptoKey>}
 */
export async function generateKey() {
  return await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export key to raw format for storage
 * @param {CryptoKey} key
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportKey(key) {
  return await subtle.exportKey('raw', key);
}

/**
 * Import key from raw format
 * @param {ArrayBuffer|Uint8Array} keyData
 * @returns {Promise<CryptoKey>}
 */
export async function importKey(keyData) {
  return await subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-GCM
 * @param {CryptoKey} key - Encryption key
 * @param {string|Object} data - Data to encrypt (will be JSON.stringify if object)
 * @returns {Promise<{ciphertext: Uint8Array, iv: Uint8Array}>}
 */
export async function encrypt(key, data) {
  // Convert data to bytes
  const plaintext = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new TextEncoder().encode(JSON.stringify(data));

  // Generate random IV (12 bytes for GCM)
  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv
  };
}

/**
 * Decrypt data with AES-GCM
 * @param {CryptoKey} key - Decryption key
 * @param {Uint8Array|ArrayBuffer} ciphertext - Encrypted data
 * @param {Uint8Array|ArrayBuffer} iv - Initialization vector
 * @param {boolean} parseJSON - If true, parse result as JSON
 * @returns {Promise<string|Object>}
 */
export async function decrypt(key, ciphertext, iv, parseJSON = false) {
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoded = new TextDecoder().decode(plaintext);
  return parseJSON ? JSON.parse(decoded) : decoded;
}

/**
 * Hash data with SHA-256 (for fingerprints, non-reversible)
 * @param {string} data
 * @returns {Promise<string>} Hex string
 */
export async function hash(data) {
  const bytes = new TextEncoder().encode(data);
  const hashBuffer = await subtle.digest('SHA-256', bytes);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create HMAC for signing (useful for audit logs)
 * @param {string} message
 * @param {string} secret
 * @returns {Promise<string>} Hex string
 */
export async function hmac(message, secret) {
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );

  const signatureArray = new Uint8Array(signature);
  return Array.from(signatureArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Utility: Convert Uint8Array to Base64 (for JSON serialization)
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Utility: Convert Base64 to Uint8Array
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function fromBase64(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * High-level: Encrypt PHI map for storage/transmission
 * @param {Object} phiMap - PHI token mapping
 * @param {CryptoKey} key - Encryption key
 * @returns {Promise<{encrypted: string, iv: string}>} Base64 encoded
 */
export async function encryptPHIMap(phiMap, key) {
  const { ciphertext, iv } = await encrypt(key, phiMap);
  return {
    encrypted: toBase64(ciphertext),
    iv: toBase64(iv)
  };
}

/**
 * High-level: Decrypt PHI map from storage/transmission
 * @param {string} encryptedBase64 - Base64 encoded ciphertext
 * @param {string} ivBase64 - Base64 encoded IV
 * @param {CryptoKey} key - Decryption key
 * @returns {Promise<Object>} PHI map
 */
export async function decryptPHIMap(encryptedBase64, ivBase64, key) {
  const ciphertext = fromBase64(encryptedBase64);
  const iv = fromBase64(ivBase64);
  return await decrypt(key, ciphertext, iv, true);
}

// Test mode
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Encryption Utilities - Test Mode\n');

  (async () => {
    // Test 1: Key generation
    console.log('1. Generating AES-GCM key...');
    const key = await generateKey();
    console.log('✓ Key generated');

    // Test 2: Encrypt/Decrypt string
    console.log('\n2. Testing string encryption...');
    const testString = 'Hello, PHI protection!';
    const { ciphertext, iv } = await encrypt(key, testString);
    console.log(`✓ Encrypted: ${toBase64(ciphertext).slice(0, 20)}...`);

    const decrypted = await decrypt(key, ciphertext, iv);
    console.log(`✓ Decrypted: ${decrypted}`);
    console.log(`✓ Match: ${decrypted === testString}`);

    // Test 3: Encrypt/Decrypt object (PHI map)
    console.log('\n3. Testing PHI map encryption...');
    const phiMap = {
      'NAME:1': 'John Doe',
      'DATE:1': '1985-06-10',
      'PHONE:1': '555-123-4567'
    };

    const { encrypted, iv: ivBase64 } = await encryptPHIMap(phiMap, key);
    console.log(`✓ Encrypted PHI map: ${encrypted.slice(0, 30)}...`);

    const decryptedMap = await decryptPHIMap(encrypted, ivBase64, key);
    console.log('✓ Decrypted PHI map:');
    console.log(decryptedMap);
    console.log(`✓ Match: ${JSON.stringify(phiMap) === JSON.stringify(decryptedMap)}`);

    // Test 4: Hashing
    console.log('\n4. Testing SHA-256 hashing...');
    const patientFingerprint = 'DOE,JOHN|1985-06-10|7890';
    const hashedFP = await hash(patientFingerprint);
    console.log(`✓ Fingerprint hash: ${hashedFP}`);

    // Test 5: HMAC signing
    console.log('\n5. Testing HMAC signing...');
    const message = 'encounter_123_patient_viewed';
    const secret = 'audit_secret_key';
    const signature = await hmac(message, secret);
    console.log(`✓ HMAC signature: ${signature}`);

    // Test 6: Key export/import
    console.log('\n6. Testing key export/import...');
    const exportedKey = await exportKey(key);
    const importedKey = await importKey(exportedKey);
    console.log('✓ Key exported and imported');

    // Verify imported key works
    const testData = 'Test with imported key';
    const { ciphertext: ct2, iv: iv2 } = await encrypt(importedKey, testData);
    const decrypted2 = await decrypt(importedKey, ct2, iv2);
    console.log(`✓ Imported key works: ${decrypted2 === testData}`);

    console.log('\n✅ All encryption tests passed!');
  })().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}