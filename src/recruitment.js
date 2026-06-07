const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const { client } = require('./client');
const { config } = require('./config');
const { sessions } = require('./sessions');
const { createPrivateTicket, deleteTicketLater } = require('./tickets');
const { auditLog, userField } = require('./utils/auditLogger');

const pendingRecruitments = new Map();

function createRecruitmentId() {
  return `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
}

function getForumTagIdsByNames(forum, names) {
  const lowerNames = names.map((name) => name.toLowerCase());

  return forum.availableTags
    .filter((tag) => lowerNames.includes(tag.name.toLowerCase()))
    .map((tag) => tag.id);
}

function createRecruitmentEmbed(data, author) {
  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setColor(0x6d4aff)
    .addFields(
      { name: 'Система', value: data.system || '—', inline: true },
      { name: 'Формат', value: data.format || '—', inline: true },
      { name: 'Оплата', value: data.payment || '—', inline: true },
      { name: 'Игроки', value: data.players || '—', inline: true },
      { name: 'Возрастное ограничение', value: data.age || '—', inline: true },
      { name: 'Даты / расписание', value: data.dates || '—' },
      { name: 'Требования', value: data.requirements || '—' },
      { name: 'Описание', value: data.description || '—' }
    )
    .setFooter({ text: `Мастер: ${author.tag}` })
    .setTimestamp();

  if (data.hasCover) {
    embed.setImage('attachment://cover.png');
  }

  return embed;
}

async function submitRecruitmentForModeration(source, session, imageBuffer = null) {
  const guild = source.guild;
  const user = source.user || source.author;

  const recruitmentId = createRecruitmentId();

  const data = {
    ...session.recruitment,
    authorId: user.id,
    hasCover: Boolean(imageBuffer),
  };

  pendingRecruitments.set(recruitmentId, {
    data,
    imageBuffer,
  });

  const ticket = await createPrivateTicket(guild, {
    userIds: [user.id, config.OWNER_USER_ID],
    prefix: 'recruitment',
  });

  const embed = createRecruitmentEmbed(data, user);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`recruitment_approve_${recruitmentId}`)
      .setLabel('Одобрить публикацию')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`recruitment_reject_${recruitmentId}`)
      .setLabel('Отклонить')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  const payload = {
    content: `<@${config.OWNER_USER_ID}> <@${user.id}>`,
    embeds: [embed],
    components: [buttons],
  };

  if (imageBuffer) {
    payload.files = [{ attachment: imageBuffer, name: 'cover.png' }];
  }

  await ticket.send(payload);

  await auditLog(client, '📢 Объявление отправлено на модерацию', [
    { name: 'Мастер', value: userField(user) },
    { name: 'Название', value: data.title },
    { name: 'Тикет', value: `<#${ticket.id}>` },
  ]);

  sessions.delete(user.id);

  if (source.editReply) {
    return source.editReply(`Объявление отправлено на модерацию: <#${ticket.id}>`);
  }

  return source.reply(`Объявление отправлено на модерацию: <#${ticket.id}>`);
}

