import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling/leveling.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('enablelevels')
        .setDescription('Enable level-up notification messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'You need the **Manage Server** permission to use this command.',
            });
        }

        const levelingConfig = await getLevelingConfig(client, interaction.guildId);
        levelingConfig.announceLevelUp = true;
        await saveLevelingConfig(client, interaction.guildId, levelingConfig);

        return await InteractionHelper.safeEditReply(interaction, {
            content: '✅ Level-up messages are now **enabled**.',
        });
    },
};
