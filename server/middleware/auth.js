const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      res.status(401);
      throw new Error("Not authorized — missing token");
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      res.status(401);
      throw new Error("Not authorized — user no longer exists");
    }
    req.user = user;
    next();
  } catch (err) {
    if (!res.statusCode || res.statusCode < 400) res.status(401);
    next(err);
  }
}

module.exports = { protect };
