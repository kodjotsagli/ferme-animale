// ==============================================================================
// AGRO-FERME — CLIENT SUPABASE (SERVICE INITIALISATION & GESTION DE SESSION)
// ==============================================================================
// Gère l'initialisation du client Supabase officiel, l'authentification et
// la détection de l'état de la connexion (En ligne / Supabase vs Mode local).
// ==============================================================================

const SUPABASE_STORAGE_CONFIG_KEY = 'ferme_supabase_config_override';

function sanitizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let u = String(rawUrl).trim();
  u = u.replace(/\/rest\/v1\/?$/, '');
  u = u.replace(/\/+$/, '');
  return u;
}

const SupabaseClientManager = {
  client: null,
  config: {
    url: '',
    anonKey: '',
    isConfigured: false
  },
  status: 'initializing', // 'connected' | 'unconfigured' | 'error'

  /**
   * Récupère la configuration depuis le serveur backend (/api/config)
   * avec possibilité de repli sur un override sauvegardé dans localStorage.
   */
  async loadConfig() {
    let url = '';
    let anonKey = '';

    // 1. Priorité aux variables d'environnement servies par le backend
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data.supabaseUrl && data.supabaseAnonKey) {
          url = data.supabaseUrl;
          anonKey = data.supabaseAnonKey;
        }
      }
    } catch (e) {
      console.warn('Notice : Serveur backend non disponible ou hors-ligne pour /api/config', e.message);
    }

    // 2. Repli éventuel sur une configuration saisie par l'utilisateur dans l'interface
    if (!url || !anonKey) {
      try {
        const stored = localStorage.getItem(SUPABASE_STORAGE_CONFIG_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.url && parsed.anonKey) {
            url = parsed.url;
            anonKey = parsed.anonKey;
          }
        }
      } catch (_) {}
    }

    url = sanitizeSupabaseUrl(url);

    this.config = {
      url: url,
      anonKey: (anonKey || '').trim(),
      isConfigured: Boolean(url && anonKey)
    };

    return this.config;
  },

  /**
   * Initialise le client Supabase officiel (@supabase/supabase-js)
   */
  async init() {
    await this.loadConfig();

    if (!this.config.isConfigured) {
      this.status = 'unconfigured';
      console.info('ℹ️ Supabase non configuré — Mode de stockage local actif.');
      this.notifyStatusListeners();
      return null;
    }

    try {
      const supabaseGlobal = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
        ? window.supabase.createClient
        : null;

      if (!supabaseGlobal) {
        throw new Error('La bibliothèque Supabase JS (@supabase/supabase-js) n\'est pas chargée.');
      }

      this.client = supabaseGlobal(this.config.url, this.config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: typeof window !== 'undefined' ? window.localStorage : undefined
        }
      });

      // Test de connectivité rapide
      const { error } = await this.client.from('species').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        console.warn('Avertissement connexion Supabase:', error.message);
      }

      this.status = 'connected';
      console.log('🟢 Supabase connecté avec succès :', this.config.url);
      window.supabaseClient = this.client;
      this.notifyStatusListeners();
      return this.client;
    } catch (err) {
      console.error('❌ Erreur initialisation Supabase:', err);
      this.status = 'error';
      this.notifyStatusListeners();
      return null;
    }
  },

  /**
   * Vérifie si Supabase est actuellement connecté et opérationnel
   */
  isReady() {
    return this.status === 'connected' && this.client !== null;
  },

  /**
   * Retourne le statut courant du client ('connected' | 'unconfigured' | 'error')
   */
  getStatus() {
    return this.status;
  },

  /**
   * Retourne l'instance client Supabase
   */
  getClient() {
    return this.client;
  },

  /**
   * Retourne la configuration active
   */
  getConfig() {
    return { ...this.config };
  },

  /**
   * Enregistre une nouvelle configuration Supabase saisie par l'utilisateur
   */
  async saveConfig(url, anonKey) {
    const cleanUrl = sanitizeSupabaseUrl(url);
    const cleanKey = (anonKey || '').trim();

    if (cleanUrl && cleanKey) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SUPABASE_STORAGE_CONFIG_KEY, JSON.stringify({ url: cleanUrl, anonKey: cleanKey }));
      }
    } else {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SUPABASE_STORAGE_CONFIG_KEY);
      }
    }

    return await this.init();
  },

  /**
   * Alias de saveConfig
   */
  async setConfig(url, anonKey) {
    return await this.saveConfig(url, anonKey);
  },

  /**
   * Teste la connectivité vers une base Supabase
   */
  async testConnection(targetUrl, targetKey) {
    const url = sanitizeSupabaseUrl(targetUrl || this.config.url);
    const key = (targetKey || this.config.anonKey || '').trim();

    if (!url || !key) {
      return { success: false, error: 'URL ou clé Supabase manquante.' };
    }

    try {
      const supabaseGlobal = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
        ? window.supabase.createClient
        : (typeof require !== 'undefined' ? require('@supabase/supabase-js').createClient : null);

      if (!supabaseGlobal) {
        return { success: false, error: 'Bibliothèque Supabase JS non disponible.' };
      }

      const tempClient = supabaseGlobal(url, key);
      const { error } = await tempClient.from('species').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Réinitialise la configuration Supabase (retour au mode local)
   */
  clearConfig() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SUPABASE_STORAGE_CONFIG_KEY);
    }
    this.client = null;
    this.status = 'unconfigured';
    this.config = { url: '', anonKey: '', isConfigured: false };
    this.notifyStatusListeners();
  },

  // Écouteurs de changement de statut Supabase
  listeners: [],
  onStatusChange(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
      fn(this.status, this.config);
    }
  },
  notifyStatusListeners() {
    this.listeners.forEach(fn => {
      try { fn(this.status, this.config); } catch (e) { console.error(e); }
    });
  }
};

// Export global pour utilisation dans toute l'application
if (typeof window !== 'undefined') {
  window.SupabaseClientManager = SupabaseClientManager;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseClientManager;
}