async function approveRecruitment(interaction, recruitmentId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.user.id !== config.OWNER_USER_ID) {
    return interaction.editReply('Одобрять объявления может только владелец сервера.');
  }

  const item = pendingRecruitments.get(recruitmentId);

  if (!item) {
    return interaction.editReply('Черновик объявления не найден. Возможно, бот перезапускался.');
  }

  const forum = await interaction.guild.channels
    .fetch(config.RECRUITMENT_FORUM_CHANNEL_ID)
    .catch(() => null);

  if (!forum) {
    return interaction.editReply('Форум для объявлений не найден.');
  }

  const data = item.data;
  const author = await client.users.fetch(data.authorId).catch(() => null);
  const embed = createRecruitmentEmbed(data, author || interaction.user);

  const tagNames = ['набор_игроков'];

  if (data.format?.toLowerCase().includes('ваншот')) tagNames.push('ваншот');
  if (data.format?.toLowerCase().includes('кампан')) tagNames.push('кампания');
  if (data.payment?.toLowerCase().includes('плат')) tagNames.push('платная_игра');
  if (data.payment?.toLowerCase().includes('бесплат')) tagNames.push('бесплатная_игра');

  const appliedTags = getForumTagIdsByNames(forum, tagNames);

  const threadPayload = {
    name: data.title.slice(0, 100),
    appliedTags,
    message: {
      content: `<@${data.authorId}>`,
      embeds: [embed],
    },
  };

  if (item.imageBuffer) {
    threadPayload.message.files = [{ attachment: item.imageBuffer, name: 'cover.png' }];
  }

  const thread = await forum.threads.create(threadPayload);

  pendingRecruitments.delete(recruitmentId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feedback_ack_${data.authorId}`)
      .setLabel('Ознакомлен')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({
    content: [
      `<@${data.authorId}>`,
      '',
      '✅ Объявление одобрено и опубликовано.',
      '',
      `Публикация: ${thread.url}`,
    ].join('\n'),
    components: [row],
  });

  await auditLog(client, '✅ Объявление о наборе одобрено', [
    { name: 'Одобрил', value: userField(interaction.user) },
    { name: 'Название', value: data.title },
    { name: 'Публикация', value: thread.url },
  ]);

  return interaction.editReply('Объявление опубликовано.');
}

async function rejectRecruitment(interaction, recruitmentId, reason) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.user.id !== config.OWNER_USER_ID) {
    return interaction.editReply('Отклонять объявления может только владелец сервера.');
  }

  const item = pendingRecruitments.get(recruitmentId);

  if (!item) {
    return interaction.editReply('Черновик объявления не найден. Возможно, бот перезапускался.');
  }

  pendingRecruitments.delete(recruitmentId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feedback_ack_${item.data.authorId}`)
      .setLabel('Ознакомлен')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({
    content: [
      `<@${item.data.authorId}>`,
      '',
      '❌ Объявление отклонено.',
      '',
      '**Причина:**',
      reason || 'Причина не указана.',
    ].join('\n'),
    components: [row],
  });

  await auditLog(client, '❌ Объявление о наборе отклонено', [
    { name: 'Отклонил', value: userField(interaction.user) },
    { name: 'Название', value: item.data.title },
    { name: 'Причина', value: reason || '—' },
  ]);

  return interaction.editReply('Объявление отклонено.');
}

async function showActiveRecruitments(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const forum = await interaction.guild.channels
    .fetch(config.RECRUITMENT_FORUM_CHANNEL_ID)
    .catch(() => null);

  if (!forum) {
    return interaction.editReply('Форум с наборами не найден.');
  }

  const active = await forum.threads.fetchActive();

  const tagById = new Map(forum.availableTags.map((tag) => [tag.id, tag.name]));

  const threads = [...active.threads.values()]
    .filter((thread) => {
      const tagNames = thread.appliedTags.map((id) => tagById.get(id));

      return (
        tagNames.includes('набор_игроков') &&
        !tagNames.includes('закрыто') &&
        !tagNames.includes('архив')
      );
    })
    .slice(0, 15);

  if (!threads.length) {
    return interaction.editReply('Сейчас нет активных наборов игроков.');
  }

  const lines = threads.map((thread, index) => {
    const tags = thread.appliedTags
      .map((id) => tagById.get(id))
      .filter(Boolean)
      .map((name) => `\`${name}\``)
      .join(' ');

    return `${index + 1}. **${thread.name}**\n${thread.url}\n${tags || 'Без тегов'}`;
  });

  return interaction.editReply({
    content: [
      '🎲 Активные наборы игроков:',
      '',
      ...lines,
    ].join('\n\n'),
  });
}

module.exports = {
  submitRecruitmentForModeration,
  approveRecruitment,
  rejectRecruitment,
  showActiveRecruitments,
};