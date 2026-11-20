import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Filter, Trash2 } from 'lucide-react';
import type { EnrichedBatchRecord, MasterProduct } from '../types';
import { filterReportBatches, type ReportWindowFilter } from '../utils/dashboardLogic';
import { formatDisplayDate, getTodayYmd } from '../utils/dateAndExpiry';
import { buildExpiryReportWorkbook, downloadWorkbook } from '../utils/excelUtils';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusText, formatDaysRemainingLabel } from './StatusText';

interface ExpiryReportsScreenProps {
  products: MasterProduct[];
  enrichedBatches: EnrichedBatchRecord[];
  defaultWindow: ReportWindowFilter;
  onInspectProduct: (product: MasterProduct) => void;
  onDeleteBatch: (batchRecordId: string) => Promise<void>;
}

export const ExpiryReportsScreen: React.FC<ExpiryReportsScreenProps> = ({
  products,
  enrichedBatches,
  defaultWindow,
  onInspectProduct,
  onDeleteBatch,
}) => {
  const [windowFilter, setWindowFilter] = useState<ReportWindowFilter>(defaultWindow);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [companyProductCode, setCompanyProductCode] = useState('');
  const [internationalBarcode, setInternationalBarcode] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const productById = useMemo(() => {
    const map = new Map<string, MasterProduct>();
    for (const p of products) map.set(p.productId, p);
    return map;
  }, [products]);

  const filteredRows = useMemo(
    () =>
      filterReportBatches(enrichedBatches, {
        window: windowFilter,
        customStartDate,
        customEndDate,
        productDescription,
        companyProductCode,
        internationalBarcode,
        batchNumber,
      }),
    [
      enrichedBatches,
      windowFilter,
      customStartDate,
      customEndDate,
      productDescription,
      companyProductCode,
      internationalBarcode,
      batchNumber,
    ]
  );

  const handleExport = (format: 'xlsx' | 'csv') => {
    const wb = buildExpiryReportWorkbook(filteredRows);
    const stamp = getTodayYmd();
    downloadWorkbook(wb, `expiry-report-${windowFilter}-${stamp}`, format);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expiry Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Filter batches by expiry window, barcode, or batch number and export offline to Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filteredRows.length === 0}
            onClick={() => handleExport('xlsx')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel (.xlsx)
          </button>
          <button
            type="button"
            disabled={filteredRows.length === 0}
            onClick={() => handleExport('csv')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Filter className="h-4 w-4 text-slate-500" />
          Report Filters
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          {(
            [
              { id: 'expired', label: 'Expired Products' },
              { id: '30', label: 'Next 30 Days' },
              { id: '60', label: 'Next 60 Days' },
              { id: '90', label: 'Next 90 Days' },
              { id: 'all', label: 'All Batches' },
              { id: 'custom', label: 'Custom Date Range' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setWindowFilter(opt.id)}
              className={`min-h-[38px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                windowFilter === opt.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {windowFilter === 'custom' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="report-start-date"
                className="block text-xs font-medium text-slate-600"
              >
                From Expiry Date
              </label>
              <input
                id="report-start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="report-end-date"
                className="block text-xs font-medium text-slate-600"
              >
                To Expiry Date
              </label>
              <input
                id="report-end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-desc" className="block text-xs font-medium text-slate-600">
              Product Description
            </label>
            <input
              id="filter-desc"
              type="text"
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Filter description..."
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="filter-code" className="block text-xs font-medium text-slate-600">
              Company Product Code
            </label>
            <input
              id="filter-code"
              type="text"
              value={companyProductCode}
              onChange={(e) => setCompanyProductCode(e.target.value)}
              placeholder="Filter company code..."
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 font-mono text-sm tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="filter-barcode" className="block text-xs font-medium text-slate-600">
              International Barcode
            </label>
            <input
              id="filter-barcode"
              type="text"
              value={internationalBarcode}
              onChange={(e) => setInternationalBarcode(e.target.value)}
              placeholder="Filter barcode..."
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 font-mono text-sm tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="filter-batch" className="block text-xs font-medium text-slate-600">
              Batch Number
            </label>
            <input
              id="filter-batch"
              type="text"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="Filter batch..."
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Report Results */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {filteredRows.length} Batch Record{filteredRows.length === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-slate-500">Sorted by nearest expiry first</span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No expiry batch records match the active filters.
          </div>
        ) : (
          <>
            {/* Desktop Data Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3">Barcode</th>
                    <th className="px-4 py-3">Company Code</th>
                    <th className="px-4 py-3">Product Description</th>
                    <th className="px-4 py-3">Batch No.</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3 text-right">Days Remaining</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => {
                    const parent = productById.get(row.productId);
                    return (
                      <tr key={row.batchRecordId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                          {row.internationalBarcode}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                          {row.companyProductCode}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <button
                            type="button"
                            onClick={() => parent && onInspectProduct(parent)}
                            className="text-left hover:underline"
                          >
                            {row.productDescription}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {row.batchNumber || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-700 tabular-nums">
                          {row.quantity !== undefined ? row.quantity : '-'}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatDisplayDate(row.expiryDate, row.isMonthOnly)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDaysRemainingLabel(row.daysRemaining)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusText status={row.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(row.batchRecordId)}
                            aria-label={`Delete batch ${row.batchNumber ?? row.expiryDate} of ${row.productDescription}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="divide-y divide-slate-100 md:hidden">
              {filteredRows.map((row) => {
                const parent = productById.get(row.productId);
                return (
                  <div key={row.batchRecordId} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => parent && onInspectProduct(parent)}
                        className="text-left font-semibold text-slate-900"
                      >
                        {row.productDescription}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(row.batchRecordId)}
                        aria-label={`Delete batch of ${row.productDescription}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span className="font-mono">{row.internationalBarcode}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">Code {row.companyProductCode}</span>
                      {row.batchNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Batch {row.batchNumber}</span>
                        </>
                      )}
                      {row.quantity !== undefined && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Qty {row.quantity}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <StatusText status={row.status} />
                      <div className="text-right text-xs tabular-nums">
                        <span className="font-bold text-slate-900">
                          {formatDisplayDate(row.expiryDate, row.isMonthOnly)}
                        </span>{' '}
                        <span className="text-slate-500">
                          ({formatDaysRemainingLabel(row.daysRemaining)})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete Expiry Batch?"
        message="Remove this batch expiry record from local reports? Other batches for the product will remain."
        confirmLabel="Delete Batch"
        destructive
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (confirmDeleteId) await onDeleteBatch(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
};
