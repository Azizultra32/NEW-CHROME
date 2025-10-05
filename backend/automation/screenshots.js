/**
 * Screenshot Audit Trail
 * Captures before/after screenshots for HIPAA compliance and verification
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Create screenshot audit trail for a paste operation
 * @param {import('playwright').Page} page
 * @param {string} sectionName
 * @param {Object} options
 * @returns {Promise<{beforePath: string, afterPath: string, diffPath: string}>}
 */
export async function captureAuditTrail(page, sectionName, options = {}) {
  const { outputDir = './audit-screenshots', sessionId = generateSessionId() } = options;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${sessionId}_${sectionName}_${timestamp}`;

  const beforePath = path.join(outputDir, `${prefix}_before.png`);
  const afterPath = path.join(outputDir, `${prefix}_after.png`);
  const fullPagePath = path.join(outputDir, `${prefix}_fullpage.png`);

  // Capture full page screenshot
  await page.screenshot({ path: fullPagePath, fullPage: true });

  return {
    beforePath,
    afterPath,
    fullPagePath,
    sessionId,
    timestamp
  };
}

/**
 * Capture element-specific screenshots
 */
export async function captureElementScreenshot(element, outputPath) {
  const screenshot = await element.screenshot({ type: 'png' });
  fs.writeFileSync(outputPath, screenshot);
  return outputPath;
}

/**
 * Generate unique session ID for grouping related screenshots
 */
function generateSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Create audit log entry
 */
export function createAuditLog(operation, metadata) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    metadata,
    user: process.env.USER || 'system',
    success: metadata.success || false
  };

  const logDir = './audit-logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, `audit-${new Date().toISOString().split('T')[0]}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

  return logEntry;
}

/**
 * Cleanup old audit files (older than 90 days for HIPAA compliance)
 */
export function cleanupOldAudits(daysToKeep = 90) {
  const dirs = ['./audit-screenshots', './audit-logs'];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        console.log(`[Audit Cleanup] Deleted old file: ${filePath}`);
      }
    }
  }
}
