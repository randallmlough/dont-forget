import {
	DEFAULT_API_PORT,
	parsePublicWebBaseUrl,
	validateClerkKeyForEnv,
} from "@dont-forget/shared";
import { z } from "zod";

const requiredStringSchema = z.string().trim().min(1);
const optionalStringSchema = z
	.string()
	.trim()
	.optional()
	.transform((value) => value || undefined);

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export type ServerPostHogConfig =
	| { kind: "disabled" }
	| {
			kind: "enabled";
			projectToken: string;
			host: string;
	  };

const apiServerConfigSchema = z
	.object({
		APP_ENV: requiredStringSchema.pipe(
			z.enum(["local", "test", "staging", "production"]),
		),
		DATABASE_URL: requiredStringSchema,
		CLERK_SECRET_KEY: requiredStringSchema,
		PUBLIC_WEB_BASE_URL: z.string().min(1),
		POSTHOG_PROJECT_TOKEN: optionalStringSchema,
		POSTHOG_HOST: optionalStringSchema,
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

		if (config.POSTHOG_PROJECT_TOKEN && config.POSTHOG_HOST) {
			const host = z.url().safeParse(config.POSTHOG_HOST);
			if (!host.success) {
				context.addIssue({
					code: "custom",
					path: ["POSTHOG_HOST"],
					message: "POSTHOG_HOST must be a valid URL when PostHog is enabled",
				});
			}
		}

		try {
			parsePublicWebBaseUrl(config.PUBLIC_WEB_BASE_URL, config.APP_ENV);
		} catch (error) {
			context.addIssue({
				code: "custom",
				path: ["PUBLIC_WEB_BASE_URL"],
				message:
					error instanceof Error
						? error.message
						: "PUBLIC_WEB_BASE_URL is invalid",
			});
		}
	})
	.transform((config) => ({
		appEnv: config.APP_ENV,
		databaseUrl: config.DATABASE_URL,
		clerkSecretKey: config.CLERK_SECRET_KEY,
		publicWebBaseUrl: parsePublicWebBaseUrl(
			config.PUBLIC_WEB_BASE_URL,
			config.APP_ENV,
		),
		posthog: posthogConfig(config.POSTHOG_PROJECT_TOKEN, config.POSTHOG_HOST),
		apiPort: config.API_PORT,
	}));

export type ApiServerConfig = z.infer<typeof apiServerConfigSchema>;

type ApiServerConfigSource = Record<string, string | undefined>;

export function readApiServerConfig(
	source: ApiServerConfigSource = process.env,
): ApiServerConfig {
	return apiServerConfigSchema.parse(source);
}

function posthogConfig(
	projectToken: string | undefined,
	host: string | undefined,
): ServerPostHogConfig {
	if (!projectToken || projectToken === "phc_your_project_token_here") {
		return { kind: "disabled" };
	}

	return {
		kind: "enabled",
		projectToken,
		host: host ?? DEFAULT_POSTHOG_HOST,
	};
}
