/**
 * Clinical Safety Rails
 *
 * Detects potential issues in clinical notes:
 * - Contradictions between subjective and objective findings
 * - Uncertainty phrases that need clarification
 * - Upcoding risks
 * - Missing critical information
 */

/**
 * Uncertainty phrases to flag
 */
const UNCERTAINTY_PATTERNS = [
  /\b(appears?|possibly|likely|probably|may be|might be|seems?|suspect)\b/gi,
  /\b(not sure|unclear|uncertain|questionable|indeterminate)\b/gi,
  /\b(could be|would suggest|consistent with)\b/gi
];

/**
 * Contradiction patterns
 */
const CONTRADICTION_CHECKS = [
  {
    name: 'normal_exam_abnormal_vitals',
    check: (note) => {
      const exam = note.sections?.Objective || note.sections?.Physical || '';
      const hasNormalExam = /\b(normal|wnl|within normal limits)\b/i.test(exam);

      // Extract vitals if mentioned
      const vitalsMatch = exam.match(/(?:HR|heart rate)[:\s]+(\d+)/i);
      const hr = vitalsMatch ? parseInt(vitalsMatch[1]) : null;

      if (hasNormalExam && hr && (hr < 50 || hr > 100)) {
        return {
          found: true,
          message: `Physical exam documented as "normal" but heart rate ${hr} is outside normal range`
        };
      }

      // Check BP
      const bpMatch = exam.match(/(?:BP|blood pressure)[:\s]+(\d+)\/(\d+)/i);
      if (hasNormalExam && bpMatch) {
        const systolic = parseInt(bpMatch[1]);
        const diastolic = parseInt(bpMatch[2]);
        if (systolic > 140 || diastolic > 90 || systolic < 90) {
          return {
            found: true,
            message: `Physical exam documented as "normal" but BP ${systolic}/${diastolic} is abnormal`
          };
        }
      }

      return { found: false };
    }
  },

  {
    name: 'pain_reported_exam_painless',
    check: (note) => {
      const subjective = note.sections?.Subjective || note.sections?.HPI || '';
      const objective = note.sections?.Objective || note.sections?.Physical || '';

      const hasPainReport = /\b(pain|painful|hurts|tender|discomfort)\b/i.test(subjective);
      const hasNonTenderExam = /\b(non-tender|nontender|no tenderness)\b/i.test(objective);

      if (hasPainReport && hasNonTenderExam) {
        return {
          found: true,
          message: 'Patient reports pain but physical exam documents no tenderness'
        };
      }

      return { found: false };
    }
  },

  {
    name: 'fever_reported_temp_normal',
    check: (note) => {
      const subjective = note.sections?.Subjective || note.sections?.HPI || '';
      const objective = note.sections?.Objective || note.sections?.Physical || '';

      const feverReported = /\b(fever|febrile|feeling hot)\b/i.test(subjective);
      const tempMatch = objective.match(/(?:temp|temperature)[:\s]+(\d+\.?\d*)/i);

      if (feverReported && tempMatch) {
        const temp = parseFloat(tempMatch[1]);
        // Normal range: 36.5-37.5°C or 97.7-99.5°F
        const isCelsius = temp < 50;
        const isNormal = isCelsius ? (temp >= 36.5 && temp <= 37.5) : (temp >= 97.7 && temp <= 99.5);

        if (isNormal) {
          return {
            found: true,
            message: `Patient reports fever but recorded temperature ${temp}${isCelsius ? '°C' : '°F'} is normal`
          };
        }
      }

      return { found: false };
    }
  }
];

/**
 * Upcoding risk patterns
 */
