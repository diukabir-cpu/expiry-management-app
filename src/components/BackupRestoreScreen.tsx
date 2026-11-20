import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  clearAllDatabaseData,
  exportFullBackup,
  restoreFullBackup,
} from '../db/database';
import type { AppBackupPayload, EnrichedBatchRecord, MasterProduct } from '../types';
import { getTodayYmd } from '../utils/dateAndExpiry';
import {
  buildExpiryReportWorkbook,
  buildMasterProductsWorkbook,
  downloadWorkbook,
  triggerBlobDownload,
} from '../utils/excelUtils';
import { ConfirmDialog } from './ConfirmDialog';

interface BackupRestoreScreenProps {
  products: MasterProduct[];
  enrichedBatches: EnrichedBatchRecord[];
  onDatabaseChanged: () => Promise<void>;
}

export const BackupRestoreScreen: React.FC<BackupRestoreScreenProps> = ({
  products,
  enrichedBatches,
  onDatabaseChanged,
}) => {
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingRestore, setPendingRestore] = useState<AppBackupPayload | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExportFullBackup = async () => {
    setErrorMessage(null);
    const payload = await exportFullBackup();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    triggerBlobDownload(blob, `retail-expiry-backup-${getTodayYmd()}.json`);
    setStatusMessage(
      `Exported full JSON backup (${payload.products.length} products, ${payload.batches.length} batches).`
    );
  };

  const handleBackupFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppBackupPayload;
      if (
        !parsed ||
        parsed.schemaVersion !== 1 ||
        !Array.isArray(parsed.products) ||
        !Array.isArray(parsed.batches)
      ) {
        setErrorMessage('Invalid backup file. Please choose a Retail Expiry Tracker JSON backup.');
        return;
      }
      setPendingRestore(parsed);
    } catch {
      setErrorMessage('Could not read JSON backup file.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    const res = await restoreFullBackup(pendingRestore);
    await onDatabaseChanged();
    setPendingRestore(null);
    setStatusMessage(
      `Restored ${res.productsRestored} master products and ${res.batchesRestored} expiry batch records.`
    );
  };

  const handleClearAll = async () => {
    await clearAllDatabaseData();
    await onDatabaseChanged();
    setConfirmClearOpen(false);
    setStatusMessage('All master products and expiry batch records have been cleared.');
  };

  const stamp = getTodayYmd();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Backup &amp; Restore
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Save full offline backups, export master products and expiry batches to Excel/CSV, or
          restore from a previous backup.
        </p>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Full JSON Backup & Restore */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Full App Backup &amp; Restore
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Includes all {products.length} master products, {enrichedBatches.length} batch
              records, product links, and store settings.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleExportFullBackup}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Export Backup (.json)
            </button>
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Upload className="h-4 w-4" />
              Restore from Backup
            </button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleBackupFileChosen}
              className="hidden"
            />
          </div>
        </section>

        {/* Excel & CSV Exports */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Master &amp; Batch Spreadsheet Exports
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Master export includes both Excel-imported items and new items added via barcode scan.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Master Products ({products.length})
                </div>
                <div className="text-xs text-slate-500">Barcodes preserved as text</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={products.length === 0}
                  onClick={() =>
                    downloadWorkbook(
                      buildMasterProductsWorkbook(products),
                      `master-products-${stamp}`,
                      'xlsx'
                    )
                  }
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  .xlsx
                </button>
                <button
                  type="button"
                  disabled={products.length === 0}
                  onClick={() =>
                    downloadWorkbook(
                      buildMasterProductsWorkbook(products),
                      `master-products-${stamp}`,
                      'csv'
                    )
                  }
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  .csv
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Expiry Batch Records ({enrichedBatches.length})
                </div>
                <div className="text-xs text-slate-500">All active batches &amp; quantities</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={enrichedBatches.length === 0}
                  onClick={() =>
                    downloadWorkbook(
                      buildExpiryReportWorkbook(enrichedBatches),
                      `all-expiry-batches-${stamp}`,
                      'xlsx'
                    )
                  }
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  .xlsx
                </button>
                <button
                  type="button"
                  disabled={enrichedBatches.length === 0}
                  onClick={() =>
                    downloadWorkbook(
                      buildExpiryReportWorkbook(enrichedBatches),
                      `all-expiry-batches-${stamp}`,
                      'csv'
                    )
                  }
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  .csv
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Clear All Data */}
      <section className="rounded-2xl border border-red-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-red-900">Clear Local Store Data</h2>
            <p className="mt-1 text-xs text-red-700">
              Permanently remove all master products and expiry batch records from this phone.
              Export a JSON backup first.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 whitespace-nowrap"
          >
            <Trash2 className="h-4 w-4" />
            Clear All Data
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restore Backup Data?"
        message={
          pendingRestore
            ? `Restoring this backup from ${pendingRestore.exportedAt.slice(0, 10)} will replace current local data with ${pendingRestore.products.length} master product(s) and ${pendingRestore.batches.length} expiry batch record(s).`
            : ''
        }
        confirmLabel="Restore Backup"
        onCancel={() => setPendingRestore(null)}
        onConfirm={handleConfirmRestore}
      />

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear All Local Data?"
        message="This will permanently delete all master products and expiry batch records stored in IndexedDB on this device. This action cannot be undone."
        confirmLabel="Yes, Clear Everything"
        destructive
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={handleClearAll}
      />
    </div>
  );
};
