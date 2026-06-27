const { SlashCommandBuilder, REST, Routes } = require('discord.js');
const { config } = require('./config');

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Создать панель мастера')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('playerpanel')
    .setDescription('Создать панель игрока')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('synccampaignmasters')
    .setDescription('Создать недостающие master_ роли для существующих camp_ кампаний')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
    { body: commands }
  );

  console.log('Slash-команды зарегистрированы.');
}

module.exports = { registerCommands };
