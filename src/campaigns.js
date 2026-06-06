const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { client } = require('./client');
const { sessions } = require('./sessions');
const { deleteTicketLater } = require('./tickets');

function normalizeChannelName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .slice(0, 90);
}

function buildCampaignSummary(campaign) {
  if (!campaign?.channels?.length) {
    return 'Каналы пока не добавлены.';
  }

  return campaign.channels
    .map((channel, index) => {
      const icon = channel.type === 'voice' ? '🔊' : '#';
      return `${index + 1}. ${icon} ${channel.name}`;
    })
    .join('\n');
}

async function createCampaign(interaction, session) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const guild = interaction.guild;
  const campaign = session.campaign;

  if (!campaign?.title || !campaign.channels?.length) {
    return interaction.editReply({
      content: 'Нельзя создать кампанию без названия и хотя бы одного канала.',
    });
  }

  const role = await guild.roles.create({
    name: campaign.title,
    mentionable: true,
    reason: `Campaign created by ${interaction.user.tag}`,
  });

  await interaction.member.roles.add(role);

  const category = await guild.channels.create({
    name: campaign.title,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
      },
    ],
  });

  for (const item of campaign.channels) {
    if (item.type === 'voice') {
      await guild.channels.create({
        name: item.name,
        type: ChannelType.GuildVoice,
        parent: category.id,
      });
    } else {
      await guild.channels.create({
        name: normalizeChannelName(item.name),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: item.topic || undefined,
      });
    }
  }

  const ticketChannelId = session.ticketChannelId;

  sessions.delete(interaction.user.id);

  await interaction.editReply({
    content: [
      `Кампания **${campaign.title}** создана.`,
      '',
      `Роль: <@&${role.id}>`,
      `Категория: **${category.name}**`,
      '',
      'Тикет удалится через 10 секунд.',
    ].join('\n'),
  });

  await deleteTicketLater(ticketChannelId);
}

module.exports = {
  buildCampaignSummary,
  createCampaign,
};