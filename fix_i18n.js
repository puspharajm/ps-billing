const fs = require('fs');
let file = 'd:/SMR Groups Billing software/frontend/src/views/Reports.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('const t = (val: string) => val;')) {
  content = content.replace('type ReportTab', 'const t = (val: string) => val;\n\ntype ReportTab');
}

const replaces = [
  ['<h2>Financial Intelligence Reports</h2>', '<h2>{t(\\'Financial Intelligence Reports\\')}</h2>'],
  ['<p>Analyze P&L margins, trace client statements, and compile invoice audit books</p>', '<p>{t(\\'Analyze P&L margins, trace client statements, and compile invoice audit books\\')}</p>'],
  ['<span>Print Statement</span>', '<span>{t(\\'Print Statement\\')}</span>'],
  ['<span>Auditing Period:</span>', '<span>{t(\\'Auditing Period:\\')}</span>'],
  ['>\\n          Profit & Loss Summary\\n        <', '>\\n          {t(\\'Profit & Loss Summary\\')}\\n        <'],
  ['>\\n          Party Ledger Accounts\\n        <', '>\\n          {t(\\'Party Ledger Accounts\\')}\\n        <'],
  ['>\\n          Invoices Audit Book\\n        <', '>\\n          {t(\\'Invoices Audit Book\\')}\\n        <'],
  ['>Net Trading Profit<', '>{t(\\'Net Trading Profit\\')}<'],
  ['<p>Period: {fromDate} to {toDate}</p>', '<p>{t(\\'Period:\\')} {fromDate} {t(\\'to\\')} {toDate}</p>'],
  ['<p style={{ marginTop: \\'0.25rem\\' }}>Excludes collected GST taxes</p>', '<p style={{ marginTop: \\'0.25rem\\' }}>{t(\\'Excludes collected GST taxes\\')}</p>'],
  ['<span>Revenue Credit (Sales)</span>', '<span>{t(\\'Revenue Credit (Sales)\\')}</span>'],
  ['>Gross Product Sales:</span>', '>{t(\\'Gross Product Sales:\\')}</span>'],
  ['>Discounts Allowed:</span>', '>{t(\\'Discounts Allowed:\\')}</span>'],
  ['>GST Collected Liabilities:</span>', '>{t(\\'GST Collected Liabilities:\\')}</span>'],
  ['<span>Total Sales Grand Total:</span>', '<span>{t(\\'Total Sales Grand Total:\\')}</span>'],
  ['<span>Operating Debit (Purchases)</span>', '<span>{t(\\'Operating Debit (Purchases)\\')}</span>'],
  ['>Gross Inventory Purchases:</span>', '>{t(\\'Gross Inventory Purchases:\\')}</span>'],
  ['>Discounts Received:</span>', '>{t(\\'Discounts Received:\\')}</span>'],
  ['>Input Tax Credit Paid:</span>', '>{t(\\'Input Tax Credit Paid:\\')}</span>'],
  ['<span>Total Purchase Cost:</span>', '<span>{t(\\'Total Purchase Cost:\\')}</span>'],
  ['<label>Accounts Class</label>', '<label>{t(\\'Accounts Class\\')}</label>'],
  ['>\\n                  Clients (Debtors)\\n                <', '>\\n                  {t(\\'Clients (Debtors)\\')}\\n                <'],
  ['>\\n                  Suppliers (Creditors)\\n                <', '>\\n                  {t(\\'Suppliers (Creditors)\\')}\\n                <'],
  ['<label>Select Ledger Account</label>', '<label>{t(\\'Select Ledger Account\\')}</label>'],
  ['>LEDGER ACCOUNT STATEMENT</h3>', '>{t(\\'LEDGER ACCOUNT STATEMENT\\')}</h3>'],
  ['>Account Name: {ledgerData.party.name}</p>', '>{t(\\'Account Name:\\')} {ledgerData.party.name}</p>'],
  ['>GSTIN: {ledgerData.party.gstin || \\'UNREGISTERED\\'}</p>', '>{t(\\'GSTIN:\\')} {ledgerData.party.gstin || t(\\'UNREGISTERED\\')}</p>'],
  ['<p>Auditing Period: {fromDate} to {toDate}</p>', '<p>{t(\\'Auditing Period:\\')} {fromDate} {t(\\'to\\')} {toDate}</p>'],
  ['Outstanding Balance: ?', '{t(\\'Outstanding Balance: ?\\')}'],
  ['>Txn Date</th>', '>{t(\\'Txn Date\\')}</th>'],
  ['>Reference Voucher</th>', '>{t(\\'Reference Voucher\\')}</th>'],
  ['>Transaction Type</th>', '>{t(\\'Transaction Type\\')}</th>'],
  ['>Debit (?) [IN]</th>', '>{t(\\'Debit (?) [IN]\\')}</th>'],
  ['>Credit (?) [OUT]</th>', '>{t(\\'Credit (?) [OUT]\\')}</th>'],
  ['>Running Balance (?)</th>', '>{t(\\'Running Balance (?)\\')}</th>'],
  ['>OPENING_BAL</td>', '>{t(\\'OPENING_BAL\\')}</td>'],
  ['>Brought Forward Balance</td>', '>{t(\\'Brought Forward Balance\\')}</td>'],
  ['>No ledger transactions in period</td>', '>{t(\\'No ledger transactions in period\\')}</td>'],
  ['>\\n                Outward Sales Register\\n              <', '>\\n                {t(\\'Outward Sales Register\\')}\\n              <'],
  ['>\\n                Inward Purchase Register\\n              <', '>\\n                {t(\\'Inward Purchase Register\\')}\\n              <'],
  ['Audited Records: {allInvoices.length} Invoices', '{t(\\'Audited Records:\\')} {allInvoices.length} {t(\\'Invoices\\')}'],
  ['>Voucher Number</th>', '>{t(\\'Voucher Number\\')}</th>'],
  ['>Voucher Date</th>', '>{t(\\'Voucher Date\\')}</th>'],
  ['>Party Name</th>', '>{t(\\'Party Name\\')}</th>'],
  ['>Subtotal (?)</th>', '>{t(\\'Subtotal (?)\\')}</th>'],
  ['>CGST (?)</th>', '>{t(\\'CGST (?)\\')}</th>'],
  ['>SGST (?)</th>', '>{t(\\'SGST (?)\\')}</th>'],
  ['>IGST (?)</th>', '>{t(\\'IGST (?)\\')}</th>'],
  ['>Voucher Total (?)</th>', '>{t(\\'Voucher Total (?)\\')}</th>'],
  ['>Paid (?)</th>', '>{t(\\'Paid (?)\\')}</th>'],
  ['>O/s Balance (?)</th>', '>{t(\\'O/s Balance (?)\\')}</th>'],
  ['>No invoices in period</td>', '>{t(\\'No invoices in period\\')}</td>']
];

replaces.forEach(([from, to]) => {
  content = content.replace(from, to);
});

fs.writeFileSync(file, content);

let saFile = 'd:/SMR Groups Billing software/frontend/src/views/SuperAdmin.tsx';
let saContent = fs.readFileSync(saFile, 'utf8');
saContent = saContent.replace('<span>Admin</span>', '<span>{t(\\'Admin\\')}</span>');
fs.writeFileSync(saFile, saContent);

console.log('Done!');

