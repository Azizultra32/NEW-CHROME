import { DomMapRequest, DomMapResult, FillActionRequest, FillActionResult, UndoActionRequest, UndoActionResult } from './types.js';

interface AutomationCounters {
  mapped: number;
  filled: number;
  undone: number;
  failed: number;
}

export class DomAutomationEngine {
  private appliedHistory = new Map<string, string[]>();
  private metrics: AutomationCounters = { mapped: 0, filled: 0, undone: 0, failed: 0 };

  mapDocument(request: DomMapRequest): DomMapResult {
    if (!request.fields.length) {
      this.metrics.failed += 1;
      throw new Error('no_fields_requested');
    }
    const mappedEntries = request.fields.reduce<Record<string, string>>((acc, field, index) => {
      acc[field] = request.snapshotId ? `#snap-${request.snapshotId}-${index}` : `#auto-field-${index}`;
      return acc;
    }, {});

    this.metrics.mapped += 1;
    return {
      mapped: mappedEntries,
      confidence: Math.min(1, 0.75 + request.fields.length * 0.05),
      snapshotId: request.snapshotId
    };
  }

  performFill(request: FillActionRequest): FillActionResult {
    if (!Object.keys(request.map.mapped || {}).length) {
      this.metrics.failed += 1;
      throw new Error('missing_dom_map');
    }
    const applied: string[] = [];
    const failed: string[] = [];
    Object.entries(request.values).forEach(([field, value]) => {
      const selector = request.map.mapped[field];
      if (selector && value?.length) {
        applied.push(field);
      } else {
        failed.push(field);
      }
    });

    if (!applied.length) {
      this.metrics.failed += 1;
      throw new Error('no_fields_filled');
    }

    this.metrics.filled += applied.length;
    this.appliedHistory.set(request.visitId, applied);
    return { applied, failed };
  }

  undoLast(request: UndoActionRequest): UndoActionResult {
    const history = request.lastApplied.length ? request.lastApplied : this.appliedHistory.get(request.visitId) || [];
    if (!history.length) {
      this.metrics.failed += 1;
      throw new Error('nothing_to_undo');
    }
    this.metrics.undone += history.length;
    this.appliedHistory.set(request.visitId, []);
    return { undone: history };
  }

  getMetrics(): AutomationCounters {
    return { ...this.metrics };
  }
}
