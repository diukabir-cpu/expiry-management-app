import type {
  AppSettings,
  EnrichedBatchRecord,
  ExpiryBatchRecord,
  MasterProduct,
} from '../types';
import { getDaysRemaining, getExpiryStatus } from './dateAndExpiry';

export interface DashboardMetrics {
  totalMasterProducts: number;
  totalBatchRecords: number;
  expiredCount: number;
  within30DaysCount: number;
  within60DaysCount: number;
  within90DaysCount: number;
  bucket31to60Count: number;
  bucket61to90Count: number;
  safeCount: number;
}

export type ReportWindowFilter =
  | 'all'
  | 'expired'
  | '30'
  | '60'
  | '90'
  | 'custom';

export interface ReportFilterCriteria {
  window: ReportWindowFilter;
  customStartDate?: string;
  customEndDate?: string;
  productDescription?: string;
  companyProductCode?: string;
  internationalBarcode?: string;
  batchNumber?: string;
  globalQuery?: string;
}

export function enrichBatches(
  batches: ExpiryBatchRecord[],
  products: MasterProduct[],
  now: Date = new Date(),
  thresholds?: Pick<AppSettings, 'criticalDays' | 'warningDays' | 'upcomingDays'>
): EnrichedBatchRecord[] {
  const productMap = new Map<string, MasterProduct>();
  for (const product of products) {
    productMap.set(product.productId, product);
  }

  return batches
    .filter((b) => b.recordStatus !== 'cleared')
    .map((batch) => {
      const master = productMap.get(batch.productId);
      const daysRemaining = getDaysRemaining(batch.expiryDate, now);
      const status = getExpiryStatus(daysRemaining, thresholds);

      return {
        ...batch,
        internationalBarcode: master?.internationalBarcode ?? batch.internationalBarcode,
        companyProductCode: master?.companyProductCode ?? batch.companyProductCode,
        productDescription: master?.productDescription ?? batch.productDescription,
        daysRemaining,
        status,
      };
    })
    .sort((a, b) => {
      const dateCmp = a.expiryDate.localeCompare(b.expiryDate);
      if (dateCmp !== 0) return dateCmp;
      return a.productDescription.localeCompare(b.productDescription);
    });
}

export function computeDashboardMetrics(
  products: MasterProduct[],
  enrichedBatches: EnrichedBatchRecord[]
): DashboardMetrics {
  let expiredCount = 0;
  let within30DaysCount = 0;
  let within60DaysCount = 0;
  let within90DaysCount = 0;
  let bucket31to60Count = 0;
  let bucket61to90Count = 0;
  let safeCount = 0;

  for (const batch of enrichedBatches) {
    const d = batch.daysRemaining;
    if (d < 0) {
      expiredCount += 1;
    } else if (d <= 30) {
      within30DaysCount += 1;
      within60DaysCount += 1;
      within90DaysCount += 1;
    } else if (d <= 60) {
      bucket31to60Count += 1;
      within60DaysCount += 1;
      within90DaysCount += 1;
    } else if (d <= 90) {
      bucket61to90Count += 1;
      within90DaysCount += 1;
    } else {
      safeCount += 1;
    }
  }

  return {
    totalMasterProducts: products.length,
    totalBatchRecords: enrichedBatches.length,
    expiredCount,
    within30DaysCount,
    within60DaysCount,
    within90DaysCount,
    bucket31to60Count,
    bucket61to90Count,
    safeCount,
  };
}

export function filterReportBatches(
  enrichedBatches: EnrichedBatchRecord[],
  criteria: ReportFilterCriteria
): EnrichedBatchRecord[] {
  const descQ = (criteria.productDescription ?? '').trim().toLowerCase();
  const codeQ = (criteria.companyProductCode ?? '').trim().toLowerCase();
  const barcodeQ = (criteria.internationalBarcode ?? '').trim().toLowerCase();
  const batchQ = (criteria.batchNumber ?? '').trim().toLowerCase();
  const globalQ = (criteria.globalQuery ?? '').trim().toLowerCase();

  return enrichedBatches.filter((batch) => {
    const d = batch.daysRemaining;

    if (criteria.window === 'expired' && d >= 0) return false;
    if (criteria.window === '30' && (d < 0 || d > 30)) return false;
    if (criteria.window === '60' && (d < 0 || d > 60)) return false;
    if (criteria.window === '90' && (d < 0 || d > 90)) return false;
    if (criteria.window === 'custom') {
      if (criteria.customStartDate && batch.expiryDate < criteria.customStartDate) return false;
      if (criteria.customEndDate && batch.expiryDate > criteria.customEndDate) return false;
    }

    if (descQ && !batch.productDescription.toLowerCase().includes(descQ)) return false;
    if (codeQ && !batch.companyProductCode.toLowerCase().includes(codeQ)) return false;
    if (barcodeQ && !batch.internationalBarcode.toLowerCase().includes(barcodeQ)) return false;
    if (batchQ && !(batch.batchNumber ?? '').toLowerCase().includes(batchQ)) return false;

    if (globalQ) {
      const haystack = [
        batch.internationalBarcode,
        batch.companyProductCode,
        batch.productDescription,
        batch.batchNumber ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(globalQ)) return false;
    }

    return true;
  });
}

export function searchGlobalInventory(
  query: string,
  products: MasterProduct[],
  enrichedBatches: EnrichedBatchRecord[]
): Array<{ product: MasterProduct; batches: EnrichedBatchRecord[] }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const batchesByProduct = new Map<string, EnrichedBatchRecord[]>();
  const matchedProductIds = new Set<string>();

  for (const batch of enrichedBatches) {
    const list = batchesByProduct.get(batch.productId) ?? [];
    list.push(batch);
    batchesByProduct.set(batch.productId, list);

    if (batch.batchNumber && batch.batchNumber.toLowerCase().includes(q)) {
      matchedProductIds.add(batch.productId);
    }
  }

  return products
    .filter((p) => {
      if (matchedProductIds.has(p.productId)) return true;
      return (
        p.internationalBarcode.toLowerCase().includes(q) ||
        p.companyProductCode.toLowerCase().includes(q) ||
        p.productDescription.toLowerCase().includes(q)
      );
    })
    .map((product) => ({
      product,
      batches: batchesByProduct.get(product.productId) ?? [],
    }));
}
