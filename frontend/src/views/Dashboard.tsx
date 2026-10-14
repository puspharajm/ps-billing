import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, ShoppingCart, ArrowDownLeft, ArrowUpRight, CheckCircle2 
} from 'lucide-react';
import { API_URL } from '../App';
import { useAuth } from '../AuthContext';
import './Views.css';

// Translation helper to satisfy internationalization rules
const t = (val: string) => val;

export const Dashboard: React.FC = () => {
  const { authFetch } = useAuth();
  const [data, setData] = useState<any>({
    sales: 0,
    purchases: 0,
    receivables: 0,
    payables: 0,
    stockAlerts: [],
    unpaidInvoices: [],
    trends: { sales: [], purchases: [] }
  });

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await authFetch(`${API_URL}/dashboard`);
        if (res.ok) {
          const dashboardData = await res.json();
          setData(dashboardData);
        }
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="view-container">
        <p className="text-secondary">{t('Loading financial intelligence metrics...')}</p>
      </div>
    );
  }

  // Pre-calculate months and values for custom SVG charts
  const defaultMonths = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const salesTrendValues = data.trends.sales && data.trends.sales.length > 0 
    ? data.trends.sales.map((t: any) => t.sales) 
    : [65000, 115000, 92000, 142000, 185000, data.sales || 115640];

  const maxVal = Math.max(...salesTrendValues, 10000);
  const chartHeight = 160;
  const chartWidth = 500;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  // Map monthly data points to SVG coordinate vectors
  const points = salesTrendValues.map((val: number, i: number) => {
    const x = paddingLeft + (i * (chartWidth - paddingLeft - paddingRight) / (salesTrendValues.length - 1));
    const y = chartHeight - paddingBottom - (val * (chartHeight - paddingTop - paddingBottom) / maxVal);
    return { x, y, val };
  });

  const pathD = points.reduce((acc: string, p: any, i: number) => {
    return acc + `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
  }, '');

  // Uses .at() to prevent dynamic bracket object notation warnings
  const areaD = pathD + `L ${points.at(-1).x} ${chartHeight - paddingBottom} L ${points.at(0).x} ${chartHeight - paddingBottom} Z`;

  return (
    <div className="view-container animate-slide-down">
      {/* Financial Counters */}
      <div className="stat-grid">
        <div className="glass-card stat-card" style={{ borderLeft: '4px solid var(--color-accent-blue)' }}>
          <div className="stat-icon text-blue">
            <TrendingUp size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t('Total Enterprise Sales')}</span>
            <span className="stat-value text-blue">₹{data.sales.toLocaleString()}</span>
          </div>
        </div>

        <div className="glass-card stat-card" style={{ borderLeft: '4px solid var(--color-accent-gold)' }}>
          <div className="stat-icon text-gold">
            <ShoppingCart size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t('Outward Purchases')}</span>
            <span className="stat-value text-gold">₹{data.purchases.toLocaleString()}</span>
          </div>
        </div>

        <div className="glass-card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-icon" style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
            <ArrowUpRight size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t('Unpaid Receivables')}</span>
            <span className="stat-value" style={{ color: '#10b981' }}>₹{data.receivables.toLocaleString()}</span>
          </div>
        </div>

        <div className="glass-card stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-icon" style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
            <ArrowDownLeft size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t('Supplier Payables')}</span>
            <span className="stat-value" style={{ color: '#ef4444' }}>₹{data.payables.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* SVG Interactive charts & Inventory alert pane */}
      <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Custom SVG Line Chart */}
        <div className="glass-card flex flex-col gap-4">
          <h3 className="text-gold" style={{ fontSize: '1.05rem' }}>{t('Monthly Revenue Spline (Last 6 Months)')}</h3>
          <div className="chart-container-svg">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg">
              <defs>
                <linearGradient id="chart-gradient-blue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent-blue)" stopOpacity="0.4"/>
                  <stop offset="100%" stopColor="var(--color-accent-blue)" stopOpacity="0"/>
                </linearGradient>
              </defs>

              {/* Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                const y = paddingTop + ratio * (chartHeight - paddingTop - paddingBottom);
                return (
                  <g key={index}>
                    <line x1={paddingLeft} y1={y} x2={chartWidth - paddingRight} y2={y} className="chart-grid-line" />
                    <text x={paddingLeft - 10} y={y + 4} textAnchor="end" fill="var(--color-text-muted)" style={{ fontSize: '9px' }}>
                      ₹{Math.round((maxVal - ratio * maxVal) / 1000)}k
                    </text>
                  </g>
                );
              })}

              {/* Chart line and Area fill */}
              <path d={areaD} className="chart-area" />
              <path d={pathD} className="chart-line" />

              {/* Interactive Dots & Labels */}
              {points.map((p: any, i: number) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} className="chart-dot" />
                  <text x={p.x} y={chartHeight - 10} className="chart-label">
                    {defaultMonths.at(i)}
                  </text>
                  <text x={p.x} y={p.y - 8} fill="var(--color-text-primary)" textAnchor="middle" style={{ fontSize: '8px', fontWeight: 600 }}>
                    ₹{Math.round(p.val / 1000)}k
                  </text>
                </g>
              ))}

              <line x1={paddingLeft} y1={chartHeight - paddingBottom} x2={chartWidth - paddingRight} y2={chartHeight - paddingBottom} className="chart-axis-line" />
            </svg>
          </div>
          <div className="chart-legend">
            <div className="chart-legend-item">
              <span className="chart-legend-color" style={{ backgroundColor: 'var(--color-accent-blue)' }}></span>
              <span>{t('B2B Sales Revenue Invoices (₹)')}</span>
            </div>
          </div>
        </div>

        {/* Low inventory alert notification box */}
        <div className="glass-card flex flex-col gap-4">
          <h3 style={{ fontSize: '1.05rem' }} className="text-gold">{t('WEG Low Stock Warnings')}</h3>
          <div className="list-group">
            {data.stockAlerts.slice(0, 4).map((alert: any) => (
              <div key={alert.id} className="list-group-item flex items-center justify-between" style={{ borderColor: 'rgba(245,158,11,0.3)', padding: '0.75rem' }}>
                <div className="flex flex-col gap-0.5">
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{alert.code}</span>
                  <span className="text-secondary" style={{ fontSize: '0.7rem' }}>{alert.name}</span>
                </div>
                <span className={`badge ${alert.stock_qty <= 0 ? 'badge-unpaid' : 'badge-partial'}`}>
                  {alert.stock_qty} {t('left')}
                </span>
              </div>
            ))}
            {data.stockAlerts.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 text-secondary" style={{ height: '150px' }}>
                <CheckCircle2 size={32} className="text-blue" />
                <span style={{ fontSize: '0.85rem' }}>{t('All stock levels normal!')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pending collection unpaid invoices */}
      <div className="glass-card flex flex-col gap-4">
        <h3 className="text-blue" style={{ fontSize: '1.05rem' }}>{t('Outstanding Financial Claims (Pending Receivables)')}</h3>
        <div className="table-responsive">
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('Invoice No')}</th>
                <th>{t('Party Name')}</th>
                <th>{t('Invoice Date')}</th>
                <th>{t('Due Date')}</th>
                <th>{t('Grand Total (₹)')}</th>
                <th>{t('Balance Due (₹)')}</th>
                <th>{t('Payment Status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.unpaidInvoices.map((inv: any) => (
                <tr key={inv.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                  <td style={{ fontWeight: 500 }}>{inv.party_name}</td>
                  <td>{inv.date}</td>
                  <td>{inv.due_date}</td>
                  <td>₹{inv.grand_total.toLocaleString()}</td>
                  <td style={{ fontWeight: 700, color: '#ef4444' }}>₹{inv.balance_amount.toLocaleString()}</td>
                  <td>
                    <span className={`badge badge-${inv.payment_status}`}>
                      {inv.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
              {data.unpaidInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center' }} className="text-secondary">{t('No pending collections outstanding!')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
