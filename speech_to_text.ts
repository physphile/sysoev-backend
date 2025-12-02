/* eslint-disable unicorn/no-process-exit */
import "dotenv/config";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api";
import type {
	SpeechToTextConvertResponse,
	TranscriptsGetResponse,
} from "@elevenlabs/elevenlabs-js/api/resources/speechToText";

import { ElevenLabsClient, ElevenLabsError, ElevenLabsTimeoutError } from "@elevenlabs/elevenlabs-js";
import { readFile, writeFile } from "node:fs/promises";

const isSpeechToTextModel = (
	model: SpeechToTextConvertResponse | TranscriptsGetResponse
): model is SpeechToTextChunkResponseModel => {
	return "text" in model && "words" in model;
};

if (process.env["ELEVENLABS_API_KEY"] === undefined) {
	throw new Error('process.env["ELEVENLABS_API_KEY"] is not set');
}

const client = new ElevenLabsClient({
	apiKey: process.env["ELEVENLABS_API_KEY"],
	environment: "https://api.elevenlabs.io",
});

// Получаем путь из аргументов командной строки
const path = process.argv.at(2);

if (process.argv.length !== 3 || path === undefined) {
	console.error("Usage: node speech_to_text.ts <path-to-audio-file>");
	process.exit(1);
}

const file = await readFile(path);

try {
	const response = await client.speechToText.convert({
		diarize: false,
		file,
		fileFormat: "pcm_s16le_16",
		languageCode: "ru",
		modelId: "scribe_v1",
		tagAudioEvents: false,
	});

	if (isSpeechToTextModel(response)) {
		const { text, ...rest } = response;

		const dirPath = path.split("/").slice(0, -1).join("/");

		await writeFile(`${dirPath}/response.txt`, text);
		await writeFile(`${dirPath}/response.json`, JSON.stringify(rest, null, 2));
	} else {
		console.error("Unexpected response model");
		process.exit(1);
	}
} catch (error) {
	if (error instanceof ElevenLabsTimeoutError) {
		console.error(`ElevenLabsTimeoutError: ${error.message}`);
	} else if (error instanceof ElevenLabsError) {
		console.error(`ElevenLabsError: ${error.message}`);
	} else if (error instanceof Error) {
		console.error(`Error: ${error.message}`);
	} else {
		console.error(`Unexpected error: ${String(error)}`);
	}
	process.exit(1);
}
