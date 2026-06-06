const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { client } = require('./client');
const { config } = require('./config');
const { sessions } = require('./sessions');
const { deleteTicketLater } = require('./tickets');
const { auditLog, userField } = require('./utils/auditLogger');

function normalizeChannelName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 90);
}

function buildCampaignSummary(campaign) {
  if (!campaign?.channels?.length) return 'Каналы пока не добавлены.';

  return campaign.channels
    .map((channel, index) => {
      const icon = channel.type === 'voice' ? '🔊' : '#';
      const topic = channel.topic ? ` — ${channel.topic}` : '';
      return `${index + 1}. ${icon} ${channel.name}${topic}`;
    })
    .join('\n');
}

function ensureCampaignRoleName(roleName) {
  const trimmed = roleName.trim();

  if (trimmed.startsWith(config.CAMPAIGN_ROLE_PREFIX)) {
    return trimmed;
  }

  return `${config.CAMPAIGN_ROLE_PREFIX}${trimmed}`;
}

function getCampaignPermissionOverwrites(guild, roleId) {
  return [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roleId,
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
  ];
}

async function createCampaign(interaction, session) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const campaign = session.campaign;

  if (!campaign?.title || !campaign?.roleName || !campaign.channels?.length) {
    return interaction.editReply({
      content: 'Нельзя создать кампанию без названия, роли и хотя бы одного канала.',
    });
  }

  const finalRoleName = ensureCampaignRoleName(campaign.roleName);

  const role = await guild.roles.create({
    name: finalRoleName,
    mentionable: true,
    reason: `Campaign created by ${interaction.user.tag}`,
  });

  await interaction.member.roles.add(role);

  const overwrites = getCampaignPermissionOverwrites(guild, role.id);

  const category = await guild.channels.create({
    name: campaign.title,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
  });

  const createdChannels = [];

  for (const item of campaign.channels) {
    const isVoice = item.type === 'voice';

    const channel = await guild.channels.create({
      name: isVoice ? item.name : normalizeChannelName(item.name),
      type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
      parent: category.id,
      topic: !isVoice && item.topic ? item.topic : undefined,
      permissionOverwrites: overwrites,
    });

    createdChannels.push(channel);
  }

  await auditLog(client, '🏰 Создана кампания', [
    { name: 'Мастер', value: userField(interaction.user) },
    { name: 'Категория', value: campaign.title, inline: true },
    { name: 'Роль', value: `<@&${role.id}>`, inline: true },
    {
      name: 'Каналы',
      value: createdChannels.map((channel) => `<#${channel.id}>`).join('\n'),
    },
  ]);

  const ticketChannelId = session.ticketChannelId;
  sessions.delete(interaction.user.id);

  await interaction.editReply({
    content: [
      `Кампания **${campaign.title}** создана.`,
      '',
      `Роль: <@&${role.id}>`,
      `Категория: **${category.name}**`,
      '',
      '**Каналы:**',
      createdChannels.map((channel) => `<#${channel.id}>`).join('\n'),
      '',
      'Тикет удалится через 10 секунд.',
    ].join('\n'),
  });

  await deleteTicketLater(ticketChannelId);
}

async function applyCampaignRole(interaction, session) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const role = interaction.guild.roles.cache.get(session.manageRoleId);

  if (!role) {
    return interaction.editReply('Роль не найдена.');
  }

  if (!role.name.startsWith(config.CAMPAIGN_ROLE_PREFIX)) {
    await auditLog(client, '🚨 Попытка изменить запрещённую роль', [
      { name: 'Мастер', value: userField(interaction.user) },
      { name: 'Роль', value: `${role.name} — <@&${role.id}>` },
      {
        name: 'Действие',
        value: session.manageAction === 'add' ? 'Выдать роль' : 'Снять роль',
      },
    ]);

    return interaction.editReply({
      content: `Запрещено изменять роль <@&${role.id}> через панель мастера.`,
    });
  }

  const results = [];
  const affectedMembers = [];

  for (const userId of session.manageUserIds) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      results.push(`❌ <@${userId}> не найден`);
      continue;
    }

    try {
      if (session.manageAction === 'add') {
        await member.roles.add(role);
        results.push(`✅ <@${userId}> получил роль <@&${role.id}>`);
      }

      if (session.manageAction === 'remove') {
        await member.roles.remove(role);
        results.push(`✅ у <@${userId}> снята роль <@&${role.id}>`);
      }

      affectedMembers.push(member);
    } catch (error) {
      results.push(`❌ не удалось изменить роли у <@${userId}>`);
    }
  }

  await auditLog(
    client,
    session.manageAction === 'add'
      ? '👤 Игроки добавлены в кампанию'
      : '🚪 Игроки удалены из кампании',
    [
      { name: 'Мастер', value: userField(interaction.user) },
      { name: 'Роль кампании', value: `<@&${role.id}>` },
      {
        name: 'Игроки',
        value: affectedMembers.length
          ? affectedMembers.map((member) => `${member.user.tag} — <@${member.id}>`).join('\n')
          : 'Нет успешно обработанных игроков',
      },
    ]
  );

  const ticketChannelId = session.ticketChannelId;
  sessions.delete(interaction.user.id);

  await interaction.editReply({
    content: [
      session.manageAction === 'add'
        ? 'Игроки добавлены в кампанию.'
        : 'Игроки удалены из кампании.',
      '',
      ...results,
      '',
      'Тикет удалится через 10 секунд.',
    ].join('\n'),
  });

  await deleteTicketLater(ticketChannelId);
}

module.exports = {
  buildCampaignSummary,
  createCampaign,
  applyCampaignRole,
};