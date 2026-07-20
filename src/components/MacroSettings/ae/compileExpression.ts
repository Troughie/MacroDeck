export type AeExprTarget =
  | 'selected'
  | 'position'
  | 'scale'
  | 'rotation'
  | 'opacity'
  | 'anchorPoint';

// Maps a Transform target to its ExtendScript property path under a layer.
const TRANSFORM_PATH: Record<Exclude<AeExprTarget, 'selected'>, string> = {
  position: 'transform.position',
  scale: 'transform.scale',
  rotation: 'transform.rotation',
  opacity: 'transform.opacity',
  anchorPoint: 'transform.anchorPoint',
};

// Turns a raw AE expression into JSX that applies it, shaped like the existing
// presets (aePresets.ts). The expression is embedded via JSON.stringify so
// newlines/quotes in the user's text can never break the generated script.
export function compileExpression(expression: string, target: AeExprTarget): string {
  const expr = JSON.stringify(expression);
  const undoName = JSON.stringify('Apply Expression');

  if (target === 'selected') {
    return `var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
}
var props = comp.selectedProperties;
if (!props || props.length === 0) {
  throw new Error("Select a property in the timeline first.");
}
app.beginUndoGroup(${undoName});
props[0].expression = ${expr};
app.endUndoGroup();`;
  }

  const path = TRANSFORM_PATH[target];
  return `var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
}
var sel = comp.selectedLayers;
if (sel.length === 0) {
  throw new Error("Select one or more layers first.");
}
app.beginUndoGroup(${undoName});
for (var i = 0; i < sel.length; i++) {
  sel[i].${path}.expression = ${expr};
}
app.endUndoGroup();`;
}
