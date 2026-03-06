import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createSessionThread } from '../../services/thread-creator.js';
import type { Command } from '../../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('corven')
    .setDescription('Start a conversation with Corven')
    .addStringOption((opt) =>
      opt.setName('prompt').setDescription('What do you want to talk about?').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prompt = interaction.options.getString('prompt', true);

    const result = await createSessionThread({
      interaction,
      prompt,
      agentKey: 'corven',
      destinationChannel: 'corven' // always routed to #corven
    });

    if (result.success) {
      await interaction.editReply({
        content: `\u{1fab6} Session with Corven \u2192 <#${result.threadId}>`
      });
    } else {
      await interaction.editReply({
        content: `\u274c ${result.error}`
      });
    }
  }
};

export default command;
