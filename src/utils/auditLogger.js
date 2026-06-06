const { EmbedBuilder } = require('discord.js');
const { config } = require('../config');

async function auditLog(client, title, fields = []) {
  try {
    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle(title)
      .setTimestamp();

    for (const field of fields) {
      embed.addFields({
        name: field.name,
        value: field.value || '—',
        inline: field.inline ?? false,
      });
    }

    if (config.AUDIT_CHANNEL_ID) {
      const channel = await client.channels
        .fetch(config.AUDIT_CHANNEL_ID)
        .catch(() => null);

      if (channel) {
        await channel.send({ embeds: [embed] });
      }
    }

    if (config.OWNER_USER_ID) {
      const owner = await client.users
        .fetch(config.OWNER_USER_ID)
        .catch(() => null);

      if (owner) {
        await owner.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (error) {
    console.error('Audit logger error:', error);
  }
}

function userField(user) {
  return `${user.tag}\nID: \`${user.id}\``;
}

module.exports = {
  auditLog,
  userField,
};