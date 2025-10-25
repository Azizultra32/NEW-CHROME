/**
 * Note Composer
 *
 * Converts medical transcripts into structured clinical notes (SOAP/APSO)
 * using GPT-4o with provenance tracking and safety checks.
 */

import { OpenAI } from 'openai';
import { rehydrate } from './phi-redactor.js';
import { runSafetyRails } from './safety-rails.js';
import { logNoteComposition, logAPIFailure } from './audit-logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Note format templates
 */
const NOTE_TEMPLATES = {
  SOAP: {
    sections: ['Subjective', 'Objective', 'Assessment', 'Plan'],
    description: 'SOAP (Subjective, Objective, Assessment, Plan)'
  },
  APSO: {
    sections: ['Assessment', 'Plan', 'Subjective', 'Objective'],
    description: 'APSO (Assessment first, then Plan)'
  },
  HPO: {
    sections: ['History', 'Physical', 'Orders'],
    description: 'H&P with Orders'
  }
};

/**
 * Specialty-specific guidelines
 */
const SPECIALTY_GUIDELINES = {
  family_medicine: 'Focus on comprehensive care, preventive health, and chronic disease management.',
  pediatrics: 'Include growth/development milestones, immunization status, and family history.',
  internal_medicine: 'Emphasize diagnostic reasoning, differential diagnosis, and evidence-based management.',
  emergency: 'Prioritize immediate interventions, disposition planning, and red flag symptoms.',
  psychiatry: 'Detail mental status exam, risk assessment (SI/HI), and psychiatric review of systems.'
};

/**
 * Compose clinical note from transcript
 *
 * @param {Object} params
 * @param {string} params.transcript - Tokenized transcript
 * @param {Object} params.phiMap - PHI token mapping (for re-hydration)
 * @param {string} params.noteFormat - 'SOAP', 'APSO', or 'HPO'
 * @param {string} params.specialty - Medical specialty
 * @param {string} params.encounterId - Encounter ID for audit logging
 * @returns {Promise<Object>} Composed note with provenance
 */
export async function composeNote({
  transcript,
  phiMap = {},
  noteFormat = 'SOAP',
  specialty = 'family_medicine',
  encounterId = null
}) {
  try {
    // Re-hydrate transcript for composition (with real PHI)
    const rehydratedTranscript = rehydrate(transcript, phiMap);

    // Get template and guidelines
    const template = NOTE_TEMPLATES[noteFormat] || NOTE_TEMPLATES.SOAP;
    const guidelines = SPECIALTY_GUIDELINES[specialty] || SPECIALTY_GUIDELINES.family_medicine;

    // Build prompt
    const systemPrompt = `You are an expert medical documentation assistant specializing in ${specialty}.

Your task is to convert a medical transcript into a structured ${template.description} note.

REQUIREMENTS:
1. Extract information into sections: ${template.sections.join(', ')}
2. Maintain medical terminology accuracy
3. Include timestamp citations for each statement: [MM:SS]
4. Flag uncertain statements with ⚠️ (e.g., "possibly", "may be", "unclear")
5. Highlight contradictions between subjective and objective findings
6. Suggest ICD-10 diagnosis codes and CPT procedure codes based on encounter
7. ${guidelines}

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "sections": {
    "${template.sections[0]}": "content with [timestamp] citations...",
    "${template.sections[1]}": "...",
    ...
  },
  "provenance": [
    {
      "sentence": "Patient reports chest pain",
      "timestamp": "00:01:23",
      "speaker": "patient",
      "section": "${template.sections[0]}"
    }
  ],
  "flags": [
    {
      "type": "uncertainty" | "contradiction" | "missing_info",
      "text": "description",
      "section": "section_name",
      "severity": "low" | "medium" | "high"
    }
  ],
  "billing": {
    "icd10": [
      {"code": "A00.0", "description": "Brief description", "confidence": "high|medium|low"}
    ],
    "cpt": [
      {"code": "99213", "description": "Brief description", "confidence": "high|medium|low"}
    ]
  }
}

IMPORTANT:
- Be concise but complete
- Use standard medical abbreviations appropriately
- Maintain patient voice in subjective section
- Separate observed findings from reported symptoms
- Include relevant negative findings`;

    const userPrompt = `Convert this medical transcript into a ${noteFormat} note:

TRANSCRIPT:
${rehydratedTranscript}

Generate the structured clinical note now.`;

    // Call GPT-4o
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // Low temperature for consistency
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content received from OpenAI');
    }

    const composedNote = JSON.parse(content);

    // Run safety rails on composed note
    const safetyChecks = await runSafetyRails(composedNote, rehydratedTranscript);

    // Merge safety flags
    if (safetyChecks.warnings.length > 0) {
      composedNote.flags = [
        ...(composedNote.flags || []),
        ...safetyChecks.warnings.map(w => ({
          type: w.type,
          text: w.message,
          section: w.section || 'general',
          severity: w.severity || 'medium'
        }))
      ];
    }

    // Add metadata
    const result = {
      ...composedNote,
      metadata: {
        model: 'gpt-4o',
        noteFormat,
        specialty,
        generatedAt: new Date().toISOString(),
        encounterId,
        tokenUsage: response.usage
      }
    };

    // Audit log
    if (encounterId) {
      await logNoteComposition(encounterId, noteFormat, 'gpt-4o');
    }

    return result;

  } catch (error) {
    console.error('[NoteComposer] Failed to compose note:', error);

    if (encounterId) {
      await logAPIFailure('note_composer', error.message, encounterId);
    }

    throw error;
  }
}

