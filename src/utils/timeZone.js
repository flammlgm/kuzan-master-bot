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

function getDateTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const result = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal' && part.type !== 'timeZoneName') {
      result[part.type] = Number(part.value);
    }
  }

  return result;
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  const timeInZoneAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return Math.round((timeInZoneAsUtc - date.getTime()) / 60000);
}

function getTimeZoneOffsetLabel(date, timeZone) {
  const fixedOffsetMinutes = parseTimeZoneOffset(timeZone);
  const offsetMinutes = fixedOffsetMinutes === null
    ? getTimeZoneOffsetMinutes(date, timeZone)
    : fixedOffsetMinutes;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');

  return `UTC${sign}${hours}:${minutes}`;
}

function createUtcDateForTimeZone({ dayOffset, hour, timeZone, now = new Date() }) {
  const fixedOffsetMinutes = parseTimeZoneOffset(timeZone);
  let localToday;

  if (fixedOffsetMinutes !== null) {
    const localNow = new Date(now.getTime() + fixedOffsetMinutes * 60 * 1000);
    localToday = {
      year: localNow.getUTCFullYear(),
      month: localNow.getUTCMonth() + 1,
      day: localNow.getUTCDate(),
    };
  } else {
    localToday = getDateTimeParts(now, timeZone);
  }

  const localTimeAsUtc = Date.UTC(
    localToday.year,
    localToday.month - 1,
    localToday.day + dayOffset,
    hour,
    0,
    0,
    0
  );

  if (fixedOffsetMinutes !== null) {
    return new Date(localTimeAsUtc - fixedOffsetMinutes * 60 * 1000);
  }

  let result = new Date(localTimeAsUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(result, timeZone);
    result = new Date(localTimeAsUtc - offsetMinutes * 60 * 1000);
  }

  return result;
}

module.exports = {
  createUtcDateForTimeZone,
  getTimeZoneOffsetLabel,
};
