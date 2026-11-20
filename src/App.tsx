import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { BackupRestoreScreen } from './components/BackupRestoreScreen';
import { BarcodeScannerScreen } from './components/BarcodeScannerScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { ExpiryEntryScreen } from './components/ExpiryEntryScreen';
import { ExpiryReportsScreen } from './components/ExpiryReportsScreen';
import { ImportExcelScreen } from './components/ImportExcelScreen';
import { MasterProductsScreen } from './components/MasterProductsScreen';
import { ProductBatchesModal } from './components/ProductBatchesModal';
import { SettingsScreen } from './components/SettingsScreen';
import {
  DEFAULT_SETTINGS,
  deleteExpiryBatch,
  getAllBatches,
  getAllProducts,
  getSettings,
  loadSampleSupermarketData,
  saveSettings,
  updateExpiryBatch,
} from './db/database';
import type {
  AppSettings,
  EnrichedBatchRecord,
  ExpiryBatchRecord,
  MasterProduct,
  NavScreen,
} from './types';
import { enrichBatches } from './utils/dashboardLogic';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<NavScreen>('dashboard');
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [rawBatches, setRawBatches] = useState<ExpiryBatchRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const [expiryTargetProduct, setExpiryTargetProduct] = useState<MasterProduct | null>(null);
  const [inspectingProduct, setInspectingProduct] = useState<MasterProduct | null>(null);
  const [editProductShortcut, setEditProductShortcut] = useState<MasterProduct | null>(null);

  const refreshData = useCallback(async () => {
    const [loadedProducts, loadedBatches, loadedSettings] = await Promise.all([
      getAllProducts(),
      getAllBatches(),
      getSettings(),
    ]);
    setProducts(loadedProducts);
    setRawBatches(loadedBatches);
    setSettings(loadedSettings);
  }, []);

  useEffect(() => {
    refreshData().finally(() => setLoading(false));
  }, [refreshData]);

  const enrichedBatches = useMemo(
    () =>
      enrichBatches(rawBatches, products, new Date(), {
        criticalDays: settings.criticalDays,
        warningDays: settings.warningDays,
        upcomingDays: settings.upcomingDays,
      }),
    [rawBatches, products, settings]
  );

  const handleProceedToExpiry = (product: MasterProduct) => {
    setExpiryTargetProduct(product);
    setActiveScreen('expiry-entry');
  };

  const handleEditExistingFromScanner = (product: MasterProduct) => {
    setEditProductShortcut(product);
    setActiveScreen('products');
  };

  const handleLoadSampleData = async () => {
    await loadSampleSupermarketData();
    await refreshData();
  };

  const handleUpdateBatch = async (batch: EnrichedBatchRecord) => {
    const { daysRemaining: _days, status: _status, ...clean } = batch;
    await updateExpiryBatch(clean);
    await refreshData();
  };

  const handleDeleteBatch = async (batchRecordId: string) => {
    await deleteExpiryBatch(batchRecordId);
    await refreshData();
  };

  const handleSaveSettings = async (next: AppSettings) => {
    const saved = await saveSettings(next);
    setSettings(saved);
  };

  const inspectingProductBatches = useMemo(() => {
    if (!inspectingProduct) return [];
    return enrichedBatches.filter((b) => b.productId === inspectingProduct.productId);
  }, [inspectingProduct, enrichedBatches]);

  return (
    <AppShell
      activeScreen={activeScreen}
      onNavigate={setActiveScreen}
      storeName={settings.storeName}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-200" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      ) : (
        <>
          {activeScreen === 'dashboard' && (
            <DashboardScreen
              products={products}
              enrichedBatches={enrichedBatches}
              onNavigate={setActiveScreen}
              onInspectProduct={setInspectingProduct}
              onAddBatchForProduct={handleProceedToExpiry}
              onLoadSampleData={handleLoadSampleData}
            />
          )}

          {activeScreen === 'scanner' && (
            <BarcodeScannerScreen
              batches={enrichedBatches}
              onProceedToExpiry={handleProceedToExpiry}
              onEditExistingProduct={handleEditExistingFromScanner}
              onDatabaseChanged={refreshData}
            />
          )}

          {activeScreen === 'expiry-entry' && (
            <ExpiryEntryScreen
              activeProduct={expiryTargetProduct}
              allProducts={products}
              batches={enrichedBatches}
              ocrLanguageMode={settings.ocrLanguageMode}
              onSelectProduct={setExpiryTargetProduct}
              onNavigateToScanner={() => setActiveScreen('scanner')}
              onBatchSaved={refreshData}
            />
          )}

          {activeScreen === 'reports' && (
            <ExpiryReportsScreen
              products={products}
              enrichedBatches={enrichedBatches}
              defaultWindow={settings.defaultReportWindow}
              onInspectProduct={setInspectingProduct}
              onDeleteBatch={handleDeleteBatch}
            />
          )}

          {activeScreen === 'products' && (
            <MasterProductsScreen
              products={products}
              batches={enrichedBatches}
              initialEditProduct={editProductShortcut}
              onClearInitialEdit={() => setEditProductShortcut(null)}
              onInspectProductBatches={setInspectingProduct}
              onAddBatchForProduct={handleProceedToExpiry}
              onDatabaseChanged={refreshData}
            />
          )}

          {activeScreen === 'import' && (
            <ImportExcelScreen
              products={products}
              onDatabaseChanged={refreshData}
              onLoadSampleData={handleLoadSampleData}
            />
          )}

          {activeScreen === 'backup' && (
            <BackupRestoreScreen
              products={products}
              enrichedBatches={enrichedBatches}
              onDatabaseChanged={refreshData}
            />
          )}

          {activeScreen === 'settings' && (
            <SettingsScreen settings={settings} onSaveSettings={handleSaveSettings} />
          )}
        </>
      )}

      <ProductBatchesModal
        product={inspectingProduct}
        batches={inspectingProductBatches}
        onClose={() => setInspectingProduct(null)}
        onAddNewBatch={handleProceedToExpiry}
        onUpdateBatch={handleUpdateBatch}
        onDeleteBatch={handleDeleteBatch}
      />
    </AppShell>
  );
}
