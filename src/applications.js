const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { client } = require('./client');
const { config } = require('./config');
const { createPrivateTicket, deleteTicketLater } = require('./tickets');
const { auditLog, userField } = require('./utils/auditLogger');

async function submitMasterApplication(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!config.OWNER_USER_ID) {
    return interaction.editReply('OWNER_USER_ID не указан в .env.');
  }

  const about = interaction.fields.getTextInputValue('master_about');
  const experience = interaction.fields.getTextInputValue('master_experience');
  const campaign = interaction.fields.getTextInputValue('master_campaign');
  const schedule = interaction.fields.getTextInputValue('master_schedule');

  const ticket = await createPrivateTicket(interaction.guild, {
    userIds: [interaction.user.id, config.OWNER_USER_ID],
    prefix: 'master-request',
  });

  const embed = new EmbedBuilder()
    .setTitle('🧙 Заявка на мастера')
    .setColor(0x6d4aff)
    .addFields(
      { name: 'Пользователь', value: userField(interaction.user) },
      { name: 'О себе', value: about || '—' },
      { name: 'Опыт', value: experience || '—' },
      { name: 'Что хочет вести', value: campaign || '—' },
      { name: 'Расписание / формат', value: schedule || '—' }
    )
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`master_application_approve_${interaction.user.id}`)
      .setLabel('Одобрить')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`master_application_reject_${interaction.user.id}`)
      .setLabel('Отклонить')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  await ticket.send({
    content: `<@${config.OWNER_USER_ID}> <@${interaction.user.id}>`,
    embeds: [embed],
    components: [buttons],
  });

  await auditLog(client, '🧙 Новая заявка на мастера', [
    { name: 'Пользователь', value: userField(interaction.user) },
    { name: 'Тикет', value: `<#${ticket.id}>` },
  ]);

  return interaction.editReply(`Заявка отправлена. Тикет: <#${ticket.id}>`);
}

async function approveMasterApplication(interaction, userId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.user.id !== config.OWNER_USER_ID) {
    return interaction.editReply('Одобрять заявки может только владелец сервера.');
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);

  if (!member) {
    return interaction.editReply('Пользователь не найден.');
  }

  await member.roles.add(config.DUNGEON_MASTER_ROLE_ID);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feedback_ack_${userId}`)
      .setLabel('Ознакомлен с обратной связью')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({
    content: [
      `<@${userId}>`,
      '',
      '✅ Твоя заявка на мастера **одобрена**.',
      'Тебе выдана роль мастера.',
      '',
      'Нажми кнопку ниже, когда ознакомишься. После этого тикет закроется.',
    ].join('\n'),
    components: [row],
  });

  await auditLog(client, '✅ Заявка на мастера одобрена', [
    { name: 'Одобрил', value: userField(interaction.user) },
    { name: 'Пользователь', value: `${member.user.tag}\nID: \`${member.id}\`` },
  ]);

  return interaction.editReply('Заявка одобрена.');
}

async function rejectMasterApplication(interaction, userId, reason) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.user.id !== config.OWNER_USER_ID) {
    return interaction.editReply('Отклонять заявки может только владелец сервера.');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feedback_ack_${userId}`)
      .setLabel('Ознакомлен с обратной связью')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({
    content: [
      `<@${userId}>`,
      '',
      '❌ Твоя заявка на мастера **отклонена**.',
      '',
      '**Причина:**',
      reason || 'Причина не указана.',
      '',
      'Нажми кнопку ниже, когда ознакомишься. После этого тикет закроется.',
    ].join('\n'),
    components: [row],
  });

  await auditLog(client, '❌ Заявка на мастера отклонена', [
    { name: 'Отклонил', value: userField(interaction.user) },
    { name: 'Пользователь', value: `<@${userId}>` },
    { name: 'Причина', value: reason || '—' },
  ]);

  return interaction.editReply('Заявка отклонена.');
}

async function acknowledgeFeedback(interaction, userId) {
  if (interaction.user.id !== userId && interaction.user.id !== config.OWNER_USER_ID) {
    return interaction.reply({
      content: 'Эта кнопка не для тебя.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    content: 'Тикет закроется через 10 секунд.',
    flags: MessageFlags.Ephemeral,
  });

  await deleteTicketLater(interaction.channel.id, 10000);
}

module.exports = {
  submitMasterApplication,
  approveMasterApplication,
  rejectMasterApplication,
  acknowledgeFeedback,
};