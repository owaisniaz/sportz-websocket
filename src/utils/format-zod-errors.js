// utils/format-zod-errors.js
export const formatZodIssues = (issues, source = "body") =>
    issues.map((issue) => ({
        source,                                   // body | query | params
        field: issue.path.join(".") || "(root)",  // "user.address.0.city"
        code: issue.code,                         // too_small, invalid_type, ...
        message: issue.message,
        ...(issue.expected && { expected: issue.expected }),
        ...(issue.minimum !== undefined && { minimum: issue.minimum }),
        ...(issue.maximum !== undefined && { maximum: issue.maximum }),
    }));