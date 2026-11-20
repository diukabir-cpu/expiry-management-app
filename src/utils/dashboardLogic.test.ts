import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExpiryBatchRecord, MasterProduct } from '../types';
import {
  computeDashboardMetrics,
  enrichBatches,
  filterReportBatches,
  searchGlobalInventory,
} from './dashboardLogic';

const sampleProducts: MasterProduct[] = [
  {
    productId: 'p1',
    internationalBarcode: '0089012345690',
    companyProductCode: '100245',
    productDescription: 'Dove Shampoo 180ml',
    dateAdded: '2026-11-01T00:00:00.000Z',
    dateUpdated: '2026-11-01T00:00:00.000Z',
    source: 'excel_import',
  },
  {
    productId: 'p2',
    internationalBarcode: '8901234567891',
    companyProductCode: '100246',
    productDescription: 'Lux Soap 100g',
    dateAdded: '2026-11-01T00:00:00.000Z',
    dateUpdated: '2026-11-01T00:00:00.000Z',
    source: 'manual_addition',
  },
];

const sampleBatches: ExpiryBatchRecord[] = [
  {
    batchRecordId: 'b1',
    productId: 'p1',
    internationalBarcode: '0089012345690',
    companyProductCode: '100245',
    productDescription: 'Dove Shampoo 180ml',
    batchNumber: 'B-EXP',
    quantity: 4,
    expiryDate: '2026-11-10', // -10d (expired)
    scanDate: '2026-11-01',
    scanTime: '10:00:00',
    recordStatus: 'active',
  },
  {
    batchRecordId: 'b2',
    productId: 'p1',
    internationalBarcode: '0089012345690',
    companyProductCode: '100245',
    productDescription: 'Dove Shampoo 180ml',
    batchNumber: 'B-30',
    quantity: 10,
    expiryDate: '2026-12-05', // +15d (critical 0-30)
    scanDate: '2026-11-02',
    scanTime: '10:05:00',
    recordStatus: 'active',
  },
  {
    batchRecordId: 'b3',
    productId: 'p1',
    internationalBarcode: '0089012345690',
    companyProductCode: '100245',
    productDescription: 'Dove Shampoo 180ml',
    batchNumber: 'B-60',
    quantity: 8,
    expiryDate: '2027-01-05', // +46d (warning 31-60)
    scanDate: '2026-11-03',
    scanTime: '11:00:00',
    recordStatus: 'active',
  },
  {
    batchRecordId: 'b4',
    productId: 'p2',
    internationalBarcode: '8901234567891',
    companyProductCode: '100246',
    productDescription: 'Lux Soap 100g',
    batchNumber: 'B-90',
    quantity: 15,
    expiryDate: '2027-02-05', // +77d (upcoming 61-90)
    scanDate: '2026-11-04',
    scanTime: '12:00:00',
    recordStatus: 'active',
  },
  {
    batchRecordId: 'b5',
    productId: 'p2',
    internationalBarcode: '8901234567891',
    companyProductCode: '100246',
    productDescription: 'Lux Soap 100g',
    batchNumber: 'B-SAFE',
    quantity: 25,
    expiryDate: '2027-06-01', // >90d (safe)
    scanDate: '2026-11-05',
    scanTime: '14:00:00',
    recordStatus: 'active',
  },
];

test('enrichBatches counts and sorts multiple batches for the same product independently', () => {
  const today = new Date(2026, 10, 20); // 2026-11-20
  const enriched = enrichBatches(sampleBatches, sampleProducts, today);
  assert.equal(enriched.length, 5);
  assert.equal(enriched[0].batchRecordId, 'b1');
  assert.equal(enriched[4].batchRecordId, 'b5');

  const metrics = computeDashboardMetrics(sampleProducts, enriched);
  assert.equal(metrics.totalMasterProducts, 2);
  assert.equal(metrics.totalBatchRecords, 5);
  assert.equal(metrics.expiredCount, 1);
  assert.equal(metrics.within30DaysCount, 1);
  assert.equal(metrics.within60DaysCount, 2);
  assert.equal(metrics.within90DaysCount, 3);
  assert.equal(metrics.bucket31to60Count, 1);
  assert.equal(metrics.bucket61to90Count, 1);
  assert.equal(metrics.safeCount, 1);
});

test('filterReportBatches filters accurately by window and metadata fields', () => {
  const today = new Date(2026, 10, 20);
  const enriched = enrichBatches(sampleBatches, sampleProducts, today);

  assert.equal(filterReportBatches(enriched, { window: 'expired' }).length, 1);
  assert.equal(filterReportBatches(enriched, { window: '30' }).length, 1);
  assert.equal(filterReportBatches(enriched, { window: '60' }).length, 2);
  assert.equal(filterReportBatches(enriched, { window: '90' }).length, 3);
  assert.equal(
    filterReportBatches(enriched, { window: 'all', batchNumber: 'B-60' })[0].batchRecordId,
    'b3'
  );
});

test('searchGlobalInventory matches by barcode with leading zeros, company code, description, and batch number', () => {
  const today = new Date(2026, 10, 20);
  const enriched = enrichBatches(sampleBatches, sampleProducts, today);

  const byLeadingZero = searchGlobalInventory('008901', sampleProducts, enriched);
  assert.equal(byLeadingZero.length, 1);
  assert.equal(byLeadingZero[0].batches.length, 3);

  const byBatch = searchGlobalInventory('B-SAFE', sampleProducts, enriched);
  assert.equal(byBatch.length, 1);
  assert.equal(byBatch[0].product.productId, 'p2');
});
