// Express 4 does not catch errors thrown inside async route handlers.
// Wrapping a handler with this forwards any error to the error middleware
// in index.js (instead of the request hanging forever).
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
