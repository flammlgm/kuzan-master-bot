const { EmbedBuilder, MessageFlags } = require('discord.js');

const { config } = require('./config');
const { sessions } = require('./sessions');
const {
  createPanel,
  createRoleSelectMenu,
  createWeekSelectMenu,
  createEventChannelSelectMenu,
  createDaySelectMenu,
  createTimeSelectMenu,
  createPollExtraTextModal,
  createEventDetailsModal,
  createSkipCoverButton,
  createCampaignNameModal,
  createAddTextChannelModal,
  createAddVoiceChannelModal,
  createCampaignBuilderButtons,
} = require('./ui');
const {
  createTicket,
  createTicketIntroEmbed,
  deleteTicketLater,
} = require('./tickets');
const { publishPoll } = require('./polls');
const {
  publishEventFromInteraction,
  publishEventFromMessage,
} = require('./events');
const {
  buildCampaignSummary,
  createCampaign,
} = require('./campaigns');

function isDungeonMaster(interaction) {
  return interaction.member.roles.cache.has(config.DUNGEON_MASTER_ROLE_ID);
}

function createCampaignPreviewEmbed(campaign) {
  return new EmbedBuilder()
    .setTitle('🏰 Черновик кампании')
    .setDescription(
      [
        `**Название:** ${campaign.title}`,
        '',
        '**Каналы:**',
        buildCampaignSummary(campaign),
      ].join('\n')
    )
    .setColor(0x6d4aff);
}

