/**
 * Vercel serverless entry for the zkLogin/Google auth API. It reuses the exact
 * Fastify routes from apps/api (epoch, login, callback, me, logout, prepare,
 * execute, wallet) so Google sign-in works on the deployed static site. The
 * wallet sign-in path needs no backend — only this one does.
 *
 * Env vars to set in the Vercel project:
 *   SESSION_SECRET           32+ char secret for the session cookie
 *   GOOGLE_CLIENT_ID         Google OAuth web client id
 *   GOOGLE_CLIENT_SECRET     Google OAuth web client secret
 *   GOOGLE_REDIRECT_URI      https://<your-domain>/api/zklogin/callback
 *   WEB_URL                  https://<your-domain>
 *   (optional) SHINAMI_API_KEY, SALT_SECRET
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { zkLoginRoutes } from "../../apps/api/src/zklogin/routes.js";

let appPromise: Promise<FastifyInstance> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const app = Fastify({ logger: false });
      await app.register(cookie);
      await app.register(zkLoginRoutes, { prefix: "/api/zklogin" });
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
