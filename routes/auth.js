const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../config');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE email=? AND actif=1').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const token = jwt.sign({ id:user.id, role:user.role, nom:user.nom, prenom:user.prenom }, JWT_SECRET, { expiresIn:'8h' });
    res.cookie('token', token, { httpOnly:true, maxAge:8*3600*1000, sameSite:'lax' });
    res.json({ ok:true, role:user.role, nom:user.nom, prenom:user.prenom });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ ok:true }); });

router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Non connecte' });
  try { res.json(jwt.verify(token, JWT_SECRET)); }
  catch { res.status(401).json({ error: 'Session expiree' }); }
});

module.exports = router;
