import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, real, serial, text, unique } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";

export const topicsTable = pgTable("topics", {
	id: serial("id").primaryKey(),
	name: text("name").notNull().unique(),
	...timestamps,
});

export const lecturesTable = pgTable(
	"lectures",
	{
		description: text("description"),
		duration: real("duration").notNull(),
		fullText: text("full_text").notNull(),
		id: serial("id").primaryKey(),
		order: integer("order").notNull(),
		src: text("src").notNull(),
		title: text("title").notNull(),
		topicId: integer("topic_id")
			.references(() => topicsTable.id, { onDelete: "restrict" })
			.notNull(),
		...timestamps,
	},
	table => [
		unique("lectures_order_topic_id_unique").on(table.order, table.topicId),
		index("lectures_search_idx").using(
			"gin",
			sql`to_tsvector('russian', coalesce(${table.title}, '') || ' ' || coalesce(${table.fullText}, ''))`
		),
		index("lectures_topic_id_idx").on(table.topicId),
	]
);

export const lecturersRelations = relations(lecturesTable, ({ one }) => ({
	topic: one(topicsTable, {
		fields: [lecturesTable.topicId],
		references: [topicsTable.id],
	}),
}));

export const topicsRelations = relations(topicsTable, ({ many }) => ({
	lectures: many(lecturesTable),
}));
