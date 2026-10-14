import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Lightbulb,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { API_URL } from '../api';

type FindingStatus = 'ok' | 'attention' | 'error';

interface DiagnosticFinding {
  title: string;
  status: FindingStatus;
  summary: string;
  recommendations?: string[];
}

interface EndpointResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

interface DiagnosticUser {
  username?: string;
  role?: string;
  license_number?: string | null;
}

interface DiagnosticLicensee {
  company_name?: string;
  license_number?: string;
}

const t = (value: string) => value;

async function requestJson(authFetch: ReturnType<typeof useAuth>['authFetch'], path: string): Promise<EndpointResult> {
  try {
    const response = await authFetch(`${API_URL}${path}`);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Network request failed.',
    };
  }
}

function analyzeProblem(problem: string): { summary: string; recommendations: string[] } {
  const text = problem.toLowerCase();

  if (/cannot find module|module not found|function_invocation_failed|internal server error|\b500\b/.test(text)) {
    return {
      summary: 'This points to an API deployment or server startup failure.',
      recommendations: [
        'Run the system checks below to confirm whether the API health endpoint is responding.',
        'Review the latest server runtime log for the first exception and confirm the deployed Git commit.',
        'Keep credentials and full database connection strings out of logs and support messages.',
      ],
    };
  }

  if (/database|neon|postgres|postgresql|pg_|connection timeout|connection refused/.test(text)) {
    return {
      summary: 'This appears to be a database connection or initialization issue.',
      recommendations: [
        'Run the system checks below to test the API-to-database connection.',
        'Confirm the hosted API environment has a valid DATABASE_URL or NEON_DATABASE_URL and that the Neon project is available.',
        'Never paste database passwords into the problem description or screenshots.',
      ],
    };
  }

  if (/panel|licensee|company list|company profile/.test(text)) {
    return {
      summary: 'This appears related to company panels or account-to-license assignment.',
      recommendations: [
        'Run the system checks below to verify the API and admin data endpoints.',
        'Confirm each company account is assigned to the matching license number in User Accounts.',
        'Confirm the licensee has a company name and license number in Software Licensees.',
      ],
    };
  }

  if (/login|password|invalid username|unauthorized|401/.test(text)) {
    return {
      summary: 'This appears related to sign-in or account authorization.',
      recommendations: [
        'Confirm the correct company panel is selected and the username belongs to that license.',
        'Verify the account exists and has not been disabled or removed by an administrator.',
        'If access still fails, use the authorized password-reset process; do not share passwords.',
      ],
    };
  }

  if (/invoice|quotation|purchase order|gstin|bank|print/.test(text)) {
    return {
      summary: 'This appears related to company profile information or document output.',
      recommendations: [
        'Open Settings and verify the company name, address, phone, GSTIN, and banking details.',
        'Preview the document and verify its print layout before issuing it.',
        'Use authentic business details; the assistant cannot infer or create official tax or bank information.',
      ],
    };
  }

  if (/sqlite|local data|offline|sync/.test(text)) {
    return {
      summary: 'This appears related to local/offline data or shared online mode.',
      recommendations: [
        'Check whether the sign-in screen is set to Local data or Shared online data.',
        'Local SQLite data is separate from the shared Neon database and does not automatically sync.',
        'Back up local data before changing devices or reinstalling the desktop app.',
      ],
    };
  }

  return {
    summary: 'The built-in rule checks could not classify this problem from the description.',
    recommendations: [
      'Run the system checks below to collect current API, database, and account/license status.',
      'Add the exact user-facing error, the action that caused it, and the affected page to the description.',
      'Do not include passwords, access tokens, customer records, or database credentials.',
    ],
  };
}

function isRecordArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.every(item => item !== null && typeof item === 'object');
}

