import { z } from "zod";

import { DEFAULT_API_PORT, validateClerkKeyForEnv } from "@dont-forget/shared";

const requiredStringSchema = z.string().trim().min(1);

const apiServerConfigSchema = z
	.object({
		APP_ENV: requiredStringSchema.pipe(
			z.enum(["local", "test", "staging", "production"]),
		),
		DATABASE_URL: requiredStringSchema,
		CLERK_SECRET_KEY: requiredStringSchema,
		PUBLIC_WEB_BASE_URL: requiredStringSchema.pipe(z.url()),
		RESEND_API_KEY: requiredStringSchema,
		RESEND_FROM_ADDRESS: requiredStringSchema.pipe(z.email()),
		POSTHOG_PROJECT_TOKEN: requiredStringSchema,
		POSTHOG_HOST: requiredStringSchema.pipe(z.url()),
		API_PORT: z.coerce
			.number()
			.int()
			.min(1)
			.max(65_535)
			.default(DEFAULT_API_PORT),
	})
	.superRefine((config, context) => {
		try {
			validateClerkKeyForEnv(
				config.APP_ENV,
				"CLERK_SECRET_KEY",
				config.CLERK_SECRET_KEY,
			);
		} catch (error) {
			context.addIssue({
				code: "custom",
				path: ["CLERK_SECRET_KEY"],
				message:
					error instanceof Error
						? error.message
						: "CLERK_SECRET_KEY is invalid for APP_ENV",
			});
		}
	})
	.transform((config) => ({
		appEnv: config.APP_ENV,
		databaseUrl: config.DATABASE_URL,
		clerkSecretKey: config.CLERK_SECRET_KEY,
		publicWebBaseUrl: config.PUBLIC_WEB_BASE_URL,
		resendApiKey: config.RESEND_API_KEY,
		resendFromAddress: config.RESEND_FROM_ADDRESS,
		posthogProjectToken: config.POSTHOG_PROJECT_TOKEN,
		posthogHost: config.POSTHOG_HOST,
		apiPort: config.API_PORT,
	}));

export type ApiServerConfig = z.infer<typeof apiServerConfigSchema>;

type ApiServerConfigSource = Record<string, string | undefined>;

export function readApiServerConfig(
	source: ApiServerConfigSource = process.env,
): ApiServerConfig {
	return apiServerConfigSchema.parse(source);
}
