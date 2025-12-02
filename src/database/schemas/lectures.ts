import { sql } from "drizzle-orm";
import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";

export const lectures = pgTable(
	"lectures",
	{
		description: text("description"),
		duration: real("duration").notNull(),
		fullText: text("full_text").notNull(),
		id: serial("id").primaryKey(),
		title: text("title").notNull(),
		topic: text("topic").notNull(),
		...timestamps,
	},
	table => [
		index("lectures_search_idx").using(
			"gin",
			sql`to_tsvector('russian', coalesce(${table.title}, '') || ' ' || coalesce(${table.fullText}, ''))`
		),
	]
);

export const lectureWords = pgTable(
	"lecture_words",
	{
		end: real("end").notNull(),
		id: serial("id").primaryKey(),
		lectureId: integer("lecture_id")
			.references(() => lectures.id, { onDelete: "cascade" })
			.notNull(),
		logprob: real("logprob").default(0),
		position: integer("position").notNull(),
		start: real("start").notNull(),
		text: text("text").notNull(),
		type: text("type").notNull(), // 'word' или 'spacing'
		...timestamps,
	},
	table => [
		index("lecture_words_lecture_idx").on(table.lectureId),
		index("lecture_words_time_idx").on(table.lectureId, table.start),
	]
);

export const lectureSegments = pgTable(
	"lecture_segments",
	{
		endPosition: integer("end_position").notNull(),
		endTime: real("end_time").notNull(),
		id: serial("id").primaryKey(),
		lectureId: integer("lecture_id")
			.references(() => lectures.id, { onDelete: "cascade" })
			.notNull(),
		startPosition: integer("start_position").notNull(),
		startTime: real("start_time").notNull(),
		text: text("text").notNull(),
		...timestamps,
	},
	table => [
		index("segments_lecture_idx").on(table.lectureId),
		index("segments_search_idx").using("gin", sql`to_tsvector('russian', ${table.text})`),
	]
);
