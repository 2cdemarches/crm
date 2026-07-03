const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/:token', async (req, res) => {
  try {
    const dossier = await db.prepare(`SELECT d.id,d.type,d.statut_global,d.statut_docs,d.created_at,c.nom_entreprise
      FROM dossiers d JOIN clients c ON c.id=d.client_id WHERE d.token_suivi=?`).get(req.params.token);
    if (!dossier) return res.status(404).json({ error:'Dossier introuvable' });
    const docs = await db.prepare('SELECT nom_doc,statut,updated_at FROM statuts_docs WHERE dossier_id=?').all(dossier.id);
    const inpi = await db.prepare('SELECT type_procedure,statut,numero_dossier,commentaire,updated_at FROM statut_inpi WHERE dossier_id=?').get(dossier.id);
    res.json({ dossier, docs, inpi });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
