import type { ExpiryStatus } from '../types';

const BENGALI_TO_ENGLISH_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const EXPIRY_LABEL_REGEX = /\b(exp(?:iry|iration)?(?:\s*date)?|best\s*before|bb|bbe|use\s*by|valid\s*(?:till|until)|shelf\s*life)\b|মেয়াদ(?:\s*শেষ|োত্তীর্ণ)?/i;
const MFG_LABEL_REGEX = /\b(mfg|mfd|mfg\.?\s*date|pkd|packed|prod(?:uction)?|manufactured)\b|উৎপাদন/i;

export interface ParsedDateCandidate {
  date: string; // YYYY-MM-DD
  expiryMonth?: string; // YYYY-MM
  isMonthOnly: boolean;
  label: 'expiry' | 'mfg' | 'unknown';
  snippet: string;
  score: number;
}

export interface OcrExpiryParseResult {
  normalizedText: string;
  detectedDate: string | null;
  expiryMonth?: string;
  isMonthOnly: boolean;
  confidence: 'high' | 'medium' | 'low';
  matchedSnippet: string;
  candidates: ParsedDateCandidate[];
}

export function normalizeBengaliDigits(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => BENGALI_TO_ENGLISH_DIGITS[ch] ?? ch);
}

export function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeYear(rawYear: number): number {
  if (rawYear < 100) {
    return rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear;
  }
  return rawYear;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2099) return false;
  if (month < 1 || month > 12) return false;
  const maxDay = lastDayOfMonth(year, month);
  return day >= 1 && day <= maxDay;
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function classifyContextLabel(contextBefore: string, fullLine: string): 'expiry' | 'mfg' | 'unknown' {
  // Check closest label immediately preceding the date first
  const recentSlice = contextBefore.slice(-36);
  if (EXPIRY_LABEL_REGEX.test(recentSlice)) return 'expiry';
  if (MFG_LABEL_REGEX.test(recentSlice)) return 'mfg';

  // Fallback to line-level if only one type appears on that line
  const hasExp = EXPIRY_LABEL_REGEX.test(fullLine);
  const hasMfg = MFG_LABEL_REGEX.test(fullLine);
  if (hasExp && !hasMfg) return 'expiry';
  if (hasMfg && !hasExp) return 'mfg';
  return 'unknown';
}

