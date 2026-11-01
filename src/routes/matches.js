import {Router} from "express";
import { validate } from "../middleware/validate.js";
import {
  createMatchSchema,
  listMatchesQuerySchema,
} from "../validation/matches.js";
import { createMatch, listMatches } from "../controllers/match.js";
export const matchesRouter = Router();

matchesRouter.get("/", validate({ query: listMatchesQuerySchema }), listMatches);
matchesRouter.post("/", validate({ body: createMatchSchema }), createMatch);