const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createUtcDateForTimeZone,
  getTimeZoneOffsetLabel,
} = require('../src/utils/timeZone');

test('19:00 завтра в UTC+3 сохраняется как 16:00 UTC', () => {
  const result = createUtcDateForTimeZone({
    dayOffset: 1,
    hour: 19,
    timeZone: '+03:00',
    now: new Date('2026-07-23T12:00:00.000Z'),
  });

  assert.equal(result.toISOString(), '2026-07-24T16:00:00.000Z');
});

test('дата считается от сегодняшнего дня пользователя, а не сервера', () => {
  const result = createUtcDateForTimeZone({
    dayOffset: 1,
    hour: 19,
    timeZone: '+03:00',
    now: new Date('2026-07-23T22:30:00.000Z'),
  });

  assert.equal(result.toISOString(), '2026-07-25T16:00:00.000Z');
});

test('именованный пояс учитывает летнее время', () => {
  const result = createUtcDateForTimeZone({
    dayOffset: 1,
    hour: 19,
    timeZone: 'Europe/Berlin',
    now: new Date('2026-07-23T12:00:00.000Z'),
  });

  assert.equal(result.toISOString(), '2026-07-24T17:00:00.000Z');
});

test('неверный часовой пояс отклоняется', () => {
  assert.throws(() => createUtcDateForTimeZone({
    dayOffset: 1,
    hour: 19,
    timeZone: 'Frankfurt',
  }), RangeError);
});

test('летний часовой пояс Франкфурта подписывается как UTC+02:00', () => {
  const result = getTimeZoneOffsetLabel(
    new Date('2026-07-24T17:00:00.000Z'),
    'Europe/Berlin'
  );

  assert.equal(result, 'UTC+02:00');
});

test('зимний часовой пояс Франкфурта подписывается как UTC+01:00', () => {
  const result = getTimeZoneOffsetLabel(
    new Date('2026-12-24T18:00:00.000Z'),
    'Europe/Berlin'
  );

  assert.equal(result, 'UTC+01:00');
});
