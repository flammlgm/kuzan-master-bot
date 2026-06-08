const { ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');

const { config } = require('./config');
const { sessions } = require('./sessions');

const {
  createPanel,
  createPlayerPanel,
  createRoleSelectMenu,
  createCampaignRoleSelectMenu,
  createCampaignUserSelectMenu,
  createMasterCampaignRoleSelectMenu,
  createEditableCampaignCategorySelectMenu,
  createCampaignEditButtons,
  createCampaignChildChannelSelectMenu,
  createRenameCategoryModal,
  createRenameChannelModal,
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
  createMasterApplicationModal,
  createFeedbackModal,
  createRecruitmentBasicModal,
  createRecruitmentDetailsModal,
  createRecruitmentSelectRows,
  createRecruitmentCoverButtons,
} = require('./ui');

const {
  createTicket,
  createTicketIntroEmbed,
  deleteTicketLater,
} = require('./tickets');

const { publishPoll } = require('./polls');
const { publishEventFromInteraction, publishEventFromMessage } = require('./events');
const { buildCampaignSummary, createCampaign, applyCampaignRole } = require('./campaigns');
const { showMyRoles, showServerHelp } = require('./playerPanel');
const { acknowledgeRules, isRulesAcknowledgeButton } = require('./onboarding');

const {
  submitMasterApplication,
  approveMasterApplication,
  rejectMasterApplication,
  acknowledgeFeedback,
} = require('./applications');

const {
  submitRecruitmentForModeration,
  approveRecruitment,
  rejectRecruitment,
  showActiveRecruitments,
  showMyRecruitments,
  selectMyRecruitment,
  closeMyRecruitment,
  setRecruitmentFormatTag,
  setRecruitmentPaymentTag,
} = require('./recruitment');

function isDungeonMaster(interaction) {
  return interaction.member.roles.cache.has(config.DUNGEON_MASTER_ROLE_ID);
}

function createCampaignPreviewEmbed(campaign) {
  return new EmbedBuilder()
    .setTitle('🏰 Черновик кампании')
    .setDescription(
      [
        `**Категория:** ${campaign.title}`,
        `**Роль:** ${campaign.roleName}`,
        '',
        '**Каналы:**',
        buildCampaignSummary(campaign),
      ].join('\n')
    )
    .setColor(0x6d4aff);
}

function createRecruitmentPreviewText(recruitment) {
  return [
    `**Название:** ${recruitment.title || '—'}`,
    `**Система:** ${recruitment.system || '—'}`,
    `**Формат:** ${recruitment.formatTag || '—'}`,
    `**Оплата:** ${recruitment.paymentTag || '—'}`,
    `**Игроки:** ${recruitment.players || '—'}`,
    `**Возраст:** ${recruitment.age || '—'}`,
    `**Даты:** ${recruitment.dates || '—'}`,
    '',
    'Выбери формат и оплату. После этого нажми **Заполнить описание**.',
  ].join('\n');
}

async function startPollFlow(interaction) {
  const ticket = await createTicket(interaction);
  const session = sessions.get(interaction.user.id);

  session.mode = 'poll';
  sessions.set(interaction.user.id, session);

  await ticket.send({
    content: `<@${interaction.user.id}>`,
    embeds: [createTicketIntroEmbed('📅 Создание голосования', 'Шаг 1: выберите роль, которую нужно тегнуть.')],
    components: [createRoleSelectMenu(interaction.guild)],
  });

  return interaction.reply({ content: `Тикет открыт: <#${ticket.id}>`, flags: MessageFlags.Ephemeral });
}

async function startEventFlow(interaction) {
  const ticket = await createTicket(interaction);
  const session = sessions.get(interaction.user.id);

  session.mode = 'event';
  sessions.set(interaction.user.id, session);

  await ticket.send({
    content: `<@${interaction.user.id}>`,
    embeds: [createTicketIntroEmbed('🎲 Создание события', 'Шаг 1: выберите роль для тега.')],
    components: [createRoleSelectMenu(interaction.guild)],
  });

  return interaction.reply({ content: `Тикет открыт: <#${ticket.id}>`, flags: MessageFlags.Ephemeral });
}

async function startCampaignFlow(interaction) {
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

  return interaction.reply({ content: `Тикет открыт: <#${ticket.id}>`, flags: MessageFlags.Ephemeral });
}


function getEditableCampaignContext(interaction, session) {
  if (!session?.editMasterRoleId || !session?.editCategoryId) return null;

  const masterRole = interaction.guild.roles.cache.get(session.editMasterRoleId);
  const category = interaction.guild.channels.cache.get(session.editCategoryId);

  if (!masterRole?.name.startsWith(config.MASTER_CAMPAIGN_ROLE_PREFIX)) return null;
  if (!interaction.member.roles.cache.has(masterRole.id)) return null;
  if (!category || category.type !== ChannelType.GuildCategory) return null;
  if (!category.permissionOverwrites.cache.has(masterRole.id)) return null;

  return { masterRole, category };
}

function createCampaignEditEmbed(category) {
  const channels = category.children.cache
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((channel) => `${channel.isVoiceBased() ? '🔊' : '#'} <#${channel.id}>`);

  return new EmbedBuilder()
    .setTitle('🛠️ Редактирование кампании')
    .setDescription([
      `**Категория:** ${category.name}`,
      '',
      '**Текущие каналы:**',
      channels.length ? channels.join('\n') : 'Каналов пока нет.',
    ].join('\n'))
    .setColor(0x6d4aff);
}

async function startCampaignEditFlow(interaction) {
  const roleMenu = createMasterCampaignRoleSelectMenu(interaction.guild, interaction.member);

  if (!roleMenu) {
    return interaction.reply({
      content: `У тебя нет ролей кампаний мастера с префиксом \`${config.MASTER_CAMPAIGN_ROLE_PREFIX}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const ticket = await createTicket(interaction);
  const session = sessions.get(interaction.user.id);

  session.mode = 'campaign_edit';
  sessions.set(interaction.user.id, session);

  await ticket.send({
    content: `<@${interaction.user.id}>`,
    embeds: [createTicketIntroEmbed('🛠️ Редактирование кампании', 'Шаг 1: выберите мастерскую роль кампании.')],
    components: [roleMenu],
  });

  return interaction.reply({ content: `Тикет открыт: <#${ticket.id}>`, flags: MessageFlags.Ephemeral });
}

async function startCampaignPlayersFlow(interaction, action) {
  const roleMenu = createCampaignRoleSelectMenu(interaction.guild, interaction.member);

  if (!roleMenu) {
    return interaction.reply({
      content: `Для тебя нет доступных кампаний. Нужна парная роль мастера с префиксом \`${config.MASTER_CAMPAIGN_ROLE_PREFIX}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const ticket = await createTicket(interaction);
  const session = sessions.get(interaction.user.id);

  session.mode = 'campaign_manage_players';
  session.manageAction = action;
  sessions.set(interaction.user.id, session);

  await ticket.send({
    content: `<@${interaction.user.id}>`,
    embeds: [
      createTicketIntroEmbed(
        action === 'add' ? '👤 Добавление игроков' : '🚪 Удаление игроков',
        action === 'add'
          ? 'Шаг 1: выберите роль кампании, которую нужно выдать.'
          : 'Шаг 1: выберите роль кампании, которую нужно снять.'
      ),
    ],
    components: [roleMenu],
  });

  return interaction.reply({ content: `Тикет открыт: <#${ticket.id}>`, flags: MessageFlags.Ephemeral });
}

async function startRecruitmentFlow(interaction) {
  const ticket = await createTicket(interaction);
  const session = sessions.get(interaction.user.id);

  session.mode = 'recruitment';
  session.recruitment = {};
  sessions.set(interaction.user.id, session);

  await ticket.send({
    content: `<@${interaction.user.id}> нажми кнопку ниже, чтобы заполнить объявление о наборе.`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: 'recruitment_open_basic',
            label: 'Заполнить объявление',
            style: 1,
            emoji: { name: '📢' },
          },
        ],
      },
    ],
  });

  return interaction.reply({ content: `Тикет открыт: <#${ticket.id}>`, flags: MessageFlags.Ephemeral });
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panel') {
        return interaction.reply(createPanel());
      }

      if (interaction.commandName === 'playerpanel') {
        return interaction.reply(createPlayerPanel());
      }
    }

    if (isRulesAcknowledgeButton(interaction)) {
      return acknowledgeRules(interaction);
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'player_find_game') return showActiveRecruitments(interaction);
      if (interaction.customId === 'player_apply_master') return interaction.showModal(createMasterApplicationModal());
      if (interaction.customId === 'player_my_roles') return showMyRoles(interaction);
      if (interaction.customId === 'player_help') return showServerHelp(interaction);

      if (interaction.customId === 'create_week_poll') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return startPollFlow(interaction);
      }

      if (interaction.customId === 'create_event') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return startEventFlow(interaction);
      }

      if (interaction.customId === 'create_recruitment') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return startRecruitmentFlow(interaction);
      }

      if (interaction.customId === 'my_recruitments') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return showMyRecruitments(interaction);
      }

      if (interaction.customId === 'my_recruitment_close') return closeMyRecruitment(interaction);
      if (interaction.customId === 'my_recruitment_set_oneshot') return setRecruitmentFormatTag(interaction, 'ваншот');
      if (interaction.customId === 'my_recruitment_set_campaign') return setRecruitmentFormatTag(interaction, 'кампания');
      if (interaction.customId === 'my_recruitment_set_free') return setRecruitmentPaymentTag(interaction, 'бесплатная_игра');
      if (interaction.customId === 'my_recruitment_set_paid') return setRecruitmentPaymentTag(interaction, 'платная_игра');

      if (interaction.customId === 'create_campaign') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return startCampaignFlow(interaction);
      }

      if (interaction.customId === 'campaign_add_players') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return startCampaignPlayersFlow(interaction, 'add');
      }

      if (interaction.customId === 'campaign_remove_players') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return startCampaignPlayersFlow(interaction, 'remove');
      }

      if (interaction.customId === 'campaign_edit') {
        if (!isDungeonMaster(interaction)) return interaction.reply({ content: 'Эта кнопка доступна только мастерам.', flags: MessageFlags.Ephemeral });
        return startCampaignEditFlow(interaction);
      }

      if (interaction.customId === 'campaign_open_name_modal') return interaction.showModal(createCampaignNameModal());
      if (interaction.customId === 'campaign_add_text_channel') return interaction.showModal(createAddTextChannelModal());
      if (interaction.customId === 'campaign_add_voice_channel') return interaction.showModal(createAddVoiceChannelModal());

      if (interaction.customId === 'campaign_edit_rename_category') return interaction.showModal(createRenameCategoryModal());
      if (interaction.customId === 'campaign_edit_add_text_channel') return interaction.showModal(createAddTextChannelModal());
      if (interaction.customId === 'campaign_edit_add_voice_channel') return interaction.showModal(createAddVoiceChannelModal());

      if (interaction.customId === 'campaign_edit_rename_channel') {
        const session = sessions.get(interaction.user.id);
        const context = getEditableCampaignContext(interaction, session);

        if (!context) return interaction.reply({ content: 'Нет доступа к выбранной кампании.', flags: MessageFlags.Ephemeral });

        const channelMenu = createCampaignChildChannelSelectMenu(context.category, 'campaign_edit_rename_channel_select');

        if (!channelMenu) return interaction.reply({ content: 'В выбранной кампании пока нет каналов.', flags: MessageFlags.Ephemeral });

        return interaction.reply({
          content: 'Выбери канал этой кампании для переименования.',
          components: [channelMenu],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'campaign_edit_delete_channel') {
        const session = sessions.get(interaction.user.id);
        const context = getEditableCampaignContext(interaction, session);

        if (!context) return interaction.reply({ content: 'Нет доступа к выбранной кампании.', flags: MessageFlags.Ephemeral });

        const channelMenu = createCampaignChildChannelSelectMenu(context.category, 'campaign_edit_delete_channel_select');

        if (!channelMenu) return interaction.reply({ content: 'В выбранной кампании пока нет каналов.', flags: MessageFlags.Ephemeral });

        return interaction.reply({
          content: 'Выбери канал этой кампании для удаления.',
          components: [channelMenu],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'campaign_confirm_create') {
        const session = sessions.get(interaction.user.id);
        if (!session?.campaign) return interaction.reply({ content: 'Черновик кампании не найден.', flags: MessageFlags.Ephemeral });
        return createCampaign(interaction, session);
      }

      if (interaction.customId === 'campaign_edit_cancel') {
        const session = sessions.get(interaction.user.id);
        if (session?.ticketChannelId) await deleteTicketLater(session.ticketChannelId, 1000);
        sessions.delete(interaction.user.id);
        return interaction.reply({ content: 'Редактирование кампании завершено.', flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'campaign_cancel') {
        const session = sessions.get(interaction.user.id);
        if (session?.ticketChannelId) await deleteTicketLater(session.ticketChannelId, 1000);
        sessions.delete(interaction.user.id);
        return interaction.reply({ content: 'Создание кампании отменено.', flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'recruitment_open_basic') return interaction.showModal(createRecruitmentBasicModal());

      if (interaction.customId === 'recruitment_open_details') {
        const session = sessions.get(interaction.user.id);

        if (!session?.recruitment) {
          return interaction.reply({ content: 'Черновик объявления не найден.', flags: MessageFlags.Ephemeral });
        }

        if (!session.recruitment.formatTag || !session.recruitment.paymentTag) {
          return interaction.reply({
            content: 'Сначала выбери формат и оплату.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.showModal(createRecruitmentDetailsModal());
      }

      if (interaction.customId === 'skip_recruitment_cover') {
        const session = sessions.get(interaction.user.id);
        if (!session?.recruitment) return interaction.reply({ content: 'Черновик объявления не найден.', flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return submitRecruitmentForModeration(interaction, session, null);
      }

      if (interaction.customId === 'skip_event_cover') {
        const session = sessions.get(interaction.user.id);
        if (!session?.event) return interaction.reply({ content: 'Сессия события потерялась.', flags: MessageFlags.Ephemeral });
        return publishEventFromInteraction(interaction, session, null);
      }

      if (interaction.customId.startsWith('master_application_approve_')) {
        return approveMasterApplication(interaction, interaction.customId.replace('master_application_approve_', ''));
      }

      if (interaction.customId.startsWith('master_application_reject_')) {
        const userId = interaction.customId.replace('master_application_reject_', '');
        return interaction.showModal(createFeedbackModal(`master_application_reject_modal_${userId}`));
      }

      if (interaction.customId.startsWith('recruitment_approve_')) {
        return approveRecruitment(interaction, interaction.customId.replace('recruitment_approve_', ''));
      }

      if (interaction.customId.startsWith('recruitment_reject_')) {
        const recruitmentId = interaction.customId.replace('recruitment_reject_', '');
        return interaction.showModal(createFeedbackModal(`recruitment_reject_modal_${recruitmentId}`));
      }

      if (interaction.customId.startsWith('feedback_ack_')) {
        return acknowledgeFeedback(interaction, interaction.customId.replace('feedback_ack_', ''));
      }
    }

    if (interaction.isUserSelectMenu()) {
      const session = sessions.get(interaction.user.id);
      if (!session) return interaction.reply({ content: 'Сессия потерялась.', flags: MessageFlags.Ephemeral });

      if (interaction.customId === 'campaign_manage_users_select') {
        session.manageUserIds = interaction.values;
        sessions.set(interaction.user.id, session);
        return applyCampaignRole(interaction, session);
      }
    }

    if (interaction.isChannelSelectMenu()) {
      const session = sessions.get(interaction.user.id);
      if (!session) return interaction.reply({ content: 'Сессия потерялась.', flags: MessageFlags.Ephemeral });

      if (interaction.customId === 'event_channel_select') {
        session.eventChannelId = interaction.values[0];
        sessions.set(interaction.user.id, session);

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle('🎲 Создание события').setDescription('Шаг 3: выберите день проведения.').setColor(0x6d4aff)],
          components: [createDaySelectMenu()],
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      const session = sessions.get(interaction.user.id);

      if (interaction.customId === 'my_recruitment_select') {
        return selectMyRecruitment(interaction, interaction.values[0]);
      }

      if (!session) return interaction.reply({ content: 'Сессия потерялась.', flags: MessageFlags.Ephemeral });

      if (interaction.customId === 'recruitment_format_select') {
        session.recruitment.formatTag = interaction.values[0];
        sessions.set(interaction.user.id, session);

        return interaction.update({
          content: createRecruitmentPreviewText(session.recruitment),
          components: createRecruitmentSelectRows(session.recruitment),
        });
      }

      if (interaction.customId === 'recruitment_payment_select') {
        session.recruitment.paymentTag = interaction.values[0];
        sessions.set(interaction.user.id, session);

        return interaction.update({
          content: createRecruitmentPreviewText(session.recruitment),
          components: createRecruitmentSelectRows(session.recruitment),
        });
      }

      if (interaction.customId === 'campaign_edit_rename_channel_select') {
        const context = getEditableCampaignContext(interaction, session);
        const channel = interaction.guild.channels.cache.get(interaction.values[0]);

        if (!context || !channel || channel.parentId !== context.category.id) {
          return interaction.reply({ content: 'Этот канал не относится к выбранной кампании или у тебя нет доступа.', flags: MessageFlags.Ephemeral });
        }

        session.editChannelId = channel.id;
        sessions.set(interaction.user.id, session);
        return interaction.showModal(createRenameChannelModal());
      }

      if (interaction.customId === 'campaign_edit_delete_channel_select') {
        const context = getEditableCampaignContext(interaction, session);
        const channel = interaction.guild.channels.cache.get(interaction.values[0]);

        if (!context || !channel || channel.parentId !== context.category.id) {
          return interaction.reply({ content: 'Этот канал не относится к выбранной кампании или у тебя нет доступа.', flags: MessageFlags.Ephemeral });
        }

        await channel.delete(`Campaign channel deleted by ${interaction.user.tag}`);
        return interaction.update({ content: `Канал **${channel.name}** удалён.`, components: [] });
      }

      if (interaction.customId === 'campaign_edit_master_role_select') {
        session.editMasterRoleId = interaction.values[0];
        sessions.set(interaction.user.id, session);

        const categoryMenu = createEditableCampaignCategorySelectMenu(interaction.guild, session.editMasterRoleId);

        if (!categoryMenu) {
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle('🛠️ Редактирование кампании').setDescription('Для этой мастерской роли не найдены категории кампаний.').setColor(0x6d4aff)],
            components: [],
          });
        }

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle('🛠️ Редактирование кампании').setDescription('Шаг 2: выберите категорию кампании.').setColor(0x6d4aff)],
          components: [categoryMenu],
        });
      }

      if (interaction.customId === 'campaign_edit_category_select') {
        session.editCategoryId = interaction.values[0];
        sessions.set(interaction.user.id, session);

        const context = getEditableCampaignContext(interaction, session);

        if (!context) {
          return interaction.reply({ content: 'Нет доступа к выбранной кампании.', flags: MessageFlags.Ephemeral });
        }

        return interaction.update({
          embeds: [createCampaignEditEmbed(context.category)],
          components: createCampaignEditButtons(),
        });
      }

      if (interaction.customId === 'campaign_manage_role_select') {
        session.manageRoleId = interaction.values[0];
        sessions.set(interaction.user.id, session);

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle(session.manageAction === 'add' ? '👤 Добавление игроков' : '🚪 Удаление игроков').setDescription('Шаг 2: выберите игроков.').setColor(0x6d4aff)],
          components: [createCampaignUserSelectMenu()],
        });
      }

      if (interaction.customId === 'select_role') {
        session.roleId = interaction.values[0];
        sessions.set(interaction.user.id, session);

        if (session.mode === 'event') {
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle('🎲 Создание события').setDescription('Шаг 2: выберите голосовой канал.').setColor(0x6d4aff)],
            components: [createEventChannelSelectMenu()],
          });
        }

        return interaction.update({
          embeds: [new EmbedBuilder().setTitle('📅 Создание голосования').setDescription('Шаг 2: выберите неделю.').setColor(0x6d4aff)],
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
          embeds: [new EmbedBuilder().setTitle('🎲 Создание события').setDescription('Шаг 4: выберите время начала.').setColor(0x6d4aff)],
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
      if (interaction.customId === 'master_application_modal') return submitMasterApplication(interaction);

      if (interaction.customId.startsWith('master_application_reject_modal_')) {
        const userId = interaction.customId.replace('master_application_reject_modal_', '');
        const reason = interaction.fields.getTextInputValue('feedback_reason');
        return rejectMasterApplication(interaction, userId, reason);
      }

      if (interaction.customId.startsWith('recruitment_reject_modal_')) {
        const recruitmentId = interaction.customId.replace('recruitment_reject_modal_', '');
        const reason = interaction.fields.getTextInputValue('feedback_reason');
        return rejectRecruitment(interaction, recruitmentId, reason);
      }

      if (interaction.customId === 'recruitment_basic_modal') {
        const session = sessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: 'Сессия потерялась.', flags: MessageFlags.Ephemeral });

        session.recruitment = {
          title: interaction.fields.getTextInputValue('recruitment_title'),
          system: interaction.fields.getTextInputValue('recruitment_system'),
          players: interaction.fields.getTextInputValue('recruitment_players'),
          age: interaction.fields.getTextInputValue('recruitment_age') || '—',
          dates: interaction.fields.getTextInputValue('recruitment_dates'),
        };

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          content: createRecruitmentPreviewText(session.recruitment),
          components: createRecruitmentSelectRows(session.recruitment),
        });
      }

      if (interaction.customId === 'recruitment_details_modal') {
        const session = sessions.get(interaction.user.id);
        if (!session?.recruitment) return interaction.reply({ content: 'Черновик объявления не найден.', flags: MessageFlags.Ephemeral });

        session.recruitment.requirements = interaction.fields.getTextInputValue('recruitment_requirements') || '—';
        session.recruitment.description = interaction.fields.getTextInputValue('recruitment_description');
        session.awaitingRecruitmentCover = true;

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          content: [
            'Теперь загрузи обложку объявления прямо сюда в тикет одним изображением.',
            '',
            'Или нажми кнопку ниже, чтобы отправить без обложки.',
          ].join('\n'),
          components: [createRecruitmentCoverButtons()],
        });
      }

      if (interaction.customId === 'campaign_edit_rename_category_modal') {
        const session = sessions.get(interaction.user.id);
        const context = getEditableCampaignContext(interaction, session);

        if (!context) return interaction.reply({ content: 'Нет доступа к выбранной кампании.', flags: MessageFlags.Ephemeral });

        await context.category.setName(interaction.fields.getTextInputValue('category_name'), `Campaign category renamed by ${interaction.user.tag}`);

        return interaction.reply({
          content: `Категория переименована в **${context.category.name}**.`,
          embeds: [createCampaignEditEmbed(context.category)],
          components: createCampaignEditButtons(),
        });
      }

      if (interaction.customId === 'campaign_edit_rename_channel_modal') {
        const session = sessions.get(interaction.user.id);
        const context = getEditableCampaignContext(interaction, session);
        const channel = interaction.guild.channels.cache.get(session?.editChannelId);

        if (!context || !channel || channel.parentId !== context.category.id) {
          return interaction.reply({ content: 'Нет доступа к выбранному каналу.', flags: MessageFlags.Ephemeral });
        }

        const newName = channel.isVoiceBased()
          ? interaction.fields.getTextInputValue('channel_name')
          : interaction.fields.getTextInputValue('channel_name').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 90);

        await channel.setName(newName, `Campaign channel renamed by ${interaction.user.tag}`);
        delete session.editChannelId;
        sessions.set(interaction.user.id, session);

        return interaction.reply({
          content: `Канал переименован в <#${channel.id}>.`,
          embeds: [createCampaignEditEmbed(context.category)],
          components: createCampaignEditButtons(),
        });
      }

      if (interaction.customId === 'campaign_name_modal') {
        const session = sessions.get(interaction.user.id);
        if (!session) return interaction.reply({ content: 'Сессия потерялась.', flags: MessageFlags.Ephemeral });

        session.mode = 'campaign';
        session.campaign = {
          title: interaction.fields.getTextInputValue('campaign_title'),
          roleName: interaction.fields.getTextInputValue('campaign_role_name'),
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

        if (session?.mode === 'campaign_edit') {
          const context = getEditableCampaignContext(interaction, session);

          if (!context) return interaction.reply({ content: 'Нет доступа к выбранной кампании.', flags: MessageFlags.Ephemeral });

          const channel = await interaction.guild.channels.create({
            name: interaction.fields.getTextInputValue('channel_name').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 90),
            type: ChannelType.GuildText,
            parent: context.category.id,
            topic: interaction.fields.getTextInputValue('channel_topic') || undefined,
            reason: `Campaign text channel created by ${interaction.user.tag}`,
          });

          return interaction.reply({
            content: `Текстовый канал <#${channel.id}> создан.`,
            embeds: [createCampaignEditEmbed(context.category)],
            components: createCampaignEditButtons(),
          });
        }

        if (!session?.campaign) return interaction.reply({ content: 'Черновик кампании не найден.', flags: MessageFlags.Ephemeral });

        session.campaign.channels.push({
          type: 'text',
          name: interaction.fields.getTextInputValue('channel_name'),
          topic: interaction.fields.getTextInputValue('channel_topic') || '',
        });

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          embeds: [createCampaignPreviewEmbed(session.campaign)],
          components: createCampaignBuilderButtons(),
        });
      }

      if (interaction.customId === 'add_voice_channel_modal') {
        const session = sessions.get(interaction.user.id);

        if (session?.mode === 'campaign_edit') {
          const context = getEditableCampaignContext(interaction, session);

          if (!context) return interaction.reply({ content: 'Нет доступа к выбранной кампании.', flags: MessageFlags.Ephemeral });

          const channel = await interaction.guild.channels.create({
            name: interaction.fields.getTextInputValue('channel_name'),
            type: ChannelType.GuildVoice,
            parent: context.category.id,
            reason: `Campaign voice channel created by ${interaction.user.tag}`,
          });

          return interaction.reply({
            content: `Голосовой канал <#${channel.id}> создан.`,
            embeds: [createCampaignEditEmbed(context.category)],
            components: createCampaignEditButtons(),
          });
        }

        if (!session?.campaign) return interaction.reply({ content: 'Черновик кампании не найден.', flags: MessageFlags.Ephemeral });

        session.campaign.channels.push({
          type: 'voice',
          name: interaction.fields.getTextInputValue('channel_name'),
        });

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          embeds: [createCampaignPreviewEmbed(session.campaign)],
          components: createCampaignBuilderButtons(),
        });
      }

      if (interaction.customId === 'poll_extra_text_modal') {
        const session = sessions.get(interaction.user.id);
        if (!session?.roleId || !session?.week) return interaction.reply({ content: 'Не хватает данных.', flags: MessageFlags.Ephemeral });

        return publishPoll(interaction, session, interaction.fields.getTextInputValue('extra_text') || '');
      }

      if (interaction.customId === 'event_details_modal') {
        const session = sessions.get(interaction.user.id);
        if (!session?.roleId) return interaction.reply({ content: 'Не хватает данных.', flags: MessageFlags.Ephemeral });

        const durationHours = Number(interaction.fields.getTextInputValue('event_duration'));

        if (!session.eventChannelId || typeof session.selectedDayOffset !== 'number' || typeof session.selectedHour !== 'number' || !durationHours || durationHours <= 0) {
          return interaction.reply({ content: 'Не хватает данных для события или неверно указана длительность.', flags: MessageFlags.Ephemeral });
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() + session.selectedDayOffset);
        startDate.setHours(session.selectedHour, 0, 0, 0);

        const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

        session.event = {
          title: interaction.fields.getTextInputValue('event_title'),
          description: interaction.fields.getTextInputValue('event_description') || '',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          channelId: session.eventChannelId,
        };

        sessions.set(interaction.user.id, session);

        return interaction.reply({
          content: ['Теперь загрузи обложку события прямо сюда.', '', 'Или нажми кнопку ниже, чтобы создать без обложки.'].join('\n'),
          components: [createSkipCoverButton()],
        });
      }
    }
  } catch (error) {
    console.error('Ошибка interaction:', error);

    try {
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: 'Что-то сломалось. Смотри терминал.', flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: 'Что-то сломалось. Смотри терминал.', flags: MessageFlags.Ephemeral });
    } catch (replyError) {
      console.error('Не удалось ответить interaction:', replyError);
    }
  }
}

async function handleMessage(message) {
  try {
    if (message.author.bot) return;

    const session = sessions.get(message.author.id);

    if (!session) return;
    if (message.channel.id !== session.ticketChannelId) return;

    const attachment = message.attachments.first();
    if (!attachment) return;

    const isImage = attachment.contentType?.startsWith('image/');

    if (!isImage) {
      return message.reply('Это не похоже на изображение. Загрузи PNG/JPG/WebP.');
    }

    const response = await fetch(attachment.url);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    if (session?.event) {
      return publishEventFromMessage(message, session, imageBuffer);
    }

    if (session?.recruitment && session.awaitingRecruitmentCover) {
      return submitRecruitmentForModeration(message, session, imageBuffer);
    }
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
    return message.reply('Не смог обработать сообщение. Смотри терминал.');
  }
}

module.exports = {
  handleInteraction,
  handleMessage,
};
