import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Edit, Trash2, X, Check, AlertTriangle, Cpu, Users, UserCheck, Tag, Wallet, Package, Upload, FileSpreadsheet, Download
} from 'lucide-react';
import { API_URL } from '../App';
import type { Customer, Supplier, Item } from '../../../backend/src/types';
import { parsePartyImportFile, type PartyImportPreviewRow } from '../utils/partyImport';
import { useAuth } from '../AuthContext';
import './Views.css';

const t = (val: string) => val;

export type MasterTab = 
  | 'item-group' 
  | 'item-master' 
  | 'product-master'
  | 'customer-master' 
  | 'supplier-master' 
  | 'sales-executive' 
  | 'company-staff' 
  | 'expenses-group';

interface MasterProps {
  defaultTab?: MasterTab;
}

export const Master: React.FC<MasterProps> = ({ defaultTab = 'item-master' }) => {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<MasterTab>(defaultTab);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Lists from API
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [itemGroups, setItemGroups] = useState<any[]>([]);
  const [salesExecs, setSalesExecs] = useState<any[]>([]);
  const [companyStaff, setCompanyStaff] = useState<any[]>([]);
  const [expensesGroups, setExpensesGroups] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<PartyImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Editing state
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingType, setEditingType] = useState<MasterTab>('item-master');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form states
  const [customerForm, setCustomerForm] = useState<Customer>({
    name: '', address: '', phone: '', email: '', state: 'Andhra Pradesh', state_code: '37', gstin: '', opening_balance: 0, outstanding_balance: 0
  });

  const [supplierForm, setSupplierForm] = useState<Supplier>({
    name: '', address: '', phone: '', email: '', state: 'Andhra Pradesh', state_code: '37', gstin: '', opening_balance: 0, outstanding_balance: 0
  });

  const [itemForm, setItemForm] = useState<Item>({
    code: '', name: '', brand: 'WEG', description: '', hp: '5.5 HP', rpm: '1500 RPM', poles: '4P', phase: 'Three', frame: '112M', volts: '415V',
    purchase_price: 0, sales_price: 0, stock_qty: 0, low_stock_threshold: 2, gst_rate: 18
  });

  const [basicForm, setBasicForm] = useState<any>({});

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGstinChange = async (val: string, formType: 'customer' | 'supplier') => {
    const uppercased = val.toUpperCase();
    if (formType === 'customer') {
      setCustomerForm(prev => ({ ...prev, gstin: uppercased }));
    } else {
      setSupplierForm(prev => ({ ...prev, gstin: uppercased }));
    }
    
    if (uppercased.length === 15) {
      try {
        const res = await authFetch(`${API_URL}/gst-lookup/${uppercased}`);
        if (res.ok) {
          const data = await res.json();
          if (confirm(`GST Details Found:\nCompany: ${data.company_name}\nAddress: ${data.address}\n\nApply to form?`)) {
            if (formType === 'customer') {
              setCustomerForm(prev => ({
                ...prev,
                name: data.company_name || prev.name,
                address: data.address || prev.address,
                state: data.state || prev.state,
                state_code: data.state_code || prev.state_code
              }));
            } else {
              setSupplierForm(prev => ({
                ...prev,
                name: data.company_name || prev.name,
                address: data.address || prev.address,
                state: data.state || prev.state,
                state_code: data.state_code || prev.state_code
              }));
            }
          }
        }
      } catch (err) {
        console.error("GST Lookup failed", err);
      }
    }
  };

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'item-master' || activeTab === 'product-master') {
        const res = await authFetch(`${API_URL}/items`);
        if (res.ok) setItems(await res.json());
      } else if (activeTab === 'customer-master') {
        const res = await authFetch(`${API_URL}/customers`);
        if (res.ok) setCustomers(await res.json());
      } else if (activeTab === 'supplier-master') {
        const res = await authFetch(`${API_URL}/suppliers`);
        if (res.ok) setSuppliers(await res.json());
      } else if (activeTab === 'item-group') {
        const res = await authFetch(`${API_URL}/item-groups`);
        if (res.ok) setItemGroups(await res.json());
      } else if (activeTab === 'sales-executive') {
        const res = await authFetch(`${API_URL}/sales-executives`);
        if (res.ok) setSalesExecs(await res.json());
      } else if (activeTab === 'company-staff') {
        const res = await authFetch(`${API_URL}/company-staff`);
        if (res.ok) setCompanyStaff(await res.json());
      } else if (activeTab === 'expenses-group') {
        const res = await authFetch(`${API_URL}/expenses-groups`);
        if (res.ok) setExpensesGroups(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    fetchData();
    setIsEditorOpen(false);
    setSearchQuery('');
  }, [activeTab]);

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const existingParties = activeTab === 'customer-master' ? customers : suppliers;
    setIsImportOpen(true);
    setImportFileName(file.name);
    setImportRows([]);
    setImportError(null);
    setImportResult(null);
    try {
      setImportRows(await parsePartyImportFile(file, existingParties.map(party => party.name)));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not read this file.');
    }
  };

  const downloadImportTemplate = () => {
    const csv = 'Name,Address,Phone,Email,State,State Code,GSTIN,Opening Balance\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'party-import-template.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportSave = async () => {
    const importableRows = importRows.filter(row => row.errors.length === 0);
    if (importableRows.length === 0) return;
    const previewSkippedCount = importRows.length - importableRows.length;
    const kind = activeTab === 'customer-master' ? 'customers' : 'suppliers';
    setIsImporting(true);
    setImportError(null);
    try {
      const response = await authFetch(`${API_URL}/master-import/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ records: importableRows.map(row => row.party) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not import records.');
      setImportRows([]);
      const skippedCount = previewSkippedCount + data.skippedCount;
      setImportResult(`${data.importedCount} record${data.importedCount === 1 ? '' : 's'} imported; ${skippedCount} row${skippedCount === 1 ? '' : 's'} skipped.`);
      await fetchData();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Network error while importing records.');
    } finally {
      setIsImporting(false);
    }
  };

  // Handle open editor for create
  const handleCreateOpen = () => {
    setEditingId(null);
    setErrorMessage(null);
    setEditingType(activeTab);
    
    if (activeTab === 'item-master') {
      setItemForm({
        code: '', name: '', brand: 'WEG', description: '', hp: '', rpm: '1500 RPM', poles: '4P', phase: 'Three', frame: '', volts: '415V',
        purchase_price: 0, sales_price: 0, stock_qty: 0, low_stock_threshold: 2, gst_rate: 18, type: 'motor'
      });
    } else if (activeTab === 'product-master') {
      setItemForm({
        code: '', name: '', brand: 'Other', description: '', hp: '', rpm: '', poles: '', phase: '', frame: '', volts: '',
        purchase_price: 0, sales_price: 0, stock_qty: 0, low_stock_threshold: 2, gst_rate: 18, type: 'general'
      });
    } else if (activeTab === 'customer-master') {
      setCustomerForm({
        name: '', address: '', phone: '', email: '', state: 'Andhra Pradesh', state_code: '37', gstin: '', opening_balance: 0, outstanding_balance: 0
      });
    } else if (activeTab === 'supplier-master') {
      setSupplierForm({
        name: '', address: '', phone: '', email: '', state: 'Andhra Pradesh', state_code: '37', gstin: '', opening_balance: 0, outstanding_balance: 0
      });
    } else if (activeTab === 'item-group' || activeTab === 'expenses-group') {
      setBasicForm({ name: '', description: '' });
    } else if (activeTab === 'sales-executive') {
      setBasicForm({ name: '', phone: '', email: '', region: '', commission_pct: 0 });
    } else if (activeTab === 'company-staff') {
      setBasicForm({ name: '', role: '', phone: '', email: '', basic_salary: 0 });
    }
    
    setIsEditorOpen(true);
  };

  // Handle open editor for edit
  const handleEditOpen = (id: number) => {
    setEditingId(id);
    setErrorMessage(null);
    setEditingType(activeTab);

    if (activeTab === 'item-master' || activeTab === 'product-master') {
      const it = items.find(x => x.id === id);
      if (it) setItemForm(it);
    } else if (activeTab === 'customer-master') {
      const cu = customers.find(x => x.id === id);
      if (cu) setCustomerForm(cu);
    } else if (activeTab === 'supplier-master') {
      const su = suppliers.find(x => x.id === id);
      if (su) setSupplierForm(su);
    } else if (activeTab === 'item-group') {
      const it = itemGroups.find(x => x.id === id);
      if (it) setBasicForm(it);
    } else if (activeTab === 'sales-executive') {
      const it = salesExecs.find(x => x.id === id);
      if (it) setBasicForm(it);
    } else if (activeTab === 'company-staff') {
      const it = companyStaff.find(x => x.id === id);
      if (it) setBasicForm(it);
    } else if (activeTab === 'expenses-group') {
      const it = expensesGroups.find(x => x.id === id);
      if (it) setBasicForm(it);
    }
    setIsEditorOpen(true);
  };

  const getApiEndpoint = (type: MasterTab) => {
    switch (type) {
      case 'item-master': return 'items';
      case 'product-master': return 'items';
      case 'customer-master': return 'customers';
      case 'supplier-master': return 'suppliers';
      case 'item-group': return 'item-groups';
      case 'sales-executive': return 'sales-executives';
      case 'company-staff': return 'company-staff';
      case 'expenses-group': return 'expenses-groups';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this record?'))) return;
    try {
      const ep = getApiEndpoint(activeTab);
      const res = await authFetch(`${API_URL}/${ep}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const json = await res.json();
        if (json.archived) alert(json.message); // Show message if it was soft-deleted due to foreign keys
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || t('Failed to delete'));
      }
    } catch (err) {
      console.error(err);
      alert(t('Network error'));
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    let payload: any = {};
    if (editingType === 'item-master' || editingType === 'product-master') payload = itemForm;
    else if (editingType === 'customer-master') payload = customerForm;
    else if (editingType === 'supplier-master') payload = supplierForm;
    else payload = basicForm;

    try {
      const ep = getApiEndpoint(editingType);
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `${API_URL}/${ep}/${editingId}` : `${API_URL}/${ep}`;

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsEditorOpen(false);
        fetchData();
      } else {
        const data = await res.json();
        setErrorMessage(data.error || t('Failed to save record'));
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(t('Network error'));
    }
  };

  const renderBasicForm = () => {
    const isGroups = activeTab === 'item-group' || activeTab === 'expenses-group';
    const isSales = activeTab === 'sales-executive';
    const isStaff = activeTab === 'company-staff';

    return (
      <div className="form-grid">
        <div className="form-group">
          <label>{t('Name')} *</label>
          <input type="text" className="form-control" value={basicForm.name || ''} onChange={e => setBasicForm({...basicForm, name: e.target.value})} placeholder={t('Enter Name')} />
        </div>
        
        {isGroups && (
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>{t('Description')}</label>
            <input type="text" className="form-control" value={basicForm.description || ''} onChange={e => setBasicForm({...basicForm, description: e.target.value})} />
          </div>
        )}

        {(isSales || isStaff) && (
          <>
            <div className="form-group">
              <label>{t('Phone')}</label>
              <input type="text" className="form-control" value={basicForm.phone || ''} onChange={e => setBasicForm({...basicForm, phone: e.target.value})} />
            </div>
            <div className="form-group">
              <label>{t('Email')}</label>
              <input type="email" className="form-control" value={basicForm.email || ''} onChange={e => setBasicForm({...basicForm, email: e.target.value})} />
            </div>
          </>
        )}

        {isSales && (
          <>
            <div className="form-group">
              <label>{t('Region')}</label>
              <input type="text" className="form-control" value={basicForm.region || ''} onChange={e => setBasicForm({...basicForm, region: e.target.value})} />
            </div>
            <div className="form-group">
              <label>{t('Commission %')}</label>
              <input type="number" step="0.1" className="form-control" value={basicForm.commission_pct || ''} onChange={e => setBasicForm({...basicForm, commission_pct: parseFloat(e.target.value) || 0})} />
            </div>
          </>
        )}

        {isStaff && (
          <>
            <div className="form-group">
              <label>{t('Role / Designation')}</label>
              <input type="text" className="form-control" value={basicForm.role || ''} onChange={e => setBasicForm({...basicForm, role: e.target.value})} />
            </div>
            <div className="form-group">
              <label>{t('Basic Salary / Wages (₹)')}</label>
              <input type="number" className="form-control" value={basicForm.basic_salary || ''} onChange={e => setBasicForm({...basicForm, basic_salary: parseFloat(e.target.value) || 0})} />
            </div>
          </>
        )}
      </div>
    );
  };

  const renderForm = () => {
    if (editingType === 'item-master') {
      return (
        <div className="form-grid">
          <div className="form-group">
            <label>{t('Item Code')} *</label>
            <input type="text" className="form-control" value={itemForm.code} onChange={e => setItemForm({...itemForm, code: e.target.value})} placeholder="e.g. WEG001" />
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>{t('Item Name')} *</label>
            <input type="text" className="form-control" value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} placeholder="e.g. Three Phase Induction Motor" />
          </div>
          <div className="form-group">
            <label>{t('Brand')}</label>
            <select className="form-control" value={itemForm.brand} onChange={e => setItemForm({...itemForm, brand: e.target.value})}>
              <option value="WEG">{t('WEG')}</option>
              <option value="Crompton">{t('Crompton')}</option>
              <option value="ABB">{t('ABB')}</option>
              <option value="Siemens">{t('Siemens')}</option>
              <option value="Other">{t('Other')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('HP / kW')}</label>
            <input type="text" className="form-control" value={itemForm.hp || ''} onChange={e => setItemForm({...itemForm, hp: e.target.value})} placeholder="e.g. 5.5 HP / 4 kW" />
          </div>
          <div className="form-group">
            <label>{t('RPM')}</label>
            <input type="text" className="form-control" value={itemForm.rpm || ''} onChange={e => setItemForm({...itemForm, rpm: e.target.value})} placeholder="e.g. 1500 RPM" />
          </div>
          <div className="form-group">
            <label>{t('Poles')}</label>
            <input type="text" className="form-control" value={itemForm.poles || ''} onChange={e => setItemForm({...itemForm, poles: e.target.value})} placeholder="e.g. 4P" />
          </div>
          <div className="form-group">
            <label>{t('Phase')}</label>
            <select className="form-control" value={itemForm.phase || 'Three'} onChange={e => setItemForm({...itemForm, phase: e.target.value})}>
              <option value="Three">{t('Three Phase')}</option>
              <option value="Single">{t('Single Phase')}</option>
              <option value="DC">{t('DC')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('Frame Size')}</label>
            <input type="text" className="form-control" value={itemForm.frame || ''} onChange={e => setItemForm({...itemForm, frame: e.target.value})} placeholder="e.g. 112M" />
          </div>
          <div className="form-group">
            <label>{t('Voltage')}</label>
            <input type="text" className="form-control" value={itemForm.volts || ''} onChange={e => setItemForm({...itemForm, volts: e.target.value})} placeholder="e.g. 415V" />
          </div>
          <div className="form-group">
            <label>{t('Purchase Price')}</label>
            <input type="number" className="form-control" value={itemForm.purchase_price} onChange={e => setItemForm({...itemForm, purchase_price: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="form-group">
            <label>{t('Sales Price')} *</label>
            <input type="number" className="form-control" value={itemForm.sales_price} onChange={e => setItemForm({...itemForm, sales_price: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="form-group">
            <label>{t('GST Rate (%)')}</label>
            <select className="form-control" value={itemForm.gst_rate} onChange={e => setItemForm({...itemForm, gst_rate: parseFloat(e.target.value) || 0})}>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('Low Stock Threshold')}</label>
            <input type="number" className="form-control" value={itemForm.low_stock_threshold} onChange={e => setItemForm({...itemForm, low_stock_threshold: parseFloat(e.target.value) || 0})} />
          </div>
        </div>
      );
    } else if (editingType === 'product-master') {
      return (
        <div className="form-grid">
          <div className="form-group">
            <label>{t('Product Code')} *</label>
            <input type="text" className="form-control" value={itemForm.code} onChange={e => setItemForm({...itemForm, code: e.target.value})} placeholder="e.g. PRD001" />
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>{t('Product Name')} *</label>
            <input type="text" className="form-control" value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} placeholder="e.g. Wire Bundle, Switch, etc." />
          </div>
          <div className="form-group">
            <label>{t('Unit / Brand')}</label>
            <input type="text" className="form-control" value={itemForm.brand} onChange={e => setItemForm({...itemForm, brand: e.target.value})} placeholder="e.g. NOS, KGS, Polycab" />
          </div>
          <div className="form-group">
            <label>{t('Purchase Price')}</label>
            <input type="number" className="form-control" value={itemForm.purchase_price} onChange={e => setItemForm({...itemForm, purchase_price: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="form-group">
            <label>{t('Sales Price')} *</label>
            <input type="number" className="form-control" value={itemForm.sales_price} onChange={e => setItemForm({...itemForm, sales_price: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="form-group">
            <label>{t('GST Rate (%)')}</label>
            <select className="form-control" value={itemForm.gst_rate} onChange={e => setItemForm({...itemForm, gst_rate: parseFloat(e.target.value) || 0})}>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('Low Stock Threshold')}</label>
            <input type="number" className="form-control" value={itemForm.low_stock_threshold} onChange={e => setItemForm({...itemForm, low_stock_threshold: parseFloat(e.target.value) || 0})} />
          </div>
        </div>
      );
    } else if (editingType === 'customer-master' || editingType === 'supplier-master') {
      const form = editingType === 'customer-master' ? customerForm : supplierForm;
      const setForm = editingType === 'customer-master' ? setCustomerForm : setSupplierForm;
      return (
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>{t('Party Name')} *</label>
            <input type="text" className="form-control" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Company or Individual Name" />
          </div>
          <div className="form-group">
            <label>{t('Phone')}</label>
            <input type="text" className="form-control" value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} />
          </div>
          <div className="form-group">
            <label>{t('Email')}</label>
            <input type="email" className="form-control" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>{t('Address')}</label>
            <input type="text" className="form-control" value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} />
          </div>
          <div className="form-group">
            <label>{t('State')}</label>
            <input type="text" className="form-control" value={form.state || ''} onChange={e => setForm({...form, state: e.target.value})} />
          </div>
          <div className="form-group">
            <label>{t('State Code')}</label>
            <input type="text" className="form-control" value={form.state_code || ''} onChange={e => setForm({...form, state_code: e.target.value})} />
          </div>
          <div className="form-group">
            <label>{t('GSTIN')}</label>
            <input type="text" className="form-control" value={form.gstin || ''} onChange={e => handleGstinChange(e.target.value, editingType === 'customer-master' ? 'customer' : 'supplier')} placeholder="e.g. 37XXXXX1234X1ZX" maxLength={15} />
            <small className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{t('Enter 15-digit GSTIN to auto-fill details')}</small>
          </div>
          <div className="form-group">
            <label>{t('Opening Balance')}</label>
            <input type="number" className="form-control" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: parseFloat(e.target.value) || 0})} />
          </div>
        </div>
      );
    } else {
      return renderBasicForm();
    }
  };

  const filteredItems = items.filter(i => 
    (activeTab === 'item-master' ? i.type !== 'general' : i.type === 'general') &&
    (i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     i.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const filterList = (list: any[]) => list.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const tabs: { key: MasterTab; label: string; icon: React.ReactNode }[] = [
    { key: 'item-group', label: t('Item Group'), icon: <Tag size={15} /> },
    { key: 'item-master', label: t('Item Master'), icon: <Cpu size={15} /> },
    { key: 'product-master', label: t('Product Master'), icon: <Package size={15} /> },
    { key: 'customer-master', label: t('Customer Master'), icon: <Users size={15} /> },
    { key: 'supplier-master', label: t('Supplier Master'), icon: <UserCheck size={15} /> },
    { key: 'sales-executive', label: t('Sales Executive Master'), icon: <Users size={15} /> },
    { key: 'company-staff', label: t('Company Staff Details'), icon: <Users size={15} /> },
    { key: 'expenses-group', label: t('Expenses Group'), icon: <Wallet size={15} /> },
  ];

  const getTabLabel = (key: MasterTab) => tabs.find(t => t.key === key)?.label || key;

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header">
        <div>
          <h2>{t('Master Data Control')}</h2>
          <p>{t('Manage your inventory items, customers, suppliers, staff, and groups')}</p>
        </div>
        <div className="flex gap-2">
          {(activeTab === 'customer-master' || activeTab === 'supplier-master') && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.csv,.tsv,.txt,.json,.pdf"
                onChange={handleImportFile}
                style={{ display: 'none' }}
                aria-label={`Choose ${activeTab === 'customer-master' ? 'customer' : 'supplier'} import file`}
              />
              <button className="btn btn-secondary" onClick={() => importInputRef.current?.click()}>
                <Upload size={18} /><span>{t('Import')}</span>
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={handleCreateOpen}>
            <Plus size={18} /><span>{t('Add')} {getTabLabel(activeTab)}</span>
          </button>
        </div>
      </div>

      {/* Shared class `weg-stock-tabs` so they hide correctly in Classic Mode just like WegStock! */}
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

      <div className="glass-card flex flex-col gap-4">
        {/* Shared `weg-header` class so they convert to classic window headers in Classic Mode! */}
        <h3 className="weg-header" style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: '-0.5rem' }}>
          {getTabLabel(activeTab)}
        </h3>

        <div className="filter-bar">
          <div className="search-input-wrapper" style={{ maxWidth: '400px' }}>
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder={`${t('Search')} ${getTabLabel(activeTab)}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-control"
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="table-glass">
            <thead>
              {activeTab === 'item-master' && (
                <tr>
                  <th>{t('Code')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Brand / Specs')}</th>
                  <th>{t('Sales Price')}</th>
                  <th>{t('GST %')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              )}
              {activeTab === 'product-master' && (
                <tr>
                  <th>{t('Code')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Brand / Unit')}</th>
                  <th>{t('Sales Price')}</th>
                  <th>{t('GST %')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              )}
              {(activeTab === 'customer-master' || activeTab === 'supplier-master') && (
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Contact Info')}</th>
                  <th>{t('Location')}</th>
                  <th>{t('GSTIN')}</th>
                  <th>{t('Balance')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              )}
              {(activeTab === 'item-group' || activeTab === 'expenses-group') && (
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Description')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              )}
              {activeTab === 'sales-executive' && (
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Contact')}</th>
                  <th>{t('Region')}</th>
                  <th>{t('Comm %')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              )}
              {activeTab === 'company-staff' && (
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Role')}</th>
                  <th>{t('Contact')}</th>
                  <th>{t('Salary')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center' }} className="text-secondary">{t('Loading...')}</td></tr>
              ) : activeTab === 'item-master' ? (
                filteredItems.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.code}</td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                      {item.brand} | {item.hp} | {item.rpm}
                    </td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>₹{item.sales_price}</td>
                    <td>{item.gst_rate}%</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => handleEditOpen(item.id!)} style={{ padding: '0.4rem', color: 'var(--color-accent-blue)' }}><Edit size={14} /></button>
                        <button className="btn btn-secondary" onClick={() => handleDelete(item.id!)} style={{ padding: '0.4rem', color: '#ef4444' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : activeTab === 'product-master' ? (
                filteredItems.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.code}</td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td className="text-secondary" style={{ fontSize: '0.8rem' }}>
                      {item.brand}
                    </td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>₹{item.sales_price}</td>
                    <td>{item.gst_rate}%</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => handleEditOpen(item.id!)} style={{ padding: '0.4rem', color: 'var(--color-accent-blue)' }}><Edit size={14} /></button>
                        <button className="btn btn-secondary" onClick={() => handleDelete(item.id!)} style={{ padding: '0.4rem', color: '#ef4444' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : activeTab === 'customer-master' || activeTab === 'supplier-master' ? (
                filterList(activeTab === 'customer-master' ? customers : suppliers).map(party => (
                  <tr key={party.id}>
                    <td style={{ fontWeight: 600 }}>{party.name}</td>
                    <td className="text-secondary" style={{ fontSize: '0.85rem' }}>
                      <div>{party.phone}</div>
                      <div>{party.email}</div>
                    </td>
                    <td className="text-secondary" style={{ fontSize: '0.85rem' }}>{party.address ? `${party.address}, ${party.state}` : party.state}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{party.gstin || '—'}</td>
                    <td style={{ fontWeight: 600, color: party.outstanding_balance > 0 ? '#ef4444' : 'inherit' }}>₹{party.outstanding_balance}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => handleEditOpen(party.id)} style={{ padding: '0.4rem', color: 'var(--color-accent-blue)' }}><Edit size={14} /></button>
                        <button className="btn btn-secondary" onClick={() => handleDelete(party.id)} style={{ padding: '0.4rem', color: '#ef4444' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : activeTab === 'item-group' || activeTab === 'expenses-group' ? (
                filterList(activeTab === 'item-group' ? itemGroups : expensesGroups).map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td className="text-secondary">{item.description || '—'}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => handleEditOpen(item.id)} style={{ padding: '0.4rem', color: 'var(--color-accent-blue)' }}><Edit size={14} /></button>
                        <button className="btn btn-secondary" onClick={() => handleDelete(item.id)} style={{ padding: '0.4rem', color: '#ef4444' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : activeTab === 'sales-executive' ? (
                filterList(salesExecs).map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td className="text-secondary">{item.phone} / {item.email}</td>
                    <td>{item.region || '—'}</td>
                    <td style={{ fontWeight: 600, color: '#f59e0b' }}>{item.commission_pct}%</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => handleEditOpen(item.id)} style={{ padding: '0.4rem', color: 'var(--color-accent-blue)' }}><Edit size={14} /></button>
                        <button className="btn btn-secondary" onClick={() => handleDelete(item.id)} style={{ padding: '0.4rem', color: '#ef4444' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : activeTab === 'company-staff' ? (
                filterList(companyStaff).map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>{item.role || '—'}</td>
                    <td className="text-secondary">{item.phone} / {item.email}</td>
                    <td style={{ fontWeight: 600, color: '#10b981' }}>₹{item.basic_salary}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => handleEditOpen(item.id)} style={{ padding: '0.4rem', color: 'var(--color-accent-blue)' }}><Edit size={14} /></button>
                        <button className="btn btn-secondary" onClick={() => handleDelete(item.id)} style={{ padding: '0.4rem', color: '#ef4444' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {isImportOpen && (
        <div className="modal-overlay">
          <div
            className="glass-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="party-import-title"
            style={{ width: '100%', maxWidth: '1100px', margin: '2rem', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              <div>
                <h3 id="party-import-title" className="weg-header" style={{ fontWeight: 700, fontSize: '1.25rem', margin: 0 }}>
                  Import {activeTab === 'customer-master' ? 'Customers' : 'Suppliers'}
                </h3>
                <p className="text-secondary" style={{ margin: '0.35rem 0 0' }}>{importFileName}</p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setIsImportOpen(false)}
                style={{ padding: '0.5rem' }}
                aria-label="Close import preview"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              Supported: Excel (.xlsx), CSV, TSV, JSON, and text-based PDF. Scanned PDFs need to be converted to selectable text first. Files are read on this device; only the reviewed records are sent to the authenticated server.
            </p>

            {importError && (
              <div className="alert-error" role="alert" style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b' }}>
                <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                {importError}
              </div>
            )}
            {importResult && (
              <div role="status" style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: '#dcfce7', color: '#166534' }}>
                {importResult}
              </div>
            )}

            {!importResult && importRows.length > 0 && (
              <>
                <p style={{ marginBottom: '0.75rem' }}>
                  {importRows.filter(row => row.errors.length === 0).length} ready to import · {importRows.filter(row => row.errors.length > 0).length} skipped due to validation or duplicates
                </p>
                <div className="table-responsive" style={{ maxHeight: '50vh', overflow: 'auto' }}>
                  <table className="table-glass">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Address</th>
                        <th>State</th>
                        <th>GSTIN</th>
                        <th>Opening Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map(row => (
                        <tr key={row.line}>
                          <td>{row.line}</td>
                          <td>{row.party.name || '—'}</td>
                          <td>{row.party.phone || '—'}</td>
                          <td>{row.party.email || '—'}</td>
                          <td>{row.party.address || '—'}</td>
                          <td>{row.party.state}</td>
                          <td>{row.party.gstin || '—'}</td>
                          <td>{row.party.opening_balance.toLocaleString()}</td>
                          <td style={{ color: row.errors.length ? '#b91c1c' : '#15803d', minWidth: '180px' }}>
                            {row.errors.length ? row.errors.join('; ') : 'Ready'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex justify-between gap-3" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => importInputRef.current?.click()}>
                  <FileSpreadsheet size={16} /> Choose another file
                </button>
                <button className="btn btn-secondary" onClick={downloadImportTemplate}>
                  <Download size={16} /> CSV template
                </button>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => setIsImportOpen(false)}>
                  {importResult ? 'Done' : 'Cancel'}
                </button>
                {!importResult && (
                  <button
                    className="btn btn-primary"
                    onClick={handleImportSave}
                    disabled={isImporting || importRows.every(row => row.errors.length > 0)}
                  >
                    <Check size={18} />
                    <span>{isImporting ? 'Importing...' : 'Import valid records'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditorOpen && (
        <div className="modal-overlay">
          <div className="glass-card" style={{ width: '100%', maxWidth: '800px', margin: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
              {/* `weg-header` handles the classic header styling conversion */}
              <h3 className="weg-header" style={{ fontWeight: 700, fontSize: '1.25rem', margin: 0 }}>
                {editingId ? t('Edit') : t('Create')} {getTabLabel(editingType)}
              </h3>
              <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)} style={{ padding: '0.5rem' }}>
                <X size={18} />
              </button>
            </div>

            {errorMessage && (
              <div className="alert-error" style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {renderForm()}

            <div className="flex justify-end gap-3" style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <button className="btn btn-secondary" onClick={() => setIsEditorOpen(false)}>
                {t('Cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                <Check size={18} />
                <span>{t('Save Record')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Master;
