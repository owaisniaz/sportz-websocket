// middlewares/validate.js
import AppError from "../utils/app-error.js";
import { formatZodIssues } from "../utils/format-zod-errors.js";

const SOURCES = ["body", "query", "params"];

export const validate = (schemas) => (req, res, next) => {
  const errors = [];

  for (const source of SOURCES) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source]);

    if (!result.success) {
      errors.push(...formatZodIssues(result.error.issues, source));
      continue;
    }

    // Express 5: req.query is a getter, so don't reassign it
    if (source === "query") {
      Object.defineProperty(req, "validatedQuery", { value: result.data });
    } else {
      req[source] = result.data;
    }
  }

  if (errors.length > 0) {
    return next(new AppError("Request validation failed", 400, errors));
  }

  return next();
};