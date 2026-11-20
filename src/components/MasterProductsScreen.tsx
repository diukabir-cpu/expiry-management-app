import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Edit3,
  Layers,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  DuplicateBarcodeError,
  addMasterProduct,
  deleteMasterProduct,
  updateMasterProduct,
} from '../db/database';
import type { EnrichedBatchRecord, MasterProduct } from '../types';
import { normalizeBarcode } from '../utils/excelUtils';
import { ConfirmDialog } from './ConfirmDialog';

interface MasterProductsScreenProps {
  products: MasterProduct[];
  batches: EnrichedBatchRecord[];
  initialEditProduct: MasterProduct | null;
  onClearInitialEdit: () => void;
  onInspectProductBatches: (product: MasterProduct) => void;
  onAddBatchForProduct: (product: MasterProduct) => void;
  onDatabaseChanged: () => Promise<void>;
}

export const MasterProductsScreen: React.FC<MasterProductsScreenProps> = ({
  products,
  batches,
  initialEditProduct,
  onClearInitialEdit,
  onInspectProductBatches,
  onAddBatchForProduct,
  onDatabaseChanged,
}) => {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MasterProduct | null>(null);
  const [barcode, setBarcode] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<MasterProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<MasterProduct | null>(null);

  useEffect(() => {
    if (initialEditProduct) {
      openEditModal(initialEditProduct);
      onClearInitialEdit();
    }
  }, [initialEditProduct, onClearInitialEdit]);

  const batchCountByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of batches) {
      map.set(b.productId, (map.get(b.productId) ?? 0) + 1);
    }
    return map;
  }, [batches]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.internationalBarcode.toLowerCase().includes(q) ||
        p.companyProductCode.toLowerCase().includes(q) ||
        p.productDescription.toLowerCase().includes(q)
    );
  }, [products, query]);

  const openAddModal = () => {
    setEditingProduct(null);
    setBarcode('');
    setCompanyCode('');
    setDescription('');
    setFormError(null);
    setDuplicateConflict(null);
    setModalOpen(true);
  };

  const openEditModal = (product: MasterProduct) => {
    setEditingProduct(product);
    setBarcode(product.internationalBarcode);
    setCompanyCode(product.companyProductCode);
    setDescription(product.productDescription);
    setFormError(null);
    setDuplicateConflict(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setDuplicateConflict(null);

    const cleanBarcode = normalizeBarcode(barcode);
    if (!cleanBarcode) {
      setFormError('International Barcode is required.');
      return;
    }
    if (!description.trim()) {
      setFormError('Product Description is required.');
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        await updateMasterProduct({
          productId: editingProduct.productId,
          internationalBarcode: cleanBarcode,
          companyProductCode: companyCode.trim() || '-',
          productDescription: description.trim(),
        });
      } else {
        await addMasterProduct({
          internationalBarcode: cleanBarcode,
          companyProductCode: companyCode.trim() || '-',
          productDescription: description.trim(),
          source: 'manual_addition',
        });
      }
      await onDatabaseChanged();
      setModalOpen(false);
    } catch (err) {
      if (err instanceof DuplicateBarcodeError) {
        setDuplicateConflict(err.existingProduct);
        setFormError(
          `Barcode ${err.existingProduct.internationalBarcode} already exists in Master Products.`
        );
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to save product.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Master Products</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage all imported and barcode-scanned products in your permanent local catalog.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Product Manually
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
        <label htmlFor="master-products-search" className="sr-only">
          Search master products by barcode, company code, or description
        </label>
        <input
          id="master-products-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by barcode, company code, or description..."
          className="min-h-[46px] w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
        />
      </div>

      {/* Products List */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {filteredProducts.length} Product{filteredProducts.length === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-slate-500">Barcodes preserved as exact text</span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              {products.length === 0
                ? 'No master products stored yet.'
                : 'No products match your search.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredProducts.map((product) => {
              const batchCount = batchCountByProduct.get(product.productId) ?? 0;
              return (
                <div
                  key={product.productId}
                  className="flex flex-col justify-between gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      {product.productDescription}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 tabular-nums">
                      <span className="font-mono text-slate-700">
                        {product.internationalBarcode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">Code: {product.companyProductCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {product.source === 'excel_import' ? 'Excel Import' : 'Manual Addition'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700">
                        {batchCount} batch{batchCount === 1 ? '' : 'es'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onInspectProductBatches(product)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Batches ({batchCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddBatchForProduct(product)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      + Expiry
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(product)}
                      aria-label={`Edit ${product.productDescription}`}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-200 px-2.5 text-slate-600 hover:bg-slate-50"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProduct(product)}
                      aria-label={`Delete ${product.productDescription}`}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-red-200 px-2.5 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-form-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="product-form-title" className="text-lg font-bold text-slate-900">
                {editingProduct ? 'Edit Master Product' : 'Add Master Product'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close product modal"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="modal-product-barcode"
                  className="block text-xs font-semibold text-slate-700"
                >
                  International Barcode *
                </label>
                <input
                  id="modal-product-barcode"
                  type="text"
                  required
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="e.g. 0089012345690"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="modal-product-code"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Company Product Code
                </label>
                <input
                  id="modal-product-code"
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value)}
                  placeholder="e.g. 100245"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="modal-product-description"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Product Description *
                </label>
                <input
                  id="modal-product-description"
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Dove Shampoo 180ml"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>

              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <p>{formError}</p>
                  {duplicateConflict && (
                    <button
                      type="button"
                      onClick={() => openEditModal(duplicateConflict)}
                      className="mt-2 min-h-[36px] rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Edit Existing Product ({duplicateConflict.productDescription})
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteProduct !== null}
        title="Delete Master Product?"
        message={
          confirmDeleteProduct
            ? `Delete "${confirmDeleteProduct.productDescription}" (${confirmDeleteProduct.internationalBarcode}) and all ${
                batchCountByProduct.get(confirmDeleteProduct.productId) ?? 0
              } linked expiry batch record(s)?`
            : ''
        }
        confirmLabel="Delete Product"
        destructive
        onCancel={() => setConfirmDeleteProduct(null)}
        onConfirm={async () => {
          if (confirmDeleteProduct) {
            await deleteMasterProduct(confirmDeleteProduct.productId, true);
            await onDatabaseChanged();
          }
          setConfirmDeleteProduct(null);
        }}
      />
    </div>
  );
};
