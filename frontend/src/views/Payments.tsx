import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Check, X, ArrowUpRight, ArrowDownLeft, AlertTriangle 
} from 'lucide-react';
import { API_URL } from '../App';
import SearchableSelect from '../components/SearchableSelect';
import type { Customer, Supplier, Invoice } from '../../../backend/src/types';
import { useAuth } from '../AuthContext';
import './Views.css';

const t = (val: string) => val;

export const Payments: React.FC = () => {
  const { authFetch } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Editor modal states
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [paymentNumber, setPaymentNumber] = useState<string>('');
  const [transactionType, setTransactionType] = useState<'receipt' | 'payment'>('receipt');
  const [selectedPartyId, setSelectedPartyId] = useState<number>(0);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [mode, setMode] = useState<'cash' | 'bank' | 'upi'>('bank');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchPaymentsData = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/payments`);
      if (res.ok) setPayments(await res.json());

      const custRes = await authFetch(`${API_URL}/customers`);
      if (custRes.ok) setCustomers(await custRes.json());

      const supRes = await authFetch(`${API_URL}/suppliers`);
      if (supRes.ok) setSuppliers(await supRes.json());

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentsData();
  }, []);

  // When party changes, fetch pending unpaid invoices
  useEffect(() => {
    if (selectedPartyId === 0) {
      setPendingInvoices([]);
      return;
    }

    const fetchPendingInvoices = async () => {
      try {
        const type = transactionType === 'receipt' ? 'sales' : 'purchase';
        const res = await authFetch(`${API_URL}/invoices?type=${type}`);
        if (res.ok) {
          const allInvoices = await res.json() as Invoice[];
          const filtered = allInvoices.filter(inv => 
            inv.party_id === selectedPartyId && 
            inv.payment_status !== 'paid'
          );
          setPendingInvoices(filtered);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchPendingInvoices();
  }, [selectedPartyId, transactionType]);

  const handleOpenNew = () => {
    setErrorMessage(null);
    const prefix = transactionType === 'receipt' ? 'REC' : 'PAY';
    setPaymentNumber(`${prefix}/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`);
    
    const initialPartyId = transactionType === 'receipt' 
      ? (customers[0]?.id || 0) 
      : (suppliers[0]?.id || 0);

    setSelectedPartyId(initialPartyId);
    setSelectedInvoiceId(0);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setAmount(0);
    setMode('bank');
    setReferenceNumber('');
    setNotes('Received outstanding client dues.');
    setIsEditorOpen(true);
  };

  // When transaction type toggles inside form
  const handleTypeToggle = (type: 'receipt' | 'payment') => {
    setTransactionType(type);
    const prefix = type === 'receipt' ? 'REC' : 'PAY';
    setPaymentNumber(`${prefix}/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`);
    
    const initialPartyId = type === 'receipt' 
      ? (customers[0]?.id || 0) 
      : (suppliers[0]?.id || 0);
    
    setSelectedPartyId(initialPartyId);
    setSelectedInvoiceId(0);
    setNotes(type === 'receipt' ? 'Received outstanding client dues.' : 'Settled supplier PO dues.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (amount <= 0) {
      setErrorMessage('Payment amount must be greater than zero.');
      return;
    }

    const payload = {
      payment_number: paymentNumber,
      type: transactionType,
      party_id: selectedPartyId,
      invoice_id: selectedInvoiceId || null,
      date: paymentDate,
      amount,
      mode,
      reference_number: referenceNumber,
      notes
    };

    try {
      const res = await authFetch(`${API_URL}/payments`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsEditorOpen(false);
        fetchPaymentsData();
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to record transaction.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Network error. Database is unreachable.');
    }
  };

  const filteredPayments = payments.filter(p => 
    p.payment_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.party_name && p.party_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.invoice_number && p.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header">
        <div>
          <h2>{t('Payments & Cashbook Vouchers')}</h2>
          <p>{t('Record customer receipts, supplier payments, cashbook registries, and clear ledger balances')}</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} />
          <span>{t('Record Transaction')}</span>
        </button>
      </div>

      <div className="glass-card filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by voucher number, party, or invoice..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-control"
          />
        </div>
      </div>

      <div className="table-responsive">
        <table className="table-glass">
          <thead>
            <tr>
              <th>{t('Voucher No.')}</th>
              <th>{t('Date')}</th>
              <th>{t('Transaction Type')}</th>
              <th>{t('Party / Client Name')}</th>
              <th>{t('Reference Invoice')}</th>
              <th>{t('Payment Mode')}</th>
              <th>{t('Reference Code')}</th>
              <th>{t('Voucher Amount (₹)')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center' }} className="text-secondary">{t('Loading payments cashbook...')}</td>
              </tr>
            ) : filteredPayments.map(p => {
              const isReceipt = p.type === 'receipt';
              
              return (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.payment_number}</td>
                  <td>{p.date}</td>
                  <td>
                    <span className={`badge ${isReceipt ? 'badge-paid' : 'badge-unpaid'}`} style={{ gap: '0.25rem' }}>
                      {isReceipt ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                      {isReceipt ? t('Receipt (IN)') : t('Payment (OUT)')}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{p.party_name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{p.invoice_number || t('ADVANCE PAYMENT')}</td>
                  <td>
                    <span style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.8rem' }}>
                      {p.mode}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{p.reference_number || t('CASH TRANSACTION')}</td>
                  <td style={{ fontWeight: 700, color: isReceipt ? '#10b981' : '#ef4444' }}>
                    ₹{p.amount.toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {!loading && filteredPayments.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center' }} className="text-secondary">{t('No transaction records found')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* NEW TRANSACTION MODAL OVERLAY */}
      {isEditorOpen && (
        <div className="editor-overlay">
          <div className="editor-container glass-card" style={{ maxWidth: '750px', borderTop: '4px solid var(--color-accent-gold)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <h3>{t('Record Ledger Transaction')}</h3>
              <button className="text-secondary" onClick={() => setIsEditorOpen(false)}><X size={20} /></button>
            </div>

            {errorMessage && (
              <div className="badge badge-unpaid flex items-center gap-2 w-full p-3" style={{ marginBottom: '1.5rem', textTransform: 'none' }}>
                <AlertTriangle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              {/* Type Switch */}
              <div className="form-group">
                <label>{t('Voucher Transaction Flow')}</label>
                <div className="flex gap-4">
                  <button 
                    type="button" 
                    className={`btn ${transactionType === 'receipt' ? 'btn-primary' : ''}`}
                    onClick={() => handleTypeToggle('receipt')}
                    style={{ flex: 1, backgroundColor: transactionType === 'receipt' ? 'var(--color-accent-blue)' : 'var(--color-bg-tertiary)', color: transactionType === 'receipt' ? 'var(--color-bg-primary)' : 'white' }}
                  >
                    <ArrowUpRight size={16} />
                    <span>{t('Customer Receipt (Inward)')}</span>
                  </button>
                  <button 
                    type="button" 
                    className={`btn ${transactionType === 'payment' ? 'btn-primary' : ''}`}
                    onClick={() => handleTypeToggle('payment')}
                    style={{ flex: 1, backgroundColor: transactionType === 'payment' ? 'var(--color-accent-gold)' : 'var(--color-bg-tertiary)', color: transactionType === 'payment' ? 'var(--color-bg-primary)' : 'white' }}
                  >
                    <ArrowDownLeft size={16} />
                    <span>{t('Supplier Payment (Outward)')}</span>
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>{t('Voucher Number')}</label>
                  <input 
                    type="text" 
                    value={paymentNumber} 
                    onChange={(e) => setPaymentNumber(e.target.value)} 
                    required 
                    className="form-control"
                    style={{ fontFamily: 'monospace', fontWeight: 600 }}
                  />
                </div>
                <div className="form-group">
                  <label>{t('Transaction Party')}</label>
                  <SearchableSelect
                    value={String(selectedPartyId || '')}
                    options={transactionType === 'receipt'
                      ? customers.filter(c => c.id != null).map(c => ({ value: String(c.id), label: `${c.name} (O/s: ₹${c.outstanding_balance.toLocaleString()})` }))
                      : suppliers.filter(s => s.id != null).map(s => ({ value: String(s.id), label: `${s.name} (O/s: ₹${s.outstanding_balance.toLocaleString()})` }))}
                    onChange={value => setSelectedPartyId(Number(value) || 0)}
                    placeholder={t('Type to search parties...')}
                    required
                    aria-label={t('Transaction Party')}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>{t('Adjust Pending Invoice (Optional)')}</label>
                  <select 
                    value={selectedInvoiceId} 
                    onChange={(e) => setSelectedInvoiceId(parseInt(e.target.value))} 
                    className="form-control"
                  >
                    <option value="0">-- {t('Advance Payment (No Invoice link)')} --</option>
                    {pendingInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} (Grand Total: ₹{inv.grand_total.toLocaleString()} | Unpaid: ₹{inv.balance_amount.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('Payment Date')}</label>
                  <input 
                    type="date" 
                    value={paymentDate} 
                    onChange={(e) => setPaymentDate(e.target.value)} 
                    required 
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>{t('Voucher Amount (₹)')}</label>
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} 
                    required 
                    className="form-control"
                    style={{ fontSize: '1.1rem', fontWeight: 700 }}
                  />
                </div>
                <div className="form-group">
                  <label>{t('Payment Mode')}</label>
                  <select 
                    value={mode} 
                    onChange={(e) => setMode(e.target.value as any)} 
                    className="form-control"
                  >
                    <option value="bank">{t('Bank Transfer (NEFT/RTGS)')}</option>
                    <option value="upi">{t('UPI (GPay/PhonePe)')}</option>
                    <option value="cash">{t('Cash Voucher')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('Reference Code / UTR ID')}</label>
                  <input 
                    type="text" 
                    value={referenceNumber} 
                    onChange={(e) => setReferenceNumber(e.target.value)} 
                    placeholder="e.g. SBIUTR2039402"
                    className="form-control"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>{t('Accounts Remarks / Memo')}</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  rows={2} 
                  className="form-control"
                />
              </div>

              <div className="flex justify-end gap-3" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-gold" onClick={() => setIsEditorOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                  {t('Discard')}
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={18} />
                  <span>{t('Record Voucher')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
