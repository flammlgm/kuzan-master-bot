const { EmbedBuilder } = require('discord.js');
const { config } = require('../config');

function buildEmbed(title, fields = [], color = 0xff9900) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp();

  for (const field of fields) {
    embed.addFields({
      name: field.name,
      value: field.value || '—',
      inline: field.inline ?? false,
    });
  }

  return embed;
}

async function auditLog(client, title, fields = []) {
  try {
    if (!config.AUDIT_CHANNEL_ID) return;

    const channel = await client.channels
      .fetch(config.AUDIT_CHANNEL_ID)
      .catch(() => null);

    if (!channel) return;

    const embed = buildEmbed(title, fields, 0xff9900);

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Audit logger error:', error);
  }
}

async function notifyOwner(client, title, fields = []) {
  try {
    if (!config.OWNER_USER_ID) return;

    const owner = await client.users
      .fetch(config.OWNER_USER_ID)
      .catch(() => null);

    if (!owner) return;

    const embed = buildEmbed(title, fields, 0x6d4aff);

    await owner.send({ embeds: [embed] }).catch(() => {});
  } catch (error) {
    console.error('Owner notify error:', error);
  }
}

function userField(user) {
  return `${user.tag}\nID: \`${user.id}\``;
}

module.exports = {
  auditLog,
  notifyOwner,
  userField,
};