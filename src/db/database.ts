import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppBackupPayload,
  AppSettings,
  ExpiryBatchRecord,
  MasterProduct,
  ProductSource,
} from '../types';
import { getCurrentTimeHms, getTodayYmd } from '../utils/dateAndExpiry';
import { normalizeBarcode, type ValidatedImportRow } from '../utils/excelUtils';

interface RetailExpiryDB extends DBSchema {
  master_products: {
    key: string;
    value: MasterProduct;
    indexes: {
      by_barcode: string;
      by_company_code: string;
    };
  };
  expiry_batches: {
    key: string;
    value: ExpiryBatchRecord;
    indexes: {
      by_product_id: string;
      by_barcode: string;
      by_expiry_date: string;
    };
  };
  app_settings: {
    key: string;
    value: AppSettings;
  };
}

const DB_NAME = 'retail_expiry_tracker_db';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  storeName: 'Main Supermarket Branch',
  ocrLanguageMode: 'eng+ben',
  defaultReportWindow: '90',
  criticalDays: 30,
  warningDays: 60,
  upcomingDays: 90,
};

export class DuplicateBarcodeError extends Error {
  public existingProduct: MasterProduct;
  constructor(existingProduct: MasterProduct) {
    super(`Barcode ${existingProduct.internationalBarcode} already exists.`);
    this.name = 'DuplicateBarcodeError';
    this.existingProduct = existingProduct;
  }
}

