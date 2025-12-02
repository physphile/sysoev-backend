/* eslint-disable unicorn/no-process-exit */
import { spawn } from "node:child_process";
import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

interface ProcessResult {
	directory: string;
	error?: string;
	filesCount: number;
	outputFile: string;
	success: boolean;
}

/**
 * Concatenates and converts audio files using ffmpeg
 */
async function concatenateAndConvert(inputFiles: string[], outputFile: string): Promise<ProcessResult> {
	const directory = path.dirname(outputFile);
	const filesCount = inputFiles.length;

	// Create a temporary concat list file for ffmpeg
	const concatListPath = path.join(tmpdir(), `concat_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);

	try {
		// Create concat demuxer file list
		// Format: file '/path/to/file.orig'
		// Escape single quotes in paths and use absolute paths
		const fileList = inputFiles
			.map(f => {
				// Convert to absolute path if needed
				const absolutePath = f.startsWith("/") ? f : path.join(process.cwd(), f);
				// Escape single quotes by replacing ' with '\''
				const escapedPath = absolutePath.replaceAll("'", String.raw`'\''`);
				return `file '${escapedPath}'`;
			})
			.join("\n");
		await writeFile(concatListPath, fileList, "utf8");

		return await new Promise(resolve => {
			// Use concat demuxer to merge files, then convert
			const ffmpeg = spawn("ffmpeg", [
				"-y", // Overwrite output files
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				concatListPath,
				"-ac",
				"1", // Mono audio
				"-ar",
				"16000", // Sample rate 16kHz
				"-c:a",
				"pcm_s16le", // PCM signed 16-bit little-endian
				outputFile,
			]);

			let errorOutput = "";

			ffmpeg.stderr.on("data", data => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				errorOutput += data.toString();
			});

			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			ffmpeg.on("close", async code => {
				// Clean up temporary file
				try {
					await unlink(concatListPath);
				} catch {
					// Ignore cleanup errors
				}

				if (code === 0) {
					resolve({
						directory,
						filesCount,
						outputFile,
						success: true,
					});
				} else {
					resolve({
						directory,
						error: `ffmpeg exited with code ${code}\n${errorOutput}`,
						filesCount,
						outputFile,
						success: false,
					});
				}
			});

			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			ffmpeg.on("error", async error => {
				// Clean up temporary file
				try {
					await unlink(concatListPath);
				} catch {
					// Ignore cleanup errors
				}

				resolve({
					directory,
					error: error.message,
					filesCount,
					outputFile,
					success: false,
				});
			});
		});
	} catch (error) {
		// Clean up temporary file in case of error
		try {
			await unlink(concatListPath);
		} catch {
			// Ignore cleanup errors
		}

		return {
			directory,
			error: error instanceof Error ? error.message : String(error),
			filesCount,
			outputFile,
			success: false,
		};
	}
}

/**
 * Recursively finds all directories containing .orig files
 */
async function findDirectoriesWithOrigFiles(dir: string): Promise<Map<string, string[]>> {
	const directoriesWithFiles = new Map<string, string[]>();

	async function walk(currentDir: string) {
		try {
			const entries = await readdir(currentDir, { withFileTypes: true });

			const origFiles: string[] = [];

			for (const entry of entries) {
				const fullPath = path.join(currentDir, entry.name);

				if (entry.isDirectory()) {
					// Recursively search subdirectories
					await walk(fullPath);
				} else if (entry.isFile() && path.extname(entry.name) === ".orig") {
					origFiles.push(fullPath);
				}
			}

			// If current directory has .orig files, add it to the map
			if (origFiles.length > 0) {
				// Sort files to ensure consistent order
				origFiles.sort();
				directoriesWithFiles.set(currentDir, origFiles);
			}
		} catch (error) {
			console.error(`Error reading directory ${currentDir}:`, error);
		}
	}

	await walk(dir);
	return directoriesWithFiles;
}

/**
 * Processes a directory by concatenating all .orig files and converting them
 */
const processDirectory = async (directory: string, files: string[]): Promise<ProcessResult> => {
	console.log(`\nProcessing directory: ${directory}`);
	console.log(`  Found ${files.length} .orig file(s):`);

	for (const [index, file] of files.entries()) {
		console.log(`    ${index + 1}. ${path.basename(file)}`);
	}

	// Output file will be named after the directory
	const dirName = path.basename(directory);
	const outputFile = path.join(directory, `${dirName}.wav`);

	console.log(`  Concatenating and converting to: ${path.basename(outputFile)}`);

	const result = await concatenateAndConvert(files, outputFile);

	if (result.success) {
		console.log(`  ✓ Success: ${path.basename(outputFile)}`);
	} else {
		console.error(`  ✗ Failed`);
		console.error(`    Error: ${result.error}`);
	}

	return result;
};

/**
 * Main function
 */
async function main() {
	const startDir = process.argv.at(2);

	if (process.argv.length !== 3 || startDir === undefined) {
		console.error("Usage: node merge_mp3.ts <start-directory>");
		process.exit(1);
	}

	console.log(`Starting recursive search from: ${startDir}`);

	// Check if directory exists
	try {
		const stats = await stat(startDir);
		if (!stats.isDirectory()) {
			console.error(`Error: ${startDir} is not a directory`);
			process.exit(1);
		}
	} catch (error) {
		console.error(`Error: Cannot access ${startDir}:`, error);
		process.exit(1);
	}

	// Find all directories with .orig files
	console.log("Searching for directories with .orig files...");
	const directoriesWithFiles = await findDirectoriesWithOrigFiles(startDir);

	if (directoriesWithFiles.size === 0) {
		console.log("No directories with .orig files found");
		return;
	}

	const totalFiles = [...directoriesWithFiles.values()].reduce((sum, files) => sum + files.length, 0);

	console.log(`\nFound ${directoriesWithFiles.size} director(ies) with ${totalFiles} .orig file(s) in total`);

	// Process each directory
	const allResults: ProcessResult[] = [];
	for (const [dir, files] of directoriesWithFiles) {
		const result = await processDirectory(dir, files);
		allResults.push(result);
	}

	// Summary
	console.log("\n" + "=".repeat(60));
	console.log("SUMMARY");
	console.log("=".repeat(60));

	const successful = allResults.filter(r => r.success).length;
	const failed = allResults.filter(r => !r.success).length;

	console.log(`Total directories processed: ${allResults.length}`);
	console.log(`Successful: ${successful}`);
	console.log(`Failed: ${failed}`);

	if (successful > 0) {
		console.log("\nSuccessfully created files:");
		for (const result of allResults.filter(r => r.success)) {
			console.log(`  ✓ ${result.outputFile} (merged ${result.filesCount} file(s))`);
		}
	}

	if (failed > 0) {
		console.log("\nFailed directories:");
		for (const result of allResults.filter(r => !r.success)) {
			console.log(`  ✗ ${result.directory}`);
		}
	}
}

// Run the script
try {
	await main();
} catch (error) {
	console.error("Fatal error:", error);
	process.exit(1);
}
