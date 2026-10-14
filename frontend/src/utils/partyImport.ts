import { unzipSync } from 'fflate';

export interface ImportedParty {
  name: string;
  address: string;
  phone: string;
  email: string;
  state: string;
  state_code: string;
  gstin: string;
  opening_balance: number;
}

export interface PartyImportPreviewRow {
  line: number;
  party: ImportedParty;
  errors: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'customername', 'suppliername', 'partyname', 'company', 'companyname', 'businessname', 'firm', 'firmname'],
  address: ['address', 'billingaddress', 'street'],
  phone: ['phone', 'mobile', 'mobileno', 'phonenumber', 'contact', 'contactno', 'telephone'],
  email: ['email', 'emailaddress'],
  state: ['state', 'province'],
  state_code: ['statecode', 'stateid'],
  gstin: ['gstin', 'gstno', 'gstnumber', 'taxid', 'taxregistrationnumber'],
  opening_balance: ['openingbalance', 'balance', 'openingamount', 'openingdebit'],
};

const normalizeHeader = (value: unknown) => String(value ?? '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const normalizeName = (value: string) => value.trim().toLocaleLowerCase();

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (quoted || field.length === 0) {
        quoted = !quoted;
      } else {
        field += character;
      }
    } else if (!quoted && character === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('The file contains an unclosed quoted value.');
  row.push(field.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).find(line => line.trim()) ?? '';
  const delimiters = [',', '\t', ';', '|'];
  return delimiters.reduce((best, candidate) => {
    const count = sample.split(candidate).length - 1;
    return count > (sample.split(best).length - 1) ? candidate : best;
  }, ',');
}

function parseXml(bytes: Uint8Array, label: string): Document {
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error(`Could not read ${label} in the Excel workbook.`);
  return xml;
}

function validateXlsxArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  let endRecord = -1;
  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.byteLength) {
      endRecord = offset;
      break;
    }
  }
  if (endRecord < 0) throw new Error('The Excel file is not a valid ZIP-based workbook.');

  const entryCount = view.getUint16(endRecord + 10, true);
  const centralDirectorySize = view.getUint32(endRecord + 12, true);
  const centralDirectoryOffset = view.getUint32(endRecord + 16, true);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (entryCount > 500 || centralDirectoryEnd > endRecord) {
    throw new Error('The Excel workbook has an unsupported or unsafe archive layout.');
  }

  let offset = centralDirectoryOffset;
  let totalExpandedSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralDirectoryEnd || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('The Excel workbook archive is damaged.');
    }
    const compressedSize = view.getUint32(offset + 20, true);
    const expandedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (compressedSize === 0xffffffff || expandedSize === 0xffffffff) {
      throw new Error('ZIP64 Excel workbooks are not supported.');
    }
    totalExpandedSize += expandedSize;
    if (totalExpandedSize > 50 * 1024 * 1024) {
      throw new Error('The expanded Excel workbook is larger than the 50 MB safety limit.');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset > centralDirectoryEnd) throw new Error('The Excel workbook archive is damaged.');
}

function resolveWorkbookPath(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ['xl', ...target.split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

function parseXlsx(bytes: Uint8Array): string[][] {
  validateXlsxArchive(bytes);
  const archive = unzipSync(bytes);
  const workbookBytes = archive['xl/workbook.xml'];
  const relationshipsBytes = archive['xl/_rels/workbook.xml.rels'];
  if (!workbookBytes || !relationshipsBytes) throw new Error('This is not a valid XLSX workbook.');

  const workbook = parseXml(workbookBytes, 'the workbook');
  const relationships = parseXml(relationshipsBytes, 'the workbook relationships');
  const firstSheet = workbook.getElementsByTagNameNS('*', 'sheet').item(0);
  const relationshipId = firstSheet?.getAttribute('r:id')
    || firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (!relationshipId) throw new Error('The Excel workbook does not contain a readable worksheet.');

  const relationship = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship'))
    .find(item => item.getAttribute('Id') === relationshipId);
  const target = relationship?.getAttribute('Target');
  if (!target) throw new Error('The first Excel worksheet could not be located.');
  const worksheetBytes = archive[resolveWorkbookPath(target)];
  if (!worksheetBytes) throw new Error('The first Excel worksheet is missing or unsupported.');

  const sharedStringsBytes = archive['xl/sharedStrings.xml'];
  const sharedStrings = sharedStringsBytes
    ? Array.from(parseXml(sharedStringsBytes, 'shared strings').getElementsByTagNameNS('*', 'si'))
      .map(item => Array.from(item.getElementsByTagNameNS('*', 't')).map(text => text.textContent ?? '').join(''))
    : [];
  const worksheet = parseXml(worksheetBytes, 'the worksheet');
  const sheetData = worksheet.getElementsByTagNameNS('*', 'sheetData').item(0);
  if (!sheetData) throw new Error('The first Excel worksheet contains no tabular data.');

  return Array.from(sheetData.getElementsByTagNameNS('*', 'row')).map(rowElement => {
    const cells: string[] = [];
    for (const cell of Array.from(rowElement.children)) {
      if (cell.localName !== 'c') continue;
      const reference = cell.getAttribute('r') ?? '';
      const letters = reference.match(/^[A-Z]+/i)?.[0] ?? '';
      const column = letters.split('').reduce((value, letter) => value * 26 + letter.toUpperCase().charCodeAt(0) - 64, 0) - 1;
      const value = cell.getElementsByTagNameNS('*', 'v').item(0)?.textContent ?? '';
      const inlineText = Array.from(cell.getElementsByTagNameNS('*', 't')).map(text => text.textContent ?? '').join('');
      const cellValue = cell.getAttribute('t') === 's' ? sharedStrings[Number(value)] ?? '' : inlineText || value;
      if (column >= 0) cells[column] = cellValue;
    }
    return cells;
  }).filter(row => row.some(cell => cell !== undefined && cell !== ''));
}

async function parsePdf(bytes: Uint8Array): Promise<string[][]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const document = await pdfjsLib.getDocument({ data: bytes }).promise;
  if (document.numPages > 100) throw new Error('PDFs are limited to 100 pages.');

  const rows: string[][] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageRows: Array<{ y: number; cells: Array<{ x: number; text: string }> }> = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const transform = item.transform;
      const y = transform[5];
      let line = pageRows.find(candidate => Math.abs(candidate.y - y) <= 3);
      if (!line) {
        line = { y, cells: [] };
        pageRows.push(line);
      }
      line.cells.push({ x: transform[4], text: item.str.trim() });
    }
    rows.push(...pageRows
      .sort((a, b) => b.y - a.y)
      .map(row => row.cells.sort((a, b) => a.x - b.x).map(cell => cell.text)));
  }

  if (!rows.length) throw new Error('No selectable text was found in the PDF. Scanned/image-only PDFs are not supported.');
  return rows;
}

