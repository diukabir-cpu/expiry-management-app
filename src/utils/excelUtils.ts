import * as XLSX from 'xlsx';
import type { ColumnMapping, EnrichedBatchRecord, MasterProduct } from '../types';
import { formatDisplayDate, getStatusLabel } from './dateAndExpiry';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: ColumnMapping;
}

export interface ValidatedImportRow {
  rowNumber: number;
  internationalBarcode: string;
  companyProductCode: string;
  productDescription: string;
  isExistingMatch: boolean;
}

export interface ImportValidationResult {
  validRows: ValidatedImportRow[];
  newCount: number;
  existingMatchCount: number;
  duplicateBarcodesInFile: Array<{ rowNumber: number; barcode: string }>;
  errors: Array<{ rowNumber: number; reason: string }>;
}

export function normalizeBarcode(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().replace(/\s+/g, '');
}

function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.t === 's') {
    return String(cell.v ?? '').trim();
  }
  if (cell.t === 'n') {
    const formatted = typeof cell.w === 'string' ? cell.w.trim() : '';
    // Preserve formatted text (including leading zeros) unless Excel turned it into scientific notation
    if (formatted && !/[eE][+-]?\d+/.test(formatted)) {
      return formatted;
    }
    if (typeof cell.v === 'number') {
      return Number.isInteger(cell.v) ? cell.v.toFixed(0) : String(cell.v);
    }
  }
  return String(cell.w ?? cell.v ?? '').trim();
}

export function parseSpreadsheetBuffer(buffer: ArrayBuffer, fileName = ''): ParsedSpreadsheet {
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  const workbook = XLSX.read(buffer, {
    type: 'array',
    raw: isCsv,
    cellText: true,
    cellNF: true,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      headers: [],
      rows: [],
      suggestedMapping: {
        internationalBarcode: '',
        companyProductCode: '',
        productDescription: '',
      },
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const ref = sheet['!ref'];
  if (!ref) {
    return {
      headers: [],
      rows: [],
      suggestedMapping: {
        internationalBarcode: '',
        companyProductCode: '',
        productDescription: '',
      },
    };
  }

  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];
  const headerCounts = new Map<string, number>();

  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    let header = cellToString(sheet[addr]);
    if (!header) header = `Column ${c + 1}`;
    const count = (headerCounts.get(header) ?? 0) + 1;
    headerCounts.set(header, count);
    headers.push(count > 1 ? `${header} (${count})` : header);
  }

  const rows: Record<string, string>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const record: Record<string, string> = {};
    let hasAnyValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const val = cellToString(sheet[addr]);
      const header = headers[c - range.s.c];
      record[header] = val;
      if (val !== '') hasAnyValue = true;
    }
    if (hasAnyValue) {
      rows.push(record);
    }
  }

  return {
    headers,
    rows,
    suggestedMapping: autoDetectColumnMapping(headers),
  };
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const lowerHeaders = headers.map((h) => ({ raw: h, norm: h.toLowerCase().trim() }));

  const findMatch = (patterns: RegExp[], exclude: string[] = []): string => {
    for (const pattern of patterns) {
      const found = lowerHeaders.find(
        (h) => !exclude.includes(h.raw) && pattern.test(h.norm)
      );
      if (found) return found.raw;
    }
    return '';
  };

  const internationalBarcode = findMatch([
    /international\s*barcode/i,
    /\bbarcode\b/i,
    /\bean\b/i,
    /\bupc\b/i,
    /\bgtin\b/i,
    /bar\s*code/i,
  ]);

  const companyProductCode = findMatch(
    [
      /company\s*(?:product)?\s*code/i,
      /\bproduct\s*code\b/i,
      /\bitem\s*code\b/i,
      /\bsku\b/i,
      /\bcode\b/i,
    ],
    [internationalBarcode]
  );

  const productDescription = findMatch(
    [
      /product\s*description/i,
      /\bdescription\b/i,
      /\bproduct\s*name\b/i,
      /\bitem\s*name\b/i,
      /\bname\b/i,
      /\btitle\b/i,
    ],
    [internationalBarcode, companyProductCode]
  );

  return {
    internationalBarcode,
    companyProductCode,
    productDescription,
  };
}

