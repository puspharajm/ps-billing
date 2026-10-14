import React, { useState, useEffect } from 'react';
import { 
  Printer, Calendar, ArrowUpRight, ArrowDownLeft, DollarSign, 
  FileBarChart, ShieldCheck, Database, FileText, PieChart, TrendingUp
} from 'lucide-react';
import { API_URL } from '../App';
import SearchableSelect from '../components/SearchableSelect';
import type { Customer, Supplier } from '../../../backend/src/types';
import { useAuth } from '../AuthContext';
import './Views.css';

const t = (val: string) => val;

export type ReportTab = 'pl' | 'ledger' | 'purchase-statement' | 'sales-statement' | 'gst-reports';

interface ReportsProps {
  defaultTab?: ReportTab;
}

export const Reports: React.FC<ReportsProps> = ({ defaultTab = 'pl' }) => {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>(defaultTab);
  
  // Shared Date ranges
  const [fromDate, setFromDate] = useState<string>('2026-04-01');
  const [toDate, setToDate] = useState<string>('2026-06-30');

  // Profit and loss data
  const [plData, setPlData] = useState<any>({
    sales: { subtotal: 0, discount: 0, tax: 0, grand: 0 },
    purchases: { subtotal: 0, discount: 0, tax: 0, grand: 0 },
    net_profit: 0
  });

  // Ledgers state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [selectedPartyId, setSelectedPartyId] = useState<number>(0);
  const [ledgerData, setLedgerData] = useState<any>(null);

  // General registers state
  const [allInvoices, setAllInvoices] = useState<any[]>([]);

  // GST state
  const [gstType, setGstType] = useState<'gstr1' | 'gstr2'>('gstr1');
  const [gstr1, setGstr1] = useState<any[]>([]);
  const [gstr2, setGstr2] = useState<any[]>([]);
  const [gstLoading, setGstLoading] = useState<boolean>(false);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Load General Data (P&L, Parties)
  useEffect(() => {
    const fetchPL = async () => {
      try {
        const res = await authFetch(`${API_URL}/reports/profit-loss?from=${fromDate}&to=${toDate}`);
        if (res.ok) setPlData(await res.json());
      } catch (err) {
        console.error(err);
      }
    };

    const loadPartyLists = async () => {
      try {
        const custRes = await authFetch(`${API_URL}/customers`);
        if (custRes.ok) {
          const custs = await custRes.json();
          setCustomers(custs);
          if (custs.length > 0 && selectedPartyId === 0 && partyType === 'customer') {
            setSelectedPartyId(custs[0].id);
          }
        }
        const supRes = await authFetch(`${API_URL}/suppliers`);
        if (supRes.ok) {
          const sups = await supRes.json();
          setSuppliers(sups);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchPL();
    loadPartyLists();
  }, [fromDate, toDate]);

  // Load Ledger Data
  useEffect(() => {
    if (selectedPartyId === 0) return;
    const fetchLedger = async () => {
      try {
        const res = await authFetch(`${API_URL}/reports/ledger/${selectedPartyId}?type=${partyType}&from=${fromDate}&to=${toDate}`);
        if (res.ok) setLedgerData(await res.json());
      } catch (err) {
        console.error(err);
      }
    };
    fetchLedger();
  }, [selectedPartyId, partyType, fromDate, toDate]);

  // Load Statement (Registers) Data
  useEffect(() => {
    if (activeTab === 'purchase-statement' || activeTab === 'sales-statement') {
      const type = activeTab === 'purchase-statement' ? 'purchase' : 'sales';
      const fetchRegister = async () => {
        try {
          const res = await authFetch(`${API_URL}/invoices?type=${type}`);
          if (res.ok) {
            const invoices = await res.json();
            const filtered = invoices.filter((inv: any) => inv.date >= fromDate && inv.date <= toDate);
            setAllInvoices(filtered);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchRegister();
    }
  }, [activeTab, fromDate, toDate]);

  // Load GST Data
  useEffect(() => {
    if (activeTab === 'gst-reports') {
      const fetchGst = async () => {
        setGstLoading(true);
        try {
          const res = await authFetch(`${API_URL}/reports/gst?from=${fromDate}&to=${toDate}`);
          if (res.ok) {
            const data = await res.json();
            setGstr1(data.gstr1 || []);
            setGstr2(data.gstr2 || []);
          }
          setGstLoading(false);
        } catch (err) {
          console.error(err);
          setGstLoading(false);
        }
      };
      fetchGst();
    }
  }, [activeTab, fromDate, toDate]);

  const handlePartyTypeChange = (type: 'customer' | 'supplier') => {
    setPartyType(type);
    setLedgerData(null);
    const initialId = type === 'customer' 
      ? (customers[0]?.id || 0) 
      : (suppliers[0]?.id || 0);
    setSelectedPartyId(initialId);
  };

  const calculateAggregateTaxes = (rows: any[]) => {
    let taxableTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, grandTotal = 0;
    rows.forEach(r => {
      taxableTotal += r.taxable_value || 0;
      cgstTotal += r.cgst || 0;
      sgstTotal += r.sgst || 0;
      igstTotal += r.igst || 0;
      grandTotal += r.grand_total || 0;
    });
    return { taxableTotal, cgstTotal, sgstTotal, igstTotal, grandTotal };
  };

  const tabs: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
    { key: 'purchase-statement', label: t('Purchase Statement'), icon: <FileText size={15} /> },
    { key: 'sales-statement', label: t('Sales Statement'), icon: <TrendingUp size={15} /> },
    { key: 'gst-reports', label: t('GST Reports'), icon: <FileBarChart size={15} /> },
    { key: 'ledger', label: t('Party Ledgers'), icon: <Database size={15} /> },
    { key: 'pl', label: t('Profit & Loss'), icon: <PieChart size={15} /> },
  ];

  const getTabLabel = (key: ReportTab) => tabs.find(t => t.key === key)?.label || key;

  return (
    <div className="view-container animate-slide-down">
      {/* Header */}
      <div className="view-header">
        <div>
          <h2>{t('Financial Intelligence Reports')}</h2>
          <p>{t('Analyze statements, trace client ledgers, and compile GST tax reports')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()} style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'white' }}>
          <Printer size={16} />
          <span>{t('Print Statement')}</span>
        </button>
      </div>

      {/* Shared class `weg-stock-tabs` hides these tabs in Classic UI mode! */}
      <div className="glass-card weg-stock-tabs" style={{ padding: 0, display: 'flex', gap: 0, overflow: 'hidden' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              borderRadius: 0,
              padding: '0.6rem 0.5rem',
              fontWeight: activeTab === tab.key ? 700 : 400,
              borderBottom: activeTab === tab.key ? '3px solid var(--color-accent-blue, #3b82f6)' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            {tab.icon}
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Date filter parameters */}
      <div className="glass-card filter-bar">
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 text-secondary" style={{ fontSize: '0.85rem' }}>
            <Calendar size={16} />
            <span>{t('Auditing Period:')}</span>
          </div>
          <div className="flex gap-2">
            <input 
              type="date" 
              value={fromDate} 
              onChange={(e) => setFromDate(e.target.value)} 
              className="form-control"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            />
            <span className="text-secondary" style={{ alignSelf: 'center' }}>to</span>
            <input 
              type="date" 
              value={toDate} 
              onChange={(e) => setToDate(e.target.value)} 
              className="form-control"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            />
          </div>
        </div>
        {activeTab === 'gst-reports' && (
          <div className="status-badge flex items-center gap-1">
            <ShieldCheck size={14} />
            <span>{t('GSTIN Validated')}</span>
          </div>
        )}
      </div>

      <div className="glass-card flex flex-col gap-4">
        {/* `weg-header` makes this render as a classic window title bar in basic mode */}
        <h3 className="weg-header" style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          {getTabLabel(activeTab)}
        </h3>

        {/* Tab Content 1: Profit & Loss */}
        {activeTab === 'pl' && (
          <div className="flex flex-col gap-6 animate-slide-down">
            <div className="glass-card flex items-center justify-between" style={{ borderLeft: '5px solid var(--color-accent-blue)', padding: '2rem' }}>
              <div className="flex items-center gap-4">
                <div className="stat-icon text-blue" style={{ width: '60px', height: '60px' }}>
                  <DollarSign size={28} />
                </div>
                <div className="flex flex-col">
                  <span className="text-secondary" style={{ fontSize: '0.9rem' }}>{t('Net Trading Profit')}</span>
                  <span style={{ fontSize: '2.2rem', fontWeight: 800, color: plData.net_profit >= 0 ? '#10b981' : '#ef4444' }}>
                    ₹{plData.net_profit.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="text-right text-secondary" style={{ fontSize: '0.85rem' }}>
                <p>{t('Excludes collected GST taxes')}</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="glass-card flex flex-col gap-4">
                <h3 className="text-blue flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', fontSize: '1.05rem' }}>
                  <ArrowUpRight size={18} />
                  <span>{t('Revenue Credit (Sales)')}</span>
                </h3>
                <div className="invoice-totals-list">
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Gross Product Sales:')}</span>
                    <span>₹{(plData.sales?.subtotal || 0).toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Discounts Allowed:')}</span>
                    <span className="text-gold">- ₹{(plData.sales?.discount || 0).toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('GST Collected Liabilities:')}</span>
                    <span>₹{(plData.sales?.tax || 0).toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row" style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                    <span>{t('Total Sales Grand Total:')}</span>
                    <span>₹{(plData.sales?.grand || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="glass-card flex flex-col gap-4">
                <h3 className="text-gold flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', fontSize: '1.05rem' }}>
                  <ArrowDownLeft size={18} />
                  <span>{t('Operating Debit (Purchases)')}</span>
                </h3>
                <div className="invoice-totals-list">
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Gross Inventory Purchases:')}</span>
                    <span>₹{(plData.purchases?.subtotal || 0).toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Discounts Received:')}</span>
                    <span className="text-gold">- ₹{(plData.purchases?.discount || 0).toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Input Tax Credit Paid:')}</span>
                    <span>₹{(plData.purchases?.tax || 0).toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row" style={{ fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                    <span>{t('Total Purchase Cost:')}</span>
                    <span>₹{(plData.purchases?.grand || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 2: Ledgers */}
        {activeTab === 'ledger' && (
          <div className="flex flex-col gap-4 animate-slide-down">
            <div className="form-grid" style={{ gridTemplateColumns: '1.5fr 2fr 1fr' }}>
              <div className="form-group">
                <label>{t('Accounts Class')}</label>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    className={`btn ${partyType === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handlePartyTypeChange('customer')}
                    style={{ flex: 1 }}
                  >
                    {t('Clients (Debtors)')}
                  </button>
                  <button 
                    type="button" 
                    className={`btn ${partyType === 'supplier' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handlePartyTypeChange('supplier')}
                    style={{ flex: 1 }}
                  >
                    {t('Suppliers (Creditors)')}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>{t('Select Ledger Account')}</label>
                <SearchableSelect
                  value={String(selectedPartyId || '')}
                  options={partyType === 'customer'
                    ? customers.filter(c => c.id != null).map(c => ({ value: String(c.id), label: c.name }))
                    : suppliers.filter(s => s.id != null).map(s => ({ value: String(s.id), label: s.name }))}
                  onChange={value => setSelectedPartyId(Number(value) || 0)}
                  placeholder={t('Type to search parties...')}
                  aria-label={t('Select Ledger Account')}
                />
              </div>
            </div>

            {ledgerData && (
              <div className="invoice-sheet animate-slide-down">
                <div className="invoice-header-grid" style={{ borderBottom: '2px solid #e2e8f0', marginBottom: '1rem', paddingBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.4rem', color: '#2d3748', margin: 0 }}>{t('LEDGER ACCOUNT STATEMENT')}</h3>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: '0.2rem 0' }}>{t('Account Name:')} {ledgerData.party.name}</p>
                    <p style={{ fontSize: '0.8rem', color: '#718096', margin: 0 }}>{t('GSTIN:')} {ledgerData.party.gstin || t('UNREGISTERED')}</p>
                  </div>
                  <div className="invoice-title-area text-right">
                    <p style={{ margin: 0 }}>{t('Period:')} {fromDate} {t('to')} {toDate}</p>
                    <p style={{ fontWeight: 700, fontSize: '1rem', color: '#d4af37', marginTop: '0.5rem' }}>
                      {t('Outstanding Balance: ₹')}{ledgerData.party.outstanding_balance.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table-glass" style={{ width: '100%', border: '1px solid #cbd5e0' }}>
                    <thead>
                      <tr style={{ background: '#f7fafc' }}>
                        <th style={{ color: '#000' }}>{t('Txn Date')}</th>
                        <th style={{ color: '#000' }}>{t('Reference')}</th>
                        <th style={{ color: '#000' }}>{t('Type')}</th>
                        <th style={{ color: '#000', textAlign: 'right' }}>{t('Debit (₹) [IN]')}</th>
                        <th style={{ color: '#000', textAlign: 'right' }}>{t('Credit (₹) [OUT]')}</th>
                        <th style={{ color: '#000', textAlign: 'right' }}>{t('Balance (₹)')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{fromDate}</td>
                        <td style={{ fontFamily: 'monospace' }}>{t('OPENING_BAL')}</td>
                        <td style={{ fontStyle: 'italic' }}>{t('Brought Forward')}</td>
                        <td style={{ textAlign: 'right' }}>₹{ledgerData.party.opening_balance.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>-</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{ledgerData.party.opening_balance.toLocaleString()}</td>
                      </tr>
                      {(() => {
                        let balance = ledgerData.party.opening_balance;
                        return ledgerData.transactions.map((t: any) => {
                          const debit = t.debit || 0;
                          const credit = t.credit || 0;
                          balance += debit - credit;
                          return (
                            <tr key={t.id + '-' + t.reference}>
                              <td>{t.date}</td>
                              <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{t.reference}</td>
                              <td style={{ textTransform: 'uppercase', fontSize: '0.8rem' }}>
                                {t.t_type === 'invoice' || t.t_type === 'bill' ? t('Invoice') : t('Receipt')}
                              </td>
                              <td style={{ textAlign: 'right', color: debit > 0 ? '#ef4444' : 'inherit' }}>
                                {debit > 0 ? `₹${debit.toLocaleString()}` : '-'}
                              </td>
                              <td style={{ textAlign: 'right', color: credit > 0 ? '#10b981' : 'inherit' }}>
                                {credit > 0 ? `₹${credit.toLocaleString()}` : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{balance.toLocaleString()}</td>
                            </tr>
                          );
                        });
                      })()}
                      {ledgerData.transactions.length === 0 && (
                        <tr><td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">{t('No ledger transactions in period')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content 3 & 4: General Statements (Purchase & Sales) */}
        {(activeTab === 'purchase-statement' || activeTab === 'sales-statement') && (
          <div className="flex flex-col gap-4 animate-slide-down">
            <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
              {t('Audited Records:')} {allInvoices.length} {t('Invoices')}
            </div>
            <div className="table-responsive">
              <table className="table-glass">
                <thead>
                  <tr>
                    <th>{t('Voucher No')}</th>
                    <th>{t('Date')}</th>
                    <th>{t('Party Name')}</th>
                    <th>{t('Subtotal (₹)')}</th>
                    <th>{t('CGST (₹)')}</th>
                    <th>{t('SGST (₹)')}</th>
                    <th>{t('IGST (₹)')}</th>
                    <th>{t('Total (₹)')}</th>
                    <th>{t('Paid (₹)')}</th>
                    <th>{t('Balance (₹)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {allInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td>{inv.date}</td>
                      <td style={{ fontWeight: 500 }}>{inv.party_name}</td>
                      <td>₹{inv.subtotal.toLocaleString()}</td>
                      <td>{inv.cgst > 0 ? `₹${inv.cgst.toLocaleString()}` : '-'}</td>
                      <td>{inv.sgst > 0 ? `₹${inv.sgst.toLocaleString()}` : '-'}</td>
                      <td>{inv.igst > 0 ? `₹${inv.igst.toLocaleString()}` : '-'}</td>
                      <td style={{ fontWeight: 700 }}>₹{inv.grand_total.toLocaleString()}</td>
                      <td style={{ color: '#10b981' }}>₹{inv.paid_amount.toLocaleString()}</td>
                      <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{inv.balance_amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {allInvoices.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: 'center' }} className="text-secondary">{t('No invoices in period')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content 5: GST Reports */}
        {activeTab === 'gst-reports' && (() => {
          const currentSummary = gstType === 'gstr1' ? calculateAggregateTaxes(gstr1) : calculateAggregateTaxes(gstr2);
          return (
            <div className="flex flex-col gap-4 animate-slide-down">
              <div className="tabs-header" style={{ marginBottom: '1rem' }}>
                <button className={`tab-btn ${gstType === 'gstr1' ? 'active' : ''}`} onClick={() => setGstType('gstr1')}>
                  {t('GSTR-1: Outward Supplies (Sales)')}
                </button>
                <button className={`tab-btn ${gstType === 'gstr2' ? 'active' : ''}`} onClick={() => setGstType('gstr2')}>
                  {t('GSTR-2: Inward Input Tax Credit')}
                </button>
              </div>

              <div className="stat-grid">
                <div className="glass-card stat-card" style={{ borderLeft: '4px solid var(--color-accent-blue)' }}>
                  <div className="stat-icon text-blue"><Database size={20} /></div>
                  <div className="stat-info">
                    <span className="stat-label">{t('Total Taxable Value')}</span>
                    <span className="stat-value text-blue">₹{currentSummary.taxableTotal.toLocaleString()}</span>
                  </div>
                </div>
                <div className="glass-card stat-card" style={{ borderLeft: '4px solid var(--color-accent-gold)' }}>
                  <div className="stat-icon text-gold"><FileBarChart size={20} /></div>
                  <div className="stat-info">
                    <span className="stat-label">{t('Central & State GST')}</span>
                    <span className="stat-value text-gold">₹{(currentSummary.cgstTotal + currentSummary.sgstTotal).toLocaleString()}</span>
                  </div>
                </div>
                <div className="glass-card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                  <div className="stat-icon" style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)' }}><FileBarChart size={20} /></div>
                  <div className="stat-info">
                    <span className="stat-label">{t('Integrated GST (IGST)')}</span>
                    <span className="stat-value" style={{ color: '#10b981' }}>₹{currentSummary.igstTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table-glass">
                  <thead>
                    <tr style={{ background: '#f7fafc' }}>
                      <th>{t('Voucher No')}</th>
                      <th>{t('Date')}</th>
                      <th>{t('Client Name')}</th>
                      <th>{t('Client GSTIN')}</th>
                      <th>{t('Taxable (₹)')}</th>
                      <th>{t('CGST (₹)')}</th>
                      <th>{t('SGST (₹)')}</th>
                      <th>{t('IGST (₹)')}</th>
                      <th>{t('Total (₹)')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstLoading ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center' }} className="text-secondary">{t('Generating audit book...')}</td></tr>
                    ) : (gstType === 'gstr1' ? gstr1 : gstr2).map((r, index) => (
                      <tr key={index}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.invoice_number}</td>
                        <td>{r.date}</td>
                        <td style={{ fontWeight: 500 }}>{r.customer_name || r.supplier_name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.customer_gstin || r.supplier_gstin || t('UNREGISTERED')}</td>
                        <td>₹{r.taxable_value.toLocaleString()}</td>
                        <td style={{ color: '#718096' }}>{r.cgst > 0 ? `₹${r.cgst.toLocaleString()}` : '-'}</td>
                        <td style={{ color: '#718096' }}>{r.sgst > 0 ? `₹${r.sgst.toLocaleString()}` : '-'}</td>
                        <td style={{ color: 'var(--color-accent-blue)', fontWeight: 600 }}>{r.igst > 0 ? `₹${r.igst.toLocaleString()}` : '-'}</td>
                        <td style={{ fontWeight: 700 }}>₹{r.grand_total.toLocaleString()}</td>
                      </tr>
                    ))}
                    {!gstLoading && (gstType === 'gstr1' ? gstr1 : gstr2).length === 0 && (
                      <tr><td colSpan={9} style={{ textAlign: 'center' }} className="text-secondary">{t('No taxable transactions recorded in filing window')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export default Reports;
