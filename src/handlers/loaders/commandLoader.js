import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;
const TARGET_GUILD_ID = '1530914065147363378';

function getSubcommandInfo(commandData) {
    const subcommands = [];
    if (commandData.options) {
        for (const option of commandData.options) {
            if (option.type === 1) subcommands.push(option.name);
            else if (option.type === 2 && option.options) for (const subOption of option.options) if (subOption.type === 1) subcommands.push(`${option.name}/${subOption.name}`);
        }
    }
    return subcommands;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            if (file.name === 'modules') continue;
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) fileList.push(filePath);
    }
    return fileList;
}

export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../../commands');
    const commandFiles = await getAllFiles(commandsPath);
    logger.info(`Found ${commandFiles.length} command files to load`);
    const uniqueCommandNames = new Set();
    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default || commandModule;
            if (!command.data || !command.execute) continue;
            command.category = path.basename(path.dirname(filePath));
            command.filePath = normalizedPath;
            const primaryCommandName = command.data.name;
            if (!uniqueCommandNames.has(primaryCommandName)) {
                uniqueCommandNames.add(primaryCommandName);
                client.commands.set(primaryCommandName, command);
            }
            logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${command.category})`);
        } catch (error) { logger.error(`Error loading command from ${filePath}:`, error); }
    }
    logger.info(`Loaded ${client.commands.size} commands`);
    return client.commands;
}

function collectCommandPayloads(client) {
    const commands = [];
    let totalSubcommands = 0;
    const registeredNames = new Set();
    for (const command of client.commands.values()) {
        if (!command.data || typeof command.data.toJSON !== 'function') continue;
        const commandName = command.data.name;
        if (registeredNames.has(commandName)) continue;
        registeredNames.add(commandName);
        const commandJson = command.data.toJSON();
        commands.push(commandJson);
        totalSubcommands += getSubcommandInfo(commandJson).length;
    }
    return { commands, totalSubcommands };
}

function validateCommands(commands) {
    const errors = [];
    for (const cmd of commands) {
        if (cmd.name?.length > 32) errors.push(`Command ${cmd.name} has name longer than 32 chars`);
        if (cmd.description?.length > 110) errors.push(`Command ${cmd.name} has description longer than 110 chars`);
    }
    if (errors.length) throw new Error(`Command validation failed: ${errors.join('; ')}`);
}

function prepareCommandsForRegistration(commands) {
    if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) logger.warn(`Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} global command limit`);
    if (commands.length > MAX_COMMANDS) {
        logger.warn(`Only the first ${MAX_COMMANDS} of ${commands.length} commands can be registered because Discord's application command limit is ${MAX_COMMANDS}.`);
    }
    return commands.slice(0, MAX_COMMANDS);
}

async function registerCommandsToGuild(client, guildId, commands) {
    if (!guildId) throw new Error('No guild ID available for immediate slash command registration');
    validateCommands(commands);
    const commandsToRegister = prepareCommandsForRegistration(commands);
    logger.info(`Registering ${commandsToRegister.length} commands to TARGET guild ${guildId}...`);
    await client.rest.put(`/applications/${client.user.id}/guilds/${guildId}/commands`, { body: commandsToRegister });
    logger.info(`Successfully registered ${commandsToRegister.length} guild commands in ${guildId}`);
}

async function clearGlobalCommands(client) {
    try {
        await client.rest.put(`/applications/${client.user.id}/commands`, { body: [] });
        logger.info('Successfully cleared global slash commands so old BotGhost/global commands do not remain visible.');
    } catch (error) {
        logger.warn('Could not clear global slash commands:', error?.message || error);
    }
}

export async function registerCommands(client, options = {}) {
    const { commands } = collectCommandPayloads(client);
    if (!commands.length) throw new Error('No slash commands were loaded from src/commands');

    // Always use the intended MilesAway server instead of a stale/wrong GUILD_ID
    // from the hosting environment.
    const immediateGuildId = TARGET_GUILD_ID;

    logger.info(`Command registration target: ${immediateGuildId}`);
    if (!client.guilds.cache.has(immediateGuildId)) {
        logger.warn(`Bot is not currently cached in target guild ${immediateGuildId}. Check that this bot account is actually in that server.`);
    }

    let guildRegistered = false;
    try {
        await registerCommandsToGuild(client, immediateGuildId, commands);
        guildRegistered = true;
    } catch (error) {
        logger.error(`Guild command registration failed for ${immediateGuildId}:`, error);
    }

    // Remove stale global/BotGhost commands. The bot's commands are intentionally
    // registered to the target guild above for immediate availability.
    await clearGlobalCommands(client);

    if (!guildRegistered) {
        throw new Error(`Commands could not be registered to target guild ${immediateGuildId}. Make sure the bot is in that server and was invited with the applications.commands scope.`);
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    if (!command) return { success: false, message: `Command "${commandName}" not found` };
    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());
        const newCommand = (await import(moduleUrl.href)).default;
        client.commands.set(commandName, newCommand);
        return { success: true, message: `Successfully reloaded command "${commandName}"` };
    } catch (error) {
        logger.error(`Error reloading command "${commandName}":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}
