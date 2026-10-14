import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Globally patch window.fetch to automatically inject the local auth token for all API requests
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('auth_token');
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
  
  if (token && url.includes('/api/')) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    if (input instanceof Request) {
      const newRequest = new Request(input, { headers });
      return originalFetch(newRequest, init);
    } else {
      return originalFetch(input, { ...init, headers });
    }
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
