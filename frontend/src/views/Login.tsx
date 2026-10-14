import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, LockKeyhole, UserRound } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { API_URL } from '../api';

interface PublicPanel {
  id: number;
  company_name: string;
  licensee_name: string;
  logo_data: string | null;
  default_username?: string | null;
}

export default function Login() {
  const { login } = useAuth();
  const [panels, setPanels] = useState<PublicPanel[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<PublicPanel | null>(null);
  const [panelsLoading, setPanelsLoading] = useState(true);
  const [panelsError, setPanelsError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/public/panels`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Company panels are temporarily unavailable.');
        return response.json() as Promise<PublicPanel[]>;
      })
      .then(data => {
        if (active) setPanels(data);
      })
      .catch(() => {
        if (active) setPanelsError('Unable to load company panels. Please refresh or try again later.');
      })
      .finally(() => {
        if (active) setPanelsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setError('');
    const result = await login(username, password, selectedPanel?.id);
    if (!result.success) {
      setError(result.error || 'Login failed.');
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page classic-login">
      <div className="login-particles" aria-hidden="true">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      <div className="login-portal classic-login-window">
        <header className="classic-login-titlebar">
          <span>PS - Billing</span>
          <span className="classic-login-window-controls" aria-hidden="true">_ &nbsp;□&nbsp; ×</span>
        </header>

        <section className="login-panel-list" aria-labelledby="login-panels-title">
          <div className="login-brand">
            <div className="login-logo"><Building2 size={28} /></div>
            <h1 className="login-title">PS Billing</h1>
            <p className="login-subtitle">Choose your company panel to continue</p>
          </div>

          <h2 id="login-panels-title" className="login-section-title">Company panels</h2>
          {panelsError && <p className="login-panel-message" role="alert">{panelsError}</p>}
          {panelsLoading ? (
            <p className="login-panel-message" role="status">Loading company panels...</p>
          ) : (
            <div className="login-panel-grid">
              {panels.map(panel => (
                <button
                  key={panel.id}
                  type="button"
                  className={`login-panel-tile${selectedPanel?.id === panel.id ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedPanel(panel);
                    const defaultUsername = panel.default_username?.trim();
                    setUsername(defaultUsername || '');
                    setPassword('');
                    setError(defaultUsername
                      ? ''
                      : 'This server did not provide a username for the selected panel. Restart the billing server and reload, or enter your username manually.');
                    passwordInputRef.current?.focus();
                  }}
                  disabled={isLoading}
                  aria-pressed={selectedPanel?.id === panel.id}
                >
                  <span className="login-panel-logo">
                    {panel.logo_data
                      ? <img src={panel.logo_data} alt="" />
                      : <Building2 size={26} aria-hidden="true" />}
                  </span>
                  <span className="login-panel-copy">
                    <strong>{panel.licensee_name}</strong>
                    <span>{panel.company_name}</span>
                  </span>
                </button>
              ))}
              {!panelsError && panels.length === 0 && (
                <p className="login-panel-message">No company panels are available.</p>
              )}
            </div>
          )}
          <p className="login-privacy-note">Only company names and panel logos are shown before sign-in.</p>
        </section>

        <section className="login-card" aria-labelledby="login-form-title">
          <h2 id="login-form-title" className="login-form-title">
            {selectedPanel ? `Sign in to ${selectedPanel.licensee_name}` : 'Sign in'}
          </h2>
          <p className="login-form-subtitle">
            {selectedPanel ? selectedPanel.company_name : 'Choose a company panel or sign in as an administrator.'}
          </p>

          {error && <div className="login-error" role="alert">{error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <label className="login-field">
              <span>Username</span>
              <span className="login-input-wrap">
                <UserRound size={17} aria-hidden="true" />
                <input
                  ref={usernameInputRef}
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={event => {
                    setUsername(event.target.value);
                    setError('');
                  }}
                  disabled={isLoading}
                  required
                />
              </span>
            </label>

            <label className="login-field">
              <span>Password</span>
              <span className="login-input-wrap">
                <LockKeyhole size={17} aria-hidden="true" />
                <input
                  ref={passwordInputRef}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={isLoading}
                  required
                />
              </span>
            </label>

            <button type="submit" className="btn btn-primary login-submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in securely'}
            </button>
          </form>

          {selectedPanel && (
            <button
              type="button"
              className="login-admin-mode"
              onClick={() => {
                setSelectedPanel(null);
                setUsername('');
                setPassword('');
                setError('');
                usernameInputRef.current?.focus();
              }}
              disabled={isLoading}
            >
              Sign in as administrator
            </button>
          )}

          <a
            className="login-download-link"
            href="https://github.com/puspharajm/ps-billing/releases/latest"
            target="_blank"
            rel="noreferrer"
          >
            Download Desktop App
          </a>
        </section>
      </div>
    </main>
  );
}