let dbPromise: Promise<IDBPDatabase<RetailExpiryDB>> | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDatabase(): Promise<IDBPDatabase<RetailExpiryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RetailExpiryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('master_products')) {
          const productStore = db.createObjectStore('master_products', {
            keyPath: 'productId',
          });
          productStore.createIndex('by_barcode', 'internationalBarcode', { unique: true });
          productStore.createIndex('by_company_code', 'companyProductCode', { unique: false });
        }

        if (!db.objectStoreNames.contains('expiry_batches')) {
          const batchStore = db.createObjectStore('expiry_batches', {
            keyPath: 'batchRecordId',
          });
          batchStore.createIndex('by_product_id', 'productId', { unique: false });
          batchStore.createIndex('by_barcode', 'internationalBarcode', { unique: false });
          batchStore.createIndex('by_expiry_date', 'expiryDate', { unique: false });
        }

        if (!db.objectStoreNames.contains('app_settings')) {
          db.createObjectStore('app_settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDatabase();
  const saved = await db.get('app_settings', 'default');
  if (!saved) {
    await db.put('app_settings', DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const db = await getDatabase();
  const next = { ...settings, id: 'default' };
  await db.put('app_settings', next);
  return next;
}

export async function getAllProducts(): Promise<MasterProduct[]> {
  const db = await getDatabase();
  const all = await db.getAll('master_products');
  return all.sort((a, b) => a.productDescription.localeCompare(b.productDescription));
}

export async function getProductByBarcode(barcode: string): Promise<MasterProduct | undefined> {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return undefined;
  const db = await getDatabase();
  return db.getFromIndex('master_products', 'by_barcode', normalized);
}

export async function addMasterProduct(input: {
  internationalBarcode: string;
  companyProductCode: string;
  productDescription: string;
  source?: ProductSource;
}): Promise<MasterProduct> {
  const db = await getDatabase();
  const barcode = normalizeBarcode(input.internationalBarcode);
  if (!barcode) {
    throw new Error('International Barcode is required.');
  }
  const description = input.productDescription.trim();
  if (!description) {
    throw new Error('Product Description is required.');
  }

  const existing = await db.getFromIndex('master_products', 'by_barcode', barcode);
  if (existing) {
    throw new DuplicateBarcodeError(existing);
  }

  const nowIso = new Date().toISOString();
  const product: MasterProduct = {
    productId: generateId(),
    internationalBarcode: barcode,
    companyProductCode: input.companyProductCode.trim() || '-',
    productDescription: description,
    dateAdded: nowIso,
    dateUpdated: nowIso,
    source: input.source ?? 'manual_addition',
  };

  await db.add('master_products', product);
  return product;
}

export async function updateMasterProduct(updated: {
  productId: string;
  internationalBarcode: string;
  companyProductCode: string;
  productDescription: string;
}): Promise<MasterProduct> {
  const db = await getDatabase();
  const current = await db.get('master_products', updated.productId);
  if (!current) {
    throw new Error('Product record not found.');
  }

  const barcode = normalizeBarcode(updated.internationalBarcode);
  if (!barcode) {
    throw new Error('International Barcode is required.');
  }
  const description = updated.productDescription.trim();
  if (!description) {
    throw new Error('Product Description is required.');
  }

  const conflicting = await db.getFromIndex('master_products', 'by_barcode', barcode);
  if (conflicting && conflicting.productId !== updated.productId) {
    throw new DuplicateBarcodeError(conflicting);
  }

  const nextProduct: MasterProduct = {
    ...current,
    internationalBarcode: barcode,
    companyProductCode: updated.companyProductCode.trim() || '-',
    productDescription: description,
    dateUpdated: new Date().toISOString(),
  };

  const tx = db.transaction(['master_products', 'expiry_batches'], 'readwrite');
  await tx.objectStore('master_products').put(nextProduct);

  // Keep denormalized snapshots on associated batches aligned with updated master record
  const batchIndex = tx.objectStore('expiry_batches').index('by_product_id');
  const linkedBatches = await batchIndex.getAll(updated.productId);
  for (const batch of linkedBatches) {
    await tx.objectStore('expiry_batches').put({
      ...batch,
      internationalBarcode: nextProduct.internationalBarcode,
      companyProductCode: nextProduct.companyProductCode,
      productDescription: nextProduct.productDescription,
    });
  }

  await tx.done;
  return nextProduct;
}

export async function deleteMasterProduct(
  productId: string,
  deleteLinkedBatches = true
): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['master_products', 'expiry_batches'], 'readwrite');
  await tx.objectStore('master_products').delete(productId);

  if (deleteLinkedBatches) {
    const linked = await tx
      .objectStore('expiry_batches')
      .index('by_product_id')
      .getAllKeys(productId);
    for (const key of linked) {
      await tx.objectStore('expiry_batches').delete(key);
    }
  }

  await tx.done;
}

export type ImportMode = 'add_only' | 'update_existing' | 'replace_all';

export interface ImportExecutionResult {
  importedCount: number;
  updatedCount: number;
  skippedDuplicates: number;
}

export async function importMasterProducts(
  rows: ValidatedImportRow[],
  mode: ImportMode
): Promise<ImportExecutionResult> {
  const db = await getDatabase();
  const nowIso = new Date().toISOString();

  let importedCount = 0;
  let updatedCount = 0;
  let skippedDuplicates = 0;

  if (mode === 'replace_all') {
    const tx = db.transaction('master_products', 'readwrite');
    await tx.objectStore('master_products').clear();
    for (const row of rows) {
      await tx.objectStore('master_products').add({
        productId: generateId(),
        internationalBarcode: row.internationalBarcode,
        companyProductCode: row.companyProductCode,
        productDescription: row.productDescription,
        dateAdded: nowIso,
        dateUpdated: nowIso,
        source: 'excel_import',
      });
      importedCount += 1;
    }
    await tx.done;
    return { importedCount, updatedCount, skippedDuplicates };
  }

  const tx = db.transaction(['master_products', 'expiry_batches'], 'readwrite');
  const productStore = tx.objectStore('master_products');
  const barcodeIndex = productStore.index('by_barcode');

  for (const row of rows) {
    const existing = await barcodeIndex.get(row.internationalBarcode);
    if (existing) {
      if (mode === 'update_existing') {
        const next: MasterProduct = {
          ...existing,
          companyProductCode: row.companyProductCode,
          productDescription: row.productDescription,
          dateUpdated: nowIso,
        };
        await productStore.put(next);

        const linked = await tx
          .objectStore('expiry_batches')
          .index('by_product_id')
          .getAll(existing.productId);
        for (const batch of linked) {
          await tx.objectStore('expiry_batches').put({
            ...batch,
            companyProductCode: next.companyProductCode,
            productDescription: next.productDescription,
          });
        }
        updatedCount += 1;
      } else {
        skippedDuplicates += 1;
      }
    } else {
      await productStore.add({
        productId: generateId(),
        internationalBarcode: row.internationalBarcode,
        companyProductCode: row.companyProductCode,
        productDescription: row.productDescription,
        dateAdded: nowIso,
        dateUpdated: nowIso,
        source: 'excel_import',
      });
      importedCount += 1;
    }
  }

  await tx.done;
  return { importedCount, updatedCount, skippedDuplicates };
}

export async function getAllBatches(): Promise<ExpiryBatchRecord[]> {
  const db = await getDatabase();
  return db.getAll('expiry_batches');
}

export async function addExpiryBatch(input: {
  product: MasterProduct;
  expiryDate: string;
  expiryMonth?: string;
  isMonthOnly?: boolean;
  batchNumber?: string;
  quantity?: number;
  capturedImage?: string;
  ocrRawText?: string;
}): Promise<ExpiryBatchRecord> {
  const db = await getDatabase();
  const now = new Date();

  // Always generates a distinct batchRecordId — never overwrites an older batch
  const batch: ExpiryBatchRecord = {
    batchRecordId: generateId(),
    productId: input.product.productId,
    internationalBarcode: input.product.internationalBarcode,
    companyProductCode: input.product.companyProductCode,
    productDescription: input.product.productDescription,
    batchNumber: input.batchNumber?.trim() || undefined,
    quantity: input.quantity !== undefined && !Number.isNaN(input.quantity) ? input.quantity : undefined,
    expiryDate: input.expiryDate,
    expiryMonth: input.expiryMonth,
    isMonthOnly: input.isMonthOnly,
    capturedImage: input.capturedImage,
    scanDate: getTodayYmd(now),
    scanTime: getCurrentTimeHms(now),
    recordStatus: 'active',
    ocrRawText: input.ocrRawText,
  };

  await db.add('expiry_batches', batch);
  return batch;
}

export async function updateExpiryBatch(batch: ExpiryBatchRecord): Promise<ExpiryBatchRecord> {
  const db = await getDatabase();
  await db.put('expiry_batches', batch);
  return batch;
}

export async function deleteExpiryBatch(batchRecordId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('expiry_batches', batchRecordId);
}

export async function exportFullBackup(): Promise<AppBackupPayload> {
  const [products, batches, settings] = await Promise.all([
    getAllProducts(),
    getAllBatches(),
    getSettings(),
  ]);

  return {
    schemaVersion: 1,
    appName: 'Retail Expiry Tracker',
    exportedAt: new Date().toISOString(),
    products,
    batches,
    settings,
  };
}

export async function restoreFullBackup(payload: AppBackupPayload): Promise<{
  productsRestored: number;
  batchesRestored: number;
}> {
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    !Array.isArray(payload.products) ||
    !Array.isArray(payload.batches)
  ) {
    throw new Error('Invalid backup file format.');
  }

  const db = await getDatabase();
  const tx = db.transaction(['master_products', 'expiry_batches', 'app_settings'], 'readwrite');
  await tx.objectStore('master_products').clear();
  await tx.objectStore('expiry_batches').clear();

  for (const product of payload.products) {
    await tx.objectStore('master_products').put({
      ...product,
      internationalBarcode: normalizeBarcode(product.internationalBarcode),
    });
  }

  for (const batch of payload.batches) {
    await tx.objectStore('expiry_batches').put({
      ...batch,
      internationalBarcode: normalizeBarcode(batch.internationalBarcode),
    });
  }

  if (payload.settings) {
    await tx.objectStore('app_settings').put({
      ...DEFAULT_SETTINGS,
      ...payload.settings,
      id: 'default',
    });
  }

  await tx.done;
  return {
    productsRestored: payload.products.length,
    batchesRestored: payload.batches.length,
  };
}

