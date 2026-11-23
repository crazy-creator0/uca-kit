const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: "7d" });
}

function required(req, res, next) {
  const header = req.headers.authorization || "";
  try {
    req.user = jwt.verify(header.replace(/^Bearer /, ""), SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Login required" });
  }
}

function admin(req, res, next) {
  if (req.user && req.user.role === "admin") return next();
  res.status(403).json({ error: "Admins only" });
}

module.exports = { sign, required, admin };
