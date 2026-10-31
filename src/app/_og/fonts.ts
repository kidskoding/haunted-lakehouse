import { readFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * ImageResponse cannot read next/font's woff2 files, so share cards carry their own TrueType
 * copies of the two faces, cut to printable ASCII to stay small: Fraunces at the title
 * preset's axes (opsz 144, SOFT 50, WONK 1, weight 600) and Atkinson Hyperlegible Next
 * Regular. Their license is in OFL.txt.
 */
function font(file: string): Promise<Buffer> {
  return readFile(join(process.cwd(), "src/app/_og", file));
}

/** The fonts option for an ImageResponse: `Fraunces` for titles, `Atkinson` for text. */
export async function ogFonts() {
  const [fraunces, atkinson] = await Promise.all([
    font("fraunces-title.ttf"),
    font("atkinson-regular.ttf"),
  ]);
  return [
    { name: "Fraunces", data: fraunces, weight: 600, style: "normal" },
    { name: "Atkinson", data: atkinson, weight: 400, style: "normal" },
  ] as const;
}
