import { it, expect, vi, afterEach } from 'vitest';
import { parseCalendar, EconomicCalendarProvider, generateFallbackCalendar } from '../src/server/services/economicCalendarProvider';

const now = Date.parse('2026-09-22T12:00:00Z');
const rowUpcoming = { title: 'CPI', country: 'USD', date: '2026-09-22T08:30:00-04:00', impact: 'High', forecast: '2.5%', previous: '2.4%' };
const rowWithActual = { title: 'Unemployment Claims', country: 'USD', date: '2026-09-24T08:30:00-04:00', impact: 'High', forecast: '222K', previous: '219K', actual: '218K' };

afterEach(() => vi.restoreAllMocks());

it('preserves schedule, maps currency and keeps actual undefined when not provided in feed', () => {
  const e = parseCalendar([rowUpcoming], now)[0];
  expect(e.timestamp).toBe(Date.parse('2026-09-22T12:30:00Z'));
  expect(e.currency).toBe('USD');
  expect(e.actual).toBeUndefined();
});

it('correctly parses actual result when provided in feed', () => {
  const e = parseCalendar([rowWithActual], Date.parse('2026-09-24T15:00:00Z'))[0];
  expect(e.currency).toBe('USD');
  expect(e.actual).toBe('218K');
  expect(e.status).toBe('RELEASED');
});

it('fallback calendar assigns proper currencies without undefined', () => {
  const events = generateFallbackCalendar(Date.parse('2026-09-24T15:00:00Z'));
  expect(events.length).toBeGreaterThan(0);
  const chfEvent = events.find(e => e.currency === 'CHF');
  expect(chfEvent).toBeDefined();
  expect(chfEvent?.flag).toBe('🇨🇭');
  expect(chfEvent?.currency).toBe('CHF');
  expect(chfEvent?.affectedPairs).toContain('USD/CHF');
});

it('fallback calendar provides actual results for events that have passed', () => {
  const events = generateFallbackCalendar(Date.parse('2026-09-24T15:00:00Z'));
  const passedEvents = events.filter(e => e.timestamp <= Date.parse('2026-09-24T15:00:00Z') && e.impact === 'HIGH');
  expect(passedEvents.length).toBeGreaterThan(0);
  for (const ev of passedEvents) {
    expect(ev.actual).toBeDefined();
    expect(typeof ev.actual).toBe('string');
  }
});

