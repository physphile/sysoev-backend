import { auth } from "./auth";

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());

export const OpenAPI = {
	getPaths: (prefix = "/auth/api") =>
		getSchema().then(({ paths }) => {
			const reference: typeof paths = Object.create(null);

			for (const [path, value] of Object.entries(paths)) {
				const key = prefix + path;
				reference[key] = value;

				for (const method of Object.keys(value)) {
					const operation = (reference[key] as any)[method];

					operation.tags = ["Better Auth"];
				}
			}

			return reference;
		}) as Promise<any>,
	components: getSchema().then(({ components }) => components) as Promise<any>,
} as const;