export async function clearAllDatabaseData(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['master_products', 'expiry_batches'], 'readwrite');
  await tx.objectStore('master_products').clear();
  await tx.objectStore('expiry_batches').clear();
  await tx.done;
}

function addDaysYmd(base: Date, offsetDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function loadSampleSupermarketData(): Promise<void> {
  const db = await getDatabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = getTodayYmd(now);
  const time = getCurrentTimeHms(now);

  const sampleProducts: MasterProduct[] = [
    {
      productId: 'sample-dove-180',
      internationalBarcode: '8901234567890',
      companyProductCode: '100245',
      productDescription: 'Dove Shampoo 180ml',
      dateAdded: nowIso,
      dateUpdated: nowIso,
      source: 'excel_import',
    },
    {
      productId: 'sample-lux-100',
      internationalBarcode: '8901234567891',
      companyProductCode: '100246',
      productDescription: 'Lux Soap 100g',
      dateAdded: nowIso,
      dateUpdated: nowIso,
      source: 'excel_import',
    },
    {
      productId: 'sample-nescafe-50',
      internationalBarcode: '8901234567892',
      companyProductCode: '100247',
      productDescription: 'Nescafe Classic 50g',
      dateAdded: nowIso,
      dateUpdated: nowIso,
      source: 'excel_import',
    },
    {
      productId: 'sample-aarong-milk',
      internationalBarcode: '0049022001122',
      companyProductCode: '00310',
      productDescription: 'Aarong Fresh UHT Milk 1L',
      dateAdded: nowIso,
      dateUpdated: nowIso,
      source: 'excel_import',
    },
    {
      productId: 'sample-pran-juice',
      internationalBarcode: '0089010588512',
      companyProductCode: '100412',
      productDescription: 'Pran Frooto Mango Drink 250ml',
      dateAdded: nowIso,
      dateUpdated: nowIso,
      source: 'manual_addition',
    },
  ];

  const sampleBatches: ExpiryBatchRecord[] = [
    {
      batchRecordId: 'sample-batch-1',
      productId: 'sample-aarong-milk',
      internationalBarcode: '0049022001122',
      companyProductCode: '00310',
      productDescription: 'Aarong Fresh UHT Milk 1L',
      batchNumber: 'AM-2610',
      quantity: 6,
      expiryDate: addDaysYmd(now, -4), // Already expired
      scanDate: today,
      scanTime: time,
      recordStatus: 'active',
    },
    {
      batchRecordId: 'sample-batch-2',
      productId: 'sample-dove-180',
      internationalBarcode: '8901234567890',
      companyProductCode: '100245',
      productDescription: 'Dove Shampoo 180ml',
      batchNumber: 'DV-01A',
      quantity: 10,
      expiryDate: addDaysYmd(now, 14), // Critical 0-30 days
      scanDate: today,
      scanTime: time,
      recordStatus: 'active',
    },
    {
      batchRecordId: 'sample-batch-3',
      productId: 'sample-dove-180',
      internationalBarcode: '8901234567890',
      companyProductCode: '100245',
      productDescription: 'Dove Shampoo 180ml',
      batchNumber: 'DV-02B',
      quantity: 15,
      expiryDate: addDaysYmd(now, 45), // Warning 31-60 days
      scanDate: today,
      scanTime: time,
      recordStatus: 'active',
    },
    {
      batchRecordId: 'sample-batch-4',
      productId: 'sample-dove-180',
      internationalBarcode: '8901234567890',
      companyProductCode: '100245',
      productDescription: 'Dove Shampoo 180ml',
      batchNumber: 'DV-03C',
      quantity: 8,
      expiryDate: addDaysYmd(now, 140), // Safe >90 days
      scanDate: today,
      scanTime: time,
      recordStatus: 'active',
    },
    {
      batchRecordId: 'sample-batch-5',
      productId: 'sample-nescafe-50',
      internationalBarcode: '8901234567892',
      companyProductCode: '100247',
      productDescription: 'Nescafe Classic 50g',
      batchNumber: 'NC-771',
      quantity: 12,
      expiryDate: addDaysYmd(now, 74), // Upcoming 61-90 days
      scanDate: today,
      scanTime: time,
      recordStatus: 'active',
    },
    {
      batchRecordId: 'sample-batch-6',
      productId: 'sample-lux-100',
      internationalBarcode: '8901234567891',
      companyProductCode: '100246',
      productDescription: 'Lux Soap 100g',
      batchNumber: 'LX-409',
      quantity: 24,
      expiryDate: addDaysYmd(now, 25), // Critical 0-30 days
      scanDate: today,
      scanTime: time,
      recordStatus: 'active',
    },
  ];

  const tx = db.transaction(['master_products', 'expiry_batches'], 'readwrite');
  for (const p of sampleProducts) {
    const existing = await tx.objectStore('master_products').index('by_barcode').get(p.internationalBarcode);
    if (!existing) {
      await tx.objectStore('master_products').put(p);
    }
  }
  for (const b of sampleBatches) {
    await tx.objectStore('expiry_batches').put(b);
  }
  await tx.done;
}
