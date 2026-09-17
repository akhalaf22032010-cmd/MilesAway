import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

const REMINDER_TIMES = {
    '15m': { label: '15 minutes', ms: 15 * 60 * 1000 },
    '30m': { label: '30 minutes', ms: 30 * 60 * 1000 },
    '1h': { label: '1 hour', ms: 60 * 60 * 1000 },
    '2h': { label: '2 hours', ms: 2 * 60 * 60 * 1000 },
    '6h': { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
    '12h': { label: '12 hours', ms: 12 * 60 * 60 * 1000 },
    '1d': { label: '1 day', ms: 24 * 60 * 60 * 1000 },
};

export default {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder for yourself')
        .addStringOption((option) =>
            option
                .setName('message')
                .setDescription('What you want the bot to remind you about')
                .setRequired(true)
                .setMaxLength(2000),
        )
        .addStringOption((option) =>
            option
                .setName('time')
                .setDescription('When you want to be reminded')
                .setRequired(true)
                .addChoices(
                    { name: '15 minutes', value: '15m' },
                    { name: '30 minutes', value: '30m' },
                    { name: '1 hour', value: '1h' },
                    { name: '2 hours', value: '2h' },
                    { name: '6 hours', value: '6h' },
                    { name: '12 hours', value: '12h' },
                    { name: '1 day', value: '1d' },
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
        .setDMPermission(false),
    category: 'moderation',

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) return;

        const message = interaction.options.getString('message', true).trim();
        const timeKey = interaction.options.getString('time', true);
        const reminderTime = REMINDER_TIMES[timeKey];

        if (!message) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Reminder message cannot be empty.',
            });
        }

        if (!reminderTime) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'That reminder time is not available.',
            });
        }

        const remindAt = Date.now() + reminderTime.ms;

        setTimeout(async () => {
            try {
                await interaction.user.send({
                    embeds: [
                        successEmbed(
                            '⏰ Reminder',
                            `You asked me to remind you about:\n\n${message}`,
                        ).setFooter({
                            text: `Reminder set for ${reminderTime.label} ago`,
                        }),
                    ],
                });
            } catch (error) {
                logger.warn(`Could not DM reminder to ${interaction.user.tag}:`, error);
            }
        }, reminderTime.ms);

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Reminder Set',
                    `I'll DM you in **${reminderTime.label}** to remind you about:\n\n${message}`,
                ).setFooter({
                    text: `Reminder time: ${new Date(remindAt).toLocaleString()}`,
                }),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
