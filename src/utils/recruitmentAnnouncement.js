function createRecruitmentAnnouncementPayload(threadUrl) {
  return {
    content: [
      '@everyone',
      '',
      '📢 Новое объявление о наборе игроков:',
      threadUrl,
    ].join('\n'),
    allowedMentions: {
      parse: ['everyone'],
    },
  };
}

module.exports = { createRecruitmentAnnouncementPayload };
