import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

async function sendDirectMessage(interaction, targetUser, message, anonymous) {
    try {
        if (!message || !message.trim()) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'The message cannot be empty.',
            });
        }

        if (message.length > 2000) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Messages must be under 2000 characters.',
            });
        }

        if (targetUser.bot) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'You cannot send DMs to bot accounts.',
            });
        }

        const sanitized = sanitizeMarkdown(message);
        const dmChannel = await targetUser.createDM();

        await dmChannel.send({
            embeds: [
                successEmbed(
                    anonymous ? 'Message from the Staff Team' : `Message from ${interaction.user.tag}`,
                    sanitized
                ).setFooter({
                    text: `You cannot reply to this message. | Logger ID: ${interaction.id}`,
                }),
            ],
        });

        await logEvent({
            client: interaction.client,
            guild: interaction.guild,
            event: {
                action: 'DM Sent',
                target: `${targetUser.tag} (${targetUser.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}`,
                metadata: {
                    userId: targetUser.id,
                    moderatorId: interaction.user.id,
                    anonymous,
                    messageLength: sanitized.length,
                },
            },
        });

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'DM Sent',
                    `Successfully sent a message to ${targetUser.tag}`
                ),
            ],
        });
    } catch (error) {
        logger.error('DM command error:', error);

        if (error.code === 50007) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Could not send a DM to ${targetUser.tag}. They may have DMs disabled.`,
            });
        }

        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: `Failed to send DM: ${error.message}`,
        });
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send a direct message to a user (Staff only)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to send a DM to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Optional short message; omit it to open a full message box')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('anonymous')
                .setDescription('Send the message anonymously (default: false)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    category: 'moderation',

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const message = interaction.options.getString('message');
        const anonymous = interaction.options.getBoolean('anonymous') || false;

        // Use a Discord modal when the message option is omitted. The modal
        // provides a real paragraph field, preserving spaces and line breaks.
        if (!message) {
            const modalId = `dm_modal:${targetUser.id}:${anonymous ? '1' : '0'}`;
            const modal = new ModalBuilder()
                .setCustomId(modalId)
                .setTitle(`DM ${targetUser.username}`);

            const messageInput = new TextInputBuilder()
                .setCustomId('dm_message')
                .setLabel('Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type the full message here...')
                .setRequired(true)
                .setMaxLength(2000);

            modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
            await interaction.showModal(modal);

            try {
                const modalInteraction = await interaction.awaitModalSubmit({
                    filter: submitted =>
                        submitted.user.id === interaction.user.id &&
                        submitted.customId === modalId,
                    time: 300000,
                });

                const fullMessage = modalInteraction.fields.getTextInputValue('dm_message');
                await modalInteraction.deferReply({ flags: 64 });
                return await sendDirectMessage(modalInteraction, targetUser, fullMessage, anonymous);
            } catch (error) {
                logger.debug(`DM modal closed or timed out: ${error?.message || error}`);
                return;
            }
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn('DM interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm',
            });
            return;
        }

        return await sendDirectMessage(interaction, targetUser, message, anonymous);
    },
};
