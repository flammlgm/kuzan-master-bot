const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { client } = require('./client');
const { config } = require('./config');
const { auditLog, userField } = require('./utils/auditLogger');

const STATE_PATH = path.join(__dirname, '..', 'data', 'master-search-state.json');

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { requests: {} };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Не удалось прочитать состояние поиска мастеров:', error);
    }

    return { requests: {} };
  }
}

const state = loadState();
if (!state.requests || typeof state.requests !== 'object') state.requests = {};
const operationLocks = new Set();

function saveState() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function createRequestId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function hasActivePlayerMasterRequest(playerId) {
  return Object.values(state.requests).some(
    (request) => request.playerId === playerId && ['open', 'claimed', 'returning'].includes(request.status)
  );
}

function getActivePlayerMasterRequest(playerId) {
  return Object.values(state.requests)
    .filter((request) => request.playerId === playerId && ['open', 'claimed', 'returning'].includes(request.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function createRequestEmbed(request, status = request.status) {
  const embed = new EmbedBuilder()
    .setTitle('🔎 Группа игроков ищет мастера')
    .setColor(status === 'open' ? 0x57f287 : status === 'claimed' ? 0x5865f2 : 0x99aab5)
    .setDescription(`Автор объявления: <@${request.playerId}>`)
    .addFields(
      { name: 'Состав и возраст', value: request.group || '—' },
      { name: 'Система и сеттинг', value: request.setting || '—' },
      { name: 'Тематика и пожелания', value: request.wishes || '—' },
      { name: 'Формат и расписание', value: request.schedule || '—' },
      { name: 'Оплата', value: request.payment || '—', inline: true },
      {
        name: 'После отклика',
        value: 'Если вы готовы взять группу, нажмите кнопку и обязательно свяжитесь с игроком лично.',
      }
    )
    .setTimestamp(new Date(request.createdAt));

  if (status === 'open') {
    embed.setFooter({ text: 'Первый мастер, нажавший кнопку, закрепляет группу за собой.' });
  } else if (status === 'claimed') {
    embed.addFields({ name: 'Мастер найден', value: `<@${request.masterId}>` });
    embed.setFooter({ text: 'Вернуть объявление в поиск может только закреплённый мастер.' });
  } else if (status === 'returned') {
    embed.addFields({ name: 'Статус', value: 'Объявление возвращено в поиск новой публикацией.' });
  } else if (status === 'closed') {
    embed.addFields({ name: 'Статус', value: 'Поиск мастера закрыт игроком.' });
    embed.setFooter({ text: 'Это объявление больше не актуально.' });
  }

  return embed;
}

function createClaimButton(requestId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`master_search_claim_${requestId}`)
      .setLabel('Взять группу')
      .setEmoji('🤝')
      .setStyle(ButtonStyle.Success)
  );
}

function createReturnButton(requestId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`master_search_return_${requestId}`)
      .setLabel('Вернуть в поиск')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );
}

function createPlayerManageButtons(requestId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`player_master_search_close_${requestId}`)
      .setLabel('Закрыть поиск')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function getStatusLabel(request) {
  if (request.status === 'open') return 'Мастера пока не нашли';
  if (request.status === 'claimed') return `Группу забрал <@${request.masterId}>`;
  if (request.status === 'returning') return 'Объявление возвращается в поиск';
  return 'Поиск закрыт';
}

async function getRequestsChannel(guild) {
  const channel = await guild.channels
    .fetch(config.PLAYER_MASTER_REQUESTS_CHANNEL_ID)
    .catch(() => null);

  return channel?.isTextBased() ? channel : null;
}

