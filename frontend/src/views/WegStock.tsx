import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Cpu, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownLeft,
  Save, Trash2, ClipboardList, TruckIcon, BoxIcon, Eye
} from 'lucide-react';
import { API_URL } from '../App';
import SearchableSelect from '../components/SearchableSelect';
import type { Item } from '../../../backend/src/types';
import { useAuth } from '../AuthContext';
import './Views.css';

const t = (val: string) => val;

type WegTab = 'entry' | 'receipt' | 'issue' | 'view';

interface WegStockProps {
  defaultTab?: WegTab;
}

interface StockTransaction {
  id: number;
  item_id: number;
  type: string;
  quantity: number;
  date: string;
  reference_number: string;
  party_id: number;
  party_type: string;
  notes: string;
  item_name: string;
  item_code: string;
  party_name: string;
  created_at: string;
}

export const WegStock: React.FC<WegStockProps> = ({ defaultTab = 'view' }) => {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<WegTab>(defaultTab);
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedItemId, setSelectedItemId] = useState(0);
  const [qty, setQty] = useState(1);
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0]);
  const [refNumber, setRefNumber] = useState('');
  const [partyId, setPartyId] = useState(0);
  const [txnNotes, setTxnNotes] = useState('');
  const [formAlert, setFormAlert] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // View Stock filters
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [phaseFilter, setPhaseFilter] = useState('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState('ALL');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [itemRes, custRes, suppRes, txnRes] = await Promise.all([
        authFetch(`${API_URL}/items`),
        authFetch(`${API_URL}/customers`),
        authFetch(`${API_URL}/suppliers`),
        authFetch(`${API_URL}/stock-transactions`),
      ]);
      if (itemRes.ok) setItems(await itemRes.json());
      if (custRes.ok) setCustomers(await custRes.json());
      if (suppRes.ok) setSuppliers(await suppRes.json());
      if (txnRes.ok) setTransactions(await txnRes.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);

  const resetForm = () => {
    setSelectedItemId(0);
    setQty(1);
    setTxnDate(new Date().toISOString().split('T')[0]);
    setRefNumber('');
    setPartyId(0);
    setTxnNotes('');
    setFormAlert('');
    setFormSuccess('');
  };

  const handleSubmit = async (type: WegTab) => {
    setFormAlert('');
    setFormSuccess('');
    if (selectedItemId === 0) { setFormAlert(t('Please select a product.')); return; }
    if (qty <= 0) { setFormAlert(t('Quantity must be greater than zero.')); return; }

    const partyType = type === 'issue' ? 'customer' : type === 'receipt' ? 'supplier' : null;
    try {
      const res = await authFetch(`${API_URL}/stock-transactions`, {
        method: 'POST',
        body: JSON.stringify({
          item_id: selectedItemId,
          type,
          quantity: qty,
          date: txnDate,
          reference_number: refNumber || null,
          party_id: partyId || null,
          party_type: partyType,
          notes: txnNotes || null,
        }),
      });
      if (res.ok) {
        const itemName = items.find(i => i.id === selectedItemId)?.name || '';
        setFormSuccess(`${t('Successfully recorded')} ${qty} ${t('pcs of')} "${itemName}"`);
        resetForm();
        fetchAll();
      } else {
        const err = await res.json();
        setFormAlert(err.error || t('Failed to save transaction.'));
      }
    } catch (err) { setFormAlert(t('Network error.')); }
  };

  const handleDeleteTxn = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this stock transaction? The stock quantity will be reversed.'))) return;
    try {
      const res = await authFetch(`${API_URL}/stock-transactions/${id}`, { method: 'DELETE' });
      if (res.ok) fetchAll();
    } catch (err) { console.error(err); }
  };

  // Filter logic for View Stock tab
  const filteredItems = items.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.hp && item.hp.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesBrand = brandFilter === 'ALL' || item.brand === brandFilter;
    const matchesPhase = phaseFilter === 'ALL' || item.phase === phaseFilter;
    let matchesStock = true;
    if (stockStatusFilter === 'LOW') matchesStock = item.stock_qty > 0 && item.stock_qty <= item.low_stock_threshold;
    else if (stockStatusFilter === 'OUT') matchesStock = item.stock_qty <= 0;
    else if (stockStatusFilter === 'NORMAL') matchesStock = item.stock_qty > item.low_stock_threshold;
    return matchesSearch && matchesBrand && matchesPhase && matchesStock;
  });

  const lowStockCount = items.filter(i => i.stock_qty > 0 && i.stock_qty <= i.low_stock_threshold).length;
  const outOfStockCount = items.filter(i => i.stock_qty <= 0).length;
  const totalStockValue = items.reduce((sum, i) => sum + (i.stock_qty * i.sales_price), 0);

  // Filtered transactions by tab type
  const tabTransactions = (type: string) => transactions.filter(tx => tx.type === type);

  const tabs: { key: WegTab; label: string; icon: React.ReactNode }[] = [
    { key: 'entry', label: t('Stock Entry'), icon: <ClipboardList size={15} /> },
    { key: 'receipt', label: t('Stock Receipt'), icon: <TruckIcon size={15} /> },
    { key: 'issue', label: t('Stock Issue'), icon: <BoxIcon size={15} /> },
    { key: 'view', label: t('View Stock'), icon: <Eye size={15} /> },
  ];

  // Transaction form component (shared by Entry, Receipt, Issue tabs)
  const renderTransactionForm = (type: WegTab) => {
    const isIssue = type === 'issue';
    const isReceipt = type === 'receipt';
    const typeLabel = type === 'entry' ? t('Stock Entry') : isReceipt ? t('Stock Receipt') : t('Stock Issue');
    const typeTxns = tabTransactions(type);

    return (
      <div className="flex flex-col gap-4">
        {/* Form */}
        <div className="glass-card">
          <h3 className="weg-header" style={{ marginBottom: '0.75rem', fontWeight: 700, fontSize: '1.2rem' }}>{t('New')} {typeLabel}</h3>

          {formAlert && <div className="alert-error" style={{ padding: '6px 10px', marginBottom: 8, background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: '0.82rem', border: '1px solid #fca5a5' }}>{formAlert}</div>}
          {formSuccess && <div className="alert-success" style={{ padding: '6px 10px', marginBottom: 8, background: '#dcfce7', color: '#166534', borderRadius: 4, fontSize: '0.82rem', border: '1px solid #86efac' }}>{formSuccess}</div>}

          <div className="form-grid">
            <div className="form-group">
              <label>{t('Product')}</label>
              <SearchableSelect
                value={String(selectedItemId || '')}
                options={items.filter(it => it.id != null).map(it => ({
                  value: String(it.id),
                  label: `${it.name} [${it.code}] — ${t('Stock:')} ${it.stock_qty}`,
                }))}
                onChange={value => setSelectedItemId(Number(value) || 0)}
                placeholder={t('Type to search products...')}
                aria-label={t('Product')}
              />
            </div>

            <div className="form-group">
              <label>{t('Quantity')}</label>
              <input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value) || 0)} className="form-control" />
            </div>

            <div className="form-group">
              <label>{t('Date')}</label>
              <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} className="form-control" />
            </div>

            <div className="form-group">
              <label>{t('Reference No.')}</label>
              <input type="text" value={refNumber} onChange={e => setRefNumber(e.target.value)} className="form-control" placeholder={t('PO / Invoice No...')} />
            </div>

            {(isReceipt || isIssue) && (
              <div className="form-group">
                <label>{isIssue ? t('Customer') : t('Supplier')}</label>
                <SearchableSelect
                  value={String(partyId || '')}
                  options={(isIssue ? customers : suppliers).filter(p => p.id != null).map(p => ({ value: String(p.id), label: p.name }))}
                  onChange={value => setPartyId(Number(value) || 0)}
                  placeholder={t(`Type to search ${isIssue ? 'customers' : 'suppliers'}...`)}
                  aria-label={isIssue ? t('Customer') : t('Supplier')}
                />
              </div>
            )}

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>{t('Notes')}</label>
              <input type="text" value={txnNotes} onChange={e => setTxnNotes(e.target.value)} className="form-control" placeholder={t('Optional notes...')} />
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={() => handleSubmit(type)} disabled={selectedItemId === 0 || qty <= 0}>
              <Save size={15} /><span>{t('Save')} {typeLabel}</span>
            </button>
            <button className="btn btn-secondary" onClick={resetForm}>{t('Clear')}</button>
          </div>
        </div>

        {/* Recent transactions of this type */}
        <div className="glass-card">
          <h4 className="weg-header" style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '1.1rem' }}>{t('Recent')} {typeLabel} {t('Records')}</h4>
          <div className="table-responsive">
            <table className="table-glass">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Item')}</th>
                  <th>{t('Qty')}</th>
                  <th>{t('Ref No.')}</th>
                  {(isReceipt || isIssue) && <th>{isIssue ? t('Customer') : t('Supplier')}</th>}
                  <th>{t('Notes')}</th>
                  <th style={{ width: 60, textAlign: 'center' }}>{t('Del')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center' }} className="text-secondary">{t('Loading...')}</td></tr>
                ) : typeTxns.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center' }} className="text-secondary">{t('No records found.')}</td></tr>
                ) : typeTxns.map(tx => (
                  <tr key={tx.id}>
                    <td>{tx.date}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{tx.item_name}</span>
                      <br /><span className="text-secondary" style={{ fontSize: '0.72rem' }}>{tx.item_code}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: isIssue ? '#ef4444' : '#10b981' }}>
                      {isIssue ? '-' : '+'}{tx.quantity} {t('pcs')}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{tx.reference_number || '—'}</td>
                    {(isReceipt || isIssue) && <td>{tx.party_name || '—'}</td>}
                    <td className="text-secondary" style={{ fontSize: '0.78rem' }}>{tx.notes || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-secondary" onClick={() => handleDeleteTxn(tx.id)} style={{ color: '#ef4444', padding: '0.3rem' }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // View Stock tab content
  const renderViewStock = () => (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="stat-grid">
        <div className="glass-card stat-card" style={{ borderLeft: '4px solid var(--color-accent-blue, #3b82f6)' }}>
          <div className="stat-icon text-blue"><Package size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">{t('Unique Items')}</span>
            <span className="stat-value">{items.length} {t('Models')}</span>
          </div>
        </div>
        <div className="glass-card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="stat-icon" style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)' }}><AlertTriangle size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">{t('Low Stock')}</span>
            <span className="stat-value text-gold">{lowStockCount} {t('Models')}</span>
          </div>
        </div>
        <div className="glass-card stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-icon" style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)' }}><AlertTriangle size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">{t('Out of Stock')}</span>
            <span className="stat-value" style={{ color: '#ef4444' }}>{outOfStockCount} {t('Models')}</span>
          </div>
        </div>
        <div className="glass-card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-icon" style={{ color: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)' }}><Package size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">{t('Total Stock Value')}</span>
            <span className="stat-value" style={{ color: '#10b981' }}>₹{totalStockValue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card">
        <div className="filter-bar" style={{ marginBottom: '0.5rem' }}>
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder={t('Search by motor name, code, HP...')}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="form-control" />
          </div>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>{t('Brand')}</label>
            <select className="form-control" value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
              <option value="ALL">{t('All Brands')}</option>
              <option value="WEG">{t('WEG Motors')}</option>
              <option value="Other">{t('Other')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('Phase')}</label>
            <select className="form-control" value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)}>
              <option value="ALL">{t('All Phases')}</option>
              <option value="Three">{t('Three Phase')}</option>
              <option value="Single">{t('Single Phase')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('Stock Status')}</label>
            <select className="form-control" value={stockStatusFilter} onChange={e => setStockStatusFilter(e.target.value)}>
              <option value="ALL">{t('All Levels')}</option>
              <option value="NORMAL">{t('Normal')}</option>
              <option value="LOW">{t('Low Stock')}</option>
              <option value="OUT">{t('Out of Stock')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="form-grid" style={{ gridTemplateColumns: '2.5fr 1fr' }}>
        <div className="table-responsive glass-card">
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('Code')}</th>
                <th>{t('Motor Details')}</th>
                <th>{t('Specs')}</th>
                <th>{t('Threshold')}</th>
                <th>{t('Stock Qty')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">{t('Loading...')}</td></tr>
              ) : filteredItems.map(item => {
                const isOut = item.stock_qty <= 0;
                const isLow = item.stock_qty > 0 && item.stock_qty <= item.low_stock_threshold;
                return (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.code}</td>
                    <td>
                      <div className="flex flex-col">
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <span className="text-secondary" style={{ fontSize: '0.72rem' }}>{item.brand} {t('Motor')} | {item.volts}</span>
                      </div>
                    </td>
                    <td>
                      {item.hp === 'N/A' ? (
                        <span className="text-secondary">{t('N/A')}</span>
                      ) : (
                        <div className="flex items-center gap-1 text-blue" style={{ fontSize: '0.78rem', fontWeight: 500 }}>
                          <Cpu size={12} />
                          <span>{item.hp} • {item.rpm} • {item.poles} • {item.frame}F</span>
                        </div>
                      )}
                    </td>
                    <td>{item.low_stock_threshold} {t('pcs')}</td>
                    <td>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: isOut ? '#ef4444' : isLow ? '#f59e0b' : '#10b981' }}>
                        {item.stock_qty} {t('pcs')}
                      </span>
                    </td>
                    <td>
                      {isOut ? (
                        <span className="badge badge-unpaid">{t('Out of Stock')}</span>
                      ) : isLow ? (
                        <span className="badge badge-partial">{t('Low Stock')}</span>
                      ) : (
                        <span className="badge badge-paid">{t('In Stock')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredItems.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">{t('No matching products.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Stock Ledger Log */}
        <div className="glass-card flex flex-col gap-4">
          <h3 className="weg-header text-gold" style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--color-border, #808080)', paddingBottom: '0.5rem' }}>
            {t('Stock Ledger (Last 20)')}
          </h3>
          <div className="list-group">
            {loading ? (
              <p className="text-secondary" style={{ fontSize: '0.82rem' }}>{t('Loading...')}</p>
            ) : transactions.slice(0, 20).map(tx => {
              const isIssue = tx.type === 'issue';
              return (
                <div key={tx.id} className="list-group-item flex-col items-start gap-1" style={{ fontSize: '0.8rem' }}>
                  <div className="flex justify-between w-full items-center">
                    <span style={{ fontWeight: 600 }} className={isIssue ? 'text-gold' : 'text-blue'}>
                      {tx.type.toUpperCase()} {tx.reference_number ? `• ${tx.reference_number}` : ''}
                    </span>
                    <span className="text-secondary" style={{ fontSize: '0.7rem' }}>{tx.date}</span>
                  </div>
                  <p style={{ fontWeight: 500, fontSize: '0.82rem' }}>{tx.item_name}</p>
                  <div className="flex justify-between w-full items-center text-secondary" style={{ fontSize: '0.72rem', marginTop: '0.1rem' }}>
                    <span>{tx.party_name ? `${t('Party:')} ${tx.party_name}` : ''}</span>
                    <span className="flex items-center gap-1" style={{ fontWeight: 700, color: isIssue ? '#ef4444' : '#10b981' }}>
                      {isIssue ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                      <span>{isIssue ? '-' : '+'}{tx.quantity} {t('pcs')}</span>
                    </span>
                  </div>
                </div>
              );
            })}
            {!loading && transactions.length === 0 && (
              <p className="text-secondary" style={{ fontSize: '0.8rem', textAlign: 'center' }}>{t('No stock movements recorded.')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header">
        <div>
          <h2>{t('Weg Stock Inventory')}</h2>
          <p>{t('Warehouse management — entry, receipt, issue, and stock overview')}</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchAll}>
          <RefreshCw size={16} /><span>{t('Refresh')}</span>
        </button>
      </div>

      {/* Tab Bar */}
      <div className="glass-card weg-stock-tabs" style={{ padding: 0, display: 'flex', gap: 0, overflow: 'hidden' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); resetForm(); }}
            className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              borderRadius: 0,
              padding: '0.6rem 1rem',
              fontWeight: activeTab === tab.key ? 700 : 400,
              borderBottom: activeTab === tab.key ? '3px solid var(--color-accent-blue, #3b82f6)' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ marginTop: '0.75rem' }}>
        {activeTab === 'entry' && renderTransactionForm('entry')}
        {activeTab === 'receipt' && renderTransactionForm('receipt')}
        {activeTab === 'issue' && renderTransactionForm('issue')}
        {activeTab === 'view' && renderViewStock()}
      </div>
    </div>
  );
};

export default WegStock;