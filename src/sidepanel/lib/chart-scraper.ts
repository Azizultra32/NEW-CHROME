/**
 * Chart Scraper - Extract patient data from EHR DOM
 * Used for knowledge query commands ("assist vitals?", "assist current meds?")
 */

export interface VitalsData {
  bp?: string;
  pulse?: string;
  spo2?: string;
  temp?: string;
  resp?: string;
  height?: string;
  weight?: string;
}

export interface MedicationData {
  name: string;
  dose?: string;
  frequency?: string;
}

/**
 * Scrape vitals from common EHR patterns
 */
export async function scrapeVitals(): Promise<VitalsData> {
  const vitals: VitalsData = {};

  try {
    // Common selectors for vitals across different EHRs
    const selectors = [
      // Epic
      '[data-testid*="vital"]',
      '[aria-label*="blood pressure"]',
      '[aria-label*="pulse"]',
      '[aria-label*="oxygen"]',
      '[aria-label*="temperature"]',
      // Cerner
      '.vitals-section',
      '.vital-signs',
      // Generic
      '[id*="vital"]',
      '[class*="vital"]',
    ];

    // Try to find vitals section
    let vitalsContainer: Element | null = null;
    for (const selector of selectors) {
      vitalsContainer = document.querySelector(selector);
      if (vitalsContainer) break;
    }

    if (!vitalsContainer) {
      // Fallback: Search all text content
      const bodyText = document.body.innerText;

      // BP pattern: 120/80, 110/70, etc.
      const bpMatch = bodyText.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
      if (bpMatch) vitals.bp = bpMatch[0];

      // Pulse pattern: HR 72, Pulse 80, etc.
      const pulseMatch = bodyText.match(/(?:HR|Pulse|Heart Rate)[:\s]*(\d{2,3})/i);
      if (pulseMatch) vitals.pulse = pulseMatch[1];

      // SpO2 pattern: SpO2 98%, O2 Sat 97%, etc.
      const spo2Match = bodyText.match(/(?:SpO2|O2 Sat|Oxygen)[:\s]*(\d{2,3})%?/i);
      if (spo2Match) vitals.spo2 = spo2Match[1] + '%';

      // Temp pattern: 98.6°F, 37.0°C, Temp 98.6, etc.
      const tempMatch = bodyText.match(/(?:Temp|Temperature)[:\s]*(\d{2,3}\.?\d?)[\s°]*([FC])?/i);
      if (tempMatch) vitals.temp = tempMatch[1] + (tempMatch[2] || '°F');

      // Resp pattern: RR 16, Resp 18, etc.
      const respMatch = bodyText.match(/(?:RR|Resp|Respiratory Rate)[:\s]*(\d{1,2})/i);
      if (respMatch) vitals.resp = respMatch[1];
    } else {
      // Parse structured vitals container
      const text = vitalsContainer.textContent || '';

      const bpMatch = text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
      if (bpMatch) vitals.bp = bpMatch[0];

      const pulseMatch = text.match(/\d{2,3}(?=\s*(?:bpm|\/min|pulse))/i);
      if (pulseMatch) vitals.pulse = pulseMatch[0];

      const spo2Match = text.match(/\d{2,3}(?=%)/);
      if (spo2Match) vitals.spo2 = spo2Match[0] + '%';

      const tempMatch = text.match(/\d{2,3}\.?\d?[\s°]*[FC]/i);
      if (tempMatch) vitals.temp = tempMatch[0];
    }
  } catch (error) {
    console.error('[ChartScraper] Error scraping vitals:', error);
  }

  return vitals;
}

/**
 * Format vitals for speech output
 */
export function formatVitals(vitals: VitalsData): string {
  const parts: string[] = [];

  if (vitals.bp) parts.push(`Blood pressure ${vitals.bp}`);
  if (vitals.pulse) parts.push(`pulse ${vitals.pulse}`);
  if (vitals.spo2) parts.push(`oxygen ${vitals.spo2}`);
  if (vitals.temp) parts.push(`temperature ${vitals.temp}`);
  if (vitals.resp) parts.push(`respiratory rate ${vitals.resp}`);

  if (parts.length === 0) {
    return 'Unable to locate vitals in the chart';
  }

  return parts.join(', ');
}

/**
 * Scrape current medications from EHR
 */
export async function scrapeMedications(): Promise<MedicationData[]> {
  const medications: MedicationData[] = [];

  try {
    // Common selectors for medication lists
    const selectors = [
      '[data-testid*="medication"]',
      '[aria-label*="medication"]',
      '.medication-list',
      '.medications',
      '[id*="medication"]',
      '[class*="medication"]',
    ];

    let medsContainer: Element | null = null;
    for (const selector of selectors) {
      medsContainer = document.querySelector(selector);
      if (medsContainer) break;
    }

    if (!medsContainer) {
      // Fallback: Search for common medication patterns
      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n');

      for (const line of lines) {
        // Pattern: Medication name + dose (e.g., "Lisinopril 10mg", "Metformin 500 mg")
        const medMatch = line.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(\d+\s*mg|mg)/i);
        if (medMatch) {
          medications.push({
            name: medMatch[1],
            dose: medMatch[2],
          });
        }
      }
    } else {
      // Parse structured medication list
      const rows = medsContainer.querySelectorAll('tr, li, .medication-item');

      for (const row of Array.from(rows)) {
        const text = row.textContent || '';
        const medMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(\d+\s*mg)/i);

        if (medMatch) {
          medications.push({
            name: medMatch[1],
            dose: medMatch[2],
          });
        }
      }
    }
  } catch (error) {
    console.error('[ChartScraper] Error scraping medications:', error);
  }

  return medications.slice(0, 10); // Limit to 10 meds
}

/**
 * Format medications for speech output
 */
export function formatMedications(meds: MedicationData[]): string {
  if (meds.length === 0) {
    return 'Unable to locate medications in the chart';
  }

  if (meds.length === 1) {
    return `Current medication: ${meds[0].name} ${meds[0].dose || ''}`;
  }

  const medList = meds.map(m => `${m.name} ${m.dose || ''}`).join(', ');
  return `Current medications: ${medList}`;
}

/**
 * Scrape allergies from EHR
 */
export async function scrapeAllergies(): Promise<string[]> {
  const allergies: string[] = [];

  try {
    const selectors = [
      '[data-testid*="allerg"]',
      '[aria-label*="allerg"]',
      '.allergies',
      '[id*="allerg"]',
    ];

    let allergyContainer: Element | null = null;
    for (const selector of selectors) {
      allergyContainer = document.querySelector(selector);
      if (allergyContainer) break;
    }

    if (!allergyContainer) {
      // Fallback: Look for "Allergies:" heading
      const bodyText = document.body.innerText;
      const allergyMatch = bodyText.match(/Allergies?:\s*([^\n]+)/i);
      if (allergyMatch) {
        const allergyText = allergyMatch[1].trim();
        if (allergyText.toLowerCase() !== 'none' && allergyText.toLowerCase() !== 'nkda') {
          allergies.push(allergyText);
        }
      }
    } else {
      const text = allergyContainer.textContent || '';
      if (text.toLowerCase() !== 'none' && text.toLowerCase() !== 'nkda') {
        allergies.push(text.trim());
      }
    }
  } catch (error) {
    console.error('[ChartScraper] Error scraping allergies:', error);
  }

  return allergies;
}

/**
 * Format allergies for speech output
 */
export function formatAllergies(allergies: string[]): string {
  if (allergies.length === 0) {
    return 'No known drug allergies';
  }

  return `Allergies: ${allergies.join(', ')}`;
}
