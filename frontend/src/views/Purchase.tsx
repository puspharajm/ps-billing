import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Trash2, FileText, Printer, X, Save, RefreshCw 
} from 'lucide-react';
import { API_URL } from '../App';
import SearchableSelect from '../components/SearchableSelect';
import type { CompanySettings } from '../App';
import type { Item, Supplier } from '../../../backend/src/types';
import { useAuth } from '../AuthContext';
import { parsePrintLayout, generateItemsTableHtml } from '../utils/printLayoutParser';
import './Views.css';

// Translation helper
const t = (val: string) => val;

interface PurchaseProps {
  settings: CompanySettings;
}

interface InvoiceItemInput {
  item_id: number;
  item_name: string;
  quantity: number;
  price: number;
  discount_pct: number;
}

export const Purchase: React.FC<PurchaseProps> = ({ settings }) => {
  const { authFetch } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uiTheme, setUiTheme] = useState<'modern' | 'basic'>('modern');
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  // Form states
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('Standard inward purchase entries.');
  const [gstRate, setGstRate] = useState<number>(18);
  const [isInterstate, setIsInterstate] = useState<boolean>(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemInput[]>([
    { item_id: 0, item_name: '', quantity: 1, price: 0, discount_pct: 0 }
  ]);

  // Search queries
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [supplierSearchQuery, setSupplierSearchQuery] = useState<string>('');
  const [isSupplierListOpen, setIsSupplierListOpen] = useState<boolean>(false);
  const [activeProductSearchIndex, setActiveProductSearchIndex] = useState<number | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');

  // Modals & UI States
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const findSupplierByName = (name: string) => {
    const normalizedName = name.trim().toLocaleLowerCase();
    return normalizedName
      ? suppliers.find(supplier => supplier.name.trim().toLocaleLowerCase() === normalizedName)
      : undefined;
  };

  const handleSupplierSearchChange = (value: string) => {
    setSupplierSearchQuery(value);
    setIsSupplierListOpen(true);
    const supplier = findSupplierByName(value);
    setSelectedSupplierId(Number(supplier?.id) || 0);
    if (supplier) setIsInterstate(supplier.state !== settings.state);
  };

  const ensureSelectedSupplier = async (): Promise<Supplier | undefined> => {
    const supplierName = supplierSearchQuery.trim();
    if (!supplierName) {
      alert(t('Enter a supplier name before saving.'));
      return undefined;
    }

    try {
      const response = await authFetch(`${API_URL}/suppliers`);
      if (!response.ok) {
        alert(t('Unable to verify the supplier list. Please try again.'));
        return undefined;
      }

      const currentSuppliers: Supplier[] = await response.json();
      setSuppliers(currentSuppliers);
      const normalizedName = supplierName.toLocaleLowerCase();
      const existingSupplier = currentSuppliers.find(supplier => supplier.name.trim().toLocaleLowerCase() === normalizedName);
      if (existingSupplier?.id) {
        setSelectedSupplierId(Number(existingSupplier.id));
        setIsInterstate(existingSupplier.state !== settings.state);
        return existingSupplier;
      }

      if (!window.confirm(t(`Supplier '${supplierName}' is not in the supplier list. Add it now and continue?`))) {
        return undefined;
      }

      const createResponse = await authFetch(`${API_URL}/suppliers`, {
        method: 'POST',
        body: JSON.stringify({
          name: supplierName,
          address: '',
          phone: '',
          email: '',
          state: settings.state || '',
          state_code: settings.state_code || '',
          gstin: '',
          opening_balance: 0,
          outstanding_balance: 0
        })
      });
      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        alert(errorData.error || t('Unable to add this supplier. Please check the supplier details and try again.'));
        return undefined;
      }

      const newSupplier: Supplier = await createResponse.json();
      setSuppliers(prev => [...prev, newSupplier]);
      setSelectedSupplierId(Number(newSupplier.id) || 0);
      setSupplierSearchQuery(newSupplier.name);
      setIsInterstate(newSupplier.state !== settings.state);
      return newSupplier;
    } catch (error) {
      console.error(error);
      alert(t('Unable to verify or add the supplier. Please check the server connection and try again.'));
      return undefined;
    }
  };

  // Sync with global theme
  useEffect(() => {
    const syncTheme = () => {
      setUiTheme((localStorage.getItem('uiMode') as 'modern' | 'basic') || 'modern');
    };
    syncTheme();
    const interval = setInterval(syncTheme, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchItemsAndLogs = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/invoices?type=purchase`);
      if (res.ok) setInvoices(await res.json());

      const suppRes = await authFetch(`${API_URL}/suppliers`);
      if (suppRes.ok) setSuppliers(await suppRes.json());

      const itemRes = await authFetch(`${API_URL}/items`);
      if (itemRes.ok) setItems(await itemRes.json());
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItemsAndLogs();
  }, []);

  // Recalculate invoice summary
  const resolveInvoiceItems = async (): Promise<{ rows: InvoiceItemInput[]; items: Item[] } | undefined> => {
    try {
      const response = await authFetch(`${API_URL}/items`);
      if (!response.ok) {
        alert(t('Unable to load inventory items. Please try again.'));
        return undefined;
      }

      let currentItems: Item[] = await response.json();
      const resolvedRows: InvoiceItemInput[] = [];

      for (let index = 0; index < invoiceItems.length; index += 1) {
        const row = invoiceItems[index];
        const searchName = String(row.item_name || '').trim().toLocaleLowerCase();
        let matched = currentItems.find(item => Number(item.id) === Number(row.item_id)) || currentItems.find(item =>
          item.name.trim().toLocaleLowerCase() === searchName || String(item.code || '').trim().toLocaleLowerCase() === searchName
        );

        if (!matched && searchName && Number(row.quantity) > 0 && Number(row.price) > 0) {
          const suggestedCode = `AUTO-${Date.now()}-${index + 1}`;
          if (!window.confirm(t(`'${row.item_name.trim()}' is not in inventory. Add it as a general product (code ${suggestedCode}) and continue?`))) {
            return undefined;
          }

          const createResponse = await authFetch(`${API_URL}/items`, {
            method: 'POST',
            body: JSON.stringify({
              code: suggestedCode,
              name: row.item_name.trim(),
              brand: 'Other',
              description: '',
              hp: '',
              rpm: '',
              poles: '',
              phase: '',
              frame: '',
              volts: '',
              purchase_price: Number(row.price),
              sales_price: 0,
              stock_qty: 0,
              low_stock_threshold: 2,
              gst_rate: gstRate,
              type: 'general'
            })
          });
          if (!createResponse.ok) {
            const errorData = await createResponse.json().catch(() => ({}));
            alert(errorData.error || t(`Unable to add '${row.item_name.trim()}' to inventory.`));
            return undefined;
          }

          matched = await createResponse.json();
          currentItems = [...currentItems, matched];
        }

        resolvedRows.push(matched
          ? { ...row, item_id: Number(matched.id), item_name: matched.name }
          : row);
      }

      setItems(currentItems);
      return { rows: resolvedRows, items: currentItems };
    } catch (error) {
      console.error(error);
      alert(t('Unable to resolve the purchase products. Please check the server connection and try again.'));
      return undefined;
    }
  };

  const calculateInvoiceSummary = (rows: InvoiceItemInput[] = invoiceItems, inventory: Item[] = items) => {
    let subtotal = 0;
    let discount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    const interstate = isInterstate;

    const mappedItems = rows.map(itemInput => {
      const matched = inventory.find(it => Number(it.id) === Number(itemInput.item_id));
      const itemName = matched?.name || String(itemInput.item_name || '').trim();
      const qty = Number(itemInput.quantity) || 0;
      const price = Number(itemInput.price) || 0;
      const discPct = Number(itemInput.discount_pct) || 0;
      if (!itemName || qty <= 0 || price <= 0) return null;

      const rawAmount = qty * price;
      const discAmount = (discPct / 100) * rawAmount;
      const taxableValue = rawAmount - discAmount;

      const rate = gstRate;
      let itemCgst = 0;
      let itemSgst = 0;
      let itemIgst = 0;

      if (interstate) {
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
        item_id: matched?.id ?? 0,
        item_name: itemName,
        hp: matched?.hp ?? '',
        rpm: matched?.rpm ?? '',
        poles: matched?.poles ?? '',
        phase: matched?.phase ?? '',
        frame: matched?.frame ?? '',
        quantity: qty,
        price: price,
        discount_pct: discPct,
        taxable_value: taxableValue,
        cgst_pct: interstate ? 0 : rate / 2,
        cgst_amount: itemCgst,
        sgst_pct: interstate ? 0 : rate / 2,
        sgst_amount: itemSgst,
        igst_pct: interstate ? rate : 0,
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

  const currentSummary = selectedInvoice || calculateInvoiceSummary();

  const handleAddRow = () => {
    setInvoiceItems(prev => [...prev, { item_id: 0, item_name: '', quantity: 1, price: 0, discount_pct: 0 }]);
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
        if (field === 'item_name') {
          const selectedItem = items.find(it => Number(it.id) === Number(item.item_id));
          if (!selectedItem || selectedItem.name.trim().toLowerCase() !== String(val).trim().toLowerCase()) {
            updated.item_id = 0;
          }
        }
        if (field === 'item_id') {
          const itemId = Number(val);
              const matchedItem = items.find(it => Number(it.id) === itemId);
          if (matchedItem) {
            updated.item_name = matchedItem.name;
            updated.price = matchedItem.purchase_price;
          }
        }
        return updated;
      }
      return item;
    }));
  };

  const validateInvoiceItems = (rows: InvoiceItemInput[] = invoiceItems, inventory: Item[] = items) => {
    if (!invoiceNumber.trim()) {
      alert(t('Please enter an invoice reference number before saving.'));
      return false;
    }

    const unresolvedProduct = rows.find(item => !inventory.some(inventoryItem =>
      (Number(inventoryItem.id) === Number(item.item_id) && Number(item.item_id) > 0) ||
      (String(item.item_name || '').trim() && (
        inventoryItem.name.trim().toLocaleLowerCase() === String(item.item_name || '').trim().toLocaleLowerCase() ||
        String(inventoryItem.code || '').trim().toLocaleLowerCase() === String(item.item_name || '').trim().toLocaleLowerCase()
      ))
    ));

    if (unresolvedProduct) {
      const productName = String(unresolvedProduct.item_name || '').trim();
      alert(productName
        ? t(`Product '${productName}' is not in the inventory. Select a listed model or add it under Items.`)
        : t('Select a product model from the inventory list before saving.'));
      return false;
    }

    const invalidRow = rows.find((item) => {
      const itemId = Number(item.item_id);
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const selectedItem = inventory.find(it => Number(it.id) === itemId) || inventory.find(it =>
        it.name.trim().toLocaleLowerCase() === String(item.item_name || '').trim().toLocaleLowerCase() ||
        String(it.code || '').trim().toLocaleLowerCase() === String(item.item_name || '').trim().toLocaleLowerCase()
      );

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
    const itemName = String(item.item_name || '').trim().toLocaleLowerCase();
    const selectedItem = items.find(it => Number(it.id) === itemId) || items.find(it =>
      it.name.trim().toLocaleLowerCase() === itemName || String(it.code || '').trim().toLocaleLowerCase() === itemName
    );

    return !selectedItem || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0;
  };

  const handleWhatsAppShare = () => {
    const summary = calculateInvoiceSummary();
    const suppName = suppliers.find(s => s.id === selectedSupplierId)?.name || 'Supplier';
    const text = `*PS - Billing - INWARD PURCHASE SUMMARY*%0A` +
                 `--------------------------------------%0A` +
                 `*Ref No:* ${invoiceNumber}%0A` +
                 `*Supplier:* ${suppName}%0A` +
                 `*Date:* ${invoiceDate}%0A` +
                 `*Grand Total:* ₹${summary.grand_total.toLocaleString()}%0A` +
                 `*Items Count:* ${summary.items.length}%0A` +
                 `--------------------------------------%0A` +
                 `Thank you. SMR Groups Billing.`;
    window.open(`https://api.whatsapp.com/send?text=${text}`);
  };

  const handleCsvExport = () => {
    const summary = calculateInvoiceSummary();
    const csvRows = [
      ['Item Name', 'Quantity', 'Rate', 'Discount %', 'Tax Amount', 'Total'],
      ...summary.items.map((it: any) => [
        it.item_name,
        it.quantity,
        it.price,
        it.discount_pct,
        it.cgst_amount + it.sgst_amount + it.igst_amount,
        it.total_amount
      ])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Purchase_Entry_${invoiceNumber || 'Entry'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPurchase = () => {
    const summary = selectedInvoice || calculateInvoiceSummary();
    const printInvoiceNumber = selectedInvoice?.invoice_number || invoiceNumber;
    const printDate = selectedInvoice?.date || invoiceDate;
    const supplier = suppliers.find(s => Number(s.id) === Number(selectedInvoice?.party_id ?? selectedSupplierId)) || {
      name: selectedInvoice?.party_name || supplierSearchQuery,
      address: selectedInvoice?.party_address || ''
    };
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character] || character);
    const invoiceItemsForPrint = selectedInvoice?.items || summary.items;
    const itemsTable = `<table><thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${invoiceItemsForPrint.map((item: any, index: number) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.item_name)}</td><td>${Number(item.quantity).toFixed(2)}</td><td>${Number(item.price).toFixed(2)}</td><td>${Number(item.total_amount).toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
    const invoiceData = {
      invoice_number: printInvoiceNumber,
      date: printDate,
      due_date: selectedInvoice?.due_date || invoiceDueDate,
      subtotal: summary.subtotal,
      discount: summary.discount,
      tax_amount: summary.tax_amount,
      cgst: summary.cgst,
      sgst: summary.sgst,
      igst: summary.igst,
      grand_total: summary.grand_total,
      paid_amount: selectedInvoice?.paid_amount ?? summary.grand_total,
      balance_amount: selectedInvoice?.balance_amount ?? 0
    };
    const body = settings.custom_print_layout
      ? parsePrintLayout(settings.custom_print_layout, settings, invoiceData, supplier, 'PURCHASE INVOICE', itemsTable)
      : `<main><header><h1>${escapeHtml(settings.company_name)}</h1><p>${escapeHtml(settings.address)}</p><p>GSTIN: ${escapeHtml(settings.gstin)}</p></header><h2>Purchase Invoice</h2><section><strong>Reference:</strong> ${escapeHtml(printInvoiceNumber)}<br><strong>Date:</strong> ${escapeHtml(printDate)}<br><strong>Supplier:</strong> ${escapeHtml(supplier.name)}<br><strong>Address:</strong> ${escapeHtml(supplier.address)}</section>${itemsTable}<section class="totals"><div>Subtotal: ₹${Number(summary.subtotal).toFixed(2)}</div><div>Discount: ₹${Number(summary.discount).toFixed(2)}</div><div>CGST: ₹${Number(summary.cgst).toFixed(2)}</div><div>SGST: ₹${Number(summary.sgst).toFixed(2)}</div><div>IGST: ₹${Number(summary.igst).toFixed(2)}</div><div class="grand">Grand Total: ₹${Number(summary.grand_total).toFixed(2)}</div></section><p>${escapeHtml(selectedInvoice?.notes || notes)}</p></main>`;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert(t('Please allow pop-ups to preview and print this invoice.'));
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(printInvoiceNumber)}</title><style>body{font:14px Arial,sans-serif;color:#111;margin:32px}main{max-width:900px;margin:auto}header{text-align:center;border-bottom:2px solid #222;padding-bottom:12px}h1{margin:0}h2{text-align:center}section{margin:18px 0}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #aaa;padding:8px;text-align:right}th:nth-child(2),td:nth-child(2){text-align:left}.totals{text-align:right;line-height:1.8}.grand{font-weight:bold;font-size:18px;border-top:2px solid #222;padding-top:8px}.print-button{display:block;margin:18px auto;padding:10px 24px}@media print{.print-button{display:none}body{margin:0}}</style></head><body>${body}<button class="print-button" onclick="window.print()">Print invoice</button></body></html>`);
    printWindow.document.close();
    printWindow.focus();
  };

  const handleViewPurchaseInvoice = async (id: number) => {
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

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditorOpen) {
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          const saveBtn = document.getElementById('save-purchase-bill-btn');
          if (saveBtn && !saveBtn.hasAttribute('disabled')) {
            saveBtn.click();
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsEditorOpen(false);
        }
        if (e.altKey && e.key.toLowerCase() === 'n') {
          e.preventDefault();
          handleAddRow();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen, invoiceItems, invoiceNumber, selectedSupplierId, invoiceDate, notes]);

  // localStorage Auto-save draft
  useEffect(() => {
    if (isEditorOpen && !selectedInvoice) {
      const interval = setInterval(() => {
        const draft = {
          invoiceNumber,
          selectedSupplierId,
          invoiceDate,
          invoiceDueDate,
          notes,
          invoiceItems
        };
        localStorage.setItem('purchase_entry_draft', JSON.stringify(draft));
        console.log('Saved draft to localStorage');
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isEditorOpen, selectedInvoice, invoiceNumber, selectedSupplierId, invoiceDate, invoiceDueDate, notes, invoiceItems]);

  const loadDraft = () => {
    const saved = localStorage.getItem('purchase_entry_draft');
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setInvoiceNumber(draft.invoiceNumber);
        setSelectedSupplierId(draft.selectedSupplierId);
        setInvoiceDate(draft.invoiceDate);
        setInvoiceDueDate(draft.invoiceDueDate);
        setNotes(draft.notes);
        setInvoiceItems(draft.invoiceItems);
        const matched = suppliers.find(s => s.id === draft.selectedSupplierId);
        if (matched) {
          setSupplierSearchQuery(matched.name);
          setIsInterstate(matched.state !== settings.state);
        }
        alert(t('Purchase draft restored successfully.'));
      } catch (e) {
        console.error(e);
      }
    } else {
      alert(t('No saved draft found.'));
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoiceNumber.trim()) {
      alert(t('Please enter an invoice reference number before saving.'));
      return;
    }

    if (invoiceItems.some(item => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0)) {
      alert(t('Validation Error: Ensure all quantity and rate inputs are positive numbers (> 0).'));
      return;
    }

    const supplier = await ensureSelectedSupplier();
    if (!supplier?.id) return;

    const resolution = await resolveInvoiceItems();
    if (!resolution) return;
    const normalizedItems = resolution.rows;
    setItems(resolution.items);
    setInvoiceItems(normalizedItems);
    if (!validateInvoiceItems(normalizedItems, resolution.items)) return;

    setSaving(true);
    const summary = calculateInvoiceSummary(normalizedItems, resolution.items);
    const payload = {
      invoice_number: invoiceNumber,
      invoice_type: 'purchase',
      party_id: Number(supplier.id),
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
      paid_amount: summary.grand_total, // complete payment mapping
      balance_amount: 0,
      payment_status: 'paid',
      notes: notes,
      items: summary.items
    };

    try {
      const res = await authFetch(`${API_URL}/invoices`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        localStorage.removeItem('purchase_entry_draft');
        setIsEditorOpen(false);
        fetchItemsAndLogs();
      } else {
        const errorData = await res.json();
        alert(errorData.error || t('Failed to save purchase bill.'));
      }
      setSaving(false);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  const handleOpenNewPurchase = () => {
    setSelectedInvoice(null);
    const year = new Date().getFullYear();
    const prefix = `PUR/${year}/`;
    const nextNumber = invoices.reduce((highest, invoice) => {
      const match = String(invoice.invoice_number || '').match(new RegExp(`^PUR/${year}/(\\d+)$`, 'i'));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    setInvoiceNumber(`${prefix}${String(nextNumber).padStart(4, '0')}`);
    setSelectedSupplierId(suppliers[0]?.id || 0);
    setSupplierSearchQuery(suppliers[0]?.name || '');
    setIsInterstate(suppliers[0] ? suppliers[0].state !== settings.state : false);
    setGstRate(18);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setInvoiceDueDate(new Date().toISOString().split('T')[0]);
    setNotes('Standard inward purchase entries.');
    setInvoiceItems([{ item_id: 0, item_name: '', quantity: 1, price: 0, discount_pct: 0 }]);
    setIsEditorOpen(true);
  };

  const filteredInvoices = invoices.filter(inv => {
    const supp = suppliers.find(s => s.id === inv.party_id);
    const suppName = supp ? supp.name.toLowerCase() : '';
    const number = inv.invoice_number.toLowerCase();
    const q = searchQuery.toLowerCase();
    return suppName.includes(q) || number.includes(q);
  });

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header">
        <div>
          <h2>{t('Purchase Ledger & POs')}</h2>
          <p>{t('Manage supplier inward invoices, stock replenishment logs, and purchase accounts')}</p>
        </div>
        {!isEditorOpen && (
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={loadDraft}>
              <RefreshCw size={16} />
              <span>{t('Restore Draft')}</span>
            </button>
            <button className="btn btn-primary" onClick={handleOpenNewPurchase}>
              <Plus size={16} />
              <span>{t('New Inward Purchase')}</span>
            </button>
          </div>
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
                <span className="stat-label">{t('Inward Bills')}</span>
                <span className="stat-value">{invoices.length} {t('Records')}</span>
              </div>
            </div>

            <div className="glass-card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="stat-icon" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                <FileText size={22} />
              </div>
              <div className="stat-info">
                <span className="stat-label">{t('Total Purchase Cost')}</span>
                <span className="stat-value text-gold">₹{invoices.reduce((a, b) => a + b.grand_total, 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="glass-card filter-bar">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder={t('Search by supplier, voucher ref...')} 
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
                  <th>{t('Ref No')}</th>
                  <th>{t('Supplier / Vendor')}</th>
                  <th>{t('Inward Date')}</th>
                  <th>{t('Tax Amount')}</th>
                  <th>{t('Grand Total')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">
                      {t('Loading purchases...')}
                    </td>
                  </tr>
                ) : filteredInvoices.map(inv => {
                  const supp = suppliers.find(s => s.id === inv.party_id);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td>{supp ? supp.name : t('Unknown Supplier')}</td>
                      <td>{inv.date}</td>
                      <td>₹{inv.tax_amount.toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>₹{inv.grand_total.toLocaleString()}</td>
                      <td>
                        <button className="btn btn-secondary" onClick={() => handleViewPurchaseInvoice(inv.id)}>
                          {t('View Details')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">
                      {t('No purchase bills found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="editor-overlay" style={{ zIndex: 999 }}>
          {uiTheme === 'basic' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px', fontFamily: '"Segoe UI", Tahoma, sans-serif' }}>
              <div style={{ display: 'flex', gap: '15px', flex: 1, minHeight: '500px' }}>
                
                {/* Left Column: Ref. No. List */}
                <div style={{ width: '130px', background: '#e0e0e0', border: '1px solid #808080', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ background: '#d4d0c8', borderBottom: '1px solid #808080', padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {t('Ref. No.')}
                  </div>
                  <div style={{ flex: 1, background: '#fff', border: '2px inset #fff', overflowY: 'auto', padding: '2px', fontSize: '0.9rem' }}>
                    {invoices.map((invoice, index) => (
                      <div key={invoice.id} onClick={() => handleViewPurchaseInvoice(invoice.id)} style={{ padding: '3px 6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {index + 1}. {invoice.invoice_number}
                      </div>
                    ))}
                    {invoices.length === 0 && <div style={{ padding: '4px 6px', color: '#666' }}>{t('No saved references')}</div>}
                  </div>
                  <div style={{ padding: '4px' }}>
                    <input type="text" className="classic-input" style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Right Column: Main Form */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#d4d0c8', border: '1px solid #808080', padding: '8px' }}>
                  
                  {/* Top Toolbar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #a0a0a0', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="classic-btn" style={{ background: '#fff' }} onClick={handlePrintPurchase}>{t('Print A4/PDF')}</button>
                      <button className="classic-btn" style={{ background: '#d1f2eb', fontWeight: 'bold' }} onClick={handleWhatsAppShare}>{t('WhatsApp')}</button>
                      <button className="classic-btn" style={{ background: '#d6eaf8', fontWeight: 'bold' }}>{t('Barcode Scan')}</button>
                      <button className="classic-btn" style={{ background: '#e8daef', fontWeight: 'bold' }}>{t('History')}</button>
                      <button className="classic-btn" style={{ background: '#d1f2eb', fontWeight: 'bold' }} onClick={handleCsvExport}>{t('Export Excel')}</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem' }}>
                      <span>{t('Auto-saved 20:24:11')}</span>
                      <button className="classic-btn" style={{ fontWeight: 'bold' }}>?</button>
                    </div>
                  </div>

                  {/* Header Form Area */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '45%' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <label style={{ width: '80px', fontWeight: 'bold' }}>{t('Ref. No. :')}</label>
                        <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="classic-input" style={{ width: '100px' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                        <label style={{ width: '80px', fontWeight: 'bold' }}>{t('Supplier :')}</label>
                        <input 
                          type="text" 
                          value={supplierSearchQuery} 
                          onChange={e => handleSupplierSearchChange(e.target.value)}
                          onFocus={() => setIsSupplierListOpen(true)}
                          className="classic-input" 
                          style={{ flex: 1 }} 
                        />
                        <button type="button" style={{ background: '#e0e0e0', border: '1px solid #a0a0a0', width: '20px', cursor: 'pointer' }}>▼</button>
                        {isSupplierListOpen && (
                          <div style={{ position: 'absolute', top: '100%', left: '80px', right: 0, maxHeight: '140px', overflowY: 'auto', zIndex: 1002, background: '#fff', border: '1px solid #808080' }}>
                            {suppliers.filter(supplier => supplier.name.toLowerCase().includes(supplierSearchQuery.toLowerCase())).map(supplier => (
                              <div key={supplier.id} onClick={() => { setSelectedSupplierId(Number(supplier.id) || 0); setSupplierSearchQuery(supplier.name); setIsInterstate(supplier.state !== settings.state); setIsSupplierListOpen(false); }} style={{ padding: '5px 8px', cursor: 'pointer' }}>{supplier.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '35%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <label style={{ width: '70px', fontWeight: 'bold' }}>{t('Ref. Date :')}</label>
                        <input type="text" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="classic-input" style={{ width: '120px' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <label style={{ width: '70px', fontWeight: 'bold' }}>{t('Inv. No. :')}</label>
                        <input type="text" value={invoiceNumber} readOnly className="classic-input" style={{ width: '120px' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <label style={{ width: '70px', fontWeight: 'bold' }}>{t('Inv. Date :')}</label>
                        <input type="text" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)} className="classic-input" style={{ width: '120px' }} />
                      </div>
                    </div>
                  </div>

                  {/* Data Grid Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, border: '1px solid #808080', background: '#fff', marginBottom: '15px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#e0e0e0', borderBottom: '1px solid #808080' }}>
                          <th style={{ width: '30px', padding: '4px', borderRight: '1px solid #a0a0a0' }}></th>
                          <th style={{ width: '40px', padding: '4px', borderRight: '1px solid #a0a0a0', textAlign: 'left' }}>{t('SL')}</th>
                          <th style={{ padding: '4px', borderRight: '1px solid #a0a0a0', textAlign: 'left' }}>{t('Product Name')}</th>
                          <th style={{ width: '60px', padding: '4px', borderRight: '1px solid #a0a0a0', textAlign: 'left' }}>{t('Unit')}</th>
                          <th style={{ width: '60px', padding: '4px', borderRight: '1px solid #a0a0a0', textAlign: 'right' }}>{t('Qty')}</th>
                          <th style={{ width: '80px', padding: '4px', borderRight: '1px solid #a0a0a0', textAlign: 'right' }}>{t('Rate')}</th>
                          <th style={{ width: '90px', padding: '4px', borderRight: '1px solid #a0a0a0', textAlign: 'right' }}>{t('Amount')}</th>
                          <th style={{ width: '60px', padding: '4px', borderRight: '1px solid #a0a0a0', textAlign: 'right' }}>{t('Disc%')}</th>
                          <th style={{ width: '40px', padding: '4px', textAlign: 'center' }}>{t('Del')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceItems.map((item, index) => {
                          const matched = items.find(it => Number(it.id) === Number(item.item_id));
                          const rate = item.price || 0;
                          const amt = rate * item.quantity;
                          return (
                            <tr key={index} style={{ borderBottom: '1px solid #e0e0e0' }}>
                              <td style={{ borderRight: '1px solid #e0e0e0', textAlign: 'center' }}>&gt;</td>
                              <td style={{ borderRight: '1px solid #e0e0e0', padding: '4px' }}>{index + 1}</td>
                              <td style={{ borderRight: '1px solid #e0e0e0', padding: '4px', position: 'relative' }}>
                                <input 
                                  type="text" 
                                  value={activeProductSearchIndex === index ? productSearchQuery : (item.item_name || matched?.name || '')}
                                  onChange={e => { setActiveProductSearchIndex(index); setProductSearchQuery(e.target.value); handleItemChange(index, 'item_name', e.target.value); }}
                                  onFocus={() => { setActiveProductSearchIndex(index); setProductSearchQuery(item.item_name || matched?.name || ''); }}
                                  onBlur={() => {
                                    const query = productSearchQuery.trim().toLowerCase();
                                    const exactMatch = items.find(product => product.name.trim().toLowerCase() === query || product.code.trim().toLowerCase() === query);
                                    if (exactMatch) handleItemChange(index, 'item_id', Number(exactMatch.id));
                                    setActiveProductSearchIndex(null);
                                  }}
                                  style={{ width: '100%', border: 'none', outline: 'none' }}
                                />
                                {activeProductSearchIndex === index && (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '140px', overflowY: 'auto', zIndex: 1001, background: '#fff', border: '1px solid #808080' }}>
                                    {items.filter(product => String(product.name || '').toLowerCase().includes(productSearchQuery.toLowerCase()) || String(product.code || '').toLowerCase().includes(productSearchQuery.toLowerCase())).map(product => (
                                      <div key={product.id} onMouseDown={e => e.preventDefault()} onClick={() => { handleItemChange(index, 'item_id', Number(product.id)); setProductSearchQuery(product.name); setActiveProductSearchIndex(null); }} style={{ padding: '5px 8px', cursor: 'pointer' }}>{product.code} - {product.name}</div>
                                    ))}
                                    {items.length > 0 && !items.some(product => String(product.name || '').toLowerCase().includes(productSearchQuery.toLowerCase()) || String(product.code || '').toLowerCase().includes(productSearchQuery.toLowerCase())) && (
                                      <div style={{ padding: '6px 8px', color: '#666' }}>{t('No matching model. Add it in Items before saving.')}</div>
                                    )}
                                    {items.length === 0 && <div style={{ padding: '6px 8px', color: '#666' }}>{t('No inventory models available. Add a product in Items before saving.')}</div>}
                                  </div>
                                )}
                              </td>
                              <td style={{ borderRight: '1px solid #e0e0e0', padding: '4px' }}>{t('NOS')}</td>
                              <td style={{ borderRight: '1px solid #e0e0e0', padding: '4px' }}>
                                <input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right' }} />
                              </td>
                              <td style={{ borderRight: '1px solid #e0e0e0', padding: '4px' }}>
                                <input type="number" value={item.price} onChange={e => handleItemChange(index, 'price', parseFloat(e.target.value) || 0)} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right' }} />
                              </td>
                              <td style={{ borderRight: '1px solid #e0e0e0', padding: '4px', textAlign: 'right' }}>
                                {amt.toFixed(2)}
                              </td>
                              <td style={{ borderRight: '1px solid #e0e0e0', padding: '4px' }}>
                                <input type="number" value={item.discount_pct} onChange={e => handleItemChange(index, 'discount_pct', parseFloat(e.target.value) || 0)} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right' }} />
                              </td>
                              <td style={{ padding: '4px', textAlign: 'center', color: 'red', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => handleRemoveRow(index)}>X</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ flex: 1, background: '#808080', minHeight: '100px' }}></div>
                    <div style={{ background: '#d4d0c8', borderTop: '1px solid #808080', padding: '2px 6px' }}>
                      <button onClick={handleAddRow} style={{ background: 'none', border: 'none', color: '#000', fontSize: '0.8rem', cursor: 'pointer' }}>+ Add Row (Alt+N)</button>
                    </div>
                  </div>

                  {/* Bottom Totals Area */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <div style={{ width: '45%' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{t('Narration :')}</div>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} className="classic-input" style={{ width: '100%', height: '60px', resize: 'none', marginBottom: '10px' }}></textarea>
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <label style={{ fontWeight: 'bold' }}>{t('GST Slab:')}</label>
                        <select className="classic-input" style={{ width: '60px' }} value={gstRate} onChange={e => setGstRate(Number(e.target.value))}>
                          <option value={18}>18%</option>
                          <option value={12}>12%</option>
                          <option value={5}>5%</option>
                          <option value={28}>28%</option>
                          <option value={0}>0%</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                          <input type="checkbox" checked={isInterstate} onChange={e => setIsInterstate(e.target.checked)} /> {t('Inter-state (IGST)')}
                        </label>
                      </div>
                    </div>

                    <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {[
                        { label: 'Amount :', val1: '', val2: currentSummary.subtotal.toFixed(2) },
                        { label: 'Discount :', val1: currentSummary.discount.toFixed(0), val2: (currentSummary.subtotal - currentSummary.discount).toFixed(2) },
                        { label: `CGST @ ${gstRate / 2}% :`, val1: currentSummary.cgst.toFixed(2), val2: (currentSummary.subtotal - currentSummary.discount + currentSummary.cgst).toFixed(2) },
                        { label: `SGST @ ${gstRate / 2}% :`, val1: currentSummary.sgst.toFixed(2), val2: (currentSummary.subtotal - currentSummary.discount + currentSummary.cgst + currentSummary.sgst).toFixed(2) },
                        { label: `IGST @ ${gstRate}% :`, val1: currentSummary.igst.toFixed(2), val2: (currentSummary.subtotal - currentSummary.discount + currentSummary.tax_amount).toFixed(2) },
                        { label: 'T.C.S @ :', val1: '0 %', val2: '0.00' },
                        { label: 'Round Off :', val1: currentSummary.round_off.toFixed(2), val2: currentSummary.grand_total.toFixed(2) },
                      ].map((row, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                          <label style={{ fontWeight: 'bold', width: '100px', textAlign: 'right' }}>{row.label}</label>
                          {row.val1 !== '' ? <input type="text" value={row.val1} readOnly className="classic-input" style={{ width: '60px', textAlign: 'center' }} /> : <div style={{ width: '60px' }}></div>}
                          <input type="text" value={row.val2} readOnly className="classic-input" style={{ width: '90px', textAlign: 'right', fontWeight: i === 6 ? 'bold' : 'normal' }} />
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '4px', borderTop: '2px solid #000', paddingTop: '4px' }}>
                        <label style={{ fontWeight: 'bold', width: '100px', textAlign: 'right' }}>{t('Grand Total :')}</label>
                        <div style={{ width: '60px' }}></div>
                        <span style={{ width: '90px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem', color: '#0a246a' }}>{currentSummary.grand_total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Bottom Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid red', marginTop: '15px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="classic-btn" style={{ width: '80px' }}>{t('Add')}</button>
                  <button className="classic-btn" style={{ width: '80px', fontWeight: 'bold' }} onClick={handleSavePurchase}>{t('Save')}</button>
                  <button className="classic-btn" style={{ width: '80px' }}>{t('Undo')}</button>
                  <button className="classic-btn" style={{ width: '80px', color: '#0a246a', fontWeight: 'bold' }} onClick={() => setIsEditorOpen(false)}>{t('Exit')}</button>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="classic-btn" style={{ width: '80px', color: '#808080' }} disabled>{t('Edit')}</button>
                  <button className="classic-btn" style={{ width: '80px', color: '#808080' }} disabled>{t('Delete')}</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="editor-container glass-card" style={{ maxWidth: '1000px', borderTop: '4px solid var(--color-accent-blue)', color: 'white' }}>
              {selectedInvoice ? (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                    <h3 className="text-gold">{t('Purchase Bill Details')}</h3>
                    <button className="text-secondary" onClick={() => setIsEditorOpen(false)}>
                      <X size={20} />
                    </button>
                  </div>

                  {settings.custom_print_layout ? (
                    <div className="invoice-sheet animate-slide-down" style={{ background: '#fff' }}>
                      <div dangerouslySetInnerHTML={{ __html: parsePrintLayout(
                        settings.custom_print_layout,
                        settings,
                        selectedInvoice,
                        { name: selectedInvoice.party_name, address: selectedInvoice.party_address, gstin: selectedInvoice.party_gstin },
                        'PURCHASE INVOICE',
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
                        <p style={{ fontWeight: 'bold', margin: '2px 0', fontSize: '0.9rem' }}>{selectedInvoice.party_name}</p>
                        <p style={{ margin: '2px 0', color: '#333' }}>{selectedInvoice.party_address}</p>
                        <p style={{ margin: '2px 0', fontWeight: 'bold' }}>{t('GSTIN : ')}{selectedInvoice.party_gstin || t('UNREGISTERED')}</p>
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
                        <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', margin: '0 0 6px 0', borderBottom: '1px solid #000', paddingBottom: '3px' }}>{t('Declaration & Terms')}</h4>
                        <p style={{ fontStyle: 'italic', margin: '4px 0', color: '#333' }}>{selectedInvoice.notes || t('Standard proforma dispatch declarations apply.')}</p>
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
                  )}
                </div>
              ) : (
                <form onSubmit={handleSavePurchase} className="flex flex-col gap-6">
                  <div className="view-header" style={{ padding: 0 }}>
                    <h3 className="text-gold">{t('New Inward Purchase Entry')}</h3>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>{t('Purchase Reference No')}</label>
                      <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="form-control" style={{ fontFamily: 'monospace', fontWeight: 600 }} required />
                    </div>

                    <div className="form-group relative">
                      <label>{t('Supplier / Vendor')}</label>
                      <input 
                        type="text" 
                        value={supplierSearchQuery} 
                        onChange={e => handleSupplierSearchChange(e.target.value)}
                        onFocus={() => setIsSupplierListOpen(true)}
                        placeholder={t('Search supplier by name...')}
                        className="form-control"
                        required
                      />
                      {isSupplierListOpen && (
                        <div className="classic-bevel-out" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', maxHeight: '150px', overflowY: 'auto', zIndex: 1001, border: '1px solid var(--color-border)' }}>
                          {suppliers.filter(s => s.name.toLowerCase().includes(supplierSearchQuery.toLowerCase())).map(s => (
                            <div 
                              key={s.id}
                              className="classic-listbox-item" 
                              onClick={() => { setSelectedSupplierId(s.id ?? 0); setSupplierSearchQuery(s.name); setIsInterstate(s.state !== settings.state); setIsSupplierListOpen(false); }}
                              style={{ padding: '8px 12px', fontSize: '0.85rem', color: '#fff', cursor: 'pointer' }}
                            >
                              {s.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>{t('Reference Date')}</label>
                      <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="form-control" />
                    </div>

                    <div className="form-group">
                      <label>{t('Invoice Date')}</label>
                      <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)} className="form-control" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label style={{ fontWeight: 600 }}>{t('Purchase Line Items')}</label>
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
                          {invoiceItems.map((item, index) => {
                            const matched = items.find(it => Number(it.id) === Number(item.item_id));
                            const isLow = matched ? matched.stock_qty <= matched.low_stock_threshold : false;
                            return (
                              <tr key={index}>
                                <td className="relative">
                                  <input 
                                    type="text" 
                                    value={activeProductSearchIndex === index ? productSearchQuery : (item.item_name || matched?.name || '')}
                                    onChange={e => { setActiveProductSearchIndex(index); setProductSearchQuery(e.target.value); handleItemChange(index, 'item_name', e.target.value); }}
                                    onFocus={() => { setActiveProductSearchIndex(index); setProductSearchQuery(item.item_name || matched?.name || ''); }}
                                    onBlur={() => {
                                      const query = productSearchQuery.trim().toLowerCase();
                                      const exactMatch = items.find(product => product.name.trim().toLowerCase() === query || product.code.trim().toLowerCase() === query);
                                      if (exactMatch) handleItemChange(index, 'item_id', Number(exactMatch.id));
                                      setActiveProductSearchIndex(null);
                                    }}
                                    placeholder={t('Search motor...')}
                                    className="form-control"
                                    style={{ width: '100%' }}
                                  />
                                  {activeProductSearchIndex === index && (
                                    <div className="classic-bevel-out" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', maxHeight: '140px', overflowY: 'auto', zIndex: 1001, border: '1px solid var(--color-border)' }}>
                                      {items.filter(it => String(it.name || '').toLowerCase().includes(productSearchQuery.toLowerCase()) || String(it.code || '').toLowerCase().includes(productSearchQuery.toLowerCase())).map(it => (
                                        <div 
                                          key={it.id}
                                          className="classic-listbox-item" 
                                          onMouseDown={e => e.preventDefault()}
                                          onClick={() => { handleItemChange(index, 'item_id', Number(it.id)); setActiveProductSearchIndex(null); }}
                                          style={{ padding: '8px 12px', fontSize: '0.85rem', color: '#fff', cursor: 'pointer' }}
                                        >
                                          {it.code} - {it.name}
                                        </div>
                                      ))}
                                      {items.length > 0 && !items.some(it => String(it.name || '').toLowerCase().includes(productSearchQuery.toLowerCase()) || String(it.code || '').toLowerCase().includes(productSearchQuery.toLowerCase())) && (
                                        <div style={{ padding: '8px 12px', color: '#cbd5e1', fontSize: '0.8rem' }}>{t('No matching model. Add it in Items before saving.')}</div>
                                      )}
                                      {items.length === 0 && <div style={{ padding: '8px 12px', color: '#cbd5e1', fontSize: '0.8rem' }}>{t('No inventory models available. Add a product in Items before saving.')}</div>}
                                    </div>
                                  )}
                                  {isLow && matched && (
                                    <span style={{ color: '#f59e0b', fontSize: '0.7rem', display: 'block', fontWeight: 'bold' }}>
                                      ⚠️ {t('Low stock (')} {matched.stock_qty} {t('left)')}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    value={item.quantity} 
                                    onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                                    className="form-control" 
                                    style={{ textAlign: 'center' }} 
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    value={item.price} 
                                    onChange={(e) => handleItemChange(index, 'price', parseFloat(e.target.value) || 0)}
                                    className="form-control" 
                                    style={{ textAlign: 'right' }} 
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    value={item.discount_pct} 
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-secondary" onClick={handleAddRow}>
                        <Plus size={14} />
                        <span>{t('Add Item Row')}</span>
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setIsBarcodeModalOpen(true)}>
                        {t('Barcode Scan')}
                      </button>
                    </div>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
                    <div className="flex flex-col gap-4">
                      <div className="form-group">
                        <label>{t('Narration / Remarks')}</label>
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
                    <button 
                      type="submit" 
                      id="save-purchase-bill-btn" 
                      className="btn btn-primary" 
                      disabled={saving || invoiceItems.some(isInvoiceRowInvalid)}
                    >
                      <Save size={16} />
                      <span>{t('Save Purchase')}</span>
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
      )}

      {/* Barcode scanner mock modal */}
      {isBarcodeModalOpen && (
        <div className="editor-overlay" style={{ zIndex: 1100 }}>
          <div className="glass-card flex flex-col gap-4" style={{ width: '90%', maxWidth: '400px', color: '#fff', background: '#1e293b', border: '1px solid var(--color-border)', padding: '20px' }}>
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
              <h4 style={{ margin: 0 }}>{t('Barcode Scanner Simulator')}</h4>
              <button onClick={() => setIsBarcodeModalOpen(false)} style={{ background: 'none', border: 'none', color: '#a0aec0', cursor: 'pointer' }}>X</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#a0aec0' }}>{t('Select an item to simulate scanning its barcode:')}</p>
            <SearchableSelect
              className="form-control"
              value=""
              options={items.filter(it => it.id != null).map(it => ({ value: String(it.id), label: `${it.name} [${it.code}]` }))}
              placeholder={t('Type to search items...')}
              aria-label={t('Select item to scan')}
              onChange={value => {
                const itemId = Number(value);
                if (itemId > 0) {
                  // Simulate scanning by adding or updating item
                  setInvoiceItems(prev => {
                    const emptyIdx = prev.findIndex(it => it.item_id === 0);
                    if (emptyIdx !== -1) {
                      return prev.map((it, idx) => {
                        if (idx === emptyIdx) {
                          const matched = items.find(item => item.id === itemId);
                          return { item_id: itemId, item_name: matched?.name || '', quantity: 1, price: matched ? matched.purchase_price : 0, discount_pct: 0 };
                        }
                        return it;
                      });
                    } else {
                      const matched = items.find(item => item.id === itemId);
                      return [...prev, { item_id: itemId, item_name: matched?.name || '', quantity: 1, price: matched ? matched.purchase_price : 0, discount_pct: 0 }];
                    }
                  });
                  setIsBarcodeModalOpen(false);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Help Shortcuts modal */}
      {isHelpOpen && (
        <div className="editor-overlay" style={{ zIndex: 1100 }}>
          <div className="glass-card flex flex-col gap-4" style={{ width: '90%', maxWidth: '400px', color: '#fff', background: '#1e293b', border: '1px solid var(--color-border)', padding: '20px' }}>
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
              <h4 style={{ margin: 0 }}>{t('Keyboard Shortcuts')}</h4>
              <button onClick={() => setIsHelpOpen(false)} style={{ background: 'none', border: 'none', color: '#a0aec0', cursor: 'pointer' }}>X</button>
            </div>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
              <li><strong>{t('Ctrl + S')}</strong>: {t('Save Purchase Bill')}</li>
              <li><strong>{t('Escape')}</strong>: {t('Exit editor panel')}</li>
              <li><strong>{t('Alt + N')}</strong>: {t('Add new item row')}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchase;
