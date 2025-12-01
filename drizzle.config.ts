import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env["DATABASE_URL"];

if (url === undefined) {
	throw new Error("Missing environment variables");
}

export default defineConfig({
	dbCredentials: {
		url,
	},
	dialect: "postgresql",
	out: "./drizzle",
	schema: "./src/database/schemas",
});
