import { WebSocketServer, WebSocket } from "ws";

function sendJson(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
        socket.send(JSON.stringify(payload), (err) => {
            if (err) console.error("Send failed:", err);
        });
    } catch (err) {
        console.error("Failed to serialize payload:", err);
    }
}

function broadcast(wss, payload) {
    let data;
    try {
        data = JSON.stringify(payload);
    } catch (err) {
        console.error("Failed to serialize broadcast payload:", err);
        return;
    }

    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        client.send(data, (err) => {
            if (err) console.error("Broadcast send failed:", err);
        });
    }
}

export function attachWebsocketServer(server) {
    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: 64 * 1024,
    });

    wss.on("error", console.error);

    const heartbeat = setInterval(() => {
        for (const client of wss.clients) {
            if (client.isAlive === false) {
                client.terminate();
                continue;
            }
            client.isAlive = false;
            client.ping();
        }
    }, 30000);

    wss.on("close", () => clearInterval(heartbeat));
    //Cleanup the traffic from http server to websocket server
    wss.on("connection", async (socket,req) => {
        if(wsArcjet) {
            try{
                const decision = await wsArcjet.protect(req);
                if(decision.isDenied()) {
                    const code = decision.reason.isRateLimit() ? 1013 : 1008; // 1013 for rate limit, 1008 for other reasons
                    const reason = decision.reason.isRateLimit() ? "Rate limit exceeded" : "Access denied by Arcjet";
                   socket.close(code, reason);
                    return;
                }
            }
            catch(err){
                console.error("WS connection server error: ", err);
                socket.close(1011, "Server Security Error");
                return;
            }
        }
        socket.isAlive = true;
        socket.on("pong", () => { socket.isAlive = true; });
        socket.on("error", console.error);
        socket.on("close", () => { /* cleanup if needed */ });

        sendJson(socket, { type: "welcome" });
    });

    function broadcastMatchCreated(match) {
        broadcast(wss, { type: "match_created", payload: match });
    }

    return { broadcastMatchCreated };
}