import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  autoDetectColumnMapping,
  buildMasterProductsWorkbook,
  parseSpreadsheetBuffer,
  validateImportRows,
} from './excelUtils';

test('autoDetectColumnMapping recognizes standard supermarket column headers', () => {
  const mapping = autoDetectColumnMapping([
    'International Barcode',
    'Company Product Code',
    'Product Description',
  ]);
  assert.equal(mapping.internationalBarcode, 'International Barcode');
  assert.equal(mapping.companyProductCode, 'Company Product Code');
  assert.equal(mapping.productDescription, 'Product Description');
});

test('parseSpreadsheetBuffer preserves leading zeros in XLSX string cells and CSV files', () => {
  const wb = buildMasterProductsWorkbook([
    {
      productId: 'p1',
      internationalBarcode: '0089012345690',
      companyProductCode: '0045',
      productDescription: 'Dove Shampoo 180ml',
      dateAdded: '2026-11-20T00:00:00.000Z',
      dateUpdated: '2026-11-20T00:00:00.000Z',
      source: 'excel_import',
    },
  ]);
  const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const parsed = parseSpreadsheetBuffer(arr, 'master.xlsx');
  assert.equal(parsed.rows[0]['International Barcode'], '0089012345690');
  assert.equal(parsed.rows[0]['Company Product Code'], '0045');

  const csvText = 'Barcode,SKU,Description\n0012345678905,0099,Aarong Milk 1L\n';
  const csvBuf = new TextEncoder().encode(csvText).buffer;
  const parsedCsv = parseSpreadsheetBuffer(csvBuf, 'master.csv');
  assert.equal(parsedCsv.rows[0]['Barcode'], '0012345678905');
  assert.equal(parsedCsv.rows[0]['SKU'], '0099');
});

test('validateImportRows catches duplicate barcodes in file, existing matches, and missing fields', () => {
  const rows = [
    { Barcode: '0089012345690', Code: '101', Description: 'Item A' },
    { Barcode: '0089012345690', Code: '102', Description: 'Item A Duplicate' },
    { Barcode: '8901234567891', Code: '103', Description: 'Existing Item' },
    { Barcode: '', Code: '104', Description: 'No Barcode' },
  ];
  const result = validateImportRows(
    rows,
    {
      internationalBarcode: 'Barcode',
      companyProductCode: 'Code',
      productDescription: 'Description',
    },
    new Set(['8901234567891'])
  );

  assert.equal(result.validRows.length, 2);
  assert.equal(result.newCount, 1);
  assert.equal(result.existingMatchCount, 1);
  assert.equal(result.duplicateBarcodesInFile.length, 1);
  assert.equal(result.errors.length, 1);
});
