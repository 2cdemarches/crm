const nodemailer = require('nodemailer');
const db = require('./db');
function getTransporter() {
  const cfg = db.prepare('SELECT * FROM email_config WHERE id=1').get();
  if (!cfg || !cfg.host || !cfg.user) throw new Error('Configuration email non configuree. Definissez-la dans Parametres.');
  return {
    transporter: nodemailer.createTransport({ host:cfg.host, port:cfg.port||587, secure:cfg.secure===1, auth:{user:cfg.user,pass:cfg.password} }),
    from: `"${cfg.from_name||'Cabinet'}" <${cfg.from_email||cfg.user}>`
  };
}
async function sendMailSuivi(to, nomEntreprise, message, lienSuivi) {
  const { transporter, from } = getTransporter();
  await transporter.sendMail({ from, to,
    subject: `Mise a jour de votre dossier - ${nomEntreprise}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1e3a5f;color:white;padding:20px 30px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">Mise a jour de votre dossier</h2><p style="margin:5px 0 0;opacity:.8">${nomEntreprise}</p>
      </div>
      <div style="padding:30px;background:#f9f9f9;border:1px solid #e0e0e0;border-top:none">
        <p style="font-size:16px;color:#333">${message}</p>
        <a href="${lienSuivi}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#1e3a5f;color:white;border-radius:6px;text-decoration:none;font-weight:bold">Suivre mon dossier →</a>
        <p style="margin-top:30px;font-size:12px;color:#999">Ce lien vous permet de suivre votre dossier a tout moment.</p>
      </div></div>` });
}
async function testMailConfig(to) {
  const { transporter, from } = getTransporter();
  await transporter.sendMail({ from, to, subject:'Test configuration email - CRM Formalites', text:'La configuration email fonctionne correctement.' });
}
module.exports = { sendMailSuivi, testMailConfig };
