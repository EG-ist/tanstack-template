import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Serves blog images copied from RankGPT (see articles.ingest)
http.route({
  pathPrefix: "/blog-images/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { pathname } = new URL(request.url);
    const filename = decodeURIComponent(pathname.slice("/blog-images/".length));
    const storageId = await ctx.runQuery(internal.articles.getImage, { filename });
    const blob = storageId ? await ctx.storage.get(storageId) : null;
    if (!blob) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }),
});

export default http;
