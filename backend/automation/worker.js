/**
 * Playwright Backend Worker
 * Headless browser automation for complex EMR interactions
 * Handles: Field discovery, paste with verification, popup handling, screenshot audit trails
 */

import { chromium } from 'playwright';
import { findField, getAllFields } from './fieldLocator.js';
import { pasteWithVerification, batchPaste, handlePastePopups } from './pasteStrategies.js';
import { captureAuditTrail, createAuditLog } from './screenshots.js';

/**
 * Worker singleton
 */
class PlaywrightWorker {
  constructor() {
    this.browser = null;
    this.context = null;
    this.activePage = null;
    this.sessionId = null;
  }

  /**
   * Initialize browser and context
   */
  async init(options = {}) {
    const { headless = true, userDataDir = null } = options;

    this.browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 },
      ...(userDataDir && { userDataDir })
    });

    this.activePage = await this.context.newPage();
    this.sessionId = Date.now().toString(36);

    console.log(`[Worker] Initialized - Session: ${this.sessionId}`);
    return this.sessionId;
  }

  /**
   * Navigate to EMR page
   */
  async navigate(url) {
    if (!this.activePage) throw new Error('Worker not initialized');

    await this.activePage.goto(url, { waitUntil: 'domcontentloaded' });
    await this.activePage.waitForTimeout(500); // Let page settle

    createAuditLog('navigate', { url, sessionId: this.sessionId });
    console.log(`[Worker] Navigated to: ${url}`);
  }

  /**
   * Discover all fields on current page
   */
  async discoverFields() {
    if (!this.activePage) throw new Error('Worker not initialized');

    const fields = await getAllFields(this.activePage);
    createAuditLog('discover_fields', { count: fields.length, sessionId: this.sessionId });

    return fields;
  }

  /**
   * Paste a single section with verification
   */
  async pasteSingleSection(sectionName, text, mode = 'replace') {
    if (!this.activePage) throw new Error('Worker not initialized');

    try {
      // Capture audit trail
      const auditPaths = await captureAuditTrail(this.activePage, sectionName, {
        sessionId: this.sessionId
      });

      // Find field
      const { element, confidence, strategy } = await findField(this.activePage, sectionName);

      // Handle popups
      await handlePastePopups(this.activePage);

      // Paste with verification
      const result = await pasteWithVerification(this.activePage, element, text, {
        mode,
        verify: true
      });

      // Log audit
      createAuditLog('paste_section', {
        section: sectionName,
        success: result.success,
        confidence,
        strategy,
        mode,
        sessionId: this.sessionId,
        auditPaths
      });

      return {
        success: result.success,
        section: sectionName,
        confidence,
        strategy,
        verification: result.verification,
        auditPaths
      };

    } catch (err) {
      createAuditLog('paste_section_error', {
        section: sectionName,
        error: err.message,
        sessionId: this.sessionId
      });

      return {
        success: false,
        section: sectionName,
        error: err.message
      };
    }
  }

  /**
   * Batch paste multiple sections
   */
  async pasteBatch(sections) {
    if (!this.activePage) throw new Error('Worker not initialized');

    const results = await batchPaste(this.activePage, sections);

    createAuditLog('batch_paste', {
      totalSections: sections.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      sessionId: this.sessionId
    });

    return results;
  }

  /**
   * Take screenshot of current page state
   */
  async screenshot(options = {}) {
    if (!this.activePage) throw new Error('Worker not initialized');

    const { fullPage = true, path = null } = options;
    const screenshot = await this.activePage.screenshot({ fullPage, type: 'png' });

    if (path) {
      const fs = await import('fs');
      fs.writeFileSync(path, screenshot);
    }

    return screenshot.toString('base64');
  }

  /**
   * Execute custom JavaScript in page context
   */
  async executeScript(script) {
    if (!this.activePage) throw new Error('Worker not initialized');

    const result = await this.activePage.evaluate(script);
    return result;
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl() {
    if (!this.activePage) throw new Error('Worker not initialized');
    return this.activePage.url();
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log(`[Worker] Closed - Session: ${this.sessionId}`);
    }
    this.browser = null;
    this.context = null;
    this.activePage = null;
    this.sessionId = null;
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      initialized: !!this.browser,
      sessionId: this.sessionId,
      pageUrl: this.activePage ? await this.activePage.url() : null,
      contextPages: this.context ? this.context.pages().length : 0
    };
  }
}

// Export singleton instance
export const worker = new PlaywrightWorker();

/**
 * Job queue for async paste operations
 */
export class JobQueue {
  constructor() {
    this.jobs = new Map();
    this.jobCounter = 0;
  }

  /**
   * Submit a new job
   */
  async submit(type, params) {
    const jobId = `job_${++this.jobCounter}_${Date.now()}`;
    const job = {
      id: jobId,
      type,
      params,
      status: 'pending',
      createdAt: new Date(),
      result: null,
      error: null
    };

    this.jobs.set(jobId, job);

    // Execute job asynchronously
    this.executeJob(jobId).catch(err => {
      job.status = 'failed';
      job.error = err.message;
    });

    return jobId;
  }

  /**
   * Execute a job
   */
  async executeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = 'running';

    try {
      let result;
      switch (job.type) {
        case 'paste_single':
          result = await worker.pasteSingleSection(
            job.params.section,
            job.params.text,
            job.params.mode
          );
          break;

        case 'paste_batch':
          result = await worker.pasteBatch(job.params.sections);
          break;

        case 'discover_fields':
          result = await worker.discoverFields();
          break;

        case 'screenshot':
          result = await worker.screenshot(job.params);
          break;

        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();

    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      job.completedAt = new Date();
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      result: job.result,
      error: job.error
    };
  }

  /**
   * Cleanup completed jobs older than 1 hour
   */
  cleanup() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'completed' && job.completedAt < oneHourAgo) {
        this.jobs.delete(jobId);
      }
    }
  }
}

export const jobQueue = new JobQueue();

// Cleanup old jobs every 10 minutes
setInterval(() => jobQueue.cleanup(), 10 * 60 * 1000);
