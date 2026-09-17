import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('react')
        .setDescription('React to a message as the bot')
        .addStringOption((option) =>
            option
                .setName('message_id')
                .setDescription('The ID of the message to react to')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('emoji')
                .setDescription('Emoji to react with, such as 👍 or ❤️')
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'moderation',
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) return;

        const messageId = interaction.options.getString('message_id', true).trim();
        const emoji = interaction.options.getString('emoji', true).trim();

        if (!/^\d{17,20}$/.test(messageId)) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'That is not a valid Discord message ID.',
            });
        }

        if (!emoji) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Emoji cannot be empty.',
            });
        }

        try {
            const channel = interaction.channel;
            if (!channel?.messages?.fetch) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'This command must be used in a text-based channel.',
                });
            }

            const message = await channel.messages.fetch(messageId);
            await message.react(emoji);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        'Reaction Added',
                        `Reacted to [the message](${message.url}) with ${emoji}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('React command failed:', error);
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'I could not react to that message. Make sure the message is in this channel and the emoji is valid.',
            });
        }
    },
};
