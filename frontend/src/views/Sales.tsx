import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Trash2, FileText, Printer, X, Save 
} from 'lucide-react';
import { API_URL } from '../App';
import SearchableSelect from '../components/SearchableSelect';
import type { CompanySettings } from '../App';
import type { Item, Customer } from '../../../backend/src/types';
import { useAuth } from '../AuthContext';
import { parsePrintLayout, generateItemsTableHtml } from '../utils/printLayoutParser';
import './Views.css';

// Translation helper
const t = (val: string) => val;

interface SalesProps {
  settings: CompanySettings;
}

interface InvoiceItemInput {
  item_id: number;
  quantity: number;
  price: number;
  discount_pct: number;
}

export const Sales: React.FC<SalesProps> = ({ settings }) => {
  const { authFetch } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  
  // New invoice form state
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('Thank you for choosing SMR Groups. Quality electric motors guaranteed.');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemInput[]>([
    { item_id: 0, quantity: 1, price: 0, discount_pct: 0 }
  ]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/invoices?type=sales`);
      if (res.ok) setInvoices(await res.json());

      const custRes = await authFetch(`${API_URL}/customers`);
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData);
      }

      const itemRes = await authFetch(`${API_URL}/items`);
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        setItems(itemData);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleOpenNew = () => {
    setSelectedInvoice(null);
    setInvoiceNumber(`INV/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`);
    setSelectedCustomerId(customers[0]?.id || 0);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setInvoiceDueDate(new Date().toISOString().split('T')[0]);
    setNotes('Thank you for choosing SMR Groups. Quality electric motors guaranteed.');
    setPaidAmount(0);
    setInvoiceItems([{ item_id: 0, quantity: 1, price: 0, discount_pct: 0 }]);
    setIsEditorOpen(true);
  };

  const handleViewInvoice = async (id: number) => {
    try {
      const res = await authFetch(`${API_URL}/invoices/${id}`);
      if (res.ok) {
        setSelectedInvoice(await res.json());
        setIsEditorOpen(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddRow = () => {
    setInvoiceItems(prev => [...prev, { item_id: 0, quantity: 1, price: 0, discount_pct: 0 }]);
  };

  const handleRemoveRow = (index: number) => {
    if (invoiceItems.length !== 1) {
      setInvoiceItems(prev => prev.filter((_, idx) => idx !== index));
    }
  };

  const handleItemChange = (index: number, field: keyof InvoiceItemInput, val: any) => {
    setInvoiceItems(prev => prev.map((item, idx) => {
      if (idx === index) {
        const updated = { ...item, [field]: val };
        if (field === 'item_id') {
          const itemId = Number(val);
          const matchedItem = items.find(it => it.id === itemId);
          if (matchedItem) {
            updated.price = matchedItem.sales_price;
          }
        }
        return updated;
      }
      return item;
    }));
  };

  const validateInvoiceItems = () => {
    if (!invoiceNumber.trim()) {
      alert(t('Please enter an invoice reference number before saving.'));
      return false;
    }

    if (!selectedCustomerId || selectedCustomerId <= 0) {
      alert(t('Please select a customer before saving.'));
      return false;
    }

    const invalidRow = invoiceItems.find((item) => {
      const itemId = Number(item.item_id);
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const selectedItem = items.find(it => it.id === itemId);

      return !selectedItem || itemId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0;
    });

    if (invalidRow) {
      alert(t("Validation Error: Ensure all quantity and rate inputs are positive numbers (> 0) and a product model is selected."));
      return false;
    }

    return true;
  };

  const isInvoiceRowInvalid = (item: InvoiceItemInput) => {
    const itemId = Number(item.item_id);
    const quantity = Number(item.quantity);
    const price = Number(item.price);
    const selectedItem = items.find(it => it.id === itemId);

    return !selectedItem || itemId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0;
  };

  const calculateInvoiceSummary = () => {
    let subtotal = 0;
    let discount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    const customer = customers.find(c => c.id === selectedCustomerId);
    const isInterstate = customer ? customer.state !== settings.state : false;

    const mappedItems = invoiceItems.map(itemInput => {
      const matched = items.find(it => it.id === parseInt(itemInput.item_id as any));
      if (!matched) return null;

      const qty = parseFloat(itemInput.quantity as any) || 0;
      const price = parseFloat(itemInput.price as any) || 0;
      const discPct = parseFloat(itemInput.discount_pct as any) || 0;

      const rawAmount = qty * price;
      const discAmount = (discPct / 100) * rawAmount;
      const taxableValue = rawAmount - discAmount;

      const rate = matched.gst_rate || 18;
      let itemCgst = 0;
      let itemSgst = 0;
      let itemIgst = 0;

      if (isInterstate) {
        itemIgst = (rate / 100) * taxableValue;
      } else {
        itemCgst = taxableValue * ((rate / 2) / 100);
        itemSgst = taxableValue * ((rate / 2) / 100);
      }

      subtotal += rawAmount;
      discount += discAmount;
      cgst += itemCgst;
      sgst += itemSgst;
      igst += itemIgst;

      return {
        item_id: matched.id,
        item_name: matched.name,
        hp: matched.hp,
        rpm: matched.rpm,
        poles: matched.poles,
        phase: matched.phase,
        frame: matched.frame,
        quantity: qty,
        price: price,
        discount_pct: discPct,
        taxable_value: taxableValue,
        cgst_pct: isInterstate ? 0 : rate / 2,
        cgst_amount: itemCgst,
        sgst_pct: isInterstate ? 0 : rate / 2,
        sgst_amount: itemSgst,
        igst_pct: isInterstate ? rate : 0,
        igst_amount: itemIgst,
        total_amount: taxableValue + itemCgst + itemSgst + itemIgst
      };
    }).filter(it => it !== null);

    const totalTax = cgst + sgst + igst;
    const finalAmountBeforeRound = subtotal - discount + totalTax;
    const grandTotal = Math.round(finalAmountBeforeRound);
    const roundOff = grandTotal - finalAmountBeforeRound;
    const balanceAmount = Math.max(0, grandTotal - paidAmount);

    return {
      subtotal,
      discount,
      cgst,
      sgst,
      igst,
      tax_amount: totalTax,
      round_off: roundOff,
      grand_total: grandTotal,
      balance_amount: balanceAmount,
      payment_status: balanceAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      items: mappedItems
    };
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateInvoiceItems()) {
      return;
    }

    for (const itemInput of invoiceItems) {
      const itemId = Number(itemInput.item_id);
      const matched = items.find(it => it.id === itemId);
      const quantity = Number(itemInput.quantity);
      if (matched && matched.stock_qty < quantity) {
        if (!window.confirm(t(`Product '${matched.code}' is low in inventory (Available: ${matched.stock_qty} pcs). Proceed with transaction?`))) {
          return;
        }
      }
    }

    const summary = calculateInvoiceSummary();
    const payload = {
      invoice_number: invoiceNumber,
      invoice_type: 'sales',
      party_id: selectedCustomerId,
      date: invoiceDate,
      due_date: invoiceDueDate,
      subtotal: summary.subtotal,
      discount: summary.discount,
      cgst: summary.cgst,
      sgst: summary.sgst,
      igst: summary.igst,
      tax_amount: summary.tax_amount,
      round_off: summary.round_off,
      grand_total: summary.grand_total,
      paid_amount: paidAmount,
      balance_amount: summary.balance_amount,
      payment_status: summary.payment_status,
      notes: notes,
      items: summary.items
    };

    try {
      const res = await authFetch(`${API_URL}/invoices`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsEditorOpen(false);
        fetchInvoices();
      } else {
        const errorData = await res.json();
        alert(errorData.error || t('Failed to record sales tax invoice.'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const currentSummary = selectedInvoice || calculateInvoiceSummary();

  const filteredInvoices = invoices.filter(inv => {
    const cust = customers.find(c => c.id === inv.party_id);
    const clientName = cust ? cust.name.toLowerCase() : '';
    const number = inv.invoice_number.toLowerCase();
    const status = inv.payment_status.toLowerCase();
    const q = searchQuery.toLowerCase();
    return clientName.includes(q) || number.includes(q) || status.includes(q);
  });

  const totalSalesCredit = invoices.reduce((acc, curr) => acc + curr.grand_total, 0);

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header">
        <div>
          <h2>{t('Sales Tax Invoicing')}</h2>
          <p>{t('Manage enterprise billing, credit statements, and client sales ledgers')}</p>
        </div>
        {!isEditorOpen && (
          <button className="btn btn-primary" onClick={handleOpenNew}>
            <Plus size={16} />
            <span>{t('Record Sales Invoice')}</span>
          </button>
        )}
      </div>

      {!isEditorOpen ? (
        <>
          <div className="stat-grid">
            <div className="glass-card stat-card" style={{ borderLeft: '4px solid var(--color-accent-blue)' }}>
              <div className="stat-icon text-blue">
                <Package size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-label">{t('Total Invoices')}</span>
                <span className="stat-value">{invoices.length} {t('Invoices')}</span>
              </div>
            </div>

            <div className="glass-card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="stat-icon" style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
                <FileText size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-label">{t('Gross Credit')}</span>
                <span className="stat-value" style={{ color: '#10b981' }}>₹{totalSalesCredit.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="glass-card filter-bar">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder={t('Search by client, invoice no, status...')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          <div className="table-responsive glass-card">
            <table className="table-glass">
              <thead>
                <tr>
                  <th>{t('Invoice No')}</th>
                  <th>{t('Billing Party')}</th>
                  <th>{t('Invoice Date')}</th>
                  <th>{t('Due Date')}</th>
                  <th>{t('Tax Amount')}</th>
                  <th>{t('Grand Total')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center' }} className="text-secondary">
                      {t('Loading invoices...')}
                    </td>
                  </tr>
                ) : filteredInvoices.map(inv => {
                  const cust = customers.find(c => c.id === inv.party_id);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td>{cust ? cust.name : t('Unknown Client')}</td>
                      <td>{inv.date}</td>
                      <td>{inv.due_date}</td>
                      <td>₹{inv.tax_amount.toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>₹{inv.grand_total.toLocaleString()}</td>
                      <td>
                        <span className={`badge badge-${inv.payment_status}`}>
                          {inv.payment_status === 'paid' ? t('Paid') : inv.payment_status === 'partial' ? t('Partial') : t('Unpaid')}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" onClick={() => handleViewInvoice(inv.id)}>
                          {t('View Details')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center' }} className="text-secondary">
                      {t('No invoices recorded.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="editor-container animate-slide-down">
          {selectedInvoice ? (
            settings.custom_print_layout ? (
              <div className="invoice-sheet animate-slide-down" style={{ background: '#fff' }}>
                <div dangerouslySetInnerHTML={{ __html: parsePrintLayout(
                  settings.custom_print_layout,
                  settings,
                  selectedInvoice,
                  customers.find(c => c.id === selectedInvoice.party_id),
                  'TAX INVOICE',
                  generateItemsTableHtml(selectedInvoice.items, selectedInvoice.igst > 0)
                ) }} />
                <div className="flex gap-4 no-print" style={{ marginTop: '2rem', padding: '0 40px 40px 40px' }}>
                  <button className="btn btn-primary" onClick={() => window.print()}>
                    <Printer size={16} />
                    <span>{t('Print Invoice')}</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}>
                    <X size={16} />
                    <span>{t('Exit Details')}</span>
                  </button>
                </div>
              </div>
            ) : (
            <div className="invoice-sheet animate-slide-down" style={{ background: '#fff', color: '#000', padding: '2rem', borderRadius: '0px', fontFamily: '"Courier New", Courier, monospace, sans-serif' }}>
              {/* Retro Elegant Header */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1.5px solid #000', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', color: '#000', letterSpacing: '0.5px' }}>{settings.company_name}</h2>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#000' }}>{selectedInvoice.invoice_number}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#000' }}>{selectedInvoice.date}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#000', lineHeight: '1.3', marginTop: '2px' }}>
                  <div style={{ marginBottom: '6px' }}>{settings.address}</div>
                  <div style={{ display: 'flex', gap: '30px' }}>
                    <span><strong>{t('State :')}</strong> {t(settings.state).toUpperCase()}</span>
                    <span><strong>{t('State Code :')}</strong> {settings.state_code}</span>
                  </div>
                  <div style={{ marginTop: '2px' }}>
                    <strong>{t('GSTIN :')}</strong> {settings.gstin}
                  </div>
                </div>
              </div>

              {/* Consignee / Billing Party Details (Double Column Layout similar to Image 3) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', borderBottom: '1px dashed #000', paddingBottom: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', color: '#000', marginBottom: '4px', borderBottom: '1px solid #ccc', paddingBottom: '2px' }}>{t('Consignee / Billing Details')}</h4>
                  <p style={{ fontWeight: 'bold', margin: '2px 0', fontSize: '0.9rem' }}>{customers.find(c => c.id === selectedInvoice.party_id)?.name || t('Unknown Client')}</p>
                  <p style={{ margin: '2px 0', color: '#333' }}>{customers.find(c => c.id === selectedInvoice.party_id)?.address}</p>
                  <p style={{ margin: '2px 0', fontWeight: 'bold' }}>{t('GSTIN : ')}{customers.find(c => c.id === selectedInvoice.party_id)?.gstin || t('UNREGISTERED')}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', color: '#000', marginBottom: '4px', borderBottom: '1px solid #ccc', paddingBottom: '2px' }}>{t('Validity & Dispatch')}</h4>
                  <p style={{ margin: '2px 0' }}><strong>{t('Due Date :')}</strong> {selectedInvoice.due_date}</p>
                  <p style={{ margin: '2px 0' }}><strong>{t('Payment Mode :')}</strong> {t('Bank Transfer')}</p>
                  <p style={{ margin: '2px 0' }}><strong>{t('Logistics Dispatch :')}</strong> {t('Motor Transport')}</p>
                </div>
              </div>

              {/* Clean Minimalist Items Table (Image 4 Design) */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }}>
                    <th style={{ color: '#000', padding: '8px 4px', textAlign: 'left', width: '40px', fontWeight: 'bold' }}>{t('SL')}</th>
                    <th style={{ color: '#000', padding: '8px 4px', textAlign: 'left', fontWeight: 'bold' }}>{t('Description of Goods')}</th>
                    <th style={{ color: '#000', padding: '8px 4px', textAlign: 'center', width: '100px', fontWeight: 'bold' }}>{t('HSN Code')}</th>
                    <th style={{ color: '#000', padding: '8px 4px', textAlign: 'right', width: '90px', fontWeight: 'bold' }}>{t('Quantity')}</th>
                    <th style={{ color: '#000', padding: '8px 4px', textAlign: 'right', width: '110px', fontWeight: 'bold' }}>{t('Rate')}</th>
                    <th style={{ color: '#000', padding: '8px 4px', textAlign: 'right', width: '120px', fontWeight: 'bold' }}>{t('Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items?.map((item: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 'bold' }}>{item.item_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '2px' }}>
                          {item.hp} • {item.rpm} • {item.poles} • {item.frame}Fr • {item.igst_pct > 0 ? `IGST ${item.igst_pct}%` : `CGST/SGST ${item.cgst_pct}%`}
                        </div>
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'center', verticalAlign: 'top', fontFamily: 'monospace' }}>8501</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', verticalAlign: 'top', fontWeight: 'bold' }}>
                        {item.quantity.toFixed(2)} {t('Nos')}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', verticalAlign: 'top' }}>
                        {item.price.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', verticalAlign: 'top', fontWeight: 'bold' }}>
                        {item.total_amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals and Bank details matching Image 4 style */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '2rem', marginTop: '1.5rem', fontSize: '0.85rem' }}>
                <div style={{ border: '1px solid #000', padding: '8px 12px', background: '#fafafa', borderRadius: '4px' }}>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', margin: '0 0 6px 0', borderBottom: '1px solid #000', paddingBottom: '3px' }}>{t('Banking & Declarations')}</h4>
                  <p style={{ margin: '4px 0' }}><strong>{t('Bank :')}</strong> {settings.bank_name}</p>
                  <p style={{ margin: '4px 0' }}><strong>{t('Account Name :')}</strong> {settings.account_name}</p>
                  <p style={{ margin: '4px 0' }}><strong>{t('A/c No :')}</strong> {settings.account_number} | <strong>{t('IFSC :')}</strong> {settings.ifsc_code}</p>
                  <p style={{ fontStyle: 'italic', margin: '8px 0 4px 0', borderTop: '1px solid #eee', paddingTop: '4px', color: '#333' }}>{selectedInvoice.notes || t('Thank you for choosing SMR Groups.')}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#444' }}>{t('Gross Subtotal:')}</span>
                    <span style={{ fontWeight: 'bold' }}>₹{selectedInvoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#444' }}>{t('Trade Discount:')}</span>
                    <span style={{ fontWeight: 'bold', color: '#dd6b20' }}>- ₹{selectedInvoice.discount.toFixed(2)}</span>
                  </div>
                  {selectedInvoice.igst > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#444' }}>{t('Integrated GST (IGST):')}</span>
                      <span>₹{selectedInvoice.igst.toFixed(2)}</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#444' }}>{t('Central GST (CGST):')}</span>
                        <span>₹{selectedInvoice.cgst.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#444' }}>{t('State GST (SGST):')}</span>
                        <span>₹{selectedInvoice.sgst.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#444' }}>{t('Round Off adjustment:')}</span>
                    <span>₹{selectedInvoice.round_off.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid #000', fontSize: '1.1rem', fontWeight: 'bold', color: '#000' }}>
                    <span>{t('GRAND TOTAL:')}</span>
                    <span>₹{selectedInvoice.grand_total.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#10b981', fontWeight: 'bold' }}>
                    <span>{t('Amount Paid:')}</span>
                    <span>₹{selectedInvoice.paid_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4" style={{ marginTop: '2rem' }}>
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <Printer size={16} />
                  <span>{t('Print Invoice')}</span>
                </button>
                <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}>
                  <X size={16} />
                  <span>{t('Exit Details')}</span>
                </button>
              </div>
            </div>
            )
          ) : (
            <form onSubmit={handleSaveInvoice} className="glass-card flex flex-col gap-6">
              <div className="view-header" style={{ padding: 0 }}>
                <h3>{t('Sales Invoice Entry')}</h3>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>{t('Invoice Number')}</label>
                  <input type="text" value={invoiceNumber} readOnly className="form-control" style={{ fontFamily: 'monospace', fontWeight: 600 }} />
                </div>

                <div className="form-group">
                  <label>{t('Client / Customer')}</label>
                  <SearchableSelect
                    value={String(selectedCustomerId || '')}
                    options={customers.filter(c => c.id != null).map(c => ({ value: String(c.id), label: c.name }))}
                    onChange={value => setSelectedCustomerId(Number(value) || 0)}
                    placeholder={t('Type to search customers...')}
                    aria-label={t('Client / Customer')}
                  />
                </div>

                <div className="form-group">
                  <label>{t('Invoice Date')}</label>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="form-control" />
                </div>

                <div className="form-group">
                  <label>{t('Due Date')}</label>
                  <input type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} className="form-control" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label style={{ fontWeight: 600 }}>{t('Invoice Line Items')}</label>
                <div className="table-responsive">
                  <table className="table-glass">
                    <thead>
                      <tr>
                        <th>{t('Product Name')}</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>{t('Qty')}</th>
                        <th style={{ width: '150px', textAlign: 'right' }}>{t('Rate (₹)')}</th>
                        <th style={{ width: '100px', textAlign: 'right' }}>{t('Disc%')}</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>{t('Del')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceItems.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <SearchableSelect
                              value={String(item.item_id || '')}
                              options={items.filter(it => it.id != null).map(it => ({ value: String(it.id), label: `${it.name} [${it.code}]` }))}
                              onChange={value => handleItemChange(index, 'item_id', Number(value) || 0)}
                              placeholder={t('Type to search products...')}
                              aria-label={t('Product Name')}
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              value={item.quantity} 
                              min="1"
                              onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="form-control" 
                              style={{ textAlign: 'center' }} 
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              value={item.price} 
                              min="0"
                              onChange={(e) => handleItemChange(index, 'price', parseFloat(e.target.value) || 0)}
                              className="form-control" 
                              style={{ textAlign: 'right' }} 
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              value={item.discount_pct} 
                              min="0"
                              max="100"
                              onChange={(e) => handleItemChange(index, 'discount_pct', parseFloat(e.target.value) || 0)}
                              className="form-control" 
                              style={{ textAlign: 'right' }} 
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              type="button" 
                              className="btn btn-secondary" 
                              disabled={invoiceItems.length === 1}
                              onClick={() => handleRemoveRow(index)}
                              style={{ color: '#ef4444', padding: '0.4rem' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn btn-secondary" onClick={handleAddRow} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
                  <Plus size={14} />
                  <span>{t('Add Item Row')}</span>
                </button>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
                <div className="flex flex-col gap-4">
                  <div className="form-group">
                    <label>{t('Narration / Remarks')}</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="form-control" />
                  </div>

                  <div className="form-group" style={{ maxWidth: '200px' }}>
                    <label>{t('Amount Paid (₹)')}</label>
                    <input 
                      type="number" 
                      value={paidAmount} 
                      onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                      className="form-control" 
                    />
                  </div>
                </div>

                <div className="invoice-totals-list">
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Gross Subtotal:')}</span>
                    <span>₹{currentSummary.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Trade Discount:')}</span>
                    <span className="text-gold">- ₹{currentSummary.discount.toLocaleString()}</span>
                  </div>
                  {currentSummary.igst > 0 ? (
                    <div className="invoice-total-row">
                      <span className="text-secondary">{t('Integrated GST (IGST):')}</span>
                      <span>₹{currentSummary.igst.toLocaleString()}</span>
                    </div>
                  ) : (
                    <>
                      <div className="invoice-total-row">
                        <span className="text-secondary">{t('Central GST (CGST):')}</span>
                        <span>₹{currentSummary.cgst.toLocaleString()}</span>
                      </div>
                      <div className="invoice-total-row">
                        <span className="text-secondary">{t('State GST (SGST):')}</span>
                        <span>₹{currentSummary.sgst.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div className="invoice-total-row">
                    <span className="text-secondary">{t('Round Off adjustment:')}</span>
                    <span>₹{currentSummary.round_off.toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row invoice-total-row-grand" style={{ fontSize: '1.15rem', fontWeight: 800, borderTop: '2px solid var(--color-border)', paddingTop: '0.5rem' }}>
                    <span>{t('GRAND TOTAL:')}</span>
                    <span>₹{currentSummary.grand_total.toLocaleString()}</span>
                  </div>
                  <div className="invoice-total-row" style={{ color: '#10b981', fontWeight: 700 }}>
                    <span>{t('Balance Due:')}</span>
                    <span>₹{currentSummary.balance_amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn btn-primary" disabled={invoiceItems.some(isInvoiceRowInvalid)}>
                  <Save size={16} />
                  <span>{t('Save Invoice')}</span>
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}>
                  <X size={16} />
                  <span>{t('Cancel')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default Sales;