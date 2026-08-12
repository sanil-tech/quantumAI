import { useState, useEffect } from 'react';

/**
 * Utility to convert economic calendar event times to the user's browser local time zone.
 */
export function formatEventLocalTime(timestamp?: number, originalEstTime?: string): string {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offsetLabel = `UTC${sign}${offsetHours}${offsetMins ? `:${offsetMins.toString().padStart(2, '0')}` : ''}`;

  if (timestamp) {
    try {
      const date = new Date(timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${timeStr} (${offsetLabel})`;
    } catch (e) {
      // Fallback below
    }
  }

  if (originalEstTime) {
    try {
      const timeMatch = originalEstTime.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const mins = parseInt(timeMatch[2], 10);
        
        // EST is UTC-5 hours (or UTC-4 in EDT). Standard conversion to UTC: UTC hour = EST hour + 5
        const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours + 5, mins));
        const localTimeStr = utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        return `${localTimeStr} (${offsetLabel})`;
      }
    } catch (e) {
      // Fallback
    }
  }

  return originalEstTime || '';
}

export interface CountdownResult {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isPast: boolean;
  formatted: string;
}

export function calculateCountdown(targetTimestamp?: number, originalEstTime?: string): CountdownResult {
  let eventMs = targetTimestamp;

  if (!eventMs && originalEstTime) {
    const now = new Date();
    const timeMatch = originalEstTime.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const mins = parseInt(timeMatch[2], 10);
      eventMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours + 5, mins);
    }
  }

  if (!eventMs) {
    return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isPast: true, formatted: '00:00:00' };
  }

  const diffMs = eventMs - Date.now();
  if (diffMs <= 0) {
    const absDiff = Math.abs(diffMs);
    const totalSec = Math.floor(absDiff / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
      hours: hrs,
      minutes: mins,
      seconds: secs,
      totalSeconds: -totalSec,
      isPast: true,
      formatted: `+${pad(hrs)}:${pad(mins)}:${pad(secs)}`
    };
  }

  const totalSec = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  return {
    hours: hrs,
    minutes: mins,
    seconds: secs,
    totalSeconds: totalSec,
    isPast: false,
    formatted: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
  };
}

export function useCountdown(targetTimestamp?: number, originalEstTime?: string) {
  const [countdown, setCountdown] = useState(() => calculateCountdown(targetTimestamp, originalEstTime));

  useEffect(() => {
    setCountdown(calculateCountdown(targetTimestamp, originalEstTime));
    const interval = setInterval(() => {
      setCountdown(calculateCountdown(targetTimestamp, originalEstTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTimestamp, originalEstTime]);

  return countdown;
}

