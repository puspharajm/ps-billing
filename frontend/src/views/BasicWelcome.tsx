import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import type { CompanySettings } from '../App';
import { API_URL } from '../App';
import '../BasicUI.css';

const t = (val: string) => val;

interface BasicWelcomeProps {
  settings: CompanySettings;
}

export const BasicWelcome: React.FC<BasicWelcomeProps> = ({ settings }) => {
  const { user, authFetch } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<any[]>([]);

  // Determine logo profile
  const isGroups = user?.username === 'smrgroups' || settings?.company_name?.toLowerCase().includes('groups');
  const isTN = user?.username === 'smrtamilnadu' || settings?.company_name?.toLowerCase().includes('tamilnadu');
  const isPondy = user?.username === 'smrpondy' || settings?.company_name?.toLowerCase().includes('pondy');
  const isTrading = user?.username === 'SMR Trading and Company Pondy' || user?.username === 'smrtrading' || settings?.company_name?.toLowerCase().includes('trading');
  
  const isSuperAdmin = user?.role === 'admin' && user?.license_number === 'Admin';

  useEffect(() => {
    if (isSuperAdmin) {
      authFetch(`${API_URL}/admin/notifications`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setNotifications(Array.isArray(data) ? data : []))
        .catch(err => console.error("Failed to fetch notifications:", err));
    }
  }, [isSuperAdmin, authFetch]);

  // Check if profile is incomplete or still using default PS Robotix placeholder (unless Pondy tenant)
  const isProfileIncomplete = !settings?.company_name ||
                              (settings.company_name === 'PS Robotix' && user?.username !== 'smrpondy') ||
                              !settings.phone || 
                              settings.phone === '—' ||
                              !settings.email || 
                              settings.email === '—' ||
                              !settings.gstin || 
                              settings.gstin === 'NOT REGISTERED' ||
                              !settings.bank_name || 
                              settings.bank_name === '—' ||
                              !settings.account_number || 
                              settings.account_number === '—';

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', alignItems: 'center' }}>
      
      {/* Dynamic Profile Verification & Seeding Alert */}
      {isProfileIncomplete && (
        <div className="classic-bevel-out" style={{ 
          width: '100%', 
          maxWidth: '850px', 
          background: '#d4d0c8', 
          padding: '10px 15px', 
          border: '1px solid #fff' 
        }}>
          <div style={{ 
            background: 'linear-gradient(90deg, #d4a373 0%, #d4d0c8 100%)', 
            color: '#000000', 
            padding: '4px 8px', 
            fontWeight: 'bold', 
            fontSize: '0.85rem',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>⚠️</span> {t('ENTERPRISE PROFILE STATUS: ATTENTION REQUIRED')}
          </div>
          <div style={{ fontSize: '0.82rem', lineHeight: '1.4', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ margin: 0 }}>
              {t('Your enterprise company profile has incomplete or default settings details (GSTIN, Phone, Address, or Banking details). Please configure your authentic company details so that they print correctly on all purchase orders, quotations, and sales invoices.')}
            </p>
            <div>
              <button 
                className="classic-btn" 
                onClick={() => navigate('/settings')}
                style={{ 
                  padding: '3px 12px', 
                  fontFamily: 'monospace', 
                  fontWeight: 'bold', 
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  color: '#800000'
                }}
              >
                {t('[!] CONFIGURE COMPANY PROFILE NOW')}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Main Matrix Bevel Box */}
      <div className="classic-bevel-out" style={{ width: '100%', maxWidth: '850px', background: '#d4d0c8', padding: '1.2rem' }}>
        
        {/* Upper Header: Logo & Company Name */}
        <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '2px dashed #808080', paddingBottom: '0.8rem' }}>
          {/* Brand Logo box */}
          <div className="classic-bevel-in" style={{ 
            width: '80px', 
            height: '80px', 
            background: '#ffffff', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            {isSuperAdmin ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#000000', color: '#ffcc00', fontWeight: 'bold' }}>
                <span style={{ fontSize: '1.1rem', letterSpacing: '1px' }}>{t('ADMIN')}</span>
                <span style={{ fontSize: '0.55rem', background: '#333', padding: '1px 3px', marginTop: '1px', color: '#fff' }}>{t('CREATOR')}</span>
              </div>
            ) : isGroups ? (
              <img src="/logo.jpg" alt="SMR Groups" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : isTN ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#000080', color: '#fff', fontWeight: 'bold' }}>
                <span style={{ fontSize: '1.4rem', letterSpacing: '1px' }}>{t('SMR')}</span>
                <span style={{ fontSize: '0.6rem', background: '#ff4c4c', padding: '1px 3px', marginTop: '1px' }}>{t('TAMILNADU')}</span>
              </div>
            ) : isPondy ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#800000', color: '#fff', fontWeight: 'bold' }}>
                <span style={{ fontSize: '1.4rem', letterSpacing: '1px' }}>{t('SMR')}</span>
                <span style={{ fontSize: '0.6rem', background: '#e68a00', padding: '1px 3px', marginTop: '1px', color: '#000' }}>{t('PONDY')}</span>
              </div>
            ) : isTrading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#008080', color: '#fff', fontWeight: 'bold' }}>
                <span style={{ fontSize: '1.4rem', letterSpacing: '1px' }}>{t('SMR')}</span>
                <span style={{ fontSize: '0.6rem', background: '#d4a373', padding: '1px 3px', marginTop: '1px', color: '#000' }}>{t('TRADING')}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#808080', color: '#fff', fontWeight: 'bold' }}>
                <span style={{ fontSize: '1.4rem' }}>{t('SMR')}</span>
                <span style={{ fontSize: '0.6rem' }}>{t('OFFLINE')}</span>
              </div>
            )}
          </div>

          {/* Company Brand details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <h1 style={{ 
              margin: 0, 
              color: isSuperAdmin ? 'var(--classic-text-blue, #000080)' : 'var(--classic-text-red, #800000)', 
              fontFamily: '"Times New Roman", Times, serif', 
              fontWeight: 'bold', 
              fontSize: '2rem',
              lineHeight: '1.1'
            }}>
              {isSuperAdmin ? t('SMR Matrix Workstation') : settings.company_name}
            </h1>
            <p style={{ margin: 0, color: isSuperAdmin ? '#505050' : 'var(--classic-text-blue, #000080)', fontWeight: 'bold', fontSize: '0.85rem' }}>
              {isSuperAdmin ? t('Super-Admin Control & Diagnostics Console') : t('Advanced Enterprise Inventory & Automated Billing Console')}
            </p>
          </div>
        </div>

        {isSuperAdmin ? (
          <>
            {/* Creator Profile Matrix */}
            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', fontWeight: 'bold', color: '#303030' }}>
              {t('Ⅰ. CREATOR PROFILE MATRIX')}
            </h3>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.2rem', fontSize: '0.8rem' }}>
              <tbody>
                <tr>
                  <td style={{ width: '160px', background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Creator Name')}</td>
                  <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontWeight: 'bold' }}>
                    {t('Puspharaj M.')}
                  </td>
                </tr>
                <tr>
                  <td style={{ background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('System Identity')}</td>
                  <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontWeight: 'bold' }}>
                    {t('SMR Matrix Workstation')}
                  </td>
                  <td style={{ background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Access Level')}</td>
                  <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontWeight: 'bold', color: '#800000' }}>
                    {t('SUPER ADMIN')}
                  </td>
                </tr>
                <tr>
                  <td style={{ background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Contact & Support')}</td>
                  <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080' }}>
                    <strong>{t('Email:')}</strong> puspharaj.m2003@gmail.com
                  </td>
                </tr>
                <tr>
                  <td style={{ background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Location')}</td>
                  <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontStyle: 'italic' }}>
                    {t('Visakhapatnam / Puducherry, India')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Global Engine Status Matrix */}
            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', fontWeight: 'bold', color: '#303030' }}>
              {t('Ⅱ. GLOBAL MATRIX ENGINE STATUS')}
            </h3>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <tbody>
                <tr>
                  <td style={{ width: '160px', background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Core Engine')}</td>
                  <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080' }}>
                    {t('Seychelles Matrix v1.0.1')}
                  </td>
                  <td style={{ width: '150px', background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Database Driver')}</td>
                  <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontWeight: 'bold', color: '#008000' }}>
                    {t('ONLINE (ACTIVE)')}
                  </td>
                </tr>
                <tr>
                  <td style={{ background: '#000080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('System Diagnostics')}</td>
                  <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080' }}>
                    {t('ALL SYSTEMS NOMINAL')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Live System Notifications */}
            <h3 style={{ margin: '1rem 0 0.4rem 0', fontSize: '0.82rem', fontWeight: 'bold', color: '#303030' }}>
              {t('Ⅲ. LIVE SYSTEM NOTIFICATIONS')}
            </h3>
            
            <div className="classic-bevel-in" style={{ width: '100%', height: '180px', overflowY: 'auto', background: '#fff', padding: '0', border: '1px solid #808080', fontSize: '0.8rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#d4d0c8', zIndex: 1 }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #808080', borderRight: '1px solid #c0c0c0', width: '130px' }}>{t('Timestamp')}</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #808080', borderRight: '1px solid #c0c0c0', width: '150px' }}>{t('Tenant / User')}</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #808080' }}>{t('Event Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '8px', fontStyle: 'italic', color: '#666' }}>{t('No recent notifications.')}</td>
                    </tr>
                  ) : (
                    notifications.map(n => (
                      <tr key={n.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                        <td style={{ padding: '4px 8px', color: '#666', borderRight: '1px solid #e0e0e0' }}>
                          {new Date(n.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '4px 8px', fontWeight: 'bold', color: '#000080', borderRight: '1px solid #e0e0e0' }}>
                          {n.tenant_name} ({n.username})
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <strong style={{ color: '#800000' }}>[{n.action}]</strong> {n.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </>
        ) : (
          <>
        {/* Matrix Grid (Properties Sheet style) */}
        <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', fontWeight: 'bold', color: '#303030' }}>
          {t('Ⅰ. ENTERPRISE PROFILE MATRIX')}
        </h3>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.2rem', fontSize: '0.8rem' }}>
          <tbody>
            <tr>
              <td style={{ width: '160px', background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Brand Name')}</td>
              <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontWeight: 'bold' }}>
                {settings.company_name}
              </td>
            </tr>
            <tr>
              <td style={{ background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('GSTIN / GST Number')}</td>
              <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontFamily: 'monospace', fontWeight: 'bold', color: '#008000' }}>
                {settings.gstin || t('NOT REGISTERED')}
              </td>
              <td style={{ background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('State & Code')}</td>
              <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontWeight: 'bold' }}>
                {settings.state} ({settings.state_code})
              </td>
            </tr>
            <tr>
              <td style={{ background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Communication Details')}</td>
              <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080' }}>
                <strong>{t('Phone:')}</strong> {settings.phone || '—'} &nbsp;|&nbsp; <strong>{t('Email:')}</strong> {settings.email || '—'}
              </td>
            </tr>
            <tr>
              <td style={{ background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Registered Address')}</td>
              <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontStyle: 'italic' }}>
                {settings.address}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Bank & Financial Matrix */}
        <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', fontWeight: 'bold', color: '#303030' }}>
          {t('Ⅱ. TREASURY & BANKING SETTINGS')}
        </h3>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <tbody>
            <tr>
              <td style={{ width: '160px', background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Bank Name')}</td>
              <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080' }}>
                {settings.bank_name || '—'}
              </td>
              <td style={{ width: '150px', background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('IFSC Code')}</td>
              <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontFamily: 'monospace', fontWeight: 'bold' }}>
                {settings.ifsc_code || '—'}
              </td>
            </tr>
            <tr>
              <td style={{ background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Account Title')}</td>
              <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080' }}>
                {settings.account_name || '—'}
              </td>
              <td style={{ background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Account Number')}</td>
              <td className="classic-bevel-in" style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080', fontFamily: 'monospace', fontWeight: 'bold' }}>
                {settings.account_number || '—'}
              </td>
            </tr>
            <tr>
              <td style={{ background: '#808080', color: '#fff', padding: '5px 8px', fontWeight: 'bold', border: '1px solid #c0c0c0' }}>{t('Branch Name')}</td>
              <td className="classic-bevel-in" colSpan={3} style={{ padding: '5px 8px', background: '#fff', border: '1px solid #808080' }}>
                {settings.branch || '—'}
              </td>
            </tr>
          </tbody>
        </table>
          </>
        )}

      </div>
      
      {/* Footer copyright stamp */}
      <div style={{ fontSize: '0.7rem', color: '#505050', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '0.3rem' }}>
        <span>{t('PS - Billing Console v1.0.1 • Seychelles Matrix Engine • Licensed for Offline Production')}</span>
        <span>{t('Designed and Developed by Puspharaj M. Visakhapatnam / Puducherry, India.')}</span>
      </div>

    </div>
  );
};

export default BasicWelcome;
