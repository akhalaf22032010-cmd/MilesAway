import { Events, EmbedBuilder } from 'discord.js';

const MESSAGE_KEY = (guildId) => `custom-messages:${guildId}`;
const DEFAULT_PREFIXES = ['.', '!', '?', ',', '/'];

function validHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message) {
    try {
      if (!message.guild || message.author.bot || !message.content || !message.client.db?.get) return;

      const prefixes = DEFAULT_PREFIXES;
      const prefix = prefixes.find((candidate) => message.content.startsWith(candidate));
      if (!prefix) return;

      const shortcut = message.content.slice(prefix.length).trim();
      if (!shortcut || /\s/.test(shortcut)) return;

      const name = shortcut.toLowerCase();
      const saved = await message.client.db.get(MESSAGE_KEY(message.guild.id), {});
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;

      const entry = saved[name];
      if (!entry) return;

      const embeds = [];
      const description = [entry.subtitle, entry.content].filter(Boolean).join('\n\n');
      const mainEmbed = new EmbedBuilder();
      if (entry.title) mainEmbed.setTitle(String(entry.title).slice(0, 256));
      if (description) mainEmbed.setDescription(String(description).slice(0, 4096));
      embeds.push(mainEmbed);

      for (const url of (Array.isArray(entry.images) ? entry.images : []).filter(validHttpUrl).slice(0, 9)) {
        const imageEmbed = new EmbedBuilder().setImage(url);
        embeds.push(imageEmbed);
      }

      const videoUrls = (Array.isArray(entry.videos) ? entry.videos : []).filter(validHttpUrl);
      if (videoUrls.length) {
        const videoLinks = videoUrls.map((url, index) => `[Video ${index + 1}](${url})`).join(' • ');
        const current = mainEmbed.data.description || '';
        mainEmbed.setDescription((current ? current + '\n\n' : '') + '**Videos**\n' + videoLinks.slice(0, 1500));
      }

      await message.channel.send({ embeds: embeds.slice(0, 10), allowedMentions: { parse: [] } });
    } catch (error) {
      message.client.logger?.error?.('[CustomMessages] Failed to send shortcut:', error);
    }
  }
};
