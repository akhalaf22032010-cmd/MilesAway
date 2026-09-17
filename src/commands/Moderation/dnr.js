import { SlashCommandBuilder } from 'discord.js';
import { DnrService } from '../../services/moderation/dnrService.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dnr')
    .setDescription('Tell a user not to ping or reply to you')
    .setDefaultMemberPermissions(null)
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
      await interaction.reply({ content: '❌ You cannot DNR yourself.', ephemeral: true });
      return;
    }

    if (target.bot) {
      await interaction.reply({ content: '❌ You cannot DNR a bot.', ephemeral: true });
      return;
    }

    await DnrService.addDnr(interaction.guildId, target.id, protectedUser.id);

    await interaction.reply({
      content: `# ${target.username.toUpperCase()} DNRED\n\n**${target.username} has been Dnred by ${protectedUser.username}**`,
      allowedMentions: { users: [target.id] },
    });

    logger.info(`DNR created in ${interaction.guildId}: ${target.id} must not ping/reply to ${protectedUser.id}`);
  },
};