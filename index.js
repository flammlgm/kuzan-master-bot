require('dotenv').config();

const { client } = require('./src/client');
const { registerCommands } = require('./src/commands');
const { handleInteraction, handleMessage } = require('./src/handlers');
const { config } = require('./src/config');
const { sendWelcomeMessage } = require('./src/onboarding');
const { Events } = require('discord.js');

client.once(Events.ClientReady, async () => {
  console.log(`Бот запущен как ${client.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, handleInteraction);
client.on(Events.MessageCreate, handleMessage);
client.on(Events.GuildMemberAdd, sendWelcomeMessage);

client.on('error', (error) => {
  console.error('Client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

client.login(config.DISCORD_TOKEN);