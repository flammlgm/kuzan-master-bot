const { EmbedBuilder, MessageFlags } = require('discord.js');
const { config } = require('./config');

function getRoleNames(member) {
  return member.roles.cache
    .filter((role) => role.name !== '@everyone')
    .map((role) => `• ${role.name}`)
    .join('\n') || 'Ролей нет.';
}

function getCampaignRoles(member) {
  return member.roles.cache
    .filter((role) => role.name.startsWith(config.CAMPAIGN_ROLE_PREFIX))
    .map((role) => `• ${role.name}`)
    .join('\n') || 'Ты пока не состоишь в кампаниях.';
}

async function showMyRoles(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📌 Мои роли и кампании')
    .setColor(0x6d4aff)
    .addFields(
      {
        name: 'Кампании',
        value: getCampaignRoles(interaction.member),
      },
      {
        name: 'Все роли',
        value: getRoleNames(interaction.member).slice(0, 1024),
      }
    );

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

async function showServerHelp(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('❓ Помощь по серверу')
    .setColor(0x6d4aff)
    .setDescription(
      [
        '📡 **important_announcements** — объявления, наборы и важные публикации.',
        '📅 **game_schedule** — расписание игр, события и голосования.',
        '📜 **contract_guild** — правила сервера.',
        '',
        '🎲 Чтобы найти игру — используй кнопку **Найти игру**.',
        '🧙 Чтобы стать мастером — отправь заявку через кнопку **Хочу стать мастером**.',
        '📌 Чтобы посмотреть свои кампании — нажми **Мои роли и кампании**.',
      ].join('\n')
    );

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  showMyRoles,
  showServerHelp,
};