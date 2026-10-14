export const isDesktopApp = new URLSearchParams(window.location.search).has('desktop');
export type DesktopDataMode = 'local' | 'online';

const desktopDataMode: DesktopDataMode = localStorage.getItem('desktop_data_mode') === 'local'
  ? 'local'
  : 'online';

export const API_URL = import.meta.env.PROD
  ? isDesktopApp ? desktopDataMode === 'online' ? '/api/online' : '/api' : '/_/backend/api'
  : 'http://localhost:5000/api';

export function getDesktopDataMode(): DesktopDataMode {
  return desktopDataMode;
}

export function switchDesktopDataMode(mode: DesktopDataMode): void {
  if (!isDesktopApp || mode === desktopDataMode) return;
  localStorage.setItem('desktop_data_mode', mode);
  localStorage.removeItem('auth_token');
  window.location.reload();
}
