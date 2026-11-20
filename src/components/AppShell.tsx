import React, { useState } from 'react';
import {
  Archive,
  Barcode,
  CalendarPlus,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import type { NavScreen } from '../types';
import { useOnlineStatus } from '../hooks/usePWA';
import { PWAInstallButton } from './PWAInstallButton';

interface AppShellProps {
  activeScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  storeName: string;
  children: React.ReactNode;
}

export const NAV_ITEMS: Array<{
  id: NavScreen;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'scanner', label: 'Scan Barcode', shortLabel: 'Scan', icon: Barcode },
  { id: 'expiry-entry', label: 'Expiry Entry', shortLabel: 'Expiry', icon: CalendarPlus },
  { id: 'reports', label: 'Expiry Reports', shortLabel: 'Reports', icon: FileText },
  { id: 'products', label: 'Master Products', shortLabel: 'Products', icon: Package },
  { id: 'import', label: 'Import Excel', shortLabel: 'Import', icon: FileSpreadsheet },
  { id: 'backup', label: 'Backup & Restore', shortLabel: 'Backup', icon: Archive },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeScreen,
  onNavigate,
  storeName,
  children,
}) => {
  const isOnline = useOnlineStatus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentTitle =
    NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? 'Retail Expiry Tracker';

  const primaryMobileTabs = NAV_ITEMS.slice(0, 4);
  const secondaryMobileTabs = NAV_ITEMS.slice(4);
  const isSecondaryActive = secondaryMobileTabs.some((t) => t.id === activeScreen);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 text-left"
          >
            <img
              src="/icon.svg"
              alt="Retail Expiry Tracker icon"
              className="h-9 w-9 shrink-0 rounded-lg"
            />
            <div className="min-w-0">
              <div className="truncate text-base font-bold tracking-tight text-slate-900">
                Retail Expiry Tracker
              </div>
              <div className="truncate text-xs text-slate-500">{storeName}</div>
            </div>
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-4">
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <WifiOff className="h-4 w-4 shrink-0" />
              Offline mode active
            </div>
          )}
          <PWAInstallButton />
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Top App Bar (compact 48px) */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/icon.svg"
              alt="App logo"
              className="h-7 w-7 shrink-0 rounded-md"
            />
            <span className="truncate text-sm font-bold text-slate-900">{currentTitle}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                <WifiOff className="h-3.5 w-3.5" />
                Offline
              </span>
            )}
            <PWAInstallButton compact />
          </div>
        </header>

        {/* Main Viewport */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-7 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (compact 60px + safe area) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe lg:hidden"
      >
        <div className="grid h-14 grid-cols-5 items-center">
          {primaryMobileTabs.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate(item.id);
                }}
                className={`flex h-full min-w-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                  active ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[11px] leading-none whitespace-nowrap">{item.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
            aria-label="More navigation menu"
            className={`flex h-full min-w-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
              mobileMenuOpen || isSecondaryActive ? 'text-emerald-700 font-semibold' : 'text-slate-500'
            }`}
          >
            <Menu className="h-5 w-5 shrink-0" />
            <span className="text-[11px] leading-none whitespace-nowrap">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile Secondary Navigation Sheet */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl border-t border-slate-200 bg-white p-5 pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Store Tools & Settings</h2>
                <p className="text-xs text-slate-500">{storeName}</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {secondaryMobileTabs.map((item) => {
                const Icon = item.icon;
                const active = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate(item.id);
                    }}
                    className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
