import catchAsync from "../utils/catch-async.js";
import { getMatchStatus } from "../utils/match-status.js";
import { db } from "../db/db.js";
import { matches } from "../db/schema.js";

export const listMatches = catchAsync(async (req, res) => {
  const { limit } = req.validatedQuery ?? {};
  const query = db.select().from(matches);
  const data = limit === undefined ? await query : await query.limit(limit);

  res.status(200).json({ message: "Matches retrieved successfully", data });
});

export const createMatch = catchAsync(async (req, res, next) => {
  const body = req.body;
  const { startTime, endTime, homeScore, awayScore } = body;
  const [event] = await db
    .insert(matches)
    .values({
      ...body,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      homeScore: homeScore ?? 0,
      awayScore: awayScore ?? 0,
      status: getMatchStatus(startTime, endTime),
    })
    .returning();

    if(res.app.locals.broadcastMatchCreated) {
      res.app.locals.broadcastMatchCreated(event);
    }
  res.status(201).json({ message: "Match created successfully", data: event });
});