async function startPollFlow(interaction) {
  const ticket = await createTicket(interaction);

  const session = sessions.get(interaction.user.id);
  session.mode = 'poll';
  sessions.set(interaction.user.id, session);

  await ticket.send({
    content: `<@${interaction.user.id}>`,
    embeds: [
      createTicketIntroEmbed(
        '📅 Создание голосования',
        'Шаг 1: выберите роль, которую нужно тегнуть в голосовании.'
      ),
    ],
    components: [createRoleSelectMenu(interaction.guild)],
  });

  return interaction.reply({
    content: `Тикет открыт: <#${ticket.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

async function startEventFlow(interaction) {
  const ticket = await createTicket(interaction);

  const session = sessions.get(interaction.user.id);
  session.mode = 'event';
  sessions.set(interaction.user.id, session);

  await ticket.send({
    content: `<@${interaction.user.id}>`,
    embeds: [
      createTicketIntroEmbed(
        '🎲 Создание события',
        'Шаг 1: выберите роль, которую нужно тегнуть при публикации события.'
      ),
    ],
    components: [createRoleSelectMenu(interaction.guild)],
  });

  return interaction.reply({
    content: `Тикет открыт: <#${ticket.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

async function startCampaignFlow(interaction) {
  const ticket = await createTicket(interaction);

  const session = sessions.get(interaction.user.id);
  session.mode = 'campaign';
  sessions.set(interaction.user.id, session);

  await interaction.reply({
    content: `Тикет открыт: <#${ticket.id}>`,
    flags: MessageFlags.Ephemeral,
  });

  return interaction.followUp({
    content: 'Открой тикет и заполни название кампании.',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panel') {
        return interaction.reply(createPanel());
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'create_week_poll') {
        if (!isDungeonMaster(interaction)) {
          return interaction.reply({
            content: 'Эта кнопка доступна только мастерам.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return startPollFlow(interaction);
      }

      if (interaction.customId === 'create_event') {
        if (!isDungeonMaster(interaction)) {
          return interaction.reply({
            content: 'Эта кнопка доступна только мастерам.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return startEventFlow(interaction);
      }

      if (interaction.customId === 'create_campaign') {
        if (!isDungeonMaster(interaction)) {
          return interaction.reply({
            content: 'Эта кнопка доступна только мастерам.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const ticket = await createTicket(interaction);

        const session = sessions.get(interaction.user.id);
        session.mode = 'campaign';
        sessions.set(interaction.user.id, session);

        await ticket.send({
          content: `<@${interaction.user.id}> нажми кнопку ниже, чтобы начать создание кампании.`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: 'campaign_open_name_modal',
                  label: 'Ввести название кампании',
                  style: 1,
                  emoji: { name: '🏰' },
                },
              ],
            },
          ],
        });

        return interaction.reply({
          content: `Тикет открыт: <#${ticket.id}>`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'campaign_open_name_modal') {
        return interaction.showModal(createCampaignNameModal());
      }

      if (interaction.customId === 'campaign_add_text_channel') {
        return interaction.showModal(createAddTextChannelModal());
      }

      if (interaction.customId === 'campaign_add_voice_channel') {
        return interaction.showModal(createAddVoiceChannelModal());
      }

      if (interaction.customId === 'campaign_confirm_create') {
        const session = sessions.get(interaction.user.id);

        if (!session?.campaign) {
          return interaction.reply({
            content: 'Черновик кампании не найден. Начни заново.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return createCampaign(interaction, session);
      }

      if (interaction.customId === 'campaign_cancel') {
        const session = sessions.get(interaction.user.id);

        if (session?.ticketChannelId) {
          await deleteTicketLater(session.ticketChannelId, 1000);
        }

        sessions.delete(interaction.user.id);

        return interaction.reply({
          content: 'Создание кампании отменено.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'skip_event_cover') {
        const session = sessions.get(interaction.user.id);

        if (!session?.event) {
          return interaction.reply({
            content: 'Сессия события потерялась. Начни заново через панель.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return publishEventFromInteraction(interaction, session, null);
      }
    }

    if (interaction.isChannelSelectMenu()) {
      const session = sessions.get(interaction.user.id);

      if (!session) {
        return interaction.reply({
          content: 'Сессия потерялась. Начни заново через панель.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'event_channel_select') {
        session.eventChannelId = interaction.values[0];
        sessions.set(interaction.user.id, session);

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎲 Создание события')
              .setDescription('Шаг 3: выберите день проведения.')
              .setColor(0x6d4aff),
          ],
          components: [createDaySelectMenu()],
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      const session = sessions.get(interaction.user.id);

      if (!session) {
        return interaction.reply({
          content: 'Сессия потерялась. Начни заново через панель.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'select_role') {
        session.roleId = interaction.values[0];
        sessions.set(interaction.user.id, session);

        if (session.mode === 'event') {
          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle('🎲 Создание события')
                .setDescription('Шаг 2: выберите голосовой канал, где будет проходить событие.')
                .setColor(0x6d4aff),
            ],
            components: [createEventChannelSelectMenu()],
          });
        }

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('📅 Создание голосования')
              .setDescription('Шаг 2: выберите неделю для голосования.')
              .setColor(0x6d4aff),
          ],
          components: [createWeekSelectMenu()],
        });
      }

      if (interaction.customId === 'select_poll_week') {
        session.week = interaction.values[0];
        sessions.set(interaction.user.id, session);

        return interaction.showModal(createPollExtraTextModal());
      }

      if (interaction.customId === 'event_day_select') {
        session.selectedDayOffset = Number(interaction.values[0]);
        sessions.set(interaction.user.id, session);

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎲 Создание события')
              .setDescription('Шаг 4: выберите время начала.')
              .setColor(0x6d4aff),
          ],
          components: [createTimeSelectMenu()],
        });
      }

      if (interaction.customId === 'event_time_select') {
        session.selectedHour = Number(interaction.values[0]);
        sessions.set(interaction.user.id, session);

        return interaction.showModal(createEventDetailsModal());
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'campaign_name_modal') {
        const session = sessions.get(interaction.user.id);

        if (!session) {
          return interaction.reply({
            content: 'Сессия потерялась. Начни заново через панель.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const title = interaction.fields.getTextInputValue('campaign_title');

        session.mode = 'campaign';
        session.campaign = {
          title,
          channels: [],
        };

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          embeds: [createCampaignPreviewEmbed(session.campaign)],
          components: createCampaignBuilderButtons(),
        });
      }

      if (interaction.customId === 'add_text_channel_modal') {
        const session = sessions.get(interaction.user.id);

        if (!session?.campaign) {
          return interaction.reply({
            content: 'Черновик кампании не найден.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const name = interaction.fields.getTextInputValue('channel_name');
        const topic = interaction.fields.getTextInputValue('channel_topic') || '';

        session.campaign.channels.push({
          type: 'text',
          name,
          topic,
        });

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          embeds: [createCampaignPreviewEmbed(session.campaign)],
          components: createCampaignBuilderButtons(),
        });
      }

      if (interaction.customId === 'add_voice_channel_modal') {
        const session = sessions.get(interaction.user.id);

        if (!session?.campaign) {
          return interaction.reply({
            content: 'Черновик кампании не найден.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const name = interaction.fields.getTextInputValue('channel_name');

        session.campaign.channels.push({
          type: 'voice',
          name,
        });

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          embeds: [createCampaignPreviewEmbed(session.campaign)],
          components: createCampaignBuilderButtons(),
        });
      }

      if (interaction.customId === 'poll_extra_text_modal') {
        const session = sessions.get(interaction.user.id);

        if (!session?.roleId || !session?.week) {
          return interaction.reply({
            content: 'Не хватает данных. Начни заново через панель.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const extraText = interaction.fields.getTextInputValue('extra_text') || '';

        return publishPoll(interaction, session, extraText);
      }

      if (interaction.customId === 'event_details_modal') {
        const session = sessions.get(interaction.user.id);

        if (!session?.roleId) {
          return interaction.reply({
            content: 'Не хватает данных. Начни заново через панель.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const title = interaction.fields.getTextInputValue('event_title');
        const durationRaw = interaction.fields.getTextInputValue('event_duration');
        const description =
          interaction.fields.getTextInputValue('event_description') || '';

        const durationHours = Number(durationRaw);

        if (
          !session.eventChannelId ||
          typeof session.selectedDayOffset !== 'number' ||
          typeof session.selectedHour !== 'number' ||
          !durationHours ||
          durationHours <= 0
        ) {
          return interaction.reply({
            content: 'Не хватает данных для события или неверно указана длительность.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() + session.selectedDayOffset);
        startDate.setHours(session.selectedHour, 0, 0, 0);

        const endDate = new Date(
          startDate.getTime() + durationHours * 60 * 60 * 1000
        );

        session.event = {
          title,
          description,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          channelId: session.eventChannelId,
        };

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          content: [
            'Теперь загрузи обложку события прямо сюда в тикет одним изображением.',
            '',
            'Или нажми кнопку ниже, чтобы создать событие без обложки.',
          ].join('\n'),
          components: [createSkipCoverButton()],
        });
      }
    }
  } catch (error) {
    console.error('Ошибка interaction:', error);

    try {
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: 'Что-то сломалось. Смотри терминал.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: 'Что-то сломалось. Смотри терминал.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (replyError) {
      console.error('Не удалось ответить interaction:', replyError);
    }
  }
}

async function handleMessage(message) {
  try {
    if (message.author.bot) return;

    const session = sessions.get(message.author.id);

    if (!session?.event) return;
    if (message.channel.id !== session.ticketChannelId) return;

    const attachment = message.attachments.first();

    if (!attachment) return;

    const isImage = attachment.contentType?.startsWith('image/');

    if (!isImage) {
      return message.reply(
        'Это не похоже на изображение. Загрузи PNG/JPG/WebP.'
      );
    }

    const response = await fetch(attachment.url);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    return publishEventFromMessage(message, session, imageBuffer);
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
    return message.reply('Не смог обработать сообщение. Смотри терминал.');
  }
}

module.exports = {
  handleInteraction,
  handleMessage,
};