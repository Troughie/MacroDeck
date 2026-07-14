import { describe, it, expect } from 'vitest';
import { AE_SHORTCUTS, AE_SHORTCUT_CATEGORIES } from './aeShortcuts';

describe('AE_SHORTCUTS', () => {
  it('has no duplicate ids', () => {
    const ids = AE_SHORTCUTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every shortcut has a non-empty label', () => {
    AE_SHORTCUTS.forEach(s => expect(s.label.length).toBeGreaterThan(0));
  });

  it('every shortcut has at least one action with at least one key', () => {
    AE_SHORTCUTS.forEach(s => {
      expect(s.actions.length).toBeGreaterThan(0);
      s.actions.forEach(chord => expect(chord.length).toBeGreaterThan(0));
    });
  });

  it('every shortcut category exists in AE_SHORTCUT_CATEGORIES', () => {
    const cats = new Set(AE_SHORTCUT_CATEGORIES.map(c => c.id));
    AE_SHORTCUTS.forEach(s => expect(cats.has(s.category)).toBe(true));
  });
});
