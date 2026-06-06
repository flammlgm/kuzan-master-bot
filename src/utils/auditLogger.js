const { EmbedBuilder } = require("discord.js");

async function auditLog(client, title, description) {
  try {
    const channelId = process.env.AUDIT_CHANNEL_ID;
    const ownerId = process.env.OWNER_USER_ID;

    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    // Канал аудита
    if (channelId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);

      if (channel) {
        await channel.send({ embeds: [embed] });
      }
    }

    // ЛС владельцу
    if (ownerId) {
      const owner = await client.users.fetch(ownerId).catch(() => null);

      if (owner) {
        await owner.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("Audit error:", err);
  }
}

module.exports = { auditLog };