/**
 * Generate specialty-specific template
 *
 * @param {string} section - Section name (PLAN, HPI, etc.)
 * @param {string} specialty - Medical specialty
 * @returns {string} Template text
 */
export function getTemplate(section, specialty = 'family_medicine') {
  const templates = {
    PLAN: {
      family_medicine: `Plan:
1. Diagnostics:
   -

2. Medications:
   -

3. Follow-up:
   -

4. Patient education:
   -`,

      emergency: `Disposition & Plan:
1. Immediate interventions:
   -

2. Diagnostics ordered:
   -

3. Disposition: [Admit / Discharge / Transfer]

4. Discharge instructions / Follow-up:
   -`
    },

    HPI: {
      family_medicine: `Chief Complaint:

History of Present Illness:
- Onset:
- Duration:
- Character:
- Associated symptoms:
- Aggravating/Alleviating factors:
- Previous episodes:
- Current management:`,

      pediatrics: `Chief Complaint:

HPI:
- Onset and duration:
- Associated symptoms:
- Fever curve:
- Activity level:
- Oral intake:
- Urine output:
- Previous similar illnesses:`
    },

    ROS: {
      family_medicine: `Review of Systems:
Constitutional: No fever, chills, or night sweats
HEENT: No vision changes, hearing loss, or sore throat
Respiratory: No cough, shortness of breath, or wheezing
Cardiovascular: No chest pain or palpitations
Gastrointestinal: No nausea, vomiting, or diarrhea
Genitourinary: No dysuria or hematuria
Musculoskeletal: No joint pain or swelling
Neurological: No headaches, dizziness, or weakness
Psychiatric: No depression or anxiety
Skin: No rashes or lesions

All other systems reviewed and negative except as noted in HPI.`
    },

    EXAM: {
      family_medicine: `Physical Examination:
Vitals: BP ___ / ___, HR ___, RR ___, Temp ___, O2 Sat ___%, Weight ___

General: Alert, oriented, no acute distress
HEENT: Normocephalic, atraumatic, PERRLA, EOMI, TMs clear
Neck: Supple, no JVD, no lymphadenopathy
Cardiovascular: Regular rate and rhythm, no murmurs
Respiratory: Clear to auscultation bilaterally, no wheezes/rales
Abdomen: Soft, non-tender, non-distended, normal bowel sounds
Extremities: No edema, pulses intact
Neurological: Cranial nerves II-XII intact, normal strength and sensation
Skin: No rashes or lesions`
    }
  };

  return templates[section]?.[specialty] || templates[section]?.family_medicine || '';
}

/**
 * Extract structured data from transcript (for EHR fields)
 *
 * @param {string} transcript
 * @returns {Promise<Object>} Structured data (vitals, medications, etc.)
 */
export async function extractStructuredData(transcript) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Extract structured clinical data from the transcript.
Return JSON with: vitals, medications, allergies, problems, procedures.
Use null if information is not mentioned.`
        },
        {
          role: 'user',
          content: transcript
        }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0]?.message?.content || '{}');

  } catch (error) {
    console.error('[NoteComposer] Failed to extract structured data:', error);
    return {};
  }
}

// Export helper functions
export { NOTE_TEMPLATES, SPECIALTY_GUIDELINES };