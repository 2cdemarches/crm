-- À exécuter une seule fois dans le SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'collaborateur',
  actif INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  nom_entreprise TEXT NOT NULL,
  email TEXT NOT NULL,
  adresse TEXT,
  telephone TEXT,
  siren TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dossiers (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL,
  token_suivi TEXT UNIQUE NOT NULL,
  statut_global TEXT NOT NULL DEFAULT 'en_cours',
  statut_docs TEXT NOT NULL DEFAULT 'a_rediger',
  notes TEXT,
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS statuts_docs (
  id SERIAL PRIMARY KEY,
  dossier_id INTEGER NOT NULL REFERENCES dossiers(id),
  nom_doc TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_rediger',
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS statut_inpi (
  id SERIAL PRIMARY KEY,
  dossier_id INTEGER NOT NULL UNIQUE REFERENCES dossiers(id),
  type_procedure TEXT NOT NULL DEFAULT 'creation',
  statut TEXT NOT NULL DEFAULT 'en_attente',
  numero_dossier TEXT,
  commentaire TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  dossier_id INTEGER REFERENCES dossiers(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  host TEXT,
  port INTEGER DEFAULT 587,
  secure INTEGER DEFAULT 0,
  "user" TEXT,
  password TEXT,
  from_name TEXT DEFAULT 'Cabinet Expertise Comptable',
  from_email TEXT
);

INSERT INTO email_config (id) VALUES (1) ON CONFLICT DO NOTHING;
