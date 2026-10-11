const test = require('node:test');
const assert = require('node:assert/strict');

const { getWeekDateRangeLabel } = require('../src/utils/weekRange');

test('следующая неделя в воскресенье начинается с ближайшего понедельника', () => {
  const result = getWeekDateRangeLabel('next', {
    now: new Date('2026-10-11T12:00:00.000Z'),
    timeZone: 'Europe/Moscow',
  });

  assert.equal(result, '12.10.2026 – 18.10.2026');
});

test('текущая неделя в понедельник начинается с сегодняшней даты', () => {
  const result = getWeekDateRangeLabel('current', {
    now: new Date('2026-10-12T12:00:00.000Z'),
    timeZone: 'Europe/Moscow',
  });

  assert.equal(result, '12.10.2026 – 18.10.2026');
});

test('часовой пояс определяет локальную дату на границе суток', () => {
  const result = getWeekDateRangeLabel('current', {
    now: new Date('2026-10-11T22:30:00.000Z'),
    timeZone: 'Europe/Berlin',
  });

  assert.equal(result, '12.10.2026 – 18.10.2026');
});

test('неделя через две корректно переходит в следующий год', () => {
  const result = getWeekDateRangeLabel('next2', {
    now: new Date('2026-12-27T12:00:00.000Z'),
    timeZone: '+03:00',
  });

  assert.equal(result, '04.01.2027 – 10.01.2027');
});
