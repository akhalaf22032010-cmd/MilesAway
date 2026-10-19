import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { setBirthday as dbSetBirthday } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        const config = await getGuildConfig(member.client, guild.id);
        
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        const welcomeChannelId = welcomeConfig?.channelId;

        if (welcomeConfig?.enabled && welcomeChannelId) {
            let channel = guild.channels.cache.get(welcomeChannelId);
            if (!channel) {
                try {
                    channel = await guild.channels.fetch(welcomeChannelId);
                } catch (error) {
                    logger.warn(`[Welcome] Could not fetch configured channel ${welcomeChannelId} in guild ${guild.id}:`, error.message);
                }
            }
            const me = guild.members.me;
            const permissions = channel?.isTextBased?.() && me ? channel.permissionsFor(me) : null;
            // Skip only the welcome message if permissions are missing; the rest of the
            // join pipeline (auto-role, verification, logging, counters) must still run.
            if (permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                const formatData = { user, guild, member };
                const welcomeMessage = formatWelcomeMessage(
                    welcomeConfig.welcomeMessage || welcomeConfig.welcomeEmbed?.description || botConfig.welcome?.defaultWelcomeMessage || 'Welcome {user} to {server}!',
                    formatData
                );

                const messageContent = welcomeConfig.welcomePing ? user.toString() : null;

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.welcomeEmbed?.title || '🎉 Welcome!',
                    formatData
                );
                const embedFooter = welcomeConfig.welcomeEmbed?.footer
                    ? formatWelcomeMessage(welcomeConfig.welcomeEmbed.footer, formatData)
                    : `Welcome to ${guild.name}!`;

                const canEmbed = permissions.has(PermissionFlagsBits.EmbedLinks);

                if (!canEmbed) {
                    await channel.send({
                        content: messageContent || welcomeMessage
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(welcomeConfig.welcomeEmbed?.color || getColor('success'))
                        .setTitle(embedTitle)
                        .setDescription(welcomeMessage)
                        .setThumbnail(user.displayAvatarURL())
                        .addFields(
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: embedFooter });
                    
                    if (welcomeConfig.welcomeImage) {
                        embed.setImage(welcomeConfig.welcomeImage);
                    } else if (welcomeConfig.welcomeEmbed?.image?.url) {
                        embed.setImage(welcomeConfig.welcomeEmbed.image.url);
                    }
                    
                    await channel.send({ 
                        content: messageContent,
                        embeds: [embed] 
                    });
                }
            }
        }
        
        // Auto-role is stored in the welcome config. Fetch it from Discord rather
        // than relying on cache, which can be empty after restarts or cache misses.
        const autoRoleIds = Array.isArray(welcomeConfig?.roleIds)
            ? welcomeConfig.roleIds.filter(Boolean)
            : [];
        const autoRoleId = autoRoleIds[0]; // This bot intentionally supports one auto-role.
        if (autoRoleId) {
            const assignConfiguredRole = async () => {
                try {
                    // A delayed role should not be assigned if the member has already left.
                    const currentMember = guild.members.cache.get(member.id)
                        || await guild.members.fetch(member.id).catch(() => null);
                    if (!currentMember) {
                        logger.info(`[Autorole] Skipped role ${autoRoleId}: member ${member.id} is no longer in guild ${guild.id}.`);
                        return;
                    }

                    let role = guild.roles.cache.get(autoRoleId);
                    if (!role) {
                        role = await guild.roles.fetch(autoRoleId).catch(error => {
                            logger.warn(`[Autorole] Could not fetch configured role ${autoRoleId} in guild ${guild.id}:`, error.message);
                            return null;
                        });
                    }
                    if (!role) {
                        logger.warn(`[Autorole] Configured role ${autoRoleId} does not exist in guild ${guild.id}.`);
                        return;
                    }

                    await assignRoleSafely(currentMember, role);
                } catch (error) {
                    logger.error(`[Autorole] Unexpected failure assigning role ${autoRoleId} in guild ${guild.id}:`, error);
                }
            };

            const delaySeconds = Math.max(0, Number(welcomeConfig.autoRoleDelay) || 0);
            if (delaySeconds > 0) {
                const timeout = setTimeout(() => {
                    void assignConfiguredRole();
                }, delaySeconds * 1000);
                if (typeof timeout.unref === 'function') timeout.unref();
                logger.info(`[Autorole] Scheduled role ${autoRoleId} for member ${member.id} in ${delaySeconds}s.`);
            } else {
                await assignConfiguredRole();
            }
        }
        
        if (config?.verification?.enabled || config?.verification?.autoVerify?.enabled) {
            await handleVerification(member, guild, config.verification, member.client);
        }

        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_JOIN,
                data: {
                    title: 'User joined',
                    lines: [
                        `**User:** ${user.toString()} (${user.displayName !== user.username ? `@${user.displayName}` : user.tag})`,
                        `**ID:** \`${user.id}\``,
                        `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
                        `**Members:** ${guild.memberCount}`,
                    ],
                    quoted: false,
                    thumbnail: user.displayAvatarURL({ dynamic: true }),
                    userId: user.id,
                }
            });
        } catch (error) {
            logger.debug('Error logging member join:', error);
        }

        try {
            const counters = await getServerCounters(member.client, guild.id);
            for (const counter of counters) {
                if (counter && counter.type && counter.channelId && counter.enabled !== false) {
                    await updateCounter(member.client, guild, counter);
                }
            }
        } catch (error) {
            logger.debug('Error updating counters on member join:', error);
        }

        try {
            const backupKey = `guild:${guild.id}:birthdays:left`;
            const backup = (await member.client.db.get(backupKey)) || {};
            if (backup[user.id]) {
                const { month, day } = backup[user.id];
                await dbSetBirthday(member.client, guild.id, user.id, month, day);
                delete backup[user.id];
                await member.client.db.set(backupKey, backup);
                logger.debug(`Birthday restored for user ${user.id} in guild ${guild.id}`);
            }
        } catch (error) {
            logger.debug('Error restoring birthday on member join:', error);
        }
        
    } catch (error) {
        logger.error('Error in guildMemberAdd event:', error);
    }
  }
};

async function handleVerification(member, guild, verificationConfig, client) {
    const { autoVerifyOnJoin } = await import('../services/verificationService.js');
    
    try {
        const result = await autoVerifyOnJoin(client, guild, member, verificationConfig);
        
        if (result.autoVerified) {
            logger.info('User auto-verified on join', {
                guildId: guild.id,
                userId: member.id,
                userTag: member.user.tag,
                roleName: result.roleName,
                criteria: result.criteria
            });
        } else {
            logger.debug('User not auto-verified on join', {
                guildId: guild.id,
                userId: member.id,
                reason: result.reason
            });
        }

    } catch (error) {
        logger.error('Error in auto-verification for member', {
            guildId: guild.id,
            userId: member.id,
            userTag: member.user.tag,
            error: error.message
        });
    }
}

async function assignRoleSafely(member, role) {
    const { guild } = member;
    try {
        const botMember = guild.members.me || await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            logger.warn(`[Autorole] Cannot assign role ${role.id} in guild ${guild.id}: bot is missing Manage Roles permission.`);
            return false;
        }

        if (role.managed || role.id === guild.id) {
            logger.warn(`[Autorole] Cannot assign managed/@everyone role ${role.id} in guild ${guild.id}.`);
            return false;
        }

        if (role.position >= botMember.roles.highest.position) {
            logger.warn(`[Autorole] Cannot assign role ${role.id} in guild ${guild.id}: move the bot's highest role above this role.`);
            return false;
        }

        await member.roles.add(role, 'Automatic role on member join');
        logger.info(`[Autorole] Assigned role ${role.id} to member ${member.id} in guild ${guild.id}.`);
        return true;
    } catch (error) {
        logger.warn(`[Autorole] Failed to assign role ${role.id} to member ${member.id} in guild ${guild.id}: ${error.message}`);
        return false;
    }
}