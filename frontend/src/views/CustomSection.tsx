import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Save, X, FileText, Printer } from 'lucide-react';
import { API_URL } from '../App';
import SearchableSelect from '../components/SearchableSelect';
import type { CompanySettings } from '../App';
import { useAuth } from '../AuthContext';
import { parsePrintLayout, generateItemsTableHtml } from '../utils/printLayoutParser';
import './Views.css';

const t = (val: string) => val;

interface CustomSectionProps {
  settings: CompanySettings;
  sectionSlug: string;
  sectionName: string;
  sectionColor?: string;
}

interface InvoiceItemInput {
  item_id: number;
  quantity: number;
  price: number;
  discount_pct: number;
}

export const CustomSection: React.FC<CustomSectionProps> = ({ settings, sectionSlug, sectionName, sectionColor }) => {
  const { authFetch } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(0);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemInput[]>([
    { item_id: 0, quantity: 1, price: 0, discount_pct: 0 }
  ]);

  const slugPrefix = sectionSlug.toUpperCase().replace(/-/g, '').slice(0, 3);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, custRes, itemRes] = await Promise.all([
        authFetch(`${API_URL}/invoices?slug=${sectionSlug}`),
        authFetch(`${API_URL}/customers`),
        authFetch(`${API_URL}/items`),
      ]);
      if (invRes.ok) setInvoices(await invRes.json());
      if (custRes.ok) setCustomers(await custRes.json());
      if (itemRes.ok) setItems(await itemRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on mount and re-fetch when slug changes (navigation between custom sections)
  useEffect(() => { fetchData(); }, [sectionSlug]);

  const handleOpenNew = () => {
    setSelectedInvoice(null);
    const prefix = slugPrefix;
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    setInvoiceNumber(`${prefix}/${year}/${rand}`);
    setSelectedCustomerId(customers[0]?.id || 0);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setInvoiceItems([{ item_id: 0, quantity: 1, price: 0, discount_pct: 0 }]);
    setIsEditorOpen(true);
  };

  const handleViewInvoice = async (id: number) => {
    try {
      const res = await authFetch(`${API_URL}/invoices/${id}`);
      if (res.ok) { setSelectedInvoice(await res.json()); setIsEditorOpen(true); }
    } catch (err) { console.error(err); }
  };

  const handleAddRow = () => setInvoiceItems(prev => [...prev, { item_id: 0, quantity: 1, price: 0, discount_pct: 0 }]);
  const handleRemoveRow = (index: number) => {
    if (invoiceItems.length > 1) setInvoiceItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItemInput, val: any) => {
    setInvoiceItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item, [field]: val };
      if (field === 'item_id') {
        const matched = items.find(it => it.id === parseInt(val));
        if (matched) updated.price = matched.sales_price;
      }
      return updated;
    }));
  };

  const calculateSummary = () => {
    let subtotal = 0, discount = 0, cgst = 0, sgst = 0, igst = 0;
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
      let itemCgst = 0, itemSgst = 0, itemIgst = 0;
      if (isInterstate) { itemIgst = (rate / 100) * taxableValue; }
      else { itemCgst = taxableValue * ((rate / 2) / 100); itemSgst = taxableValue * ((rate / 2) / 100); }
      subtotal += rawAmount; discount += discAmount; cgst += itemCgst; sgst += itemSgst; igst += itemIgst;
      return {
        item_id: matched.id, item_name: matched.name, hp: matched.hp, rpm: matched.rpm,
        poles: matched.poles, phase: matched.phase, frame: matched.frame,
        quantity: qty, price, discount_pct: discPct, taxable_value: taxableValue,
        cgst_pct: isInterstate ? 0 : rate / 2, cgst_amount: itemCgst,
        sgst_pct: isInterstate ? 0 : rate / 2, sgst_amount: itemSgst,
        igst_pct: isInterstate ? rate : 0, igst_amount: itemIgst,
        total_amount: taxableValue + itemCgst + itemSgst + itemIgst
      };
    }).filter(Boolean);

    const totalTax = cgst + sgst + igst;
    const finalAmount = subtotal - discount + totalTax;
    const grandTotal = Math.round(finalAmount);
    return { subtotal, discount, cgst, sgst, igst, tax_amount: totalTax, round_off: grandTotal - finalAmount, grand_total: grandTotal, items: mappedItems };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const summary = calculateSummary();
    if (summary.items.length === 0) { alert('Please add at least one valid product.'); return; }
    const payload = {
      invoice_number: invoiceNumber,
      invoice_type: 'custom',
      custom_section_slug: sectionSlug,
      party_id: selectedCustomerId,
      date: invoiceDate,
      due_date: invoiceDate,
      ...summary,
      paid_amount: 0,
      balance_amount: summary.grand_total,
      payment_status: 'unpaid',
      notes,
    };
    try {
      const res = await authFetch(`${API_URL}/invoices`, { method: 'POST', body: JSON.stringify(payload) });
      if (res.ok) { setIsEditorOpen(false); fetchData(); }
      else { const err = await res.json(); alert(err.error || 'Failed to save document.'); }
    } catch (err) { console.error(err); }
  };

  const currentSummary = selectedInvoice || calculateSummary();
  const filteredInvoices = invoices.filter(inv => {
    const cust = customers.find(c => c.id === inv.party_id);
    const q = searchQuery.toLowerCase();
    return (cust?.name || '').toLowerCase().includes(q) || inv.invoice_number.toLowerCase().includes(q);
  });

  const accentColor = sectionColor || '#6366f1';

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header">
        <div>
          <h2 style={{ color: accentColor }}>{sectionName}</h2>
          <p>{t('Create and manage ')} {sectionName.toLowerCase()} {t('documents')}</p>
        </div>
        {!isEditorOpen && (
          <button className="btn btn-primary" style={{ background: accentColor, borderColor: accentColor }} onClick={handleOpenNew}>
            <Plus size={16} />
            <span>{t('New')} {sectionName}</span>
          </button>
        )}
      </div>

      {!isEditorOpen ? (
        <>
          {/* Stats */}
          <div className="stat-grid">
            <div className="glass-card stat-card" style={{ borderLeft: `4px solid ${accentColor}` }}>
              <div className="stat-icon" style={{ color: accentColor, backgroundColor: `${accentColor}15` }}>
                <FileText size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-label">{t('Total')} {sectionName}{t('s')}</span>
                <span className="stat-value">{invoices.length}</span>
              </div>
            </div>
            <div className="glass-card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="stat-icon" style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)' }}>
                <FileText size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-label">{t('Total Value')}</span>
                <span className="stat-value text-gold">₹{invoices.reduce((a, b) => a + (b.grand_total || 0), 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="glass-card filter-bar">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input type="text" placeholder={`Search by client, ${sectionName.toLowerCase()} no...`}
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="form-control" />
            </div>
          </div>

          {/* Table */}
          <div className="table-responsive glass-card">
            <table className="table-glass">
              <thead>
                <tr>
                  <th>{t('Document No')}</th>
                  <th>{t('Party')}</th>
                  <th>{t('Date')}</th>
                  <th>{t('Tax Amount')}</th>
                  <th>{t('Grand Total')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">{t('Loading...')}</td></tr>
                ) : filteredInvoices.map(inv => {
                  const cust = customers.find(c => c.id === inv.party_id);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td>{cust?.name || 'Unknown'}</td>
                      <td>{inv.date}</td>
                      <td>₹{(inv.tax_amount || 0).toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>₹{(inv.grand_total || 0).toLocaleString()}</td>
                      <td>
                        <button className="btn btn-secondary" onClick={() => handleViewInvoice(inv.id)}>{t('View')}</button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredInvoices.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">{t('No')} {sectionName.toLowerCase()}{t('s recorded.')}</td></tr>
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
                  sectionName.toUpperCase(),
                  generateItemsTableHtml(selectedInvoice.items, selectedInvoice.igst > 0)
                ) }} />
                <div className="flex gap-4 no-print" style={{ marginTop: '2rem', padding: '0 40px 40px 40px' }}>
                  <button className="btn btn-primary" onClick={() => window.print()}>
                    <Printer size={16} />
                    <span>{t('Print')}</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}>
                    <X size={16} />
                    <span>{t('Close')}</span>
                  </button>
                </div>
              </div>
            ) : (
            /* View Mode */
            <div className="invoice-sheet glass-card" style={{ background: '#fff', color: '#2d3748', padding: '2.5rem', borderRadius: '8px' }}>
              <div className="invoice-header-grid" style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a365d' }}>{settings.company_name}</h3>
                  <p style={{ fontSize: '0.85rem', color: '#718096' }}>{settings.address}</p>
                  <p style={{ fontSize: '0.85rem', color: '#718096' }}>{t('GSTIN:')} {settings.gstin}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ fontSize: '2rem', fontWeight: 900, color: accentColor }}>{sectionName.toUpperCase()}</h2>
                  <p style={{ fontWeight: 700 }}>{t('No:')} {selectedInvoice.invoice_number}</p>
                  <p style={{ color: '#718096' }}>{t('Date:')} {selectedInvoice.date}</p>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#718096' }}>{t('Bill To')}</h4>
                <p style={{ fontWeight: 700 }}>{customers.find(c => c.id === selectedInvoice.party_id)?.name || 'Unknown'}</p>
                <p style={{ fontSize: '0.85rem', color: '#718096' }}>{customers.find(c => c.id === selectedInvoice.party_id)?.address}</p>
              </div>

              <table className="table-glass" style={{ width: '100%', border: '1px solid #cbd5e0', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ background: '#f7fafc' }}>
                    <th style={{ color: '#000' }}>{t('Item')}</th>
                    <th style={{ color: '#000', textAlign: 'center' }}>{t('Qty')}</th>
                    <th style={{ color: '#000', textAlign: 'right' }}>{t('Price')}</th>
                    <th style={{ color: '#000', textAlign: 'right' }}>{t('Disc%')}</th>
                    <th style={{ color: '#000', textAlign: 'right' }}>{t('Tax')}</th>
                    <th style={{ color: '#000', textAlign: 'right' }}>{t('Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items?.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.item_name}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>₹{item.price?.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{item.discount_pct}%</td>
                      <td style={{ textAlign: 'right' }}>₹{(item.cgst_amount + item.sgst_amount + item.igst_amount)?.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{item.total_amount?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="invoice-totals-list" style={{ maxWidth: '320px', marginLeft: 'auto' }}>
                <div className="invoice-total-row"><span>{t('Subtotal:')}</span><span>₹{selectedInvoice.subtotal?.toLocaleString()}</span></div>
                <div className="invoice-total-row"><span>{t('Discount:')}</span><span style={{ color: '#dd6b20' }}>-₹{selectedInvoice.discount?.toLocaleString()}</span></div>
                <div className="invoice-total-row"><span>{t('Tax:')}</span><span>₹{selectedInvoice.tax_amount?.toLocaleString()}</span></div>
                <div className="invoice-total-row invoice-total-row-grand"><span>{t('GRAND TOTAL:')}</span><span>₹{selectedInvoice.grand_total?.toLocaleString()}</span></div>
              </div>

              <div className="flex gap-4" style={{ marginTop: '1.5rem' }}>
                <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /><span>{t('Print')}</span></button>
                <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}><X size={16} /><span>{t('Close')}</span></button>
              </div>
            </div>
            )
          ) : (
            /* Create Mode */
            <form onSubmit={handleSave} className="glass-card flex flex-col gap-6">
              <div className="view-header" style={{ padding: 0 }}>
                <h3>{t('New')} {sectionName}</h3>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>{t('Document Number')}</label>
                  <input type="text" value={invoiceNumber} readOnly className="form-control" style={{ fontFamily: 'monospace', fontWeight: 600 }} />
                </div>
                <div className="form-group">
                  <label>{t('Customer / Party')}</label>
                  <SearchableSelect
                    value={String(selectedCustomerId || '')}
                    options={customers.filter(c => c.id != null).map(c => ({ value: String(c.id), label: c.name }))}
                    onChange={value => setSelectedCustomerId(Number(value) || 0)}
                    placeholder={t('Type to search customers...')}
                    aria-label={t('Customer / Party')}
                  />
                </div>
                <div className="form-group">
                  <label>{t('Date')}</label>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="form-control" />
                </div>
              </div>

              {/* Line Items */}
              <div className="flex flex-col gap-2">
                <label style={{ fontWeight: 600 }}>{t('Line Items')}</label>
                <div className="table-responsive">
                  <table className="table-glass">
                    <thead>
                      <tr>
                        <th>{t('Product')}</th>
                        <th style={{ width: 100, textAlign: 'center' }}>{t('Qty')}</th>
                        <th style={{ width: 150, textAlign: 'right' }}>{t('Rate (₹)')}</th>
                        <th style={{ width: 100, textAlign: 'right' }}>{t('Disc%')}</th>
                        <th style={{ width: 60, textAlign: 'center' }}>{t('Del')}</th>
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
                              aria-label={t('Product')}
                            />
                          </td>
                          <td>
                            <input type="number" value={item.quantity} min={1} onChange={e => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)} className="form-control" style={{ textAlign: 'center' }} />
                          </td>
                          <td>
                            <input type="number" value={item.price} min={0} onChange={e => handleItemChange(index, 'price', parseFloat(e.target.value) || 0)} className="form-control" style={{ textAlign: 'right' }} />
                          </td>
                          <td>
                            <input type="number" value={item.discount_pct} min={0} max={100} onChange={e => handleItemChange(index, 'discount_pct', parseFloat(e.target.value) || 0)} className="form-control" style={{ textAlign: 'right' }} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button type="button" className="btn btn-secondary" disabled={invoiceItems.length === 1} onClick={() => handleRemoveRow(index)} style={{ color: '#ef4444', padding: '0.4rem' }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn btn-secondary" onClick={handleAddRow} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
                  <Plus size={14} /><span>{t('Add Row')}</span>
                </button>
              </div>

              {/* Totals & Notes */}
              <div className="form-grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
                <div className="form-group">
                  <label>{t('Notes / Terms')}</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="form-control" placeholder="Optional notes or terms..." />
                </div>
                <div className="invoice-totals-list">
                  <div className="invoice-total-row"><span className="text-secondary">{t('Subtotal:')}</span><span>₹{currentSummary.subtotal?.toLocaleString()}</span></div>
                  <div className="invoice-total-row"><span className="text-secondary">{t('Discount:')}</span><span>₹{currentSummary.discount?.toLocaleString()}</span></div>
                  <div className="invoice-total-row"><span className="text-secondary">{t('Tax:')}</span><span>₹{currentSummary.tax_amount?.toLocaleString()}</span></div>
                  <div className="invoice-total-row invoice-total-row-grand" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                    <span>{t('GRAND TOTAL:')}</span><span>₹{currentSummary.grand_total?.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn btn-primary" style={{ background: accentColor, borderColor: accentColor }} disabled={selectedCustomerId === 0 || invoiceItems.some(it => it.item_id === 0)}>
                  <Save size={16} /><span>{t('Save')} {sectionName}</span>
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}><X size={16} /><span>{t('Cancel')}</span></button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSection;
