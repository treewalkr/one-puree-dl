import { Command } from "commander";
import { extractStreamUrl } from "./extractor";

const program = new Command();

program
  .name("one-puree-dl")
  .description("Extract HLS video stream URLs from opuree.com episode pages")
  .argument("<episode>", "Episode number")
  .action(async (episode: string) => {
    const id = parseInt(episode, 10);
    if (isNaN(id)) {
      console.error(`Invalid episode number: ${episode}`);
      process.exit(1);
    }

    try {
      const info = await extractStreamUrl(id);
      console.log(`Episode ${info.episodeId}: ${info.title}`);
      console.log(`  HLS URL: ${info.hlsUrl}`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program.parse();
