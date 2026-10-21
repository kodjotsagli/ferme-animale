// Utilitaires de sécurisation DOM (Protection contre les erreurs null.textContent / null.innerHTML)
function safeSetText(idOrElem, text) {
  if (!idOrElem) return null;
  const el = typeof idOrElem === 'string' ? document.getElementById(idOrElem) : idOrElem;
  if (el) {
    el.textContent = (text !== undefined && text !== null) ? text : '';
    return el;
  }
  return null;
}

function safeSetHtml(idOrElem, html) {
  if (!idOrElem) return null;
  const el = typeof idOrElem === 'string' ? document.getElementById(idOrElem) : idOrElem;
  if (el) {
    el.innerHTML = (html !== undefined && html !== null) ? html : '';
    return el;
  }
  return null;
}

window.safeSetText = safeSetText;
window.safeSetHtml = safeSetHtml;

// Application Principale Agro-Ferme
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupEventListeners();

  // Initialisation du client Supabase et écoute des changements de connexion
  if (window.SupabaseClientManager) {
    try {
      await SupabaseClientManager.init();
      updateSupabaseStatusUI(SupabaseClientManager.getStatus());
      SupabaseClientManager.onStatusChange((status) => {
        updateSupabaseStatusUI(status);
      });
    } catch (err) {
      console.warn('Initialisation Supabase non bloquante :', err);
    }
  }

  // Écoute de l'expiration du token
  window.addEventListener('auth:expired', () => {
    showToast('Votre session a expiré. Veuillez vous reconnecter.', 'error');
    renderAuth();
  });

  // Vérifier si un token existe
  const token = API.getToken();
  if (!token) {
    renderAuth();
    return;
  }

  try {
    const meData = await API.getMe();
    State.user = meData.user;
    State.farms = meData.farms;

    if (State.farms.length === 0) {
      // Aucune ferme encore créée -> On ouvre l'écran d'accueil de création de ferme
      renderAppShell();
      openModal('modal-create-farm', true);
    } else {
      // Trouver la ferme sauvegardée ou prendre la première
      const savedFarmId = parseInt(API.getCurrentFarmId(), 10);
      const matched = State.farms.find(f => f.id === savedFarmId);
      State.currentFarm = matched || State.farms[0];
      API.setCurrentFarmId(State.currentFarm.id);

      renderAppShell();
      loadActiveView();
    }
  } catch (err) {
    console.error('Erreur initialisation session:', err);
    API.setToken(null);
    renderAuth();
  }
}

function formatUserErrorMessage(rawMessage) {
  if (!rawMessage) return 'Une erreur est survenue. Veuillez réessayer.';
  const str = String(rawMessage);
  if (str.includes('Failed to fetch') || str.includes('NetworkError') || str.includes('network error') || str.includes('Load failed')) {
    return 'Connexion au serveur ou à la base de données momentanément indisponible. Veuillez vérifier votre connexion et réessayer.';
  }
  if (str.includes('PGRST') || str.includes('postgrest') || (str.includes('relation') && str.includes('does not exist'))) {
    return 'Impossible de charger ou d\'enregistrer les données. Veuillez réessayer.';
  }
  if (str.includes('JWT expired') || str.includes('token is expired')) {
    return 'Votre session a expiré. Veuillez vous reconnecter.';
  }
  if (str.includes('schema cache') || str.includes('Could not find the table')) {
    return 'La table de base de données est introuvable. Veuillez exécuter le script supabase/schema.sql dans l\'éditeur SQL de votre projet Supabase.';
  }
  if (str.includes('email rate limit exceeded')) {
    return 'Trop de tentatives en peu de temps. Veuillez patienter un instant ou contacter l\'administrateur.';
  }
  return str;
}

// --------------------------------------------------------------------------
// SYSTÈME DE TOASTS
// --------------------------------------------------------------------------
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const displayMessage = type === 'error' ? formatUserErrorMessage(message) : message;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(displayMessage)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --------------------------------------------------------------------------
// MODALES
// --------------------------------------------------------------------------
function openModal(modalId, forceOpen = false) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    const closeBtn = modal.querySelector('.btn-close-modal');
    if (closeBtn) {
      closeBtn.style.display = forceOpen ? 'none' : '';
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// --------------------------------------------------------------------------
// NAVIGATION & ÉCOUTEURS GLOBAUX
// --------------------------------------------------------------------------
function updateActiveNav(view) {
  const currentView = view || State.activeView;
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    n.classList.remove('active-parent');
  });

  const parentSettings = document.getElementById('nav-item-settings');
  const submenuSettings = document.getElementById('submenu-settings');

  if (currentView === 'farm') {
    const farmSubitem = document.getElementById('nav-subitem-farm');
    if (farmSubitem) farmSubitem.classList.add('active');
    if (parentSettings) {
      parentSettings.classList.add('active-parent');
      parentSettings.classList.add('open');
    }
    if (submenuSettings) submenuSettings.style.display = 'flex';
  } else if (currentView === 'settings') {
    const settingsSubitem = document.getElementById('nav-subitem-settings');
    if (settingsSubitem) settingsSubitem.classList.add('active');
    if (parentSettings) {
      parentSettings.classList.add('active');
      parentSettings.classList.add('open');
    }
    if (submenuSettings) submenuSettings.style.display = 'flex';
  } else {
    const directItem = document.querySelector(`.nav-item[data-view="${currentView}"]:not(.nav-subitem)`);
    if (directItem) {
      directItem.classList.add('active');
    }
    if (parentSettings) {
      parentSettings.classList.remove('open');
    }
    if (submenuSettings) {
      submenuSettings.style.display = 'none';
    }
  }

  // Synchroniser la barre de navigation inférieure mobile Android
  document.querySelectorAll('.bottom-nav-item').forEach(b => {
    const bView = b.getAttribute('data-view');
    if (bView) {
      if (bView === currentView) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    }
  });
}

function setupEventListeners() {
  // Navigation latérale
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) {
        State.setView(view);

        // Fermer le menu mobile s'il est ouvert
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');
      }
    });
  });

  // Navigation inférieure mobile
  document.querySelectorAll('.bottom-nav-item[data-view]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) {
        State.setView(view);

        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');
      }
    });
  });

  const bnavMenu = document.getElementById('bnav-menu');
  if (bnavMenu) {
    bnavMenu.addEventListener('click', (e) => {
      e.preventDefault();
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.toggle('mobile-open');
    });
  }

  // Bouton menu mobile topbar
  const mobileBtn = document.getElementById('btn-mobile-menu');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('mobile-open');
    });
  }

  // Déconnexion
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      API.setToken(null);
      API.setCurrentFarmId(null);
      State.user = null;
      State.currentFarm = null;
      State.farms = [];
      showToast('Vous avez été déconnecté.', 'info');
      renderAuth();
    });
  }

  // Changement de ferme dans le sélecteur d'en-tête
  const farmSelect = document.getElementById('header-farm-select');
  if (farmSelect) {
    farmSelect.addEventListener('change', (e) => {
      const selectedId = parseInt(e.target.value, 10);
      if (selectedId === -1) {
        // Option "+ Créer une nouvelle ferme"
        openModal('modal-create-farm');
        farmSelect.value = State.currentFarm ? State.currentFarm.id : '';
        return;
      }
      const found = State.farms.find(f => f.id === selectedId);
      if (found) {
        State.setCurrentFarm(found);
        showToast(`Ferme active : « ${found.name} »`);
        loadActiveView();
      }
    });
  }

  // Fermeture des modales sur clic de fond ou bouton fermer
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        // Empêcher la fermeture si aucune ferme n'existe
        if (backdrop.id === 'modal-create-farm' && (!State.farms || State.farms.length === 0)) {
          return;
        }
        backdrop.classList.remove('active');
      }
    });
  });

  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop');
      if (modal) {
        if (modal.id === 'modal-create-farm' && (!State.farms || State.farms.length === 0)) {
          return;
        }
        modal.classList.remove('active');
      }
    });
  });

  // Écoute des changements d'état
  State.subscribe((event, data) => {
    if (event === 'view:changed') {
      updateActiveNav(data);
      loadActiveView();
    }
  });

  // Écouteurs de la modale de suppression d'exploitation
  setupDeleteFarmHandlers();

  // Écouteurs du module de suivi et de sexage des canetons
  setupDucklingHandlers();

  // Écouteurs de modification des bâtiments et des lots d'animaux
  setupBuildingAndAnimalLotHandlers();

  // Écouteurs de gestion et synchronisation Supabase
  setupSupabaseHandlers();
}

// --------------------------------------------------------------------------
// AFFICHAGE DES ÉCRANS AUTH / APP
// --------------------------------------------------------------------------
function renderAuth() {
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = 'none';
  const authShell = document.getElementById('auth-shell');
  if (authShell) authShell.style.display = 'flex';
  setupAuthForms();
}

function renderAppShell() {
  const authShell = document.getElementById('auth-shell');
  if (authShell) authShell.style.display = 'none';
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = 'flex';

  // Mettre à jour les infos utilisateur dans la barre latérale
  if (State.user) {
    safeSetText('sidebar-user-name', State.user.name);
    safeSetText('sidebar-user-email', State.user.email);
    safeSetText('sidebar-user-avatar', State.user.name ? State.user.name.charAt(0).toUpperCase() : 'U');
  }

  // Mettre à jour le sélecteur de ferme
  updateFarmSelector();

  // Mettre à jour l'indicateur de navigation active
  updateActiveNav(State.activeView);
}

function updateFarmSelector() {
  const select = document.getElementById('header-farm-select');
  if (!select) return;

  select.innerHTML = '';
  for (const farm of State.farms) {
    const opt = document.createElement('option');
    opt.value = farm.id;
    opt.textContent = `🏡 ${farm.name} (${farm.locality})`;
    if (State.currentFarm && farm.id === State.currentFarm.id) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  // Option d'ajout d'une nouvelle ferme
  const addOpt = document.createElement('option');
  addOpt.value = -1;
  addOpt.textContent = '➕ Créer une nouvelle ferme...';
  select.appendChild(addOpt);

  // Badge méta ferme
  const metaBadge = document.getElementById('header-farm-meta');
  if (metaBadge && State.currentFarm) {
    metaBadge.innerHTML = `📍 ${escapeHtml(State.currentFarm.locality)}, ${escapeHtml(State.currentFarm.country)} • <strong style="color:var(--primary-800)">${escapeHtml(State.currentFarm.currency)}</strong>`;
  }
}

// --------------------------------------------------------------------------
// ROUTEUR DE VUES
// --------------------------------------------------------------------------
function loadActiveView() {
  const view = State.activeView;
  State.destroyCharts();

  if (view === 'dashboard') {
    renderDashboardView();
  } else if (view === 'farm') {
    renderFarmView();
  } else if (view === 'species') {
    renderSpeciesView();
  } else if (view === 'animals') {
    renderAnimalsView();
  } else if (view === 'lots') {
    renderLotsView();
  } else if (view === 'movements') {
    renderMovementsView();
  } else if (view === 'reproduction') {
    renderReproductionView();
  } else if (view === 'eggs') {
    renderEggsView();
  } else if (view === 'health') {
    renderHealthView();
  } else if (view === 'feed') {
    renderFeedView();
  } else if (view === 'buildings') {
    renderBuildingsView();
  } else if (view === 'commercial') {
    renderCommercialView();
  } else if (view === 'finance') {
    renderFinanceView();
  } else if (view === 'history') {
    renderHistoryView();
  } else if (view === 'alerts') {
    renderAlertsView();
  } else if (view === 'settings') {
    renderSettingsView();
  }

  // Actualiser la cloche de notification
  if (typeof checkNotificationsBadge === 'function') {
    checkNotificationsBadge();
  }
}

// ==========================================================================
// 1. VUE TABLEAU DE BORD
// ==========================================================================
async function renderDashboardView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) {
    content.innerHTML = `<div class="card card-body"><p>Veuillez sélectionner ou créer une ferme.</p></div>`;
    return;
  }

  content.innerHTML = `
    <div class="dash-v2-container">
      <!-- 1. EN-TÊTE DU TABLEAU DE BORD (Conforme prompt section 1) -->
      <div class="dash-hero-header">
        <div class="dash-title-wrap">
          <h2 class="dash-title-main">
            <span class="dash-title-icon">📊</span>
            <span>Tableau de bord — <strong id="dash-farm-name">${escapeHtml(State.currentFarm.name)}</strong></span>
          </h2>
          <p class="dash-title-sub">Indicateurs en temps réel du cheptel, mouvements et bilans matières.</p>
        </div>
        <div class="dash-actions-bar">
          <select id="dash-species-filter" class="form-control" style="width:auto; font-weight:600; font-size:13px; padding:6px 12px;">
            <option value="toutes">Toutes les espèces</option>
          </select>
          <button id="btn-quick-movement" class="btn btn-primary btn-sm">⚡ Nouveau mouvement</button>
          <button id="btn-refresh-dash" class="btn btn-secondary btn-sm" title="Actualiser les données">🔄 Actualiser</button>
        </div>
      </div>

      <!-- ÉTAT DE CHARGEMENT -->
      <div id="dash-loading-state" style="display:none; text-align:center; padding:36px; background:#fff; border-radius:16px; border:1px solid #e2e8f0; margin-bottom:20px;">
        <div class="spinner" style="margin:0 auto 12px; width:28px; height:28px; border-width:3px;"></div>
        <div style="font-weight:600; color:#475569; font-size:14px;">Chargement des indicateurs en temps réel...</div>
      </div>

      <!-- ÉTAT D'ERREUR -->
      <div id="dash-error-state" style="display:none; background:#fff; border-radius:16px; border:1px solid #fee2e2; padding:30px; text-align:center; margin-bottom:20px;">
        <div style="font-size:32px; margin-bottom:8px;">⚠️</div>
        <h3 style="color:#b91c1c; font-size:15px; margin-bottom:6px; font-weight:700;">Impossible de charger les données du tableau de bord</h3>
        <p id="dash-error-message" style="color:#64748b; font-size:13px; margin-bottom:14px;">Une erreur est survenue lors de la récupération des données.</p>
        <button class="btn btn-secondary btn-sm" id="btn-retry-dash">🔄 Réessayer</button>
      </div>

      <!-- CONTENEUR DES DONNÉES DU TABLEAU DE BORD -->
      <div id="dash-content-area">
        <!-- 1. PREMIÈRE SECTION : INDICATEURS DU CHEPTEL -->
        <div id="dash-livestock-sections">
          <!-- Rendu dynamique par espèce active -->
        </div>

        <!-- 2. DEUXIÈME SECTION : RÉSUMÉ FINANCIER (3 grandes cartes) -->
        <div class="dash-financial-section" id="dash-financial-section">
          <!-- Rendu dynamique -->
        </div>

        <!-- 3. TROISIÈME SECTION : INCUBATION DES ŒUFS -->
        <div class="dash-incubation-section" id="dash-incubation-section">
          <!-- Rendu dynamique -->
        </div>
      </div>
    </div>
  `;

  // Événements d'en-tête et boutons
  const btnQuick = document.getElementById('btn-quick-movement');
  if (btnQuick) {
    btnQuick.addEventListener('click', () => {
      openMovementModal();
    });
  }

  const btnRefresh = document.getElementById('btn-refresh-dash');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      refreshDashboardData();
    });
  }

  const btnRetry = document.getElementById('btn-retry-dash');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      refreshDashboardData();
    });
  }

  // Remplir le filtre des espèces actives
  const spSelect = document.getElementById('dash-species-filter');
  if (spSelect) {
    try {
      const activeSpecies = await API.getSpecies(State.currentFarm.id);
      const activeList = (activeSpecies && Array.isArray(activeSpecies.species))
        ? activeSpecies.species.filter(s => s.is_active)
        : [];
      
      for (const sp of activeList) {
        const opt = document.createElement('option');
        opt.value = sp.id;
        opt.textContent = `${sp.icon} ${sp.name}`;
        spSelect.appendChild(opt);
      }

      spSelect.value = State.dashboardFilters.species_id || 'toutes';
      spSelect.addEventListener('change', () => {
        State.dashboardFilters.species_id = spSelect.value;
        refreshDashboardData();
      });
    } catch (err) {
      console.warn('Erreur chargement filtre espèces:', err);
    }
  }

  await refreshDashboardData();
}

