const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { config } = require('./config');
const { client } = require('./client');
const { createPrivateTicket, deleteTicketLater } = require('./tickets');
const { auditLog, userField } = require('./utils/auditLogger');

const WELCOME_TICKET_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const WELCOME_TICKET_TOPIC_PREFIX = 'welcome_ticket';
const welcomeTicketTimers = new Map();

function buildWelcomeTicketTopic(userId, createdAt = Date.now()) {
  return `${WELCOME_TICKET_TOPIC_PREFIX}:${userId}:${createdAt}`;
}

function parseWelcomeTicketTopic(topic) {
  if (!topic?.startsWith(`${WELCOME_TICKET_TOPIC_PREFIX}:`)) return null;

  const [, userId, createdAtRaw] = topic.split(':');
  const createdAt = Number(createdAtRaw);

  if (!userId || Number.isNaN(createdAt)) return null;

  return { userId, createdAt };
}

function createWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setTitle('👋 Добро пожаловать!')
    .setDescription(
      [
        `<@${member.id}>, добро пожаловать на сервер!`,
        '',
        'Перед тем как получить полный доступ, пожалуйста, ознакомься с правилами и навигацией сервера.',
        'Когда всё прочитаешь — нажми кнопку **«Ознакомлен с правилами»** ниже.',
        '',
        'После этого бот выдаст тебе роль `guild_member`, а этот тикет автоматически закроется.',
      ].join('\n')
    )
    .setColor(0x6d4aff)
    .setFooter({ text: 'Тикет закроется автоматически через 2 суток, если кнопку не нажать.' });
}

function createWelcomeAcknowledgeButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('welcome_rules_ack')
      .setLabel('Ознакомлен с правилами')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );
}

async function deleteWelcomeTicket(channelId, reason = 'Истёк срок приветственного тикета') {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const ticketData = parseWelcomeTicketTopic(channel.topic);

  clearWelcomeTicketTimer(channelId);
  await channel.delete(reason).catch(() => {});

  if (ticketData) {
    await auditLog(client, '⌛ Приветственный тикет закрыт по таймеру', [
      { name: 'Пользователь', value: `<@${ticketData.userId}>\nID: \`${ticketData.userId}\`` },
      { name: 'Тикет', value: channel.name },
    ]);
  }
}

function clearWelcomeTicketTimer(channelId) {
  const timer = welcomeTicketTimers.get(channelId);
  if (timer) clearTimeout(timer);
  welcomeTicketTimers.delete(channelId);
}

function scheduleWelcomeTicketDeletion(channelId, createdAt) {
  clearWelcomeTicketTimer(channelId);

  const expiresAt = createdAt + WELCOME_TICKET_TTL_MS;
  const delay = Math.max(0, expiresAt - Date.now());
  const timer = setTimeout(() => {
    deleteWelcomeTicket(channelId).catch((error) => {
      console.error('Welcome ticket delete error:', error);
    });
  }, delay);

  welcomeTicketTimers.set(channelId, timer);
}

async function sendTicketLinkToMember(member, channel) {
  await member
    .send(`Добро пожаловать на сервер **${member.guild.name}**! Я открыл для тебя приветственный тикет: <#${channel.id}>`)
    .catch(() => null);
}

async function handleGuildMemberAdd(member) {
  if (member.user.bot) return;

  const createdAt = Date.now();
  const channel = await createPrivateTicket(member.guild, {
    userIds: [member.id],
    prefix: 'welcome',
    topic: buildWelcomeTicketTopic(member.id, createdAt),
  });

  scheduleWelcomeTicketDeletion(channel.id, createdAt);

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [createWelcomeEmbed(member)],
    components: [createWelcomeAcknowledgeButton()],
  });

  await sendTicketLinkToMember(member, channel);

  await auditLog(client, '👋 Открыт приветственный тикет', [
    { name: 'Пользователь', value: userField(member.user) },
    { name: 'Тикет', value: `<#${channel.id}>` },
  ]);
}

async function handleWelcomeAcknowledge(interaction) {
  const ticketData = parseWelcomeTicketTopic(interaction.channel?.topic);

  if (!ticketData) {
    return interaction.reply({
      content: 'Эта кнопка работает только в приветственном тикете.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.user.id !== ticketData.userId) {
    return interaction.reply({
      content: 'Подтвердить ознакомление может только пользователь, для которого открыт этот тикет.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const role = await interaction.guild.roles.fetch(config.GUILD_MEMBER_ROLE_ID).catch(() => null);
  if (!role) {
    return interaction.reply({
      content: 'Не нашёл роль guild_member. Проверь `GUILD_MEMBER_ROLE_ID` в переменных окружения.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.member.roles.add(role, 'Пользователь ознакомился с правилами').catch(async (error) => {
    console.error('Guild member role add error:', error);
    await interaction.reply({
      content: 'Не получилось выдать роль. Проверь права бота и положение роли бота выше `guild_member`.',
      flags: MessageFlags.Ephemeral,
    });
  });

  if (interaction.replied) return;

  clearWelcomeTicketTimer(interaction.channel.id);

  await auditLog(client, '✅ Пользователь ознакомился с правилами', [
    { name: 'Пользователь', value: userField(interaction.user) },
    { name: 'Роль', value: `${role.name}\nID: \`${role.id}\`` },
    { name: 'Тикет', value: interaction.channel.name },
  ]);

  await interaction.reply({
    content: 'Готово! Роль выдана, тикет сейчас закроется.',
    flags: MessageFlags.Ephemeral,
  });

  await deleteTicketLater(interaction.channel.id, 3000);
}

async function scheduleExistingWelcomeTickets(guild) {
  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return;

  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText) continue;

    const ticketData = parseWelcomeTicketTopic(channel.topic);
    if (!ticketData) continue;

    const expiresAt = ticketData.createdAt + WELCOME_TICKET_TTL_MS;
    if (expiresAt <= Date.now()) {
      await deleteWelcomeTicket(channel.id);
    } else {
      scheduleWelcomeTicketDeletion(channel.id, ticketData.createdAt);
    }
  }
}

module.exports = {
  handleGuildMemberAdd,
  handleWelcomeAcknowledge,
  scheduleExistingWelcomeTickets,
};
