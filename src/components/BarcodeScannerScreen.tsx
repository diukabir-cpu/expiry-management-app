import React, { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import {
  AlertCircle,
  ArrowRight,
  Barcode,
  Camera,
  CameraOff,
  CheckCircle2,
  Flashlight,
  ImageUp,
  Plus,
  Search,
} from 'lucide-react';
import {
  DuplicateBarcodeError,
  addMasterProduct,
  getProductByBarcode,
} from '../db/database';
import {
  decodeBarcodeFromImageFile,
  listVideoCameras,
  setCameraTorch,
  startBarcodeCameraScan,
  type CameraDeviceOption,
} from '../services/barcodeScanner';
import type { EnrichedBatchRecord, MasterProduct } from '../types';
import { formatDisplayDate } from '../utils/dateAndExpiry';
import { normalizeBarcode } from '../utils/excelUtils';

interface BarcodeScannerScreenProps {
  batches: EnrichedBatchRecord[];
  onProceedToExpiry: (product: MasterProduct) => void;
  onEditExistingProduct: (product: MasterProduct) => void;
  onDatabaseChanged: () => Promise<void>;
}

export const BarcodeScannerScreen: React.FC<BarcodeScannerScreenProps> = ({
  batches,
  onProceedToExpiry,
  onEditExistingProduct,
  onDatabaseChanged,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const [manualBarcode, setManualBarcode] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [scanFormat, setScanFormat] = useState<string>('');
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'found' | 'not_found'>('idle');
  const [foundProduct, setFoundProduct] = useState<MasterProduct | null>(null);

  // Add New Product inline workflow state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newCompanyCode, setNewCompanyCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<MasterProduct | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  const stopCamera = () => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore
    }
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const lookupBarcode = async (rawCode: string, formatLabel = 'Manual / Scanner') => {
    const clean = normalizeBarcode(rawCode);
    if (!clean) return;

    setScannedBarcode(clean);
    setManualBarcode(clean);
    setScanFormat(formatLabel);
    setShowAddForm(false);
    setFormError(null);
    setDuplicateConflict(null);

    const existing = await getProductByBarcode(clean);
    if (existing) {
      setFoundProduct(existing);
      setLookupStatus('found');
    } else {
      setFoundProduct(null);
      setLookupStatus('not_found');
      setNewBarcode(clean);
      setNewCompanyCode('');
      setNewDescription('');
    }
  };

  const handleStartCamera = async (overrideDeviceId?: string) => {
    setCameraError(null);
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera API unavailable in this browser context. Use "Scan from Photo" or type/scan the barcode below.'
      );
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    try {
      const controls = await startBarcodeCameraScan({
        videoElement: videoEl,
        deviceId: overrideDeviceId || selectedDeviceId || undefined,
        onDetected: (code, format) => {
          lookupBarcode(code, format);
        },
        onError: () => {
          // Ignore intermittent decode frame errors
        },
      });
      controlsRef.current = controls;
      setCameraActive(true);

      const list = await listVideoCameras();
      setCameras(list);

      // Probe torch capability once stream attaches
      setTimeout(() => {
        const stream = videoEl.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps?.torch));
      }, 400);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to access rear camera. Check camera permissions.';
      setCameraError(message);
      setCameraActive(false);
    }
  };

  const handleToggleTorch = async () => {
    const next = !torchOn;
    const ok = await setCameraTorch(videoRef.current, next);
    if (ok) setTorchOn(next);
  };

  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const code = await decodeBarcodeFromImageFile(file);
    if (code) {
      await lookupBarcode(code, 'Photo Barcode');
    } else {
      setCameraError('Could not detect a supported barcode (EAN-13/8, UPC-A/E, Code 128/39) in that photo.');
    }
  };

  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setDuplicateConflict(null);

    const cleanBarcode = normalizeBarcode(newBarcode);
    if (!cleanBarcode) {
      setFormError('International Barcode is required.');
      return;
    }
    if (!newDescription.trim()) {
      setFormError('Product Description is required.');
      return;
    }

    setSavingProduct(true);
    try {
      const created = await addMasterProduct({
        internationalBarcode: cleanBarcode,
        companyProductCode: newCompanyCode.trim() || '-',
        productDescription: newDescription.trim(),
        source: 'manual_addition',
      });
      await onDatabaseChanged();
      stopCamera();
      // Immediately proceed to Expiry Date entry for the newly added product
      onProceedToExpiry(created);
    } catch (err) {
      if (err instanceof DuplicateBarcodeError) {
        setDuplicateConflict(err.existingProduct);
        setFormError(
          `Barcode ${err.existingProduct.internationalBarcode} already exists in the master database.`
        );
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to save product.');
      }
    } finally {
      setSavingProduct(false);
    }
  };

  const existingProductBatches = foundProduct
    ? batches.filter((b) => b.productId === foundProduct.productId)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Scan Barcode</h1>
        <p className="mt-1 text-sm text-slate-600">
          Scan EAN-13, EAN-8, UPC-A, UPC-E, Code 128, or Code 39 barcodes completely offline.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Camera & Manual Lookup Column */}
        <section className="space-y-4 lg:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            <div className="relative aspect-video w-full bg-slate-900">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
                  <Barcode className="h-10 w-10 text-emerald-400" />
                  <p className="mt-3 text-sm font-medium text-slate-200">
                    Rear camera ready for offline barcode scanning
                  </p>
                  <button
                    type="button"
                    onClick={() => handleStartCamera()}
                    className="mt-4 inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <Camera className="h-4 w-4" />
                    Start Camera Scanner
                  </button>
                </div>
              )}

              {cameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                  <div className="h-28 w-full max-w-xs rounded-xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-800 px-3 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    <CameraOff className="h-4 w-4" />
                    Stop Camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartCamera()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Camera className="h-4 w-4" />
                    Start Camera
                  </button>
                )}

                {torchSupported && (
                  <button
                    type="button"
                    onClick={handleToggleTorch}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-medium ${
                      torchOn
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Flashlight className="h-4 w-4" />
                    {torchOn ? 'Light On' : 'Flashlight'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  <ImageUp className="h-4 w-4" />
                  Scan from Photo
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileScan}
                  className="hidden"
                />
              </div>

              {cameras.length > 1 && (
                <select
                  aria-label="Select camera"
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value);
                    if (cameraActive) handleStartCamera(e.target.value);
                  }}
                  className="min-h-[40px] rounded-xl border border-slate-700 bg-slate-800 px-2.5 text-xs text-white"
                >
                  {cameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {cameraError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual / Handheld Barcode Entry */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookupBarcode(manualBarcode, 'Manual Entry');
            }}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <label
              htmlFor="manual-barcode-input"
              className="block text-sm font-semibold text-slate-900"
            >
              Manual or Handheld Scanner Input
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Leading zeros are preserved automatically (e.g., 0089012345690).
            </p>
            <div className="mt-3 flex gap-2">
              <input
                id="manual-barcode-input"
                type="text"
                inputMode="numeric"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Enter or scan barcode..."
                className="min-h-[46px] flex-1 rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                <Search className="h-4 w-4" />
                Lookup
              </button>
            </div>
          </form>
        </section>

        {/* Lookup Result & Unknown Product Flow Column */}
        <section className="lg:col-span-6">
          {lookupStatus === 'idle' && (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Barcode className="h-10 w-10 text-slate-300" />
              <h2 className="mt-3 text-base font-semibold text-slate-900">
                Waiting for Barcode Scan
              </h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Point the rear camera at any product barcode or enter it manually to check your
                local master product database.
              </p>
            </div>
          )}

          {lookupStatus === 'found' && foundProduct && (
            <div className="rounded-2xl border border-emerald-200 bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-bold">Product Found in Master Database</span>
                </div>
                <span className="text-xs text-slate-500">{scanFormat}</span>
              </div>

              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-xs font-medium text-slate-500">Product Description</div>
                  <div className="mt-0.5 text-lg font-bold text-slate-900">
                    {foundProduct.productDescription}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">International Barcode</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {foundProduct.internationalBarcode}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Company Product Code</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {foundProduct.companyProductCode}
                    </div>
                  </div>
                </div>
              </div>

              {/* Existing batches indicator for multi-batch awareness */}
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Previously Saved Expiry Batches ({existingProductBatches.length})
                  </span>
                  <span className="text-xs text-slate-500">New scan adds a separate batch</span>
                </div>
                {existingProductBatches.length === 0 ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    No batches saved yet for this product.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600 tabular-nums">
                    {existingProductBatches.slice(0, 4).map((b, idx) => (
                      <li key={b.batchRecordId} className="flex items-center justify-between">
                        <span>
                          Batch {idx + 1}
                          {b.batchNumber ? ` (${b.batchNumber})` : ''}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatDisplayDate(b.expiryDate, b.isMonthOnly)}
                          {b.quantity !== undefined ? ` · Qty ${b.quantity}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onProceedToExpiry(foundProduct);
                  }}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Enter Expiry Date
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {lookupStatus === 'not_found' && (
            <div className="rounded-2xl border border-amber-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Product Not Found in Master Database
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Barcode{' '}
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {scannedBarcode}
                    </span>{' '}
                    is not in your local master file yet. Add it now and continue directly to
                    expiry date entry.
                  </p>
                </div>
              </div>

              {!showAddForm ? (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add New Product
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveNewProduct} className="mt-5 space-y-4 border-t border-slate-200 pt-5">
                  <div>
                    <label
                      htmlFor="add-product-barcode"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      International Barcode *
                    </label>
                    <input
                      id="add-product-barcode"
                      type="text"
                      required
                      value={newBarcode}
                      onChange={(e) => setNewBarcode(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="add-product-company-code"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Company Product Code
                    </label>
                    <input
                      id="add-product-company-code"
                      type="text"
                      value={newCompanyCode}
                      onChange={(e) => setNewCompanyCode(e.target.value)}
                      placeholder="e.g. 100248"
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="add-product-description"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Product Description *
                    </label>
                    <input
                      id="add-product-description"
                      type="text"
                      required
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="e.g. Pran Mango Juice 250ml"
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {formError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                      <p>{formError}</p>
                      {duplicateConflict && (
                        <button
                          type="button"
                          onClick={() => onEditExistingProduct(duplicateConflict)}
                          className="mt-2 min-h-[36px] rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Edit Existing Product ({duplicateConflict.productDescription})
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="min-h-[46px] rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingProduct}
                      className="min-h-[46px] flex-1 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {savingProduct ? 'Saving...' : 'Save Product'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
