/* eslint-disable unicorn/no-process-exit */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { db, lectures, lectureSegments, lectureWords } from "./src/database";

interface ResponseJson {
	languageCode: string;
	languageProbability: number;
	transcriptionId?: string;
	words: Word[];
}

interface Word {
	end: number;
	logprob: number;
	start: number;
	text: string;
	type: "spacing" | "word";
}

function createSegments(words: Word[]): {
	endPosition: number;
	endTime: number;
	startPosition: number;
	startTime: number;
	text: string;
}[] {
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
}

function extractMetadata(dirPath: string): { title: string; topic: string } {
	const parts = dirPath.split("/");
	const lectureName = parts.at(-1);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const topic = parts.find(part => /^[ ЁА-яё]+$/.exec(part))!;

	const numberMatch = lectureName?.match(/(\d+)/)?.at(1);

	if (numberMatch === undefined) {
		return { title: topic, topic };
	}

	return { title: `${topic}. Беседа №${Number(numberMatch)}`, topic };
}

async function findResponseFiles(dir: string, results: string[] = []): Promise<string[]> {
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
}

async function main() {
	const lecturesDir = path.join(process.cwd(), "public", "lectures");

	console.log(`Поиск файлов в ${lecturesDir}...\n`);

	const directories = await findResponseFiles(lecturesDir);

	console.log(`Найдено ${directories.length} директорий с лекциями\n`);

	for (const dir of directories) {
		await uploadLecture(dir);
	}

	console.log("✓ Все лекции успешно загружены!");
	process.exit(0);
}

async function uploadLecture(dirPath: string) {
	console.log(`Обработка: ${dirPath}`);

	try {
		const txtPath = path.join(dirPath, "response.txt");
		const jsonPath = path.join(dirPath, "response.json");

		const fullText = await readFile(txtPath, "utf-8");
		const jsonData: ResponseJson = JSON.parse(await readFile(jsonPath, "utf-8"));

		const { title, topic } = extractMetadata(dirPath);

		const duration = jsonData.words.length > 0 ? jsonData.words.at(-1).end : 0;

		const [lecture] = await db
			.insert(lectures)
			.values({
				duration,
				fullText,
				title,
				topic,
			})
			.returning();

		console.log(`  ✓ Создана лекция ID=${lecture.id}: ${title}`);

		const BATCH_SIZE = 1000;
		for (let i = 0; i < jsonData.words.length; i += BATCH_SIZE) {
			const batch = jsonData.words.slice(i, i + BATCH_SIZE);
			const wordsToInsert = batch.map((word, idx) => ({
				end: word.end,
				lectureId: lecture.id,
				logprob: word.logprob,
				position: i + idx,
				start: word.start,
				text: word.text,
				type: word.type,
			}));

			await db.insert(lectureWords).values(wordsToInsert);
		}

		console.log(`  ✓ Загружено ${jsonData.words.length} слов`);

		const segments = createSegments(jsonData.words);
		for (const segment of segments) {
			await db.insert(lectureSegments).values({
				endPosition: segment.endPosition,
				endTime: segment.endTime,
				lectureId: lecture.id,
				startPosition: segment.startPosition,
				startTime: segment.startTime,
				text: segment.text,
			});
		}

		console.log(`  ✓ Создано ${segments.length} сегментов`);
		console.log(`  ✓ Лекция "${title}" успешно загружена!\n`);
	} catch (error) {
		console.error(`  ✗ Ошибка при обработке ${dirPath}:`, error);
	}
}

main().catch(error => {
	console.error("Критическая ошибка:", error);
	process.exit(1);
});
