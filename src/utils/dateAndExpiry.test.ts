import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDaysRemaining,
  getExpiryStatus,
  monthYearToExpiryDate,
  normalizeBengaliDigits,
  parseExpiryFromOcrText,
} from './dateAndExpiry';

test('normalizeBengaliDigits converts all Bengali numerals 0-9 accurately', () => {
  assert.equal(normalizeBengaliDigits('১৫/১২/২০২৬'), '15/12/2026');
  assert.equal(normalizeBengaliDigits('০১২৩৪৫৬৭৮৯'), '0123456789');
});

test('parseExpiryFromOcrText prioritizes EXP over MFG in English and Bengali', () => {
  const ref = new Date(2026, 10, 20); // 2026-11-20

  const engSample = 'MFG: 10/01/2025\nEXP DATE: 15/12/2026\nBATCH: B12';
  const res1 = parseExpiryFromOcrText(engSample, ref);
  assert.equal(res1.detectedDate, '2026-12-15');
  assert.equal(res1.isMonthOnly, false);
  assert.equal(res1.confidence, 'high');

  const benSample = 'উৎপাদন: ০১/০২/২০২৫\nমেয়াদ শেষ: ২০/০২/২০২৭';
  const res2 = parseExpiryFromOcrText(benSample, ref);
  assert.equal(res2.detectedDate, '2027-02-20');
  assert.equal(res2.isMonthOnly, false);
  assert.equal(res2.confidence, 'high');
});

test('parseExpiryFromOcrText handles month/year-only formats and leap years', () => {
  const ref = new Date(2026, 10, 20);

  const monthYear = parseExpiryFromOcrText('BEST BEFORE: ০২/২০২৮', ref);
  assert.equal(monthYear.detectedDate, '2028-02-29'); // 2028 is leap year
  assert.equal(monthYear.expiryMonth, '2028-02');
  assert.equal(monthYear.isMonthOnly, true);

  const namedMonth = parseExpiryFromOcrText('BB: DEC 2026', ref);
  assert.equal(namedMonth.detectedDate, '2026-12-31');
  assert.equal(namedMonth.isMonthOnly, true);

  const iso = parseExpiryFromOcrText('USE BY 2027-05-10', ref);
  assert.equal(iso.detectedDate, '2027-05-10');
  assert.equal(iso.isMonthOnly, false);
});

test('getDaysRemaining and getExpiryStatus classify buckets accurately', () => {
  const today = new Date(2026, 10, 20); // 2026-11-20
  assert.equal(getDaysRemaining('2026-11-19', today), -1);
  assert.equal(getExpiryStatus(-1), 'expired');

  assert.equal(getDaysRemaining('2026-11-20', today), 0);
  assert.equal(getExpiryStatus(0), 'critical');

  assert.equal(getDaysRemaining('2026-12-20', today), 30);
  assert.equal(getExpiryStatus(30), 'critical');

  assert.equal(getExpiryStatus(31), 'warning');
  assert.equal(getExpiryStatus(60), 'warning');
  assert.equal(getExpiryStatus(61), 'upcoming');
  assert.equal(getExpiryStatus(90), 'upcoming');
  assert.equal(getExpiryStatus(91), 'safe');
});

test('monthYearToExpiryDate resolves end-of-month dates correctly', () => {
  assert.deepEqual(monthYearToExpiryDate('2027-02'), {
    expiryDate: '2027-02-28',
    expiryMonth: '2027-02',
  });
  assert.deepEqual(monthYearToExpiryDate('2028-02'), {
    expiryDate: '2028-02-29',
    expiryMonth: '2028-02',
  });
});
