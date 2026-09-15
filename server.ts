import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setIO } from "@/lib/socket";
import { prisma } from "@/lib/prisma";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const httpServer = createServer();
const app = next({ dev, httpServer });
const handle = app.getRequestHandler();

const io = new SocketIOServer(httpServer);
setIO(io);

// Any run still "pending"/"running" at process startup was orphaned by the
// previous process dying (crash, restart) — this process's in-memory
// activeRuns map is guaranteed empty, so nothing is actually executing them
// anymore. Mark them "crashed" so they show up with a Resume action instead
// of sitting as misleadingly "Running" forever.
async function reconcileOrphanedWorkflowRuns() {
  const { count } = await prisma.workflowRun.updateMany({
    where: { status: { in: ["pending", "running"] } },
    data: { status: "crashed" },
  });
  if (count > 0) {
    console.log(`> Marked ${count} orphaned workflow run(s) as crashed`);
  }
}

app.prepare().then(async () => {
  await reconcileOrphanedWorkflowRuns();

  httpServer.on("request", (req, res) => {
    // Socket.IO registers its own "request" listener when constructed above
    // and handles anything under this path itself. Node fires every
    // "request" listener for every request regardless of what an earlier
    // one did, so without this guard Next's handler races Socket.IO's own
    // handling of the same request — sometimes winning and answering with
    // its own 404, sometimes losing and throwing ERR_HTTP_HEADERS_SENT
    // after Socket.IO already responded.
    if (req.url?.startsWith("/socket.io")) return;
    handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Server listening at http://localhost:${port} as ${dev ? "development" : process.env.NODE_ENV}`);
  });
});
