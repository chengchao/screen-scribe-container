import { Container, getRandom } from "@cloudflare/containers";

export class ScreenScribeContainer extends Container<CloudflareBindings> {
  defaultPort = 3000;
  sleepAfter = "10m";
  envVars = {
    R2_ACCESS_KEY_ID: this.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: this.env.R2_SECRET_ACCESS_KEY,
    CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID,
  };
}

export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    ctx: ExecutionContext
  ) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/sample")) {
      const containerInstance = await getRandom(env.SCREEN_SCRIBE_CONTAINER_V2);
      const result = await containerInstance.fetch(request);
      return result;
    }

    return Response.json({ message: "Not found" }, { status: 404 });
  },
};
