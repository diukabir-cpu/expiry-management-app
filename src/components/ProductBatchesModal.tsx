import React, { useState } from 'react';
import { CalendarPlus, Edit3, Plus, Trash2, X } from 'lucide-react';
import type { EnrichedBatchRecord, MasterProduct } from '../types';
import { formatDisplayDate, monthYearToExpiryDate } from '../utils/dateAndExpiry';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusText, formatDaysRemainingLabel } from './StatusText';

interface ProductBatchesModalProps {
  product: MasterProduct | null;
  batches: EnrichedBatchRecord[];
  onClose: () => void;
  onAddNewBatch: (product: MasterProduct) => void;
  onUpdateBatch: (batch: EnrichedBatchRecord) => Promise<void>;
  onDeleteBatch: (batchRecordId: string) => Promise<void>;
}

export const ProductBatchesModal: React.FC<ProductBatchesModalProps> = ({
  product,
  batches,
  onClose,
  onAddNewBatch,
  onUpdateBatch,
  onDeleteBatch,
}) => {
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editMonthOnly, setEditMonthOnly] = useState(false);
  const [editMonthVal, setEditMonthVal] = useState('');
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!product) return null;

  const startEdit = (b: EnrichedBatchRecord) => {
    setEditingBatchId(b.batchRecordId);
    setEditMonthOnly(Boolean(b.isMonthOnly));
    setEditDate(b.expiryDate);
    setEditMonthVal(b.expiryMonth ?? b.expiryDate.slice(0, 7));
    setEditBatchNumber(b.batchNumber ?? '');
    setEditQuantity(b.quantity !== undefined ? String(b.quantity) : '');
  };

  const handleSaveEdit = async (batch: EnrichedBatchRecord) => {
    setSaving(true);
    try {
      let nextExpiryDate = editDate;
      let nextExpiryMonth: string | undefined;
      if (editMonthOnly) {
        const resolved = monthYearToExpiryDate(editMonthVal);
        if (!resolved) return;
        nextExpiryDate = resolved.expiryDate;
        nextExpiryMonth = resolved.expiryMonth;
      }
      if (!nextExpiryDate) return;

      const parsedQty = editQuantity.trim() === '' ? undefined : Number(editQuantity);
      await onUpdateBatch({
        ...batch,
        expiryDate: nextExpiryDate,
        expiryMonth: nextExpiryMonth,
        isMonthOnly: editMonthOnly,
        batchNumber: editBatchNumber.trim() || undefined,
        quantity: parsedQty !== undefined && !Number.isNaN(parsedQty) ? parsedQty : undefined,
      });
      setEditingBatchId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-batches-title"
        onClick={onClose}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div className="min-w-0">
              <h2 id="product-batches-title" className="text-lg font-bold text-slate-900">
                {product.productDescription}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono tabular-nums">Barcode: {product.internationalBarcode}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Code: {product.companyProductCode}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{batches.length} saved batch(es)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close batches dialog"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {batches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <CalendarPlus className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">
                  No expiry batches recorded for this product yet.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Add a batch to start tracking its expiry timeline.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {batches.map((batch, index) => {
                  const isEditing = editingBatchId === batch.batchRecordId;
                  return (
                    <div key={batch.batchRecordId} className="p-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">
                              Edit Batch #{index + 1}
                            </span>
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={editMonthOnly}
                                onChange={(e) => setEditMonthOnly(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Month & Year Only
                            </label>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600">
                                Expiry Date
                              </label>
                              {editMonthOnly ? (
                                <input
                                  type="month"
                                  value={editMonthVal}
                                  onChange={(e) => setEditMonthVal(e.target.value)}
                                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
                                />
                              ) : (
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={(e) => setEditDate(e.target.value)}
                                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
                                />
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600">
                                Batch Number
                              </label>
                              <input
                                type="text"
                                value={editBatchNumber}
                                onChange={(e) => setEditBatchNumber(e.target.value)}
                                placeholder="Optional"
                                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600">
                                Quantity
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                placeholder="Optional"
                                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingBatchId(null)}
                              className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSaveEdit(batch)}
                              className="min-h-[40px] rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <div className="flex items-start gap-3">
                            {batch.capturedImage && (
                              <img
                                src={batch.capturedImage}
                                alt={`Captured expiry photo for batch ${batch.batchNumber ?? index + 1}`}
                                className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                              />
                            )}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900 tabular-nums">
                                  {formatDisplayDate(batch.expiryDate, batch.isMonthOnly)}
                                </span>
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <StatusText status={batch.status} />
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                                <span>{formatDaysRemainingLabel(batch.daysRemaining)}</span>
                                {batch.batchNumber && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>Batch {batch.batchNumber}</span>
                                  </>
                                )}
                                {batch.quantity !== undefined && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>Qty: {batch.quantity}</span>
                                  </>
                                )}
                                <span aria-hidden="true">·</span>
                                <span>Logged {batch.scanDate}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEdit(batch)}
                              aria-label={`Edit batch ${batch.batchNumber ?? batch.expiryDate}`}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Edit3 className="h-4 w-4 sm:mr-1.5" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteBatchId(batch.batchRecordId)}
                              aria-label={`Delete batch ${batch.batchNumber ?? batch.expiryDate}`}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 sm:mr-1.5" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onAddNewBatch(product);
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Add New Expiry Batch
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteBatchId !== null}
        title="Delete Expiry Batch?"
        message="This will permanently remove this batch expiry record. Other batches for the same product will remain untouched."
        confirmLabel="Delete Batch"
        destructive
        onCancel={() => setConfirmDeleteBatchId(null)}
        onConfirm={async () => {
          if (confirmDeleteBatchId) {
            await onDeleteBatch(confirmDeleteBatchId);
          }
          setConfirmDeleteBatchId(null);
        }}
      />
    </>
  );
};
