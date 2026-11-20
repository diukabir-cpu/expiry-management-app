export type ProductSource = 'excel_import' | 'manual_addition';

export interface MasterProduct {
  productId: string;
  internationalBarcode: string;
  companyProductCode: string;
  productDescription: string;
  dateAdded: string;
  dateUpdated: string;
  source: ProductSource;
}

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'upcoming' | 'safe';

export interface ExpiryBatchRecord {
  batchRecordId: string;
  productId: string;
  internationalBarcode: string;
  companyProductCode: string;
  productDescription: string;
  batchNumber?: string;
  quantity?: number;
  expiryDate: string; // YYYY-MM-DD
  expiryMonth?: string; // YYYY-MM when month-only
  isMonthOnly?: boolean;
  capturedImage?: string; // compressed DataURL
  scanDate: string; // YYYY-MM-DD
  scanTime: string; // HH:mm:ss
  recordStatus: 'active' | 'cleared';
  ocrRawText?: string;
}

export interface EnrichedBatchRecord extends ExpiryBatchRecord {
  daysRemaining: number;
  status: ExpiryStatus;
}

export type NavScreen =
  | 'dashboard'
  | 'scanner'
  | 'expiry-entry'
  | 'reports'
  | 'products'
  | 'import'
  | 'backup'
  | 'settings';

export interface AppSettings {
  id: string;
  storeName: string;
  ocrLanguageMode: 'eng+ben' | 'eng';
  defaultReportWindow: 'all' | 'expired' | '30' | '60' | '90';
  criticalDays: number;
  warningDays: number;
  upcomingDays: number;
}

export interface ColumnMapping {
  internationalBarcode: string;
  companyProductCode: string;
  productDescription: string;
}

export interface AppBackupPayload {
  schemaVersion: 1;
  appName: 'Retail Expiry Tracker';
  exportedAt: string;
  products: MasterProduct[];
  batches: ExpiryBatchRecord[];
  settings: AppSettings;
}
