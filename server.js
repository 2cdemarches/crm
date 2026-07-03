const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { PORT } = require('./config');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/dossiers', require('./routes/dossiers'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/suivi', require('./routes/suivi'));

// Démarrage local uniquement (pas sur Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Demarrage CRM Formalites...`);
    console.log(`http://localhost:${PORT}`);
  });
}

module.exports = app;
