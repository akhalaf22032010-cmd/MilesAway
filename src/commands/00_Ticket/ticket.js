// Load the existing ticket system early so it is retained when the bot has more than 100 commands.
// The command loader de-duplicates commands by slash-command name.
export { default } from '../Ticket/ticket.js';
