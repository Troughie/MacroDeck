import { describe, it, expect } from 'vitest';
import path from 'path';
import { panelDestDir, panelSourceDir, EXTENSION_ID } from './ae-install';

describe('panelDestDir', () => {
  it('builds the CEP extensions path under APPDATA', () => {
    const dest = panelDestDir('C:\\Users\\me\\AppData\\Roaming');
    expect(dest).toBe(
      path.join('C:\\Users\\me\\AppData\\Roaming', 'Adobe', 'CEP', 'extensions', EXTENSION_ID),
    );
  });
  it('uses com.macrodeck.panel as the extension id', () => {
    expect(EXTENSION_ID).toBe('com.macrodeck.panel');
  });
});

describe('panelSourceDir', () => {
  it('uses the repo ae-panel folder in dev', () => {
    const src = panelSourceDir({ isPackaged: false, resourcesPath: '/ignored', appPath: '/repo' });
    expect(src).toBe(path.join('/repo', 'ae-panel'));
  });
  it('uses resourcesPath/ae-panel in prod', () => {
    const src = panelSourceDir({ isPackaged: true, resourcesPath: '/app/resources', appPath: '/x' });
    expect(src).toBe(path.join('/app/resources', 'ae-panel'));
  });
});
