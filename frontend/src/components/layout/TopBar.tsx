import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Calendar, Clock, Award, ShieldCheck, LogOut } from 'lucide-react';
import './TopBar.css';

const t = (val: string) => val;

interface TopBarProps {
  companyName: string;
  gstin: string;
  onSwitchUi?: () => void;
  onLogout?: () => void;
}

const LABELS = {
  GSTIN_PREFIX: 'GSTIN: ',
  SECURE_NODE: 'Secure Node',
  DEFAULT_TITLE: 'PS-billing Control Panel',
};


export const TopBar: React.FC<TopBarProps> = ({ companyName, gstin, onSwitchUi, onLogout }) => {
  const location = useLocation();
  
  let title = LABELS.DEFAULT_TITLE;
  switch (location.pathname) {
    case '/':
      title = 'Dashboard Overview';
      break;
    case '/master':
      title = 'Master Control Center';
      break;
    case '/purchase':
      title = 'Purchase Ledger & POs';
      break;
    case '/sales':
      title = 'Sales Tax Invoicing';
      break;
    case '/quotation':
      title = 'Quotation & Estimates';
      break;
    case '/payments':
      title = 'Payments Cashbook';
      break;
    case '/weg-stock':
      title = 'WEG Electric Motor Inventory';
      break;
    case '/reports':
      title = 'Financial Intelligence Reports';
      break;
    case '/reports/gst':
      title = 'GST Returns & Audit Registers';
      break;
    case '/settings':
      title = 'Enterprise Profile Settings';
      break;
    case '/admin':
      title = 'Super Admin Panel';
      break;
  }

  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setDate(now.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="page-title">{title}</h1>
        <div className="enterprise-badge">
          <Award size={14} className="text-gold" />
          <span>{companyName}</span>
          {gstin && <span className="gstin-badge">{LABELS.GSTIN_PREFIX}{gstin}</span>}
        </div>
      </div>
      <div className="topbar-right">
        <div className="time-widget">
          <div className="datetime-item">
            <Calendar size={15} className="text-blue" />
            <span>{date}</span>
          </div>
          <div className="datetime-item">
            <Clock size={15} className="text-gold" />
            <span className="clock-glowing">{time}</span>
          </div>
        </div>
        <div className="status-badge" style={{ display: 'flex', alignItems: 'center' }}>
          <ShieldCheck size={16} className="text-green" />
          <span>{LABELS.SECURE_NODE}</span>
        </div>
        {onSwitchUi && (
          <button 
            onClick={onSwitchUi}
            style={{
              marginLeft: '12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '3px 10px',
              backgroundColor: 'rgba(212, 208, 200, 0.15)',
              border: '1px solid var(--color-accent-gold)',
              color: 'var(--color-accent-gold)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-accent-gold)';
              e.currentTarget.style.color = '#000000';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(212, 208, 200, 0.15)';
              e.currentTarget.style.color = 'var(--color-accent-gold)';
            }}
          >
            {t('Classic UI')}
          </button>
        )}
        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              marginLeft: '8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '3px 10px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
            }}
          >
            <LogOut size={13} />
            {t('Logout')}
          </button>
        )}
      </div>
    </header>
  );
};
export default TopBar;
