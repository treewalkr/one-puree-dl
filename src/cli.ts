import { resolve } from "node:path";
import { Command } from "commander";
import { extractStreamUrl } from "./extractor";
import { downloadSegments } from "./downloader";

const program = new Command();

program
  .name("one-puree-dl")
  .description("Extract HLS video stream URLs from opuree.com episode pages")
  .argument("<episode>", "Episode number or range (e.g. 1096 or 1096-1100)")
  .option("-d, --download", "Download video to mp4")
  .option("-o, --output <path>", "Output file path (single episode only)")
  .option("--json", "Output as JSON")
  .action(async (episode: string, options: { download?: boolean; output?: string; json?: boolean }) => {
    const episodeIds = parseEpisodeArg(episode);

    for (const id of episodeIds) {
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
        console.error(`Error extracting episode ${id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  });

function parseEpisodeArg(arg: string): number[] {
  if (arg.includes("-")) {
    const [start, end] = arg.split("-").map(Number);
    if (!start || !end || start > end) {
      throw new Error(`Invalid episode range: ${arg}`);
    }
    const ids: number[] = [];
    for (let i = start; i <= end; i++) {
      ids.push(i);
    }
    return ids;
  }

  const id = parseInt(arg, 10);
  if (isNaN(id)) {
    throw new Error(`Invalid episode number: ${arg}`);
  }
  return [id];
}

program.parse();
