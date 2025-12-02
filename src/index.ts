import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { eq, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-typebox";
import { Elysia, t } from "elysia";

import { betterAuth } from "./betterAuth";
import { lectures, lectureSegments } from "./database";
import { db } from "./database/db";
import { OpenAPI } from "./OpenAPI";

const port = 3000;

const lectureSelectSchema = createSelectSchema(lectures);

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
		"/lectures",
		() =>
			db
				.select({
					createdAt: lectures.createdAt,
					description: lectures.description,
					duration: lectures.duration,
					id: lectures.id,
					title: lectures.title,
					topic: lectures.topic,
					updatedAt: lectures.updatedAt,
				})
				.from(lectures),
		{
			response: t.Array(t.Omit(lectureSelectSchema, ["fullText"])),
		}
	)
	.get(
		"/lectures/:id",
		async ({ params }) => {
			const rows = await db.select().from(lectures).where(eq(lectures.id, params.id));
			const row = rows.at(0);

			if (row === undefined) {
				throw new Error("Lecture not found");
			}

			return row;
		},
		{
			params: t.Object({
				id: t.Numeric(),
			}),
			response: lectureSelectSchema,
		}
	)
	.get(
		"/lectures/search",
		({ query: { limit = 10, offset = 0, query } }) =>
			db
				.select({
					endTime: lectureSegments.endTime,
					fragment: sql<string>`ts_headline(
        'russian', 
        ${lectureSegments.text}, 
        websearch_to_tsquery('russian', ${query}),
        'MaxFragments=1, MaxWords=30, MinWords=15, StartSel=<mark>, StopSel=</mark>'
      )`,
					lectureId: lectures.id,
					lectureTitle: lectures.title,
					rank: sql<number>`ts_rank(
        to_tsvector('russian', ${lectureSegments.text}), 
        websearch_to_tsquery('russian', ${query})
      )`,
					startTime: lectureSegments.startTime,
				})
				.from(lectureSegments)
				.innerJoin(lectures, sql`${lectures.id} = ${lectureSegments.lectureId}`)
				.where(sql`to_tsvector('russian', ${lectureSegments.text}) @@ websearch_to_tsquery('russian', ${query})`)
				.orderBy(
					sql`ts_rank(
      to_tsvector('russian', ${lectureSegments.text}), 
      websearch_to_tsquery('russian', ${query})
    ) DESC`
				)
				.limit(limit)
				.offset(offset),
		{
			query: t.Object({
				limit: t.Optional(t.Numeric()),
				offset: t.Optional(t.Numeric()),
				query: t.String({ minLength: 3 }),
			}),
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
