const { Client, GatewayIntentBits } = require('discord.js');

const { config } = require('./config');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];

if (config.GUILD_MEMBERS_INTENT_ENABLED) {
  intents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({ intents });

module.exports = { client };
