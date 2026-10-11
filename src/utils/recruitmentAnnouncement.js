function createRecruitmentAnnouncementPayload(threadUrl) {
  return {
    content: [
      '@everyone',
      '',
      '📢 Новое объявление:',
      threadUrl,
    ].join('\n'),
    allowedMentions: {
      parse: ['everyone'],
    },
  };
}

module.exports = { createRecruitmentAnnouncementPayload };
