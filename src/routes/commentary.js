import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from "../validation/commentary.js";
import { matchIdParamSchema } from "../validation/matches.js";
import {
  createCommentary,
  listCommentary,
} from "../controllers/commentry.js";
export const commentaryRouter = Router({ mergeParams: true });

commentaryRouter.get(
  "/",
  validate({
    params: matchIdParamSchema,
    query: listCommentaryQuerySchema,
  }),
  listCommentary,
);

commentaryRouter.post(
  "/",
  validate({
    params: matchIdParamSchema,
    body: createCommentarySchema,
  }),
  createCommentary,
);
