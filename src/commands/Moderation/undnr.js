import { SlashCommandBuilder } from 'discord.js';
import { DnrService } from '../../services/moderation/dnrService.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('undnr')
    .setDescription('Remove a DNR from a user')
    .setDefaultMemberPermissions(null)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to remove the DNR from')
        .setRequired(true)
    ),
  category: 'moderation',

  async execute(interaction) {
    const target = interaction.options.getUser('user', true);
    const protectedUser = interaction.user;

    if (target.id === protectedUser.id) {
      await interaction.reply({ content: '❌ You cannot remove a DNR from yourself.', ephemeral: true });
      return;
    }

    const removed = await DnrService.removeDnr(interaction.guildId, target.id, protectedUser.id);

    if (!removed) {
      await interaction.reply({
        content: `ℹ️ <@${target.id}> is not Dnred by you.`,
        allowedMentions: { users: [target.id] },
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `# ${target.username.toUpperCase()} UNDNRED\n\n**${target.username} has been un-Dnred by ${protectedUser.username}**`,
      allowedMentions: { users: [target.id] },
    });

    logger.info(`DNR removed in ${interaction.guildId}: ${target.id} is no longer DNR'd by ${protectedUser.id}`);
  },
};