const UPCODING_CHECKS = [
  {
    name: 'comprehensive_exam_limited_findings',
    check: (note) => {
      const exam = note.sections?.Objective || note.sections?.Physical || '';

      const claimsComprehensive = /\b(comprehensive|complete|full|detailed)\s+exam/i.test(exam);

      if (claimsComprehensive) {
        // Count actual organ system examinations
        const systems = [
          /HEENT|head.*eyes.*ears/i,
          /cardiovascular|heart/i,
          /respiratory|lungs/i,
          /abdomen|gastrointestinal/i,
          /neurological|neuro/i,
          /musculoskeletal|extremities/i,
          /skin|dermatological/i,
          /psychiatric|mental status/i
        ];

        const systemsExamined = systems.filter(regex => regex.test(exam)).length;

        if (systemsExamined < 5) {
          return {
            found: true,
            message: `Comprehensive exam claimed but only ${systemsExamined} organ systems documented`
          };
        }
      }

      return { found: false };
    }
  },

  {
    name: 'cloned_text_detected',
    check: (note) => {
      // Check for repeated boilerplate phrases
      const allText = Object.values(note.sections || {}).join(' ');

      const boilerplate = [
        'reviewed and negative except as noted',
        'discussed risks and benefits',
        'patient agrees with plan',
        'will follow up as needed',
        'understands discharge instructions'
      ];

      const boilerplateCount = boilerplate.filter(phrase =>
        new RegExp(phrase, 'i').test(allText)
      ).length;

      if (boilerplateCount >= 3) {
        return {
          found: true,
          message: 'Multiple boilerplate phrases detected - ensure documentation reflects actual encounter'
        };
      }

      return { found: false };
    }
  },

  {
    name: 'time_based_coding_no_time',
    check: (note) => {
      const plan = note.sections?.Plan || note.sections?.Assessment || '';

      const claimsTimeBased = /\b(counseling|coordination|more than \d+ (?:minutes|mins))\b/i.test(plan);
      const hasTimeDocumented = /\b\d+\s*(?:minutes|mins)\b/i.test(plan);

      if (claimsTimeBased && !hasTimeDocumented) {
        return {
          found: true,
          message: 'Time-based coding suggested but duration not documented'
        };
      }

      return { found: false };
    }
  }
];

/**
 * Critical missing information checks
 */
const MISSING_INFO_CHECKS = [
  {
    name: 'medication_no_allergies',
    check: (note) => {
      const plan = note.sections?.Plan || '';
      const hasMedication = /\b(prescribe|medication|rx|drug)\b/i.test(plan);

      const allergiesDocumented = /\b(allergies|nkda|no known drug allergies)\b/i.test(
        Object.values(note.sections || {}).join(' ')
      );

      if (hasMedication && !allergiesDocumented) {
        return {
          found: true,
          message: 'Medications prescribed but allergy status not documented'
        };
      }

      return { found: false };
    }
  },

  {
    name: 'chest_pain_no_cardiac_exam',
    check: (note) => {
      const subjective = note.sections?.Subjective || note.sections?.HPI || '';
      const objective = note.sections?.Objective || note.sections?.Physical || '';

      const hasChestPain = /\b(chest pain|angina|cardiac|heart pain)\b/i.test(subjective);
      const hasCardiacExam = /\b(heart|cardiovascular|cardiac|s1|s2|murmur)\b/i.test(objective);

      if (hasChestPain && !hasCardiacExam) {
        return {
          found: true,
          message: 'Chief complaint of chest pain but cardiac exam not documented'
        };
      }

      return { found: false };
    }
  }
];

/**
 * Run all safety rail checks on a note
 *
 * @param {Object} note - Composed clinical note
 * @param {string} transcript - Original transcript (optional, for context)
 * @returns {Promise<Object>} Safety check results
 */
