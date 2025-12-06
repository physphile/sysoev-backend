/* eslint-disable unicorn/no-process-exit */
import { spawn } from "node:child_process";
import { access, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

interface ProcessResult {
	directory: string;
	error?: string;
	filesCount: number;
	mp3File: string;
	mp3Skipped?: boolean;
	success: boolean;
	wavFile: string;
	wavSkipped?: boolean;
}

const fileExists = async (filePath: string): Promise<boolean> => {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
};

const runFfmpeg = async (args: string[]): Promise<{ error?: string; success: boolean }> =>
	new Promise(resolve => {
		const ffmpeg = spawn("ffmpeg", args);
		let errorOutput = "";

		ffmpeg.stderr.on("data", data => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			errorOutput += data.toString();
		});

		ffmpeg.on("close", code => {
			if (code === 0) {
				resolve({ success: true });
			} else {
				resolve({
					error: `ffmpeg exited with code ${code}\n${errorOutput}`,
					success: false,
				});
			}
		});

		ffmpeg.on("error", error => {
			resolve({
				error: error.message,
				success: false,
			});
		});
	});

/**
 * Concatenates audio files to MP3 and WAV using ffmpeg
 */
const concatenateAndConvert = async (
	inputFiles: string[],
	mp3File: string,
	wavFile: string
): Promise<ProcessResult> => {
	const directory = path.dirname(mp3File);
	const filesCount = inputFiles.length;

	const mp3Exists = await fileExists(mp3File);
	const wavExists = await fileExists(wavFile);

	// Both files exist, skip processing
	if (mp3Exists && wavExists) {
		return {
			directory,
			filesCount,
			mp3File,
			mp3Skipped: true,
			success: true,
			wavFile,
			wavSkipped: true,
		};
	}

	// Create a temporary concat list file for ffmpeg
	const concatListPath = path.join(tmpdir(), `concat_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);

	// Create concat demuxer file list
	const fileList = inputFiles
		.map(f => {
			const absolutePath = f.startsWith("/") ? f : path.join(process.cwd(), f);
			const escapedPath = absolutePath.replaceAll("'", String.raw`'\''`);
			return `file '${escapedPath}'`;
		})
		.join("\n");

	try {
		await writeFile(concatListPath, fileList, "utf8");

		const mp3Skipped = mp3Exists;
		const wavSkipped = wavExists;

		// Шаг 1: Объединить .orig файлы в MP3 (если не существует)
		if (!mp3Exists) {
			const mp3Result = await runFfmpeg([
				"-y", // Перезаписывать выходной файл без вопросов
				"-f", // Формат входных данных
				"concat", // Демуксер для склейки файлов
				"-safe", // Разрешить небезопасные пути
				"0", // 0 = разрешить любые пути
				"-i", // Входной файл
				concatListPath, // Путь к списку файлов
				"-c:a", // Аудиокодек
				"libmp3lame", // Кодировщик LAME MP3
				"-q:a", // Качество аудио (VBR)
				"5", // Качество 5 (~130 kbps, хорошо для речи)
				mp3File, // Выходной файл
			]);

			if (!mp3Result.success) {
				await unlink(concatListPath).catch(() => {
					// Ignore cleanup errors
				});
				return {
					directory,
					error: `MP3 creation failed: ${mp3Result.error}`,
					filesCount,
					mp3File,
					success: false,
					wavFile,
				};
			}
		}

		// Шаг 2: Объединить .orig файлы в WAV (если не существует)
		if (!wavExists) {
			const wavResult = await runFfmpeg([
				"-y", // Перезаписывать выходной файл без вопросов
				"-f", // Формат входных данных
				"concat", // Демуксер для склейки файлов
				"-safe", // Разрешить небезопасные пути
				"0", // 0 = разрешить любые пути
				"-i", // Входной файл
				concatListPath, // Путь к списку файлов
				"-ac", // Количество аудиоканалов
				"1", // Моно
				"-ar", // Частота дискретизации
				"16000", // 16 кГц (нужно для распознавания речи)
				"-c:a", // Аудиокодек
				"pcm_s16le", // PCM 16-бит little-endian (без сжатия)
				wavFile, // Выходной файл
			]);

			if (!wavResult.success) {
				await unlink(concatListPath).catch(() => {
					// Ignore cleanup errors
				});
				return {
					directory,
					error: `WAV creation failed: ${wavResult.error}`,
					filesCount,
					mp3File,
					mp3Skipped,
					success: false,
					wavFile,
				};
			}
		}

		await unlink(concatListPath).catch(() => {
			// Ignore cleanup errors
		});

		return {
			directory,
			filesCount,
			mp3File,
			mp3Skipped,
			success: true,
			wavFile,
			wavSkipped,
		};
	} catch (error) {
		await unlink(concatListPath).catch(() => {
			// Ignore cleanup errors
		});

		return {
			directory,
			error: error instanceof Error ? error.message : String(error),
			filesCount,
			mp3File,
			success: false,
			wavFile,
		};
	}
};

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

	// Output files will be named after the directory
	const dirName = path.basename(directory);
	const mp3File = path.join(directory, `${dirName}.mp3`);
	const wavFile = path.join(directory, `${dirName}.wav`);

	console.log(`  Concatenating to: ${path.basename(mp3File)}`);
	console.log(`  Converting to: ${path.basename(wavFile)}`);

	const result = await concatenateAndConvert(files, mp3File, wavFile);

	if (result.success) {
		const mp3Status = result.mp3Skipped === true ? "skipped" : "created";
		const wavStatus = result.wavSkipped === true ? "skipped" : "created";
		console.log(`  ✓ ${path.basename(mp3File)} (${mp3Status}), ${path.basename(wavFile)} (${wavStatus})`);
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
		console.log("\nSuccessfully processed:");
		for (const result of allResults.filter(r => r.success)) {
			const mp3Status = result.mp3Skipped === true ? "skipped" : `merged ${result.filesCount} file(s)`;
			const wavStatus = result.wavSkipped === true ? "skipped" : "created";
			console.log(`  ✓ ${result.mp3File} (${mp3Status})`);
			console.log(`  ✓ ${result.wavFile} (${wavStatus})`);
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
