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

const RULES_ACKNOWLEDGE_PREFIX = 'rules_acknowledge:';

function createRulesAcknowledgeButton(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RULES_ACKNOWLEDGE_PREFIX}${userId}`)
      .setLabel('Ознакомлен с правилами')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );
}

function createWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setTitle('Добро пожаловать!')
    .setDescription(
      [
        `${member}, рады видеть тебя на сервере.`,
        '',
        'Перед тем как продолжить, пожалуйста, ознакомься с правилами сервера.',
        'Когда будешь готов — нажми кнопку ниже, и я выдам тебе роль участника.',
      ].join('\n')
    )
    .setColor(0x6d4aff);
}

async function sendWelcomeMessage(member) {
  try {
    if (member.user.bot) return;

    const channel = await client.channels
      .fetch(config.SYSTEM_TEXT_CHANNEL_ID)
      .catch(() => null);

    if (!channel?.isTextBased()) {
      console.error('Канал system_text не найден или не является текстовым.');
      return;
    }

    await channel.send({
      content: `${member}`,
      embeds: [createWelcomeEmbed(member)],
      components: [createRulesAcknowledgeButton(member.id)],
      allowedMentions: {
        users: [member.id],
      },
    });
  } catch (error) {
    console.error('Ошибка приветствия нового пользователя:', error);
  }
}

async function acknowledgeRules(interaction) {
  const targetUserId = interaction.customId.replace(RULES_ACKNOWLEDGE_PREFIX, '');

  if (interaction.user.id !== targetUserId) {
    return interaction.reply({
      content: 'Эта кнопка предназначена для другого пользователя.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.guild) {
    return interaction.reply({
      content: 'Эта кнопка работает только внутри сервера.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);

  if (!member) {
    return interaction.reply({
      content: 'Не смог найти тебя на сервере.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (member.roles.cache.has(config.GUILD_MEMBER_ROLE_ID)) {
    await disableWelcomeButton(interaction).catch(() => null);

    return interaction.reply({
      content: 'Ты уже ознакомился с правилами, роль участника уже выдана.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await member.roles.add(
    config.GUILD_MEMBER_ROLE_ID,
    'Пользователь подтвердил ознакомление с правилами'
  );

  await disableWelcomeButton(interaction).catch(() => null);

  await auditLog(client, '✅ Пользователь ознакомился с правилами', [
    { name: 'Пользователь', value: userField(interaction.user) },
    { name: 'Выдана роль', value: `<@&${config.GUILD_MEMBER_ROLE_ID}>` },
  ]);

  return interaction.reply({
    content: `Готово! Я выдал тебе роль <@&${config.GUILD_MEMBER_ROLE_ID}>.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: {
      roles: [],
    },
  });
}

async function disableWelcomeButton(interaction) {
  const disabledButton = createRulesAcknowledgeButton(interaction.user.id);
  disabledButton.components[0]
    .setDisabled(true)
    .setLabel('Правила подтверждены');

  await interaction.message.edit({
    components: [disabledButton],
  });
}

function isRulesAcknowledgeButton(interaction) {
  return interaction.isButton()
    && interaction.customId.startsWith(RULES_ACKNOWLEDGE_PREFIX);
}

module.exports = {
  acknowledgeRules,
  isRulesAcknowledgeButton,
  sendWelcomeMessage,
};
