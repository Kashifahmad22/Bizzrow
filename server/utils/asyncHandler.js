// Thin wrapper so route handlers can throw / reject without try-catch boilerplate
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
