import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { addDnr, getDnrList } from '../../services/moderation/dnrService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dnr')
    .setDescription('DNR a user so they cannot ping or reply to you')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription('DNR a user')
        .addUserOption((option) =>
          option.setName('user').setDescription('The user to DNR').setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show the people you DNRd'),
    )
    .setDMPermission(false),
  category: 'moderation',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const ids = getDnrList(interaction.guild.id, interaction.user.id);
      if (ids.length === 0) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [{
            title: '📋 Your DNR List',
            description: '**Your DNR list is empty.**',
          }],
          flags: MessageFlags.Ephemeral,
        });
      }

      const mentions = ids.map((id, index) => `${index + 1}. <@${id}>`).join('\n');
      return InteractionHelper.safeReply(interaction, {
        embeds: [{
          title: '📋 Your DNR List',
          description: mentions,
        }],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getUser('user', true);
    if (target.id === interaction.user.id) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [{
          title: '❌ You cannot DNR yourself',
          description: 'Choose another user.',
        }],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (target.bot) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [{
          title: '❌ You cannot DNR a bot',
          description: 'Choose a server member instead.',
        }],
        flags: MessageFlags.Ephemeral,
      });
    }

    addDnr(interaction.guild.id, interaction.user.id, target.id);

    return InteractionHelper.safeReply(interaction, {
      embeds: [{
        title: '📌 You DNRED ' + target.username,
        description: '**Undnr them for them to ping/reply to you**',
      }],
    });
  },
};
