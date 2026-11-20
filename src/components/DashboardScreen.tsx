import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Barcode,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Package,
  Search,
  X,
} from 'lucide-react';
import type { EnrichedBatchRecord, MasterProduct, NavScreen } from '../types';
import {
  computeDashboardMetrics,
  searchGlobalInventory,
} from '../utils/dashboardLogic';
import { formatDisplayDate } from '../utils/dateAndExpiry';
import { StatusText, formatDaysRemainingLabel } from './StatusText';

interface DashboardScreenProps {
  products: MasterProduct[];
  enrichedBatches: EnrichedBatchRecord[];
  onNavigate: (screen: NavScreen) => void;
  onInspectProduct: (product: MasterProduct) => void;
  onAddBatchForProduct: (product: MasterProduct) => void;
  onLoadSampleData: () => Promise<void>;
}

type DashboardBucket = '90d' | 'expired' | '30d' | '60d' | 'all';

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  products,
  enrichedBatches,
  onNavigate,
  onInspectProduct,
  onAddBatchForProduct,
  onLoadSampleData,
}) => {
  const [globalQuery, setGlobalQuery] = useState('');
  const [activeBucket, setActiveBucket] = useState<DashboardBucket>('90d');
  const [loadingSample, setLoadingSample] = useState(false);

  const metrics = useMemo(
    () => computeDashboardMetrics(products, enrichedBatches),
    [products, enrichedBatches]
  );

  const productById = useMemo(() => {
    const map = new Map<string, MasterProduct>();
    for (const p of products) map.set(p.productId, p);
    return map;
  }, [products]);

  const searchResults = useMemo(
    () => searchGlobalInventory(globalQuery, products, enrichedBatches),
    [globalQuery, products, enrichedBatches]
  );

  const visibleBatches = useMemo(() => {
    switch (activeBucket) {
      case 'expired':
        return enrichedBatches.filter((b) => b.daysRemaining < 0);
      case '30d':
        return enrichedBatches.filter((b) => b.daysRemaining >= 0 && b.daysRemaining <= 30);
      case '60d':
        return enrichedBatches.filter((b) => b.daysRemaining >= 0 && b.daysRemaining <= 60);
      case '90d':
        return enrichedBatches.filter((b) => b.daysRemaining >= 0 && b.daysRemaining <= 90);
      case 'all':
        return enrichedBatches;
    }
  }, [enrichedBatches, activeBucket]);

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      await onLoadSampleData();
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
            Store Expiry Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track product batches, 90-day expiry alerts, and offline supermarket stock.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('scanner')}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
          >
            <Barcode className="h-4 w-4 shrink-0" />
            Scan Barcode
          </button>
          <button
            type="button"
            onClick={() => onNavigate('import')}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            Import Excel
          </button>
        </div>
      </div>

      {/* Global Offline Search */}
      <section aria-label="Global offline search" className="relative">
        <label htmlFor="global-inventory-search" className="sr-only">
          Search by barcode, company code, product description, or batch number
        </label>
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
          <input
            id="global-inventory-search"
            type="search"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="Search barcode, code, product, batch..."
            className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          />
          {globalQuery && (
            <button
              type="button"
              onClick={() => setGlobalQuery('')}
              aria-label="Clear search"
              className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {globalQuery.trim() !== '' && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Search Results ({searchResults.length})
              </h2>
              <span className="text-xs text-slate-500">Offline local database</span>
            </div>
            {searchResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No matching products or batches found for &ldquo;{globalQuery}&rdquo;.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {searchResults.slice(0, 12).map(({ product, batches }) => (
                  <div
                    key={product.productId}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {product.productDescription}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span className="font-mono">Barcode: {product.internationalBarcode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Code: {product.companyProductCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{batches.length} batch(es)</span>
                      </div>
                      {batches.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
                          {batches.slice(0, 3).map((b) => (
                            <span key={b.batchRecordId}>
                              Exp {formatDisplayDate(b.expiryDate, b.isMonthOnly)}
                              {b.batchNumber ? ` (${b.batchNumber})` : ''}
                            </span>
                          ))}
                          {batches.length > 3 && <span>+{batches.length - 3} more</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onInspectProduct(product)}
                        className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        View Batches
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddBatchForProduct(product)}
                        className="min-h-[40px] rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                      >
                        + Expiry Batch
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 6 Summary KPI Cards */}
      <section aria-label="Expiry summary metrics">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300"
          >
            <div className="text-xs font-medium text-slate-500">Total Master Products</div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {metrics.totalMasterProducts}
            </div>
            <div className="mt-1 text-xs text-slate-500">Unique barcodes</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveBucket('all')}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300"
          >
            <div className="text-xs font-medium text-slate-500">Total Batch Records</div>
            <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {metrics.totalBatchRecords}
            </div>
            <div className="mt-1 text-xs text-slate-500">Active stock batches</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveBucket('expired')}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              metrics.expiredCount > 0
                ? 'border-red-200 bg-red-50/50 hover:border-red-300'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium text-red-700">Already Expired</div>
            <div className="mt-2 text-2xl font-bold text-red-700 tabular-nums">
              {metrics.expiredCount}
            </div>
            <div className="mt-1 text-xs text-red-600">Remove from shelf</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveBucket('30d')}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-orange-300"
          >
            <div className="text-xs font-medium text-orange-700">Expiring Within 30 Days</div>
            <div className="mt-2 text-2xl font-bold text-orange-700 tabular-nums">
              {metrics.within30DaysCount}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">Critical 0–30 days</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveBucket('60d')}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-amber-300"
          >
            <div className="text-xs font-medium text-amber-700">Expiring Within 60 Days</div>
            <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
              {metrics.within60DaysCount}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              31–60d tier: {metrics.bucket31to60Count}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveBucket('90d')}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-sky-300"
          >
            <div className="text-xs font-medium text-sky-700">Expiring Within 90 Days</div>
            <div className="mt-2 text-2xl font-bold text-sky-700 tabular-nums">
              {metrics.within90DaysCount}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              61–90d tier: {metrics.bucket61to90Count}
            </div>
          </button>
        </div>
      </section>

      {/* Expired Alert Callout (if any expired batches exist while viewing default 90d list) */}
      {metrics.expiredCount > 0 && activeBucket === '90d' && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <div>
              <div className="text-sm font-semibold text-red-900 tabular-nums">
                {metrics.expiredCount} batch{metrics.expiredCount === 1 ? '' : 'es'} already expired
              </div>
              <p className="text-xs text-red-700">
                Inspect overdue batches immediately to clear them from store shelves.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveBucket('expired')}
            className="min-h-[40px] shrink-0 rounded-xl bg-red-700 px-4 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap"
          >
            View Expired ({metrics.expiredCount})
          </button>
        </div>
      )}

      {/* Empty State Onboarding when store database has no records yet */}
      {products.length === 0 && enrichedBatches.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Package className="mx-auto h-10 w-10 text-slate-400" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">
            Ready for Supermarket Setup
          </h2>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-600">
            Import your master product Excel/CSV file, start scanning barcodes directly, or load
            sample supermarket items to explore multi-batch expiry tracking.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => onNavigate('import')}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Import Master Excel
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scanner')}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Barcode className="h-4 w-4" />
              Scan First Barcode
            </button>
            <button
              type="button"
              disabled={loadingSample}
              onClick={handleLoadSample}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Database className="h-4 w-4" />
              {loadingSample ? 'Loading...' : 'Load Sample Supermarket Data'}
            </button>
          </div>
        </section>
      ) : (
        /* Upcoming Expiry List (Default: Next 90 Days) */
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Upcoming Expiry Watchlist
              </h2>
              <p className="text-xs text-slate-500">
                Each product batch is tracked separately and sorted by nearest expiry date.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  { id: '90d', label: `Next 90d (${metrics.within90DaysCount})` },
                  { id: '30d', label: `0–30d (${metrics.within30DaysCount})` },
                  { id: '60d', label: `0–60d (${metrics.within60DaysCount})` },
                  { id: 'expired', label: `Expired (${metrics.expiredCount})` },
                  { id: 'all', label: `All (${metrics.totalBatchRecords})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveBucket(tab.id)}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                    activeBucket === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {visibleBatches.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                No batches match this expiry window.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Scan a product barcode or switch tabs to review all saved batches.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleBatches.map((batch) => {
                const parentProduct = productById.get(batch.productId);
                return (
                  <button
                    key={batch.batchRecordId}
                    type="button"
                    onClick={() => parentProduct && onInspectProduct(parentProduct)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-slate-900">
                          {batch.productDescription}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <StatusText status={batch.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 tabular-nums">
                        <span className="font-mono">{batch.internationalBarcode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Code {batch.companyProductCode}</span>
                        {batch.batchNumber && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Batch {batch.batchNumber}</span>
                          </>
                        )}
                        {batch.quantity !== undefined && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Qty {batch.quantity}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right tabular-nums">
                        <div className="text-sm font-bold text-slate-900">
                          {formatDisplayDate(batch.expiryDate, batch.isMonthOnly)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDaysRemainingLabel(batch.daysRemaining)}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
