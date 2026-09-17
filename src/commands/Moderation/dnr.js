import { SlashCommandBuilder } from 'discord.js';
import { DnrService } from '../../services/moderation/dnrService.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dnr')
    .setDescription('Tell a user not to ping or reply to you')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User who must not ping or reply to you')
        .setRequired(true)
    ),
  category: 'moderation',

  async execute(interaction) {
    const target = interaction.options.getUser('user', true);
    const protectedUser = interaction.user;

    if (target.id === protectedUser.id) {
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

    const protectedUsers = await DnrService.addDnr(
      interaction.guildId,
      target.id,
      protectedUser.id,
    );

    await interaction.reply({
      content: `🚫 <@${target.id}> — do not ping or reply to <@${protectedUser.id}>.\nIf you do, you will receive a DNR warning. **3 warnings = 5 minute timeout.**`,
      allowedMentions: {
        users: [target.id, protectedUser.id],
      },
    });

    logger.info(
      `DNR created in ${interaction.guildId}: ${target.id} must not ping/reply to ${protectedUser.id} (${protectedUsers.length} protected users for target)`,
    );
  },
};