export default function SystemAssistant() {
  const { authFetch } = useAuth();
  const [runningChecks, setRunningChecks] = useState(false);
  const [findings, setFindings] = useState<DiagnosticFinding[]>([]);
  const [problem, setProblem] = useState('');
  const [problemAnalysis, setProblemAnalysis] = useState<ReturnType<typeof analyzeProblem> | null>(null);
  const [problemError, setProblemError] = useState('');

  const runDiagnostics = async () => {
    setRunningChecks(true);
    setFindings([]);

    const [health, usersResponse, licenseesResponse] = await Promise.all([
      requestJson(authFetch, '/health'),
      requestJson(authFetch, '/admin/users'),
      requestJson(authFetch, '/admin/licensees'),
    ]);

    const nextFindings: DiagnosticFinding[] = [];
    const healthData = health.data as { status?: string; mode?: string; message?: string } | null;
    nextFindings.push(health.ok && healthData?.status === 'ok'
      ? {
        title: 'API and database connectivity',
        status: 'ok',
        summary: `Health check passed${healthData.mode ? ` (${healthData.mode})` : ''}.`,
      }
      : {
        title: 'API and database connectivity',
        status: 'error',
        summary: health.error || healthData?.message || `Health check failed with HTTP ${health.status || 'network error'}.`,
        recommendations: ['Check the hosted API runtime logs and database environment configuration.'],
      });

    const users = usersResponse.data;
    const licensees = licenseesResponse.data;
    if (!usersResponse.ok || !isRecordArray<DiagnosticUser>(users)) {
      nextFindings.push({
        title: 'Admin user accounts',
        status: 'error',
        summary: usersResponse.error || `Could not read the admin user list (HTTP ${usersResponse.status || 'network error'}).`,
        recommendations: ['Confirm the current account has administrator access and the API is available.'],
      });
    } else {
      nextFindings.push({
        title: 'Admin user accounts',
        status: 'ok',
        summary: `Admin user list loaded (${users.length} account${users.length === 1 ? '' : 's'}).`,
      });
    }

    if (!licenseesResponse.ok || !isRecordArray<DiagnosticLicensee>(licensees)) {
      nextFindings.push({
        title: 'Company licenses',
        status: 'error',
        summary: licenseesResponse.error || `Could not read the licensee list (HTTP ${licenseesResponse.status || 'network error'}).`,
        recommendations: ['Confirm the current account has administrator access and the API is available.'],
      });
    } else {
      nextFindings.push({
        title: 'Company licenses',
        status: 'ok',
        summary: `Licensee list loaded (${licensees.length} record${licensees.length === 1 ? '' : 's'}).`,
      });

      if (isRecordArray<DiagnosticUser>(users)) {
        const licenseNumbers = new Set(
          licensees
            .map(licensee => licensee.license_number?.trim().toLowerCase())
            .filter((licenseNumber): licenseNumber is string => !!licenseNumber),
        );
        const unassignedUsers = users.filter(user =>
          user.role === 'user'
          && (!user.license_number || !licenseNumbers.has(user.license_number.trim().toLowerCase())),
        );
        if (unassignedUsers.length > 0) {
          nextFindings.push({
            title: 'User-to-license assignments',
            status: 'attention',
            summary: `${unassignedUsers.length} company account${unassignedUsers.length === 1 ? '' : 's'} have no matching license.`,
            recommendations: ['In User Accounts, assign each affected user to an existing company license or register the correct licensee first.'],
          });
        } else {
          nextFindings.push({
            title: 'User-to-license assignments',
            status: 'ok',
            summary: 'All company user accounts match a registered license.',
          });
        }

        const licensesWithoutUsers = licensees.filter(licensee => {
          const number = licensee.license_number?.trim().toLowerCase();
          return !!number && !users.some(user => user.role === 'user' && user.license_number?.trim().toLowerCase() === number);
        });
        if (licensesWithoutUsers.length > 0) {
          nextFindings.push({
            title: 'Company panel accounts',
            status: 'attention',
            summary: `${licensesWithoutUsers.length} registered license${licensesWithoutUsers.length === 1 ? '' : 's'} have no company user account.`,
            recommendations: ['Create a company user and assign it to each license that should appear as a sign-in panel.'],
          });
        } else {
          nextFindings.push({
            title: 'Company panel accounts',
            status: 'ok',
            summary: 'Every registered license has at least one company user account.',
          });
        }
      }
    }

    setFindings(nextFindings);
    setRunningChecks(false);
  };

  const submitProblem = () => {
    const description = problem.trim();
    if (!description) {
      setProblemError(t('Describe the error or problem first.'));
      setProblemAnalysis(null);
      return;
    }
    setProblemError('');
    setProblemAnalysis(analyzeProblem(description.slice(0, 2000)));
  };

  const statusColor = (status: FindingStatus) => status === 'ok' ? '#15803d' : status === 'attention' ? '#b45309' : '#b91c1c';

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section className="glass-card" style={{ borderTop: '3px solid var(--color-accent-gold, #d4a843)' }}>
        <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Lightbulb size={20} className="text-gold" />
          {t('PS Matrix Problem Solver')}
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.85 }}>
          {t('Built-in private diagnostic rules help identify common API, database, account, license, and billing issues. No external AI service is used and no information is sent to a third party. This assistant diagnoses and recommends fixes; it does not change data or settings.')}
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button className="btn btn-primary" onClick={() => void runDiagnostics()} disabled={runningChecks}>
            {runningChecks ? <RefreshCw size={16} className="login-spinner" /> : <Activity size={16} />}
            <span>{runningChecks ? t('Checking system…') : t('Run system checks')}</span>
          </button>
        </div>

        {findings.length > 0 && (
          <div aria-live="polite" style={{ display: 'grid', gap: '8px' }}>
            {findings.map((finding, index) => (
              <div key={`${finding.title}-${index}`} style={{ padding: '10px 12px', border: `1px solid ${statusColor(finding.status)}66`, borderRadius: '8px', background: `${statusColor(finding.status)}0d` }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: statusColor(finding.status), fontWeight: 700 }}>
                  {finding.status === 'ok' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                  <span>{finding.title}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>{finding.summary}</p>
                {finding.recommendations && (
                  <ul style={{ margin: '6px 0 0 22px', fontSize: '0.84rem', lineHeight: 1.5 }}>
                    {finding.recommendations.map(recommendation => <li key={recommendation}>{recommendation}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card">
        <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={19} />
          {t('Analyze a problem')}
        </h3>
        <label htmlFor="system-problem" style={{ display: 'block', marginBottom: '6px', fontSize: '0.88rem' }}>
          {t('Describe what happened or paste the exact error (maximum 2,000 characters). Do not include passwords, tokens, or customer data.')}
        </label>
        <textarea
          id="system-problem"
          className="form-control"
          value={problem}
          onChange={event => setProblem(event.target.value.slice(0, 2000))}
          rows={4}
          maxLength={2000}
          placeholder={t('Example: Company panels are not loading and the API returns a 500 error.')}
          style={{ width: '100%', resize: 'vertical', marginBottom: '8px' }}
        />
        {problemError && <p role="alert" style={{ color: '#b91c1c', margin: '0 0 8px', fontSize: '0.85rem' }}>{problemError}</p>}
        <button className="btn btn-secondary" onClick={submitProblem}>
          <Search size={16} />
          <span>{t('Find likely cause')}</span>
        </button>
        {problemAnalysis && (
          <div aria-live="polite" style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: 'rgba(91, 155, 213, 0.1)', border: '1px solid rgba(91, 155, 213, 0.35)' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={17} />
              {problemAnalysis.summary}
            </p>
            <ol style={{ margin: '0 0 0 22px', fontSize: '0.88rem', lineHeight: 1.55 }}>
              {problemAnalysis.recommendations.map(recommendation => <li key={recommendation}>{recommendation}</li>)}
            </ol>
          </div>
        )}
      </section>

      <p style={{ margin: 0, display: 'flex', gap: '7px', alignItems: 'center', fontSize: '0.8rem', opacity: 0.7 }}>
        <ShieldCheck size={15} />
        {t('Diagnostics are read-only. Review recommendations before making administrative or database changes.')}
      </p>
    </div>
  );
}
