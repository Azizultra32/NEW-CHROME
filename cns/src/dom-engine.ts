import { DomMapRequest, DomMapResult, FillActionRequest, FillActionResult, UndoActionRequest, UndoActionResult } from './types.js';

export class DomAutomationEngine {
  mapDocument(request: DomMapRequest): DomMapResult {
    const mappedEntries = request.fields.reduce<Record<string, string>>((acc, field, index) => {
      acc[field] = `#auto-field-${index}`;
      return acc;
    }, {});

    return {
      mapped: mappedEntries,
      confidence: Math.min(1, request.fields.length ? 0.8 + request.fields.length * 0.01 : 0.8),
      snapshotId: request.snapshotId
    };
  }

  performFill(request: FillActionRequest): FillActionResult {
    const applied: string[] = [];
    const failed: string[] = [];
    Object.entries(request.values).forEach(([field, value]) => {
      if (value?.length) {
        applied.push(field);
      } else {
        failed.push(field);
      }
    });
    return { applied, failed };
  }

  undoLast(request: UndoActionRequest): UndoActionResult {
    return { undone: request.lastApplied };
  }
}
