import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { addDnr, getDnrerIdsForTarget, getDnrReason } from '../services/moderation/dnrService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

const DNR_GIFS = [
  'https://klipy.com/gifs/jon-erik-hexum-dnr',
  'https://klipy.com/gifs/dnr',
  'https://klipy.com/gifs/dnr-2',
  'https://klipy.com/gifs/dnr-bojack',
  'https://klipy.com/gifs/dnr-didnt-read',
  'https://klipy.com/gifs/dnr-dnrd',
  'https://klipy.com/gifs/loox-androgenicogre-2',
  'https://klipy.com/gifs/dnr-7'
];

async function resolveKlipyGifUrl(pageUrl) {
  try {
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const staticGifs = [...html.matchAll(/https?:\\/\\/(?:static|static1|static2)\\.klipy\\.com\\/[^"'\\s<>]+?\\.gif(?:\\?[^"'\\s<>]*)?/gi)];
    if (staticGifs.length > 0) {
      return staticGifs[0][0].replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
    }

    const metaTags = html.match(/<meta\\b[^>]*>/gi) || [];
    for (const tag of metaTags) {
      const property = tag.match(/(?:property|name)\\s*=\\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      const content = tag.match(/content\\s*=\\s*["']([^"']+)["']/i)?.[1];
      if (content && (property === 'og:image' || property === 'twitter:image')) {
        return content.replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      const dnrCommandProcessed = await handleReplyDnr(message, client);
      if (dnrCommandProcessed) return;

      const dnrProcessed = await handleDnrProtection(message, client);
      if (dnrProcessed) return;

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) return;

      await handlePrefixCommand(message, client);
      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function handleReplyDnr(message, client) {
  if (!message.reference?.messageId) return false;
  const raw = message.content.trim();
  if (!/^\/dnr(?:\s|$)/i.test(raw)) return false;
  const reason = raw.slice(4).trim() || 'No reason provided.';

  try {
    const referencedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    const targetUser = referencedMessage?.author;
    if (!targetUser || targetUser.bot || targetUser.id === message.author.id) return false;

    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) return false;

    if (targetUser.id === message.guild.ownerId) {
      await message.delete().catch(() => {});
      await message.channel.send({ content: `<@${message.author.id}>`, embeds: [new EmbedBuilder().setDescription('You cannot DNR the Owner!')] }).catch(() => {});
      return true;
    }

    if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.delete().catch(() => {});
      await message.channel.send({ content: `<@${message.author.id}>`, embeds: [new EmbedBuilder().setDescription('❌ You cannot DNR this user\\n\\n**Users with Administrator permission cannot be DNRD.**')] }).catch(() => {});
      return true;
    }

    await addDnr(client, message.guild.id, message.author.id, targetUser.id, reason);
    await message.delete().catch(() => {});

    const shuffledGifPages = [...DNR_GIFS].sort(() => Math.random() - 0.5);
    let gifUrl = null;
    for (const gifPage of shuffledGifPages) {
      gifUrl = await resolveKlipyGifUrl(gifPage);
      if (gifUrl) break;
    }
    const confirmationEmbed = new EmbedBuilder()
      .setTitle('# 📌 USER DNRD')
      .setDescription(`**${message.member?.displayName || message.author.globalName || message.author.username} DNRED ${targetMember.displayName}**\n\n**Reason:** ${reason}\n\n**They won't be able to ping/reply to you**`);
    if (gifUrl) confirmationEmbed.setImage(gifUrl);

    await message.channel.send({
      embeds: [confirmationEmbed],
    }).catch(() => {});

    return true;
  } catch (error) {
    logger.error('Error handling reply DNR:', error);
    return false;
  }
}

async function handleDnrProtection(message, client) {
  try {
    const dnrerIds = await getDnrerIdsForTarget(client, message.guild.id, message.author.id);
    if (dnrerIds.length === 0) return false;

    const mentionedDnrer = message.mentions.users.some((user) => dnrerIds.includes(user.id));
    const repliedToDnrer = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference.messageId).then((referencedMessage) =>
          dnrerIds.includes(referencedMessage.author.id)
        ).catch(() => false)
      : false;

    if (!mentionedDnrer && !repliedToDnrer) return false;

    await message.delete().catch(() => {});

    const referencedDnrerId = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference.messageId).then((referencedMessage) => referencedMessage.author.id).catch(() => null)
      : null;
    const dnrerId = dnrerIds.find((id) => mentionedDnrer && message.mentions.users.has(id)) || referencedDnrerId;
    const dnrerMember = dnrerId ? await message.guild.members.fetch(dnrerId).catch(() => null) : null;
    const displayName = dnrerMember?.displayName || 'This user';

    const dnrerReason = await getDnrReason(client, message.guild.id, dnrerId, message.author.id);
    const embed = new EmbedBuilder()
      .setTitle('# ❗ DNRD')
      .setDescription(`# ❗ ${displayName} DNRD you.\n\n**Reason:** ${dnrerReason}\n\n**You can't ping or reply to them unless they undnr you**`);

    await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] }).catch(() => {});
    return true;
  } catch (error) {
    logger.error('Error handling DNR protection:', error);
    return false;
  }
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    if (!parsed) return;

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return;
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({ title: 'Maintenance Mode', description: getBotMessage('maintenanceMode'), color: 'warning' })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({ title: 'Feature Disabled', description: getBotMessage('commandDisabled'), color: 'error' })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({ title: 'Slash Command Only', description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`, color: 'info' });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({ title: 'Command Disabled', description: 'This command has been disabled for this server.', color: 'error' });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = { guildId: message.guild.id, user: message.author };
    const abuseProtection = await enforceAbuseProtection(mockInteractionForProtection, command, resolvedCommandName);
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({ title: 'Command Cooldown', description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`, color: 'error' });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) return false;

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, { ...config, nextNumber: 1, lastUserId: null, currentStreak: 0 });
      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => failureMessage.delete().catch(() => {}), 10000);
      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

async function handleLeveling(message, client) {
  try {
    if (!client.db || (typeof client.db.isAvailable === 'function' && !client.db.isAvailable())) {
      logger.warn(`Leveling skipped because the database is unavailable in guild ${message.guild.id}`);
      return;
    }

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    if (!levelingConfig || levelingConfig.enabled === false) return;
    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) return;

    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) return;
    }

    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) return;
    if (!message.content || message.content.trim().length === 0) return;

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    const cooldownTime = Number.isFinite(Number(levelingConfig.xpCooldown))
      ? Math.max(0, Number(levelingConfig.xpCooldown))
      : 60;
    const now = Date.now();
    const lastMessage = Number(userData.lastMessage) || 0;
    const timeSinceLastMessage = now - lastMessage;
    if (timeSinceLastMessage < cooldownTime * 1000) return;

    const configuredMinXP = Number(levelingConfig.xpRange?.min ?? levelingConfig.xpPerMessage?.min ?? 15);
    const configuredMaxXP = Number(levelingConfig.xpRange?.max ?? levelingConfig.xpPerMessage?.max ?? 25);
    const minXP = Number.isFinite(configuredMinXP) ? Math.max(1, configuredMinXP) : 15;
    const maxXP = Number.isFinite(configuredMaxXP) ? Math.max(minXP, configuredMaxXP) : Math.max(minXP, 25);
    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);
    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);

    const result = await addXp(client, message.guild, message.member, finalXP);
    if (result?.leveledUp) logger.info(`${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`);
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}
