import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import type { CustomSectionDef } from '../../App';
import '../../BasicUI.css';

const t = (val: string) => val;

interface BasicLayoutProps {
  onSwitchUi: () => void;
  onLogout?: () => void;
  isAdmin?: boolean;
  customSections?: CustomSectionDef[];
  children: React.ReactNode;
}

export const BasicLayout: React.FC<BasicLayoutProps> = ({ onSwitchUi, onLogout, isAdmin, customSections = [], children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [time, setTime] = useState<string>('');
  const { user } = useAuth();
  
  // Dropdown visibility states
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      // Format: 26 May 2026 11:17:36 AM
      const day = now.getDate();
      const month = now.toLocaleDateString([], { month: 'short' });
      const year = now.getFullYear();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      setTime(`${day} ${month} ${year} ${timeStr}`);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleMenuClick = (menu: string, path?: string) => {
    setActiveDropdown(activeDropdown === menu ? null : menu);
    if (path) {
      navigate(path);
      setActiveDropdown(null);
    }
  };

  const handleSubMenuClick = (path: string) => {
    navigate(path);
    setActiveDropdown(null);
  };

  const handleQuit = () => {
    if (onLogout) {
      onLogout();
    } else {
      alert(t('Securing software session. Exiting PS-Billing... Thank you!'));
      navigate('/');
    }
    setActiveDropdown(null);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: '100vh', 
      background: '#e7ded0', 
      color: '#000000', 
      fontFamily: 'Tahoma, Arial, sans-serif',
      fontSize: '0.85rem'
    }}>
      
      {/* 1. BLUE CLASSIC TITLE BAR */}
      <div style={{
        background: 'linear-gradient(90deg, #0a246a 0%, #a6caf0 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'between',
        padding: '3px 8px',
        fontWeight: 'bold',
        fontSize: '0.85rem',
        userSelect: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Windows Mini-Logo Square */}
          <div style={{
            width: '12px',
            height: '12px',
            background: '#ffffff',
            border: '1px solid #000000',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '1px',
            padding: '1px'
          }}>
            <div style={{ background: '#ff4c4c' }}></div>
            <div style={{ background: '#4cff4c' }}></div>
            <div style={{ background: '#4c4cff' }}></div>
            <div style={{ background: '#ffff4c' }}></div>
          </div>
          <span>{t('PS - Billing')}</span>
        </div>
        <button 
          className="classic-btn"
          onClick={onSwitchUi}
          style={{
            padding: '1px 8px',
            fontSize: '0.75rem',
            marginLeft: 'auto',
            background: '#d4d0c8',
            color: '#000000'
          }}
        >
          {t('Switch to Modern UI')}
        </button>
      </div>

      {/* 2. HORIZONTAL WINDOWS CLASSIC MENU BAR */}
      <div style={{
        background: '#d4d0c8',
        borderBottom: '2px solid #808080',
        display: 'flex',
        padding: '2px 4px',
        position: 'relative',
        zIndex: 999
      }}>
        <div style={{ display: 'flex', gap: '2px' }}>
          
          <button 
            className="classic-btn" 
            onClick={() => handleMenuClick('dashboard', '/')}
            style={{ border: activeDropdown === 'dashboard' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
          >
            {t('Dashboard')}
          </button>

          {/* Masters Dropdown */}
          <div style={{ position: 'relative' }}>
            <button 
              className="classic-btn"
              onClick={() => handleMenuClick('masters')}
              style={{ border: activeDropdown === 'masters' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
            >
              {t('Masters')}
            </button>
            {activeDropdown === 'masters' && (
              <div className="classic-bevel-out" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#d4d0c8',
                minWidth: '200px',
                zIndex: 1000,
                padding: '2px'
              }}>
                {[
                  { name: t('Item Group'), path: '/master/item-group' },
                  { name: t('Item Master'), path: '/master/item-master' },
                  { name: t('Customer Master'), path: '/master/customer-master' },
                  { name: t('Supplier Master'), path: '/master/supplier-master' },
                  { name: t('Sales Executive Master'), path: '/master/sales-executive' },
                  { name: t('Company Staff Details'), path: '/master/company-staff' },
                  { name: t('Weg Stock Opening Balance'), path: '/weg-stock/entry' },
                  { name: t('Expenses Group'), path: '/master/expenses-group' },
                ].map((sub, i) => (
                  <div 
                    key={i}
                    className="classic-listbox-item"
                    onClick={() => handleSubMenuClick(sub.path)}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  >
                    {sub.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            className="classic-btn"
            onClick={() => handleMenuClick('dailyExpenses', '/daily-expenses')}
            style={{ border: activeDropdown === 'dailyExpenses' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
          >
            {t('Daily Expenses')}
          </button>

          <button 
            className="classic-btn"
            onClick={() => handleMenuClick('purchase', '/purchase')}
            style={{ border: activeDropdown === 'purchase' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
          >
            {t('Purchase')}
          </button>

          <button 
            className="classic-btn"
            onClick={() => handleMenuClick('quotation', '/quotation')}
            style={{ border: activeDropdown === 'quotation' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
          >
            {t('Quotation')}
          </button>

          {/* Sales Dropdown */}
          <div style={{ position: 'relative' }}>
            <button 
              className="classic-btn"
              onClick={() => handleMenuClick('sales')}
              style={{ border: activeDropdown === 'sales' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
            >
              {t('Sales')}
            </button>
            {activeDropdown === 'sales' && (
              <div className="classic-bevel-out" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#d4d0c8',
                minWidth: '180px',
                zIndex: 1000,
                padding: '2px'
              }}>
                {[
                   { name: t('Purchase Order'), path: '/section/purchase-order' },
                   { name: t('Proforma Invoice'), path: '/section/proforma-invoice' },
                   { name: t('Sales Order'), path: '/section/sales-order' },
                   { name: t('Sales Order - Cancellation'), path: '/sales' },
                   { name: t('Sales Invoice'), path: '/sales' },
                   ...customSections.filter(s => !['purchase-order','proforma-invoice','sales-order'].includes(s.slug)).map(s => ({
                     name: s.name, path: `/section/${s.slug}`
                   }))
                 ].map((sub, i) => (
                  <div 
                    key={i}
                    className="classic-listbox-item"
                    onClick={() => handleSubMenuClick(sub.path)}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  >
                    {sub.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            className="classic-btn"
            onClick={() => handleMenuClick('payments', '/payments')}
            style={{ border: activeDropdown === 'payments' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
          >
            {t('Payment')}
          </button>

          {/* Weg Stock Dropdown */}
          <div style={{ position: 'relative' }}>
            <button 
              className="classic-btn"
              onClick={() => handleMenuClick('wegstock')}
              style={{ border: activeDropdown === 'wegstock' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
            >
              {t('Weg Stock')}
            </button>
            {activeDropdown === 'wegstock' && (
              <div className="classic-bevel-out" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#d4d0c8',
                minWidth: '160px',
                zIndex: 1000,
                padding: '2px'
              }}>
                {[
                  { name: t('Weg Stock Entry'), path: '/weg-stock/entry' },
                  { name: t('Weg Stock Receipt'), path: '/weg-stock/receipt' },
                  { name: t('Weg Stock Issue'), path: '/weg-stock/issue' },
                  { name: t('View Weg Stock'), path: '/weg-stock' },
                ].map((sub, i) => (
                  <div 
                    key={i}
                    className="classic-listbox-item"
                    onClick={() => handleSubMenuClick(sub.path)}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  >
                    {sub.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reports Dropdown */}
          <div style={{ position: 'relative' }}>
            <button 
              className="classic-btn"
              onClick={() => handleMenuClick('reports')}
              style={{ border: activeDropdown === 'reports' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
            >
              {t('Reports')}
            </button>
            {activeDropdown === 'reports' && (
              <div className="classic-bevel-out" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#d4d0c8',
                minWidth: '160px',
                zIndex: 1000,
                padding: '2px'
              }}>
                {[
                  { name: t('Purchase Statement'), path: '/reports/purchase' },
                  { name: t('Sales Statement'), path: '/reports/sales' },
                  { name: t('GST Reports'), path: '/reports/gst' },
                ].map((sub, i) => (
                  <div 
                    key={i}
                    className="classic-listbox-item"
                    onClick={() => handleSubMenuClick(sub.path)}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  >
                    {sub.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            className="classic-btn"
            onClick={() => handleMenuClick('options', '/settings')}
            style={{ border: activeDropdown === 'options' ? '1px inset #808080' : 'none', boxShadow: 'none' }}
          >
            {t('Options')}
          </button>

          {isAdmin && (
            <button 
              className="classic-btn"
              onClick={() => handleMenuClick('admin', '/admin')}
              style={{ border: activeDropdown === 'admin' ? '1px inset #808080' : 'none', boxShadow: 'none', color: '#8B0000', fontWeight: 'bold' }}
            >
              {t('Admin')}
            </button>
          )}
        </div>

        <button 
          className="classic-btn" 
          onClick={handleQuit}
          style={{ marginLeft: 'auto', color: 'red', fontWeight: 'bold' }}
        >
          {onLogout ? t('Logout') : t('Quit')}
        </button>
      </div>

      {/* 3. SUB-HEADER YELLOW DIGITAL STATUS BAR */}
      <div style={{
        background: '#1c1c1c',
        color: '#ffdd44',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 12px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
        borderBottom: '2px solid #000000',
        userSelect: 'none'
      }}>
        <span>{t('2026 - 2027')}</span>
        <span style={{ fontStyle: 'italic', color: '#ffdd44', fontSize: '0.9rem' }}>{t('PS - Billing')}</span>
        <span style={{ fontFamily: 'monospace' }}>{time}</span>
      </div>

      {/* 4. MAIN CENTRAL CONTENT */}
      <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#c0c0c0' }} className="classic-red-layout-global">
        <div className="classic-red-title">
          <h2>{t(
            location.pathname.startsWith('/master') ? 'Master Control' :
            location.pathname === '/purchase' ? 'Purchase' :
            location.pathname === '/sales' ? 'Sales Invoicing' :
            location.pathname === '/quotation' ? 'Quotation' :
            location.pathname === '/payments' ? 'Payments & Receipts' :
            location.pathname.startsWith('/weg-stock') ? 'Weg Stock' :
            location.pathname === '/daily-expenses' ? 'Daily Expenses' :
            location.pathname.startsWith('/reports') ? 'Financial Intelligence Reports' :
            location.pathname === '/settings' ? 'Settings' :
            location.pathname === '/admin' ? 'Admin Control' :
            location.pathname.startsWith('/section/') ? 
              (customSections.find(s => `/section/${s.slug}` === location.pathname)?.name || 'Document') :
            'Dashboard'
          )}</h2>
        </div>
        <div className="classic-red-outer-box">
          <div className="classic-red-inner-box classic-scroll-content">
            {children}
          </div>
        </div>
      </div>

      {/* 5. DEEP BLUE LICENSEE STATUS RIBBON FOOTER */}
      <footer style={{
        background: '#000080',
        color: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 10px',
        fontSize: '0.75rem',
        borderTop: '2px solid #808080',
        userSelect: 'none'
      }}>
        <span>{t(`Licencee : ${user?.license_number === 'Admin' ? 'Admin' : (user?.licensee_company_name || 'SMR TRADING AND COMPANY')}`)}</span>
        <span>{t('Designed and Developed BY : Puspharaj M, Puducherry, India. email : Puspharaj.m2003@gmail.com.')}</span>
      </footer>

    </div>
  );
};

export default BasicLayout;
