import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, real, serial, text } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { lecturesTable } from "./lectures";

export const lectureWordsTypeEnum = pgEnum("lecture_words_type", ["word", "spacing", "audio_event"]);

export const lectureWordsTable = pgTable(
	"lecture_words",
	{
		end: real("end").notNull(),
		id: serial("id").primaryKey(),
		lectureId: integer("lecture_id")
			.references(() => lecturesTable.id, { onDelete: "cascade" })
			.notNull(),
		position: integer("position").notNull(),
		start: real("start").notNull(),
		text: text("text").notNull(),
		type: lectureWordsTypeEnum("type").notNull(),
		...timestamps,
	},
	table => [
		index("lecture_words_lecture_idx").on(table.lectureId),
		index("lecture_words_time_idx").on(table.lectureId, table.start),
	]
);

export const lectureWordsRelations = relations(lectureWordsTable, ({ one }) => ({
	lecture: one(lecturesTable, {
		fields: [lectureWordsTable.lectureId],
		references: [lecturesTable.id],
	}),
}));