async function refreshDashboardData() {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  const spFilter = State.dashboardFilters.species_id || 'toutes';
  const periodFilter = State.dashboardFilters.period || 'tous';

  const loadingEl = document.getElementById('dash-loading-state');
  const errorEl = document.getElementById('dash-error-state');
  const contentEl = document.getElementById('dash-content-area');

  if (loadingEl) loadingEl.style.display = 'block';
  if (errorEl) errorEl.style.display = 'none';

  try {
    const data = await API.getDashboard(farmId, spFilter, periodFilter);

    // Mettre à jour le nom de la ferme dans le titre
    safeSetText('dash-farm-name', State.currentFarm.name);

    // 1. Rendu Première section : Indicateurs du Cheptel
    const livestockContainer = document.getElementById('dash-livestock-sections');
    if (livestockContainer) {
      const indicators = Array.isArray(data.species_indicators) ? data.species_indicators : [];
      if (indicators.length === 0) {
        livestockContainer.innerHTML = `
          <div class="empty-growth-box" style="margin-bottom:20px;">
            <span style="font-size:24px;">🐾</span>
            <div style="flex:1;">
              <strong style="color:#0f172a;">Aucune espèce animale active pour cette ferme</strong>
              <p style="font-size:12.5px; color:#64748b; margin:2px 0 0;">
                Activez vos élevages dans la section « Espèces » pour visualiser les cartes d'effectifs en temps réel.
              </p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="State.setView('species')" style="white-space:nowrap;">
              Gérer les espèces
            </button>
          </div>
        `;
      } else {
        livestockContainer.innerHTML = indicators.map(sp => `
          <div class="dash-species-section" data-species-id="${sp.id}">
            <div class="dash-species-header">
              <div class="dash-species-title">
                <span style="font-size:20px;">${sp.icon}</span>
                <span>${escapeHtml(sp.name)}</span>
              </div>
              <span class="badge badge-gray" style="font-size:12px; font-weight:700;">
                ${(sp.total_count || 0).toLocaleString('fr-FR')} animal${sp.total_count > 1 ? 'aux' : ''} vivant${sp.total_count > 1 ? 's' : ''}
              </span>
            </div>
            <div class="dash-cards-grid">
              ${(Array.isArray(sp.cards) ? sp.cards : []).map(card => `
                <div class="dash-stat-card ${card.has_accent_bar ? 'has-accent-bar' : ''} ${card.is_total ? 'is-total-card' : ''}">
                  <div class="dash-stat-label">${escapeHtml(card.label)}</div>
                  <div class="dash-stat-value">${(card.count || 0).toLocaleString('fr-FR')}</div>
                  ${card.sublabel ? `<div class="dash-stat-sub">${escapeHtml(card.sublabel)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      }
    }

    // 2. Rendu Deuxième section : Résumé Financier (3 grandes cartes)
    const finContainer = document.getElementById('dash-financial-section');
    if (finContainer) {
      const fin = data.financial_summary || {
        total_revenues: 0,
        total_expenses: 0,
        solde_gestion: 0,
        currency: State.currentFarm.currency || 'FCFA',
        status: 'neutre'
      };

      const cur = escapeHtml(fin.currency || 'FCFA');
      const revFormatted = (fin.total_revenues || 0).toLocaleString('fr-FR');
      const expFormatted = (fin.total_expenses || 0).toLocaleString('fr-FR');
      const soldeFormatted = `${fin.solde_gestion > 0 ? '+' : ''}${(fin.solde_gestion || 0).toLocaleString('fr-FR')}`;

      finContainer.innerHTML = `
        <div class="dash-financial-grid">
          <!-- Carte 1 — Total des revenus enregistrés -->
          <div class="dash-fin-card" onclick="State.setView('finance')" title="Consulter les revenus">
            <div class="fin-card-top">
              <div class="fin-icon-box fin-icon-revenues">📈</div>
              <span class="badge badge-green" style="font-size:11px;">Recettes</span>
            </div>
            <div class="fin-amount fin-amount-revenues">${revFormatted} ${cur}</div>
            <div class="fin-title">Total des Revenus Enregistrés</div>
            <div class="fin-desc">Ventes d'animaux, œufs, lait et autres produits</div>
          </div>

          <!-- Carte 2 — Total des dépenses enregistrées -->
          <div class="dash-fin-card" onclick="State.setView('finance')" title="Consulter les dépenses">
            <div class="fin-card-top">
              <div class="fin-icon-box fin-icon-expenses">📉</div>
              <span class="badge badge-red" style="font-size:11px;">Charges</span>
            </div>
            <div class="fin-amount fin-amount-expenses">${expFormatted} ${cur}</div>
            <div class="fin-title">Total des Dépenses Enregistrées</div>
            <div class="fin-desc">Aliments, santé animale, cheptel et charges</div>
          </div>

          <!-- Carte 3 — Solde de gestion -->
          <div class="dash-fin-card solde-card solde-${fin.status}" onclick="State.setView('finance')" title="Consulter le solde de gestion">
            <div class="fin-card-top">
              <div class="fin-icon-box fin-icon-solde">⚖️</div>
              <span class="badge ${fin.status === 'positif' ? 'badge-green' : (fin.status === 'negatif' ? 'badge-red' : 'badge-gray')}" style="font-size:11px;">
                ${fin.status === 'positif' ? 'Excédent' : (fin.status === 'negatif' ? 'Déficit' : 'Équilibré')}
              </span>
            </div>
            <div class="fin-amount fin-amount-solde solde-${fin.status}">${soldeFormatted} ${cur}</div>
            <div class="fin-title">Solde de Gestion</div>
            <div class="fin-formula">Solde = Revenus − Dépenses</div>
            <div class="fin-disclaimer">Indicateur de gestion interne, ne constitue pas un solde bancaire réel</div>
          </div>
        </div>
      `;
    }

    // 3. Rendu Troisième section : Incubation des œufs
    renderDashboardIncubationSection(data);

    if (loadingEl) loadingEl.style.display = 'none';
  } catch (err) {
    console.error('Erreur chargement dashboard:', err);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      safeSetText('dash-error-message', err.message || 'Impossible de charger les données du tableau de bord.');
    }
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// SECTION TABLEAU DE BORD : INCUBATION DES ŒUFS
// ==========================================================================
if (typeof State !== 'undefined') {
  State.dashboardIncubationFilters = State.dashboardIncubationFilters || {
    species_id: 'toutes',
    status: 'en_cours'
  };
}

function renderDashboardIncubationSection(data) {
  const container = document.getElementById('dash-incubation-section');
  if (!container) return;

  const summary = data.incubation_summary || {
    total_eggs_incubated: 0,
    active_incubations_count: 0,
    upcoming_hatches_count: 0,
    total_hatched_eggs: 0,
    avg_hatch_rate: 0
  };

  const allIncubations = Array.isArray(data.incubations) ? data.incubations : [];

  // Espèces disponibles pour le filtre
  const speciesMap = {};
  allIncubations.forEach(i => {
    if (i.species_id) {
      speciesMap[i.species_id] = {
        id: i.species_id,
        name: i.species_name || i.species_id,
        icon: i.species_icon || '🥚'
      };
    }
  });

  const curSp = (typeof State !== 'undefined' && State.dashboardIncubationFilters && State.dashboardIncubationFilters.species_id) || 'toutes';
  const curSt = (typeof State !== 'undefined' && State.dashboardIncubationFilters && State.dashboardIncubationFilters.status) || 'en_cours';

  let filtered = [...allIncubations];
  if (curSp !== 'toutes') {
    filtered = filtered.filter(i => i.species_id === curSp);
  }
  if (curSt === 'en_cours') {
    filtered = filtered.filter(i => i.status !== 'termine' && i.status !== 'annule');
  } else if (curSt === 'termine') {
    filtered = filtered.filter(i => i.status === 'termine');
  }

  container.innerHTML = `
    <!-- En-tête de la section -->
    <div class="dash-inc-header">
      <div class="dash-inc-title-box">
        <div class="dash-inc-title">
          <span>🥚</span>
          <span>Incubation des œufs</span>
          ${summary.active_incubations_count > 0 ? `<span class="badge badge-blue" style="font-size:11px; margin-left:6px;">${summary.active_incubations_count} lot(s) actif(s)</span>` : ''}
        </div>
        <div class="dash-inc-subtitle">
          Suivi des lots en couveuse, dates d'éclosion prévues et progression temporelle des cycles.
        </div>
      </div>
      <div class="dash-inc-controls">
        <select id="dash-inc-species-filter" class="form-control dash-inc-select" style="font-size:12.5px; padding:6px 12px; font-weight:600;">
          <option value="toutes">Toutes les espèces</option>
          ${Object.values(speciesMap).map(sp => `
            <option value="${escapeHtml(sp.id)}" ${sp.id === curSp ? 'selected' : ''}>${sp.icon} ${escapeHtml(sp.name)}</option>
          `).join('')}
        </select>
        <select id="dash-inc-status-filter" class="form-control dash-inc-select" style="font-size:12.5px; padding:6px 12px; font-weight:600;">
          <option value="en_cours" ${curSt === 'en_cours' ? 'selected' : ''}>En cours d'incubation</option>
          <option value="termine" ${curSt === 'termine' ? 'selected' : ''}>Incubations terminées</option>
          <option value="toutes" ${curSt === 'toutes' ? 'selected' : ''}>Tous les lots</option>
        </select>
        <button id="btn-dash-new-incubation" class="btn btn-primary btn-sm dash-inc-btn-new" style="font-size:12.5px; font-weight:700;">
          ➕ Nouvelle incubation
        </button>
      </div>
    </div>

    <!-- 4 Cartes KPI Indicateurs en haut de section -->
    <div class="dash-inc-kpi-grid">
      <!-- 1. Total œufs incubés -->
      <div class="dash-inc-kpi-card">
        <div>
          <div class="dash-inc-kpi-label">Nombre total d'œufs incubés</div>
          <div class="dash-inc-kpi-val" style="color:#2563eb;">${(summary.total_eggs_incubated || 0).toLocaleString('fr-FR')}</div>
          <div class="dash-inc-kpi-sub">En cours d'incubation</div>
        </div>
        <div class="dash-inc-kpi-icon" style="background:#eff6ff; color:#2563eb;">🥚</div>
      </div>

      <!-- 2. Lots en incubation -->
      <div class="dash-inc-kpi-card">
        <div>
          <div class="dash-inc-kpi-label">Nombre de lots en incubation</div>
          <div class="dash-inc-kpi-val" style="color:#0f172a;">${(summary.active_incubations_count || 0).toLocaleString('fr-FR')}</div>
          <div class="dash-inc-kpi-sub">Couvaisons actives</div>
        </div>
        <div class="dash-inc-kpi-icon" style="background:#f8fafc; color:#475569;">🪺</div>
      </div>

      <!-- 3. Éclosions prévues prochainement -->
      <div class="dash-inc-kpi-card" style="${summary.upcoming_hatches_count > 0 ? 'border-color:#fde68a; background:#fffbeb;' : ''}">
        <div>
          <div class="dash-inc-kpi-label">Éclosions prévues prochainement</div>
          <div class="dash-inc-kpi-val" style="color:${summary.upcoming_hatches_count > 0 ? '#d97706' : '#64748b'};">${(summary.upcoming_hatches_count || 0).toLocaleString('fr-FR')}</div>
          <div class="dash-inc-kpi-sub">Sous 7 jours ou aujourd'hui</div>
        </div>
        <div class="dash-inc-kpi-icon" style="background:#fef3c7; color:#d97706;">🐣</div>
      </div>

      <!-- 4. Nombre d'œufs éclos -->
      <div class="dash-inc-kpi-card">
        <div>
          <div class="dash-inc-kpi-label">Nombre d'œufs éclos</div>
          <div class="dash-inc-kpi-val" style="color:#16a34a;">${(summary.total_hatched_eggs || 0).toLocaleString('fr-FR')}</div>
          <div class="dash-inc-kpi-sub">Total cumulé enregistré</div>
        </div>
        <div class="dash-inc-kpi-icon" style="background:#dcfce7; color:#16a34a;">🐥</div>
      </div>
    </div>

    <!-- Liste des lots sous forme de cartes -->
    ${filtered.length === 0 ? `
      <div class="empty-growth-box" style="margin-top:4px;">
        <span style="font-size:24px; flex-shrink:0;">🥚</span>
        <div style="flex:1; min-width:0;">
          <strong style="color:#0f172a; display:block; overflow-wrap:anywhere;">Aucun lot d'incubation pour ce filtre</strong>
          <p style="font-size:12.5px; color:#64748b; margin:2px 0 0; overflow-wrap:anywhere;">
            ${curSt === 'en_cours'
              ? 'Aucun lot en couvaison actuellement. Cliquez sur « Nouvelle incubation » pour lancer une couvée.'
              : 'Aucun enregistrement d\'incubation trouvé pour cette sélection.'}
          </p>
        </div>
        <button class="btn btn-primary btn-sm btn-quick-new-inc" style="font-size:12px;">
          ➕ Nouvelle incubation
        </button>
      </div>
    ` : `
      <div class="dash-inc-grid">
        ${filtered.map(inc => {
          let fillClass = '';
          if (inc.computed_status === 'en_retard') fillClass = 'fill-red';
          else if (inc.computed_status === 'eclosion_attendue') fillClass = 'fill-amber';

          const methodLabel = inc.incubator_type || (inc.method === 'artificielle' ? '⚡ Couveuse artificielle' : '🪺 Couvaison naturelle');

          return `
            <div class="dash-inc-card" data-inc-id="${inc.id}">
              <div>
                <div class="dash-inc-card-top">
                  <div>
                    <div class="dash-inc-card-title">
                      <span>${inc.species_icon || '🥚'}</span>
                      <span>${escapeHtml(inc.code || inc.name)}</span>
                    </div>
                    <div class="dash-inc-card-sub">
                      ${escapeHtml(inc.species_name || '')} • <strong>${inc.eggs_count}</strong> œufs incubés
                    </div>
                  </div>
                  <span class="badge ${inc.badge_class}" style="font-weight:700;">${inc.status_label}</span>
                </div>

                <div class="dash-inc-meta-row">
                  <span style="color:#64748b;">Emplacement :</span>
                  <strong style="color:#1e293b;">${escapeHtml(methodLabel)}</strong>
                </div>
                <div class="dash-inc-meta-row">
                  <span style="color:#64748b;">Date de démarrage :</span>
                  <span>${escapeHtml(inc.start_date || '—')}</span>
                </div>
                <div class="dash-inc-meta-row">
                  <span style="color:#64748b;">Éclosion prévue (${inc.duration_days} j) :</span>
                  <strong style="color:#0f172a;">${escapeHtml(inc.expected_hatch_date || '—')}</strong>
                </div>

                <!-- BARRE DE PROGRESSION TEMPORELLE DU CYCLE (ET NON TAUX D'ÉCLOSION) -->
                <div class="dash-inc-progress-wrap">
                  <div class="dash-inc-progress-head">
                    <span>Progression du cycle d'incubation</span>
                    <strong>${inc.progress_percent}%</strong>
                  </div>
                  <div class="dash-inc-progress-track">
                    <div class="dash-inc-progress-fill ${fillClass}" style="width:${inc.progress_percent}%;"></div>
                  </div>
                  <div class="dash-inc-progress-foot">
                    <span>${inc.days_elapsed} j écoulés / ${inc.duration_days} j</span>
                    <span style="font-weight:700; color:${inc.days_remaining <= 0 ? '#b91c1c' : '#0369a1'};">${escapeHtml(inc.days_remaining_label)}</span>
                  </div>
                </div>

                ${(inc.status === 'termine' || inc.hatched_count > 0) ? `
                  <div class="dash-inc-meta-row" style="background:#f0fdf4; border-radius:8px; padding:6px 10px; margin-top:6px; border:1px solid #bbf7d0;">
                    <span style="color:#166534; font-weight:600;">Résultat d'éclosion :</span>
                    <strong style="color:#15803d;">${inc.hatched_count} éclos (${inc.live_young_count || inc.hatched_count} vivants - ${inc.hatch_rate || 0}%)</strong>
                  </div>
                ` : ''}
              </div>

              <!-- ACTIONS SUR CHAQUE CARTE -->
              <div class="dash-inc-actions">
                <button class="btn btn-secondary btn-sm btn-view-inc-details" data-id="${inc.id}" title="Consulter l'historique et les observations">
                  👁️ Voir les détails
                </button>
                <button class="btn btn-secondary btn-sm btn-edit-inc" data-id="${inc.id}" title="Modifier les paramètres du lot">
                  ✏️ Modifier
                </button>
                ${inc.status !== 'termine' ? `
                  <button class="btn btn-primary btn-sm btn-record-hatch" data-id="${inc.id}" style="font-weight:700;" title="Renseigner le résultat final de l'éclosion">
                    🐣 Enregistrer l'éclosion
                  </button>
                ` : `
                  <span class="badge badge-green" style="font-size:11.5px; padding:4px 8px;">✅ Terminée</span>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  // Événements des filtres et boutons
  const spSelect = document.getElementById('dash-inc-species-filter');
  if (spSelect) {
    spSelect.addEventListener('change', () => {
      if (typeof State !== 'undefined') {
        State.dashboardIncubationFilters = State.dashboardIncubationFilters || {};
        State.dashboardIncubationFilters.species_id = spSelect.value;
      }
      renderDashboardIncubationSection(data);
    });
  }

  const stSelect = document.getElementById('dash-inc-status-filter');
  if (stSelect) {
    stSelect.addEventListener('change', () => {
      if (typeof State !== 'undefined') {
        State.dashboardIncubationFilters = State.dashboardIncubationFilters || {};
        State.dashboardIncubationFilters.status = stSelect.value;
      }
      renderDashboardIncubationSection(data);
    });
  }

  const btnNew = document.getElementById('btn-dash-new-incubation');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      if (typeof openNewIncubationModal === 'function') openNewIncubationModal();
      else if (typeof openIncubationModal === 'function') openIncubationModal();
    });
  }

  document.querySelectorAll('.btn-quick-new-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof openNewIncubationModal === 'function') openNewIncubationModal();
      else if (typeof openIncubationModal === 'function') openIncubationModal();
    });
  });

  document.querySelectorAll('.btn-view-inc-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (id && typeof openIncubationDetailsModal === 'function') openIncubationDetailsModal(id);
    });
  });

  document.querySelectorAll('.btn-edit-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (id && typeof openEditIncubationModal === 'function') openEditIncubationModal(id);
    });
  });

  document.querySelectorAll('.btn-record-hatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (id && typeof openRecordHatchModal === 'function') openRecordHatchModal(id);
      else if (id && typeof openValidateHatchModal === 'function') openValidateHatchModal(id);
    });
  });
}

function renderDashboardCharts(data) {
  State.destroyCharts();

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js non disponible.');
    return;
  }

  // 1. Graphique des espèces
  const spCanvas = document.getElementById('chart-species');
  if (spCanvas) {
    const spLabels = data.species_breakdown.map(s => `${s.icon} ${s.name}`);
    const spValues = data.species_breakdown.map(s => s.count);

    State.charts.speciesChart = new Chart(spCanvas, {
      type: 'bar',
      data: {
        labels: spLabels,
        datasets: [{
          label: 'Effectif vivant',
          data: spValues,
          backgroundColor: '#15803d',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        }
      }
    });
  }

  // 2. Graphique par sexe
  const genderCanvas = document.getElementById('chart-gender');
  if (genderCanvas) {
    const totalGender = (data.gender_breakdown.M || 0) + (data.gender_breakdown.F || 0) + (data.gender_breakdown.MIXTE || 0);

    State.charts.genderChart = new Chart(genderCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Femelles (F)', 'Mâles (M)', 'Mixte / Jeunes'],
        datasets: [{
          data: [
            data.gender_breakdown.F || 0,
            data.gender_breakdown.M || 0,
            data.gender_breakdown.MIXTE || 0
          ],
          backgroundColor: ['#be185d', '#0284c7', '#f59e0b']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

// --------------------------------------------------------------------------
// GESTION DE LA SUPPRESSION D'UNE EXPLOITATION
// --------------------------------------------------------------------------
let currentTargetFarmToDelete = null;

function openDeleteFarmModal(targetFarm) {
  currentTargetFarmToDelete = targetFarm;

  const nameEl = document.getElementById('delete-farm-target-name');
  if (nameEl) {
    nameEl.textContent = `🏡 ${targetFarm.name} (${targetFarm.locality}, ${targetFarm.country})`;
  }

  const activeWarningEl = document.getElementById('delete-farm-active-warning');
  const confirmGroupEl = document.getElementById('delete-farm-confirm-input-group');
  const checkboxConfirm = document.getElementById('delete-farm-checkbox-confirm');
  const btnConfirm = document.getElementById('btn-confirm-delete-farm');
  const btnConfirmText = document.getElementById('btn-confirm-delete-farm-text');

  if (checkboxConfirm) {
    checkboxConfirm.checked = false;
  }
  if (btnConfirmText) {
    btnConfirmText.textContent = 'Confirmer la suppression';
  }

  const isActive = State.currentFarm && State.currentFarm.id === targetFarm.id;
  const isSingle = State.farms.length <= 1;

  if (isActive && isSingle) {
    // Cas 1 : La seule et unique ferme de l'utilisateur
    if (activeWarningEl) {
      activeWarningEl.style.display = 'block';
      activeWarningEl.innerHTML = `
        <div style="background:#fffbeb; border:1.5px solid #f59e0b; border-radius:var(--radius-md); padding:12px 14px;">
          <div style="font-weight:700; color:#b45309; font-size:13.5px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>⚠️</span> <span>Dernière exploitation enregistrée</span>
          </div>
          <p style="font-size:12.5px; color:#92400e; margin:0; line-height:1.45;">
            Cette exploitation est votre <strong>seule et unique ferme</strong>. Sa suppression effacera l'ensemble de votre cheptel et vos données associées. Vous devrez obligatoirement créer une nouvelle ferme pour continuer à utiliser l'application.
          </p>
        </div>
      `;
    }
    if (confirmGroupEl) confirmGroupEl.style.display = 'block';
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.style.opacity = '0.6';
      btnConfirm.style.cursor = 'not-allowed';
    }
  } else if (isActive && !isSingle) {
    // Cas 2 : Ferme active, mais d'autres fermes existent
    const otherFarms = State.farms.filter(f => f.id !== targetFarm.id);
    if (activeWarningEl) {
      activeWarningEl.style.display = 'block';
      activeWarningEl.innerHTML = `
        <div style="background:#eff6ff; border:1.5px solid #3b82f6; border-radius:var(--radius-md); padding:12px 14px;">
          <div style="font-weight:700; color:#1d4ed8; font-size:13.5px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>📌</span> <span>Exploitation actuellement active</span>
          </div>
          <p style="font-size:12.5px; color:#1e40af; margin:0 0 10px 0; line-height:1.45;">
            Cette ferme est actuellement sélectionnée. Choisissez l'exploitation qui deviendra active après sa suppression :
          </p>
          <label class="form-label" style="font-size:12px; font-weight:600; color:#1e40af; margin-bottom:4px;">Nouvelle exploitation active :</label>
          <select id="select-delete-switch-farm" class="form-control" style="font-size:13px; font-weight:600;">
            ${otherFarms.map(of => `<option value="${of.id}">🏡 ${escapeHtml(of.name)} (${escapeHtml(of.locality)})</option>`).join('')}
          </select>
        </div>
      `;
    }
    if (confirmGroupEl) confirmGroupEl.style.display = 'none';
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.style.opacity = '1';
      btnConfirm.style.cursor = 'pointer';
    }
  } else {
    // Cas 3 : Ferme non-active
    if (activeWarningEl) {
      activeWarningEl.style.display = 'none';
      activeWarningEl.innerHTML = '';
    }
    if (confirmGroupEl) confirmGroupEl.style.display = 'none';
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.style.opacity = '1';
      btnConfirm.style.cursor = 'pointer';
    }
  }

  // Écouteur de validation de la case à cocher
  if (checkboxConfirm && btnConfirm) {
    checkboxConfirm.onchange = () => {
      if (confirmGroupEl && confirmGroupEl.style.display !== 'none') {
        btnConfirm.disabled = !checkboxConfirm.checked;
        btnConfirm.style.opacity = checkboxConfirm.checked ? '1' : '0.6';
        btnConfirm.style.cursor = checkboxConfirm.checked ? 'pointer' : 'not-allowed';
      }
    };
  }

  openModal('modal-delete-farm');
}

function setupDeleteFarmHandlers() {
  const btnConfirm = document.getElementById('btn-confirm-delete-farm');
  const btnCancel = document.getElementById('btn-cancel-delete-farm');
  const btnClose = document.getElementById('btn-close-delete-farm-modal');

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      currentTargetFarmToDelete = null;
    });
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      currentTargetFarmToDelete = null;
    });
  }

  if (!btnConfirm) return;

  btnConfirm.addEventListener('click', async () => {
    if (!currentTargetFarmToDelete) return;

    const targetFarm = currentTargetFarmToDelete;
    const confirmGroupEl = document.getElementById('delete-farm-confirm-input-group');
    const checkboxConfirm = document.getElementById('delete-farm-checkbox-confirm');
    const textSpan = document.getElementById('btn-confirm-delete-farm-text');

    if (confirmGroupEl && confirmGroupEl.style.display !== 'none' && checkboxConfirm && !checkboxConfirm.checked) {
      showToast('Veuillez cocher la case de confirmation pour continuer.', 'error');
      return;
    }

    const switchSelect = document.getElementById('select-delete-switch-farm');
    const replacementFarmId = switchSelect ? parseInt(switchSelect.value, 10) : null;

    btnConfirm.disabled = true;
    btnConfirm.style.opacity = '0.6';
    btnConfirm.style.cursor = 'not-allowed';
    if (textSpan) textSpan.textContent = 'Suppression en cours...';

    try {
      const res = await API.deleteFarm(targetFarm.id);
      closeModal('modal-delete-farm');
      currentTargetFarmToDelete = null;
      showToast(res.message || "L'exploitation a été supprimée avec succès.");

      if (res.remaining_farms) {
        State.farms = res.remaining_farms;
      } else {
        State.farms = State.farms.filter(f => f.id !== targetFarm.id);
      }

      if (State.currentFarm && State.currentFarm.id === targetFarm.id) {
        if (State.farms.length > 0) {
          const replacement = State.farms.find(f => f.id === replacementFarmId) || State.farms[0];
          State.setCurrentFarm(replacement);
          updateFarmSelector();
          renderFarmView();
        } else {
          State.setCurrentFarm(null);
          updateFarmSelector();
          renderFarmView();
          openModal('modal-create-farm', true);
        }
      } else {
        updateFarmSelector();
        renderFarmView();
      }
    } catch (err) {
      console.error('Erreur suppression exploitation:', err);
      showToast(err.message || 'Impossible de supprimer cette exploitation. Veuillez réessayer.', 'error');
    } finally {
      btnConfirm.disabled = false;
      btnConfirm.style.opacity = '1';
      btnConfirm.style.cursor = 'pointer';
      if (textSpan) textSpan.textContent = 'Confirmer la suppression';
    }
  });
}

// ==========================================================================
// 2. VUE « MA FERME » (PROFIL ET GESTION MULTI-FERMES)
// ==========================================================================
async function renderFarmView() {
  const content = document.getElementById('page-container');
  const farm = State.currentFarm;

  if (!farm) {
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div style="font-size:12px; font-weight:600; color:var(--gray-500); margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>⚙️ Paramètres</span>
            <span>&gt;</span>
            <span style="color:var(--primary-700); font-weight:700;">🏡 Ma ferme</span>
          </div>
          <h2 class="page-title">🏡 Ma Ferme — Fiche & Exploitations</h2>
          <p class="page-subtitle">Informations générales de l'exploitation active et gestion multi-fermes.</p>
        </div>
        <button class="btn btn-primary" id="btn-add-another-farm">➕ Créer une nouvelle ferme</button>
      </div>
      <div class="card" style="text-align:center; padding:48px 20px;">
        <div style="font-size:48px; margin-bottom:12px;">🏡</div>
        <h3 style="font-size:18px; font-weight:700; color:var(--gray-800); margin-bottom:8px;">Aucune exploitation active</h3>
        <p style="font-size:13.5px; color:var(--gray-500); max-width:460px; margin:0 auto 20px auto; line-height:1.5;">
          Vous n'avez pas encore d'exploitation enregistrée ou vous venez de supprimer votre ferme. Créez une nouvelle exploitation pour continuer à gérer votre cheptel.
        </p>
        <button class="btn btn-primary" id="btn-create-first-farm">➕ Créer une exploitation</button>
      </div>
    `;
    document.getElementById('btn-add-another-farm')?.addEventListener('click', () => {
      openModal('modal-create-farm', true);
    });
    document.getElementById('btn-create-first-farm')?.addEventListener('click', () => {
      openModal('modal-create-farm', true);
    });
    return;
  }

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div style="font-size:12px; font-weight:600; color:var(--gray-500); margin-bottom:4px; display:flex; align-items:center; gap:6px;">
          <span>⚙️ Paramètres</span>
          <span>&gt;</span>
          <span style="color:var(--primary-700); font-weight:700;">🏡 Ma ferme</span>
        </div>
        <h2 class="page-title">🏡 Ma Ferme — Fiche & Exploitations</h2>
        <p class="page-subtitle">Informations générales de l'exploitation active et gestion multi-fermes.</p>
      </div>
      <button class="btn btn-primary" id="btn-add-another-farm">➕ Créer une nouvelle ferme</button>
    </div>

    <!-- ONGLETS DE NAVIGATION SOUS-RUBRIQUES PARAMÈTRES -->
    <div class="settings-subnav">
      <button class="btn btn-primary btn-sm" id="btn-subnav-farm-active" style="cursor:default;">
        🏡 Ma ferme (Fiche & Exploitations)
      </button>
      <button class="btn btn-secondary btn-sm" id="btn-subnav-settings-goto">
        🏷️ Catégories & Configuration
      </button>
    </div>

    <div class="farm-view-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap:20px;">
      <!-- CARTE PARAMÈTRES FERME ACTIVE -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Fiche de l'exploitation active</h3>
          <span class="badge badge-green">Ferme active</span>
        </div>
        <div class="card-body">
          <form id="form-edit-farm">
            <div class="form-group">
              <label class="form-label">Nom de la ferme *</label>
              <input type="text" id="farm-name" class="form-control" value="${escapeHtml(farm.name)}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Nom du propriétaire / exploitant *</label>
              <input type="text" id="farm-owner" class="form-control" value="${escapeHtml(farm.owner_name)}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Pays *</label>
                <input type="text" id="farm-country" class="form-control" value="${escapeHtml(farm.country)}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Localité / Ville *</label>
                <input type="text" id="farm-locality" class="form-control" value="${escapeHtml(farm.locality)}" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Type d'exploitation *</label>
                <input type="text" id="farm-type" class="form-control" value="${escapeHtml(farm.farm_type)}" required placeholder="Ex: Aviculture, Élevage biologique...">
              </div>
              <div class="form-group">
                <label class="form-label">Devise utilisée *</label>
                <select id="farm-currency" class="form-control">
                  <option value="FCFA" ${farm.currency === 'FCFA' ? 'selected' : ''}>FCFA (Franc CFA)</option>
                  <option value="EUR" ${farm.currency === 'EUR' ? 'selected' : ''}>EUR (€ Euro)</option>
                  <option value="USD" ${farm.currency === 'USD' ? 'selected' : ''}>USD ($ Dollar)</option>
                  <option value="CAD" ${farm.currency === 'CAD' ? 'selected' : ''}>CAD ($ Dollar canadien)</option>
                  <option value="MAD" ${farm.currency === 'MAD' ? 'selected' : ''}>MAD (Dirham marocain)</option>
                  <option value="GNF" ${farm.currency === 'GNF' ? 'selected' : ''}>GNF (Franc guinéen)</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Date de démarrage de l'activité *</label>
              <input type="date" id="farm-start-date" class="form-control" value="${escapeHtml(farm.start_date)}" required>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary">Enregistrer les modifications</button>
            </div>
          </form>
        </div>
      </div>

      <!-- LISTE DES FERMES DE L'UTILISATEUR -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Vos Exploitations (${State.farms.length})</h3>
        </div>
        <div class="card-body">
          <p style="font-size:13px; color:var(--gray-500); margin-bottom:16px;">
            Vous pouvez gérer plusieurs fermes distinctes avec vos propres espèces et lots. Cliquez sur « Basculer » pour activer une ferme.
          </p>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${State.farms.map(f => `
              <div style="border: 1.5px solid ${f.id === farm.id ? 'var(--primary-600)' : 'var(--gray-200)'}; border-radius: var(--radius-md); padding:16px; background:${f.id === farm.id ? 'var(--primary-50)' : '#fff'}; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                <div>
                  <h4 style="font-size:15px; font-weight:700; color:var(--gray-900);">🏡 ${escapeHtml(f.name)}</h4>
                  <p style="font-size:12px; color:var(--gray-600); margin-top:2px;">
                    ${escapeHtml(f.locality)}, ${escapeHtml(f.country)} • Devise: ${escapeHtml(f.currency)} • Type: ${escapeHtml(f.farm_type)}
                  </p>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  ${f.id === farm.id
                    ? `<span class="badge badge-green">Actuelle</span>`
                    : `<button class="btn btn-secondary btn-sm btn-switch-farm" data-farm-id="${f.id}">Basculer</button>`
                  }
                  <button class="btn btn-sm btn-delete-farm" data-farm-id="${f.id}" title="Supprimer cette exploitation" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; display:inline-flex; align-items:center; gap:4px; font-weight:600; padding:6px 10px; border-radius:var(--radius-md); cursor:pointer;">
                    <span>🗑️</span> Supprimer
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Écouteur création nouvelle ferme
  document.getElementById('btn-add-another-farm').addEventListener('click', () => {
    openModal('modal-create-farm');
  });

  // Écouteur onglet vers paramètres généraux
  const btnSubnavSettings = document.getElementById('btn-subnav-settings-goto');
  if (btnSubnavSettings) {
    btnSubnavSettings.addEventListener('click', () => {
      State.setView('settings');
    });
  }

  // Écouteurs bascule de ferme
  document.querySelectorAll('.btn-switch-farm').forEach(btn => {
    btn.addEventListener('click', () => {
      const fId = parseInt(btn.getAttribute('data-farm-id'), 10);
      const f = State.farms.find(item => item.id === fId);
      if (f) {
        State.setCurrentFarm(f);
        showToast(`Ferme active modifiée : « ${f.name} »`);
        updateFarmSelector();
        renderFarmView();
      }
    });
  });

  // Écouteurs suppression d'exploitation
  document.querySelectorAll('.btn-delete-farm').forEach(btn => {
    btn.addEventListener('click', () => {
      const fId = parseInt(btn.getAttribute('data-farm-id'), 10);
      const f = State.farms.find(item => item.id === fId);
      if (f) {
        openDeleteFarmModal(f);
      }
    });
  });

  // Sauvegarde des modifications de la ferme
  document.getElementById('form-edit-farm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updatedData = {
      name: document.getElementById('farm-name').value,
      owner_name: document.getElementById('farm-owner').value,
      country: document.getElementById('farm-country').value,
      locality: document.getElementById('farm-locality').value,
      farm_type: document.getElementById('farm-type').value,
      currency: document.getElementById('farm-currency').value,
      start_date: document.getElementById('farm-start-date').value
    };

    try {
      const res = await API.updateFarm(farm.id, updatedData);
      State.currentFarm = res.farm;
      const idx = State.farms.findIndex(f => f.id === farm.id);
      if (idx !== -1) State.farms[idx] = res.farm;
      updateFarmSelector();
      showToast('Informations de la ferme mises à jour avec succès.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ==========================================================================
// 3. VUE « MES ANIMAUX » (SÉLECTION DES ESPÈCES)
// ==========================================================================
async function renderSpeciesView() {
  const content = document.getElementById('page-container');
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">🐾 Mes Animaux — Sélection des Espèces</h2>
        <p class="page-subtitle">Sélectionnez les espèces élevées sur votre ferme ou ajoutez vos espèces sur-mesure.</p>
      </div>
      <button class="btn btn-primary" id="btn-open-custom-species">➕ Ajouter une espèce personnalisée</button>
    </div>

    <!-- BANNIÈRE D'INFORMATION CONSERVATION DES DONNÉES -->
    <div style="background-color: var(--primary-50); border: 1.5px solid var(--primary-200); border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 24px; display:flex; align-items:center; gap:12px;">
      <span style="font-size:24px;">🛡️</span>
      <div style="font-size:13.5px; color:var(--primary-900);">
        <strong>Préservation intégrale des données :</strong> Vous pouvez activer ou retirer une espèce à tout moment. La désactivation masque simplement l'espèce des filtres quotidiens sans jamais supprimer vos animaux, lots ou historiques enregistrés.
      </div>
    </div>

    <!-- ÉTAT 1 : CHARGEMENT INITIAL -->
    <div class="species-grid" id="species-cards-container">
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--gray-500);">
        <div style="font-size: 36px; margin-bottom: 12px; animation: pulse 1.5s infinite;">⏳</div>
        <p style="font-size: 15px; font-weight: 500;">Chargement des espèces...</p>
      </div>
    </div>
  `;

  const btnOpenCustom = document.getElementById('btn-open-custom-species');
  if (btnOpenCustom) {
    btnOpenCustom.addEventListener('click', () => {
      openModal('modal-custom-species');
    });
  }

  const container = document.getElementById('species-cards-container');

  try {
    const data = await API.getSpecies(farmId);
    const rawSpecies = (data && Array.isArray(data.species)) ? data.species : [];
    State.species = rawSpecies;

    if (!container) return;

    // ÉTAT 2A : SUCCÈS MAIS LISTE RÉELLEMENT VIDE
    if (rawSpecies.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 24px; background: white; border: 2px dashed var(--gray-300); border-radius: var(--radius-lg);">
          <div style="font-size: 40px; margin-bottom: 12px;">🐾</div>
          <h3 style="font-size: 18px; font-weight: 600; color: var(--gray-800); margin-bottom: 8px;">
            Aucune espèce n'est encore disponible. Ajoutez votre première espèce pour commencer.
          </h3>
          <p style="color: var(--gray-500); font-size: 14px; margin-bottom: 20px; max-width: 500px; margin-left: auto; margin-right: auto;">
            Configurez les espèces d'animaux que vous élevez sur votre ferme pour activer le suivi du cheptel, de la reproduction et des pontes.
          </p>
          <button class="btn btn-primary" id="btn-empty-add-species">
            ➕ Ajouter une espèce personnalisée
          </button>
        </div>
      `;
      const emptyBtn = document.getElementById('btn-empty-add-species');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', () => openModal('modal-custom-species'));
      }
      return;
    }

    // ÉTAT 2B : SUCCÈS AVEC CARTES D'ESPÈCES SÉCURISÉES
    container.innerHTML = rawSpecies.map(sp => {
      const isChecked = sp.is_active ? 'checked' : '';
      const cardClass = sp.is_active ? 'species-card active' : 'species-card inactive';
      const categories = Array.isArray(sp.categories) ? sp.categories : [];
      const liveCount = typeof sp.live_count === 'number' 
        ? sp.live_count 
        : (typeof sp.head_count === 'number' ? sp.head_count : 0);

      const categoriesHtml = categories.length > 0
        ? categories.map(c => {
            const catName = typeof c === 'string' ? c : (c && c.name ? c.name : '');
            return catName ? `<span class="category-pill">${escapeHtml(catName)}</span>` : '';
          }).filter(Boolean).join('')
        : '<span style="font-size: 11.5px; color: var(--gray-400); font-style: italic;">Catégories générales</span>';

      return `
        <div class="${cardClass}" id="species-card-${sp.id}">
          <div class="species-card-header">
            <div class="species-avatar">${sp.icon || '🐾'}</div>
            <label class="toggle-switch">
              <input type="checkbox" data-species-id="${sp.id}" ${isChecked} class="species-toggle">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <h3 class="species-title">${escapeHtml(sp.name || 'Espèce')}</h3>
          <p class="species-desc">${escapeHtml(sp.description || '')}</p>

          <div style="font-size:12px; font-weight:600; color:var(--gray-600); margin-bottom:6px;">Catégories disponibles :</div>
          <div class="species-categories-pills">
            ${categoriesHtml}
          </div>

          <div class="species-stats-bar">
            <span class="species-headcount">${liveCount.toLocaleString('fr-FR')} tête(s) vivante(s)</span>
            <span class="badge ${sp.is_active ? 'badge-green' : 'badge-gray'}">
              ${sp.is_active ? 'Actif sur la ferme' : 'Inactif'}
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Écouteurs de bascule (toggle)
    container.querySelectorAll('.species-toggle').forEach(input => {
      input.addEventListener('change', async () => {
        const spId = input.getAttribute('data-species-id');
        const isActive = input.checked;
        const card = document.getElementById(`species-card-${spId}`);

        try {
          const res = await API.toggleSpecies(farmId, spId, isActive);
          if (card) {
            if (isActive) {
              card.classList.remove('inactive');
              card.classList.add('active');
            } else {
              card.classList.remove('active');
              card.classList.add('inactive');
            }
            const badge = card.querySelector('.badge');
            if (badge) {
              badge.className = `badge ${isActive ? 'badge-green' : 'badge-gray'}`;
              badge.textContent = isActive ? 'Actif sur la ferme' : 'Inactif';
            }
          }
          showToast(res.message);
        } catch (err) {
          input.checked = !isActive;
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    console.error('Erreur chargement espèces:', err);
    // ÉTAT 3 : ERREUR EXPLICITE AVEC BOUTON RÉESSAYER
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; background: #fef2f2; border: 1.5px solid #fecaca; border-radius: var(--radius-lg);">
          <div style="font-size: 36px; margin-bottom: 10px;">⚠️</div>
          <h3 style="font-size: 16px; font-weight: 600; color: #991b1b; margin-bottom: 6px;">
            Impossible de charger les espèces
          </h3>
          <p style="color: #b91c1c; font-size: 13.5px; margin-bottom: 16px; max-width: 500px; margin-left: auto; margin-right: auto;">
            ${escapeHtml(err.message || 'Une erreur inattendue est survenue lors de la récupération des données.')}
          </p>
          <button class="btn btn-primary" id="btn-retry-species" style="background-color: #dc2626; border-color: #dc2626;">
            🔄 Réessayer
          </button>
        </div>
      `;
      const retryBtn = document.getElementById('btn-retry-species');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          renderSpeciesView();
        });
      }
    }
    showToast(err.message || 'Erreur chargement des espèces', 'error');
  }
}

// ==========================================================================
// 4. VUE GESTION DU CHEPTEL (FICHES INDIVIDUELLES & LOTS)
// ==========================================================================
async function renderAnimalsView() {
  const content = document.getElementById('page-container');
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">📋 Gestion du Cheptel</h2>
        <p class="page-subtitle">Enregistrement et suivi des animaux individuels et des lots.</p>
      </div>
      <button class="btn btn-primary" id="btn-add-animal">➕ Enregistrer un animal ou lot</button>
    </div>

    <!-- FILTRES ET RECHERCHE -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body" style="padding:16px;">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; align-items:center;">
          <div>
            <label class="form-label" style="font-size:11px;">Recherche (Code, race, note)</label>
            <input type="text" id="filter-anim-search" class="form-control" placeholder="Ex: POU-001, Goliath...">
          </div>
          <div>
            <label class="form-label" style="font-size:11px;">Espèce</label>
            <select id="filter-anim-species" class="form-control">
              <option value="toutes">Toutes les espèces</option>
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px;">Sexe</label>
            <select id="filter-anim-gender" class="form-control">
              <option value="tous">Tous les sexes</option>
              <option value="F">Femelle (F)</option>
              <option value="M">Mâle (M)</option>
              <option value="MIXTE">Mixte / Non sexé</option>
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px;">Statut</label>
            <select id="filter-anim-status" class="form-control">
              <option value="actif">Actifs uniquement</option>
              <option value="sorti">Sortis / Clôturés</option>
              <option value="tous">Tous les statuts</option>
            </select>
          </div>
          <div style="padding-top:18px;">
            <button class="btn btn-secondary" id="btn-reset-anim-filters" style="width:100%;">Réinitialiser</button>
          </div>
        </div>
      </div>
    </div>

    <!-- TABLEAU DU CHEPTEL -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Fiches du Cheptel</h3>
        <span id="anim-count-badge" class="badge badge-green">0 fiche(s)</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-animals">
            <thead>
              <tr>
                <th>Identifiant</th>
                <th>Espèce</th>
                <th>Catégorie</th>
                <th>Race / Variété</th>
                <th>Sexe</th>
                <th style="text-align:right;">Quantité</th>
                <th>Lot / Bâtiment</th>
                <th>Poids</th>
                <th>Statut</th>
                <th style="text-align:center;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="10" style="text-align:center; padding:30px;">Chargement...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Remplir sélecteur espèces
  const spSelect = document.getElementById('filter-anim-species');
  const speciesData = await API.getSpecies(farmId);
  for (const s of speciesData.species) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.icon} ${s.name}`;
    spSelect.appendChild(opt);
  }

  // Écouteur ajouter animal
  document.getElementById('btn-add-animal').addEventListener('click', () => {
    openAnimalModal();
  });

  // Filtres
  const searchInput = document.getElementById('filter-anim-search');
  const genderSelect = document.getElementById('filter-anim-gender');
  const statusSelect = document.getElementById('filter-anim-status');

  const triggerFilter = () => {
    fetchAndRenderAnimals({
      search: searchInput.value,
      species_id: spSelect.value,
      gender: genderSelect.value,
      status: statusSelect.value
    });
  };

  searchInput.addEventListener('input', debounce(triggerFilter, 300));
  spSelect.addEventListener('change', triggerFilter);
  genderSelect.addEventListener('change', triggerFilter);
  statusSelect.addEventListener('change', triggerFilter);

  document.getElementById('btn-reset-anim-filters').addEventListener('click', () => {
    searchInput.value = '';
    spSelect.value = 'toutes';
    genderSelect.value = 'tous';
    statusSelect.value = 'actif';
    triggerFilter();
  });

  await triggerFilter();
}

async function fetchAndRenderAnimals(filters = {}) {
  const farmId = State.currentFarm.id;
  try {
    const data = await API.getAnimals(farmId, filters);
    State.animals = data.animals;

    safeSetText('anim-count-badge', `${data.animals.length} fiche(s)`);
    const tbody = document.querySelector('#table-animals tbody');
    if (!tbody) return;

    if (data.animals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px; color:var(--gray-400);">Aucun animal ou lot trouvé avec ces critères.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.animals.map(a => {
      const isOut = a.status === 'sorti';
      return `
        <tr style="${isOut ? 'opacity:0.6; background-color:#fafafa;' : ''}">
          <td><strong style="color:var(--primary-800); font-family:monospace; font-size:13px;">${escapeHtml(a.code)}</strong></td>
          <td>${a.species_icon} ${escapeHtml(a.species_name)}</td>
          <td><strong>${escapeHtml(a.category_name)}</strong></td>
          <td>${escapeHtml(a.breed || '—')}</td>
          <td><span class="badge gender-badge-${a.gender}">${a.gender === 'F' ? 'Femelle' : a.gender === 'M' ? 'Mâle' : 'Mixte'}</span></td>
          <td style="text-align:right;">
            <strong style="font-size:15px; color:${isOut ? 'var(--gray-500)' : 'var(--primary-900)'};">${a.current_quantity}</strong>
            <span style="font-size:11px; color:var(--gray-500);">/ ${a.initial_quantity}</span>
          </td>
          <td>${a.lot_name ? `🛖 ${escapeHtml(a.lot_name)}` : '—'}</td>
          <td>${a.weight ? `${a.weight} kg` : '—'}</td>
          <td>
            <span class="badge ${a.status === 'actif' ? 'badge-green' : 'badge-red'}">
              ${a.status === 'actif' ? 'Actif' : 'Sorti'}
            </span>
          </td>
          <td style="text-align:center;">
            <div style="display:flex; gap:6px; justify-content:center;">
              <button class="btn btn-secondary btn-sm btn-view-animal" data-id="${a.id}" title="Historique">👁️</button>
              ${a.status === 'actif' ? `
                <button class="btn btn-primary btn-sm btn-mov-animal" data-id="${a.id}" title="Nouveau mouvement">⚡</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Écouteurs détails animal
    document.querySelectorAll('.btn-view-animal').forEach(b => {
      b.addEventListener('click', () => {
        openAnimalDetailModal(b.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.btn-mov-animal').forEach(b => {
      b.addEventListener('click', () => {
        openMovementModal(b.getAttribute('data-id'));
      });
    });

  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// 5. VUE GESTION DES LOTS & BÂTIMENTS
// ==========================================================================
async function renderLotsView() {
  const content = document.getElementById('page-container');
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">🛖 Lots & Bâtiments de la Ferme</h2>
        <p class="page-subtitle">Organisez l'espace physique, les enclos, cages et parcs de pâturage.</p>
      </div>
      <button class="btn btn-primary" id="btn-create-lot">➕ Nouveau lot ou bâtiment</button>
    </div>

    <div class="lots-cards-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap:20px;" id="lots-container">
      <p>Chargement des lots...</p>
    </div>
  `;

  document.getElementById('btn-create-lot').addEventListener('click', () => {
    openLotModal();
  });

  try {
    const data = await API.getLots(farmId);
    State.lots = data.lots;

    const container = document.getElementById('lots-container');
    if (!data.lots || data.lots.length === 0) {
      container.innerHTML = `<div class="card card-body" style="grid-column:1/-1; text-align:center; padding:40px;"><p>Aucun lot créé. Cliquez sur « Nouveau lot ou bâtiment » pour commencer.</p></div>`;
      return;
    }

    container.innerHTML = data.lots.map(lot => {
      const current = Number(lot.current_occupancy ?? lot.current_headcount) || 0;
      const capacity = Number(lot.capacity) || 0;
      const percent = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
      const batchesCount = Number(lot.active_batches_count ?? (lot.animals ? lot.animals.length : 0)) || 0;
      const locationText = escapeHtml(lot.location || 'Non précisé');
      const isOverflow = capacity > 0 && current > capacity;

      let typeIcon = '🛖';
      const bType = (lot.building_type || '').toLowerCase();
      const bName = (lot.name || '').toLowerCase();
      if (bType.includes('canard') || bName.includes('canard') || bName.includes('oie')) typeIcon = '🦆';
      else if (bType.includes('poul') || bName.includes('poul')) typeIcon = '🐔';
      else if (bType.includes('chèvr') || bType.includes('chevr') || bName.includes('chèvr') || bName.includes('chevr')) typeIcon = '🐐';
      else if (bType.includes('berg') || bName.includes('berg') || bName.includes('mouton')) typeIcon = '🐑';
      else if (bType.includes('étab') || bType.includes('etab') || bName.includes('étab') || bName.includes('bovin')) typeIcon = '🐄';
      else if (bType.includes('enclos') || bName.includes('enclos') || bName.includes('parc')) typeIcon = '🌿';

      const animalsListHtml = (lot.animals && lot.animals.length > 0)
        ? `<div style="margin: 12px 0 10px 0; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 6px; padding: 8px 10px;">
             <div style="font-size:11px; font-weight:700; color:var(--gray-600); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">
               🐾 Lots d'animaux hébergés (${lot.animals.length})
             </div>
             <div style="display:flex; flex-direction:column; gap:6px;">
               ${lot.animals.map(a => `
                 <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid var(--gray-200); border-radius:5px; padding:6px 8px; font-size:12px;">
                   <div>
                     <strong>${escapeHtml(a.code || ('Lot #' + a.id))}</strong>
                     <span style="color:var(--gray-600); margin-left:4px;">(${a.species_icon || '🐾'} ${escapeHtml(a.category_name || a.species_name || '')})</span>
                     <span class="badge badge-green" style="font-size:10.5px; margin-left:4px; padding:2px 6px;">${a.current_quantity || 0} têtes</span>
                   </div>
                   <button class="btn btn-secondary btn-sm btn-edit-animal-lot" data-id="${a.id}" title="Modifier ce lot d'animaux" style="padding:2px 8px; font-size:11px; display:inline-flex; align-items:center; gap:3px;">
                     ✏️ Modifier
                   </button>
                 </div>
               `).join('')}
             </div>
           </div>`
        : `<div style="font-size:12px; color:var(--gray-500); font-style:italic; margin: 10px 0; padding:4px 0;">
             Aucun lot d'animaux actuellement hébergé dans ce bâtiment.
           </div>`;

      return `
        <div class="card" style="margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between; border-top: 4px solid ${isOverflow ? 'var(--danger-500)' : 'var(--primary-600)'};">
          <div>
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
              <h3 class="card-title" style="display:flex; align-items:center; gap:6px; margin:0; font-size:15px;">
                <span>${typeIcon}</span> <span>${escapeHtml(lot.name)}</span>
              </h3>
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="badge ${lot.status === 'actif' ? 'badge-green' : 'badge-gray'}">${escapeHtml(lot.status || 'actif')}</span>
                <button class="btn btn-secondary btn-sm btn-edit-lot" data-id="${lot.id}" title="Modifier le bâtiment" style="padding:3px 8px; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
                  ✏️ Modifier
                </button>
              </div>
            </div>
            <div class="card-body" style="padding-top:14px; padding-bottom:14px;">
              <p style="font-size:13px; color:var(--gray-600); margin-bottom:12px; line-height:1.5;">
                📍 Emplacement : <strong>${locationText}</strong><br>
                🐾 Espèce : <strong>${lot.species_name ? `${lot.species_icon || '🐾'} ${escapeHtml(lot.species_name)}` : 'Mixte'}</strong>
              </p>

              <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                  <span>Occupation</span>
                  <strong style="color:${isOverflow ? 'var(--danger-600)' : 'inherit'};">${current} / ${capacity > 0 ? capacity : '∞'} têtes (${percent}%)</strong>
                </div>
                <div style="height:8px; background:var(--gray-200); border-radius:4px; overflow:hidden;">
                  <div style="width:${percent}%; height:100%; background:${isOverflow ? 'var(--danger-500)' : (percent > 90 ? 'var(--accent-rose)' : 'var(--primary-600)')};"></div>
                </div>
                ${isOverflow ? `<div style="font-size:11px; color:var(--danger-600); font-weight:700; margin-top:4px;">⚠️ Surcharge : +${current - capacity} têtes au-delà de la capacité maximale !</div>` : ''}
              </div>

              ${animalsListHtml}
            </div>
          </div>

          <div class="card-footer" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--gray-100); padding:10px 16px; background:var(--gray-50); border-radius: 0 0 var(--radius-lg) var(--radius-lg);">
            <span style="font-size:12px; color:var(--gray-600); font-weight:600;">${batchesCount} lot(s) d'animaux</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary btn-sm btn-edit-lot" data-id="${lot.id}" style="display:inline-flex; align-items:center; gap:4px;">
                ✏️ Modifier
              </button>
              <button class="btn btn-secondary btn-sm btn-delete-lot" data-id="${lot.id}" style="color:var(--danger-600); display:inline-flex; align-items:center; gap:4px;">
                🗑️ Supprimer
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Écouteurs pour modification du bâtiment
    document.querySelectorAll('.btn-edit-lot').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const lotId = b.getAttribute('data-id');
        openEditBuildingModal(lotId);
      });
    });

    // Écouteurs pour modification du lot d'animaux
    document.querySelectorAll('.btn-edit-animal-lot').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const animalId = b.getAttribute('data-id');
        openEditAnimalLotModal(animalId);
      });
    });

    // Écouteurs pour suppression du bâtiment
    document.querySelectorAll('.btn-delete-lot').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const lotId = b.getAttribute('data-id');
        if (confirm('Voulez-vous vraiment supprimer ce bâtiment / lot ?')) {
          try {
            await API.deleteLot(farmId, lotId);
            showToast('Bâtiment supprimé avec succès.');
            renderLotsView();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });

  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// 6. VUE MOUVEMENTS DES ANIMAUX
// ==========================================================================
async function renderMovementsView() {
  const content = document.getElementById('page-container');
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">⚡ Mouvements du Cheptel</h2>
        <p class="page-subtitle">Enregistrement rigoureux des entrées, sorties, transferts et évolutions.</p>
      </div>
      <button class="btn btn-primary" id="btn-record-movement">➕ Enregistrer un mouvement</button>
    </div>

    <!-- GUIDE DES OPÉRATIONS -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:24px;">
      <div style="background:#fff; border:1px solid var(--gray-200); border-radius:var(--radius-md); padding:14px; border-left:4px solid #16a34a;">
        <h4 style="font-size:14px; color:#15803d; font-weight:700;">🐣 Naissance & 🛒 Achat</h4>
        <p style="font-size:12px; color:var(--gray-600); margin-top:4px;">Augmente l'effectif vivant de la ferme et crée/met à jour le lot cible.</p>
      </div>
      <div style="background:#fff; border:1px solid var(--gray-200); border-radius:var(--radius-md); padding:14px; border-left:4px solid #dc2626;">
        <h4 style="font-size:14px; color:#b91c1c; font-weight:700;">💰 Vente, ✝️ Décès & ⚠️ Perte</h4>
        <p style="font-size:12px; color:var(--gray-600); margin-top:4px;">Sortie contrôlée vérifiant le stock disponible sans jamais passer en négatif.</p>
      </div>
      <div style="background:#fff; border:1px solid var(--gray-200); border-radius:var(--radius-md); padding:14px; border-left:4px solid #f59e0b;">
        <h4 style="font-size:14px; color:#b45309; font-weight:700;">🔄 Changement de catégorie</h4>
        <p style="font-size:12px; color:var(--gray-600); margin-top:4px;">Évolution d'âge (ex: Poussin ➔ Poulette). L'effectif total reste strictement inchangé.</p>
      </div>
      <div style="background:#fff; border:1px solid var(--gray-200); border-radius:var(--radius-md); padding:14px; border-left:4px solid #7c3aed;">
        <h4 style="font-size:14px; color:#6b21a8; font-weight:700;">🔀 Transfert entre lots</h4>
        <p style="font-size:12px; color:var(--gray-600); margin-top:4px;">Déplacement physique d'un bâtiment à un autre sans altération du cheptel.</p>
      </div>
    </div>

    <!-- DERNIERS MOUVEMENTS -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Derniers Mouvements Opérés</h3>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-movements-view">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opération</th>
                <th>Espèce</th>
                <th>Catégorie</th>
                <th style="text-align:right;">Quantité</th>
                <th>Lots / Détails</th>
                <th>Prix</th>
                <th>Observations</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="8" style="text-align:center; padding:30px;">Chargement...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-record-movement').addEventListener('click', () => {
    openMovementModal();
  });

  try {
    const data = await API.getMovements(farmId);
    const tbody = document.querySelector('#table-movements-view tbody');

    if (data.movements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--gray-400);">Aucun mouvement enregistré à ce jour.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.movements.map(m => {
      const badgeClass = getMovementBadgeClass(m.type);
      const typeLabel = formatMovementType(m.type);

      let lotDetail = '—';
      if (m.type === 'transfert_lot') {
        lotDetail = `${escapeHtml(m.from_lot_name || 'Origine')} ➔ ${escapeHtml(m.to_lot_name || 'Destination')}`;
      } else if (m.type === 'changement_categorie') {
        lotDetail = `${escapeHtml(m.from_category_name || '')} ➔ ${escapeHtml(m.to_category_name || '')}`;
      } else if (m.to_lot_name) {
        lotDetail = escapeHtml(m.to_lot_name);
      } else if (m.from_lot_name) {
        lotDetail = escapeHtml(m.from_lot_name);
      }

      return `
        <tr>
          <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(m.date)}</td>
          <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
          <td>${m.species_icon} ${escapeHtml(m.species_name)}</td>
          <td><strong>${escapeHtml(m.category_name)}</strong></td>
          <td style="text-align:right; font-weight:800; font-size:15px;">${m.quantity}</td>
          <td style="font-size:12.5px;">${lotDetail}</td>
          <td style="font-size:12.5px;">${m.total_price ? `${m.total_price.toLocaleString()} ${escapeHtml(State.currentFarm.currency)}` : '—'}</td>
          <td style="font-size:12px; color:var(--gray-500);">${escapeHtml(m.observations || m.reason || '—')}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================================================
// 7. VUE HISTORIQUE & RECHERCHE
// ==========================================================================
async function renderHistoryView() {
  const content = document.getElementById('page-container');
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">📜 Historique & Traçabilité</h2>
        <p class="page-subtitle">Recherchez, filtrez et exportez le registre complet de toutes les opérations.</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-secondary" id="btn-export-csv">📥 Exporter CSV</button>
        <button class="btn btn-secondary" onclick="window.print()">🖨️ Imprimer</button>
      </div>
    </div>

    <!-- FILTRES MULTICRITÈRES -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body" style="padding:16px;">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
          <div>
            <label class="form-label" style="font-size:11px;">Recherche libre</label>
            <input type="text" id="hist-search" class="form-control" placeholder="Mot-clé, motif, code...">
          </div>
          <div>
            <label class="form-label" style="font-size:11px;">Type d'opération</label>
            <select id="hist-type" class="form-control">
              <option value="tous">Tous les types</option>
              <option value="naissance">Naissances</option>
              <option value="achat">Achats</option>
              <option value="vente">Ventes</option>
              <option value="deces">Décès</option>
              <option value="transfert_lot">Transferts de lot</option>
              <option value="changement_categorie">Changements de catégorie</option>
              <option value="perte">Pertes</option>
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px;">Espèce</label>
            <select id="hist-species" class="form-control">
              <option value="toutes">Toutes les espèces</option>
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px;">Date début</label>
            <input type="date" id="hist-date-start" class="form-control">
          </div>
          <div>
            <label class="form-label" style="font-size:11px;">Date fin</label>
            <input type="date" id="hist-date-end" class="form-control">
          </div>
        </div>
      </div>
    </div>

    <!-- TABLE DU REGISTRE -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Registre des Opérations</h3>
        <span id="hist-count" class="badge badge-gray">0 opération(s)</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-history">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Espèce</th>
                <th>Catégorie</th>
                <th style="text-align:right;">Quantité</th>
                <th>Lot concerné</th>
                <th>Montant</th>
                <th>Observations / Motif</th>
                <th>Opérateur</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="10" style="text-align:center; padding:30px;">Chargement...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Remplir sélecteur espèces
  const spSelect = document.getElementById('hist-species');
  const speciesData = await API.getSpecies(farmId);
  for (const s of speciesData.species) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.icon} ${s.name}`;
    spSelect.appendChild(opt);
  }

  const triggerHistory = async () => {
    const filters = {
      search: document.getElementById('hist-search').value,
      type: document.getElementById('hist-type').value,
      species_id: spSelect.value,
      date_start: document.getElementById('hist-date-start').value,
      date_end: document.getElementById('hist-date-end').value
    };

    try {
      safeSetText('hist-count', `${data.total} opération(s)`);
      const tbody = document.querySelector('#table-history tbody');
      if (!tbody) return;

      if (data.operations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px; color:var(--gray-400);">Aucune opération ne correspond à vos filtres.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.operations.map(m => {
        const badgeClass = getMovementBadgeClass(m.type);
        const typeLabel = formatMovementType(m.type);
        return `
          <tr>
            <td style="font-family:monospace; font-size:12px; color:var(--gray-500);">#${m.id}</td>
            <td style="font-size:12px;">${escapeHtml(m.date)}</td>
            <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
            <td>${m.species_icon} ${escapeHtml(m.species_name)}</td>
            <td><strong>${escapeHtml(m.category_name)}</strong></td>
            <td style="text-align:right; font-weight:800; font-size:14px;">${m.quantity}</td>
            <td style="font-size:12.5px;">${escapeHtml(m.to_lot_name || m.from_lot_name || '—')}</td>
            <td style="font-size:12px;">${m.total_price ? `${m.total_price.toLocaleString()} ${escapeHtml(State.currentFarm.currency)}` : '—'}</td>
            <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(m.observations || m.reason || '—')}</td>
            <td style="font-size:12px; color:var(--gray-500);">${escapeHtml(m.user_name || 'Fermier')}</td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('hist-search').addEventListener('input', debounce(triggerHistory, 300));
  document.getElementById('hist-type').addEventListener('change', triggerHistory);
  spSelect.addEventListener('change', triggerHistory);
  document.getElementById('hist-date-start').addEventListener('change', triggerHistory);
  document.getElementById('hist-date-end').addEventListener('change', triggerHistory);

  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', async () => {
    const data = await API.getHistory(farmId, { limit: 1000 });
    let csv = 'ID,Date,Type,Espece,Categorie,Quantite,Montant,Observations\n';
    for (const op of data.operations) {
      csv += `"${op.id}","${op.date}","${op.type}","${op.species_name}","${op.category_name}","${op.quantity}","${op.total_price || 0}","${(op.observations || '').replace(/"/g, '""')}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registre_ferme_${farmId}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  });

  await triggerHistory();
}

// ==========================================================================
// 8. VUE PARAMÈTRES (CATÉGORIES, SÉCURITÉ, ETC.)
// ==========================================================================
async function renderSettingsView() {
  const content = document.getElementById('page-container');
  const farmId = State.currentFarm.id;
  const farm = State.currentFarm;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div style="font-size:12px; font-weight:600; color:var(--gray-500); margin-bottom:4px; display:flex; align-items:center; gap:6px;">
          <span>⚙️ Paramètres</span>
          <span>&gt;</span>
          <span style="color:var(--primary-700); font-weight:700;">🏷️ Catégories & Configuration</span>
        </div>
        <h2 class="page-title">⚙️ Paramètres & Configuration</h2>
        <p class="page-subtitle">Configurez votre exploitation, les catégories personnalisées par espèce et vos préférences.</p>
      </div>
    </div>

    <!-- ONGLETS DE NAVIGATION SOUS-RUBRIQUES PARAMÈTRES -->
    <div class="settings-subnav">
      <button class="btn btn-secondary btn-sm" id="btn-subnav-farm-goto">
        🏡 Ma ferme (Fiche & Exploitations)
      </button>
      <button class="btn btn-primary btn-sm" id="btn-subnav-settings-active" style="cursor:default;">
        🏷️ Catégories & Configuration
      </button>
    </div>

    <!-- BANNIÈRE D'ACCÈS RAPIDE À MA FERME -->
    <div class="card" style="margin-bottom:24px; background:linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border:1.5px solid var(--primary-200);">
      <div class="card-body" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; padding:16px 20px;">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="font-size:32px; background:white; width:48px; height:48px; border-radius:var(--radius-md); display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.1);">🏡</div>
          <div>
            <h4 style="font-size:15px; font-weight:700; color:var(--primary-900); margin-bottom:2px;">
              Exploitation active : ${escapeHtml(farm ? farm.name : 'Ma ferme')}
            </h4>
            <p style="font-size:12.5px; color:var(--gray-600); margin:0;">
              Propriétaire : <strong>${escapeHtml(farm ? farm.owner_name : '')}</strong> • ${escapeHtml(farm ? farm.locality : '')}, ${escapeHtml(farm ? farm.country : '')} • Devise : <strong>${escapeHtml(farm ? farm.currency : '')}</strong>
            </p>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-quick-goto-farm">
          ⚙️ Gérer la fiche « Ma ferme »
        </button>
      </div>
    </div>

    <div class="settings-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap:20px;">
      <!-- GESTION DES CATÉGORIES -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Ajouter une Catégorie Personnalisée</h3>
        </div>
        <div class="card-body">
          <form id="form-add-category">
            <div class="form-group">
              <label class="form-label">Espèce concernée *</label>
              <select id="cat-species-select" class="form-control" required></select>
            </div>
            <div class="form-group">
              <label class="form-label">Nom de la nouvelle catégorie *</label>
              <input type="text" id="cat-name-input" class="form-control" required placeholder="Ex: Poulets de chair, Génisses...">
            </div>
            <div class="form-group">
              <label class="form-label">Sexe par défaut</label>
              <select id="cat-gender-select" class="form-control">
                <option value="MIXTE">Mixte / Indéterminé</option>
                <option value="F">Femelle</option>
                <option value="M">Mâle</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;">Ajouter la catégorie</button>
          </form>
        </div>
      </div>

      <!-- CATÉGORIES EXISTANTES -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Catégories Actives</h3>
        </div>
        <div class="card-body" style="max-height:420px; overflow-y:auto; padding:0;">
          <table class="table" id="table-all-categories">
            <thead>
              <tr>
                <th>Espèce</th>
                <th>Catégorie</th>
                <th>Sexe</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="3" style="text-align:center;">Chargement...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Remplir select espèces
  const spSelect = document.getElementById('cat-species-select');
  const speciesData = await API.getSpecies(farmId);
  for (const s of speciesData.species) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.icon} ${s.name}`;
    spSelect.appendChild(opt);
  }

  // Remplir tableau catégories
  const loadCategories = async () => {
    const catData = await API.getCategories(farmId);
    const tbody = document.querySelector('#table-all-categories tbody');
    tbody.innerHTML = catData.categories.map(c => `
      <tr>
        <td>${c.species_icon} ${escapeHtml(c.species_name)}</td>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td><span class="badge gender-badge-${c.default_gender}">${c.default_gender}</span></td>
      </tr>
    `).join('');
  };

  await loadCategories();

  // Soumission catégorie
  document.getElementById('form-add-category').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.addCategory(farmId, {
        species_id: spSelect.value,
        name: document.getElementById('cat-name-input').value,
        default_gender: document.getElementById('cat-gender-select').value
      });
      showToast('Catégorie ajoutée avec succès !');
      document.getElementById('cat-name-input').value = '';
      await loadCategories();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Écouteurs de navigation vers Ma ferme
  const btnSubnavFarm = document.getElementById('btn-subnav-farm-goto');
  if (btnSubnavFarm) {
    btnSubnavFarm.addEventListener('click', () => {
      State.setView('farm');
    });
  }

  const btnQuickFarm = document.getElementById('btn-quick-goto-farm');
  if (btnQuickFarm) {
    btnQuickFarm.addEventListener('click', () => {
      State.setView('farm');
    });
  }
}

// --------------------------------------------------------------------------
// MODALES FORMULAIRES : ANIMAL & MOUVEMENT
// --------------------------------------------------------------------------

// 1. Modale Enregistrer un animal ou un lot
async function openAnimalModal() {
  const farmId = State.currentFarm.id;
  const modal = document.getElementById('modal-animal');

  // Charger espèces actives et lots
  const [spData, lotData] = await Promise.all([
    API.getSpecies(farmId),
    API.getLots(farmId)
  ]);

  const activeSpecies = spData.species.filter(s => s.is_active);
  const spSelect = document.getElementById('animal-species-select');
  spSelect.innerHTML = activeSpecies.map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');

  const catSelect = document.getElementById('animal-category-select');
  const updateCategories = () => {
    const selectedSp = activeSpecies.find(s => s.id === spSelect.value);
    const cats = (selectedSp && Array.isArray(selectedSp.categories)) ? selectedSp.categories : [];
    if (cats.length > 0) {
      catSelect.innerHTML = cats.map(c => {
        const cName = typeof c === 'string' ? c : (c && c.name ? c.name : '');
        return `<option value="${escapeHtml(cName)}">${escapeHtml(cName)}</option>`;
      }).join('');
    } else {
      catSelect.innerHTML = `<option value="Standard">Standard</option>`;
    }
  };

  spSelect.onchange = updateCategories;
  updateCategories();

  const lotSelect = document.getElementById('animal-lot-select');
  lotSelect.innerHTML = `<option value="">-- Aucun lot assigné --</option>` +
    lotData.lots.map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)} (${escapeHtml(l.location || 'Ferme')})</option>`).join('');

  openModal('modal-animal');

  // Gestion de la soumission
  const form = document.getElementById('form-animal');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      code: document.getElementById('animal-code-input').value,
      type: document.getElementById('animal-type-select').value,
      species_id: spSelect.value,
      category_name: catSelect.value,
      breed: document.getElementById('animal-breed-input').value,
      gender: document.getElementById('animal-gender-select').value,
      birth_date: document.getElementById('animal-birth-input').value,
      purchase_date: document.getElementById('animal-purchase-date-input').value,
      initial_quantity: document.getElementById('animal-quantity-input').value,
      weight: document.getElementById('animal-weight-input').value,
      purchase_price: document.getElementById('animal-price-input').value,
      lot_id: lotSelect.value || null,
      location: document.getElementById('animal-location-input').value,
      observations: document.getElementById('animal-obs-input').value
    };

    try {
      const res = await API.createAnimal(farmId, payload);
      showToast(res.message);
      closeModal('modal-animal');
      form.reset();
      loadActiveView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

// 2. Modale Enregistrer un Mouvement (avec contrôle strict des stocks)
async function openMovementModal(preselectedAnimalId = null) {
  const farmId = State.currentFarm.id;
  const modal = document.getElementById('modal-movement');

  const [animalsData, lotsData, spData] = await Promise.all([
    API.getAnimals(farmId, { status: 'actif' }),
    API.getLots(farmId),
    API.getSpecies(farmId)
  ]);

  const activeSpecies = spData.species.filter(s => s.is_active);

  const typeSelect = document.getElementById('mov-type-select');
  const animalSelect = document.getElementById('mov-animal-select');
  const targetLotSelect = document.getElementById('mov-target-lot-select');
  const targetCatSelect = document.getElementById('mov-target-cat-select');
  const stockPreview = document.getElementById('mov-stock-preview');
  const qtyInput = document.getElementById('mov-qty-input');

  // Remplir la liste des animaux actifs
  animalSelect.innerHTML = `<option value="">-- Sélectionner l'animal ou le lot concerné --</option>` +
    animalsData.animals.map(a => `<option value="${a.id}" data-qty="${a.current_quantity}" data-species="${a.species_id}" data-cat="${escapeHtml(a.category_name)}">
      ${a.species_icon} ${escapeHtml(a.code)} — ${escapeHtml(a.category_name)} (Dispo: ${a.current_quantity})
    </option>`).join('');

  if (preselectedAnimalId) {
    animalSelect.value = preselectedAnimalId;
  }

  // Remplir les lots
  targetLotSelect.innerHTML = `<option value="">-- Sélectionner le lot récepteur --</option>` +
    lotsData.lots.map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');

  // Adaptation dynamique du formulaire selon le type
  const updateFormUI = () => {
    const type = typeSelect.value;
    const isExit = (type === 'vente' || type === 'deces' || type === 'perte');
    const isTransfer = (type === 'transfert_lot');
    const isCategoryChange = (type === 'changement_categorie');
    const isEntry = (type === 'naissance' || type === 'achat');

    document.getElementById('mov-group-animal').style.display = isEntry ? 'none' : 'block';
    document.getElementById('mov-group-entry-species').style.display = isEntry ? 'block' : 'none';
    document.getElementById('mov-group-target-lot').style.display = (isTransfer || isEntry) ? 'block' : 'none';
    document.getElementById('mov-group-target-cat').style.display = isCategoryChange ? 'block' : 'none';
    document.getElementById('mov-group-price').style.display = (type === 'vente' || type === 'achat') ? 'block' : 'none';
    document.getElementById('mov-group-reason').style.display = (type === 'deces' || type === 'perte') ? 'block' : 'none';

    // Remplir espèces d'entrée si nécessaire
    if (isEntry) {
      const entrySpSelect = document.getElementById('mov-entry-species');
      entrySpSelect.innerHTML = activeSpecies.map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');
      const updateEntryCats = () => {
        const found = activeSpecies.find(s => s.id === entrySpSelect.value);
        const entryCatSelect = document.getElementById('mov-entry-cat');
        const cats = (found && Array.isArray(found.categories)) ? found.categories : [];
        if (entryCatSelect) {
          if (cats.length > 0) {
            entryCatSelect.innerHTML = cats.map(c => {
              const cName = typeof c === 'string' ? c : (c && c.name ? c.name : '');
              return `<option value="${escapeHtml(cName)}">${escapeHtml(cName)}</option>`;
            }).join('');
          } else {
            entryCatSelect.innerHTML = `<option value="Standard">Standard</option>`;
          }
        }
      };
      entrySpSelect.onchange = updateEntryCats;
      updateEntryCats();
    }

    // Si changement de catégorie, remplir les catégories cibles
    if (isCategoryChange && animalSelect.value) {
      const opt = animalSelect.selectedOptions[0];
      const spId = opt.getAttribute('data-species');
      const curCat = opt.getAttribute('data-cat') || '';
      const found = (spData && Array.isArray(spData.species)) ? spData.species.find(s => s.id === spId) : null;
      const cats = (found && Array.isArray(found.categories)) ? found.categories : [];
      if (targetCatSelect) {
        targetCatSelect.innerHTML = cats
          .map(c => typeof c === 'string' ? c : (c && c.name ? c.name : ''))
          .filter(cName => cName && cName.toLowerCase() !== curCat.toLowerCase())
          .map(cName => `<option value="${escapeHtml(cName)}">${escapeHtml(cName)}</option>`).join('');
      }
    }

    validateStockLive();
  };

  const validateStockLive = () => {
    const type = typeSelect.value;
    const isExitOrMove = (type === 'vente' || type === 'deces' || type === 'perte' || type === 'transfert_lot' || type === 'changement_categorie');

    if (isExitOrMove && animalSelect.value) {
      const opt = animalSelect.selectedOptions[0];
      const avail = parseInt(opt.getAttribute('data-qty'), 10) || 0;
      const requested = parseInt(qtyInput.value, 10) || 0;

      if (requested > avail) {
        stockPreview.innerHTML = `⚠️ <strong style="color:var(--accent-rose);">Stock insuffisant !</strong> Disponible : ${avail}, Demandé : ${requested}. Le système bloquera cette opération.`;
      } else {
        stockPreview.innerHTML = `✅ Stock disponible : <strong>${avail}</strong>. Reste après opération : <strong>${avail - requested}</strong>.`;
      }
    } else {
      stockPreview.innerHTML = '';
    }
  };

  typeSelect.onchange = updateFormUI;
  animalSelect.onchange = updateFormUI;
  qtyInput.oninput = validateStockLive;

  updateFormUI();
  openModal('modal-movement');

  const form = document.getElementById('form-movement');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const type = typeSelect.value;
    const isEntry = (type === 'naissance' || type === 'achat');

    const payload = {
      type,
      date: document.getElementById('mov-date-input').value,
      quantity: qtyInput.value,
      animal_id: animalSelect.value || null,
      species_id: isEntry ? document.getElementById('mov-entry-species').value : null,
      category_name: isEntry ? document.getElementById('mov-entry-cat').value : null,
      to_lot_id: targetLotSelect.value || null,
      to_category_name: targetCatSelect.value || null,
      total_price: document.getElementById('mov-price-input').value || null,
      reason: document.getElementById('mov-reason-input').value || null,
      observations: document.getElementById('mov-obs-input').value || null
    };

    try {
      const res = await API.createMovement(farmId, payload);
      showToast(res.message);
      closeModal('modal-movement');
      form.reset();
      loadActiveView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

// 3. Modale Détail Animal
async function openAnimalDetailModal(animalId) {
  const farmId = State.currentFarm.id;
  try {
    const data = await API.getAnimal(farmId, animalId);
    const a = data.animal;

    safeSetText('detail-code', a.code);
    safeSetText('detail-species', `${a.species_icon} ${a.species_name}`);
    safeSetText('detail-category', a.category_name);
    safeSetText('detail-breed', a.breed || 'Non précisée');
    safeSetText('detail-gender', a.gender === 'F' ? 'Femelle' : a.gender === 'M' ? 'Mâle' : 'Mixte');
    safeSetText('detail-qty', `${a.current_quantity} (Initial: ${a.initial_quantity})`);
    safeSetText('detail-lot', a.lot_name ? `🛖 ${a.lot_name}` : 'Aucun');
    safeSetText('detail-weight', a.weight ? `${a.weight} kg` : '—');
    safeSetText('detail-obs', a.observations || 'Aucune observation.');

    const tbody = document.querySelector('#table-animal-movements tbody');
    if (data.movements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Aucun mouvement tracé.</td></tr>`;
    } else {
      tbody.innerHTML = data.movements.map(m => `
        <tr>
          <td>${m.date}</td>
          <td><span class="badge ${getMovementBadgeClass(m.type)}">${formatMovementType(m.type)}</span></td>
          <td style="text-align:right; font-weight:700;">${m.quantity}</td>
          <td style="font-size:12px;">${escapeHtml(m.observations || m.reason || '—')}</td>
        </tr>
      `).join('');
    }

    openModal('modal-animal-detail');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 4. Modale Créer Lot
function openLotModal() {
  const modal = document.getElementById('modal-lot');
  const farmId = State.currentFarm.id;

  const spSelect = document.getElementById('lot-species-select');
  spSelect.innerHTML = `<option value="">Mixte (Toutes espèces)</option>` +
    State.species.map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');

  openModal('modal-lot');

  const form = document.getElementById('form-lot');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('lot-name-input').value,
      species_id: spSelect.value || null,
      location: document.getElementById('lot-location-input').value,
      capacity: document.getElementById('lot-capacity-input').value,
      notes: document.getElementById('lot-notes-input').value
    };

    try {
      await API.createLot(farmId, payload);
      showToast('Lot créé avec succès !');
      closeModal('modal-lot');
      form.reset();
      renderLotsView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

// 5. Modale Modifier Bâtiment / Installation
async function openEditBuildingModal(buildingId) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  try {
    const res = await API.getLots(farmId);
    const building = (res.lots || []).find(l => l.id === Number(buildingId));
    if (!building) {
      showToast('Installation introuvable', 'error');
      return;
    }

    document.getElementById('edit-building-id').value = building.id;
    document.getElementById('edit-building-name').value = building.name || '';
    document.getElementById('edit-building-type').value = building.building_type || 'autre';
    document.getElementById('edit-building-status').value = building.status || 'actif';
    document.getElementById('edit-building-capacity').value = building.capacity !== undefined ? building.capacity : '';
    document.getElementById('edit-building-location').value = building.location || '';
    document.getElementById('edit-building-notes').value = building.notes || '';

    // Espèces autorisées (filtrées selon les espèces de la ferme active + mixte)
    const spSelect = document.getElementById('edit-building-species');
    const spData = await API.getSpecies(farmId);
    const activeSpecies = (spData.species || []).filter(s => s.is_active);

    spSelect.innerHTML = `<option value="">🛖 Mixte (Toutes espèces)</option>` +
      activeSpecies.map(s => `<option value="${s.id}" ${building.species_id === s.id ? 'selected' : ''}>${s.icon || '🐾'} ${escapeHtml(s.name)}</option>`).join('');

    if (building.species_id) {
      spSelect.value = building.species_id;
    } else {
      spSelect.value = '';
    }

    openModal('modal-edit-building');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.openEditBuildingModal = openEditBuildingModal;

// 6. Modale Modifier Lot d'animaux
async function openEditAnimalLotModal(animalId) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  try {
    const res = await API.getAnimal(farmId, animalId);
    const animal = res.animal;
    if (!animal) {
      showToast('Lot d\'animaux introuvable', 'error');
      return;
    }

    document.getElementById('edit-animal-lot-id').value = animal.id;
    document.getElementById('edit-animal-lot-code').value = animal.code || '';
    document.getElementById('edit-animal-lot-status').value = animal.status || 'actif';
    document.getElementById('edit-animal-lot-birth-date').value = animal.birth_date || '';
    document.getElementById('edit-animal-lot-initial-qty').value = animal.initial_quantity || animal.current_quantity || 1;
    document.getElementById('edit-animal-lot-current-qty').value = animal.current_quantity !== undefined ? animal.current_quantity : 1;
    document.getElementById('edit-animal-lot-notes').value = animal.observations || '';

    // Bâtiments de la ferme
    const lotsRes = await API.getLots(farmId);
    const bldgSelect = document.getElementById('edit-animal-lot-building-select');
    bldgSelect.innerHTML = `<option value="">-- Aucun bâtiment assigné --</option>` +
      (lotsRes.lots || []).map(b => `<option value="${b.id}" ${animal.lot_id === b.id ? 'selected' : ''}>🛖 ${escapeHtml(b.name)} (${escapeHtml(b.location || 'Ferme')})</option>`).join('');

    // Espèces de la ferme
    const spData = await API.getSpecies(farmId);
    const activeSpecies = (spData.species || []).filter(s => s.is_active);
    const spSelect = document.getElementById('edit-animal-lot-species');
    spSelect.innerHTML = activeSpecies.map(s => `<option value="${s.id}" ${animal.species_id === s.id ? 'selected' : ''}>${s.icon || '🐾'} ${escapeHtml(s.name)}</option>`).join('');

    // Si l'espèce actuelle n'est pas dans les actives, l'ajouter quand même
    if (animal.species_id && !activeSpecies.some(s => s.id === animal.species_id)) {
      const opt = document.createElement('option');
      opt.value = animal.species_id;
      opt.textContent = `${animal.species_icon || '🐾'} ${animal.species_name || animal.species_id}`;
      opt.selected = true;
      spSelect.appendChild(opt);
    }
    spSelect.value = animal.species_id;

    // Catégories dynamiques selon l'espèce
    async function updateCategoriesDropdown(selectedSpecies, selectedCategory) {
      const catSelect = document.getElementById('edit-animal-lot-category');
      try {
        const catRes = await API.getCategories(farmId, selectedSpecies);
        const cats = catRes.categories || [];
        if (cats.length > 0) {
          catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === selectedCategory ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
        } else {
          catSelect.innerHTML = `<option value="Standard">Standard</option>`;
        }
        if (selectedCategory && !cats.some(c => c.name === selectedCategory)) {
          const opt = document.createElement('option');
          opt.value = selectedCategory;
          opt.textContent = selectedCategory;
          opt.selected = true;
          catSelect.appendChild(opt);
        }
        if (selectedCategory) catSelect.value = selectedCategory;
      } catch (e) {
        console.warn('Erreur chargement catégories:', e);
      }
    }

    await updateCategoriesDropdown(animal.species_id, animal.category_name);

    spSelect.onchange = async () => {
      await updateCategoriesDropdown(spSelect.value, null);
    };

    openModal('modal-edit-animal-lot');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.openEditAnimalLotModal = openEditAnimalLotModal;

function setupBuildingAndAnimalLotHandlers() {
  const formBuilding = document.getElementById('form-edit-building');
  if (formBuilding) {
    formBuilding.onsubmit = async (e) => {
      e.preventDefault();
      if (!State.currentFarm) return;
      const farmId = State.currentFarm.id;
      const bldgId = document.getElementById('edit-building-id').value;
      const payload = {
        name: document.getElementById('edit-building-name').value.trim(),
        building_type: document.getElementById('edit-building-type').value,
        status: document.getElementById('edit-building-status').value,
        species_id: document.getElementById('edit-building-species').value || null,
        capacity: document.getElementById('edit-building-capacity').value ? parseInt(document.getElementById('edit-building-capacity').value, 10) : 0,
        location: document.getElementById('edit-building-location').value.trim() || null,
        notes: document.getElementById('edit-building-notes').value.trim() || null
      };

      try {
        await API.updateBuilding(farmId, bldgId, payload);
        showToast('Installation mise à jour avec succès.');
        closeModal('modal-edit-building');
        if (State.currentView === 'buildings' && typeof loadBuildingsData === 'function') {
          await loadBuildingsData();
        } else {
          await renderLotsView();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  const formAnimalLot = document.getElementById('form-edit-animal-lot');
  if (formAnimalLot) {
    formAnimalLot.onsubmit = async (e) => {
      e.preventDefault();
      if (!State.currentFarm) return;
      const farmId = State.currentFarm.id;
      const animalId = document.getElementById('edit-animal-lot-id').value;
      const payload = {
        code: document.getElementById('edit-animal-lot-code').value.trim(),
        status: document.getElementById('edit-animal-lot-status').value,
        species_id: document.getElementById('edit-animal-lot-species').value,
        category_name: document.getElementById('edit-animal-lot-category').value,
        birth_date: document.getElementById('edit-animal-lot-birth-date').value || null,
        initial_quantity: parseInt(document.getElementById('edit-animal-lot-initial-qty').value, 10) || 0,
        current_quantity: parseInt(document.getElementById('edit-animal-lot-current-qty').value, 10) || 0,
        lot_id: document.getElementById('edit-animal-lot-building-select').value ? Number(document.getElementById('edit-animal-lot-building-select').value) : null,
        observations: document.getElementById('edit-animal-lot-notes').value.trim() || null,
        notes: document.getElementById('edit-animal-lot-notes').value.trim() || null
      };

      try {
        await API.updateAnimalLot(farmId, animalId, payload);
        showToast('Lot d\'animaux mis à jour avec succès.');
        closeModal('modal-edit-animal-lot');
        if (State.currentView === 'buildings' && typeof loadBuildingsData === 'function') {
          await loadBuildingsData();
        } else if (State.currentView === 'animals' && typeof renderAnimalsView === 'function') {
          await renderAnimalsView();
        } else {
          await renderLotsView();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }
}

// --------------------------------------------------------------------------
// AUTHENTIFICATION & CRÉATION DE FERME
// --------------------------------------------------------------------------
function setupAuthForms() {
  // Bascule Onglets Connexion / Inscription
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = 'block';
    formRegister.style.display = 'none';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formLogin.style.display = 'none';
    formRegister.style.display = 'block';
  });

  // Soumission Connexion
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-password').value;

    try {
      const res = await API.login(email, pwd);
      API.setToken(res.token);
      State.user = res.user;
      State.farms = res.farms;

      showToast(`Bienvenue, ${res.user.name} !`);
      if (res.farms.length === 0) {
        renderAppShell();
        openModal('modal-create-farm', true);
      } else {
        State.currentFarm = res.farms[0];
        API.setCurrentFarmId(res.farms[0].id);
        renderAppShell();
        loadActiveView();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Soumission Inscription
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const pwd = document.getElementById('register-password').value;

    try {
      const res = await API.register(name, email, pwd);
      if (res.token) {
        API.setToken(res.token);
        State.user = res.user;
        State.farms = [];

        showToast('Votre compte a été créé avec succès.');
        renderAppShell();
        // Ouvre immédiatement la création de la première ferme
        openModal('modal-create-farm', true);
      } else {
        // Cas où la confirmation par e-mail est requise par le projet Supabase
        showToast('Compte créé ! Veuillez vérifier votre boîte e-mail pour confirmer votre inscription, puis connectez-vous.', 'info');
        tabLogin.click();
        const loginEmail = document.getElementById('login-email');
        if (loginEmail) loginEmail.value = email;
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Bouton Démo rapide
  const btnDemo = document.getElementById('btn-demo-quick-login');
  if (btnDemo) {
    btnDemo.addEventListener('click', async () => {
      try {
        const seedRes = await API.seedDemo();
        const loginRes = await API.login(seedRes.credentials.email, seedRes.credentials.password);
        API.setToken(loginRes.token);
        State.user = loginRes.user;
        State.farms = loginRes.farms;
        State.currentFarm = loginRes.farms[0];
        API.setCurrentFarmId(loginRes.farms[0].id);

        showToast('Connecté à la ferme démo avec succès !');
        renderAppShell();
        loadActiveView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Mot de passe oublié
  document.getElementById('link-forgot-password').addEventListener('click', (e) => {
    e.preventDefault();
    openModal('modal-forgot-password');
  });

  document.getElementById('form-forgot-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    try {
      const res = await API.forgotPassword(email);
      showToast(res.message);
      if (res.simulated_code) {
        document.getElementById('reset-code-input').value = res.simulated_code;
        document.getElementById('reset-email-input').value = email;
        document.getElementById('forgot-step-1').style.display = 'none';
        document.getElementById('forgot-step-2').style.display = 'block';
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('form-reset-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email-input').value;
    const code = document.getElementById('reset-code-input').value;
    const newPwd = document.getElementById('reset-new-password').value;

    try {
      const res = await API.resetPassword(email, code, newPwd);
      showToast(res.message);
      closeModal('modal-forgot-password');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Formulaire création de ferme
const formCreateFarm = document.getElementById('form-create-farm');
if (formCreateFarm) {
  formCreateFarm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('new-farm-name').value,
      owner_name: document.getElementById('new-farm-owner').value,
      country: document.getElementById('new-farm-country').value,
      locality: document.getElementById('new-farm-locality').value,
      farm_type: document.getElementById('new-farm-type').value,
      currency: document.getElementById('new-farm-currency').value,
      start_date: document.getElementById('new-farm-date').value
    };

    try {
      const res = await API.createFarm(payload);
      showToast(res.message);
      closeModal('modal-create-farm');
      formCreateFarm.reset();

      // Recharger la liste des fermes
      const farmsRes = await API.getFarms();
      State.farms = farmsRes.farms;
      State.currentFarm = res.farm;
      API.setCurrentFarmId(res.farm.id);

      renderAppShell();
      loadActiveView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Formulaire espèce personnalisée
const formCustomSpecies = document.getElementById('form-custom-species');
if (formCustomSpecies) {
  formCustomSpecies.addEventListener('submit', async (e) => {
    e.preventDefault();
    const farmId = State.currentFarm.id;
    const name = document.getElementById('custom-sp-name').value;
    const icon = document.getElementById('custom-sp-icon').value;
    const desc = document.getElementById('custom-sp-desc').value;
    const catsRaw = document.getElementById('custom-sp-cats').value;

    const initialCategories = catsRaw.split(',').map(c => c.trim()).filter(Boolean).map(c => ({
      name: c,
      gender: 'MIXTE'
    }));

    try {
      const res = await API.addCustomSpecies(farmId, {
        name,
        icon,
        description: desc,
        initial_categories: initialCategories
      });
      showToast(res.message);
      closeModal('modal-custom-species');
      formCustomSpecies.reset();
      renderSpeciesView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// --------------------------------------------------------------------------
// UTILITAIRES DE FORMATAGE
// --------------------------------------------------------------------------
function formatMovementType(type) {
  switch (type) {
    case 'naissance': return '🐣 Naissance';
    case 'achat': return '🛒 Achat';
    case 'vente': return '💰 Vente';
    case 'deces': return '✝️ Décès';
    case 'transfert_lot': return '🔀 Transfert';
    case 'changement_categorie': return '🔄 Changement catégorie';
    case 'perte': return '⚠️ Perte';
    default: return type;
  }
}

function getMovementBadgeClass(type) {
  switch (type) {
    case 'naissance':
    case 'achat':
      return 'badge-green';
    case 'vente':
      return 'badge-blue';
    case 'deces':
    case 'perte':
      return 'badge-red';
    case 'transfert_lot':
      return 'badge-purple';
    case 'changement_categorie':
      return 'badge-amber';
    default:
      return 'badge-gray';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================================================
// MODULE SUIVI DE CROISSANCE, ALERTES & SEXAGE DES VOLAILLES (POUSSINS & CANETONS)
// ============================================================================
window.ducklingFilterSpecies = window.ducklingFilterSpecies || 'toutes';
window.ducklingFilterStatus = window.ducklingFilterStatus || 'tous';
window.ducklingSearch = window.ducklingSearch || '';

async function renderDucklingTrackingSection(farmId) {
  const container = document.getElementById('duckling-tracking-section');
  if (!container || !farmId) return;

  try {
    const alertsData = await API.getYoungPoultryAlerts(farmId, {
      species_id: window.ducklingFilterSpecies,
      status: window.ducklingFilterStatus,
      search: window.ducklingSearch
    });

    const summary = alertsData.summary || {};
    const lots = alertsData.lots || [];

    // Mettre à jour les indicateurs / pills
    const totalYoung = summary.total_active_young !== undefined ? summary.total_active_young : (summary.total_ducklings || 0);
    safeSetText('duckling-kpi-total-alive', `${totalYoung.toLocaleString()} tête(s)`);
    safeSetText('duckling-kpi-overdue', `${(summary.overdue_lots || 0)} lot(s)`);
    safeSetText('duckling-kpi-today', `${(summary.today_lots || 0)} lot(s)`);
    safeSetText('duckling-kpi-upcoming', `${(summary.upcoming_lots || 0)} lot(s)`);
    safeSetText('duckling-kpi-growing', `${(summary.growing_lots || 0)} lot(s)`);

    safeSetText('duckling-filter-count', `${lots.length} lot(s) affiché(s)`);

    // Remplir tableau des lots de volailles
    const tbody = document.querySelector('#table-ducklings-lots tbody');
    if (tbody) {
      if (lots.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--gray-500);">Aucun lot de volailles correspondant au filtre sélectionné.</td></tr>`;
      } else {
        tbody.innerHTML = lots.map(lot => {
          let badgeHtml = '';
          if (lot.alert_status === 'en_retard') {
            badgeHtml = `<span class="badge badge-red" style="font-weight:700;">🚨 En retard (+${lot.days_diff} j)</span>`;
          } else if (lot.alert_status === 'aujourdhui') {
            badgeHtml = `<span class="badge" style="background:#ea580c; color:white; font-weight:700;">⏰ Aujourd'hui (${lot.maturity_weeks} sem.)</span>`;
          } else if (lot.alert_status === 'a_venir') {
            badgeHtml = `<span class="badge badge-amber" style="font-weight:700;">📅 Dans ${lot.days_diff} j</span>`;
          } else if (lot.alert_status === 'croissance') {
            badgeHtml = `<span class="badge badge-green">🌱 En croissance (J-${lot.days_diff})</span>`;
          } else {
            badgeHtml = `<span class="badge badge-gray">✅ Sexé & Transféré</span>`;
          }

          const isChick = lot.species_id === 'poules';
          const actionBtnText = isChick ? '🐥 Identifier les mâles et femelles' : '🦆 Identifier les sexes';

          const actionBtn = (lot.current_quantity > 0)
            ? `<button class="btn btn-primary btn-sm" onclick="openDucklingSexingModal(${lot.id})" style="font-size:12px; font-weight:700;">${actionBtnText}</button>`
            : `<span class="badge badge-gray" style="font-size:11px;">100% Transféré</span>`;

          const breedText = lot.breed ? `<span style="font-size:12px; color:var(--gray-500); display:block;">${escapeHtml(lot.breed)}</span>` : '';
          const spIcon = lot.icon || (isChick ? '🐥' : '🦆');
          const spName = isChick ? 'Poussins' : 'Canetons';

          return `
            <tr style="${lot.alert_status === 'en_retard' ? 'background:rgba(239, 68, 68, 0.04);' : (lot.alert_status === 'aujourdhui' ? 'background:rgba(234, 88, 12, 0.04);' : '')}">
              <td>
                <strong style="color:var(--gray-900); font-size:13.5px;">${escapeHtml(lot.name)}</strong>
                ${breedText}
              </td>
              <td><span class="badge badge-gray">${spIcon} ${spName}</span></td>
              <td>${escapeHtml(lot.birth_date)}</td>
              <td><strong>${lot.age_weeks} sem</strong> ${lot.age_days_remainder} j <span style="font-size:11px; color:var(--gray-500);">(${lot.age_days} j)</span></td>
              <td>
                <strong>${escapeHtml(lot.maturity_date)}</strong>
                <span style="font-size:11px; display:block; color:${lot.days_diff <= 0 ? 'var(--danger-600)' : 'var(--gray-500)'};">
                  ${lot.days_diff < 0 ? `Dépassé de ${Math.abs(lot.days_diff)} j` : (lot.days_diff === 0 ? "Atteint aujourd'hui" : `Dans ${lot.days_diff} j`)}
                </span>
              </td>
              <td style="text-align:right;">
                <span class="badge badge-blue" style="font-size:13px; font-weight:700;">${(lot.current_quantity || 0).toLocaleString()}</span>
                <span style="font-size:11px; color:var(--gray-500); display:block;">sur ${(lot.initial_quantity || 0).toLocaleString()}</span>
              </td>
              <td>${badgeHtml}</td>
              <td style="text-align:center;">${actionBtn}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Remplir l'historique des classifications
    const historyData = await API.getYoungPoultryClassificationHistory(farmId, { species_id: window.ducklingFilterSpecies });
    const histTbody = document.querySelector('#table-duckling-history tbody');
    safeSetText('duckling-history-count', `${(historyData.total || 0)} opération(s)`);

    if (histTbody) {
      if (!historyData.history || historyData.history.length === 0) {
        histTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:16px; color:var(--gray-400);">Aucune opération de sexage enregistrée pour cette ferme.</td></tr>`;
      } else {
        histTbody.innerHTML = historyData.history.map(h => {
          const spIcon = h.species_id === 'poules' ? '🐥' : '🦆';
          return `
            <tr>
              <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(h.date)}</td>
              <td><strong>${spIcon} ${escapeHtml(h.lot_name)}</strong></td>
              <td style="text-align:right; font-weight:600;">${h.initial_quantity}</td>
              <td style="text-align:right;"><span class="badge badge-green">+${h.males}</span></td>
              <td style="text-align:right;"><span class="badge badge-green">+${h.females}</span></td>
              <td style="text-align:right;"><span class="badge ${h.unknown > 0 ? 'badge-amber' : 'badge-gray'}">${h.unknown}</span></td>
              <td>
                <span class="badge ${h.is_complete ? 'badge-blue' : 'badge-amber'}">
                  ${h.is_complete ? '✅ Clôturé (100%)' : '⏳ Partiel'}
                </span>
              </td>
              <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(h.notes || '-')}</td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.error('Erreur chargement suivi volailles:', err);
  }
}
window.renderDucklingTrackingSection = renderDucklingTrackingSection;
window.renderYoungPoultryTrackingSection = renderDucklingTrackingSection;

// Modale de sexage et transfert des volailles (Poussins & Canetons)
async function openDucklingSexingModal(animalId) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  try {
    const alertsData = await API.getYoungPoultryAlerts(farmId);
    const targetLot = (alertsData.lots || []).find(l => l.id === Number(animalId));

    if (!targetLot) {
      showToast('Lot de volailles introuvable.', 'error');
      return;
    }

    const isChick = targetLot.species_id === 'poules';

    // Remplir les titres et labels selon l'espèce
    safeSetText('duckling-sexing-title', isChick ? '🐥 Sexage & Transfert des Poussins (8 semaines)' : '🦆 Sexage & Transfert des Canetons (12 semaines)');
    safeSetText('duckling-sex-lot-name', `${targetLot.icon || (isChick ? '🐥' : '🦆')} ${targetLot.name}`);
    safeSetText('duckling-sex-birth-date', targetLot.birth_date);
    safeSetText('duckling-sex-age', `${targetLot.age_weeks} semaines et ${targetLot.age_days_remainder} jour(s) (${targetLot.age_days} j)`);
    safeSetText('duckling-sex-maturity-prefix', isChick ? '⏰ Échéance 8 semaines (56 j) : ' : '⏰ Échéance 12 semaines (84 j) : ');
    safeSetText('duckling-sex-maturity-date', targetLot.maturity_date);
    safeSetText('duckling-sex-current-qty', `${targetLot.current_quantity} ${targetLot.label_young || (isChick ? 'poussin(s)' : 'caneton(s)')}`);

    // Labels de ventilation
    safeSetText('duckling-sex-males-label', isChick ? '🐥 Coqs (Mâles)' : '🦆 Canards Mâles');
    safeSetText('duckling-sex-males-sub', isChick ? 'Transférés en coqs' : 'Transférés en mâles');

    safeSetText('duckling-sex-females-label', isChick ? '🐥 Poules (Femelles)' : '🦆 Canes (Femelles)');
    safeSetText('duckling-sex-females-sub', isChick ? 'Transférées en poules' : 'Transférées en canes');

    safeSetText('duckling-sex-unknown-label', '❓ Non identifiés');
    safeSetText('duckling-sex-unknown-sub', isChick ? 'Restent en poussins' : 'Restent en canetons');

    const badgeContainer = document.getElementById('duckling-sex-status-badge');
    if (badgeContainer) {
      if (targetLot.alert_status === 'en_retard') {
        badgeContainer.innerHTML = `<span class="badge badge-red" style="font-weight:700;">🚨 En retard (+${targetLot.days_diff} j)</span>`;
      } else if (targetLot.alert_status === 'aujourdhui') {
        badgeContainer.innerHTML = `<span class="badge" style="background:#ea580c; color:white; font-weight:700;">⏰ Échéance aujourd'hui</span>`;
      } else if (targetLot.alert_status === 'a_venir') {
        badgeContainer.innerHTML = `<span class="badge badge-amber" style="font-weight:700;">📅 À venir (${targetLot.days_diff} j)</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="badge badge-green">🌱 En croissance</span>`;
      }
    }

    // Hidden inputs
    const elId = document.getElementById('duckling-sex-animal-id');
    if (elId) elId.value = targetLot.id;

    const elExpected = document.getElementById('duckling-sex-expected-total');
    if (elExpected) elExpected.value = targetLot.current_quantity;

    const elSpecies = document.getElementById('duckling-sex-species-id');
    if (elSpecies) elSpecies.value = targetLot.species_id;

    // Date par défaut aujourd'hui
    const elDate = document.getElementById('duckling-sex-date');
    if (elDate) elDate.value = new Date().toISOString().split('T')[0];

    // Reset inputs
    const elMales = document.getElementById('duckling-sex-males');
    const elFemales = document.getElementById('duckling-sex-females');
    const elUnknown = document.getElementById('duckling-sex-unknown');
    const elNotes = document.getElementById('duckling-sex-notes');

    if (elMales) elMales.value = 0;
    if (elFemales) elFemales.value = 0;
    if (elUnknown) elUnknown.value = 0;
    if (elNotes) elNotes.value = '';

    // Charger les bâtiments de destination disponibles
    const bldgSelect = document.getElementById('duckling-sex-building-select');
    if (bldgSelect) {
      bldgSelect.innerHTML = `<option value="">Conserver l'installation d'origine</option>`;
      const bldgsData = await API.getBuildings(farmId);
      (bldgsData.buildings || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.name} (Capacité : ${b.capacity || 'illimitée'})`;
        bldgSelect.appendChild(opt);
      });
    }

    // Mettre à jour l'équation de contrôle
    updateDucklingSexingEquation();

    openModal('modal-duckling-sexing');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.openDucklingSexingModal = openDucklingSexingModal;
window.openPoultrySexingModal = openDucklingSexingModal;
window.openChickSexingModal = openDucklingSexingModal;

// Équation dynamique de contrôle du sexage
function updateDucklingSexingEquation() {
  const elExpected = document.getElementById('duckling-sex-expected-total');
  const expected = elExpected ? (parseInt(elExpected.value, 10) || 0) : 0;
  const speciesId = document.getElementById('duckling-sex-species-id')?.value || 'canards';
  const isChick = speciesId === 'poules';
  const youngLabel = isChick ? 'poussin(s)' : 'caneton(s)';
  const maleLabel = isChick ? 'coq(s)' : 'canard(s) mâle(s)';
  const femaleLabel = isChick ? 'poule(s)' : 'cane(s)';

  const males = parseInt(document.getElementById('duckling-sex-males')?.value, 10) || 0;
  const females = parseInt(document.getElementById('duckling-sex-females')?.value, 10) || 0;
  const unknown = parseInt(document.getElementById('duckling-sex-unknown')?.value, 10) || 0;

  const sum = males + females + unknown;
  const diff = expected - sum;

  safeSetText('duckling-sex-equation-sum', sum.toString());
  safeSetText('duckling-sex-equation-target', expected.toString());

  const statusEl = document.getElementById('duckling-sex-equation-status');
  const detailEl = document.getElementById('duckling-sex-equation-detail');
  const boxEl = document.getElementById('duckling-sex-equation-box');
  const submitBtn = document.getElementById('btn-submit-duckling-sexing');

  if (sum === expected) {
    if (boxEl) {
      boxEl.style.borderColor = '#86efac';
      boxEl.style.background = '#f0fdf4';
    }
    if (statusEl) {
      statusEl.textContent = '✅ Équation équilibrée';
      statusEl.style.color = '#15803d';
    }
    if (detailEl) {
      detailEl.textContent = `Ventilation exacte : ${males} ${maleLabel} + ${females} ${femaleLabel} + ${unknown} non identifié(s) = ${expected} ${youngLabel}. Effectif total de la ferme conservé à 100%.`;
      detailEl.style.color = '#166534';
    }
    if (submitBtn) submitBtn.disabled = false;
  } else {
    if (boxEl) {
      boxEl.style.borderColor = '#fca5a5';
      boxEl.style.background = '#fef2f2';
    }
    if (statusEl) {
      statusEl.textContent = diff > 0 ? `⚠️ Manque ${diff} animal(aux)` : `⚠️ Excédent de ${Math.abs(diff)} animal(aux)`;
      statusEl.style.color = '#b91c1c';
    }
    if (detailEl) {
      detailEl.textContent = `La somme (Mâles + Femelles + Non identifiés = ${sum}) doit être strictement égale à l'effectif actuel (${expected}).`;
      detailEl.style.color = '#991b1b';
    }
    if (submitBtn) submitBtn.disabled = true;
  }
}

// Modale de création rapide d'un lot de volailles
async function openCreateYoungPoultryLotModal(defaultSpecies = 'poules') {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  const form = document.getElementById('form-duckling-lot');
  if (form) form.reset();

  const spSelect = document.getElementById('duckling-lot-species-select');
  if (spSelect) {
    spSelect.value = defaultSpecies;
  }

  const birthInput = document.getElementById('duckling-lot-birth-date');
  const today = new Date().toISOString().split('T')[0];
  if (birthInput) {
    birthInput.value = today;
  }

  updateDucklingLotModalTexts(defaultSpecies);
  updateDucklingLotMaturityPreview(today);

  // Charger les bâtiments
  const bldgSelect = document.getElementById('duckling-lot-building-select');
  if (bldgSelect) {
    bldgSelect.innerHTML = `<option value="">Aucun bâtiment assigné</option>`;
    try {
      const bldgsData = await API.getBuildings(farmId);
      (bldgsData.buildings || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.name} (Capacité : ${b.capacity || 'illimitée'})`;
        bldgSelect.appendChild(opt);
      });
    } catch (e) {}
  }

  openModal('modal-duckling-lot');
}

function updateDucklingLotModalTexts(speciesId) {
  const isChick = speciesId === 'poules';
  safeSetText('duckling-lot-modal-title', isChick ? '🐥 Enregistrer un Nouveau Lot de Poussins' : '🦆 Enregistrer un Nouveau Lot de Canetons');
  safeSetText('duckling-lot-birth-label', isChick ? 'Date de naissance des poussins *' : 'Date de naissance des canetons *');
  safeSetText('duckling-lot-maturity-title', isChick ? "Date d'alerte des 8 semaines (56 jours) :" : "Date d'alerte des 12 semaines (84 jours) :");
  safeSetText('duckling-lot-maturity-formula', isChick
    ? "Formule automatique : Date de naissance + 56 jours. L'alerte sera déclenchée à cette date exacte."
    : "Formule automatique : Date de naissance + 84 jours. L'alerte sera déclenchée à cette date exacte.");
  safeSetText('duckling-lot-quantity-label', isChick ? 'Nombre initial de poussins *' : 'Nombre initial de canetons *');

  const nameInput = document.getElementById('duckling-lot-name');
  if (nameInput && !nameInput.value) {
    nameInput.placeholder = isChick ? 'ex: Lot Poussins Éclosion Mars 2026' : 'ex: Lot Canetons Printemps 2026';
  }
  const breedInput = document.getElementById('duckling-lot-breed');
  if (breedInput && !breedInput.value) {
    breedInput.placeholder = isChick ? 'ex: Goliath, Sasso, Cou nu...' : 'ex: Barbarie, Pékin, Mulard...';
  }
}

function updateDucklingLotMaturityPreview(birthDateStr) {
  const previewEl = document.getElementById('duckling-lot-maturity-preview');
  if (!previewEl) return;

  if (!birthDateStr) {
    previewEl.textContent = "Saisissez une date de naissance pour calculer l'alerte";
    return;
  }

  const speciesId = document.getElementById('duckling-lot-species-select')?.value || 'poules';
  const maturityDays = speciesId === 'canards' ? 84 : 56;
  const maturityDateStr = API.addDaysToDate(birthDateStr, maturityDays);
  const diffDays = API.getDaysDiff(new Date().toISOString().split('T')[0], maturityDateStr);

  let timingText = '';
  if (diffDays > 0) timingText = `(dans ${diffDays} jours)`;
  else if (diffDays === 0) timingText = `(AUJOURD'HUI !)`;
  else timingText = `(dépassé de ${Math.abs(diffDays)} jours)`;

  previewEl.innerHTML = `<strong>${maturityDateStr}</strong> <span style="font-weight:normal; font-size:12.5px;">${timingText}</span>`;
}

function openCreateDucklingLotModal() {
  return openCreateYoungPoultryLotModal('canards');
}
window.openCreateDucklingLotModal = openCreateDucklingLotModal;

function openCreateChickLotModal() {
  return openCreateYoungPoultryLotModal('poules');
}
window.openCreateChickLotModal = openCreateChickLotModal;

// Enregistrement des écouteurs du module volailles
function setupDucklingHandlers() {
  // Changement d'espèce dans le formulaire de création
  const speciesSelect = document.getElementById('duckling-lot-species-select');
  if (speciesSelect) {
    speciesSelect.addEventListener('change', (e) => {
      updateDucklingLotModalTexts(e.target.value);
      updateDucklingLotMaturityPreview(document.getElementById('duckling-lot-birth-date')?.value);
    });
  }

  // Calculateur temps réel dans modal création
  const birthInput = document.getElementById('duckling-lot-birth-date');
  if (birthInput) {
    birthInput.addEventListener('input', (e) => {
      updateDucklingLotMaturityPreview(e.target.value);
    });
    birthInput.addEventListener('change', (e) => {
      updateDucklingLotMaturityPreview(e.target.value);
    });
  }

  // Équation en temps réel dans modal sexage
  document.querySelectorAll('.duckling-sex-input').forEach(input => {
    input.addEventListener('input', updateDucklingSexingEquation);
    input.addEventListener('change', updateDucklingSexingEquation);
  });

  // Soumission formulaire sexage
  const formSexing = document.getElementById('form-duckling-sexing');
  if (formSexing) {
    formSexing.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!State.currentFarm) return;
      const farmId = State.currentFarm.id;

      const animalId = parseInt(document.getElementById('duckling-sex-animal-id').value, 10);
      const expected = parseInt(document.getElementById('duckling-sex-expected-total').value, 10) || 0;
      const speciesId = document.getElementById('duckling-sex-species-id')?.value || 'canards';
      const males = parseInt(document.getElementById('duckling-sex-males').value, 10) || 0;
      const females = parseInt(document.getElementById('duckling-sex-females').value, 10) || 0;
      const unknown = parseInt(document.getElementById('duckling-sex-unknown').value, 10) || 0;
      const opDate = document.getElementById('duckling-sex-date').value || new Date().toISOString().split('T')[0];
      const buildingId = document.getElementById('duckling-sex-building-select').value || null;
      const notes = document.getElementById('duckling-sex-notes').value || '';

      const sum = males + females + unknown;
      if (sum !== expected) {
        showToast(`La somme (${sum}) ne correspond pas à l'effectif actuel (${expected}). Veuillez corriger.`, 'error');
        return;
      }

      try {
        const res = await API.classifyPoultry(farmId, animalId, {
          date: opDate,
          males,
          females,
          unknown,
          target_building_id: buildingId,
          notes
        });

        const isChick = speciesId === 'poules';
        const maleTxt = isChick ? 'coqs' : 'canards mâles';
        const femaleTxt = isChick ? 'poules' : 'canes';
        const youngTxt = isChick ? 'poussin(s)' : 'caneton(s)';

        showToast(`Sexage enregistré : +${males} ${maleTxt}, +${females} ${femaleTxt}. ${unknown > 0 ? `${unknown} ${youngTxt} restant(s).` : 'Lot clôturé avec succès !'}`);
        closeModal('modal-duckling-sexing');

        // Actualiser vue
        if (State.activeView === 'dashboard') {
          await refreshDashboardData();
        } else {
          loadActiveView();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Soumission formulaire création lot
  const formLot = document.getElementById('form-duckling-lot');
  if (formLot) {
    formLot.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!State.currentFarm) return;
      const farmId = State.currentFarm.id;

      const speciesId = document.getElementById('duckling-lot-species-select')?.value || 'poules';
      const name = document.getElementById('duckling-lot-name').value.trim();
      const birthDate = document.getElementById('duckling-lot-birth-date').value;
      const qty = parseInt(document.getElementById('duckling-lot-quantity').value, 10) || 1;
      const breed = document.getElementById('duckling-lot-breed').value.trim();
      const buildingId = document.getElementById('duckling-lot-building-select').value || null;
      const notes = document.getElementById('duckling-lot-notes').value.trim();

      if (!name || !birthDate || qty <= 0) {
        showToast('Veuillez remplir tous les champs obligatoires.', 'error');
        return;
      }

      try {
        const res = await API.createYoungPoultryLot(farmId, speciesId, {
          name,
          birth_date: birthDate,
          initial_quantity: qty,
          breed,
          building_id: buildingId,
          notes
        });

        const rule = API.getYoungPoultryRule(speciesId);
        showToast(`Lot « ${name} » créé (${qty} ${rule.label_young}). Échéance ${rule.maturity_weeks} sem. : ${res.animal.maturity_date}`);
        closeModal('modal-duckling-lot');

        // Actualiser vue
        if (State.activeView === 'dashboard') {
          await refreshDashboardData();
        } else {
          loadActiveView();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

// --------------------------------------------------------------------------
// GESTION SUPABASE (MODALE, STATUT, SYNCHRONISATION)
// --------------------------------------------------------------------------
function updateSupabaseStatusUI(status) {
  // Masquage strict de l'indicateur technique pour les utilisateurs finaux
  const btn = document.getElementById('btn-supabase-status');
  if (btn) {
    btn.style.display = 'none';
  }

  const dot = document.getElementById('supabase-status-dot');
  const label = document.getElementById('supabase-status-label');
  const banner = document.getElementById('supabase-status-banner');
  const bannerTitle = document.getElementById('supabase-banner-title');
  const bannerDesc = document.getElementById('supabase-banner-desc');

  if (dot) {
    if (status === 'connected') {
      dot.style.backgroundColor = '#16a34a'; // Vert
    } else if (status === 'error') {
      dot.style.backgroundColor = '#dc2626'; // Rouge
    } else {
      dot.style.backgroundColor = '#eab308'; // Jaune / orange
    }
  }

  if (label) {
    if (status === 'connected') {
      label.textContent = 'Supabase (En ligne)';
    } else if (status === 'error') {
      label.textContent = 'Supabase (Erreur)';
    } else {
      label.textContent = 'Supabase (Local)';
    }
  }

  if (banner && bannerTitle && bannerDesc) {
    if (status === 'connected') {
      banner.style.background = '#f0fdf4';
      banner.style.borderColor = '#bbf7d0';
      bannerTitle.textContent = 'Connecté à Supabase (PostgreSQL)';
      bannerTitle.style.color = '#166534';
      bannerDesc.textContent = 'La base de données cloud Supabase est active et sert de source de vérité unique pour votre exploitation.';
      bannerDesc.style.color = '#15803d';
    } else if (status === 'error') {
      banner.style.background = '#fef2f2';
      banner.style.borderColor = '#fecaca';
      bannerTitle.textContent = 'Erreur de connexion Supabase';
      bannerTitle.style.color = '#991b1b';
      bannerDesc.textContent = 'Impossible de joindre la base Supabase. Vérifiez vos clés et votre connexion.';
      bannerDesc.style.color = '#b91c1c';
    } else {
      banner.style.background = '#fefce8';
      banner.style.borderColor = '#fef08a';
      bannerTitle.textContent = 'Mode local autonome (Supabase non configuré)';
      bannerTitle.style.color = '#854d0e';
      bannerDesc.textContent = 'Renseignez SUPABASE_URL et SUPABASE_ANON_KEY ci-dessous ou dans le fichier .env pour activer la centralisation cloud.';
      bannerDesc.style.color = '#a16207';
    }
  }
}

function setupSupabaseHandlers() {
  const btnStatus = document.getElementById('btn-supabase-status');
  const modal = document.getElementById('modal-supabase-config');
  const form = document.getElementById('form-supabase-config');
  const btnTest = document.getElementById('btn-test-supabase');
  const btnClear = document.getElementById('btn-clear-supabase');
  const btnSync = document.getElementById('btn-sync-to-supabase');
  const inputUrl = document.getElementById('cfg-supabase-url');
  const inputKey = document.getElementById('cfg-supabase-anon-key');
  const syncResult = document.getElementById('supabase-sync-result');

  if (btnStatus) {
    btnStatus.addEventListener('click', () => {
      if (window.SupabaseClientManager) {
        const cfg = SupabaseClientManager.getConfig();
        if (inputUrl) inputUrl.value = cfg.url || '';
        if (inputKey) inputKey.value = cfg.anonKey || '';
        updateSupabaseStatusUI(SupabaseClientManager.getStatus());
      }
      openModal('modal-supabase-config');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = inputUrl ? inputUrl.value.trim() : '';
      const anonKey = inputKey ? inputKey.value.trim() : '';

      if (!url || !anonKey) {
        showToast('Veuillez renseigner à la fois l\'URL et la clé anonyme.', 'error');
        return;
      }

      if (window.SupabaseClientManager) {
        try {
          await SupabaseClientManager.setConfig(url, anonKey);
          updateSupabaseStatusUI(SupabaseClientManager.getStatus());
          showToast('Configuration Supabase enregistrée avec succès.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  }

  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      if (!window.SupabaseClientManager) return;
      btnTest.disabled = true;
      btnTest.textContent = '⏳ Test en cours...';

      const url = inputUrl ? inputUrl.value.trim() : '';
      const anonKey = inputKey ? inputKey.value.trim() : '';

      try {
        const res = await SupabaseClientManager.testConnection(url || undefined, anonKey || undefined);
        if (res.success) {
          showToast('Connexion à Supabase réussie !');
        } else {
          showToast('Échec du test : ' + (res.error || 'Erreur inconnue'), 'error');
        }
      } catch (err) {
        showToast('Erreur : ' + err.message, 'error');
      } finally {
        btnTest.disabled = false;
        btnTest.textContent = '🔌 Tester la connexion';
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      if (!window.SupabaseClientManager) return;
      if (confirm('Voulez-vous réinitialiser les clés Supabase enregistrées dans le navigateur ?')) {
        await SupabaseClientManager.clearConfig();
        if (inputUrl) inputUrl.value = '';
        if (inputKey) inputKey.value = '';
        updateSupabaseStatusUI(SupabaseClientManager.getStatus());
        showToast('Configuration Supabase réinitialisée.', 'info');
      }
    });
  }

  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      if (!State.currentFarm) {
        showToast('Veuillez d\'abord sélectionner une ferme à synchroniser.', 'error');
        return;
      }
      if (!window.API || !API.isSupabaseConnected()) {
        showToast('Supabase n\'est pas connecté. Veuillez enregistrer des clés valides d\'abord.', 'error');
        return;
      }

      btnSync.disabled = true;
      btnSync.textContent = '⏳ Migration en cours...';
      if (syncResult) {
        syncResult.innerHTML = '<span style="color:#2563eb;">Transfert des données vers Supabase en cours...</span>';
      }

      try {
        const res = await API.syncLocalToSupabase(State.currentFarm.id);
        if (res && res.counts) {
          const c = res.counts;
          const msg = `Migration terminée : ${c.species || 0} espèces, ${c.lots || 0} lots, ${c.animals || 0} animaux, ${c.incubations || 0} incubations, ${c.custom_alerts || 0} alertes, ${c.financial_records || 0} finances.`;
          showToast(msg);
          if (syncResult) {
            syncResult.innerHTML = `<span style="color:#166534;">✅ ${escapeHtml(msg)}</span>`;
          }
        } else {
          showToast('Synchronisation réussie.');
          if (syncResult) {
            syncResult.innerHTML = '<span style="color:#166534;">✅ Données synchronisées avec succès.</span>';
          }
        }
      } catch (err) {
        showToast('Erreur migration : ' + err.message, 'error');
        if (syncResult) {
          syncResult.innerHTML = `<span style="color:#dc2626;">❌ ${escapeHtml(err.message)}</span>`;
        }
      } finally {
        btnSync.disabled = false;
        btnSync.textContent = '🚀 Migrer les données locales vers Supabase';
      }
    });
  }
}

window.updateSupabaseStatusUI = updateSupabaseStatusUI;
window.setupSupabaseHandlers = setupSupabaseHandlers;
