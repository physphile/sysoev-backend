import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";

import { betterAuth } from "./betterAuth";
import { OpenAPI } from "./OpenAPI";

const port = 3000;

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
	.listen(port);

console.log(`Swagger docs available at http://localhost:${port}/docs`);
