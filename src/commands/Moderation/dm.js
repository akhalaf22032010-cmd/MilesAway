import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

const IMAGE_OPTION_NAMES = [
    'image',
    'image2',
    'image3',
    'image4',
    'image5',
    'image6',
    'image7',
    'image8',
    'image9',
    'image10',
];

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
                .setDescription('The message to send')
                .setRequired(true)
                .setMaxLength(2000)
        )
        .addAttachmentOption(option =>
            option
                .setName('image')
                .setDescription('Optional first image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image2')
                .setDescription('Optional second image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image3')
                .setDescription('Optional third image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image4')
                .setDescription('Optional fourth image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image5')
                .setDescription('Optional fifth image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image6')
                .setDescription('Optional sixth image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image7')
                .setDescription('Optional seventh image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image8')
                .setDescription('Optional eighth image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image9')
                .setDescription('Optional ninth image to send')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('image10')
                .setDescription('Optional tenth image to send')
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

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const message = interaction.options.getString('message');
        const anonymous = interaction.options.getBoolean('anonymous') || false;
        const images = IMAGE_OPTION_NAMES
            .map((name) => interaction.options.getAttachment(name))
            .filter(Boolean);

        try {
            if (message.length > 2000) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Messages must be under 2000 characters.'
                });
            }

            if (targetUser.bot) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'You cannot send DMs to bot accounts.'
                });
            }

            const invalidImage = images.find((image) => !image.contentType?.startsWith('image/'));
            if (invalidImage) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'All image attachments must be image files.'
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
                        text: `You cannot reply to this message. | Logger ID: ${interaction.id}`
                    })
                ],
                ...(images.length ? { files: images.map((image) => image.url) } : {}),
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: images.length ? 'DM Sent With Images' : 'DM Sent',
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized.length,
                        imageCount: images.length,
                        imageNames: images.map((image) => image.name),
                        imageUrls: images.map((image) => image.url),
                    }
                }
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
                    message: `Could not send a DM to ${targetUser.tag}. They may have DMs disabled.`
                });
            }

            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Failed to send DM: ${error.message}`
            });
        }
    }
};