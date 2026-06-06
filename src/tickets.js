const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

const { client } = require('./client');
const { sessions } = require('./sessions');

async function getExistingTicket(userId) {
  const session = sessions.get(userId);

  if (!session?.ticketChannelId) return null;

  const channel = await client.channels
    .fetch(session.ticketChannelId)
    .catch(() => null);

  if (!channel) {
    sessions.delete(userId);
    return null;
  }

  return channel;
}

async function createTicket(interaction) {
  const existingTicket = await getExistingTicket(interaction.user.id);

  if (existingTicket) {
    return existingTicket;
  }

  const guild = interaction.guild;
  const ticketNumber = Math.floor(1000 + Math.random() * 9000);

  const channel = await guild.channels.create({
    name: `ticket-${ticketNumber}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  sessions.set(interaction.user.id, {
    ticketChannelId: channel.id,
    startedAt: Date.now(),
  });

  return channel;
}

async function deleteTicketLater(ticketChannelId, delay = 10000) {
  const ticketChannel = await client.channels
    .fetch(ticketChannelId)
    .catch(() => null);

  if (!ticketChannel) return;

  setTimeout(() => {
    ticketChannel.delete().catch(() => {});
  }, delay);
}

function createTicketIntroEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x6d4aff);
}

module.exports = {
  createTicket,
  deleteTicketLater,
  createTicketIntroEmbed,
};