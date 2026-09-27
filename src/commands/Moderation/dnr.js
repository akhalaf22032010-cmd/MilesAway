import { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { addDnr, getDnrList, getLastDnrGif, setLastDnrGif } from '../../services/moderation/dnrService.js';

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
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://klipy.com/',
      },
    });

    if (!response.ok) return [];

    const html = await response.text();
    const candidates = [];
    const seen = new Set();

    const normalize = (value) => String(value || '')
      .trim()
      .replace(/\\u002F/gi, '/')
      .replace(/\\u0026/gi, '&')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')
      .replace(/%2F/gi, '/')
      .replace(/%3A/gi, ':');

    const add = (value) => {
      const normalized = normalize(value);
      const match = normalized.match(/https?:\/\/(?:static\d*|media|cdn)\.klipy\.com\/[^"'<>\s\\]+/i);
      if (!match) return;
      const url = match[0];
      if (!seen.has(url)) {
        seen.add(url);
        candidates.push(url);
      }
    };

    // Only use media explicitly attached to THIS Klipy page.
    // Do not scan every media URL on the page, because Klipy pages contain
    // recommended/random GIFs too.
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    for (const tag of metaTags) {
      const attrs = {};
      for (const match of tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/gi)) {
        attrs[match[1].toLowerCase()] = match[2];
      }

      const key = (attrs.property || attrs.name || '').toLowerCase();
      if (['og:image', 'og:image:url', 'twitter:image'].includes(key)) {
        add(attrs.content);
      }
    }

    // Prefer the actual content/media URL fields from structured page data.
    const structured = html.match(
      /"(?:contentUrl|content_url|gifUrl|gif_url|mediaUrl|media_url)"\s*:\s*"([^"]+)"/gi
    ) || [];
    for (const entry of structured) {
      const value = entry.match(/:\s*"([^"]+)"/i)?.[1];
      if (value) add(value);
    }

    return candidates;
  } catch {
    return [];
  }
}
async function downloadGif(gifUrl) {
  if (!gifUrl) return null;

  try {
    const response = await fetch(gifUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/gif,image/*;q=0.8,*/*;q=0.5',
        'Referer': 'https://klipy.com/',
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || 0);

    if (!contentType.toLowerCase().includes('gif') && !/\.gif(?:[?#].*)?$/i.test(gifUrl)) {
      return null;
    }

    if (contentLength > 8 * 1024 * 1024) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;

    return new AttachmentBuilder(buffer, { name: 'dnr.gif' });
  } catch {
    return null;
  }
}

function dnrEmbed(title, description = null, imageUrl = null) {
  const embed = new EmbedBuilder().setTitle(title);
  if (description) embed.setDescription(description);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('dnr')
    .setDescription('DNR a user or view your DNR list')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option.setName('action').setDescription('Use list to view your DNR list').setRequired(false).addChoices({ name: 'list', value: 'list' }))
    .addStringOption((option) => option.setName('reason').setDescription('Why you are DNRing this user').setRequired(false))
    .addUserOption((option) => option.setName('user').setDescription('The user to DNR').setRequired(false))
    .setDMPermission(false),
  category: 'moderation',

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason')?.trim() || 'No reason provided.';

    if (action === 'list') {
      const ids = await getDnrList(interaction.client, interaction.guild.id, interaction.user.id);
      if (ids.length === 0) {
        return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('📋 Your DNR List', '**Your DNR list is empty.**')], flags: MessageFlags.Ephemeral });
      }
      const mentions = ids.map((id, index) => `${index + 1}. <@${id}>`).join('\n');
      return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('📋 Your DNR List', mentions)], flags: MessageFlags.Ephemeral });
    }

    if (!target) {
      return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('❌ Missing user', 'Use `/dnr @user` to DNR someone, or `/dnr list` to view your list.')], flags: MessageFlags.Ephemeral });
    }

    if (target.id === interaction.user.id) {
      return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('❌ You cannot DNR yourself', 'Choose another user.')], flags: MessageFlags.Ephemeral });
    }

    if (target.bot) {
      return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('❌ You cannot DNR a bot', 'Choose a server member instead.')], flags: MessageFlags.Ephemeral });
    }

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (target.id === interaction.guild.ownerId) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('You cannot DNR the Owner!')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (targetMember?.permissions.has(PermissionFlagsBits.Administrator)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [dnrEmbed('❌ You cannot DNR this user\n\n**Users with Administrator permission cannot be DNRD.**')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await addDnr(interaction.client, interaction.guild.id, interaction.user.id, target.id, reason);
    const actorName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
    const displayName = targetMember?.displayName || target.displayName || target.username;
    const lastGifPage = await getLastDnrGif(interaction.client, interaction.guild.id);
    const availableGifPages = DNR_GIFS.filter((page) => page !== lastGifPage);
    const shuffledGifPages = [...(availableGifPages.length ? availableGifPages : DNR_GIFS)]
      .sort(() => Math.random() - 0.5);

    let gifAttachment = null;
    let selectedGifPage = null;

    // Try the user's exact 8 Klipy pages until one produces a real GIF.
    // The "last used" page is excluded so the same GIF cannot repeat twice in a row.
    for (const gifPage of shuffledGifPages) {
      const candidates = await resolveKlipyGifUrl(gifPage);

      for (const gifUrl of candidates) {
        const attachment = await downloadGif(gifUrl);
        if (attachment) {
          gifAttachment = attachment;
          selectedGifPage = gifPage;
          break;
        }
      }

      if (gifAttachment) break;
    }

    // Only mark a page as used after the GIF was successfully downloaded.
    if (selectedGifPage) {
      await setLastDnrGif(interaction.client, interaction.guild.id, selectedGifPage);
    }

    const embed = dnrEmbed(
      '# 📌 USER DNRD',
      `**${actorName} DNRED ${displayName}**\n\n**Reason:** ${reason}\n\n**They won't be able to ping/reply to you**`,
      gifAttachment ? 'attachment://dnr.gif' : null,
    );

    return InteractionHelper.safeReply(interaction, {
      embeds: [embed],
      ...(gifAttachment ? { files: [gifAttachment] } : {}),
    });
  },
};