export function validateImportRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  existingBarcodes: Set<string>
): ImportValidationResult {
  const validRows: ValidatedImportRow[] = [];
  const duplicateBarcodesInFile: Array<{ rowNumber: number; barcode: string }> = [];
  const errors: Array<{ rowNumber: number; reason: string }> = [];
  const seenInFile = new Set<string>();

  let newCount = 0;
  let existingMatchCount = 0;

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // 1-indexed + header row
    const internationalBarcode = normalizeBarcode(row[mapping.internationalBarcode]);
    const companyProductCode = String(row[mapping.companyProductCode] ?? '').trim();
    const productDescription = String(row[mapping.productDescription] ?? '').trim();

    if (!internationalBarcode) {
      errors.push({ rowNumber, reason: 'Missing International Barcode' });
      return;
    }
    if (!productDescription) {
      errors.push({ rowNumber, reason: `Missing Product Description for barcode ${internationalBarcode}` });
      return;
    }

    if (seenInFile.has(internationalBarcode)) {
      duplicateBarcodesInFile.push({ rowNumber, barcode: internationalBarcode });
      return;
    }
    seenInFile.add(internationalBarcode);

    const isExistingMatch = existingBarcodes.has(internationalBarcode);
    if (isExistingMatch) existingMatchCount += 1;
    else newCount += 1;

    validRows.push({
      rowNumber,
      internationalBarcode,
      companyProductCode: companyProductCode || '-',
      productDescription,
      isExistingMatch,
    });
  });

  return {
    validRows,
    newCount,
    existingMatchCount,
    duplicateBarcodesInFile,
    errors,
  };
}

function forceStringColumns(sheet: XLSX.WorkSheet, stringColIndices: number[], rowCount: number) {
  for (let r = 0; r <= rowCount; r++) {
    for (const c of stringColIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
        cell.v = String(cell.v ?? '');
      }
    }
  }
}

export function buildMasterProductsWorkbook(products: MasterProduct[]): XLSX.WorkBook {
  const header = ['International Barcode', 'Company Product Code', 'Product Description', 'Source', 'Date Added'];
  const body = products.map((p) => [
    p.internationalBarcode,
    p.companyProductCode,
    p.productDescription,
    p.source === 'excel_import' ? 'Excel Import' : 'Manual Addition',
    p.dateAdded.slice(0, 10),
  ]);
  const aoa = [header, ...body];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  forceStringColumns(sheet, [0, 1], body.length);
  sheet['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 40 }, { wch: 16 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Master Products');
  return wb;
}

export function buildExpiryReportWorkbook(batches: EnrichedBatchRecord[]): XLSX.WorkBook {
  const header = [
    'Barcode',
    'Company Product Code',
    'Product Description',
    'Batch Number',
    'Quantity',
    'Expiry Date',
    'Days Remaining',
    'Status',
  ];
  const body = batches.map((b) => [
    b.internationalBarcode,
    b.companyProductCode,
    b.productDescription,
    b.batchNumber || '-',
    b.quantity !== undefined ? b.quantity : '-',
    formatDisplayDate(b.expiryDate, b.isMonthOnly) + ` (${b.expiryDate})`,
    b.daysRemaining,
    getStatusLabel(b.status),
  ]);
  const aoa = [header, ...body];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  forceStringColumns(sheet, [0, 1, 3], body.length);
  sheet['!cols'] = [
    { wch: 20 },
    { wch: 18 },
    { wch: 36 },
    { wch: 16 },
    { wch: 10 },
    { wch: 26 },
    { wch: 15 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Expiry Report');
  return wb;
}

export function buildSampleTemplateWorkbook(): XLSX.WorkBook {
  const aoa = [
    ['International Barcode', 'Company Product Code', 'Product Description'],
    ['0089012345690', '100245', 'Dove Shampoo 180ml'],
    ['8901234567891', '100246', 'Lux Velvet Glow Soap 100g'],
    ['8901234567892', '100247', 'Nescafe Classic Jar 50g'],
    ['0049022001122', '100310', 'Aarong Fresh Milk UHT 1L'],
    ['8901058851234', '100412', 'Maggi 2-Minute Noodles 8-Pack'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  forceStringColumns(sheet, [0, 1], aoa.length - 1);
  sheet['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 38 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Master Products');
  return wb;
}

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string, format: 'xlsx' | 'csv') {
  if (format === 'csv') {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(firstSheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, `${filename}.csv`);
    return;
  }

  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `${filename}.xlsx`);
}

export function triggerBlobDownload(blob: Blob, fullFilename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fullFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
