import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { clearDnr, removeDnr } from '../../services/moderation/dnrService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('undnr')
    .setDescription('Remove a DNR from a user')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription('UNDNR a user')
        .addUserOption((option) =>
          option.setName('user').setDescription('The user to UNDNR').setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('all')
        .setDescription('Clear everyone from your DNR list'),
    )
    .setDMPermission(false),
  category: 'moderation',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'all') {
      clearDnr(interaction.guild.id, interaction.user.id);
      return InteractionHelper.safeReply(interaction, {
        embeds: [{
          title: '🧹 You cleared your DNR list',
          description: '**Your dnr list is now 0 people**',
        }],
      });
    }

    const target = interaction.options.getUser('user', true);
    removeDnr(interaction.guild.id, interaction.user.id, target.id);

    return InteractionHelper.safeReply(interaction, {
      embeds: [{
        title: '↩️ You UNDNRED ' + target.username,
        description: '**They can now ping/reply to you**',
      }],
    });
  },
};
