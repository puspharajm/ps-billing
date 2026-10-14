import type { CompanySettings } from '../App';

export const parsePrintLayout = (
  layout: string,
  settings: CompanySettings,
  invoiceData: any,
  customerData: any,
  invoiceTypeStr: string,
  itemsTableHtml: string
): string => {
  if (!layout) return '';

  let html = layout;

  // Company Settings Placeholders
  html = html.replace(/{{company_name}}/g, settings.company_name || '');
  html = html.replace(/{{company_address}}/g, settings.address || '');
  html = html.replace(/{{company_gstin}}/g, settings.gstin || '');
  html = html.replace(/{{company_phone}}/g, settings.phone || '');
  html = html.replace(/{{company_email}}/g, settings.email || '');

  // Bank details
  html = html.replace(/{{bank_name}}/g, settings.bank_name || '');
  html = html.replace(/{{account_name}}/g, settings.account_name || '');
  html = html.replace(/{{account_number}}/g, settings.account_number || '');
  html = html.replace(/{{ifsc_code}}/g, settings.ifsc_code || '');
  
  html = html.replace(/{{terms_conditions}}/g, settings.terms_conditions || '');

  // Invoice Data Placeholders
  html = html.replace(/{{invoice_type}}/g, invoiceTypeStr || '');
  html = html.replace(/{{invoice_number}}/g, invoiceData.invoice_number || '');
  html = html.replace(/{{date}}/g, invoiceData.date || '');
  html = html.replace(/{{due_date}}/g, invoiceData.due_date || '');

  // Customer Data Placeholders
  html = html.replace(/{{customer_name}}/g, customerData?.name || 'Unknown Client');
  html = html.replace(/{{customer_address}}/g, customerData?.address || '');
  html = html.replace(/{{customer_gstin}}/g, customerData?.gstin || 'UNREGISTERED');

  // Totals Placeholders
  html = html.replace(/{{subtotal}}/g, (invoiceData.subtotal || 0).toFixed(2));
  html = html.replace(/{{discount}}/g, (invoiceData.discount || 0).toFixed(2));
  html = html.replace(/{{tax_amount}}/g, (invoiceData.tax_amount || 0).toFixed(2));
  html = html.replace(/{{cgst}}/g, (invoiceData.cgst || 0).toFixed(2));
  html = html.replace(/{{sgst}}/g, (invoiceData.sgst || 0).toFixed(2));
  html = html.replace(/{{igst}}/g, (invoiceData.igst || 0).toFixed(2));
  html = html.replace(/{{grand_total}}/g, (invoiceData.grand_total || 0).toFixed(2));
  html = html.replace(/{{paid_amount}}/g, (invoiceData.paid_amount || 0).toFixed(2));
  html = html.replace(/{{balance_amount}}/g, (invoiceData.balance_amount || 0).toFixed(2));

  // Items Table
  html = html.replace(/{{items_table}}/g, itemsTableHtml || '');

  return html;
};

export const generateItemsTableHtml = (items: any[], isIgst: boolean): string => {
  if (!items || items.length === 0) return '';
  
  let rowsHtml = '';
  items.forEach((item: any, idx: number) => {
    const taxStr = isIgst 
      ? `IGST ${item.igst_pct}%` 
      : `CGST/SGST ${item.cgst_pct}%`;
    
    rowsHtml += `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 4px; vertical-align: top;">${idx + 1}</td>
        <td style="padding: 8px 4px; vertical-align: top;">
          <div style="font-weight: bold;">${item.item_name}</div>
          <div style="font-size: 0.75rem; color: #555; margin-top: 2px;">
            ${item.hp} • ${item.rpm} • ${item.poles} • ${item.frame}Fr • ${taxStr}
          </div>
        </td>
        <td style="padding: 8px 4px; text-align: center; vertical-align: top; font-family: monospace;">8501</td>
        <td style="padding: 8px 4px; text-align: right; vertical-align: top; font-weight: bold;">
          ${(item.quantity || 0).toFixed(2)} Nos
        </td>
        <td style="padding: 8px 4px; text-align: right; vertical-align: top;">
          ${(item.price || 0).toFixed(2)}
        </td>
        <td style="padding: 8px 4px; text-align: right; vertical-align: top; font-weight: bold;">
          ${(item.total_amount || 0).toFixed(2)}
        </td>
      </tr>
    `;
  });

  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
      <thead>
        <tr style="border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
          <th style="padding: 8px 4px; text-align: left; width: 40px;">SL</th>
          <th style="padding: 8px 4px; text-align: left;">Description of Goods</th>
          <th style="padding: 8px 4px; text-align: center; width: 100px;">HSN Code</th>
          <th style="padding: 8px 4px; text-align: right; width: 90px;">Quantity</th>
          <th style="padding: 8px 4px; text-align: right; width: 110px;">Rate</th>
          <th style="padding: 8px 4px; text-align: right; width: 120px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
};
