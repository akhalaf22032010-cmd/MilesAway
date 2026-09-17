import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DnrService } from '../../services/moderation/dnrService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dnr')
    .setDescription('DNR a user or view your DNR list')
    .setDefaultMemberPermissions(null)
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('DNR a user in this server')
        .addUserOption(option =>
          option.setName('user').setDescription('User to DNR').setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('list').setDescription('Show the users you have DNRd')
    ),
  category: 'moderation',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const ids = await DnrService.getDnredUsers(interaction.guildId, interaction.user.id);
      const users = [];

      for (const id of ids) {
        const user = await interaction.client.users.fetch(id).catch(() => null);
        users.push(user ? `• ${user.username} (<@${id}>)` : `• <@${id}>`);
      }

      const embed = new EmbedBuilder()
        .setTitle('DNR LIST')
        .setDescription(users.length ? users.join('\n') : 'You have not DNRd anyone.')
        .setColor(0x2b2d31);

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const target = interaction.options.getUser('user', true);

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: '❌ You cannot DNR yourself.',
        ephemeral: true,
      });
      return;
    }

    if (target.bot) {
      await interaction.reply({
        content: '❌ You cannot DNR a bot.',
        ephemeral: true,
      });
      return;
    }

    const existing = await DnrService.getDnredUsers(interaction.guildId, interaction.user.id);
    if (existing.includes(target.id)) {
      await interaction.reply({
        content: `ℹ️ You have already DNRd ${target.username}.`,
        ephemeral: true,
      });
      return;
    }

    await DnrService.addDnr(interaction.guildId, interaction.user.id, target.id);

    const embed = new EmbedBuilder()
      .setTitle(`YOU DNRED ${target.username.toUpperCase()}`)
      .setDescription(`**Undnr them for them to ping/reply to you**`)
      .setColor(0x2b2d31);

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
