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
const {
  createMyRecruitmentsSelectMenu,
  createRecruitmentManageButtons,
} = require('./ui');

const pendingRecruitments = new Map();

function createRecruitmentId() {
  return `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
}

function getPaymentLabel(paymentTag) {
  if (paymentTag === 'платная_игра') return 'Платная';
  if (paymentTag === 'бесплатная_игра') return 'Бесплатная';
  return '—';
}

function getFormatLabel(formatTag) {
  if (formatTag === 'ваншот') return 'Ваншот';
  if (formatTag === 'кампания') return 'Кампания';
  return '—';
}

function getRecruitmentTagIds(data) {
  const tags = [];

  if (config.TAG_RECRUITMENT_ID) tags.push(config.TAG_RECRUITMENT_ID);
  if (data.formatTag === 'ваншот' && config.TAG_ONESHOT_ID) tags.push(config.TAG_ONESHOT_ID);
  if (data.formatTag === 'кампания' && config.TAG_CAMPAIGN_ID) tags.push(config.TAG_CAMPAIGN_ID);
  if (data.paymentTag === 'платная_игра' && config.TAG_PAID_GAME_ID) tags.push(config.TAG_PAID_GAME_ID);
  if (data.paymentTag === 'бесплатная_игра' && config.TAG_FREE_GAME_ID) tags.push(config.TAG_FREE_GAME_ID);

  return [...new Set(tags)];
}

function isClosedThread(thread) {
  return (
    (config.TAG_CLOSED_ID && thread.appliedTags.includes(config.TAG_CLOSED_ID)) ||
    (config.TAG_ARCHIVE_ID && thread.appliedTags.includes(config.TAG_ARCHIVE_ID))
  );
}

function createRecruitmentEmbed(data, author) {
  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setColor(0x6d4aff)
    .addFields(
      { name: 'Система', value: data.system || '—', inline: true },
      { name: 'Формат', value: getFormatLabel(data.formatTag), inline: true },
      { name: 'Оплата', value: getPaymentLabel(data.paymentTag), inline: true },
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
  const originalTicketChannelId = session.ticketChannelId;

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

  const moderationTicket = await createPrivateTicket(guild, {
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

  await moderationTicket.send(payload);

  await auditLog(client, '📢 Объявление отправлено на модерацию', [
    { name: 'Мастер', value: userField(user) },
    { name: 'Название', value: data.title },
    { name: 'Тикет модерации', value: `<#${moderationTicket.id}>` },
  ]);

  sessions.delete(user.id);

  const responseText = [
    `Объявление отправлено на модерацию: <#${moderationTicket.id}>`,
    '',
    'Этот тикет закроется через 10 секунд.',
  ].join('\n');

  if (source.editReply) {
    await source.editReply(responseText);
  } else {
    await source.reply(responseText);
  }

  if (originalTicketChannelId && originalTicketChannelId !== moderationTicket.id) {
    await deleteTicketLater(originalTicketChannelId, 10000);
  }
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

  const appliedTags = getRecruitmentTagIds(data);

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
      '',
      'Нажми **Ознакомлен**, чтобы закрыть тикет.',
    ].join('\n'),
    components: [row],
  });

  await auditLog(client, '✅ Объявление о наборе одобрено', [
    { name: 'Одобрил', value: userField(interaction.user) },
    { name: 'Название', value: data.title },
    { name: 'Теги', value: appliedTags.length ? appliedTags.join('\n') : '—' },
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
      '',
      'Нажми **Ознакомлен**, чтобы закрыть тикет.',
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

async function fetchForumThreads(forum) {
  const active = await forum.threads.fetchActive();
  const threads = [...active.threads.values()];

  const archived = await forum.threads
    .fetchArchived({ type: 'public', limit: 50 })
    .catch(() => null);

  if (archived?.threads) {
    threads.push(...archived.threads.values());
  }

  const unique = new Map();

  for (const thread of threads) {
    unique.set(thread.id, thread);
  }

  return [...unique.values()];
}

async function isThreadOwnedByUser(thread, userId) {
  const starter = await thread.fetchStarterMessage().catch(() => null);

  if (!starter?.content) return false;

  return starter.content.includes(`<@${userId}>`) || starter.content.includes(`<@!${userId}>`);
}

async function getUserRecruitmentThreads(guild, userId) {
  const forum = await guild.channels
    .fetch(config.RECRUITMENT_FORUM_CHANNEL_ID)
    .catch(() => null);

  if (!forum) return [];

  const threads = await fetchForumThreads(forum);
  const result = [];

  for (const thread of threads) {
    if (!thread.appliedTags.includes(config.TAG_RECRUITMENT_ID)) continue;

    const owned = await isThreadOwnedByUser(thread, userId);

    if (owned) {
      result.push(thread);
    }
  }

  return result;
}

async function showMyRecruitments(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const threads = await getUserRecruitmentThreads(interaction.guild, interaction.user.id);

  if (!threads.length) {
    return interaction.editReply('У тебя пока нет объявлений о наборе.');
  }

  const session = sessions.get(interaction.user.id) || {};
  session.selectedRecruitmentThreadId = null;
  sessions.set(interaction.user.id, session);

  return interaction.editReply({
    content: '📋 Выбери объявление, которым хочешь управлять:',
    components: [createMyRecruitmentsSelectMenu(threads)],
  });
}

async function selectMyRecruitment(interaction, threadId) {
  const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);

  if (!thread) {
    return interaction.update({
      content: 'Объявление не найдено.',
      components: [],
    });
  }

  const owned = await isThreadOwnedByUser(thread, interaction.user.id);

  if (!owned) {
    return interaction.update({
      content: 'Это объявление не принадлежит тебе.',
      components: [],
    });
  }

  const session = sessions.get(interaction.user.id) || {};
  session.selectedRecruitmentThreadId = thread.id;
  sessions.set(interaction.user.id, session);

  return interaction.update({
    content: [
      `📋 Выбрано объявление: **${thread.name}**`,
      thread.url,
      '',
      'Что нужно сделать?',
    ].join('\n'),
    components: createRecruitmentManageButtons(),
  });
}

async function updateRecruitmentTags(interaction, updater, auditTitle) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const session = sessions.get(interaction.user.id);
  const threadId = session?.selectedRecruitmentThreadId;

  if (!threadId) {
    return interaction.editReply('Сначала выбери объявление через “Мои объявления”.');
  }

  const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);

  if (!thread) {
    return interaction.editReply('Объявление не найдено.');
  }

  const owned = await isThreadOwnedByUser(thread, interaction.user.id);

  if (!owned) {
    return interaction.editReply('Это объявление не принадлежит тебе.');
  }

  const nextTags = updater(thread.appliedTags || []);

  await thread.setAppliedTags([...new Set(nextTags)]);

  await auditLog(client, auditTitle, [
    { name: 'Мастер', value: userField(interaction.user) },
    { name: 'Объявление', value: `${thread.name}\n${thread.url}` },
    { name: 'Теги', value: [...new Set(nextTags)].join('\n') || '—' },
  ]);

  return interaction.editReply('Теги объявления обновлены.');
}

