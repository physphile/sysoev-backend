import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { asc, count, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-typebox";
import { Elysia, t } from "elysia";

import { betterAuth } from "./betterAuth";
import { lectureSegmentsTable, lecturesTable, topicsTable } from "./database";
import { db } from "./database/db";
import { OpenAPI } from "./OpenAPI";

const port = 3000;

const lectureSelectSchema = createSelectSchema(lecturesTable);
const topicSelectSchema = createSelectSchema(topicsTable);

const paginationSchema = t.Object({
	limit: t.Optional(t.Numeric()),
	offset: t.Optional(t.Numeric()),
});

new Elysia()
	.use(cors())
	.use(
		swagger({
			documentation: {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				components: await OpenAPI.components,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				paths: await OpenAPI.getPaths(),
			},
			path: "/docs",
		})
	)
	.use(betterAuth)
	.get("/user", ({ user }) => user, {
		auth: true,
	})
	.get(
		"/topics",
		async () => {
			const lecturesCount = db
				.select({
					count: count().as("alias"),
					topicId: lecturesTable.topicId,
				})
				.from(lecturesTable)
				.groupBy(lecturesTable.topicId)
				.as("lectures_count");

			const result = await db
				.select({
					...getTableColumns(topicsTable),
					lecturesCount: lecturesCount.count,
				})
				.from(topicsTable)
				.orderBy(desc(topicsTable.createdAt))
				.leftJoin(lecturesCount, eq(topicsTable.id, lecturesCount.topicId));

			return result;
		},
		{
			response: t.Array(t.Composite([topicSelectSchema, t.Object({ lecturesCount: t.Number() })])),
		}
	)
	.get(
		"/topics/:id",
		async ({ params, set }) => {
			const row = await db.query.topicsTable.findFirst({
				where: eq(topicsTable.id, params.id),
				with: {
					lectures: {
						orderBy: [asc(lecturesTable.order)],
					},
				},
			});
			if (row === undefined) {
				set.status = 404;
				throw new Error(`Topic ${params.id} not found`);
			}
			return row;
		},
		{
			params: t.Object({
				id: t.Numeric(),
			}),
			response: {
				200: t.Composite([topicSelectSchema, t.Object({ lectures: t.Array(lectureSelectSchema) })]),
				404: t.Object({
					detail: t.Literal("Topic <topicId> not found"),
				}),
			},
		}
	)
	.get(
		"/lectures",
		async ({ query: { limit = 10, offset = 0 } }) => {
			const rows = await db.query.lecturesTable.findMany({
				limit,
				offset,
				orderBy: [asc(lecturesTable.order)],
				with: {
					topic: true,
				},
			});

			const total = await db.$count(lecturesTable);

			return { items: rows, total };
		},
		{
			query: paginationSchema,
			response: t.Object({
				items: t.Array(t.Omit(lectureSelectSchema, ["fullText"])),
				total: t.Number(),
			}),
		}
	)
	.get(
		"/lectures/:id",
		async ({ params, set }) => {
			const row = await db.query.lecturesTable.findFirst({ where: eq(lecturesTable.id, params.id) });

			if (row === undefined) {
				set.status = 404;
				throw new Error(`Lecture ${params.id} not found`);
			}

			return row;
		},
		{
			params: t.Object({
				id: t.Numeric(),
			}),
			response: {
				200: lectureSelectSchema,
				404: t.Object({
					detail: t.Literal("Lecture <lectureId> not found"),
				}),
			},
		}
	)
	.get(
		"/lectures/search",
		({ query: { limit = 10, offset = 0, query } }) =>
			db
				.select({
					endTime: lectureSegmentsTable.endTime,
					fragment: sql<string>`ts_headline(
        'russian', 
        ${lectureSegmentsTable.text}, 
        websearch_to_tsquery('russian', ${query}),
        'MaxFragments=1, MaxWords=30, MinWords=15, StartSel=<mark>, StopSel=</mark>'
      )`,
					lectureId: lecturesTable.id,
					lectureTitle: lecturesTable.title,
					rank: sql<number>`ts_rank(
        to_tsvector('russian', ${lectureSegmentsTable.text}), 
        websearch_to_tsquery('russian', ${query})
      )`,
					startTime: lectureSegmentsTable.startTime,
				})
				.from(lectureSegmentsTable)
				.innerJoin(lecturesTable, sql`${lecturesTable.id} = ${lectureSegmentsTable.lectureId}`)
				.where(sql`to_tsvector('russian', ${lectureSegmentsTable.text}) @@ websearch_to_tsquery('russian', ${query})`)
				.orderBy(
					sql`ts_rank(
      to_tsvector('russian', ${lectureSegmentsTable.text}), 
      websearch_to_tsquery('russian', ${query})
    ) DESC`
				)
				.limit(limit)
				.offset(offset),
		{
			query: t.Composite([paginationSchema, t.Object({ query: t.String({ minLength: 3 }) })]),
			response: t.Array(
				t.Object({
					endTime: t.Number(),
					fragment: t.String(),
					lectureId: t.Number(),
					lectureTitle: t.String(),
					rank: t.Number(),
					startTime: t.Number(),
				})
			),
		}
	)
	.listen(port);

console.log(`Swagger docs available at http://localhost:${port}/docs`);