export async function runSafetyRails(note, transcript = '') {
  const warnings = [];

  // 1. Check for uncertainty phrases
  const allText = Object.values(note.sections || {}).join(' ');
  for (const pattern of UNCERTAINTY_PATTERNS) {
    const matches = allText.match(pattern);
    if (matches) {
      const uniqueMatches = [...new Set(matches.map(m => m.toLowerCase()))];
      warnings.push({
        type: 'uncertainty',
        severity: 'low',
        message: `Uncertainty phrases detected: ${uniqueMatches.join(', ')}`,
        suggestions: 'Consider clarifying or obtaining additional information'
      });
      break; // Only warn once for uncertainties
    }
  }

  // 2. Check for contradictions
  for (const check of CONTRADICTION_CHECKS) {
    const result = check.check(note);
    if (result.found) {
      warnings.push({
        type: 'contradiction',
        severity: 'high',
        message: result.message,
        checkName: check.name
      });
    }
  }

  // 3. Check for upcoding risks
  for (const check of UPCODING_CHECKS) {
    const result = check.check(note);
    if (result.found) {
      warnings.push({
        type: 'upcoding_risk',
        severity: 'medium',
        message: result.message,
        checkName: check.name
      });
    }
  }

  // 4. Check for missing critical information
  for (const check of MISSING_INFO_CHECKS) {
    const result = check.check(note);
    if (result.found) {
      warnings.push({
        type: 'missing_info',
        severity: 'medium',
        message: result.message,
        checkName: check.name
      });
    }
  }

  return {
    passed: warnings.filter(w => w.severity === 'high').length === 0,
    warnings,
    summary: {
      total: warnings.length,
      bySeverity: {
        low: warnings.filter(w => w.severity === 'low').length,
        medium: warnings.filter(w => w.severity === 'medium').length,
        high: warnings.filter(w => w.severity === 'high').length
      }
    }
  };
}

/**
 * Validate note completeness
 *
 * @param {Object} note
 * @param {string} noteFormat - 'SOAP', 'APSO', etc.
 * @returns {Object} Validation result
 */
export function validateNoteCompleteness(note, noteFormat = 'SOAP') {
  const requiredSections = {
    SOAP: ['Subjective', 'Objective', 'Assessment', 'Plan'],
    APSO: ['Assessment', 'Plan', 'Subjective', 'Objective'],
    HPO: ['History', 'Physical', 'Orders']
  };

  const required = requiredSections[noteFormat] || requiredSections.SOAP;
  const missingSections = [];

  for (const section of required) {
    if (!note.sections?.[section] || note.sections[section].trim().length < 10) {
      missingSections.push(section);
    }
  }

  return {
    complete: missingSections.length === 0,
    missingSections,
    message: missingSections.length > 0
      ? `Incomplete note: missing or insufficient content in ${missingSections.join(', ')}`
      : 'Note is complete'
  };
}

// Test mode
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Safety Rails - Test Mode\n');

  (async () => {
    const testNote = {
      sections: {
        Subjective: 'Patient reports chest pain for 2 days, possibly related to stress. Also complains of fever.',
        Objective: 'Vitals: BP 160/95, HR 110, Temp 98.2°F. Physical exam: Normal cardiovascular exam, heart sounds regular, no murmurs. Non-tender chest wall.',
        Assessment: 'Chest pain, likely musculoskeletal. Hypertension noted.',
        Plan: 'Comprehensive exam performed. Patient counseling provided. Follow up as needed. Prescribe ibuprofen 400mg.'
      }
    };

    console.log('Test Note:');
    console.log(JSON.stringify(testNote, null, 2));
    console.log('\n' + '='.repeat(60) + '\n');

    const results = await runSafetyRails(testNote);

    console.log('Safety Rails Results:');
    console.log(`Total Warnings: ${results.summary.total}`);
    console.log(`  Low Severity: ${results.summary.bySeverity.low}`);
    console.log(`  Medium Severity: ${results.summary.bySeverity.medium}`);
    console.log(`  High Severity: ${results.summary.bySeverity.high}`);
    console.log(`\nPassed: ${results.passed ? '✅' : '❌'}\n`);

    console.log('Warnings:');
    results.warnings.forEach((w, idx) => {
      console.log(`\n  ${idx + 1}. [${w.severity.toUpperCase()}] ${w.type}`);
      console.log(`     ${w.message}`);
      if (w.suggestions) {
        console.log(`     💡 ${w.suggestions}`);
      }
    });

    console.log('\n' + '='.repeat(60) + '\n');

    const completeness = validateNoteCompleteness(testNote, 'SOAP');
    console.log('Completeness Check:');
    console.log(`  Complete: ${completeness.complete ? '✅' : '❌'}`);
    console.log(`  Message: ${completeness.message}`);

    console.log('\n✅ Safety rails tests complete');
  })().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}