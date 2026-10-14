import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, LockKeyhole, UserRound } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { API_URL, getDesktopDataMode, isDesktopApp, switchDesktopDataMode, type DesktopDataMode } from '../api';

interface PublicPanel {
  id: number;
  company_name: string;
  licensee_name: string;
  logo_data: string | null;
  default_username?: string | null;
}

const desktopDataMode: DesktopDataMode = isDesktopApp ? getDesktopDataMode() : 'local';

export default function Login() {
  const { login } = useAuth();
  const [panels, setPanels] = useState<PublicPanel[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<PublicPanel | null>(null);
  const [panelsLoading, setPanelsLoading] = useState(true);
  const [panelsError, setPanelsError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupLoading, setSetupLoading] = useState(isDesktopApp && desktopDataMode === 'local');
  const [setupPasswordConfirmation, setSetupPasswordConfirmation] = useState('');
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
        if (!response.ok) {
          if (active) {
            setPanelsError(desktopDataMode === 'online'
              ? 'The hosted billing service rejected the company-panel request. Update the hosted API and verify its database, or switch to local data.'
              : 'Company panels are temporarily unavailable.');
          }
          return [];
        }
        return response.json() as Promise<PublicPanel[]>;
      })
      .then(data => {
        if (active) setPanels(data);
      })
      .catch(() => {
        if (active) {
          setPanelsError(desktopDataMode === 'online'
            ? 'Unable to connect to shared online data. Check your internet connection or switch to local data.'
            : 'Unable to load company panels. Please refresh or try again later.');
        }
      })
      .finally(() => {
        if (active) setPanelsLoading(false);
      });

    if (isDesktopApp && desktopDataMode === 'local') {
      fetch(`${API_URL}/auth/setup-status`, { cache: 'no-store' })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Unable to check administrator setup.');
          setSetupRequired(data.setupRequired === true);
        })
        .catch((setupError: Error) => setPanelsError(setupError.message))
        .finally(() => setSetupLoading(false));
    }

    return () => { active = false; };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (setupRequired) {
      if (!username.trim()) {
        setError('Enter a username for the administrator account.');
        return;
      }
      if (password.length < 12) {
        setError('Choose an administrator password with at least 12 characters.');
        return;
      }
      if (password !== setupPasswordConfirmation) {
        setError('The passwords do not match.');
        return;
      }

      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_URL}/auth/initial-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to create the administrator account.');

        setSetupRequired(false);
        const result = await login(username, password);
        if (!result.success) throw new Error(result.error || 'Administrator account created, but sign-in failed.');
      } catch (setupError) {
        setError(setupError instanceof Error ? setupError.message : 'Unable to complete administrator setup.');
        setIsLoading(false);
      }
      return;
    }

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
          {isDesktopApp && (
            <div className="login-data-mode" role="group" aria-label="Database mode">
              <button
                type="button"
                className={`login-data-mode-button${desktopDataMode === 'online' ? ' active' : ''}`}
                aria-pressed={desktopDataMode === 'online'}
                onClick={() => switchDesktopDataMode('online')}
              >
                Shared online data
              </button>
              <button
                type="button"
                className={`login-data-mode-button${desktopDataMode === 'local' ? ' active' : ''}`}
                aria-pressed={desktopDataMode === 'local'}
                onClick={() => switchDesktopDataMode('local')}
              >
                Local data (this PC)
              </button>
            </div>
          )}
          {isDesktopApp && (
            <p className="login-data-mode-description" role="status">
              {desktopDataMode === 'online'
                ? 'Shared online users, company panels, and business data.'
                : 'Offline data stored only on this PC.'}
            </p>
          )}
          {panelsError && <p className="login-panel-message" role="alert">{panelsError}</p>}
          {setupLoading ? (
            <p className="login-panel-message" role="status">Checking desktop setup...</p>
          ) : setupRequired ? (
            <p className="login-panel-message" role="status">Create your administrator account to initialize this desktop app.</p>
          ) : panelsLoading ? (
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
            {setupRequired
              ? 'Set up administrator'
              : selectedPanel ? `Sign in to ${selectedPanel.licensee_name}` : 'Sign in'}
          </h2>
          <p className="login-form-subtitle">
            {setupRequired
              ? 'Create a private administrator account to initialize your local database.'
              : selectedPanel ? selectedPanel.company_name : 'Choose a company panel or sign in as an administrator.'}
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
                  autoComplete={setupRequired ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={isLoading}
                  required
                />
              </span>
            </label>

            {setupRequired && (
              <label className="login-field">
                <span>Confirm administrator password</span>
                <span className="login-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={setupPasswordConfirmation}
                    onChange={event => setSetupPasswordConfirmation(event.target.value)}
                    disabled={isLoading}
                    minLength={12}
                    required
                  />
                </span>
              </label>
            )}

            <button type="submit" className="btn btn-primary login-submit" disabled={isLoading}>
              {isLoading
                ? setupRequired ? 'Creating administrator...' : 'Signing in...'
                : setupRequired ? 'Create administrator and sign in' : 'Sign in securely'}
            </button>
          </form>

          {!setupRequired && selectedPanel && (
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
