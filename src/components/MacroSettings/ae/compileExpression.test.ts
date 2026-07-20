import { describe, it, expect } from 'vitest';
import { compileExpression } from './compileExpression';

describe('compileExpression — Transform targets', () => {
  it('position: assigns to transform.position.expression', () => {
    const jsx = compileExpression('wiggle(3, 20)', 'position');
    expect(jsx).toContain('sel[i].transform.position.expression =');
    expect(jsx).toContain('"wiggle(3, 20)"'); // embedded via JSON.stringify
  });

  it('includes both layer guards', () => {
    const jsx = compileExpression('wiggle(3, 20)', 'position');
    expect(jsx).toContain('Open a composition first.');
    expect(jsx).toContain('Select one or more layers first.');
  });

  it('wraps an undo group', () => {
    const jsx = compileExpression('wiggle(3, 20)', 'position');
    expect(jsx).toContain('app.beginUndoGroup(');
    expect(jsx).toContain('app.endUndoGroup()');
  });

  it('maps each Transform target to the correct property path', () => {
    expect(compileExpression('x', 'scale')).toContain('transform.scale.expression');
    expect(compileExpression('x', 'rotation')).toContain('transform.rotation.expression');
    expect(compileExpression('x', 'opacity')).toContain('transform.opacity.expression');
    expect(compileExpression('x', 'anchorPoint')).toContain('transform.anchorPoint.expression');
  });
});

describe('compileExpression — selected property target', () => {
  it('assigns to comp.selectedProperties[0]', () => {
    const jsx = compileExpression('loopOut("cycle")', 'selected');
    expect(jsx).toContain('comp.selectedProperties');
    expect(jsx).toContain('.expression =');
    expect(jsx).toContain('Select a property in the timeline first.');
  });
});

describe('compileExpression — safe embedding', () => {
  it('embeds a multi-line expression with quotes without breaking the JSX', () => {
    const expr = 'var s = "a\\nb";\nvalue + s';
    const jsx = compileExpression(expr, 'opacity');
    // The whole expression must appear as one JSON string literal.
    expect(jsx).toContain(JSON.stringify(expr));
  });
});
