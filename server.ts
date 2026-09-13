import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setIO } from "@/lib/socket";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const httpServer = createServer();
const app = next({ dev, httpServer });
const handle = app.getRequestHandler();

const io = new SocketIOServer(httpServer);
setIO(io);

app.prepare().then(() => {
  httpServer.on("request", (req, res) => {
    handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Server listening at http://localhost:${port} as ${dev ? "development" : process.env.NODE_ENV}`);
  });
});
