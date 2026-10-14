import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import BasicLayout from './components/layout/BasicLayout';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import BasicWelcome from './views/BasicWelcome';
import Master from './views/Master';
import Purchase from './views/Purchase';
import Sales from './views/Sales';
import Quotation from './views/Quotation';
import Payments from './views/Payments';
import WegStock from './views/WegStock';
import Reports from './views/Reports';
import Settings from './views/Settings';
import SuperAdmin from './views/SuperAdmin';
import { DailyExpenses } from './views/DailyExpenses';
import { CustomSection } from './views/CustomSection';
import { API_URL } from './api';
import './App.css';
import './BasicUI.css';

// Types matching backend
export interface CompanySettings {
  id: number;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  state_code: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  branch: string;
  terms_conditions: string;
  custom_print_layout?: string;
}

export interface CustomSectionDef {
  id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

export { API_URL } from './api';

function AppContent() {
  const { isAuthenticated, isLoading, isAdmin, logout, authFetch } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && !isAdmin && location.pathname === '/admin') {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, location.pathname, navigate]);

  const [settings, setSettings] = useState<CompanySettings>({
    id: 1,
    company_name: 'SMR Groups',
    address: 'Plot No. 45, Industrial Development Area, Visakhapatnam, Andhra Pradesh',
    phone: '+91 8899889988',
    email: 'billing@smrgroups.com',
    gstin: '37AAAAASMRG1Z9',
    state: 'Andhra Pradesh',
    state_code: '37',
    bank_name: 'State Bank of India',
    account_name: 'SMR GROUPS SOLUTIONS',
    account_number: '30099887766',
    ifsc_code: 'SBIN0004562',
    branch: 'Industrial Estate',
    terms_conditions: 'Standard terms apply.'
  });

  const [customSections, setCustomSections] = useState<CustomSectionDef[]>([]);

  const [uiMode, setUiMode] = useState<'modern' | 'basic'>(() => {
    return (localStorage.getItem('uiMode') as 'modern' | 'basic') || 'basic';
  });

  const fetchSettings = async () => {
    try {
      const res = await authFetch(`${API_URL}/settings`);
      if (res.ok) {
        const data = await res.json();
        if (data) setSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch settings from API. Using fallback defaults.', err);
    }
  };

  const fetchCustomSections = async () => {
    try {
      const res = await authFetch(`${API_URL}/custom-sections`);
      if (res.ok) setCustomSections(await res.json());
    } catch (err) {
      console.error('Failed to fetch custom sections', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
      fetchCustomSections();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('uiMode', uiMode);
    document.documentElement.setAttribute('data-ui-mode', uiMode);
  }, [uiMode]);

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="login-spinner" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // BASIC WINDOWS CLASSIC THEME WRAPPER
  if (uiMode === 'basic') {
    return (
      <BasicLayout onSwitchUi={() => setUiMode('modern')} onLogout={logout} isAdmin={isAdmin} customSections={customSections}>
        <Routes>
          <Route path="/" element={<BasicWelcome settings={settings} />} />
          <Route path="/master" element={<Master />} />
          <Route path="/master/item-group" element={<Master defaultTab="item-group" />} />
          <Route path="/master/item-master" element={<Master defaultTab="item-master" />} />
          <Route path="/master/customer-master" element={<Master defaultTab="customer-master" />} />
          <Route path="/master/supplier-master" element={<Master defaultTab="supplier-master" />} />
          <Route path="/master/sales-executive" element={<Master defaultTab="sales-executive" />} />
          <Route path="/master/company-staff" element={<Master defaultTab="company-staff" />} />
          <Route path="/master/expenses-group" element={<Master defaultTab="expenses-group" />} />
          <Route path="/purchase" element={<Purchase settings={settings} />} />
          <Route path="/sales" element={<Sales settings={settings} />} />
          <Route path="/quotation" element={<Quotation settings={settings} />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/weg-stock" element={<WegStock />} />
          <Route path="/weg-stock/entry" element={<WegStock defaultTab="entry" />} />
          <Route path="/weg-stock/receipt" element={<WegStock defaultTab="receipt" />} />
          <Route path="/weg-stock/issue" element={<WegStock defaultTab="issue" />} />
          <Route path="/daily-expenses" element={<DailyExpenses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/purchase" element={<Reports defaultTab="purchase-statement" />} />
          <Route path="/reports/sales" element={<Reports defaultTab="sales-statement" />} />
          <Route path="/reports/gst" element={<Reports defaultTab="gst-reports" />} />
          <Route path="/settings" element={<Settings onSettingsUpdate={fetchSettings} onSectionsUpdate={fetchCustomSections} />} />
          <Route path="/admin" element={isAdmin ? <SuperAdmin /> : <Dashboard />} />
          {customSections.map(sec => (
            <Route key={sec.slug} path={`/section/${sec.slug}`} element={
              <CustomSection settings={settings} sectionSlug={sec.slug} sectionName={sec.name} sectionColor={sec.color} />
            } />
          ))}
        </Routes>
      </BasicLayout>
    );
  }

  // MODERN PREMIUM DARK GLASSMORPHIC THEME WRAPPER
  return (
    <div className="app-layout">
      {/* Sidebar navigation */}
      <Sidebar isAdmin={isAdmin} onLogout={logout} customSections={customSections} />

      {/* Main content viewport */}
      <div className="main-viewport">
        <TopBar 
          companyName={settings.company_name} 
          gstin={settings.gstin} 
          onSwitchUi={() => setUiMode('basic')}
          onLogout={logout}
        />
        
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/master" element={<Master />} />
          <Route path="/master/item-group" element={<Master defaultTab="item-group" />} />
          <Route path="/master/item-master" element={<Master defaultTab="item-master" />} />
          <Route path="/master/customer-master" element={<Master defaultTab="customer-master" />} />
          <Route path="/master/supplier-master" element={<Master defaultTab="supplier-master" />} />
          <Route path="/master/sales-executive" element={<Master defaultTab="sales-executive" />} />
          <Route path="/master/company-staff" element={<Master defaultTab="company-staff" />} />
          <Route path="/master/expenses-group" element={<Master defaultTab="expenses-group" />} />
          <Route path="/purchase" element={<Purchase settings={settings} />} />
          <Route path="/sales" element={<Sales settings={settings} />} />
          <Route path="/quotation" element={<Quotation settings={settings} />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/weg-stock" element={<WegStock />} />
          <Route path="/weg-stock/entry" element={<WegStock defaultTab="entry" />} />
          <Route path="/weg-stock/receipt" element={<WegStock defaultTab="receipt" />} />
          <Route path="/weg-stock/issue" element={<WegStock defaultTab="issue" />} />
          <Route path="/daily-expenses" element={<DailyExpenses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/purchase" element={<Reports defaultTab="purchase-statement" />} />
          <Route path="/reports/sales" element={<Reports defaultTab="sales-statement" />} />
          <Route path="/reports/gst" element={<Reports defaultTab="gst-reports" />} />
          <Route path="/settings" element={<Settings onSettingsUpdate={fetchSettings} onSectionsUpdate={fetchCustomSections} />} />
          <Route path="/admin" element={isAdmin ? <SuperAdmin /> : <Dashboard />} />
          {customSections.map(sec => (
            <Route key={sec.slug} path={`/section/${sec.slug}`} element={
              <CustomSection settings={settings} sectionSlug={sec.slug} sectionName={sec.name} sectionColor={sec.color} />
            } />
          ))}
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
