import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";

if (!arcjetKey) {
    throw new Error("ARCJET_KEY is not set in environment variables");
}

const baseRules = () => [
    // Blocks common attacks such as SQL injection and XSS
    shield({ mode: arcjetMode }),
    detectBot({
        mode: arcjetMode,
        allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
    }),
];

export const httpArcjet = arcjet({
    key: arcjetKey,
    rules: [...baseRules(), slidingWindow({ mode: arcjetMode, interval: "10s", max: 50 })],
});

export const wsArcjet = arcjet({
    key: arcjetKey,
    rules: [...baseRules(), slidingWindow({ mode: arcjetMode, interval: "2s", max: 5 })],
});

export function securityMiddleware() {
    return async (req, res, next) => {
        try {
            const decision = await httpArcjet.protect(req);

            if (decision.isDenied()) {
                if (decision.reason.isRateLimit()) {
                    return res.status(429).json({ error: "Too many requests" });
                }
                return res.status(403).json({ error: "Forbidden" });
            }
        } catch (error) {
            console.error("Arcjet error:", error);
            // Fail open so an Arcjet outage doesn't take down your API
        }
        next();
    };
}