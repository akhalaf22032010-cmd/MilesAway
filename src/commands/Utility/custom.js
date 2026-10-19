import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
} from 'discord.js';

const KEY = (guildId) => `custom-messages:${guildId}`;
const cleanName = (value) => String(value || '').trim().replace(/^\./, '').toLowerCase();

async function readMessages(client, guildId) {
  const data = await client.db.get(KEY(guildId), {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

async function saveMessages(client, guildId, messages) {
  await client.db.set(KEY(guildId), messages);
}

function buildEmbeds(entry) {
  const blocks = Array.isArray(entry.embeds) && entry.embeds.length ? entry.embeds : [{}];
  return blocks.slice(0, 10).map((block, index) => {
    const embed = new EmbedBuilder();
    if (block.title || (index === 0 && entry.title)) embed.setTitle(String(block.title || entry.title).slice(0, 256));
    const description = block.description || (index === 0 ? [entry.subtitle, entry.content].filter(Boolean).join('\n\n') : '');
    if (description) embed.setDescription(String(description).slice(0, 4096));
    if (block.image) embed.setImage(block.image);
    if (block.url) embed.setURL(block.url);
    if (block.color) embed.setColor(block.color);
    return embed;
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('custom')
    .setDescription('Create and send your saved custom embed messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('create').setDescription('Create or replace a custom message')
      .addStringOption(o => o.setName('name').setDescription('Shortcut name, e.g. Guide').setRequired(true).setMaxLength(50))
      .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true).setMaxLength(256))
      .addStringOption(o => o.setName('content').setDescription('Main embed content (Markdown supported)').setRequired(true).setMaxLength(4000))
      .addStringOption(o => o.setName('subtitle').setDescription('Optional subtitle').setMaxLength(256))
      .addStringOption(o => o.setName('image_urls').setDescription('Optional image URLs separated by spaces (up to 10)').setMaxLength(1800))
      .addStringOption(o => o.setName('video_urls').setDescription('Optional video links, separated by spaces').setMaxLength(1800)))
    .addSubcommand(sub => sub.setName('send').setDescription('Send a saved custom message')
      .addStringOption(o => o.setName('name').setDescription('Saved message name').setRequired(true).setMaxLength(50)))
    .addSubcommand(sub => sub.setName('list').setDescription('List saved custom messages'))
    .addSubcommand(sub => sub.setName('delete').setDescription('Delete a saved custom message')
      .addStringOption(o => o.setName('name').setDescription('Saved message name').setRequired(true).setMaxLength(50))),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      return interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission to manage custom messages.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.client.db?.get || !interaction.client.db?.set) {
      return interaction.reply({ content: 'The database is unavailable right now.', flags: MessageFlags.Ephemeral });
    }

    const client = interaction.client;
    const sub = interaction.options.getSubcommand();
    const messages = await readMessages(client, interaction.guildId);

    if (sub === 'create') {
      const name = cleanName(interaction.options.getString('name'));
      if (!name || !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(name)) {
        return interaction.reply({ content: 'Name must use letters, numbers, underscores, or hyphens.', flags: MessageFlags.Ephemeral });
      }
      const title = interaction.options.getString('title', true);
      const subtitle = interaction.options.getString('subtitle') || '';
      const content = interaction.options.getString('content', true);
      const imageUrls = (interaction.options.getString('image_urls') || '').split(/\s+/).filter(Boolean).slice(0, 10);
      const videoUrls = (interaction.options.getString('video_urls') || '').split(/\s+/).filter(Boolean);
      const validUrl = (value) => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };
      if (imageUrls.some(url => !validUrl(url)) || videoUrls.some(url => !validUrl(url))) {
        return interaction.reply({ content: 'Image and video entries must be valid http(s) URLs.', flags: MessageFlags.Ephemeral });
      }
      messages[name] = { title, subtitle, content, images: imageUrls, videos: videoUrls, createdBy: interaction.user.id, updatedAt: Date.now() };
      await saveMessages(client, interaction.guildId, messages);
      return interaction.reply({ content: `Saved custom message **.${name}**. Use `/custom send name:${name}` to post it.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const names = Object.keys(messages).sort();
      return interaction.reply({ content: names.length ? `**Saved custom messages**\n${names.map(name => `• .${name}`).join('\n')}` : 'No custom messages saved yet.', flags: MessageFlags.Ephemeral });
    }

    const name = cleanName(interaction.options.getString('name', true));
    if (sub === 'delete') {
      if (!messages[name]) return interaction.reply({ content: `I couldn't find **.${name}**.`, flags: MessageFlags.Ephemeral });
      delete messages[name];
      await saveMessages(client, interaction.guildId, messages);
      return interaction.reply({ content: `Deleted **.${name}**.`, flags: MessageFlags.Ephemeral });
    }

    const entry = messages[name];
    if (!entry) return interaction.reply({ content: `I couldn't find **.${name}**. Use `/custom list` to see saved messages.`, flags: MessageFlags.Ephemeral });

    const embeds = buildEmbeds(entry);
    for (const image of (entry.images || []).slice(0, 10 - embeds.length)) {
      const embed = new EmbedBuilder();
      if (embeds.length === 0) embed.setTitle(entry.title);
      embed.setImage(image);
      embeds.push(embed);
    }
    const videoText = (entry.videos || []).length ? `\n\n**Videos**\n${entry.videos.map((url, i) => `[Video ${i + 1}](${url})`).join(' • ')}` : '';
    if (videoText && embeds.length) {
      const last = embeds[embeds.length - 1];
      const old = last.data.description || '';
      last.setDescription((old + videoText).slice(0, 4096));
    }
    return interaction.reply({ embeds: embeds.slice(0, 10) });
  }
};
