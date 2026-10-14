import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Trash2, FileText, Printer, X, Save, RefreshCw 
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

interface QuotationProps {
  settings: CompanySettings;
}

interface InvoiceItemInput {
  item_id: number;
  quantity: number;
  price: number;
  discount_pct: number;
}

export const Quotation: React.FC<QuotationProps> = ({ settings }) => {
  const { authFetch } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  
  // New quotation form state
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('This estimate is valid for 30 days from date of issue.');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemInput[]>([
    { item_id: 0, quantity: 1, price: 0, discount_pct: 0 }
  ]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/invoices?type=quotation`);
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
    setInvoiceNumber(`QT/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`);
    setSelectedCustomerId(customers[0]?.id || 0);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setNotes('This estimate is valid for 30 days from date of issue.');
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

  const handleConvertQuotation = async (id: number) => {
    try {
      const detailRes = await authFetch(`${API_URL}/invoices/${id}`);
      if (detailRes.ok) {
        const quotation = await detailRes.json();
        const salesNumber = `INV/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
        
        const salesPayload = {
          invoice_number: salesNumber,
          invoice_type: 'sales',
          party_id: quotation.party_id,
          date: new Date().toISOString().split('T')[0],
          due_date: new Date().toISOString().split('T')[0],
          subtotal: quotation.subtotal,
          discount: quotation.discount,
          cgst: quotation.cgst,
          sgst: quotation.sgst,
          igst: quotation.igst,
          tax_amount: quotation.tax_amount,
          round_off: quotation.round_off,
          grand_total: quotation.grand_total,
          paid_amount: 0,
          balance_amount: quotation.grand_total,
          payment_status: 'unpaid',
          notes: t(`Converted from Quotation `) + quotation.invoice_number + '.',
          converted_from_quotation_id: quotation.id,
          items: quotation.items
        };

        const saveRes = await authFetch(`${API_URL}/invoices`, {
          method: 'POST',
          body: JSON.stringify(salesPayload)
        });

        if (saveRes.ok) {
          alert(t(`Successfully generated Tax Invoice: `) + salesNumber);
          fetchInvoices();
          setIsEditorOpen(false);
        } else {
          const errorData = await saveRes.json();
          alert(errorData.error || t('Failed to convert quotation.'));
        }
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
          const matchedItem = items.find(it => it.id === parseInt(val));
          if (matchedItem) {
            updated.price = matchedItem.sales_price;
          }
        }
        return updated;
      }
      return item;
    }));
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

    return {
      subtotal,
      discount,
      cgst,
      sgst,
      igst,
      tax_amount: totalTax,
      round_off: roundOff,
      grand_total: grandTotal,
      items: mappedItems
    };
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    const summary = calculateInvoiceSummary();
    const payload = {
      invoice_number: invoiceNumber,
      invoice_type: 'quotation',
      party_id: selectedCustomerId,
      date: invoiceDate,
      due_date: invoiceDate, // due_date is same as date for quotations
      subtotal: summary.subtotal,
      discount: summary.discount,
      cgst: summary.cgst,
      sgst: summary.sgst,
      igst: summary.igst,
      tax_amount: summary.tax_amount,
      round_off: summary.round_off,
      grand_total: summary.grand_total,
      paid_amount: 0,
      balance_amount: summary.grand_total,
      payment_status: 'unpaid',
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
        alert(errorData.error || t('Failed to create quotation.'));
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
    const q = searchQuery.toLowerCase();
    return clientName.includes(q) || number.includes(q);
  });

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header">
        <div>
          <h2>{t('Quotation & Estimates')}</h2>
          <p>{t('Govern corporate proforma proposals, project estimations, and client quotes')}</p>
        </div>
        {!isEditorOpen && (
          <button className="btn btn-primary" onClick={handleOpenNew}>
            <Plus size={16} />
            <span>{t('Generate New Estimate')}</span>
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
                <span className="stat-label">{t('Total Estimates')}</span>
                <span className="stat-value">{invoices.length} {t('Quotations')}</span>
              </div>
            </div>

            <div className="glass-card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="stat-icon" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                <FileText size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-label">{t('Projected Value')}</span>
                <span className="stat-value text-gold">₹{invoices.reduce((a, b) => a + b.grand_total, 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="glass-card filter-bar">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder={t('Search by client, quotation no...')} 
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
                  <th>{t('Quotation No')}</th>
                  <th>{t('Billing Party')}</th>
                  <th>{t('Proposal Date')}</th>
                  <th>{t('Tax Amount')}</th>
                  <th>{t('Grand Total')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">
                      {t('Loading quotations...')}
                    </td>
                  </tr>
                ) : filteredInvoices.map(inv => {
                  const cust = customers.find(c => c.id === inv.party_id);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td>{cust ? cust.name : t('Unknown Client')}</td>
                      <td>{inv.date}</td>
                      <td>₹{inv.tax_amount.toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>₹{inv.grand_total.toLocaleString()}</td>
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
                    <td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">
                      {t('No quotations recorded.')}
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
                  'PROFORMA INVOICE',
                  generateItemsTableHtml(selectedInvoice.items, selectedInvoice.igst > 0)
                ) }} />
                <div className="no-print flex gap-4" style={{ marginTop: '2rem', padding: '0 40px 40px 40px' }}>
                  <button className="btn btn-primary" onClick={() => window.print()}>
                    <Printer size={16} />
                    <span>{t('Print Estimate')}</span>
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => handleConvertQuotation(selectedInvoice.id)}
                    style={{ backgroundColor: '#10b981', border: '1px solid #10b981' }}
                  >
                    <RefreshCw size={16} />
                    <span>{t('Generate Tax Invoice')}</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}>
                    <X size={16} />
                    <span>{t('Exit Details')}</span>
                  </button>
                </div>
              </div>
            ) : (
            <div className="invoice-sheet print-layout-container" style={{ background: '#fff', color: '#000', padding: '0', borderRadius: '0', width: '100%', maxWidth: '900px', margin: '0 auto', border: 'none', boxShadow: 'none', fontFamily: 'Arial, sans-serif' }}>
              {/* TOP BLANK SPACING (for pre-printed letterhead) */}
              <div style={{ height: '3.3in' }}></div>

              {/* DETAILS SECTION */}
              <div style={{ display: 'flex', width: '100%', fontSize: '10.5pt', lineHeight: '1.4', paddingLeft: '0.8in', boxSizing: 'border-box' }}>
                {/* Left Column: Customer details */}
                <div style={{ width: '4.5in', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '11pt', marginBottom: '2px' }}>
                    {customers.find(c => c.id === selectedInvoice.party_id)?.name}
                  </div>
                  <div style={{ whiteSpace: 'pre-line', marginBottom: '15px', minHeight: '45px' }}>
                    {customers.find(c => c.id === selectedInvoice.party_id)?.address}
                  </div>
                  <div style={{ display: 'flex', gap: '30px', marginBottom: '2px' }}>
                    <span>{t('State')} : {customers.find(c => c.id === selectedInvoice.party_id)?.state}</span>
                    <span>{t('State Code')} : {customers.find(c => c.id === selectedInvoice.party_id)?.state_code || '33'}</span>
                  </div>
                  <div>{t('GSTIN')} : {customers.find(c => c.id === selectedInvoice.party_id)?.gstin || t('UNREGISTERED')}</div>
                </div>

                {/* Right Column: Doc details (horizontally aligned with customer name) */}
                <div style={{ flex: 1, display: 'flex', paddingTop: '2px' }}>
                  {/* Doc Number Column */}
                  <div style={{ width: '1.8in', paddingLeft: '0.2in', boxSizing: 'border-box', fontWeight: 'bold' }}>
                    {selectedInvoice.invoice_number}
                  </div>
                  {/* Date Column */}
                  <div style={{ flex: 1, fontWeight: 'bold' }}>
                    {selectedInvoice.date}
                  </div>
                </div>
              </div>

              {/* VERTICAL SPACER BEFORE ITEMS LIST */}
              <div style={{ height: '1.1in' }}></div>

              {/* ITEMS SECTION */}
              <div style={{ width: '100%', fontSize: '10.5pt', boxSizing: 'border-box', minHeight: '3.0in' }}>
                {selectedInvoice.items?.map((item: any, index: number) => (
                  <div key={item.id} style={{ display: 'flex', width: '100%', marginBottom: '10px', alignItems: 'flex-start', pageBreakInside: 'avoid' }}>
                    {/* Sl No */}
                    <div style={{ width: '0.4in', paddingLeft: '0.8in', boxSizing: 'border-box' }}>
                      {index + 1}
                    </div>
                    {/* Description */}
                    <div style={{ width: '3.2in', whiteSpace: 'pre-line', paddingRight: '10px', boxSizing: 'border-box' }}>
                      <div style={{ fontWeight: 'bold' }}>{item.item_name}</div>
                      {item.description && <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>({item.description})</div>}
                    </div>
                    {/* HSN Code */}
                    <div style={{ width: '1.0in', boxSizing: 'border-box' }}>
                      48171000
                    </div>
                    {/* Qty & Unit */}
                    <div style={{ width: '0.8in', boxSizing: 'border-box' }}>
                      {item.quantity} {t('NOS')}
                    </div>
                    {/* Rate */}
                    <div style={{ width: '1.0in', textAlign: 'right', boxSizing: 'border-box' }}>
                      {item.price.toFixed(2)}
                    </div>
                    {/* Amount */}
                    <div style={{ width: '1.0in', textAlign: 'right', paddingRight: '0.2in', boxSizing: 'border-box' }}>
                      {item.total_amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* BOTTOM TOTALS SECTION */}
              <div style={{ marginTop: '0.5in', paddingLeft: '0.8in', paddingRight: '0.2in', display: 'flex', width: '100%', boxSizing: 'border-box', fontSize: '10.5pt', fontFamily: 'Arial, sans-serif' }}>
                {/* Left Side */}
                <div style={{ width: '4.5in', fontSize: '9.5pt', fontStyle: 'italic' }}>
                </div>

                {/* Right Side: GST & Grand Totals */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#555' }}>{t('Subtotal')}</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedInvoice.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedInvoice.cgst > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#555' }}>{t('CGST')}</span>
                      <span>{selectedInvoice.cgst.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedInvoice.sgst > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#555' }}>{t('SGST')}</span>
                      <span>{selectedInvoice.sgst.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedInvoice.igst > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#555' }}>{t('IGST')}</span>
                      <span>{selectedInvoice.igst.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedInvoice.round_off !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#555' }}>{t('Round Off')}</span>
                      <span>{selectedInvoice.round_off.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #aaa', paddingTop: '4px', marginTop: '4px', fontSize: '11.5pt', fontWeight: 'bold' }}>
                    <span>{t('Grand Total')}</span>
                    <span>{selectedInvoice.grand_total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="no-print flex gap-4" style={{ marginTop: '2rem', borderTop: '1px dashed #ccc', padding: '15px' }}>
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <Printer size={16} />
                  <span>{t('Print Estimate')}</span>
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleConvertQuotation(selectedInvoice.id)}
                  style={{ backgroundColor: '#10b981', border: '1px solid #10b981' }}
                >
                  <RefreshCw size={16} />
                  <span>{t('Generate Tax Invoice')}</span>
                </button>
                <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}>
                  <X size={16} />
                  <span>{t('Exit Details')}</span>
                </button>
              </div>
            </div>
            )
          ) : (
            <form onSubmit={handleSaveQuotation} className="glass-card flex flex-col gap-6">
              <div className="view-header" style={{ padding: 0 }}>
                <h3>{t('Proforma Estimate Entry')}</h3>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>{t('Estimate Number')}</label>
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
                  <label>{t('Proposal Date')}</label>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="form-control" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label style={{ fontWeight: 600 }}>{t('Estimate Line Items')}</label>
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
                    <label>{t('Estimate Declaration / Terms')}</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="form-control" />
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
                </div>
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn btn-primary" disabled={invoiceItems.some(it => it.item_id === 0)}>
                  <Save size={16} />
                  <span>{t('Save Estimate')}</span>
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

export default Quotation;