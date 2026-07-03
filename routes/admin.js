const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, adminOnly } = require('../middleware');
const { testMailConfig } = require('../mailer');

router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    res.json(await db.prepare('SELECT id,nom,prenom,email,role,actif,created_at FROM users ORDER BY created_at DESC').all());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { nom, prenom, email, password, role } = req.body;
    if (!nom||!prenom||!email||!password) return res.status(400).json({ error:'Tous les champs sont requis' });
    if (await db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(400).json({ error:'Email deja utilise' });
    const r = await db.prepare('INSERT INTO users (nom,prenom,email,password_hash,role) VALUES (?,?,?,?,?)').run(nom,prenom,email,bcrypt.hashSync(password,10),role||'collaborateur');
    res.json({ ok:true, id:r.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nom, prenom, email, role, actif, password } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error:'Utilisateur introuvable' });
    if (password) await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password,10),req.params.id);
    await db.prepare('UPDATE users SET nom=?,prenom=?,email=?,role=?,actif=? WHERE id=?').run(nom||user.nom,prenom||user.prenom,email||user.email,role||user.role,actif??user.actif,req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error:'Utilisateur introuvable' });
    const countRow = await db.prepare("SELECT COUNT(*)::int as c FROM users WHERE role='admin' AND actif=1").get();
    if (user.role==='admin' && countRow.c <= 1)
      return res.status(400).json({ error:'Impossible de supprimer le dernier administrateur' });
    await db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/email-config', auth, adminOnly, async (req, res) => {
  try {
    res.json(await db.prepare('SELECT id,host,port,secure,"user",from_name,from_email FROM email_config WHERE id=1').get());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/email-config', auth, adminOnly, async (req, res) => {
  try {
    const { host, port, secure, user, password, from_name, from_email } = req.body;
    const c = await db.prepare('SELECT * FROM email_config WHERE id=1').get();
    await db.prepare('UPDATE email_config SET host=?,port=?,secure=?,"user"=?,password=?,from_name=?,from_email=? WHERE id=1')
      .run(host||c.host,port||c.port,secure??c.secure,user||c.user,password||c.password,from_name||c.from_name,from_email||c.from_email);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/email-test', auth, adminOnly, async (req, res) => {
  try { await testMailConfig(req.body.to); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

router.get('/logs', auth, adminOnly, async (req, res) => {
  try {
    res.json(await db.prepare(`SELECT a.*,u.nom||' '||u.prenom as user_nom,c.nom_entreprise,d.type as dossier_type
      FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
      LEFT JOIN dossiers d ON d.id=a.dossier_id LEFT JOIN clients c ON c.id=d.client_id
      ORDER BY a.created_at DESC LIMIT 200`).all());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
