const { EmbedBuilder, MessageFlags } = require('discord.js');
const { client } = require('./client');
const { config } = require('./config');
const { sessions } = require('./sessions');
const { deleteTicketLater } = require('./tickets');
const { auditLog, userField } = require('./utils/auditLogger');

function getWeekLabel(value) {
  return {
    current: 'текущую неделю',
    next: 'следующую неделю',
    next2: 'неделю через две',
  }[value] || 'выбранную неделю';
}

async function publishPoll(interaction, session, extraText) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const scheduleChannel = await client.channels.fetch(
    config.GAME_SCHEDULE_CHANNEL_ID
  );

  const weekLabel = getWeekLabel(session.week);

  const embed = new EmbedBuilder()
    .setTitle('📅 Голосование на игру')
    .setDescription(
      [
        `<@&${session.roleId}>`,
        '',
        `Голосование на **${weekLabel}**.`,
        '',
        'Выберите все дни, в которые можете играть:',
        '',
        '1️⃣ — Понедельник',
        '2️⃣ — Вторник',
        '3️⃣ — Среда',
        '4️⃣ — Четверг',
        '5️⃣ — Пятница',
        '6️⃣ — Суббота',
        '7️⃣ — Воскресенье',
        extraText ? `\n**Комментарий мастера:**\n${extraText}` : '',
      ].join('\n')
    )
    .setColor(0x6d4aff)
    .setFooter({ text: `Создал: ${interaction.user.username}` })
    .setTimestamp();

  const message = await scheduleChannel.send({
    content: `<@&${session.roleId}>`,
    embeds: [embed],
    allowedMentions: {
      roles: [session.roleId],
    },
  });

  for (const reaction of ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣']) {
    await message.react(reaction);
  }

  await auditLog(client, '📅 Создано голосование', [
    { name: 'Мастер', value: userField(interaction.user) },
    { name: 'Роль для тега', value: `<@&${session.roleId}>` },
    { name: 'Неделя', value: weekLabel },
    { name: 'Канал публикации', value: `<#${config.GAME_SCHEDULE_CHANNEL_ID}>` },
    { name: 'Комментарий', value: extraText || '—' },
  ]);

  const ticketChannelId = session.ticketChannelId;

  sessions.delete(interaction.user.id);

  await interaction.editReply({
    content: `Голосование создано в <#${config.GAME_SCHEDULE_CHANNEL_ID}>. Тикет удалится через 10 секунд.`,
  });

  await deleteTicketLater(ticketChannelId);
}

module.exports = { publishPoll };