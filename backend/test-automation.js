/**
 * Test Playwright Worker on Mock EHR Page
 * Run with: node backend/test-automation.js
 */

import { worker } from './automation/worker.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testPlaywrightWorker() {
  console.log('🧪 Testing Playwright Worker on Mock EHR\n');

  try {
    // 1. Initialize worker (headless=false to see it in action)
    console.log('1️⃣ Initializing worker...');
    const sessionId = await worker.init({ headless: false });
    console.log(`✅ Worker initialized - Session: ${sessionId}\n`);

    // 2. Navigate to mock EHR page
    console.log('2️⃣ Navigating to mock EHR...');
    const mockEhrPath = path.join(__dirname, '../dist/mock-ehr.html');
    const mockEhrUrl = `file://${mockEhrPath}`;
    await worker.navigate(mockEhrUrl);
    console.log(`✅ Navigated to: ${mockEhrUrl}\n`);

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Discover fields
    console.log('3️⃣ Discovering fields on page...');
    const fieldsData = await worker.discoverFields();
    console.log(`✅ Found fields:\n`);

    // Handle new structure: array of {frameUrl, fields:[]}
    if (Array.isArray(fieldsData) && fieldsData[0]?.fields) {
      fieldsData.forEach((frameData, frameIndex) => {
        console.log(`   Frame ${frameIndex + 1}: ${frameData.frameUrl}`);
        frameData.fields.forEach((field, i) => {
          console.log(`     ${i + 1}. ${field.tagName} (${field.type}) - ${field.ariaLabel || field.placeholder || field.id || 'no label'}`);
        });
      });
    } else {
      // Old structure fallback
      fieldsData.forEach((field, i) => {
        console.log(`   ${i + 1}. ${field.tagName} (${field.type}) - ${field.ariaLabel || field.placeholder || field.id || 'no label'}`);
      });
    }
    console.log('');

    // 4. Test paste operations
    console.log('4️⃣ Testing paste operations...\n');

    const testSections = [
      {
        section: 'chief_complaint',
        text: '68-year-old male presenting with chest pain radiating to left arm, onset 2 hours ago.'
      },
      {
        section: 'hpi',
        text: 'Patient reports sudden onset substernal chest pressure while climbing stairs. Pain rated 7/10, accompanied by shortness of breath and diaphoresis. No previous cardiac history. Took aspirin 325mg at home with minimal relief.'
      },
      {
        section: 'assessment',
        text: '1. Acute coronary syndrome - STEMI suspected\n2. Hypertension - uncontrolled\n3. Hyperlipidemia'
      },
      {
        section: 'plan',
        text: '1. Cardiology consult STAT\n2. Cardiac catheterization lab activation\n3. ASA 325mg, Plavix 600mg load\n4. Heparin drip per protocol\n5. Serial troponins q3h x3\n6. Continuous telemetry monitoring'
      }
    ];

    for (const test of testSections) {
      console.log(`   Testing: ${test.section}`);
      const result = await worker.pasteSingleSection(test.section, test.text, 'replace');

      if (result.success) {
        console.log(`   ✅ ${test.section}: SUCCESS (confidence: ${result.confidence}, strategy: ${result.strategy})`);
      } else {
        console.log(`   ❌ ${test.section}: FAILED - ${result.error}`);
      }
    }

    console.log('');

    // 5. Take screenshot
    console.log('5️⃣ Taking screenshot...');
    const screenshotPath = path.join(__dirname, '../dist/test-result-screenshot.png');
    await worker.screenshot({ fullPage: true, path: screenshotPath });
    console.log(`✅ Screenshot saved: ${screenshotPath}\n`);

    // 6. Health check
    console.log('6️⃣ Worker health check...');
    const health = await worker.healthCheck();
    console.log(`✅ Health: ${JSON.stringify(health, null, 2)}\n`);

    // 7. Keep browser open for inspection
    console.log('🔍 Browser will remain open for 30 seconds for inspection...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 8. Cleanup
    console.log('\n7️⃣ Closing worker...');
    await worker.close();
    console.log('✅ Worker closed\n');

    console.log('✨ All tests completed successfully!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    await worker.close();
    process.exit(1);
  }
}

// Run tests
testPlaywrightWorker();
