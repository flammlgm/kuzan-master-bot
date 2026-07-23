const MINUTE_MS = 60 * 1000;

function shiftEventSchedule(event, deltaMinutes) {
  if (!event?.startDate || !event?.endDate) {
    throw new TypeError('У события отсутствуют даты начала или окончания');
  }

  if (!Number.isInteger(deltaMinutes)) {
    throw new TypeError('Сдвиг события должен быть целым количеством минут');
  }

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new RangeError('У события указана некорректная дата');
  }

  const deltaMs = deltaMinutes * MINUTE_MS;

  return {
    ...event,
    startDate: new Date(startDate.getTime() + deltaMs).toISOString(),
    endDate: new Date(endDate.getTime() + deltaMs).toISOString(),
  };
}

function getDiscordTimestamp(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Не удалось создать временную метку Discord');
  }

  return Math.floor(date.getTime() / 1000);
}

module.exports = {
  shiftEventSchedule,
  getDiscordTimestamp,
};
