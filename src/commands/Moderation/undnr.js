import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { clearDnr, removeDnr } from '../../services/moderation/dnrService.js';

function dnrEmbed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description);
}

export default {
  data: new SlashCommandBuilder()
    .setName('undnr')
    .setDescription('Remove a DNR from a user')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Use all to clear your entire DNR list')
        .setRequired(false)
        .addChoices({ name: 'all', value: 'all' }),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to UNDNR').setRequired(false),
    )
    .setDMPermission(false),
  category: 'moderation',

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const target = interaction.options.getUser('user');

    if (action === 'all') {
      clearDnr(interaction.guild.id, interaction.user.id);
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('🧹 You cleared your DNR list', '**Your dnr list is now 0 people**')],
      });
    }

    if (!target) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('❌ Missing user', 'Use `/undnr @user` or `/undnr all`.')],
      });
    }

    removeDnr(interaction.guild.id, interaction.user.id, target.id);

    return InteractionHelper.safeReply(interaction, {
      embeds: [dnrEmbed(`↩️ You UNDNRED ${target.username}`, '**They can now ping/reply to you**')],
    });
  },
};
