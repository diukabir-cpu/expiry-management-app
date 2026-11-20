import React, { useMemo, useRef, useState } from 'react';
import {
  Barcode,
  Calendar,
  Camera,
  CheckCircle2,
  Edit3,
  ImageUp,
  Loader2,
  RotateCw,
  ScanText,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { addExpiryBatch } from '../db/database';
import { runOfflineExpiryOcr, type CropRect } from '../services/offlineOcr';
import type { EnrichedBatchRecord, MasterProduct } from '../types';
import {
  formatDisplayDate,
  monthYearToExpiryDate,
  type OcrExpiryParseResult,
} from '../utils/dateAndExpiry';

interface ExpiryEntryScreenProps {
  activeProduct: MasterProduct | null;
  allProducts: MasterProduct[];
  batches: EnrichedBatchRecord[];
  ocrLanguageMode: 'eng+ben' | 'eng';
  onSelectProduct: (product: MasterProduct | null) => void;
  onNavigateToScanner: () => void;
  onBatchSaved: () => Promise<void>;
}

export const ExpiryEntryScreen: React.FC<ExpiryEntryScreenProps> = ({
  activeProduct,
  allProducts,
  batches,
  ocrLanguageMode,
  onSelectProduct,
  onNavigateToScanner,
  onBatchSaved,
}) => {
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const galleryFileRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const monthInputRef = useRef<HTMLInputElement | null>(null);

  const [productFilter, setProductFilter] = useState('');

  // Captured image + crop/adjustment state
  const [capturedImageSrc, setCapturedImageSrc] = useState<string | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | undefined>(undefined);
  const [rotationDeg, setRotationDeg] = useState<0 | 90 | 180 | 270>(0);
  const [highContrast, setHighContrast] = useState(true);
  const [showCropTools, setShowCropTools] = useState(false);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });

  // OCR state
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [ocrResult, setOcrResult] = useState<OcrExpiryParseResult | null>(null);
  const [ocrRawText, setOcrRawText] = useState('');
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Batch verification form state
  const [isMonthOnly, setIsMonthOnly] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string | null>(null);

  const productBatches = useMemo(
    () =>
      activeProduct
        ? batches.filter((b) => b.productId === activeProduct.productId)
        : [],
    [activeProduct, batches]
  );

  const filteredProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    if (!q) return allProducts.slice(0, 20);
    return allProducts
      .filter(
        (p) =>
          p.internationalBarcode.toLowerCase().includes(q) ||
          p.companyProductCode.toLowerCase().includes(q) ||
          p.productDescription.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [allProducts, productFilter]);

  const executeOcr = async (
    imgSrc: string,
    rot: 0 | 90 | 180 | 270 = rotationDeg,
    cropBox: CropRect = crop,
    contrast: boolean = highContrast
  ) => {
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrStatusText('Starting offline OCR...');
    setOcrError(null);

    try {
      const result = await runOfflineExpiryOcr({
        imageSrc: imgSrc,
        langs: ocrLanguageMode,
        preprocess: {
          rotationDeg: rot,
          crop: cropBox,
          highContrast: contrast,
        },
        onProgress: (pct, text) => {
          setOcrProgress(pct);
          setOcrStatusText(text);
        },
      });

      setThumbnailDataUrl(result.thumbnailDataUrl);
      setOcrRawText(result.rawText);
      setOcrResult(result.parsed);

      if (result.parsed.detectedDate) {
        if (result.parsed.isMonthOnly && result.parsed.expiryMonth) {
          setIsMonthOnly(true);
          setExpiryMonth(result.parsed.expiryMonth);
          setExpiryDate(result.parsed.detectedDate);
        } else {
          setIsMonthOnly(false);
          setExpiryDate(result.parsed.detectedDate);
          setExpiryMonth(result.parsed.detectedDate.slice(0, 7));
        }
      }
    } catch (err) {
      setOcrError(
        err instanceof Error
          ? err.message
          : 'Offline OCR failed on this image. Please enter the expiry date manually.'
      );
    } finally {
      setOcrRunning(false);
    }
  };

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setCapturedImageSrc(dataUrl);
      setRotationDeg(0);
      const resetCrop: CropRect = { x: 0, y: 0, w: 1, h: 1 };
      setCrop(resetCrop);
      setOcrResult(null);
      setOcrRawText('');
      executeOcr(dataUrl, 0, resetCrop, highContrast);
    };
    reader.readAsDataURL(file);
  };

  const handleRetake = () => {
    setCapturedImageSrc(null);
    setThumbnailDataUrl(undefined);
    setOcrResult(null);
    setOcrRawText('');
    setOcrError(null);
    setRotationDeg(0);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
  };

  const handleCancelForm = () => {
    handleRetake();
    setExpiryDate('');
    setExpiryMonth('');
    setBatchNumber('');
    setQuantity('');
    setFormError(null);
    setSavedSuccessMessage(null);
  };

  const handleConfirmSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;
    setFormError(null);
    setSavedSuccessMessage(null);

    let resolvedDate = expiryDate;
    let resolvedMonth: string | undefined;

    if (isMonthOnly) {
      const converted = monthYearToExpiryDate(expiryMonth);
      if (!converted) {
        setFormError('Please select a valid expiry Month & Year.');
        return;
      }
      resolvedDate = converted.expiryDate;
      resolvedMonth = converted.expiryMonth;
    } else if (!resolvedDate) {
      setFormError('Please enter or verify the expiry date before saving.');
      return;
    }

    const parsedQty = quantity.trim() === '' ? undefined : Number(quantity);
    if (parsedQty !== undefined && (Number.isNaN(parsedQty) || parsedQty < 0)) {
      setFormError('Quantity must be zero or a positive number.');
      return;
    }

    setSaving(true);
    try {
      await addExpiryBatch({
        product: activeProduct,
        expiryDate: resolvedDate,
        expiryMonth: resolvedMonth,
        isMonthOnly,
        batchNumber: batchNumber.trim() || undefined,
        quantity: parsedQty,
        capturedImage: thumbnailDataUrl,
        ocrRawText: ocrRawText || undefined,
      });
      await onBatchSaved();
      setSavedSuccessMessage(
        `Saved batch expiring ${formatDisplayDate(resolvedDate, isMonthOnly)} for ${activeProduct.productDescription}.`
      );
      // Reset inputs for fast next-batch entry while keeping product selected
      handleRetake();
      setExpiryDate('');
      setExpiryMonth('');
      setBatchNumber('');
      setQuantity('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save batch.');
    } finally {
      setSaving(false);
    }
  };

  if (!activeProduct) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expiry Entry</h1>
            <p className="mt-1 text-sm text-slate-600">
              Select a product or scan a barcode to capture and verify its batch expiry date.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToScanner}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <Barcode className="h-4 w-4" />
            Scan Barcode
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <label
            htmlFor="select-product-search"
            className="block text-sm font-semibold text-slate-900"
          >
            Choose Product from Master Database
          </label>
          <input
            id="select-product-search"
            type="search"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            placeholder="Search by barcode, company code, or product name..."
            className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
          />

          {filteredProducts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm text-slate-600">
                No matching master products found. Scan a barcode to add a new product.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {filteredProducts.map((p) => (
                <button
                  key={p.productId}
                  type="button"
                  onClick={() => onSelectProduct(p)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">
                      {p.productDescription}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                      {p.internationalBarcode} · Code {p.companyProductCode}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                    Select →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Expiry Date Verification
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Capture packaging expiry photo (English or Bengali digits) and save a new batch record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectProduct(null)}
            className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Change Product
          </button>
          <button
            type="button"
            onClick={onNavigateToScanner}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Barcode className="h-4 w-4" />
            Scan Next Product
          </button>
        </div>
      </div>

      {savedSuccessMessage && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-semibold">{savedSuccessMessage}</div>
              <p className="mt-0.5 text-xs text-emerald-700">
                You can immediately enter another batch for this product or scan a different item.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSavedSuccessMessage(null)}
            aria-label="Dismiss notification"
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Product Context Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-xs font-medium text-slate-500">Selected Master Product</div>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">
              {activeProduct.productDescription}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
              <span className="font-mono">Barcode: {activeProduct.internationalBarcode}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">Company Code: {activeProduct.companyProductCode}</span>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xs text-slate-500">Saved Batches</div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {productBatches.length}
            </div>
          </div>
        </div>

        {productBatches.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-600">
              Existing Batches (preserved — new entry adds another batch):
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
              {productBatches.map((b, i) => (
                <span key={b.batchRecordId}>
                  #{i + 1}: <strong>{formatDisplayDate(b.expiryDate, b.isMonthOnly)}</strong>
                  {b.quantity !== undefined ? ` (Qty ${b.quantity})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Offline OCR Capture & Crop Column */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                1. Offline Expiry OCR Camera
              </h2>
              <p className="text-xs text-slate-500">
                Supports EXP, BB, USE BY &amp; Bengali digits (০১২৩৪৫৬৭৮৯).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => cameraFileRef.current?.click()}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Camera className="h-4 w-4 shrink-0" />
              Capture Expiry Date
            </button>
            <button
              type="button"
              onClick={() => galleryFileRef.current?.click()}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <ImageUp className="h-4 w-4 shrink-0" />
              Choose from Gallery
            </button>
            <input
              ref={cameraFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelected}
              className="hidden"
            />
            <input
              ref={galleryFileRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelected}
              className="hidden"
            />
          </div>

          {capturedImageSrc && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                <img
                  src={capturedImageSrc}
                  alt="Captured packaging expiry area"
                  style={{
                    transform: `rotate(${rotationDeg}deg)`,
                  }}
                  className="mx-auto max-h-64 w-full object-contain transition-transform"
                />
                {showCropTools && (
                  <div
                    aria-hidden="true"
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`,
                      height: `${crop.h * 100}%`,
                    }}
                    className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/10"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextRot = ((rotationDeg + 90) % 360) as 0 | 90 | 180 | 270;
                    setRotationDeg(nextRot);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Rotate 90°
                </button>
                <button
                  type="button"
                  onClick={() => setShowCropTools((v) => !v)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                    showCropTools
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Crop &amp; Contrast
                </button>
                <button
                  type="button"
                  disabled={ocrRunning}
                  onClick={() => executeOcr(capturedImageSrc)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <ScanText className="h-3.5 w-3.5" />
                  Re-run Offline OCR
                </button>
              </div>

              {showCropTools && (
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <label className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">High-Contrast Ink Filter</span>
                    <input
                      type="checkbox"
                      checked={highContrast}
                      onChange={(e) => setHighContrast(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-slate-600">Top Trim ({Math.round(crop.y * 100)}%)</span>
                      <input
                        type="range"
                        min={0}
                        max={60}
                        value={Math.round(crop.y * 100)}
                        onChange={(e) => {
                          const y = Number(e.target.value) / 100;
                          setCrop((c) => ({ ...c, y, h: Math.max(0.2, Math.min(c.h, 1 - y)) }));
                        }}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="block">
                      <span className="text-slate-600">Height ({Math.round(crop.h * 100)}%)</span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={Math.round(crop.h * 100)}
                        onChange={(e) => {
                          const h = Number(e.target.value) / 100;
                          setCrop((c) => ({ ...c, h: Math.min(h, 1 - c.y) }));
                        }}
                        className="mt-1 w-full"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {ocrRunning && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                <span>{ocrStatusText}</span>
                <span className="ml-auto tabular-nums">{ocrProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-emerald-600 transition-all"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
            </div>
          )}

          {ocrError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {ocrError}
            </div>
          )}

          {ocrResult && !ocrRunning && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  OCR Detection:{' '}
                  {ocrResult.detectedDate
                    ? formatDisplayDate(ocrResult.detectedDate, ocrResult.isMonthOnly)
                    : 'No date detected — enter manually'}
                </span>
                <span className="text-slate-500">Confidence: {ocrResult.confidence}</span>
              </div>

              {ocrResult.candidates.length > 1 && (
                <div>
                  <div className="mb-1 text-slate-600">Multiple dates found — tap to select:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ocrResult.candidates.map((cand, i) => {
                      const isSelected = expiryDate === cand.date;
                      return (
                        <button
                          key={`${cand.date}-${i}`}
                          type="button"
                          onClick={() => {
                            if (cand.isMonthOnly && cand.expiryMonth) {
                              setIsMonthOnly(true);
                              setExpiryMonth(cand.expiryMonth);
                              setExpiryDate(cand.date);
                            } else {
                              setIsMonthOnly(false);
                              setExpiryDate(cand.date);
                              setExpiryMonth(cand.date.slice(0, 7));
                            }
                          }}
                          className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-medium transition-colors tabular-nums ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          {formatDisplayDate(cand.date, cand.isMonthOnly)} (
                          {cand.label.toUpperCase()})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {ocrRawText && (
                <details className="pt-1">
                  <summary className="cursor-pointer font-medium text-slate-600">
                    Inspect Raw OCR Text
                  </summary>
                  <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-700">
                    {ocrRawText}
                  </pre>
                </details>
              )}
            </div>
          )}
        </section>

        {/* Verification & Save Batch Form Column */}
        <form
          onSubmit={handleConfirmSaveBatch}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              2. Verify &amp; Save Expiry Batch
            </h2>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isMonthOnly}
                onChange={(e) => setIsMonthOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Month &amp; Year Only
            </label>
          </div>

          <div>
            {isMonthOnly ? (
              <>
                <label
                  htmlFor="verify-expiry-month"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Expiry Month &amp; Year *
                </label>
                <div className="relative mt-1">
                  <input
                    ref={monthInputRef}
                    id="verify-expiry-month"
                    type="month"
                    required
                    value={expiryMonth}
                    onChange={(e) => {
                      setExpiryMonth(e.target.value);
                      const converted = monthYearToExpiryDate(e.target.value);
                      if (converted) setExpiryDate(converted.expiryDate);
                    }}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-base font-semibold text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Saved using the last calendar day of that month.
                </p>
              </>
            ) : (
              <>
                <label
                  htmlFor="verify-expiry-date"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Verified Expiry Date *
                </label>
                <div className="relative mt-1 flex items-center">
                  <Calendar className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                  <input
                    ref={dateInputRef}
                    id="verify-expiry-date"
                    type="date"
                    required
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 pl-10 pr-3.5 text-base font-semibold text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="batch-number-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Batch Number (Optional)
              </label>
              <input
                id="batch-number-input"
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g. B-204"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="batch-quantity-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Quantity (Optional)
              </label>
              <input
                id="batch-quantity-input"
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 12"
                className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
              {formError}
            </div>
          )}

          {/* Required Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="col-span-2 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving Batch...' : 'Confirm & Save Batch'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isMonthOnly) monthInputRef.current?.focus();
                else dateInputRef.current?.focus();
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit Expiry Date
            </button>

            <button
              type="button"
              onClick={() => {
                handleRetake();
                cameraFileRef.current?.click();
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Camera className="h-3.5 w-3.5" />
              Retake Photo
            </button>

            <button
              type="button"
              onClick={handleCancelForm}
              className="col-span-2 min-h-[44px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
