import { describe, it, expect } from 'vitest';
import { parseIntent } from '../../src/sidepanel/intent';

describe('parseIntent', () => {
  it('parses map commands', () => {
    expect(parseIntent('assist map plan')).toEqual({ name: 'map', section: 'plan' });
    expect(parseIntent('assist remap ros')).toEqual({ name: 'map', section: 'ros' });
  });

  it('parses template edit commands', () => {
    expect(parseIntent('assist edit template hpi')).toEqual({ name: 'template_edit', section: 'hpi' });
    expect(parseIntent('assist template edit exam')).toEqual({ name: 'template_edit', section: 'exam' });
  });

  it('still parses existing templates', () => {
    expect(parseIntent('assist template plan')).toEqual({ name: 'template', section: 'plan' });
  });
});