function toRecordRows(matrix: string[][]): Array<Record<string, unknown>> {
  const headerIndex = matrix.findIndex(row => row.some(cell => HEADER_ALIASES.name.includes(normalizeHeader(cell))));
  if (headerIndex < 0) throw new Error('Could not find a Name, Customer Name, or Supplier Name column in the file.');

  const headers = matrix[headerIndex].map(normalizeHeader);
  const fields = headers.map(header => Object.entries(HEADER_ALIASES)
    .find(([, aliases]) => aliases.includes(header))?.[0]);
  return matrix.slice(headerIndex + 1).map(cells => {
    const record: Record<string, unknown> = {};
    fields.forEach((field, index) => {
      if (field) record[field] = cells[index] ?? '';
    });
    return record;
  }).filter(record => Object.values(record).some(value => String(value ?? '').trim() !== ''));
}

function toJsonRows(value: unknown): Array<Record<string, unknown>> {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { records?: unknown }).records)
      ? (value as { records: unknown[] }).records
      : null;
  if (!source || source.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('JSON files must contain an array of party records (or a records array).');
  }
  return source as Array<Record<string, unknown>>;
}

function readField(record: Record<string, unknown>, field: string): unknown {
  const aliases = HEADER_ALIASES[field];
  const key = Object.keys(record).find(candidate => aliases.includes(normalizeHeader(candidate)));
  return key ? record[key] : '';
}

function stringField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function numberField(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const raw = String(value).trim();
  const negative = raw.startsWith('(') && raw.endsWith(')');
  const parsed = Number(raw.replace(/[₹,\s()]/g, ''));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function validateRows(records: Array<Record<string, unknown>>, existingNames: Set<string>): PartyImportPreviewRow[] {
  const importedNames = new Set<string>();
  return records.map((record, index) => {
    const name = stringField(readField(record, 'name'));
    const address = stringField(readField(record, 'address'));
    const phone = stringField(readField(record, 'phone'));
    const email = stringField(readField(record, 'email'));
    const state = stringField(readField(record, 'state')) || 'Andhra Pradesh';
    const stateCode = stringField(readField(record, 'state_code')) || '37';
    const gstin = stringField(readField(record, 'gstin')).toUpperCase();
    const openingBalance = numberField(readField(record, 'opening_balance'));
    const errors: string[] = [];

    if (!name) errors.push('Name is required');
    if (name.length > 200) errors.push('Name must be 200 characters or fewer');
    if (address.length > 1000) errors.push('Address must be 1000 characters or fewer');
    if (phone.length > 50) errors.push('Phone must be 50 characters or fewer');
    if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.push('Enter a valid email address');
    if (state.length > 100 || stateCode.length > 20) errors.push('State details are too long');
    if (gstin.length > 15 || (gstin && !/^[A-Z0-9]{15}$/.test(gstin))) errors.push('GSTIN must be 15 letters or numbers');
    if (openingBalance === null) errors.push('Opening balance must be a valid number');
    else if (Math.abs(openingBalance) > 1_000_000_000_000) errors.push('Opening balance is out of range');

    const normalizedName = normalizeName(name);
    if (normalizedName && existingNames.has(normalizedName)) errors.push('Name already exists and will be skipped');
    if (normalizedName && importedNames.has(normalizedName)) errors.push('Duplicate name in this file');
    if (normalizedName) importedNames.add(normalizedName);

    return {
      line: index + 1,
      party: {
        name,
        address,
        phone,
        email,
        state,
        state_code: stateCode,
        gstin,
        opening_balance: openingBalance ?? 0,
      },
      errors,
    };
  });
}

export async function parsePartyImportFile(file: File, existingNames: string[]): Promise<PartyImportPreviewRow[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  let records: Array<Record<string, unknown>>;

  if (extension === 'json') {
    records = toJsonRows(JSON.parse(await file.text()));
  } else if (extension === 'xlsx') {
    records = toRecordRows(parseXlsx(new Uint8Array(await file.arrayBuffer())));
  } else if (extension === 'pdf') {
    records = toRecordRows(await parsePdf(new Uint8Array(await file.arrayBuffer())));
  } else if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    const text = await file.text();
    records = toRecordRows(parseDelimited(text, extension === 'tsv' ? '\t' : detectDelimiter(text)));
  } else {
    throw new Error('Supported formats: .xlsx, .csv, .tsv, .txt, .json, and text-based .pdf.');
  }

  if (records.length === 0) throw new Error('No party records were found in this file.');
  if (records.length > 100) throw new Error('Imports are limited to 100 records at a time.');
  const names = new Set(existingNames.map(normalizeName));
  return validateRows(records, names);
}
