const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRecruitmentAnnouncementPayload,
} = require('../src/utils/recruitmentAnnouncement');

test('анонс набора содержит ссылку и разрешает только упоминание everyone', () => {
  const threadUrl = 'https://discord.com/channels/server/forum/thread';
  const payload = createRecruitmentAnnouncementPayload(threadUrl);

  assert.equal(
    payload.content,
    `@everyone\n\n📢 Новое объявление о наборе игроков:\n${threadUrl}`
  );
  assert.deepEqual(payload.allowedMentions, { parse: ['everyone'] });
});
