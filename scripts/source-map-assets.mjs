import { readFile } from "node:fs/promises";
import path from "node:path";

export async function embedSourceMapSources(sourceMapFilename) {
  let sourceMap;
  try {
    sourceMap = JSON.parse(await readFile(sourceMapFilename, "utf8"));
  } catch (error) {
    throw new Error(`Could not read source map ${sourceMapFilename}: ${error.message}`);
  }

  if (!sourceMap || !Array.isArray(sourceMap.sources) || sourceMap.sources.length === 0) {
    throw new Error(`Source map has no source files: ${sourceMapFilename}`);
  }

  const sourceRoot = typeof sourceMap.sourceRoot === "string" ? sourceMap.sourceRoot : "";
  const mapDirectory = path.dirname(sourceMapFilename);
  sourceMap.sourcesContent = await Promise.all(
    sourceMap.sources.map(async (source) => {
      if (
        typeof source !== "string" ||
        source.length === 0 ||
        path.isAbsolute(source) ||
        /^[a-z][a-z0-9+.-]*:/i.test(source)
      ) {
        throw new Error(`Source map contains a non-local source: ${sourceMapFilename}`);
      }

      const filename = path.resolve(mapDirectory, sourceRoot, source);
      try {
        return await readFile(filename, "utf8");
      } catch (error) {
        throw new Error(`Could not embed ${source} from ${sourceMapFilename}: ${error.message}`);
      }
    }),
  );

  return `${JSON.stringify(sourceMap)}\n`;
}
