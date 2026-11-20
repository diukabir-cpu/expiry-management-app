import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import {
  importMasterProducts,
  type ImportExecutionResult,
  type ImportMode,
} from '../db/database';
import type { ColumnMapping, MasterProduct } from '../types';
import {
  buildSampleTemplateWorkbook,
  downloadWorkbook,
  parseSpreadsheetBuffer,
  validateImportRows,
  type ParsedSpreadsheet,
} from '../utils/excelUtils';
import { ConfirmDialog } from './ConfirmDialog';

interface ImportExcelScreenProps {
  products: MasterProduct[];
  onDatabaseChanged: () => Promise<void>;
  onLoadSampleData: () => Promise<void>;
}

export const ImportExcelScreen: React.FC<ImportExcelScreenProps> = ({
  products,
  onDatabaseChanged,
  onLoadSampleData,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    internationalBarcode: '',
    companyProductCode: '',
    productDescription: '',
  });
  const [importMode, setImportMode] = useState<ImportMode>('update_existing');
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importOutcome, setImportOutcome] = useState<ImportExecutionResult | null>(null);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  const existingBarcodes = useMemo(
    () => new Set(products.map((p) => p.internationalBarcode)),
    [products]
  );

  const validation = useMemo(() => {
    if (!parsed) return null;
    if (!mapping.internationalBarcode || !mapping.productDescription) return null;
    return validateImportRows(parsed.rows, mapping, existingBarcodes);
  }, [parsed, mapping, existingBarcodes]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParseError(null);
    setImportOutcome(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseSpreadsheetBuffer(buffer, file.name);
      if (result.headers.length === 0 || result.rows.length === 0) {
        setParseError('The selected spreadsheet is empty or has no readable rows.');
        setParsed(null);
        return;
      }
      setParsed(result);
      setMapping(result.suggestedMapping);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Unable to parse Excel or CSV file.'
      );
      setParsed(null);
    }
  };

  const executeImport = async () => {
    if (!validation || validation.validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await importMasterProducts(validation.validRows, importMode);
      await onDatabaseChanged();
      setImportOutcome(res);
    } finally {
      setImporting(false);
    }
  };

  const handleImportClick = () => {
    if (importMode === 'replace_all') {
      setConfirmReplaceOpen(true);
    } else {
      executeImport();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Import Master Excel
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload .xlsx, .xls, or .csv master files offline. Leading zeros in barcodes are always
            preserved.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadWorkbook(buildSampleTemplateWorkbook(), 'master-products-template', 'xlsx')
            }
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Download Template (.xlsx)
          </button>
          <button
            type="button"
            onClick={onLoadSampleData}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
          >
            <Database className="h-4 w-4" />
            Load Sample Data
          </button>
        </div>
      </div>

      {/* File Upload Dropzone */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            {fileName ? `Loaded: ${fileName}` : 'Select Excel (.xlsx, .xls) or CSV File'}
          </h2>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Required columns: International Barcode, Company Product Code, Product Description.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Upload className="h-4 w-4" />
            Choose Spreadsheet File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {parseError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}
      </section>

      {/* Column Mapping & Validation Summary */}
      {parsed && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              1. Column Mapping ({parsed.rows.length}{' '}
              {parsed.rows.length === 1 ? 'row' : 'rows'} detected)
            </h2>
            <p className="text-xs text-slate-500">
              Columns are auto-detected. Adjust any dropdown manually if your file uses custom
              headers.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="map-barcode"
                className="block text-xs font-semibold text-slate-700"
              >
                International Barcode *
              </label>
              <select
                id="map-barcode"
                value={mapping.internationalBarcode}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, internationalBarcode: e.target.value }))
                }
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">-- Select Column --</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="map-company-code"
                className="block text-xs font-semibold text-slate-700"
              >
                Company Product Code
              </label>
              <select
                id="map-company-code"
                value={mapping.companyProductCode}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, companyProductCode: e.target.value }))
                }
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">-- None / Optional --</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="map-description"
                className="block text-xs font-semibold text-slate-700"
              >
                Product Description *
              </label>
              <select
                id="map-description"
                value={mapping.productDescription}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, productDescription: e.target.value }))
                }
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">-- Select Column --</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {validation && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">New Products</div>
                  <div className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
                    {validation.newCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Existing Matches</div>
                  <div className="mt-1 text-xl font-bold text-sky-700 tabular-nums">
                    {validation.existingMatchCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Duplicate in File</div>
                  <div className="mt-1 text-xl font-bold text-amber-700 tabular-nums">
                    {validation.duplicateBarcodesInFile.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Import Errors</div>
                  <div className="mt-1 text-xl font-bold text-red-700 tabular-nums">
                    {validation.errors.length}
                  </div>
                </div>
              </div>

              {(validation.duplicateBarcodesInFile.length > 0 || validation.errors.length > 0) && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  {validation.duplicateBarcodesInFile.length > 0 && (
                    <div>
                      <strong>Duplicate Barcodes Skipped:</strong>{' '}
                      {validation.duplicateBarcodesInFile
                        .slice(0, 5)
                        .map((d) => `Row ${d.rowNumber} (${d.barcode})`)
                        .join(', ')}
                      {validation.duplicateBarcodesInFile.length > 5 &&
                        ` +${validation.duplicateBarcodesInFile.length - 5} more`}
                    </div>
                  )}
                  {validation.errors.length > 0 && (
                    <div>
                      <strong>Row Errors:</strong>{' '}
                      {validation.errors
                        .slice(0, 5)
                        .map((e) => `Row ${e.rowNumber}: ${e.reason}`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {/* Preview Table */}
              <div>
                <h3 className="mb-2 text-xs font-semibold text-slate-700">
                  Preview (First {Math.min(6, validation.validRows.length)} valid rows)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                        <th className="px-3 py-2">International Barcode</th>
                        <th className="px-3 py-2">Company Product Code</th>
                        <th className="px-3 py-2">Product Description</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {validation.validRows.slice(0, 6).map((row) => (
                        <tr key={`${row.rowNumber}-${row.internationalBarcode}`}>
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-900">
                            {row.internationalBarcode}
                          </td>
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                            {row.companyProductCode}
                          </td>
                          <td className="px-3 py-2 text-slate-900">{row.productDescription}</td>
                          <td className="px-3 py-2 font-medium text-slate-600">
                            {row.isExistingMatch ? 'Existing' : 'New'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import Mode Selection */}
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold text-slate-700">2. Import Mode</div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      {
                        id: 'add_only',
                        title: 'Import New Only',
                        desc: 'Add new barcodes; keep existing master records unchanged.',
                      },
                      {
                        id: 'update_existing',
                        title: 'Add & Update Existing',
                        desc: 'Insert new products and update descriptions/codes for matching barcodes.',
                      },
                      {
                        id: 'replace_all',
                        title: 'Replace Master Database',
                        desc: 'Clear all current master products and replace with this file.',
                      },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setImportMode(mode.id)}
                      className={`rounded-xl border p-3.5 text-left transition-colors ${
                        importMode === mode.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-semibold">{mode.title}</div>
                      <div
                        className={`mt-1 text-xs ${
                          importMode === mode.id ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {mode.desc}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={importing || validation.validRows.length === 0}
                    onClick={handleImportClick}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                  >
                    <Upload className="h-4 w-4" />
                    {importing
                      ? 'Importing Products...'
                      : `Import ${validation.validRows.length} Valid ${
                          validation.validRows.length === 1 ? 'Product' : 'Products'
                        }`}
                  </button>
                </div>
                {importOutcome && (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <div className="font-bold">Master Database Updated</div>
                      <p className="mt-0.5 text-xs text-emerald-800 tabular-nums">
                        Imported {importOutcome.importedCount} new product(s) · Updated{' '}
                        {importOutcome.updatedCount} existing product(s) · Skipped{' '}
                        {importOutcome.skippedDuplicates} duplicate(s).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmReplaceOpen}
        title="Replace Entire Master Database?"
        message={`This will remove all ${products.length} existing master product(s) and replace them with the ${
          validation?.validRows.length ?? 0
        } product(s) from "${fileName}". Existing batch expiry records remain stored in IndexedDB.`}
        confirmLabel="Replace Master Database"
        destructive
        onCancel={() => setConfirmReplaceOpen(false)}
        onConfirm={() => {
          setConfirmReplaceOpen(false);
          executeImport();
        }}
      />
    </div>
  );
};