async function submitPlayerMasterRequest(interaction) {
  if (hasActivePlayerMasterRequest(interaction.user.id)) {
    return interaction.reply({
      content: 'У тебя уже есть действующее объявление о поиске мастера.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await getRequestsChannel(interaction.guild);
  if (!channel) {
    return interaction.editReply('Не найден закрытый канал мастеров. Сообщи администрации.');
  }

  const requestId = createRequestId();
  const request = {
    id: requestId,
    playerId: interaction.user.id,
    playerTag: interaction.user.tag,
    group: interaction.fields.getTextInputValue('master_search_group').trim(),
    setting: interaction.fields.getTextInputValue('master_search_setting').trim(),
    wishes: interaction.fields.getTextInputValue('master_search_wishes').trim(),
    schedule: interaction.fields.getTextInputValue('master_search_schedule').trim(),
    payment: interaction.fields.getTextInputValue('master_search_payment').trim(),
    status: 'open',
    masterId: null,
    channelId: channel.id,
    messageId: null,
    createdAt: new Date().toISOString(),
  };

  const message = await channel.send({
    content: `<@&${config.DUNGEON_MASTER_ROLE_ID}>`,
    embeds: [createRequestEmbed(request)],
    components: [createClaimButton(requestId)],
    allowedMentions: { roles: [config.DUNGEON_MASTER_ROLE_ID] },
  });

  request.messageId = message.id;
  state.requests[requestId] = request;
  saveState();

  await auditLog(client, '🔎 Игроки ищут мастера', [
    { name: 'Автор', value: userField(interaction.user) },
    { name: 'Объявление', value: message.url },
  ]);

  return interaction.editReply([
    '✅ Объявление отправлено в закрытый канал мастеров.',
    'Когда мастер заберёт группу, бот пришлёт тебе личное сообщение.',
    '💬 Желательно открыть личные сообщения от участников сервера, иначе уведомление бота может не дойти.',
  ].join('\n'));
}

async function showPlayerMasterRequest(interaction) {
  const request = getActivePlayerMasterRequest(interaction.user.id);

  if (!request) {
    return interaction.reply({
      content: 'У тебя нет действующего объявления о поиске мастера.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: [
      '📋 **Твоё объявление о поиске мастера**',
      `Статус: ${getStatusLabel(request)}`,
      '',
      request.status === 'returning'
        ? 'Подожди несколько секунд, пока бот опубликует объявление заново.'
        : 'Если поиск больше не актуален, закрой объявление.',
    ].join('\n'),
    components: request.status === 'returning' ? [] : [createPlayerManageButtons(request.id)],
    flags: MessageFlags.Ephemeral,
  });
}

async function claimPlayerMasterRequest(interaction, requestId) {
  if (!interaction.member.roles.cache.has(config.DUNGEON_MASTER_ROLE_ID)) {
    return interaction.reply({ content: 'Забрать группу может только мастер.', flags: MessageFlags.Ephemeral });
  }

  const request = state.requests[requestId];

  if (operationLocks.has(requestId)) {
    return interaction.reply({ content: 'Объявление сейчас обновляется. Попробуй ещё раз.', flags: MessageFlags.Ephemeral });
  }

  if (!request || request.status !== 'open' || request.messageId !== interaction.message.id) {
    return interaction.reply({
      content: request?.status === 'claimed'
        ? `Эту группу уже забрал <@${request.masterId}>.`
        : 'Это объявление уже неактивно.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (request.playerId === interaction.user.id) {
    return interaction.reply({
      content: 'Нельзя забрать собственное объявление.',
      flags: MessageFlags.Ephemeral,
    });
  }

  operationLocks.add(requestId);

  try {
    request.status = 'claimed';
    request.masterId = interaction.user.id;
    request.claimedAt = new Date().toISOString();
    saveState();

    await interaction.update({
      content: `<@${request.playerId}> <@${request.masterId}>`,
      embeds: [createRequestEmbed(request)],
      components: [createReturnButton(requestId)],
      allowedMentions: { users: [request.playerId, request.masterId] },
    });
  } catch (error) {
    request.status = 'open';
    request.masterId = null;
    delete request.claimedAt;
    saveState();
    throw error;
  } finally {
    operationLocks.delete(requestId);
  }

  const player = await client.users.fetch(request.playerId).catch(() => null);
  if (player) {
    await player.send([
      '🤝 На ваше объявление о поиске мастера откликнулись.',
      `Мастер: <@${interaction.user.id}> (${interaction.user.tag})`,
      'Свяжитесь друг с другом и обсудите детали игры.',
    ].join('\n')).catch(() => null);
  }

  await auditLog(client, '🤝 Мастер забрал группу', [
    { name: 'Мастер', value: userField(interaction.user) },
    { name: 'Игрок', value: `<@${request.playerId}>` },
    { name: 'Объявление', value: interaction.message.url },
  ]);
}

async function returnPlayerMasterRequest(interaction, requestId) {
  const request = state.requests[requestId];

  if (operationLocks.has(requestId)) {
    return interaction.reply({ content: 'Объявление сейчас обновляется. Попробуй ещё раз.', flags: MessageFlags.Ephemeral });
  }

  if (!request || request.status !== 'claimed' || request.messageId !== interaction.message.id) {
    return interaction.reply({ content: 'Это объявление уже не закреплено за мастером.', flags: MessageFlags.Ephemeral });
  }

  if (request.masterId !== interaction.user.id) {
    return interaction.reply({
      content: `Вернуть объявление может только мастер, который забрал группу: <@${request.masterId}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = await getRequestsChannel(interaction.guild);
  if (!channel) {
    return interaction.reply({ content: 'Канал поиска мастеров не найден.', flags: MessageFlags.Ephemeral });
  }

  const previousMasterId = request.masterId;
  operationLocks.add(requestId);
  let message;

  try {
    request.status = 'returning';
    await interaction.deferUpdate();

    const republishedRequest = {
      ...request,
      status: 'open',
      masterId: null,
      claimedAt: undefined,
      republishedAt: new Date().toISOString(),
    };

    try {
      message = await channel.send({
        content: `<@&${config.DUNGEON_MASTER_ROLE_ID}>`,
        embeds: [createRequestEmbed(republishedRequest)],
        components: [createClaimButton(requestId)],
        allowedMentions: { roles: [config.DUNGEON_MASTER_ROLE_ID] },
      });
    } catch (error) {
      request.status = 'claimed';
      request.masterId = previousMasterId;
      saveState();

      console.error('Не удалось вернуть объявление в поиск мастера:', error);

      await interaction.followUp({
        content: 'Не удалось опубликовать объявление заново. Оно осталось закреплено за тобой.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);

      return;
    }

    request.status = 'open';
    request.masterId = null;
    delete request.claimedAt;
    request.republishedAt = republishedRequest.republishedAt;
    request.messageId = message.id;
    saveState();
  } finally {
    operationLocks.delete(requestId);
  }

  await interaction.message.edit({
    content: `<@${request.playerId}>`,
    embeds: [createRequestEmbed({ ...request, masterId: previousMasterId }, 'returned')],
    components: [],
    allowedMentions: { parse: [] },
  }).catch((error) => console.error('Не удалось закрыть старое объявление:', error));

  const player = await client.users.fetch(request.playerId).catch(() => null);
  if (player) {
    await player.send('↩️ Мастер вернул вашу группу в поиск. Объявление снова опубликовано для мастеров.').catch(() => null);
  }

  await auditLog(client, '↩️ Группа возвращена в поиск мастера', [
    { name: 'Вернул', value: userField(interaction.user) },
    { name: 'Игрок', value: `<@${request.playerId}>` },
    { name: 'Новая публикация', value: message.url },
  ]);
}

async function closePlayerMasterRequest(interaction, requestId) {
  const request = state.requests[requestId];

  if (!request || request.playerId !== interaction.user.id) {
    return interaction.reply({ content: 'Это объявление тебе не принадлежит.', flags: MessageFlags.Ephemeral });
  }

  if (operationLocks.has(requestId) || request.status === 'returning') {
    return interaction.reply({
      content: 'Объявление сейчас обновляется. Подожди несколько секунд и попробуй снова.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!['open', 'claimed'].includes(request.status)) {
    return interaction.reply({ content: 'Это объявление уже закрыто.', flags: MessageFlags.Ephemeral });
  }

  operationLocks.add(requestId);

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const previousMasterId = request.masterId;
    request.status = 'closed';
    request.closedAt = new Date().toISOString();
    saveState();

    const channel = await client.channels.fetch(request.channelId).catch(() => null);
    const message = channel?.isTextBased()
      ? await channel.messages.fetch(request.messageId).catch(() => null)
      : null;

    if (message) {
      await message.edit({
        content: `<@${request.playerId}>`,
        embeds: [createRequestEmbed({ ...request, masterId: previousMasterId }, 'closed')],
        components: [],
        allowedMentions: { parse: [] },
      }).catch((error) => console.error('Не удалось закрыть сообщение поиска мастера:', error));
    }

    if (previousMasterId) {
      const master = await client.users.fetch(previousMasterId).catch(() => null);
      if (master) {
        await master.send(`🔒 <@${request.playerId}> закрыл объявление о поиске мастера.`).catch(() => null);
      }
    }

    await auditLog(client, '🔒 Игрок закрыл поиск мастера', [
      { name: 'Игрок', value: userField(interaction.user) },
      { name: 'Мастер', value: previousMasterId ? `<@${previousMasterId}>` : 'Не был найден' },
    ]);

    return interaction.editReply('✅ Поиск мастера закрыт. Теперь ты можешь создать новое объявление.');
  } finally {
    operationLocks.delete(requestId);
  }
}

module.exports = {
  hasActivePlayerMasterRequest,
  submitPlayerMasterRequest,
  claimPlayerMasterRequest,
  returnPlayerMasterRequest,
  showPlayerMasterRequest,
  closePlayerMasterRequest,
};
