/**
 * PHI Redactor - Pseudonymization Engine
 *
 * Detects and tokenizes Protected Health Information (PHI) in transcripts
 * to enable HIPAA/PIPEDA-compliant cloud processing.
 *
 * Strategy: Replace PHI with reversible tokens (e.g., [NAME:1], [DATE:1])
 * Store mapping table encrypted for later re-hydration.
 */

// PHI Detection Patterns
const PHI_PATTERNS = [
  // Phone numbers (North American format)
  {
    type: 'PHONE',
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    examples: ['555-123-4567', '(555) 123-4567', '+1 555 123 4567']
  },

  // Email addresses
  {
    type: 'EMAIL',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    examples: ['patient@email.com']
  },

  // Dates - ISO format and common patterns
  {
    type: 'DATE',
    regex: /\b(19|20)\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g,
    examples: ['2024-03-15', '1985/06/10']
  },

  // Canadian Health Numbers (10 digits, common format)
  {
    type: 'HCN',
    regex: /\b(?:PHN|HCN|Health\s*Number)[:\s]*(\d{10})\b/gi,
    examples: ['PHN 9876543210', 'HCN: 1234567890']
  },

  // Medical Record Numbers (alphanumeric, 6+ chars)
  {
    type: 'MRN',
    regex: /\b(?:MRN|Chart\s*(?:No|#)?)[:\s]*([A-Z0-9-]{6,})\b/gi,
    examples: ['MRN ABC123456', 'Chart # 789-XYZ']
  },

  // Social Insurance Number (Canadian format)
  {
    type: 'SIN',
    regex: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
    examples: ['123-456-789', '123 456 789']
  },

  // Street addresses (basic pattern)
  {
    type: 'ADDRESS',
    regex: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/gi,
    examples: ['123 Main Street', '456 Oak Avenue']
  },

  // Postal codes (Canadian format)
  {
    type: 'POSTAL',
    regex: /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi,
    examples: ['V5K 1A1', 'M5H2N2']
  }
];

// Medical terms that should NOT be redacted (stoplist)
const MEDICAL_STOPLIST = new Set([
  'parkinson', 'parkinsons', 'hodgkin', 'hodgkins', 'crohn', 'crohns',
  'alzheimer', 'alzheimers', 'addison', 'addisons', 'graves', 'cushings',
  'sjogren', 'raynaud', 'raynauds', 'weber', 'guillain', 'barre',
  'marfan', 'turner', 'down', 'williams', 'prader', 'willi'
]);

// Context markers for name detection
const NAME_CONTEXTS = [
  /\b(?:Dr|Doctor|Mr|Mrs|Ms|Miss|Patient|Patient's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  /\b(?:this is|my name is|I'm|I am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
];

/**
 * Pseudonymize text by replacing PHI with tokens
 * @param {string} text - Original text containing PHI
 * @param {Map<string, string>} phiMap - Existing mapping (optional, for incremental redaction)
 * @returns {{ text: string, phiMap: Map<string, string> }}
 */
export function pseudonymize(text, phiMap = new Map()) {
  let result = text;
  const counters = {};

  // Helper: Get next index for a PHI type
  const getNextIndex = (type) => {
    if (!counters[type]) {
      counters[type] = 1;
      // Check existing map for highest index
      for (const key of phiMap.keys()) {
        if (key.startsWith(`${type}:`)) {
          const idx = parseInt(key.split(':')[1], 10);
          if (idx >= counters[type]) {
            counters[type] = idx + 1;
          }
        }
      }
    }
    return counters[type]++;
  };

  // Helper: Create token and update map
  const tokenize = (type, value) => {
    // Check if already tokenized
    for (const [token, originalValue] of phiMap.entries()) {
      if (originalValue === value) {
        return `[${token}]`;
      }
    }

    const index = getNextIndex(type);
    const token = `${type}:${index}`;
    phiMap.set(token, value);
    return `[${token}]`;
  };

  // Apply pattern-based redaction
  for (const pattern of PHI_PATTERNS) {
    result = result.replace(pattern.regex, (match) => {
      // Special handling for HCN/MRN - extract just the number
      if (pattern.type === 'HCN' || pattern.type === 'MRN') {
        const parts = match.split(/[:\s]+/);
        const value = parts[parts.length - 1];
        const prefix = match.substring(0, match.indexOf(value));
        return prefix + tokenize(pattern.type, value);
      }
      return tokenize(pattern.type, match);
    });
  }

  // Context-aware name detection
  for (const contextRegex of NAME_CONTEXTS) {
    result = result.replace(contextRegex, (match, name) => {
      const nameLower = name.toLowerCase();

      // Skip if in stoplist
      if (MEDICAL_STOPLIST.has(nameLower)) {
        return match;
      }

      // Check if multiple words (likely full name)
      const words = name.split(/\s+/);
      if (words.length >= 2) {
        const token = tokenize('NAME', name);
        return match.replace(name, token.slice(1, -1)); // Remove [ ] for replacement
      }

      return match;
    });
  }

  return { text: result, phiMap };
}

/**
 * Re-hydrate tokenized text by restoring original PHI
 * @param {string} tokenizedText - Text with [TYPE:N] tokens
 * @param {Map<string, string>|Object} phiMap - Token → value mapping
 * @returns {string} Original text with PHI restored
 */
export function rehydrate(tokenizedText, phiMap) {
  let result = tokenizedText;

  // Convert object to Map if needed
  const map = phiMap instanceof Map ? phiMap : new Map(Object.entries(phiMap || {}));

  // Replace all tokens with original values
  for (const [token, value] of map.entries()) {
    const tokenPattern = `[${token}]`;
    result = result.replaceAll(tokenPattern, value);
  }

  return result;
}

/**
 * Serialize PHI map for storage/transmission
 * @param {Map<string, string>} phiMap
 * @returns {Object}
 */
export function serializePHIMap(phiMap) {
  return Object.fromEntries(phiMap);
}

/**
 * Deserialize PHI map from storage/transmission
 * @param {Object} obj
 * @returns {Map<string, string>}
 */
export function deserializePHIMap(obj) {
  return new Map(Object.entries(obj || {}));
}

/**
 * Validate that PHI redaction was successful (no obvious PHI remains)
 * @param {string} text - Pseudonymized text
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateRedaction(text) {
  const warnings = [];

  // Check for obvious PHI patterns that weren't caught
  if (/\b\d{3}[-\s]\d{3}[-\s]\d{4}\b/.test(text)) {
    warnings.push('Possible phone number detected in pseudonymized text');
  }

  if (/@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) {
    warnings.push('Possible email detected in pseudonymized text');
  }

  if (/\b\d{4}[-/]\d{2}[-/]\d{2}\b/.test(text)) {
    warnings.push('Possible date detected in pseudonymized text');
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}

/**
 * Get statistics about redaction
 * @param {Map<string, string>} phiMap
 * @returns {Object} Stats by PHI type
 */
export function getRedactionStats(phiMap) {
  const stats = {};
  for (const token of phiMap.keys()) {
    const type = token.split(':')[0];
    stats[type] = (stats[type] || 0) + 1;
  }
  return stats;
}

// Example usage and testing
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('PHI Redactor - Test Mode\n');

  const testText = `
Doctor: Good morning, this is Dr. Emily Smith with patient John Doe,
date of birth 1985-06-10, PHN 9876543210, MRN ABC-123456.

Patient: Hi Dr. Smith, I've had chest pain since 2024-03-15.
My email is john.doe@email.com and you can reach me at 555-123-4567.
I live at 123 Main Street, Vancouver.

Doctor: Let me check your chart. Your postal code is V5K 1A1, correct?
  `;

  console.log('Original text:');
  console.log(testText);
  console.log('\n' + '='.repeat(60) + '\n');

  const { text: pseudonymized, phiMap } = pseudonymize(testText);

  console.log('Pseudonymized text:');
  console.log(pseudonymized);
  console.log('\n' + '='.repeat(60) + '\n');

  console.log('PHI Map:');
  console.log(serializePHIMap(phiMap));
  console.log('\n' + '='.repeat(60) + '\n');

  console.log('Redaction Stats:');
  console.log(getRedactionStats(phiMap));
  console.log('\n' + '='.repeat(60) + '\n');

  const validation = validateRedaction(pseudonymized);
  console.log('Validation:');
  console.log(validation);
  console.log('\n' + '='.repeat(60) + '\n');

  const rehydrated = rehydrate(pseudonymized, phiMap);
  console.log('Re-hydrated text:');
  console.log(rehydrated);
  console.log('\n' + '='.repeat(60) + '\n');

  console.log('✅ Test complete - verify original and re-hydrated text match');
}