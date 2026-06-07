const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');

const { config } = require('./config');

function createPanel() {
  const embed = new EmbedBuilder()
    .setTitle('Панель мастера')
    .setDescription('Выберите действие. Бот создаст временный тикет для настройки.')
    .setColor(0x6d4aff);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('create_week_poll').setLabel('Создать голосование').setEmoji('📅').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('create_event').setLabel('Создать событие').setEmoji('🎲').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('create_recruitment').setLabel('Создать объявление').setEmoji('📢').setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('create_campaign').setLabel('Создать кампанию').setEmoji('🏰').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('campaign_add_players').setLabel('Добавить игроков').setEmoji('👤').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('campaign_remove_players').setLabel('Удалить игроков').setEmoji('🚪').setStyle(ButtonStyle.Danger)
      ),
    ],
  };
}

function createPlayerPanel() {
  const embed = new EmbedBuilder()
    .setTitle('Панель игрока')
    .setDescription(
      [
        'Здесь можно найти игру, подать заявку на мастера и посмотреть свои роли.',
        '',
        '🎲 **Найти игру** — показывает активные наборы игроков.',
        '🧙 **Хочу стать мастером** — отправляет заявку владельцу сервера.',
        '📌 **Мои роли и кампании** — показывает твои роли и кампании.',
        '❓ **Помощь** — краткая навигация по серверу.',
      ].join('\n')
    )
    .setColor(0x6d4aff);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_find_game').setLabel('Найти игру').setEmoji('🎲').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('player_apply_master').setLabel('Хочу стать мастером').setEmoji('🧙').setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_my_roles').setLabel('Мои роли и кампании').setEmoji('📌').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('player_help').setLabel('Помощь').setEmoji('❓').setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function createRoleSelectMenu(guild) {
  const roles = guild.roles.cache
    .filter((role) => !role.managed && role.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ label: role.name.slice(0, 100), value: role.id }))
    .slice(0, 25);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_role')
      .setPlaceholder('Выберите роль для тега')
      .addOptions(roles)
  );
}

function createCampaignRoleSelectMenu(guild) {
  const roles = guild.roles.cache
    .filter((role) => {
      if (role.managed) return false;
      if (role.name === '@everyone') return false;
      return role.name.startsWith(config.CAMPAIGN_ROLE_PREFIX);
    })
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ label: role.name.slice(0, 100), value: role.id }))
    .slice(0, 25);

  if (!roles.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('campaign_manage_role_select')
      .setPlaceholder('Выберите роль кампании')
      .addOptions(roles)
  );
}

function createCampaignUserSelectMenu() {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('campaign_manage_users_select')
      .setPlaceholder('Выберите игроков')
      .setMinValues(1)
      .setMaxValues(10)
  );
}

function createWeekSelectMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_poll_week')
      .setPlaceholder('Выберите неделю')
      .addOptions([
        { label: 'Текущая неделя', value: 'current' },
        { label: 'Следующая неделя', value: 'next' },
        { label: 'Через 2 недели', value: 'next2' },
      ])
  );
}

function createEventChannelSelectMenu() {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('event_channel_select')
      .setPlaceholder('Выберите голосовой канал')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
  );
}

function createDaySelectMenu() {
  const options = [];

  for (let i = 0; i <= 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    options.push({
      label: i === 0
        ? `Сегодня — ${date.toLocaleDateString('ru-RU')}`
        : i === 1
        ? `Завтра — ${date.toLocaleDateString('ru-RU')}`
        : date.toLocaleDateString('ru-RU'),
      value: String(i),
    });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('event_day_select')
      .setPlaceholder('Выберите день')
      .addOptions(options)
  );
}

function createTimeSelectMenu() {
  const options = [];

  for (let hour = 0; hour <= 23; hour++) {
    const value = String(hour).padStart(2, '0');
    options.push({ label: `${value}:00`, value });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('event_time_select')
      .setPlaceholder('Выберите время')
      .addOptions(options)
  );
}

function createPollExtraTextModal() {
  const modal = new ModalBuilder()
    .setCustomId('poll_extra_text_modal')
    .setTitle('Дополнительный текст');

  const input = new TextInputBuilder()
    .setCustomId('extra_text')
    .setLabel('Текст к объявлению')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Например: выберите дни до среды.');

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  return modal;
}

function createEventDetailsModal() {
  const modal = new ModalBuilder()
    .setCustomId('event_details_modal')
    .setTitle('Создание события');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('event_title').setLabel('Название события').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Хроники Разлома — сессия 12')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('event_duration').setLabel('Длительность в часах').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('4')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('event_description').setLabel('Описание').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Краткое описание игры.')
    )
  );

  return modal;
}

function createSkipCoverButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('skip_event_cover')
      .setLabel('Создать без обложки')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
  );
}

