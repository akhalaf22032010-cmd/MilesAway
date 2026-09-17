import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

const TEXT_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
];

function resolveTargetChannel(interaction) {
    const selected = interaction.options.getChannel('channel');
    if (selected) return selected;

    if (!interaction.channel || !TEXT_CHANNEL_TYPES.includes(interaction.channel.type)) {
        return null;
    }

    return interaction.channel;
}

export default {
    data: new SlashCommandBuilder()
        .setName('sayimage')
        .setDescription('Send an image as the bot')
        .addAttachmentOption((option) =>
            option
                .setName('image')
                .setDescription('The image the bot should send')
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Channel to send in (defaults to the current channel)')
                .addChannelTypes(...TEXT_CHANNEL_TYPES)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'moderation',
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction, _config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn('Sayimage interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'sayimage',
            });
            return;
        }

        const image = interaction.options.getAttachment('image');
        const channel = resolveTargetChannel(interaction);

        if (!image || !channel) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Choose a valid image and text channel.',
            });
        }

        if (!image.contentType?.startsWith('image/')) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'The attachment must be an image.',
            });
        }

        const memberPermissions = channel.permissionsFor(interaction.member);
        const botPermissions = channel.permissionsFor(interaction.guild.members.me);

        if (!memberPermissions?.has(PermissionFlagsBits.SendMessages)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: `You do not have permission to send messages in ${channel}.`,
            });
        }

        if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: `I do not have permission to send messages in ${channel}.`,
            });
        }

        const sentMessage = await channel.send({
            files: [image.url],
        });

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: 'Bot Image Sent',
                target: `${channel} (${channel.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: image.name || 'Image attachment',
                metadata: {
                    channelId: channel.id,
                    messageId: sentMessage.id,
                    moderatorId: interaction.user.id,
                    attachmentName: image.name,
                    attachmentUrl: image.url,
                },
            },
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Image Sent',
                    `Posted in ${channel}. [Jump to message](${sentMessage.url})`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
