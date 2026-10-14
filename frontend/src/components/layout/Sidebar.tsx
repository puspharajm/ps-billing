import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Database, ShoppingCart, TrendingUp, FileText, CreditCard, Package, BarChart2, FileBarChart, Settings, ShieldCheck, LogOut, Layers, Download } from 'lucide-react';
import type { CustomSectionDef } from '../../App';
import './Sidebar.css';

const t = (val: string) => val;

const menuItems = [
  { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { path: '/master', name: 'Master Control', icon: <Database size={20} /> },
  { path: '/purchase', name: 'Purchase', icon: <ShoppingCart size={20} /> },
  { path: '/sales', name: 'Sales', icon: <TrendingUp size={20} /> },
  { path: '/quotation', name: 'Quotation', icon: <FileText size={20} /> },
  { path: '/payments', name: 'Payments', icon: <CreditCard size={20} /> },
  { path: '/weg-stock', name: 'Weg Stock', icon: <Package size={20} /> },
  { path: '/daily-expenses', name: 'Daily Expenses', icon: <CreditCard size={20} /> },
  { path: '/reports', name: 'Reports', icon: <BarChart2 size={20} /> },
  { path: '/reports/purchase', name: 'Purchase Statement', icon: <FileText size={20} /> },
  { path: '/reports/sales', name: 'Sales Statement', icon: <FileText size={20} /> },
  { path: '/reports/gst', name: 'GST Reports', icon: <FileBarChart size={20} /> },
  { path: '/settings', name: 'Settings', icon: <Settings size={20} /> },
];



interface SidebarProps {
  isAdmin?: boolean;
  onLogout?: () => void;
  customSections?: CustomSectionDef[];
}

export const Sidebar: React.FC<SidebarProps> = ({ isAdmin, onLogout, customSections = [] }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <img src="/logo.jpg" alt="SMR Groups" style={{ height: '40px', width: '40px', objectFit: 'cover', borderRadius: '50%' }} />
        <h2 className="brand" style={{ margin: 0 }}>{t('SMR')} <span className="text-gold">{t('Groups')}</span></h2>
      </div>
      <nav className="sidebar-nav">
        <ul>
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink 
                to={item.path} 
                end={item.path === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {item.icon}
                <span>{t(item.name)}</span>
              </NavLink>
            </li>
          ))}

          {/* Dynamic Custom Sections */}
          {customSections.length > 0 && (
            <>
              <li>
                <div style={{ 
                  padding: '0.5rem 1rem 0.25rem', 
                  fontSize: '0.7rem', 
                  fontWeight: 700, 
                  textTransform: 'uppercase', 
                  letterSpacing: '1px', 
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '0.5rem',
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: '0.75rem'
                }}>
                  <Layers size={12} />
                  Documents
                </div>
              </li>
              {customSections.map(sec => (
                <li key={sec.slug}>
                  <NavLink
                    to={`/section/${sec.slug}`}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    style={({ isActive }) => isActive ? { borderColor: sec.color, color: sec.color } : {}}
                  >
                    <FileText size={20} style={{ color: sec.color }} />
                    <span>{t(sec.name)}</span>
                  </NavLink>
                </li>
              ))}
            </>
          )}

          {isAdmin && (
            <li>
              <NavLink 
                to="/admin" 
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <ShieldCheck size={20} />
                <span>{t('Admin Panel')}</span>
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      {/* Logout Button */}
      {onLogout && (
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', marginTop: 'auto' }}>
          <button
            onClick={onLogout}
            className="nav-link"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--border-radius-md)',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
          >
            <LogOut size={18} />
            <span>{t('Logout')}</span>
          </button>
        </div>
      )}
      {/* Download Desktop App Button */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', marginTop: onLogout ? 0 : 'auto' }}>
        <a
          href="https://github.com/puspharajm/ps-billing/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="nav-link"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--border-radius-md)',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            textDecoration: 'none'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
        >
          <Download size={18} />
          <span>{t('Download App')}</span>
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
