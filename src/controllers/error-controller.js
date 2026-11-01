import AppError from "../utils/app-error.js";

// --- PostgreSQL / Drizzle Error Handlers ---

const handleUniqueConstraintError = (err) => {
    // PostgreSQL unique_violation = 23505
    // Drizzle / node-postgres usually puts the constraint name in err.constraint
    // and the detail in err.detail
    const field = err.constraint
        ? err.constraint.replace(/_key$/, "").replace(/.*_/, "") // crude cleanup
        : "field";

    const valueMatch = err.detail?.match(/\((.*?)\)=\((.*?)\)/);
    const value = valueMatch ? valueMatch[2] : "unknown";

    return new AppError(
        `Duplicate value for '${field}': '${value}'. Please use another value.`,
        400
    );
};

const handleForeignKeyError = (err) => {
    // 23503 = foreign_key_violation
    return new AppError(
        `Invalid reference: related record does not exist (${err.constraint || "foreign key"}).`,
        400
    );
};

const handleNotNullError = (err) => {
    // 23502 = not_null_violation
    const column = err.column || "field";
    return new AppError(`Missing required field: '${column}'`, 400);
};

const handleCheckConstraintError = (err) => {
    // 23514 = check_violation
    return new AppError(
        `Invalid value for constraint: ${err.constraint || "check constraint"}`,
        400
    );
};

const handleInvalidInputError = (err) => {
    // Common codes: 22P02 (invalid_text_representation), 22007 (invalid_datetime_format), etc.
    return new AppError(`Invalid input data: ${err.message}`, 400);
};

// JWT handlers (unchanged)
const handleJWTError = () =>
    new AppError("Invalid token. Please log in again!", 401);

const handleJWTExpiredError = () =>
    new AppError("Your token has expired! Please log in again.", 401);

// --- Response Senders ---

const sendDevError = (err, res) =>
    res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack,
    });

const sendProdError = (err, res) => {
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
        });
    }

    // Programming or unknown error → don't leak details
    console.error("ERROR 💥", err);
    return res.status(500).json({
        status: "error",
        message: "Something went very wrong!",
    });
};

// --- Error Normalizer ---

const normalizeError = (err) => {
    // PostgreSQL error codes (from node-postgres / Drizzle)
    if (err.code === "23505") return handleUniqueConstraintError(err);
    if (err.code === "23503") return handleForeignKeyError(err);
    if (err.code === "23502") return handleNotNullError(err);
    if (err.code === "23514") return handleCheckConstraintError(err);

    // Invalid input (type, UUID, date, etc.)
    if (err.code?.startsWith("22")) return handleInvalidInputError(err);

    // JWT
    if (err.name === "JsonWebTokenError") return handleJWTError();
    if (err.name === "TokenExpiredError") return handleJWTExpiredError();

    // Drizzle sometimes wraps the original error
    if (err.cause?.code) {
        return normalizeError(err.cause);
    }

    return err;
};

// --- Global Error Middleware ---

export const errorController = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    if (process.env.NODE_ENV === "development") {
        return sendDevError(err, res);
    }

    sendProdError(normalizeError(err), res);
};