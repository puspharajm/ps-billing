const isDesktopApp = new URLSearchParams(window.location.search).has('desktop');

export const API_URL = import.meta.env.PROD
  ? isDesktopApp ? '/api' : '/_/backend/api'
  : 'http://localhost:5000/api';
