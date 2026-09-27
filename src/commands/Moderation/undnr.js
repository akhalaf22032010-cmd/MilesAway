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
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option.setName('action').setDescription('Use all to clear your entire DNR list').setRequired(false).addChoices({ name: 'all', value: 'all' }))
    .addUserOption((option) => option.setName('user').setDescription('The user to UNDNR').setRequired(false))
    .setDMPermission(false),
  category: 'moderation',

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const target = interaction.options.getUser('user');

    if (action === 'all') {
      await clearDnr(interaction.client, interaction.guild.id, interaction.user.id);
      return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('', '# 🧹 You cleared your DNR list\n\n**You now have 0 people DNRD**')] });
    }

    if (!target) {
      return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('❌ Missing user', 'Use `/undnr @user` or `/undnr all`.')] });
    }

    await removeDnr(interaction.client, interaction.guild.id, interaction.user.id, target.id);
    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    const displayName = targetMember?.displayName || target.displayName || target.username;

    return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed(`# ↩️ You UNDNRD ${displayName}`, '**They can now ping/reply to you**')] });
  },
};
