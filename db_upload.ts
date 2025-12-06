/* eslint-disable unicorn/no-process-exit */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { db, lectureSegmentsTable, lecturesTable, lectureWordsTable } from "./src/database";
import { topicsTable } from "./src/database/schemas";

interface ResponseJson {
	languageCode: string;
	languageProbability: number;
	transcriptionId?: string;
	words: Word[];
}

interface Word {
	end: number;
	start: number;
	text: string;
	type: "spacing" | "word";
}

const createSegments = (
	words: Word[]
): {
	endPosition: number;
	endTime: number;
	startPosition: number;
	startTime: number;
	text: string;
}[] => {
	const segments: {
		endPosition: number;
		endTime: number;
		startPosition: number;
		startTime: number;
		text: string;
	}[] = [];

	const SEGMENT_SIZE = 200;
	let currentSegmentWords: Word[] = [];
	let currentStartPosition = 0;

	for (const [index, word] of words.entries()) {
		if (word.type === "word") {
			currentSegmentWords.push(word);
		} else {
			if (currentSegmentWords.length > 0) {
				currentSegmentWords.push(word);
			}
		}

		const wordCount = currentSegmentWords.filter(w => w.type === "word").length;
		if ((wordCount >= SEGMENT_SIZE || index === words.length - 1) && currentSegmentWords.length > 0) {
			const segmentText = currentSegmentWords.map(w => w.text).join("");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const startTime = currentSegmentWords.at(0)!.start;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const endTime = currentSegmentWords.at(-1)!.end;

			segments.push({
				endPosition: index,
				endTime,
				startPosition: currentStartPosition,
				startTime,
				text: segmentText,
			});

			currentStartPosition = index + 1;
			currentSegmentWords = [];
		}
	}

	return segments;
};

const extractMetadata = (dirPath: string) => {
	const parts = dirPath.split("/");
	const lectureName = parts.at(-1);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const topic = parts.find(part => /^[ ЁА-яё]+$/.exec(part))!;

	const numberMatch = lectureName?.match(/(\d+)/)?.at(1);

	if (numberMatch === undefined) {
		return { order: 1, title: topic, topic };
	}

	const order = Number(numberMatch);
	return { order, title: `Беседа №${order}`, topic };
};

const findResponseFiles = async (dir: string, results: string[] = []): Promise<string[]> => {
	const entries = await readdir(dir);

	const hasResponseTxt = entries.includes("response.txt");
	const hasResponseJson = entries.includes("response.json");

	if (hasResponseTxt && hasResponseJson) {
		results.push(dir);
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		try {
			const stats = await stat(fullPath);
			if (stats.isDirectory()) {
				await findResponseFiles(fullPath, results);
			}
		} catch (error) {
			console.error(`Ошибка при чтении ${fullPath}:`, error);
		}
	}

	return results;
};

const findMp3File = async (dirPath: string): Promise<`${string}.mp3` | undefined> => {
	const entries = await readdir(dirPath);
	const mp3File = entries.find((entry): entry is `${string}.mp3` => entry.toLowerCase().endsWith(".mp3"));
	return mp3File;
};

const uploadLecture = async (dirPath: string) => {
	console.log(`Обработка: ${dirPath}`);

	try {
		const mp3File = await findMp3File(dirPath);
		if (mp3File === undefined) {
			console.error(`  ✗ Файл .mp3 не найден в ${dirPath}`);
			return;
		}

		const publicDir = path.join(process.cwd(), "public");
		const src = "/" + path.relative(publicDir, path.join(dirPath, mp3File));

		console.log(`  ✓ Файл .mp3 найден: ${src}`);

		const txtPath = path.join(dirPath, "response.txt");
		const jsonPath = path.join(dirPath, "response.json");

		const fullText = await readFile(txtPath, "utf8");
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const jsonData: ResponseJson = JSON.parse(await readFile(jsonPath, "utf8"));

		const { order, title, topic } = extractMetadata(dirPath);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const duration = jsonData.words.length > 0 ? jsonData.words.at(-1)!.end : 0;

		const topicValues = {
			name: topic,
		};

		const [topicRecord] = await db
			.insert(topicsTable)
			.values(topicValues)
			.onConflictDoUpdate({ set: topicValues, target: topicsTable.name })
			.returning({ id: topicsTable.id });

		const lectureValues = {
			duration,
			fullText,
			order,
			src,
			title,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			topicId: topicRecord!.id,
		};

		const [lecture] = await db
			.insert(lecturesTable)
			.values(lectureValues)
			.onConflictDoUpdate({
				set: lectureValues,
				target: [lecturesTable.order, lecturesTable.topicId],
			})
			.returning({ id: lecturesTable.id });

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		console.log(`  ✓ Создана лекция ID=${lecture!.id}: ${title}`);

		const SEGMENT_SIZE = 1000;
		for (let segmentIndex = 0; segmentIndex < jsonData.words.length; segmentIndex += SEGMENT_SIZE) {
			const segment = jsonData.words.slice(segmentIndex, segmentIndex + SEGMENT_SIZE);
			const wordsToInsert = segment.map((word, wordIndex) => ({
				end: word.end,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				lectureId: lecture!.id,
				position: segmentIndex + wordIndex,
				start: word.start,
				text: word.text,
				type: word.type,
			}));

			await db.insert(lectureWordsTable).values(wordsToInsert);
		}

		console.log(`  ✓ Загружено ${jsonData.words.length} слов`);

		const segments = createSegments(jsonData.words);
		for (const segment of segments) {
			await db.insert(lectureSegmentsTable).values({
				endPosition: segment.endPosition,
				endTime: segment.endTime,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				lectureId: lecture!.id,
				startPosition: segment.startPosition,
				startTime: segment.startTime,
				text: segment.text,
			});
		}

		console.log(`  ✓ Создано ${segments.length} сегментов`);
		console.log(`  ✓ Лекция "${title}" успешно загружена!\n`);
	} catch (error) {
		console.error(`  ✗ Ошибка при обработке ${dirPath}:`, error);
		process.exit(1);
	}
};

const main = async () => {
	const lecturesDir = path.join(process.cwd(), "public", "lectures");

	console.log(`Поиск файлов в ${lecturesDir}...\n`);

	const directories = await findResponseFiles(lecturesDir);

	console.log(`Найдено ${directories.length} директорий с лекциями\n`);

	for (const dir of directories) {
		await uploadLecture(dir);
	}

	console.log("✓ Все лекции успешно загружены!");
	process.exit(0);
};

try {
	await main();
} catch (error) {
	console.error("Критическая ошибка:", error);
	process.exit(1);
}
