import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { addDnr, getDnrList } from '../../services/moderation/dnrService.js';

function dnrEmbed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description);
}

export default {
  data: new SlashCommandBuilder()
    .setName('dnr')
    .setDescription('DNR a user or view your DNR list')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Use list to view your DNR list')
        .setRequired(false)
        .addChoices({ name: 'list', value: 'list' }),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to DNR').setRequired(false),
    )
    .setDMPermission(false),
  category: 'moderation',

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const target = interaction.options.getUser('user');

    if (action === 'list') {
      const ids = getDnrList(interaction.guild.id, interaction.user.id);
      if (ids.length === 0) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [dnrEmbed('📋 Your DNR List', '**Your DNR list is empty.**')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const mentions = ids.map((id, index) => `${index + 1}. <@${id}>`).join('\n');
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('📋 Your DNR List', mentions)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!target) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('❌ Missing user', 'Use `/dnr @user` to DNR someone, or `/dnr list` to view your list.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (target.id === interaction.user.id) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('❌ You cannot DNR yourself', 'Choose another user.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (target.bot) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('❌ You cannot DNR a bot', 'Choose a server member instead.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    addDnr(interaction.guild.id, interaction.user.id, target.id);

    return InteractionHelper.safeReply(interaction, {
      embeds: [dnrEmbed(`📌 You DNRED ${target.username}`, '**Undnr them for them to ping/reply to you**')],
    });
  },
};
