const {
  MessageFlags,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  ChannelType,
} = require('discord.js');

const { client } = require('./client');
const { config } = require('./config');
const { sessions } = require('./sessions');
const { deleteTicketLater } = require('./tickets');

async function createDiscordEvent({
  guild,
  title,
  description,
  startDate,
  endDate,
  imageBuffer,
  channelId,
}) {
  const eventChannel = await guild.channels.fetch(channelId);

  const entityType =
    eventChannel.type === ChannelType.GuildStageVoice
      ? GuildScheduledEventEntityType.StageInstance
      : GuildScheduledEventEntityType.Voice;

  return guild.scheduledEvents.create({
    name: title,
    description: description || 'Игровое событие.',
    scheduledStartTime: startDate,
    scheduledEndTime: endDate,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType,
    channel: channelId,
    image: imageBuffer || undefined,
  });
}

async function publishEventFromInteraction(interaction, session, imageBuffer = null) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const result = await publishEventCore({
    guild: interaction.guild,
    user: interaction.user,
    session,
    imageBuffer,
  });

  sessions.delete(interaction.user.id);

  await interaction.editReply({
    content: `Событие создано и опубликовано в <#${config.GAME_SCHEDULE_CHANNEL_ID}>. Тикет удалится через 10 секунд.`,
  });

  await deleteTicketLater(session.ticketChannelId);

  return result;
}

async function publishEventFromMessage(message, session, imageBuffer) {
  const result = await publishEventCore({
    guild: message.guild,
    user: message.author,
    session,
    imageBuffer,
  });

  sessions.delete(message.author.id);

  await message.reply(
    `Событие создано и опубликовано в <#${config.GAME_SCHEDULE_CHANNEL_ID}>. Тикет удалится через 10 секунд.`
  );

  await deleteTicketLater(session.ticketChannelId);

  return result;
}

async function publishEventCore({ guild, user, session, imageBuffer }) {
  const scheduleChannel = await client.channels.fetch(
    config.GAME_SCHEDULE_CHANNEL_ID
  );

  const startDate = new Date(session.event.startDate);
  const endDate = new Date(session.event.endDate);

  const event = await createDiscordEvent({
    guild,
    title: session.event.title,
    description: session.event.description,
    startDate,
    endDate,
    imageBuffer,
    channelId: session.event.channelId,
  });

  const eventUrl = `https://discord.com/events/${guild.id}/${event.id}`;

  await scheduleChannel.send({
    content: [
      `<@&${session.roleId}>`,
      '',
      eventUrl,
    ].join('\n'),
    allowedMentions: {
      roles: [session.roleId],
    },
  });

  return event;
}

module.exports = {
  publishEventFromInteraction,
  publishEventFromMessage,
};