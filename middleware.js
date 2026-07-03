const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');
function auth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Non connecte' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expiree' }); }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acces admin requis' });
  next();
}
module.exports = { auth, adminOnly };
