import React, { useState, useEffect } from 'react';
import { API_URL } from '../App';
import { useAuth } from '../AuthContext';
import { FilePlus, Save, Trash2, Edit, Search, CreditCard } from 'lucide-react';
import './Views.css';

const t = (val: string) => val;

export const DailyExpenses: React.FC = () => {
  const { authFetch } = useAuth();
  
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesGroups, setExpensesGroups] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form State
  const [id, setId] = useState<number | null>(null);
  const [refNo, setRefNo] = useState('');
  const [refDate, setRefDate] = useState(new Date().toISOString().split('T')[0]);
  const [expensesGroup, setExpensesGroup] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');

  const fetchExpenses = async () => {
    try {
      const res = await authFetch(`${API_URL}/daily-expenses`);
      if (res.ok) setExpenses(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await authFetch(`${API_URL}/expenses-groups`);
      if (res.ok) setExpensesGroups(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchExpenses();
    fetchGroups();
  }, []);

  const generateRefNo = () => {
    const today = new Date();
    const yyyymmdd = today.toISOString().split('T')[0].replace(/-/g, '');
    const todaysExpenses = expenses.filter(e => e.ref_no && e.ref_no.includes(yyyymmdd));
    const nextNum = (todaysExpenses.length + 1).toString().padStart(3, '0');
    setRefNo(`EXP-${yyyymmdd}-${nextNum}`);
  };

  const resetForm = () => {
    setId(null);
    generateRefNo();
    setRefDate(new Date().toISOString().split('T')[0]);
    setExpensesGroup('');
    setAmount('');
    setNarration('');
    setIsEditing(false);
    setError('');
  };

  const handleSelect = (expense: any) => {
    setId(expense.id);
    setRefNo(expense.ref_no);
    setRefDate(expense.ref_date);
    setExpensesGroup(expense.expenses_group);
    setAmount(expense.amount.toString());
    setNarration(expense.narration || '');
    setIsEditing(false); // Only view mode initially
  };

  const handleSave = async () => {
    if (!refNo || !refDate || !expensesGroup || !amount) {
      setError('Please fill in all required fields.');
      return;
    }
    try {
      const payload = {
        ref_no: refNo,
        ref_date: refDate,
        expenses_group: expensesGroup,
        amount: parseFloat(amount),
        narration: narration
      };
      
      let res;
      if (id) {
        res = await authFetch(`${API_URL}/daily-expenses/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await authFetch(`${API_URL}/daily-expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        await fetchExpenses();
        resetForm();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save expense');
      }
    } catch (err) {
      console.error(err);
      setError('Network error saving expense');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      const res = await authFetch(`${API_URL}/daily-expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchExpenses();
        resetForm();
      } else {
        setError('Failed to delete expense');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredExpenses = expenses.filter(e => 
    (e.ref_no && e.ref_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (e.expenses_group && e.expenses_group.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="view-container animate-slide-down">
      <div className="view-header" style={{ marginBottom: '15px' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CreditCard size={24} className="text-blue" />
            {t('Daily Expenses')}
          </h2>
          <p className="text-secondary">{t('Manage and track operational expenditures')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: '500px' }}>
        
        {/* Left Column: Sidebar List */}
        <div className="glass-card" style={{ width: '280px', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '15px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)' }}>
            <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', padding: '5px 10px', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--color-border)' }}>
              <Search size={16} className="text-secondary" />
              <input 
                type="text" 
                placeholder={t('Search Ref No or Group...')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', marginLeft: '8px', width: '100%', fontSize: '0.9rem' }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredExpenses.map(exp => (
              <div 
                key={exp.id}
                onClick={() => handleSelect(exp)}
                style={{
                  padding: '12px 15px',
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  background: exp.id === id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderLeft: exp.id === id ? '3px solid var(--color-primary)' : '3px solid transparent',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>{exp.ref_no}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  <span>{exp.expenses_group}</span>
                  <span className="text-gold font-mono" style={{ fontWeight: 600 }}>₹{exp.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Form Editor */}
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0' }}>
          
          {/* Toolbar */}
          <div className="module-toolbar" style={{ padding: '15px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={resetForm} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FilePlus size={16} /> {t('New')}
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={id !== null && !isEditing} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={16} /> {t('Save')}
            </button>
            <button className="btn btn-secondary" onClick={() => setIsEditing(true)} disabled={id === null} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Edit size={16} /> {t('Edit')}
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={id === null} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={16} /> {t('Delete')}
            </button>
          </div>

          {/* Form Content */}
          <div style={{ padding: '30px', flex: 1 }}>
            {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px 15px', borderRadius: '4px', marginBottom: '20px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', maxWidth: '800px' }}>
              
              <div className="form-group">
                <label className="form-label">{t('Reference Number')} *</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="text" 
                    value={refNo} 
                    onChange={e => setRefNo(e.target.value)}
                    className="form-control"
                    disabled={id !== null && !isEditing}
                    style={{ flex: 1, fontWeight: 600, color: 'var(--color-primary)' }}
                  />
                  {id === null && (
                    <button className="btn btn-secondary" onClick={generateRefNo} style={{ padding: '8px 12px' }}>
                      {t('Auto')}
                    </button>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('Date')} *</label>
                <input 
                  type="date" 
                  value={refDate} 
                  onChange={e => setRefDate(e.target.value)}
                  className="form-control"
                  disabled={id !== null && !isEditing}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('Expenses Group')} *</label>
                <input 
                  list="expenses-groups-datalist"
                  type="text"
                  value={expensesGroup} 
                  onChange={e => setExpensesGroup(e.target.value)}
                  className="form-control"
                  disabled={id !== null && !isEditing}
                  placeholder={t('Type or select group...')}
                />
                <datalist id="expenses-groups-datalist">
                  {expensesGroups.map(g => (
                    <option key={g.id} value={g.name} />
                  ))}
                  <option value={t('Travel')} />
                  <option value={t('Food & Dining')} />
                  <option value={t('Office Supplies')} />
                </datalist>
              </div>

              <div className="form-group">
                <label className="form-label">{t('Amount (₹)')} *</label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)}
                  className="form-control font-mono"
                  disabled={id !== null && !isEditing}
                  placeholder="0.00"
                />
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">{t('Narration / Description')}</label>
                <textarea 
                  value={narration} 
                  onChange={e => setNarration(e.target.value)}
                  className="form-control"
                  disabled={id !== null && !isEditing}
                  style={{ minHeight: '100px', resize: 'vertical' }}
                  placeholder={t('Enter details about this expense...')}
                />
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DailyExpenses;
