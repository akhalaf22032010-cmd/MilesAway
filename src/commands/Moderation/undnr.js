import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DnrService } from '../../services/moderation/dnrService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('undnr')
    .setDescription('Remove your DNR from a user')
    .setDefaultMemberPermissions('0')
    .addUserOption(option =>
      option.setName('user').setDescription('User to UNDNR').setRequired(true)
    ),
  category: 'moderation',

  async execute(interaction) {
    const target = interaction.options.getUser('user', true);
    const removed = await DnrService.removeDnr(interaction.guildId, interaction.user.id, target.id);

    if (!removed) {
      await interaction.reply({
        content: `ℹ️ You have not DNRd ${target.username}.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`YOU UNDNRED ${target.username.toUpperCase()}`)
      .setDescription('**They can now ping/reply to you**')
      .setColor(0x2b2d31);

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
