export interface AePreset {
  id: string;
  label: string;
  category: string;
  description: string;
  jsx: string;
}

export interface AePresetCategory {
  id: string;
  label: string;
}

export const AE_PRESET_CATEGORIES: AePresetCategory[] = [
  { id: 'layer', label: 'Layer Utilities' },
  { id: 'expr',  label: 'Expressions' },
  { id: 'comp',  label: 'Composition' },
  { id: 'anim',  label: 'Animation' },
];

export const AE_PRESETS: AePreset[] = [
  // ── Layer Utilities ───────────────────────────────────────────────────────
  {
    id: 'layer.centerAnchor',
    label: 'Center Anchor Point',
    category: 'layer',
    description: 'Centers the anchor point of each selected layer without moving it',
    jsx: `var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
} else if (comp.selectedLayers.length === 0) {
  throw new Error("Select one or more layers first.");
} else {
  app.beginUndoGroup("Center Anchor Point");
  // AE's built-in command centers the anchor within the layer's real content
  // bounds and compensates position so the layer stays put — works for
  // footage, solids, precomps, shape layers and text layers alike.
  var cmd = app.findMenuCommandId("Center Anchor Point in Layer Content");
  if (cmd) {
    app.executeCommand(cmd);
  } else {
    // Fallback (older AE): compute bounds manually per layer.
    var sel = comp.selectedLayers;
    for (var i = 0; i < sel.length; i++) {
      var layer = sel[i];
      var src = layer.source;
      if (src) {
        layer.anchorPoint.setValue([src.width / 2, src.height / 2]);
      } else if (layer.sourceRectAtTime) {
        var r = layer.sourceRectAtTime(comp.time, false);
        layer.anchorPoint.setValue([r.left + r.width / 2, r.top + r.height / 2]);
      }
    }
  }
  app.endUndoGroup();
}`,
  },
  {
    id: 'layer.parentToNull',
    label: 'Parent to New Null',
    category: 'layer',
    description: 'Creates a null object and parents all selected layers to it',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Parent to New Null");
  var sel = comp.selectedLayers;
  if (sel.length > 0) {
    var nullLayer = comp.layers.addNull();
    nullLayer.name = "NULL";
    nullLayer.transform.position.setValue([comp.width / 2, comp.height / 2]);
    for (var i = 0; i < sel.length; i++) {
      sel[i].parent = nullLayer;
    }
    comp.selectedLayers[0].selected = false;
    nullLayer.selected = true;
  }
  app.endUndoGroup();
}`,
  },
  {
    id: 'layer.toggle3D',
    label: 'Toggle 3D Layer',
    category: 'layer',
    description: 'Toggles the 3D switch on selected layers',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Toggle 3D Layer");
  var sel = comp.selectedLayers;
  for (var i = 0; i < sel.length; i++) {
    sel[i].threeDLayer = !sel[i].threeDLayer;
  }
  app.endUndoGroup();
}`,
  },
  {
    id: 'layer.freezeFrame',
    label: 'Freeze Frame',
    category: 'layer',
    description: 'Enables time remapping and freezes selected layers at current time',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Freeze Frame");
  var sel = comp.selectedLayers;
  var t = comp.time;
  var fd = 1 / comp.frameRate;
  for (var i = 0; i < sel.length; i++) {
    var layer = sel[i];
    layer.timeRemapEnabled = true;
    var tr = layer.property("Time Remap");
    var val = tr.valueAtTime(t, false);
    tr.addKey(t);
    tr.addKey(t + fd);
    tr.setValueAtTime(t, val);
    tr.setValueAtTime(t + fd, val);
  }
  app.endUndoGroup();
}`,
  },
  {
    id: 'layer.fitToComp',
    label: 'Fit Layer to Comp',
    category: 'layer',
    description: 'Scales selected layers to fill the composition (preserves aspect ratio)',
    jsx: `var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
} else if (comp.selectedLayers.length === 0) {
  throw new Error("Select one or more layers first.");
} else {
  app.beginUndoGroup("Fit Layer to Comp");
  var sel = comp.selectedLayers;
  for (var i = 0; i < sel.length; i++) {
    var layer = sel[i];
    var w, h;
    var src = layer.source;
    if (src) {
      w = src.width; h = src.height;
    } else if (layer.sourceRectAtTime) {
      var r = layer.sourceRectAtTime(comp.time, false);
      w = r.width; h = r.height;
    } else {
      continue;
    }
    if (w > 0 && h > 0) {
      var scale = Math.min((comp.width / w) * 100, (comp.height / h) * 100);
      layer.transform.scale.setValue([scale, scale]);
      layer.transform.position.setValue([comp.width / 2, comp.height / 2]);
    }
  }
  app.endUndoGroup();
}`,
  },

  // ── Expressions ───────────────────────────────────────────────────────────
  {
    id: 'expr.wigglePosition',
    label: 'Wiggle Position',
    category: 'expr',
    description: 'Adds wiggle(3, 20) expression to Position of selected layers',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Wiggle Position");
  var sel = comp.selectedLayers;
  for (var i = 0; i < sel.length; i++) {
    sel[i].transform.position.expression = "wiggle(3, 20)";
  }
  app.endUndoGroup();
}`,
  },
  {
    id: 'expr.loopOut',
    label: 'Loop Out',
    category: 'expr',
    description: 'Adds loopOut("cycle") to the selected property in the timeline',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  var props = comp.selectedProperties;
  if (props.length > 0) {
    app.beginUndoGroup("Loop Out");
    props[0].expression = 'loopOut("cycle")';
    app.endUndoGroup();
  } else {
    throw new Error("Select a property in the timeline first.");
  }
}`,
  },
  {
    id: 'expr.timeSpeed',
    label: 'Time x Speed',
    category: 'expr',
    description: 'Adds time * 100 expression to the selected property',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  var props = comp.selectedProperties;
  if (props.length > 0) {
    app.beginUndoGroup("Time x Speed");
    props[0].expression = "time * 100";
    app.endUndoGroup();
  } else {
    throw new Error("Select a property in the timeline first.");
  }
}`,
  },
  {
    id: 'expr.overshoot',
    label: 'Overshoot Bounce',
    category: 'expr',
    description: 'Adds an overshoot bounce expression to the selected property',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  var props = comp.selectedProperties;
  if (props.length > 0) {
    app.beginUndoGroup("Bounce Expression");
    props[0].expression = [
      "n = 0;",
      "if (numKeys > 0) {",
      "  n = nearestKey(time).index;",
      "  if (key(n).time > time) n--;",
      "}",
      "if (n == 0) { t = 0; } else { t = time - key(n).time; }",
      "if (n > 0) {",
      "  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);",
      "  amp = 0.07; freq = 2.5; decay = 8;",
      "  value + v * amp * Math.sin(freq * 2 * Math.PI * t) * Math.exp(-decay * t);",
      "} else { value; }"
    ].join("\n");
    app.endUndoGroup();
  } else {
    throw new Error("Select a property in the timeline first.");
  }
}`,
  },
  {
    id: 'expr.randomOpacity',
    label: 'Random Opacity',
    category: 'expr',
    description: 'Adds random(80, 100) expression to Opacity of selected layers',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Random Opacity");
  var sel = comp.selectedLayers;
  for (var i = 0; i < sel.length; i++) {
    sel[i].transform.opacity.expression = "random(80, 100)";
  }
  app.endUndoGroup();
}`,
  },

  // ── Composition ───────────────────────────────────────────────────────────
  {
    id: 'comp.guideLayer',
    label: 'Create Guide Layer',
    category: 'comp',
    description: 'Creates a red adjustment layer marked as a guide layer',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Create Guide Layer");
  var guide = comp.layers.addSolid([1, 0, 0], "GUIDE", comp.width, comp.height, comp.pixelAspect);
  guide.guideLayer = true;
  app.endUndoGroup();
}`,
  },
  {
    id: 'comp.removeEffects',
    label: 'Remove All Effects',
    category: 'comp',
    description: 'Removes all effects from the selected layers',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Remove All Effects");
  var sel = comp.selectedLayers;
  for (var i = 0; i < sel.length; i++) {
    var fx = sel[i].property("Effects");
    while (fx.numProperties > 0) {
      fx.property(1).remove();
    }
  }
  app.endUndoGroup();
}`,
  },
  {
    id: 'comp.duplicateComp',
    label: 'Duplicate Comp',
    category: 'comp',
    description: 'Duplicates the currently active composition',
    jsx: `var item = app.project.activeItem;
if (item && item instanceof CompItem) {
  app.beginUndoGroup("Duplicate Comp");
  var dupe = item.duplicate();
  dupe.name = item.name + " copy";
  app.endUndoGroup();
}`,
  },
  {
    id: 'comp.collectFiles',
    label: 'Collect to Folder',
    category: 'comp',
    description: 'Opens the Collect Files dialog to gather project assets',
    jsx: `var cmd = app.findMenuCommandId("Collect Files...");
if (cmd) {
  app.executeCommand(cmd);
} else {
  throw new Error("Could not find 'Collect Files...' in the File menu.");
}`,
  },
  {
    id: 'comp.toggleMotionBlur',
    label: 'Toggle Motion Blur',
    category: 'comp',
    description: 'Toggles motion blur on selected layers',
    jsx: `var comp = app.project.activeItem;
if (comp && comp instanceof CompItem) {
  app.beginUndoGroup("Toggle Motion Blur");
  var sel = comp.selectedLayers;
  for (var i = 0; i < sel.length; i++) {
    sel[i].motionBlur = !sel[i].motionBlur;
  }
  app.endUndoGroup();
}`,
  },

  // ── Animation ─────────────────────────────────────────────────────────────
  {
    id: 'anim.countingNumber',
    label: 'Counting Number',
    category: 'anim',
    description: 'Creates a text layer that counts up or down. Value, decimals and separators are all editable in AE Effect Controls.',
    jsx: `// ─── Starting values (everything below is editable inside After Effects) ───
// After running, tweak on the "Counter" text layer:
//   • Effect Controls → "Value"      : keyframe 1 = start, keyframe 2 = end.
//                                       Drag keyframes in the timeline to change
//                                       start/end/duration. Set start > end to
//                                       count DOWN.
//   • Effect Controls → "Decimals"   : how many digits after the decimal point.
//   • Effect Controls → "Thousands"  : checkbox for 1,000 separators.
//   • Character panel                : font size / font / colour.
var START     = 0;    // initial start value (keyframe 1)
var END       = 100;  // initial end value   (keyframe 2)
var DURATION  = 3;    // seconds between the two keyframes
var START_AT  = 0;    // seconds into the comp where the count begins
var DECIMALS  = 0;    // initial decimals
var THOUSANDS = 0;    // initial separator checkbox (0 = off, 1 = on)
var PREFIX    = "";   // text before the number, e.g. "$"  (edit here)
var SUFFIX    = "";   // text after the number,  e.g. "%"  (edit here)
var FONT_SIZE = 120;  // initial text size
// ──────────────────────────────────────────────────────────────────────────

var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
} else {
  app.beginUndoGroup("Counting Number");

  var textLayer = comp.layers.addText("0");
  textLayer.name = "Counter";
  textLayer.transform.position.setValue([comp.width / 2, comp.height / 2]);

  var textProp = textLayer.property("Source Text");
  var td = textProp.value;
  td.fontSize = FONT_SIZE;
  td.justification = ParagraphJustification.CENTER_JUSTIFY;
  textProp.setValue(td);

  var effects = textLayer.property("Effects");

  // "Value" slider drives the number; two keyframes animate START -> END.
  var valueCtrl = effects.addProperty("ADBE Slider Control");
  valueCtrl.name = "Value";
  var slider = valueCtrl.property("Slider");
  slider.setValueAtTime(START_AT, START);
  slider.setValueAtTime(START_AT + DURATION, END);
  var ease = new KeyframeEase(0, 33);
  slider.setTemporalEaseAtKey(1, [ease], [ease]);
  slider.setTemporalEaseAtKey(2, [ease], [ease]);

  // "Decimals" and "Thousands" are live controls the expression reads.
  var decCtrl = effects.addProperty("ADBE Slider Control");
  decCtrl.name = "Decimals";
  decCtrl.property("Slider").setValue(DECIMALS);

  var sepCtrl = effects.addProperty("ADBE Checkbox Control");
  sepCtrl.name = "Thousands";
  sepCtrl.property("Checkbox").setValue(THOUSANDS);

  // Expression: reads the three controls above, so nothing is baked in.
  // No regex — a simple loop inserts the thousands separators.
  var expr = [
    "var v = effect(\\"Value\\")(\\"Slider\\").value;",
    "var dec = Math.round(effect(\\"Decimals\\")(\\"Slider\\").value);",
    "if (dec < 0) dec = 0;",
    "var useSep = effect(\\"Thousands\\")(\\"Checkbox\\").value == 1;",
    "var neg = v < 0;",
    "var s = Math.abs(v).toFixed(dec);",
    "if (useSep) {",
    "  var parts = s.split(\\".\\");",
    "  var intp = parts[0];",
    "  var out = \\"\\";",
    "  var c = 0;",
    "  for (var i = intp.length - 1; i >= 0; i--) {",
    "    out = intp.charAt(i) + out;",
    "    c++;",
    "    if (c % 3 == 0 && i > 0) out = \\",\\" + out;",
    "  }",
    "  parts[0] = out;",
    "  s = parts.join(\\".\\");",
    "}",
    "(neg ? \\"-\\" : \\"\\") + \\"" + PREFIX + "\\" + s + \\"" + SUFFIX + "\\";"
  ].join("\\n");
  textProp.expression = expr;

  app.endUndoGroup();
}`,
  },
  {
    id: 'anim.trimPaths',
    label: 'Add Trim Paths (Write-On)',
    category: 'anim',
    description: 'Adds a Trim Paths animator to each selected shape layer and keyframes a 0→100% write-on. Adjust the two "End" keyframes in the timeline to change speed.',
    jsx: `// ─── Starting values (editable here, then tweak keyframes inside AE) ────────
// After running, on each shape layer:
//   • Contents → Trim Paths 1 → End : keyframe 1 = 0%, keyframe 2 = 100%.
//                                      Drag the second keyframe to change how
//                                      long the write-on takes.
//   • Set the layer's Trim Paths → Start instead if you want it to erase.
var START_AT = 0;   // seconds into the comp where the draw begins
var DURATION = 2;   // seconds for the 0% → 100% write-on
// ──────────────────────────────────────────────────────────────────────────

var comp = app.project.activeItem;
if (!comp || !(comp instanceof CompItem)) {
  throw new Error("Open a composition first.");
} else if (comp.selectedLayers.length === 0) {
  throw new Error("Select one or more shape layers first.");
} else {
  app.beginUndoGroup("Add Trim Paths");

  var applied = 0;
  var sel = comp.selectedLayers;

  for (var i = 0; i < sel.length; i++) {
    var layer = sel[i];
    // Only shape layers have a "Contents" ("ADBE Root Vectors Group") property.
    var contents = layer.property("ADBE Root Vectors Group");
    if (!contents) { continue; }

    // "ADBE Vector Filter - Trim" is the Trim Paths shape effect. Adding it to
    // Contents trims every path in the layer at once (matches Add ▸ Trim Paths).
    var trim = contents.addProperty("ADBE Vector Filter - Trim");
    var endProp = trim.property("ADBE Vector Trim End"); // the "End" percentage

    var startTime = comp.time + START_AT;
    endProp.setValueAtTime(startTime, 0);
    endProp.setValueAtTime(startTime + DURATION, 100);

    // Smooth ease on both keyframes so the draw doesn't start/stop abruptly.
    var ease = new KeyframeEase(0, 33);
    endProp.setTemporalEaseAtKey(1, [ease], [ease]);
    endProp.setTemporalEaseAtKey(2, [ease], [ease]);

    applied++;
  }

  app.endUndoGroup();

  if (applied === 0) {
    throw new Error("No shape layers selected — Trim Paths only applies to shape layers.");
  }
}`,
  },
];
