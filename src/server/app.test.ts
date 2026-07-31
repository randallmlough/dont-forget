import { Hono } from "hono";

it("dispatches through app.request", async () => {
	const app = new Hono();
	app.get("/ping", (context) => context.json({ ok: true }));

	const response = await app.request("/ping");

	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ ok: true });
});
