const WEEK_OFFSETS = {
  current: 0,
  next: 1,
  next2: 2,
};

function parseTimeZoneOffset(timeZone) {
  const value = String(timeZone || '').trim();
  const match = value.match(/^UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i)
    || value.match(/^([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) return null;

  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);

  if (hours > 23 || minutes > 59) {
    throw new RangeError('Некорректное смещение часового пояса');
  }

  const sign = match[1] === '-' ? -1 : 1;
  return sign * (hours * 60 + minutes);
}

function getLocalDateParts(now, timeZone) {
  const fixedOffsetMinutes = parseTimeZoneOffset(timeZone);

  if (fixedOffsetMinutes !== null) {
    const localNow = new Date(now.getTime() + fixedOffsetMinutes * 60 * 1000);
    return {
      year: localNow.getUTCFullYear(),
      month: localNow.getUTCMonth() + 1,
      day: localNow.getUTCDate(),
    };
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = {};

  for (const part of formatter.formatToParts(now)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }

  return parts;
}

function formatDate(date) {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}.${month}.${year}`;
}

function getWeekDateRangeLabel(value, { now = new Date(), timeZone } = {}) {
  const { year, month, day } = getLocalDateParts(now, timeZone);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = localDate.getUTCDay() || 7;
  const weekOffset = WEEK_OFFSETS[value] ?? 0;
  const monday = new Date(localDate);
  monday.setUTCDate(localDate.getUTCDate() - dayOfWeek + 1 + weekOffset * 7);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return `${formatDate(monday)} – ${formatDate(sunday)}`;
}

module.exports = { getWeekDateRangeLabel };
