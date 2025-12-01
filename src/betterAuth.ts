import { Elysia } from "elysia";

import { auth } from "./auth";

export const betterAuth = new Elysia({ name: "better-auth" }).mount("/auth", auth.handler).macro({
	auth: {
		async resolve({ request: { headers }, status }) {
			const session = await auth.api.getSession({
				headers,
			});

			if (!session) return status(401);

			return {
				session: session.session,
				user: session.user,
			};
		},
	},
});
