import catchAsync from "../utils/catch-async.js";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";

const MAX_LIMIT = 100;

export const listCommentary = catchAsync(async (req, res, next) => {
  try {
    const requestedLimit = req.validatedQuery?.limit ?? MAX_LIMIT;
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const data = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, req.params.id))
      .orderBy(desc(commentary.createdAt))
      .limit(limit);

    return res.status(200).json({
      message: "Commentary retrieved successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
});

export const createCommentary = catchAsync(async (req, res) => {
  const [createdCommentary] = await db
    .insert(commentary)
    .values({
      ...req.body,
      matchId: req.params.id,
    })
    .returning();
if(res.app.locals.broadcastCommentary) {
  res.app.locals.broadcastCommentary(req.params.id, createdCommentary);
}
  res.status(201).json({
    message: "Commentary created successfully",
    data: createdCommentary,
  });
});