import { nextDay } from 'date-fns';
import { toIsoDate } from '@/lib/format';

const WEEKDAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

// Returns the ISO date (YYYY-MM-DD) of the next occurrence of `dayOfWeekName` on or after `fromDate`.
export const nextWeekdayOccurrence = (dayOfWeekName, fromDate = new Date()) => {
  if (!dayOfWeekName || !(dayOfWeekName in WEEKDAY_INDEX)) return null;
  const targetIdx = WEEKDAY_INDEX[dayOfWeekName];
  const base = new Date(fromDate);
  base.setHours(0, 0, 0, 0);
  if (base.getDay() === targetIdx) return toIsoDate(base);
  return toIsoDate(nextDay(base, targetIdx));
};
