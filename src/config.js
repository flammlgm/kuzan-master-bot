const required = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'GUILD_ID',
  'GAME_SCHEDULE_CHANNEL_ID',
  'DUNGEON_MASTER_ROLE_ID',
  'PLAYER_PANEL_CHANNEL_ID',
  'RECRUITMENT_FORUM_CHANNEL_ID',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`В .env не хватает переменной: ${key}`);
  }
}

const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,
  GAME_SCHEDULE_CHANNEL_ID: process.env.GAME_SCHEDULE_CHANNEL_ID,
  DUNGEON_MASTER_ROLE_ID: process.env.DUNGEON_MASTER_ROLE_ID,
  PLAYER_PANEL_CHANNEL_ID: process.env.PLAYER_PANEL_CHANNEL_ID,
  RECRUITMENT_FORUM_CHANNEL_ID: process.env.RECRUITMENT_FORUM_CHANNEL_ID,

  OWNER_USER_ID: process.env.OWNER_USER_ID,
  AUDIT_CHANNEL_ID: process.env.AUDIT_CHANNEL_ID,
  CAMPAIGN_ROLE_PREFIX: process.env.CAMPAIGN_ROLE_PREFIX || 'camp_',

  TAG_ONESHOT_ID: process.env.TAG_ONESHOT_ID,
  TAG_ORG_QUESTION_ID: process.env.TAG_ORG_QUESTION_ID,
  TAG_RECRUITMENT_ID: process.env.TAG_RECRUITMENT_ID,
  TAG_CAMPAIGN_ID: process.env.TAG_CAMPAIGN_ID,
  TAG_PAID_GAME_ID: process.env.TAG_PAID_GAME_ID,
  TAG_FREE_GAME_ID: process.env.TAG_FREE_GAME_ID,
};

module.exports = { config };