function createCampaignNameModal() {
  const modal = new ModalBuilder()
    .setCustomId('campaign_name_modal')
    .setTitle('Создание кампании');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('campaign_title').setLabel('Название категории / кампании').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: Хроники Разлома')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('campaign_role_name').setLabel(`Название роли: ${config.CAMPAIGN_ROLE_PREFIX}...`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(`${config.CAMPAIGN_ROLE_PREFIX}shard_binder`)
    )
  );

  return modal;
}

function createAddTextChannelModal() {
  const modal = new ModalBuilder()
    .setCustomId('add_text_channel_modal')
    .setTitle('Добавить текстовый канал');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('channel_name').setLabel('Название канала').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 📜 chronicle_of_fragments')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('channel_topic').setLabel('Описание канала').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Например: важная информация по кампании.')
    )
  );

  return modal;
}

function createAddVoiceChannelModal() {
  const modal = new ModalBuilder()
    .setCustomId('add_voice_channel_modal')
    .setTitle('Добавить голосовой канал');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('channel_name').setLabel('Название голосового канала').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Например: 🔊 voice_main')
    )
  );

  return modal;
}

function createCampaignBuilderButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('campaign_add_text_channel').setLabel('Добавить текстовый').setEmoji('➕').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('campaign_add_voice_channel').setLabel('Добавить голосовой').setEmoji('🔊').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('campaign_confirm_create').setLabel('Создать кампанию').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('campaign_cancel').setLabel('Отменить').setEmoji('❌').setStyle(ButtonStyle.Danger)
    ),
  ];
}

function createMasterApplicationModal() {
  const modal = new ModalBuilder()
    .setCustomId('master_application_modal')
    .setTitle('Заявка на мастера');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('master_about').setLabel('Коротко о себе').setStyle(TextInputStyle.Paragraph).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('master_experience').setLabel('Опыт вождения / игры').setStyle(TextInputStyle.Paragraph).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('master_campaign').setLabel('Что хочешь вести').setStyle(TextInputStyle.Paragraph).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('master_schedule').setLabel('Формат и примерное расписание').setStyle(TextInputStyle.Paragraph).setRequired(true)
    )
  );

  return modal;
}

function createFeedbackModal(customId) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Причина отказа');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('feedback_reason')
        .setLabel('Обратная связь')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Напиши, почему заявка отклонена.')
    )
  );

  return modal;
}

function createRecruitmentBasicModal() {
  const modal = new ModalBuilder()
    .setCustomId('recruitment_basic_modal')
    .setTitle('Объявление о наборе');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('recruitment_title').setLabel('Название').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('recruitment_system').setLabel('Система').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('D&D 5e / авторская / Pathfinder / другое')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('recruitment_players').setLabel('Количество игроков').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('4-5 игроков')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('recruitment_age').setLabel('Возрастное ограничение').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('16+ / 18+ / нет')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('recruitment_dates').setLabel('Примерные даты / расписание').setStyle(TextInputStyle.Paragraph).setRequired(true)
    )
  );

  return modal;
}

function createRecruitmentDetailsModal() {
  const modal = new ModalBuilder()
    .setCustomId('recruitment_details_modal')
    .setTitle('Описание набора');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('recruitment_requirements')
        .setLabel('Требования к игрокам')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Опыт, микрофон, пунктуальность, стиль игры.')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('recruitment_description')
        .setLabel('Описание игры')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('О чём игра, какой вайб, кого ждёшь.')
    )
  );

  return modal;
}

function createRecruitmentFormatSelect(value) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('recruitment_format_select')
      .setPlaceholder('Выберите формат')
      .addOptions([
        { label: 'Ваншот', value: 'ваншот', emoji: '🏠', default: value === 'ваншот' },
        { label: 'Кампания', value: 'кампания', emoji: '🏰', default: value === 'кампания' },
      ])
  );
}

function createRecruitmentPaymentSelect(value) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('recruitment_payment_select')
      .setPlaceholder('Выберите оплату')
      .addOptions([
        { label: 'Бесплатная игра', value: 'бесплатная_игра', emoji: '🧾', default: value === 'бесплатная_игра' },
        { label: 'Платная игра', value: 'платная_игра', emoji: '💵', default: value === 'платная_игра' },
      ])
  );
}

function createRecruitmentSelectRows(recruitment = {}) {
  return [
    createRecruitmentFormatSelect(recruitment.formatTag),
    createRecruitmentPaymentSelect(recruitment.paymentTag),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('recruitment_open_details')
        .setLabel('Заполнить описание')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function createRecruitmentCoverButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('skip_recruitment_cover')
      .setLabel('Без обложки')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  createPanel,
  createPlayerPanel,
  createRoleSelectMenu,
  createCampaignRoleSelectMenu,
  createCampaignUserSelectMenu,
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
};