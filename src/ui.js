const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');

function createPanel() {
  const embed = new EmbedBuilder()
    .setTitle('Панель мастера')
    .setDescription('Выберите действие. Бот создаст временный тикет для настройки.')
    .setColor(0x6d4aff);

  const pollButton = new ButtonBuilder()
    .setCustomId('create_week_poll')
    .setLabel('Создать голосование')
    .setEmoji('📅')
    .setStyle(ButtonStyle.Primary);

  const eventButton = new ButtonBuilder()
    .setCustomId('create_event')
    .setLabel('Создать событие')
    .setEmoji('🎲')
    .setStyle(ButtonStyle.Success);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(pollButton, eventButton),
    ],
  };
}

function createRoleSelectMenu(guild) {
  const roles = guild.roles.cache
    .filter((role) => !role.managed && role.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      label: role.name.slice(0, 100),
      value: role.id,
    }))
    .slice(0, 25);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_role')
      .setPlaceholder('Выберите роль для тега')
      .addOptions(roles)
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
      label:
        i === 0
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

    options.push({
      label: `${value}:00`,
      value,
    });
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

  const titleInput = new TextInputBuilder()
    .setCustomId('event_title')
    .setLabel('Название события')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Хроники Разлома — сессия 12');

  const durationInput = new TextInputBuilder()
    .setCustomId('event_duration')
    .setLabel('Длительность в часах')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('4');

  const descriptionInput = new TextInputBuilder()
    .setCustomId('event_description')
    .setLabel('Описание')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Краткое описание игры.');

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(durationInput),
    new ActionRowBuilder().addComponents(descriptionInput)
  );

  return modal;
}

function createSkipCoverButton() {
  const button = new ButtonBuilder()
    .setCustomId('skip_event_cover')
    .setLabel('Создать без обложки')
    .setEmoji('➡️')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(button);
}

module.exports = {
  createPanel,
  createRoleSelectMenu,
  createWeekSelectMenu,
  createEventChannelSelectMenu,
  createDaySelectMenu,
  createTimeSelectMenu,
  createPollExtraTextModal,
  createEventDetailsModal,
  createSkipCoverButton,
};