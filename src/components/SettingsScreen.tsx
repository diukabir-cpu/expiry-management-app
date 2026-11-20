import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { verifyOfflineOcrAssetsCached } from '../services/offlineOcr';
import type { AppSettings } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsScreenProps {
  settings: AppSettings;
  onSaveSettings: (next: AppSettings) => Promise<void>;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onSaveSettings,
}) => {
  const [storeName, setStoreName] = useState(settings.storeName);
  const [ocrLanguageMode, setOcrLanguageMode] = useState(settings.ocrLanguageMode);
  const [defaultReportWindow, setDefaultReportWindow] = useState(settings.defaultReportWindow);
  const [criticalDays, setCriticalDays] = useState(String(settings.criticalDays));
  const [warningDays, setWarningDays] = useState(String(settings.warningDays));
  const [upcomingDays, setUpcomingDays] = useState(String(settings.upcomingDays));
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const [offlineAssets, setOfflineAssets] = useState<{
    workerReady: boolean;
    engReady: boolean;
    benReady: boolean;
    coreReady: boolean;
  } | null>(null);
  const [swRegistered, setSwRegistered] = useState<boolean>(false);

  const checkReadiness = async () => {
    const assets = await verifyOfflineOcrAssetsCached();
    setOfflineAssets(assets);
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      setSwRegistered(Boolean(reg));
    }
  };

  useEffect(() => {
    checkReadiness();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedToast(false);
    try {
      await onSaveSettings({
        ...settings,
        storeName: storeName.trim() || 'Main Supermarket Branch',
        ocrLanguageMode,
        defaultReportWindow,
        criticalDays: Math.max(1, Number(criticalDays) || 30),
        warningDays: Math.max(2, Number(warningDays) || 60),
        upcomingDays: Math.max(3, Number(upcomingDays) || 90),
      });
      setSavedToast(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure store details, offline OCR languages, expiry thresholds, and Android PWA
          installation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-7"
        >
          <h2 className="text-base font-bold text-slate-900">Store &amp; Expiry Preferences</h2>

          <div>
            <label
              htmlFor="settings-store-name"
              className="block text-xs font-semibold text-slate-700"
            >
              Store / Branch Name
            </label>
            <input
              id="settings-store-name"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-ocr-lang"
                className="block text-xs font-semibold text-slate-700"
              >
                Offline OCR Language Mode
              </label>
              <select
                id="settings-ocr-lang"
                value={ocrLanguageMode}
                onChange={(e) =>
                  setOcrLanguageMode(e.target.value as 'eng+ben' | 'eng')
                }
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="eng+ben">English + Bengali (eng+ben)</option>
                <option value="eng">English Only (eng — faster)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-default-window"
                className="block text-xs font-semibold text-slate-700"
              >
                Default Report Filter
              </label>
              <select
                id="settings-default-window"
                value={defaultReportWindow}
                onChange={(e) =>
                  setDefaultReportWindow(
                    e.target.value as AppSettings['defaultReportWindow']
                  )
                }
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="90">Next 90 Days</option>
                <option value="60">Next 60 Days</option>
                <option value="30">Next 30 Days</option>
                <option value="expired">Expired Products</option>
                <option value="all">All Batches</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="settings-critical-days"
                className="block text-xs font-semibold text-slate-700"
              >
                Critical (Days)
              </label>
              <input
                id="settings-critical-days"
                type="number"
                min="1"
                value={criticalDays}
                onChange={(e) => setCriticalDays(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="settings-warning-days"
                className="block text-xs font-semibold text-slate-700"
              >
                Warning (Days)
              </label>
              <input
                id="settings-warning-days"
                type="number"
                min="2"
                value={warningDays}
                onChange={(e) => setWarningDays(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="settings-upcoming-days"
                className="block text-xs font-semibold text-slate-700"
              >
                Upcoming (Days)
              </label>
              <input
                id="settings-upcoming-days"
                type="number"
                min="3"
                value={upcomingDays}
                onChange={(e) => setUpcomingDays(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {savedToast && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Settings saved locally
              </span>
            )}
          </div>
        </form>

        {/* PWA & Offline Verification Card */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">
                PWA &amp; Offline Assets
              </h2>
            </div>
            <button
              type="button"
              onClick={checkReadiness}
              aria-label="Recheck offline assets"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs leading-relaxed text-slate-600">
            All barcode decoding, Excel import/export, IndexedDB storage, and English + Bengali OCR
            models run locally on your device without internet access.
          </p>

          <PWAInstallButton />

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Offline Service Worker</span>
              <span className={swRegistered ? 'font-semibold text-emerald-700' : 'text-amber-700'}>
                {swRegistered ? 'Active & Caching' : 'Registering...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Local OCR Worker &amp; WASM Core</span>
              <span
                className={
                  offlineAssets?.workerReady && offlineAssets?.coreReady
                    ? 'font-semibold text-emerald-700'
                    : 'text-amber-700'
                }
              >
                {offlineAssets
                  ? offlineAssets.workerReady && offlineAssets.coreReady
                    ? 'Bundled Ready'
                    : 'Checking'
                  : 'Checking...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">English Language Data (eng)</span>
              <span
                className={
                  offlineAssets?.engReady ? 'font-semibold text-emerald-700' : 'text-amber-700'
                }
              >
                {offlineAssets?.engReady ? 'Bundled Ready' : 'Checking...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Bengali Language Data (ben)</span>
              <span
                className={
                  offlineAssets?.benReady ? 'font-semibold text-emerald-700' : 'text-amber-700'
                }
              >
                {offlineAssets?.benReady ? 'Bundled Ready' : 'Checking...'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
