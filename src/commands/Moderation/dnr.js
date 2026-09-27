import { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { addDnr, getDnrList } from '../../services/moderation/dnrService.js';

const DNR_GIFS = [
  'https://klipy.com/gifs/jon-erik-hexum-dnr',
  'https://klipy.com/gifs/dnr',
  'https://klipy.com/gifs/dnr-2',
  'https://klipy.com/gifs/dnr-bojack',
  'https://klipy.com/gifs/dnr-didnt-read',
  'https://klipy.com/gifs/dnr-dnrd',
  'https://klipy.com/gifs/dnr-7'
];

async function resolveKlipyGifUrl(pageUrl) {
  try {
    const response = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match ? match[1].replace(/&amp;/g, '&') : null;
  } catch {
    return null;
  }
}

function dnrEmbed(description, imageUrl = null) {
  const embed = new EmbedBuilder().setDescription(description);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('dnr')
    .setDescription('DNR a user or view your DNR list')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option.setName('action').setDescription('Use list to view your DNR list').setRequired(false).addChoices({ name: 'list', value: 'list' }))
    .addUserOption((option) => option.setName('user').setDescription('The user to DNR').setRequired(false))
    .setDMPermission(false),
  category: 'moderation',

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const target = interaction.options.getUser('user');

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

    if (!reason?.trim()) {
      return InteractionHelper.safeReply(interaction, { embeds: [dnrEmbed('❌ Missing reason', 'You must provide a reason when DNRing someone.')], flags: MessageFlags.Ephemeral });
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

    await addDnr(interaction.client, interaction.guild.id, interaction.user.id, target.id);
    const actorName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
    const displayName = targetMember?.displayName || target.displayName || target.username;
    const gifPage = DNR_GIFS[Math.floor(Math.random() * DNR_GIFS.length)];
    const gifUrl = await resolveKlipyGifUrl(gifPage);

    return InteractionHelper.safeReply(interaction, {
      embeds: [await dnrEmbed(`# 📌 you DNRED ${displayName}`, '**They won\'t be able to ping/reply to you**', gifUrl)],
    });
  },
};
