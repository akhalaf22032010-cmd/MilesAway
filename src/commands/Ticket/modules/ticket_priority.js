import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../../services/ticket.js';

export default {
    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
        if (!deferred) return;
        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'This command can only be used in a valid ticket channel.' });
        if (!permissionContext.canManageTicket) return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission or the configured `Ticket Staff Role` to change ticket priority.' });
        const priorityLevel = interaction.options.getString('level');
        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);
        await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('Priority Updated', `Ticket priority set to **${priorityLevel.toUpperCase()}**.`)] });
        logger.info('Ticket priority updated successfully', { userId: interaction.user.id, userTag: interaction.user.tag, channelId: interaction.channel.id, channelName: interaction.channel.name, guildId: interaction.guildId, priority: priorityLevel, commandName: 'ticket_priority' });
    },
};
