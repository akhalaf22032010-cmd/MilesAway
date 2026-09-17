import { SlashCommandBuilder } from 'discord.js';
import shopBrowse from './modules/shop_browse.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse the economy shop.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Set the role granted for Premium Role purchases.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to grant for Premium Role purchases.')
                        .setRequired(true)
                )
        ),

    async execute(interaction, config, client) {
        if (interaction.options.getSubcommand(false) === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }

        return shopBrowse.execute(interaction, config, client);
    },
};
