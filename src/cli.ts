import { resolve } from "node:path";
import { Command } from "commander";
import { extractStreamUrl } from "./extractor";
import { downloadSegments } from "./downloader";

const program = new Command();

program
  .name("one-puree-dl")
  .description("Extract HLS video stream URLs from opuree.com episode pages")
  .argument("<episode>", "Episode number")
  .option("-d, --download", "Download video to mp4")
  .option("-o, --output <path>", "Output file path")
  .option("--json", "Output as JSON")
  .action(async (episode: string, options: { download?: boolean; output?: string; json?: boolean }) => {
    const id = parseInt(episode, 10);
    if (isNaN(id)) {
      console.error(`Invalid episode number: ${episode}`);
      process.exit(1);
    }

    try {
      const info = await extractStreamUrl(id);

      if (options.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log(`Episode ${info.episodeId}: ${info.title}`);
        console.log(`  HLS URL: ${info.hlsUrl}`);
      }

      if (options.download) {
        const outputPath = options.output ? resolve(options.output) : resolve(`episode-${id}.mp4`);
        await downloadSegments(info.hlsUrl, info.referer, outputPath);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program.parse();
