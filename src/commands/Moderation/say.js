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

const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const IMAGE_OPTION_NAMES = ['image','image2','image3','image4','image5','image6','image7','image8','image9','image10'];

function resolveTargetChannel(interaction) {
    const selected = interaction.options.getChannel('channel');
    if (selected) return selected;
    if (!interaction.channel || !TEXT_CHANNEL_TYPES.includes(interaction.channel.type)) return null;
    return interaction.channel;
}

function preserveMessageFormatting(value) {
    if (!value) return '';
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, 2000);
}

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a plain message as the bot')
        .addStringOption((option) => option.setName('message').setDescription('The message the bot should send').setRequired(true).setMaxLength(2000))
        .addAttachmentOption((option) => option.setName('image').setDescription('Optional first image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image2').setDescription('Optional second image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image3').setDescription('Optional third image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image4').setDescription('Optional fourth image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image5').setDescription('Optional fifth image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image6').setDescription('Optional sixth image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image7').setDescription('Optional seventh image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image8').setDescription('Optional eighth image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image9').setDescription('Optional ninth image to send').setRequired(false))
        .addAttachmentOption((option) => option.setName('image10').setDescription('Optional tenth image to send').setRequired(false))
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to send in (defaults to the current channel)').addChannelTypes(...TEXT_CHANNEL_TYPES).setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'moderation',
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction, _config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn('Say interaction defer failed', { userId: interaction.user.id, guildId: interaction.guildId, commandName: 'say' });
            return;
        }

        const message = preserveMessageFormatting(interaction.options.getString('message'));
        const images = IMAGE_OPTION_NAMES.map((name) => interaction.options.getAttachment(name)).filter(Boolean);

        if (!message) return replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Message cannot be empty.' });
        const invalidImage = images.find((image) => !image.contentType?.startsWith('image/'));
        if (invalidImage) return replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'All image attachments must be image files.' });

        const channel = resolveTargetChannel(interaction);
        if (!channel) return replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Choose a text channel or run this command in one.' });

        const memberPermissions = channel.permissionsFor(interaction.member);
        const botPermissions = channel.permissionsFor(interaction.guild.members.me);
        if (!memberPermissions?.has(PermissionFlagsBits.SendMessages)) return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `You do not have permission to send messages in ${channel}.` });
        if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `I do not have permission to send messages in ${channel}.` });

        const sentMessage = await channel.send({ content: message, ...(images.length ? { files: images.map((image) => image.url) } : {}) });

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: images.length ? 'Bot Message With Images Sent' : 'Bot Message Sent',
                target: `${channel} (${channel.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: message.length > 200 ? `${message.slice(0, 197)}...` : message,
                metadata: {
                    channelId: channel.id,
                    messageId: sentMessage.id,
                    moderatorId: interaction.user.id,
                    messageLength: message.length,
                    imageCount: images.length,
                    imageNames: images.map((image) => image.name),
                    imageUrls: images.map((image) => image.url),
                },
            },
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Message Sent', `Posted in ${channel}. [Jump to message](${sentMessage.url})`)],
            flags: MessageFlags.Ephemeral,
        });
    },
};