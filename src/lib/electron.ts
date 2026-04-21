/**
 * Safe wrapper for electronAPI — returns undefined when running outside Electron
 */
export const electronAPI = typeof window !== 'undefined'
  ? (window as any).electronAPI
  : undefined;

export const isElectron = !!electronAPI;
