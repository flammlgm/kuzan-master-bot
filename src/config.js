const required = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'GUILD_ID',
  'GAME_SCHEDULE_CHANNEL_ID',
  'DUNGEON_MASTER_ROLE_ID',
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
  OWNER_USER_ID: process.env.OWNER_USER_ID,
  AUDIT_CHANNEL_ID: process.env.AUDIT_CHANNEL_ID,
  CAMPAIGN_ROLE_PREFIX: process.env.CAMPAIGN_ROLE_PREFIX || 'camp_',
};

module.exports = { config };