import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { ExpiryStatus } from '../types';
import { getStatusLabel } from '../utils/dateAndExpiry';

interface StatusTextProps {
  status: ExpiryStatus;
  daysRemaining?: number;
}

export const StatusText: React.FC<StatusTextProps> = ({ status }) => {
  const label = getStatusLabel(status);

  switch (status) {
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      );
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      );
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      );
    case 'upcoming':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      );
    case 'safe':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {label}
        </span>
      );
  }
};

export function formatDaysRemainingLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  return `${days}d left`;
}
