export interface CompanySettings {
  id: number;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  state_code: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  branch: string;
  terms_conditions: string;
  custom_print_layout?: string;
}

export interface Customer {
  id?: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  state: string;
  state_code: string;
  gstin: string;
  opening_balance: number;
  outstanding_balance: number;
  created_at?: string;
  is_deleted?: number;
}

export interface Supplier {
  id?: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  state: string;
  state_code: string;
  gstin: string;
  opening_balance: number;
  outstanding_balance: number;
  created_at?: string;
  is_deleted?: number;
}

export interface Item {
  id?: number;
  code: string;
  name: string;
  brand: string; // WEG or Other
  description: string;
  hp: string; // Power capacity (e.g. 1 HP, 5 HP, etc.)
  rpm: string; // RPM (750, 1000, 1500, 3000)
  poles: string; // 2P, 4P, 6P, 8P
  phase: string; // Single, Three
  frame: string; // Frame size (e.g. 80, 90S, 132M)
  volts: string; // Voltage requirements (e.g., 415V, 220V)
  purchase_price: number;
  sales_price: number;
  stock_qty: number;
  low_stock_threshold: number;
  gst_rate: number; // e.g. 18 (default for motors)
  created_at?: string;
  is_deleted?: number;
  type?: string; // 'motor' or 'general'
}

export type InvoiceType = 'sales' | 'purchase' | 'quotation';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface Invoice {
  id?: number;
  invoice_number: string;
  invoice_type: InvoiceType;
  party_id: number; // Customer ID or Supplier ID
  party_name?: string; // resolved on JOIN
  party_gstin?: string; // resolved on JOIN
  party_address?: string; // resolved on JOIN
  party_state?: string; // resolved on JOIN
  party_state_code?: string; // resolved on JOIN
  date: string;
  due_date: string;
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax_amount: number;
  round_off: number;
  grand_total: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: PaymentStatus;
  notes: string;
  is_converted?: number; // for quotations converted to sales invoices
  created_at?: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  item_id: number;
  item_name: string;
  hp: string;
  rpm: string;
  poles: string;
  phase: string;
  frame: string;
  quantity: number;
  price: number;
  discount_pct: number;
  taxable_value: number;
  cgst_pct: number;
  cgst_amount: number;
  sgst_pct: number;
  sgst_amount: number;
  igst_pct: number;
  igst_amount: number;
  total_amount: number;
}

export type PaymentType = 'receipt' | 'payment';

export interface Payment {
  id?: number;
  payment_number: string;
  type: PaymentType; // receipt (from customer) or payment (to supplier)
  party_id: number;
  party_name?: string; // resolved on JOIN
  invoice_id?: number;
  invoice_number?: string; // resolved on JOIN
  date: string;
  amount: number;
  mode: 'cash' | 'bank' | 'upi';
  reference_number: string;
  notes: string;
  created_at?: string;
}

export interface User {
  id?: number;
  username: string;
  password_hash: string;
  salt: string;
  role: 'admin' | 'user';
  license_number?: string;
  created_at?: string;
  last_login?: string;
}

export interface Session {
  id?: number;
  token: string;
  user_id: number;
  created_at?: string;
  expires_at: string;
}

export interface Licensee {
  id?: number;
  license_number: string;
  company_name: string;
  licensee_name: string;
  created_at?: string;
}
