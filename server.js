const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

// Chargement automatique des variables d'environnement depuis le fichier .env si présent
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    });
  } catch (err) {
    console.warn('Notice : Erreur lors de la lecture du fichier .env :', err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Désactiver la mise en cache pour le développement local afin de garantir la fraîcheur des scripts
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Route d'API pour fournir la configuration publique Supabase au client web
// (Sécurité : seule la clé anonyme publique est exposée, jamais de secret de service)
app.get('/api/config', (req, res) => {
  let supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  res.json({
    supabaseUrl,
    supabaseAnonKey,
    isConfigured: Boolean(supabaseUrl && supabaseAnonKey)
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  });
});

// Inscription sécurisée côté serveur via la clé de service (contourne le quota "email rate limit exceeded")
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Adresse e-mail et mot de passe obligatoires.' });
    }

    let supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(503).json({ error: 'Supabase n\'est pas configuré avec la clé administrateur sur le serveur.' });
    }

    const { createClient } = require('@supabase/supabase-js');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || '').trim() || cleanEmail.split('@')[0];

    // Création directe de l'utilisateur avec email_confirm: true (évite l'envoi d'e-mail bloqué par quota)
    const { data, error } = await adminClient.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        role: 'fermier'
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({
      success: true,
      message: 'Compte fermier créé et activé avec succès.',
      user: {
        id: data.user.id,
        email: data.user.email,
        name: cleanName
      }
    });
  } catch (err) {
    console.error('Erreur inscription backend Supabase:', err);
    return res.status(500).json({ error: err.message || 'Erreur lors de la création du compte.' });
  }
});

// Route de sécurité pour éviter que d'anciennes requêtes /api reçoivent du HTML (DOCTYPE)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint API introuvable.' });
});

// Fallback pour navigation locale SPA (hors /api)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('====================================================');
  console.log('🌾 Application Agro-Ferme démarrée !');
  console.log(`📡 URL locale : http://localhost:${PORT}`);
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    console.log(`🟢 Supabase connecté : ${process.env.SUPABASE_URL}`);
  } else {
    console.log('🟡 Supabase non configuré dans .env — mode de secours local actif');
  }
  console.log('====================================================');
});

module.exports = app;