export function parseExpiryFromOcrText(
  rawText: string,
  referenceDate: Date = new Date()
): OcrExpiryParseResult {
  const normalizedText = normalizeBengaliDigits(rawText)
    .replace(/[|]/g, '/')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const lines = normalizeBengaliDigits(rawText)
    .replace(/[|]/g, '/')
    .replace(/[—–]/g, '-')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates: ParsedDateCandidate[] = [];
  const seenKey = new Set<string>();

  const refYear = referenceDate.getFullYear();

  const addCandidate = (
    year: number,
    month: number,
    day: number | null,
    isMonthOnly: boolean,
    contextBefore: string,
    fullLine: string,
    matchedText: string
  ) => {
    const resolvedDay = isMonthOnly ? lastDayOfMonth(year, month) : (day ?? 1);
    if (!isValidCalendarDate(year, month, resolvedDay)) return;

    const dateStr = formatYmd(year, month, resolvedDay);
    const label = classifyContextLabel(contextBefore, fullLine);
    const key = `${dateStr}-${isMonthOnly ? 'M' : 'D'}-${label}`;
    if (seenKey.has(key)) return;
    seenKey.add(key);

    let score = 0;
    if (label === 'expiry') score += 100;
    else if (label === 'mfg') score -= 120;
    else score += 10;

    // Slight preference for plausible future/near-current expiry years
    if (year >= refYear && year <= refYear + 10) score += 20;
    else if (year < refYear - 1) score -= 15;

    // Full DMY / YMD dates are slightly more specific than month-only when both appear
    if (!isMonthOnly) score += 5;

    candidates.push({
      date: dateStr,
      expiryMonth: isMonthOnly ? `${year}-${pad2(month)}` : undefined,
      isMonthOnly,
      label,
      snippet: fullLine || matchedText,
      score,
    });
  };

  for (const line of lines) {
    const matchedSpans: Array<{ start: number; end: number }> = [];
    const overlaps = (start: number, end: number) =>
      matchedSpans.some((s) => start < s.end && end > s.start);

    // 1. YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
    for (const m of line.matchAll(/\b(20\d{2})[/.\-\s](\d{1,2})[/.\-\s](\d{1,2})\b/g)) {
      const idx = m.index ?? 0;
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (isValidCalendarDate(year, month, day)) {
        matchedSpans.push({ start: idx, end: idx + m[0].length });
        addCandidate(year, month, day, false, line.slice(0, idx), line, m[0]);
      }
    }

    // 2. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (also 2-digit year DD/MM/YY)
    for (const m of line.matchAll(/\b(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2,4})\b/g)) {
      const idx = m.index ?? 0;
      if (overlaps(idx, idx + m[0].length)) continue;
      const p1 = Number(m[1]);
      const p2 = Number(m[2]);
      const rawYear = Number(m[3]);
      if (m[3].length === 3) continue;
      const year = normalizeYear(rawYear);

      // Prefer DD/MM/YYYY; fallback to MM/DD/YYYY only if p2 > 12 and p1 <= 12
      let day = p1;
      let month = p2;
      if (month > 12 && day <= 12) {
        day = p2;
        month = p1;
      }

      if (isValidCalendarDate(year, month, day)) {
        matchedSpans.push({ start: idx, end: idx + m[0].length });
        addCandidate(year, month, day, false, line.slice(0, idx), line, m[0]);
      }
    }

    // 3. Named month with day: 15 DEC 2026 or 15-Dec-26
    for (const m of line.matchAll(
      /\b(\d{1,2})[\s\-./]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s\-./,]*(\d{2,4})\b/gi
    )) {
      const idx = m.index ?? 0;
      if (overlaps(idx, idx + m[0].length)) continue;
      const day = Number(m[1]);
      const month = MONTH_NAME_MAP[m[2].toLowerCase()];
      const year = normalizeYear(Number(m[3]));
      if (month && isValidCalendarDate(year, month, day)) {
        matchedSpans.push({ start: idx, end: idx + m[0].length });
        addCandidate(year, month, day, false, line.slice(0, idx), line, m[0]);
      }
    }

    // 4. Month-only named month: DEC 2026 or Dec/26
    for (const m of line.matchAll(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s\-./,]+(\d{2,4})\b/gi
    )) {
      const idx = m.index ?? 0;
      if (overlaps(idx, idx + m[0].length)) continue;
      const month = MONTH_NAME_MAP[m[1].toLowerCase()];
      const year = normalizeYear(Number(m[2]));
      if (month && year >= 2000 && year <= 2099) {
        matchedSpans.push({ start: idx, end: idx + m[0].length });
        addCandidate(year, month, null, true, line.slice(0, idx), line, m[0]);
      }
    }

    // 5. Numeric MM/YYYY or MM-YYYY or MM/YY
    for (const m of line.matchAll(/\b(\d{1,2})[/.\-](\d{2,4})\b/g)) {
      const idx = m.index ?? 0;
      if (overlaps(idx, idx + m[0].length)) continue;
      if (m[2].length === 3) continue;
      const month = Number(m[1]);
      const year = normalizeYear(Number(m[2]));
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
        matchedSpans.push({ start: idx, end: idx + m[0].length });
        addCandidate(year, month, null, true, line.slice(0, idx), line, m[0]);
      }
    }
  }

  // Sort highest score first; tie-break by latest date (expiry is later than MFG)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.date.localeCompare(a.date);
  });

  const best = candidates[0];
  if (!best) {
    return {
      normalizedText,
      detectedDate: null,
      isMonthOnly: false,
      confidence: 'low',
      matchedSnippet: '',
      candidates: [],
    };
  }

  return {
    normalizedText,
    detectedDate: best.date,
    expiryMonth: best.expiryMonth,
    isMonthOnly: best.isMonthOnly,
    confidence: best.label === 'expiry' ? 'high' : best.label === 'unknown' ? 'medium' : 'low',
    matchedSnippet: best.snippet,
    candidates,
  };
}

export function getTodayYmd(now: Date = new Date()): string {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function getCurrentTimeHms(now: Date = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

export function getDaysRemaining(expiryDate: string, now: Date = new Date()): number {
  const parts = expiryDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  const [y, m, d] = parts;
  const expMidnight = Date.UTC(y, m - 1, d);
  const todayMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expMidnight - todayMidnight) / 86_400_000);
}

export function getExpiryStatus(
  daysRemaining: number,
  thresholds: { criticalDays?: number; warningDays?: number; upcomingDays?: number } = {}
): ExpiryStatus {
  const criticalDays = thresholds.criticalDays ?? 30;
  const warningDays = thresholds.warningDays ?? 60;
  const upcomingDays = thresholds.upcomingDays ?? 90;

  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= criticalDays) return 'critical';
  if (daysRemaining <= warningDays) return 'warning';
  if (daysRemaining <= upcomingDays) return 'upcoming';
  return 'safe';
}

export function getStatusLabel(status: ExpiryStatus): string {
  switch (status) {
    case 'expired':
      return 'Expired';
    case 'critical':
      return 'Critical (0–30d)';
    case 'warning':
      return 'Warning (31–60d)';
    case 'upcoming':
      return 'Upcoming (61–90d)';
    case 'safe':
      return 'Safe (>90d)';
  }
}

export function formatDisplayDate(expiryDate: string, isMonthOnly?: boolean): string {
  const parts = expiryDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return expiryDate;
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d);
  if (isMonthOnly) {
    return dateObj.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  return dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function monthYearToExpiryDate(monthInput: string): { expiryDate: string; expiryMonth: string } | null {
  const match = monthInput.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const day = lastDayOfMonth(year, month);
  return {
    expiryDate: formatYmd(year, month, day),
    expiryMonth: `${year}-${pad2(month)}`,
  };
}
