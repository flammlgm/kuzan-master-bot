const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shiftEventSchedule,
  getDiscordTimestamp,
} = require('../src/utils/eventCalibration');

test('калибровка сдвигает начало и конец события на один час', () => {
  const event = {
    title: 'Игра',
    startDate: '2026-07-24T17:00:00.000Z',
    endDate: '2026-07-24T21:00:00.000Z',
  };

  const result = shiftEventSchedule(event, 60);

  assert.equal(result.startDate, '2026-07-24T18:00:00.000Z');
  assert.equal(result.endDate, '2026-07-24T22:00:00.000Z');
  assert.equal(result.title, 'Игра');
  assert.equal(event.startDate, '2026-07-24T17:00:00.000Z');
});

test('калибровка поддерживает шаг в 15 минут и переход на другой день', () => {
  const event = {
    startDate: '2026-07-24T23:50:00.000Z',
    endDate: '2026-07-25T01:50:00.000Z',
  };

  const result = shiftEventSchedule(event, 15);

  assert.equal(result.startDate, '2026-07-25T00:05:00.000Z');
  assert.equal(result.endDate, '2026-07-25T02:05:00.000Z');
});

test('Discord timestamp строится из откалиброванного времени', () => {
  const timestamp = getDiscordTimestamp('2026-07-24T17:00:00.000Z');

  assert.equal(timestamp, 1784912400);
});
