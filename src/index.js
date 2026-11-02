import express from "express";
import http from "http";
import {matchesRouter} from "./routes/matches.js";
import { commentaryRouter } from "./routes/commentary.js";
import { attachWebsocketServer } from "./ws/server.js";
import { securityMiddleware } from "./arcjet.js";
const app = express();
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || "0.0.0.0";
const server = http.createServer(app);

app.use(express.json());

app.get("/", (_request, response) => {
  response.send("Welcome to the server!");
});
app.use(securityMiddleware());
app.use("/matches", matchesRouter);
app.use("/matches/:id/commentary", commentaryRouter);
app.use("/commentary", commentaryRouter);

const  {broadcastMatchCreated ,broadcastCommentary} = attachWebsocketServer(server);
//app.locals presents in every request
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;
server.listen(PORT, HOST, () => {
  const baseUrl = HOST ==="0.0.0.0" ? `http://localhost:${PORT}` :     `http://${HOST}:${PORT}`;
  console.log(`Server is running at ${baseUrl}`);
  console.log(`Websocket Server is Running on ${baseUrl.replace("http","ws")}/ws`);
});