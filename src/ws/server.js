import { WebSocketServer, WebSocket } from "ws";
import { wsArcjet } from "../arcjet.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_SUBSCRIPTIONS_PER_SOCKET = 50;

/** @type {Map<number, Set<WebSocket>>} */
const matchSubscribers = new Map();

/* ---------- helpers ---------- */

function normalizeMatchId(value) {
    const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function safeStringify(payload) {
    try {
        return JSON.stringify(payload);
    } catch (err) {
        console.error("Failed to serialize payload:", err);
        return null;
    }
}

function safeSend(client, data) {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(data, (err) => {
        if (err) console.error("Send failed:", err);
    });
}

function sendJson(socket, payload) {
    const data = safeStringify(payload);
    if (data) safeSend(socket, data);
}

/* ---------- subscriptions ---------- */

function subscribe(matchId, socket) {
    let subscribers = matchSubscribers.get(matchId);
    if (!subscribers) {
        subscribers = new Set();
        matchSubscribers.set(matchId, subscribers);
    }
    subscribers.add(socket);
}

function unsubscribe(matchId, socket) {
    const subscribers = matchSubscribers.get(matchId);
    if (!subscribers) return;

    subscribers.delete(socket);
    if (subscribers.size === 0) {
        matchSubscribers.delete(matchId);
    }
}

function cleanupSubscriptions(socket) {
    for (const matchId of socket.subscriptions) {
        unsubscribe(matchId, socket);
    }
    socket.subscriptions.clear();
}

/* ---------- broadcasting ---------- */

function broadcastToMatch(matchId, payload) {
    const id = normalizeMatchId(matchId);
    if (id === null) return;

    const subscribers = matchSubscribers.get(id);
    if (!subscribers || subscribers.size === 0) return;

    const data = safeStringify(payload);
    if (!data) return;

    for (const client of subscribers) {
        safeSend(client, data);
    }
}

function broadcastToAll(wss, payload) {
    const data = safeStringify(payload);
    if (!data) return;

    for (const client of wss.clients) {
        safeSend(client, data);
    }
}

/* ---------- message handling ---------- */

function handleMessage(data, isBinary, socket) {
    if (isBinary) {
        sendJson(socket, { type: "error", message: "Binary messages are not supported" });
        return;
    }

    let message;
    try {
        message = JSON.parse(data.toString());
    } catch {
        sendJson(socket, { type: "error", message: "Invalid JSON" });
        return;
    }

    if (message === null || typeof message !== "object") {
        sendJson(socket, { type: "error", message: "Invalid message format" });
        return;
    }

    const matchId = normalizeMatchId(message.matchId);

    switch (message.type) {
        case "subscribe": {
            if (matchId === null) {
                sendJson(socket, { type: "error", message: "Invalid matchId" });
                return;
            }
            if (
                !socket.subscriptions.has(matchId) &&
                socket.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SOCKET
            ) {
                sendJson(socket, { type: "error", message: "Subscription limit reached" });
                return;
            }
            subscribe(matchId, socket);
            socket.subscriptions.add(matchId);
            sendJson(socket, { type: "subscribed", matchId });
            return;
        }

        case "unsubscribe": {
            if (matchId === null) {
                sendJson(socket, { type: "error", message: "Invalid matchId" });
                return;
            }
            unsubscribe(matchId, socket);
            socket.subscriptions.delete(matchId);
            sendJson(socket, { type: "unsubscribed", matchId });
            return;
        }

        default:
            sendJson(socket, { type: "error", message: "Unknown message type" });
    }
}

/* ---------- upgrade rejection ---------- */

function rejectUpgrade(socket, status, message) {
    if (socket.destroyed) return;

    const body = `${message}\n`;
    socket.end(
        `HTTP/1.1 ${status}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        "\r\n" +
        body,
        () => socket.destroy(),
    );
}

/* ---------- server ---------- */

export function attachWebsocketServer(server) {
    const wss = new WebSocketServer({
        noServer: true,
        maxPayload: MAX_PAYLOAD_BYTES,
    });

    wss.on("error", (err) => console.error("WebSocketServer error:", err));

    server.on("upgrade", async (req, socket, head) => {
        socket.on("error", (error) => {
            console.error("WebSocket upgrade socket error:", error);
        });

        let pathname;
        try {
            pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        } catch (error) {
            console.error("Invalid WebSocket upgrade URL:", error);
            rejectUpgrade(socket, "400 Bad Request", "Invalid request");
            return;
        }

        if (pathname !== "/ws") {
            rejectUpgrade(socket, "404 Not Found", "Not found");
            return;
        }

        try {
            const decision = await wsArcjet.protect(req);
            if (socket.destroyed) return;

            if (decision.isDenied()) {
                if (decision.reason.isRateLimit()) {
                    rejectUpgrade(socket, "429 Too Many Requests", "Too many requests");
                } else {
                    rejectUpgrade(socket, "403 Forbidden", "Forbidden");
                }
                return;
            }

            wss.handleUpgrade(req, socket, head, (websocket) => {
                wss.emit("connection", websocket, req);
            });
        } catch (error) {
            console.error("WebSocket upgrade protection failed:", error);
            socket.destroy();
        }
    });

    wss.on("connection", (socket) => {
        socket.isAlive = true;
        socket.subscriptions = new Set();

        socket.on("pong", () => {
            socket.isAlive = true;
        });

        socket.on("message", (data, isBinary) => {
            handleMessage(data, isBinary, socket);
        });

        socket.on("error", (err) => {
            console.error("WebSocket client error:", err);
            socket.terminate();
        });

        socket.on("close", () => cleanupSubscriptions(socket));

        sendJson(socket, { type: "welcome" });
    });

    const heartbeat = setInterval(() => {
        for (const client of wss.clients) {
            if (client.isAlive === false) {
                client.terminate();
                continue;
            }
            client.isAlive = false;
            client.ping();
        }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();

    let isShuttingDown = false;
    function shutdown() {
        if (isShuttingDown) return;
        isShuttingDown = true;

        clearInterval(heartbeat);
        for (const client of wss.clients) {
            client.terminate();
        }
        wss.close();
    }

    wss.on("close", shutdown);
    server.once("close", shutdown);

    return {
        broadcastMatchCreated(match) {
            broadcastToAll(wss, { type: "match_created", payload: match });
        },
        broadcastCommentary(matchId, commentary) {
            broadcastToMatch(matchId, { type: "commentary_created", payload: commentary });
        },
    };
}