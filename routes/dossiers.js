const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { auth } = require('../middleware');
const { sendMailSuivi } = require('../mailer');
const { BASE_URL } = require('../config');

async function log(dossier_id, user_id, action, details) {
  await db.prepare('INSERT INTO audit_log (dossier_id,user_id,action,details) VALUES (?,?,?,?)').run(dossier_id,user_id,action,details||null);
}

router.get('/', auth, async (req, res) => {
  try {
    res.json(await db.prepare(`SELECT d.*,c.nom_entreprise,c.email as client_email,c.telephone,
      u.nom||' '||u.prenom as assigned_nom, cr.nom||' '||cr.prenom as created_nom,
      i.statut as inpi_statut,
      al.action as last_action, al.details as last_details, al.created_at as last_action_at,
      ul.nom||' '||ul.prenom as last_action_by
      FROM dossiers d JOIN clients c ON c.id=d.client_id
      LEFT JOIN users u ON u.id=d.assigned_to LEFT JOIN users cr ON cr.id=d.created_by
      LEFT JOIN statut_inpi i ON i.dossier_id=d.id
      LEFT JOIN audit_log al ON al.id=(SELECT id FROM audit_log WHERE dossier_id=d.id ORDER BY created_at DESC LIMIT 1)
      LEFT JOIN users ul ON ul.id=al.user_id
      ORDER BY d.created_at DESC`).all());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { nom_entreprise, email_client, adresse, telephone, siren, type, assigned_to, notes } = req.body;
    if (!nom_entreprise||!email_client||!type) return res.status(400).json({ error:'Champs obligatoires manquants' });
    const token = uuidv4();
    const client = await db.prepare('INSERT INTO clients (nom_entreprise,email,adresse,telephone,siren,created_by) VALUES (?,?,?,?,?,?)').run(nom_entreprise,email_client,adresse||null,telephone||null,siren||null,req.user.id);
    const dossier = await db.prepare('INSERT INTO dossiers (client_id,type,token_suivi,notes,assigned_to,created_by) VALUES (?,?,?,?,?,?)').run(client.lastInsertRowid,type,token,notes||null,assigned_to||null,req.user.id);
    const dossierId = dossier.lastInsertRowid;
    for (const d of ['Statuts','Formulaire M0/M2','Piece identite dirigeant','Justificatif de siege'])
      await db.prepare('INSERT INTO statuts_docs (dossier_id,nom_doc) VALUES (?,?)').run(dossierId,d);
    if (type !== 'cessation')
      await db.prepare('INSERT INTO statut_inpi (dossier_id,type_procedure) VALUES (?,?)').run(dossierId,type==='modification'?'modification':'creation');
    await log(dossierId, req.user.id, 'CREATION_DOSSIER', `Dossier ${type} cree pour ${nom_entreprise}`);
    res.json({ ok:true, id:dossierId, token });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const dossier = await db.prepare(`SELECT d.*,c.nom_entreprise,c.email as client_email,c.adresse,c.telephone,c.siren,
      u.nom||' '||u.prenom as assigned_nom, cr.nom||' '||cr.prenom as created_nom
      FROM dossiers d JOIN clients c ON c.id=d.client_id
      LEFT JOIN users u ON u.id=d.assigned_to LEFT JOIN users cr ON cr.id=d.created_by
      WHERE d.id=?`).get(req.params.id);
    if (!dossier) return res.status(404).json({ error:'Dossier introuvable' });
    const docs = await db.prepare('SELECT * FROM statuts_docs WHERE dossier_id=?').all(req.params.id);
    const inpi = await db.prepare('SELECT * FROM statut_inpi WHERE dossier_id=?').get(req.params.id);
    const logs = await db.prepare(`SELECT a.*,u.nom||' '||u.prenom as user_nom FROM audit_log a
      LEFT JOIN users u ON u.id=a.user_id WHERE a.dossier_id=? ORDER BY a.created_at DESC LIMIT 50`).all(req.params.id);
    res.json({ dossier, docs, inpi, logs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { statut_global, statut_docs, notes, assigned_to, nom_entreprise, type, email_client, telephone } = req.body;
    const c = await db.prepare('SELECT * FROM dossiers WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ error:'Dossier introuvable' });

    try {
      await db.prepare("UPDATE dossiers SET statut_global=?,statut_docs=?,notes=?,assigned_to=?,type=?,updated_at=NOW() WHERE id=?")
        .run(statut_global||c.statut_global, statut_docs||c.statut_docs||'a_rediger', notes??c.notes, assigned_to??c.assigned_to, type||c.type, req.params.id);
    } catch(e) { console.error('[PUT dossier] UPDATE dossiers error:', e.message); }

    if (nom_entreprise !== undefined || email_client !== undefined || telephone !== undefined) {
      const cl = await db.prepare('SELECT * FROM clients WHERE id=?').get(c.client_id);
      if (cl) await db.prepare('UPDATE clients SET nom_entreprise=?,email=?,telephone=? WHERE id=?')
        .run(nom_entreprise||cl.nom_entreprise, email_client||cl.email, telephone||cl.telephone, c.client_id);
    }

    const details = [];
    if (statut_global && statut_global !== c.statut_global) details.push(`Dossier: ${statut_global}`);
    if (statut_docs && statut_docs !== c.statut_docs) details.push(`Documents: ${statut_docs}`);
    await log(req.params.id, req.user.id, 'MAJ_DOSSIER', details.join(', ') || 'Mise a jour');
    if (statut_docs && statut_docs !== c.statut_docs && ['envoye','signe'].includes(statut_docs)) {
      const lblDoc = {redige:'Rediges',envoye:'Envoyes pour signature',signe:'Signes'};
      _sendSuivi(req.params.id, `Documents ${lblDoc[statut_docs]||statut_docs}.`);
    }
    res.json({ ok:true });
  } catch(e) { console.error('[PUT dossier]', e.message); res.status(500).json({ error: e.message }); }
});

router.put('/:id/docs/:docId', auth, async (req, res) => {
  try {
    const { statut } = req.body;
    const doc = await db.prepare('SELECT * FROM statuts_docs WHERE id=? AND dossier_id=?').get(req.params.docId,req.params.id);
    if (!doc) return res.status(404).json({ error:'Document introuvable' });
    await db.prepare('UPDATE statuts_docs SET statut=?,updated_by=?,updated_at=NOW() WHERE id=?').run(statut,req.user.id,req.params.docId);
    await log(req.params.id, req.user.id, 'MAJ_DOCUMENT', `${doc.nom_doc}: ${doc.statut} -> ${statut}`);
    if (['envoye','signe'].includes(statut)) _sendSuivi(req.params.id,`Le document "${doc.nom_doc}" est maintenant : ${{a_rediger:'A rediger',redige:'Redige',envoye:'Envoye',signe:'Signe'}[statut]||statut}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/inpi', auth, async (req, res) => {
  try {
    const { statut, numero_dossier, commentaire, type_procedure } = req.body;
    const c = await db.prepare('SELECT * FROM statut_inpi WHERE dossier_id=?').get(req.params.id);
    if (c) await db.prepare('UPDATE statut_inpi SET statut=?,numero_dossier=?,commentaire=?,type_procedure=?,updated_by=?,updated_at=NOW() WHERE dossier_id=?').run(statut,numero_dossier||c.numero_dossier,commentaire??c.commentaire,type_procedure||c.type_procedure,req.user.id,req.params.id);
    else await db.prepare('INSERT INTO statut_inpi (dossier_id,statut,numero_dossier,commentaire,type_procedure,updated_by) VALUES (?,?,?,?,?,?)').run(req.params.id,statut,numero_dossier||null,commentaire||null,type_procedure||'creation',req.user.id);
    await log(req.params.id, req.user.id, 'MAJ_INPI', `INPI: ${statut}${numero_dossier?' #'+numero_dossier:''}`);
    if (statut==='valide') _sendSuivi(req.params.id,`Votre dossier INPI a ete VALIDE !${numero_dossier?' N dossier : '+numero_dossier:''}`);
    else if (statut==='rejete') _sendSuivi(req.params.id,`Votre dossier INPI a ete rejete.${commentaire?' Motif : '+commentaire:''} Nous vous recontacterons.`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/docs', auth, async (req, res) => {
  try {
    const { nom_doc } = req.body;
    if (!nom_doc) return res.status(400).json({ error:'Nom du document requis' });
    await db.prepare('INSERT INTO statuts_docs (dossier_id,nom_doc,updated_by) VALUES (?,?,?)').run(req.params.id,nom_doc,req.user.id);
    await log(req.params.id, req.user.id, 'AJOUT_DOCUMENT', `Document ajoute: ${nom_doc}`);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/send-suivi', auth, async (req, res) => {
  try {
    const { message } = req.body;
    _sendSuivi(req.params.id, message||'Votre dossier a ete mis a jour.');
    await log(req.params.id, req.user.id, 'ENVOI_SUIVI', 'Lien de suivi envoye manuellement');
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const d = await db.prepare('SELECT * FROM dossiers WHERE id=?').get(req.params.id);
    if (!d) return res.status(404).json({ error:'Dossier introuvable' });
    await db.prepare('DELETE FROM statuts_docs WHERE dossier_id=?').run(req.params.id);
    await db.prepare('DELETE FROM statut_inpi WHERE dossier_id=?').run(req.params.id);
    await db.prepare('DELETE FROM audit_log WHERE dossier_id=?').run(req.params.id);
    await db.prepare('DELETE FROM dossiers WHERE id=?').run(req.params.id);
    await db.prepare('DELETE FROM clients WHERE id=?').run(d.client_id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

async function _sendSuivi(dossierId, message) {
  try {
    const dossier = await db.prepare('SELECT d.*,c.nom_entreprise,c.email FROM dossiers d JOIN clients c ON c.id=d.client_id WHERE d.id=?').get(dossierId);
    if (!dossier) return;
    await sendMailSuivi(dossier.email, dossier.nom_entreprise, message, `${BASE_URL}/suivi.html?t=${dossier.token_suivi}`);
  } catch(e) { console.error('Erreur envoi mail:', e.message); }
}

module.exports = router;
