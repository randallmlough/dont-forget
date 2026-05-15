import { directoryClient, directoryDb } from "@/db/client";
import { bootstrapUser, createProductionBootstrapDeps } from "@/lib/server/bootstrap";
import { UnauthorizedError, verifyClerkRequest } from "@/lib/server/auth";

export async function POST(request: Request): Promise<Response> {
  try {
    const profile = await verifyClerkRequest(request);
    const client = directoryClient();

    try {
      const response = await bootstrapUser(profile, createProductionBootstrapDeps(directoryDb(client)));
      return Response.json(response);
    } finally {
      await client.close();
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }

    console.error("Bootstrap API failed", error);
    return Response.json({ error: "Bootstrap failed" }, { status: 500 });
  }
}