async function closeMyRecruitment(interaction) {
  if (!config.TAG_CLOSED_ID) {
    return interaction.reply({
      content: 'TAG_CLOSED_ID не указан в .env.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return updateRecruitmentTags(
    interaction,
    (tags) => [...tags, config.TAG_CLOSED_ID],
    '🔒 Объявление закрыто мастером'
  );
}

async function setRecruitmentFormatTag(interaction, format) {
  return updateRecruitmentTags(
    interaction,
    (tags) => {
      const filtered = tags.filter(
        (tag) => tag !== config.TAG_ONESHOT_ID && tag !== config.TAG_CAMPAIGN_ID
      );

      if (format === 'ваншот' && config.TAG_ONESHOT_ID) filtered.push(config.TAG_ONESHOT_ID);
      if (format === 'кампания' && config.TAG_CAMPAIGN_ID) filtered.push(config.TAG_CAMPAIGN_ID);

      return filtered;
    },
    '🏷️ Формат объявления изменён'
  );
}

async function setRecruitmentPaymentTag(interaction, payment) {
  return updateRecruitmentTags(
    interaction,
    (tags) => {
      const filtered = tags.filter(
        (tag) => tag !== config.TAG_PAID_GAME_ID && tag !== config.TAG_FREE_GAME_ID
      );

      if (payment === 'платная_игра' && config.TAG_PAID_GAME_ID) filtered.push(config.TAG_PAID_GAME_ID);
      if (payment === 'бесплатная_игра' && config.TAG_FREE_GAME_ID) filtered.push(config.TAG_FREE_GAME_ID);

      return filtered;
    },
    '🏷️ Тип оплаты объявления изменён'
  );
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
      const tags = thread.appliedTags;

      return (
        config.TAG_RECRUITMENT_ID &&
        tags.includes(config.TAG_RECRUITMENT_ID) &&
        !(config.TAG_CLOSED_ID && tags.includes(config.TAG_CLOSED_ID)) &&
        !(config.TAG_ARCHIVE_ID && tags.includes(config.TAG_ARCHIVE_ID))
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
  showMyRecruitments,
  selectMyRecruitment,
  closeMyRecruitment,
  setRecruitmentFormatTag,
  setRecruitmentPaymentTag,
};