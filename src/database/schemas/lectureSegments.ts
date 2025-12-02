import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { lecturesTable } from "./lectures";

export const lectureSegmentsTable = pgTable(
	"lecture_segments",
	{
		endPosition: integer("end_position").notNull(),
		endTime: real("end_time").notNull(),
		id: serial("id").primaryKey(),
		lectureId: integer("lecture_id")
			.references(() => lecturesTable.id, { onDelete: "cascade" })
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

export const lectureSegmentsRelations = relations(lectureSegmentsTable, ({ one }) => ({
	lecture: one(lecturesTable, {
		fields: [lectureSegmentsTable.lectureId],
		references: [lecturesTable.id],
	}),
}));
