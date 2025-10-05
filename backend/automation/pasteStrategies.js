/**
 * Paste Strategies with Verification
 * Handles different paste methods and verifies content was inserted correctly
 */

/**
 * Paste text into a field with verification
 * @param {import('playwright').Page} page
 * @param {import('playwright').ElementHandle} element
 * @param {string} text - Text to paste
 * @param {Object} options
 * @param {string} options.mode - 'replace' or 'append'
 * @param {boolean} options.verify - Whether to verify paste succeeded
 * @returns {Promise<{success: boolean, verification: Object}>}
 */
export async function pasteWithVerification(page, element, text, options = {}) {
  const { mode = 'replace', verify = true } = options;

  // Get element metadata
  const elementInfo = await element.evaluate(el => ({
    tagName: el.tagName,
    type: el.type,
    isContentEditable: el.isContentEditable,
    initialValue: el.value || el.textContent || ''
  }));

  // Take before screenshot
  const beforeScreenshot = verify ? await element.screenshot({ type: 'png' }) : null;

  // Choose paste strategy based on element type
  let strategy;
  if (elementInfo.tagName === 'INPUT' || elementInfo.tagName === 'TEXTAREA') {
    strategy = 'input-value';
    await pasteToInputElement(element, text, mode);
  } else if (elementInfo.isContentEditable) {
    strategy = 'contenteditable-execCommand';
    await pasteToContentEditable(page, element, text, mode);
  } else {
    throw new Error('Element is not editable');
  }

  // Wait for DOM to update
  await page.waitForTimeout(100);

  // Verify paste
  if (verify) {
    const afterScreenshot = await element.screenshot({ type: 'png' });
    const currentValue = await element.evaluate(el => el.value || el.textContent || '');

    const verification = {
      success: currentValue.includes(text),
      strategy,
      beforeLength: elementInfo.initialValue.length,
      afterLength: currentValue.length,
      expectedText: text,
      actualValue: currentValue,
      mode,
      beforeScreenshot: beforeScreenshot.toString('base64'),
      afterScreenshot: afterScreenshot.toString('base64')
    };

    return { success: verification.success, verification };
  }

  return { success: true, verification: null };
}

/**
 * Paste to <input> or <textarea> elements
 */
async function pasteToInputElement(element, text, mode) {
  await element.evaluate((el, { text, mode }) => {
    if (mode === 'replace') {
      el.value = text;
    } else {
      // Append with space separator if not empty
      el.value = el.value ? el.value + ' ' + text : text;
    }
    // Trigger input event for React/Vue apps
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { text, mode });
}

/**
 * Paste to contenteditable elements
 */
async function pasteToContentEditable(page, element, text, mode) {
  await element.evaluate((el, { text, mode }) => {
    // Focus the element
    el.focus();

    if (mode === 'replace') {
      // Select all and replace
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    } else {
      // Move cursor to end and append
      const range = document.createRange();
      const sel = window.getSelection();

      // Move to end
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      // Insert space if not empty
      if (el.textContent && el.textContent.trim()) {
        document.execCommand('insertText', false, ' ');
      }
      document.execCommand('insertText', false, text);
    }

    // Trigger input event
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { text, mode });
}

/**
 * Handle EMR popups/alerts during paste
 * Some EMRs show confirmation dialogs when pasting large amounts of text
 */
export async function handlePastePopups(page) {
  // Setup dialog handler (accept all confirmation dialogs)
  page.on('dialog', async dialog => {
    console.log(`[Popup Handler] Dialog detected: ${dialog.type()} - ${dialog.message()}`);
    await dialog.accept();
  });

  // Check for common modal patterns
  const modalSelectors = [
    '[role="dialog"]',
    '.modal',
    '.popup',
    '[class*="alert"]',
    '[class*="confirm"]'
  ];

  for (const selector of modalSelectors) {
    const modal = await page.$(selector);
    if (modal) {
      // Look for "OK", "Accept", "Confirm" buttons
      const confirmButton = await modal.$('button:has-text("OK"), button:has-text("Accept"), button:has-text("Confirm"), button:has-text("Yes")');
      if (confirmButton) {
        await confirmButton.click();
        await page.waitForTimeout(200);
      }
    }
  }
}

/**
 * Batch paste multiple sections with verification
 */
export async function batchPaste(page, pasteJobs) {
  const results = [];

  for (const job of pasteJobs) {
    try {
      // Find field
      const { findField } = await import('./fieldLocator.js');
      const { element, confidence, strategy } = await findField(page, job.section);

      // Handle any popups before pasting
      await handlePastePopups(page);

      // Paste with verification
      const result = await pasteWithVerification(page, element, job.text, {
        mode: job.mode || 'replace',
        verify: true
      });

      results.push({
        section: job.section,
        success: result.success,
        confidence,
        strategy,
        verification: result.verification
      });

    } catch (err) {
      results.push({
        section: job.section,
        success: false,
        error: err.message
      });
    }
  }

  return results;
}
