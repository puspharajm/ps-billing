import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Users, Plus, Trash2, Edit3, ShieldCheck, Shield, Key, Save, X, UserPlus, AlertTriangle, Award, Upload } from 'lucide-react';
import { API_URL } from '../api';

const t = (val: string) => val;

interface UserRow {
  id: number;
  username: string;
  role: 'admin' | 'user';
  license_number: string | null;
  created_at: string;
  last_login: string | null;
}

interface LicenseeRow {
  id?: number;
  license_number: string;
  company_name: string;
  licensee_name: string;
  logo_data?: string | null;
  created_at?: string;
}

function LicenseeLogoPreview({ logoData, name }: { logoData?: string | null; name: string }) {
  return (
    <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden', borderRadius: 6, background: '#fff', color: '#475569' }}>
      {logoData ? <img src={logoData} alt={`${name} panel logo`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Award size={20} aria-hidden="true" />}
    </span>
  );
}

export default function SuperAdmin() {
  const { user: currentUser, authFetch } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [licensees, setLicensees] = useState<LicenseeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Admin section tabs
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'licensees'>('users');

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [newLicenseNumberAssoc, setNewLicenseNumberAssoc] = useState('');

  // Edit user state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editLicenseNumberAssoc, setEditLicenseNumberAssoc] = useState('');

  // Create licensee form
  const [showLicenseForm, setShowLicenseForm] = useState(false);
  const [newLicenseNumber, setNewLicenseNumber] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newLicenseeName, setNewLicenseeName] = useState('');
  const [isLicenseeNameManuallyEdited, setIsLicenseeNameManuallyEdited] = useState(false);

  // Edit licensee state
  const [editLicenseeId, setEditLicenseeId] = useState<number | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editLicenseeName, setEditLicenseeName] = useState('');

  // Change own password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newOwnPassword, setNewOwnPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await authFetch(`${API_URL}/admin/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        setError(t('Failed to load users'));
      }
    } catch {
      setError(t('Cannot connect to server'));
    }
  };

  const fetchLicensees = async () => {
    try {
      const res = await authFetch(`${API_URL}/admin/licensees`);
      if (res.ok) {
        const data = await res.json();
        setLicensees(data);
      }
    } catch {
      console.error('Cannot load licensees');
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchLicensees()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const showMessage = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 4000);
  };

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      showMessage(t('Username and password are required'), 'error');
      return;
    }
    if (newRole === 'user' && !newLicenseNumberAssoc) {
      showMessage(t('License number is required for normal user accounts'), 'error');
      return;
    }

    try {
      const res = await authFetch(`${API_URL}/admin/users`, {
        method: 'POST',
        body: JSON.stringify({ 
          username: newUsername, 
          password: newPassword, 
          role: newRole,
          license_number: newRole === 'user' ? newLicenseNumberAssoc : null
        }),
      });
      if (res.ok) {
        showMessage(t(`User "${newUsername}" created successfully`), 'success');
        setNewUsername('');
        setNewPassword('');
        setNewRole('user');
        setNewLicenseNumberAssoc('');
        setShowCreateForm(false);
        fetchUsers();
      } else {
        const data = await res.json();
        showMessage(data.error || t('Failed to create user'), 'error');
      }
    } catch {
      showMessage(t('Network error'), 'error');
    }
  };

  const handleEditUser = async (id: number) => {
    const updateData: any = {};
    if (editUsername.trim()) updateData.username = editUsername;
    if (editPassword.trim()) updateData.password = editPassword;
    if (editRole) updateData.role = editRole;
    updateData.license_number = editRole === 'user' ? editLicenseNumberAssoc : null;

    try {
      const res = await authFetch(`${API_URL}/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
      if (res.ok) {
        showMessage(t('User updated successfully'), 'success');
        setEditingId(null);
        fetchUsers();
      } else {
        const data = await res.json();
        showMessage(data.error || t('Failed to update user'), 'error');
      }
    } catch {
      showMessage(t('Network error'), 'error');
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!confirm(t(`Are you sure you want to delete user "${username}"? This action cannot be undone.`))) return;

    try {
      const res = await authFetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMessage(t(`User "${username}" deleted`), 'success');
        fetchUsers();
      } else {
        const data = await res.json();
        showMessage(data.error || t('Failed to delete user'), 'error');
      }
    } catch {
      showMessage(t('Network error'), 'error');
    }
  };

  const handleCreateLicensee = async () => {
    if (!newLicenseNumber.trim() || !newCompanyName.trim()) {
      showMessage(t('License number and company name are required'), 'error');
      return;
    }

    try {
      const res = await authFetch(`${API_URL}/admin/licensees`, {
        method: 'POST',
        body: JSON.stringify({ 
          license_number: newLicenseNumber, 
          company_name: newCompanyName,
          licensee_name: newLicenseeName
        }),
      });
      if (res.ok) {
        showMessage(t(`Licensee "${newCompanyName}" registered successfully`), 'success');
        setNewLicenseNumber('');
        setNewCompanyName('');
        setNewLicenseeName('');
        setIsLicenseeNameManuallyEdited(false);
        setShowLicenseForm(false);
        fetchLicensees();
      } else {
        const data = await res.json();
        showMessage(data.error || t('Failed to create licensee'), 'error');
      }
    } catch {
      showMessage(t('Network error'), 'error');
    }
  };

  const handleEditLicensee = async (id: number) => {
    if (!editCompanyName.trim()) {
      showMessage(t('Company name is required'), 'error');
      return;
    }

    try {
      const res = await authFetch(`${API_URL}/admin/licensees/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          company_name: editCompanyName,
          licensee_name: editLicenseeName
        }),
      });
      if (res.ok) {
        showMessage(t('Licensee updated successfully'), 'success');
        setEditLicenseeId(null);
        fetchLicensees();
        fetchUsers();
      } else {
        const data = await res.json();
        showMessage(data.error || t('Failed to update licensee'), 'error');
      }
    } catch {
      showMessage(t('Network error'), 'error');
    }
  };

  const handleDeleteLicensee = async (id: number, companyName: string) => {
    if (!confirm(t(`Are you sure you want to delete licensee for "${companyName}"? Normal users linked to this license will immediately lose access.`))) return;

    try {
      const res = await authFetch(`${API_URL}/admin/licensees/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMessage(t(`Licensee "${companyName}" deleted`), 'success');
        fetchLicensees();
        fetchUsers(); // Refresh users list as their license status may now be missing/invalid
      } else {
        const data = await res.json();
        showMessage(data.error || t('Failed to delete licensee'), 'error');
      }
    } catch {
      showMessage(t('Network error'), 'error');
    }
  };

  const handleLicenseeLogoChange = async (id: number, file: File | null) => {
    if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024)) {
      showMessage(t('Choose a PNG, JPEG, or WebP logo no larger than 256 KB'), 'error');
      return;
    }

    try {
      const logoData = file
        ? await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read logo file'));
          reader.onerror = () => reject(new Error('Could not read logo file'));
          reader.readAsDataURL(file);
        })
        : null;
      const response = await authFetch(`${API_URL}/admin/licensees/${id}/logo`, {
        method: 'PUT',
        body: JSON.stringify({ logo_data: logoData }),
      });
      const result = await response.json();
      if (!response.ok) {
        showMessage(result.error || t('Failed to update panel logo'), 'error');
        return;
      }
      showMessage(t('Panel logo updated. It will appear on the pre-login screen.'), 'success');
      await fetchLicensees();
    } catch (uploadError) {
      showMessage(uploadError instanceof Error ? uploadError.message : t('Cannot connect to server'), 'error');
    }
  };

  const handleChangeOwnPassword = async () => {
    if (!currentPassword || !newOwnPassword) {
      showMessage(t('All password fields are required'), 'error');
      return;
    }
    if (newOwnPassword !== confirmPassword) {
      showMessage(t('New passwords do not match'), 'error');
      return;
    }

    try {
      const res = await authFetch(`${API_URL}/admin/change-password`, {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPassword, new_password: newOwnPassword }),
      });
      if (res.ok) {
        showMessage(t('Password changed successfully'), 'success');
        setCurrentPassword('');
        setNewOwnPassword('');
        setConfirmPassword('');
        setShowChangePassword(false);
      } else {
        const data = await res.json();
        showMessage(data.error || t('Failed to change password'), 'error');
      }
    } catch {
      showMessage(t('Network error'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="view-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div className="login-spinner" style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  return (
    <div className="view-container" style={{ maxWidth: '950px', margin: '0 auto' }}>
      {/* Header */}
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldCheck size={28} className="text-gold" />
          <div>
            <h2 style={{ margin: 0 }}>{t('Super Admin Panel')}</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>{t('Manage user accounts and software licenses')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setShowChangePassword(!showChangePassword)}>
            <Key size={16} />
            <span>{t('Change My Password')}</span>
          </button>
          {activeAdminTab === 'users' ? (
            <button className="btn btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
              <UserPlus size={16} />
              <span>{t('New User')}</span>
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowLicenseForm(!showLicenseForm)}>
              <Plus size={16} />
              <span>{t('New Licensee')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin tabs */}
      <div className="tabs-header" style={{ marginBottom: '16px', marginTop: '8px' }}>
        <button 
          className={`tab-btn ${activeAdminTab === 'users' ? 'active' : ''}`}
          onClick={() => { setActiveAdminTab('users'); setError(''); setSuccess(''); }}
        >
          {t('User Accounts')}
        </button>
        <button 
          className={`tab-btn ${activeAdminTab === 'licensees' ? 'active' : ''}`}
          onClick={() => { setActiveAdminTab('licensees'); setError(''); setSuccess(''); }}
        >
          {t('Software Licensees')}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem'
        }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#10b981',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem'
        }}>
          <ShieldCheck size={18} />
          {success}
        </div>
      )}

      {/* Change Own Password */}
      {showChangePassword && (
        <div className="glass-card" style={{ marginBottom: '16px', borderTop: '3px solid var(--color-accent-gold, #d4a843)' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={20} className="text-gold" />
            {t('Change Your Password')}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>{t('Current Password')}</label>
              <input type="password" className="form-control" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t('Current password')} />
            </div>
            <div className="form-group">
              <label>{t('New Password')}</label>
              <input type="password" className="form-control" value={newOwnPassword} onChange={(e) => setNewOwnPassword(e.target.value)} placeholder={t('New password')} />
            </div>
            <div className="form-group">
              <label>{t('Confirm New Password')}</label>
              <input type="password" className="form-control" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('Confirm password')} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={handleChangeOwnPassword}>
              <Save size={16} /> {t('Save Password')}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowChangePassword(false)}>
              <X size={16} /> {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      {activeAdminTab === 'users' && (
        <>
          {/* Create New User Form */}
          {showCreateForm && (
            <div className="glass-card" style={{ marginBottom: '16px', borderTop: '3px solid var(--color-accent-blue, #5b9bd5)' }}>
              <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} style={{ color: 'var(--color-accent-blue, #5b9bd5)' }} />
                {t('Create New User')}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.2fr', gap: '12px' }}>
                <div className="form-group">
                  <label>{t('Username')}</label>
                  <input type="text" className="form-control" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder={t('Enter username')} />
                </div>
                <div className="form-group">
                  <label>{t('Password')}</label>
                  <input type="password" className="form-control" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('Enter password')} />
                </div>
                <div className="form-group">
                  <label>{t('Role')}</label>
                  <select className="form-control" value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}>
                    <option value="user">{t('User')}</option>
                    <option value="admin">{t('Admin')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('User Software License')}</label>
                  <select className="form-control" value={newLicenseNumberAssoc} onChange={(e) => setNewLicenseNumberAssoc(e.target.value)}>
                    <option value="">{t('-- Select License --')}</option>
                    {licensees.map(l => (
                      <option key={l.license_number} value={l.license_number}>{l.company_name} ({l.license_number})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-primary" onClick={handleCreateUser}>
                  <Plus size={16} /> {t('Create User')}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>
                  <X size={16} /> {t('Cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Users Table */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} />
                {t('Registered Users')} ({users.length})
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setShowChangePassword(!showChangePassword)} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                  <Key size={14} />
                  <span>{t('Change Password')}</span>
                </button>
                <button className="btn btn-primary" onClick={() => setShowCreateForm(!showCreateForm)} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                  <UserPlus size={14} />
                  <span>{t('New User')}</span>
                </button>
              </div>
            </div>

            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>ID</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Username')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Role')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Software License')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Created')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Last Login')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.filter(u => u.id != null).map((u) => (
                  <tr key={String(u.id)} style={{ borderBottom: '1px solid var(--color-border, #222)' }}>
                    {editingId !== null && editingId === u.id ? (
                      <>
                        <td style={{ padding: '10px 12px' }}>{u.id || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <input type="text" className="form-control" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <select className="form-control" value={editRole} onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>
                            <option value="user">{t('User')}</option>
                            <option value="admin">{t('Admin')}</option>
                          </select>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <select className="form-control" value={editLicenseNumberAssoc} onChange={(e) => setEditLicenseNumberAssoc(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.85rem', width: '100%' }}>
                            <option value="">{t('-- Select License --')}</option>
                            {licensees.filter(l => l.id != null).map(l => (
                              <option key={l.license_number} value={l.license_number}>{l.company_name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '10px 12px' }} colSpan={2}>
                          <input type="password" className="form-control" placeholder={t('New password (optional)')} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleEditUser(u.id)}>
                              <Save size={14} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setEditingId(null)}>
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{u.id || '-'}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {u.username}
                          {u.id === currentUser?.id && (
                            <span style={{ marginLeft: '8px', fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(212, 168, 67, 0.2)', color: 'var(--color-accent-gold, #d4a843)', borderRadius: '4px' }}>{t('YOU')}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: u.role === 'admin' ? 'rgba(212, 168, 67, 0.2)' : 'rgba(91, 155, 213, 0.2)',
                            color: u.role === 'admin' ? 'var(--color-accent-gold, #d4a843)' : 'var(--color-accent-blue, #5b9bd5)',
                          }}>
                            {u.role === 'admin' ? <ShieldCheck size={13} /> : <Shield size={13} />}
                            {u.role === 'admin' ? t('ADMIN') : t('USER')}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.82rem' }}>
                          {(() => {
                            if (u.license_number === 'Admin') {
                              return <span style={{ fontWeight: 600 }}>{t('Admin')}</span>;
                            }
                            const match = licensees.find(l => l.license_number === u.license_number);
                            if (match) {
                              return <span style={{ fontWeight: 600 }}>{match.company_name}</span>;
                            }
                            if (u.license_number) {
                              return <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.license_number}</span>;
                            }
                            return u.role === 'user' ? (
                              <span className="text-secondary" style={{ fontStyle: 'italic', color: '#f87171' }}>{t('NO LICENSE')}</span>
                            ) : (
                              <span className="text-secondary">—</span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.82rem', opacity: 0.8 }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.82rem', opacity: 0.8 }}>
                          {u.last_login ? new Date(u.last_login).toLocaleString() : t('Never')}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => {
                                setEditingId(u.id);
                                setEditUsername(u.username);
                                setEditRole(u.role);
                                setEditPassword('');
                                setEditLicenseNumberAssoc(u.license_number || '');
                              }}
                              title={t('Edit user')}
                            >
                              <Edit3 size={14} />
                            </button>
                            {u.id !== currentUser?.id && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.8rem', color: '#ef4444' }}
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                title={t('Delete user')}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeAdminTab === 'licensees' && (
        <>
          {/* Create Licensee Form */}
          {showLicenseForm && (
            <div className="glass-card" style={{ marginBottom: '16px', borderTop: '3px solid var(--color-accent-gold, #d4a843)' }}>
              <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={20} className="text-gold" />
                {t('Register New Licensee')}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px' }}>
                <div className="form-group">
                  <label>{t('Company Name')}</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newCompanyName} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewCompanyName(val);
                      if (!isLicenseeNameManuallyEdited) {
                        setNewLicenseeName(val);
                      }
                    }} 
                    placeholder={t('Enter company name')} 
                  />
                </div>
                <div className="form-group">
                  <label>{t('Licensee Name')}</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newLicenseeName} 
                    onChange={(e) => {
                      setNewLicenseeName(e.target.value);
                      setIsLicenseeNameManuallyEdited(true);
                    }} 
                    placeholder={t('Enter licensee name')} 
                  />
                </div>
                <div className="form-group">
                  <label>{t('License Number')}</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={newLicenseNumber} 
                      onChange={(e) => setNewLicenseNumber(e.target.value)} 
                      placeholder={t('LIC-XXXX-XXXX')} 
                      style={{ fontFamily: 'monospace', flex: 1 }}
                    />
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={() => {
                        const randomKey = 'LIC-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
                        setNewLicenseNumber(randomKey);
                      }}
                    >
                      {t('Generate')}
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-primary" onClick={handleCreateLicensee}>
                  <Plus size={16} /> {t('Register Licensee')}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowLicenseForm(false)}>
                  <X size={16} /> {t('Cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Licensees Table */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={20} />
                {t('Registered Software Licensees')} ({licensees.length})
              </h3>
              <button className="btn btn-primary" onClick={() => setShowLicenseForm(!showLicenseForm)} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                <Plus size={14} />
                <span>{t('New Licensee')}</span>
              </button>
            </div>

            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>ID</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Panel Logo')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Company Name')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Licensee Name')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('License Number')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Registered')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid var(--color-border, #333)' }}>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {licensees.filter(l => l.license_number).map((l) => (
                  <tr key={l.license_number} style={{ borderBottom: '1px solid var(--color-border, #222)' }}>
                    {editLicenseeId !== null && editLicenseeId === l.id ? (
                      <>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{l.id || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <LicenseeLogoPreview logoData={l.logo_data} name={l.company_name} />
                            <label className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.78rem', cursor: 'pointer' }}>
                              <Upload size={14} />
                              <span>{t('Upload')}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                aria-label={`Upload panel logo for ${l.company_name}`}
                                style={{ display: 'none' }}
                                onChange={event => {
                                  const file = event.target.files?.[0] ?? null;
                                  event.target.value = '';
                                  if (file) void handleLicenseeLogoChange(l.id!, file);
                                }}
                              />
                            </label>
                            {l.logo_data && (
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.78rem' }} onClick={() => void handleLicenseeLogoChange(l.id!, null)}>
                                {t('Remove')}
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <input type="text" className="form-control" value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <input type="text" className="form-control" value={editLicenseeName} onChange={(e) => setEditLicenseeName(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.85rem' }} />
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-accent-blue)' }}>{l.license_number}</td>
                        <td style={{ padding: '10px 12px', fontSize: '0.82rem', opacity: 0.8 }}>
                          {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleEditLicensee(l.id!)}>
                              <Save size={14} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setEditLicenseeId(null)}>
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{l.id || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <LicenseeLogoPreview logoData={l.logo_data} name={l.company_name} />
                            <label className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.78rem', cursor: 'pointer' }}>
                              <Upload size={14} />
                              <span>{t('Upload')}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                aria-label={`Upload panel logo for ${l.company_name}`}
                                style={{ display: 'none' }}
                                onChange={event => {
                                  const file = event.target.files?.[0] ?? null;
                                  event.target.value = '';
                                  if (file) void handleLicenseeLogoChange(l.id!, file);
                                }}
                              />
                            </label>
                            {l.logo_data && (
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.78rem' }} onClick={() => void handleLicenseeLogoChange(l.id!, null)}>
                                {t('Remove')}
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{l.company_name}</td>
                        <td style={{ padding: '10px 12px' }}>{l.licensee_name}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-accent-blue)' }}>{l.license_number}</td>
                        <td style={{ padding: '10px 12px', fontSize: '0.82rem', opacity: 0.8 }}>
                          {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => {
                                if (!l.id) {
                                  showMessage(t('Cannot edit this record: missing ID. Try refreshing the page.'), 'error');
                                  return;
                                }
                                setEditLicenseeId(l.id);
                                setEditCompanyName(l.company_name);
                                setEditLicenseeName(l.licensee_name);
                              }}
                              title={t('Edit licensee')}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem', color: '#ef4444' }}
                              onClick={() => {
                                if (!l.id) {
                                  showMessage(t('Cannot delete this record: missing ID. Try refreshing the page.'), 'error');
                                  return;
                                }
                                handleDeleteLicensee(l.id, l.company_name);
                              }}
                              title={t('Delete licensee')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {licensees.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>
                      {t('No registered software licensees found.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
