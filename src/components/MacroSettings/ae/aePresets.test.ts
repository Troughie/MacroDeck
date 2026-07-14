import { describe, it, expect } from 'vitest';
import { AE_PRESETS, AE_PRESET_CATEGORIES } from './aePresets';

describe('AE_PRESETS', () => {
  it('has no duplicate ids', () => {
    const ids = AE_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has a non-empty label and description', () => {
    AE_PRESETS.forEach(p => {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    });
  });

  it('every preset has a non-empty jsx script', () => {
    AE_PRESETS.forEach(p => expect(p.jsx.trim().length).toBeGreaterThan(0));
  });

  it('every preset category exists in AE_PRESET_CATEGORIES', () => {
    const cats = new Set(AE_PRESET_CATEGORIES.map(c => c.id));
    AE_PRESETS.forEach(p => expect(cats.has(p.category)).toBe(true));
  });
});
