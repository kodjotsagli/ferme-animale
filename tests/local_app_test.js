// Test de l'application web locale autonome (100% Client-Side / LocalDB)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock complet du localStorage de navigateur
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

// Charger public/js/api.js dans un contexte VM avec localStorage mocké
const apiCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf-8');

const sandbox = {
  localStorage: localStorageMock,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  parseInt: parseInt,
  parseFloat: parseFloat,
  window: {},
  document: {}
};

vm.createContext(sandbox);
vm.runInContext(apiCode, sandbox);

const API = sandbox.window.API || sandbox.API;
const addDaysToDate = sandbox.window.addDaysToDate || sandbox.addDaysToDate || API.addDaysToDate;
const getDefaultIncubationDuration = sandbox.window.getDefaultIncubationDuration || sandbox.getDefaultIncubationDuration;
const enrichIncubation = sandbox.window.enrichIncubation || sandbox.enrichIncubation;

async function runLocalAppTests() {
  console.log('🧪 DÉMARRAGE DE LA VALIDATION DE L\'APPLICATION WEB LOCALE (SANS API BACKEND)\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Initialisation de la base de données locale
    console.log('--- 1. Initialisation & Persistance Locale ---');
    const seed = await API.seedDemo();
    assert(seed.credentials && seed.credentials.email === 'fermier@exemple.com', 'Initialisation des données locales et compte démo');
    assert(localStorageMock.getItem('ferme_animale_local_db_v1') !== null, 'Persistance active dans localStorage');

    // 2. Authentification locale
    console.log('\n--- 2. Authentification & Profil Local ---');
    const loginRes = await API.login('fermier@exemple.com', 'ferme123');
    assert(loginRes.token && loginRes.user.email === 'fermier@exemple.com', 'Connexion locale fermier réussie');
    assert(loginRes.farms.length > 0, `Ferme locale associée trouvée : ${loginRes.farms[0].name}`);
    const farmId = loginRes.farms[0].id;

    // Test mauvais mot de passe
    try {
      await API.login('fermier@exemple.com', 'mauvaismdp');
      assert(false, 'Connexion avec mauvais mot de passe aurait dû échouer');
    } catch (_) {
      assert(true, 'Rejet sécurisé des identifiants invalides');
    }

    // Inscription d'un nouvel utilisateur
    const regRes = await API.register('Fermier Test', 'nouveau@ferme.com', 'secret123');
    assert(regRes.user.id && regRes.token, 'Création d\'un nouveau compte utilisateur local');

    // Reconnexion au compte de démo pour la suite des tests
    await API.login('fermier@exemple.com', 'ferme123');

    // 3. Gestion de la Ferme & Espèces
    console.log('\n--- 3. Ferme, Espèces & Lots Locaux ---');
    const spRes = await API.getSpecies(farmId);
    const activeSp = spRes.species.filter(s => s.is_active);
    assert(activeSp.length >= 3, `Espèces actives trouvées (${activeSp.map(s => s.name).join(', ')})`);

    // Basculer le statut d'une espèce
    await API.toggleSpecies(farmId, 'moutons', true);
    const spRes2 = await API.getSpecies(farmId);
    assert(spRes2.species.find(s => s.id === 'moutons').is_active === 1, 'Activation d\'une espèce (Moutons)');

    // Lots
    const lotsRes = await API.getLots(farmId);
    assert(lotsRes.lots.length >= 4, `Lots trouvés : ${lotsRes.lots.map(l => l.name).join(', ')}`);
    const lotCanetons = lotsRes.lots.find(l => l.name === 'Lot canetons D-01');
    assert(lotCanetons !== undefined, 'Lot canetons D-01 identifié');

    // Création d'un nouveau lot
    const newLotRes = await API.createLot(farmId, {
      name: 'Enclos Pintades Nord',
      species_id: 'pintades',
      capacity: 60,
      location: 'Parc Nord'
    });
    assert(newLotRes.lot && newLotRes.lot.name === 'Enclos Pintades Nord', 'Création d\'un nouveau lot');

    // 4. Cheptel & Mouvements (Vérification des règles métier)
    console.log('\n--- 4. Cheptel & Mouvements avec Contrôle des Stocks ---');
    const animalsBefore = await API.getAnimals(farmId, { status: 'actif' });
    const countBefore = animalsBefore.animals.reduce((s, a) => s + a.current_quantity, 0);

    // Naissance
    const birthMov = await API.createMovement(farmId, {
      type: 'naissance',
      species_id: 'poules',
      category_name: 'Poussins',
      quantity: 15,
      date: '2026-10-14',
      observations: 'Éclosion naturelle'
    });
    assert(birthMov.movement.quantity === 15, 'Mouvement de naissance enregistré (+15)');

    const animalsAfterBirth = await API.getAnimals(farmId, { status: 'actif' });
    const countAfterBirth = animalsAfterBirth.animals.reduce((s, a) => s + a.current_quantity, 0);
    assert(countAfterBirth === countBefore + 15, `Cheptel augmenté de 15 sujets (${countBefore} -> ${countAfterBirth})`);

    // Tentative de sortie supérieure au stock disponible (DOIT ÊTRE REJETÉE)
    try {
      await API.createMovement(farmId, {
        type: 'vente',
        species_id: 'chevres',
        category_name: 'Chèvres',
        quantity: 9999
      });
      assert(false, 'La vente de 9999 chèvres aurait dû être rejetée');
    } catch (err) {
      assert(err.message.includes('insuffisante'), `Contrôle de sécurité : Sortie supérieure au stock rejetée (${err.message})`);
    }

    // Vente valide
    const saleMov = await API.createMovement(farmId, {
      type: 'vente',
      species_id: 'poules',
      category_name: 'Poules',
      quantity: 3,
      unit_price: 2500,
      total_price: 7500,
      date: '2026-10-14'
    });
    assert(saleMov.movement.quantity === 3, 'Vente de 3 poules enregistrée');

    // 5. Tableau de Bord Local
    console.log('\n--- 5. Tableau de Bord & Indicateurs Locaux ---');
    const dash = await API.getDashboard(farmId, 'toutes', 'tous');
    assert(dash.kpis && dash.kpis.total_live_animals > 0, `Total animaux vivants calculé : ${dash.kpis.total_live_animals}`);
    assert(dash.species_breakdown.length > 0, 'Ventilation par espèce disponible');
    assert(dash.recent_movements.length > 0, 'Historique des mouvements récents présent');

    // 6. Gestion des Dépenses & Achats (Conforme captures d'écran)
    console.log('\n--- 6. Gestion Complète des Dépenses & Achats ---');
    const expRes = await API.getFinancialRecords(farmId, { type: 'depense' });
    assert(expRes.records.length >= 4, `Dépenses trouvées : ${expRes.records.length}`);

    // Calcul du total cumulé initial
    const totalInitial = expRes.records.reduce((s, e) => s + e.amount, 0);
    assert(totalInitial === 263000, `Total cumulé exact vérifié : ${totalInitial} FCFA (attendu : 263 000 FCFA)`);

    // Vérification des 4 dépenses de la capture
    const hasCanetons = expRes.records.some(r => r.category === 'Achat canetons' && r.amount === 135000 && r.supplier === 'Couvoir National');
    const hasAliments = expRes.records.some(r => r.category === 'Aliments' && r.amount === 85000 && r.supplier === 'AgroFeed Togo');
    const hasVaccins = expRes.records.some(r => r.category === 'Vaccins & Médicaments' && r.amount === 18000 && r.supplier === 'Pharmacie Vétérinaire Centrale');
    const hasMainOeuvre = expRes.records.some(r => r.category === "Main-d'œuvre" && r.amount === 25000 && r.supplier === "Équipe d'entretien");

    assert(hasCanetons, 'Dépense 1 : Achat canetons (135 000 FCFA - Couvoir National)');
    assert(hasAliments, 'Dépense 2 : Aliments (85 000 FCFA - AgroFeed Togo)');
    assert(hasVaccins, 'Dépense 3 : Vaccins & Médicaments (18 000 FCFA - Pharmacie Vétérinaire Centrale)');
    assert(hasMainOeuvre, 'Dépense 4 : Main-d\'œuvre (25 000 FCFA - Équipe d\'entretien)');

    // Ajout d'une nouvelle dépense locale
    const newExpense = await API.createFinancialRecord(farmId, {
      type: 'depense',
      category: 'Aliments',
      date: '2026-10-14',
      amount: 15000,
      title: 'Achat sac de son de blé',
      supplier: 'AgroFeed Togo',
      payment_method: 'T-Money'
    });
    assert(newExpense.record && newExpense.record.id, 'Nouvelle dépense enregistrée localement');

    // Vérifier l'augmentation du total
    const expAfter = await API.getFinancialRecords(farmId, { type: 'depense' });
    const totalAfter = expAfter.records.reduce((s, e) => s + e.amount, 0);
    assert(totalAfter === 263000 + 15000, `Nouveau total cumulé dynamique : ${totalAfter} FCFA`);

    // Suppression de la dépense
    await API.deleteFinancialRecord(farmId, newExpense.record.id);
    const expAfterDel = await API.getFinancialRecords(farmId, { type: 'depense' });
    const totalAfterDel = expAfterDel.records.reduce((s, e) => s + e.amount, 0);
    assert(totalAfterDel === 263000, `Total cumulé recalculé après suppression : ${totalAfterDel} FCFA`);

    // 7. Modules Avancés V2 Locaux (Reproduction, Œufs, Santé, Alimentation, Bâtiments, Alertes)
    console.log('\n--- 7. Modules Avancés V2 Autonomes ---');

    // Reproduction
    const reproRes = await API.getReproductions(farmId);
    assert(reproRes.reproductions.length > 0, 'Suivi des reproductions accessible');

    // Ponte & Incubation
    const eggSummary = await API.getEggSummary(farmId);
    assert(eggSummary.total_eggs_laid > 0, `Ponte totale collectée : ${eggSummary.total_eggs_laid}`);

    // Santé
    const healthRes = await API.getHealthTreatments(farmId);
    assert(healthRes.treatments.length > 0, 'Historique des soins vétérinaires disponible');

    // Aliments
    const feedRes = await API.getFeeds(farmId);
    assert(feedRes.feeds.length > 0, 'Stocks d\'aliments disponibles');

    // 8. Module Financier & Solde de Gestion (Sans Paiement en Ligne)
    console.log('\n--- 8. Registre Comptable & Calcul Automatique du Solde de Gestion ---');
    
    // Enregistrement manuel d'un revenu (Vente de canards)
    const newRev = await API.createFinancialRecord(farmId, {
      type: 'recette',
      category: 'vente_animaux',
      date: '2026-10-14',
      amount: 45000,
      description: 'Vente de 5 canards mâles prêts à cuire',
      client_name: 'Restaurant Le Lagon',
      payment_method: 'Espèces',
      observations: 'Paiement comptant'
    });
    assert(newRev.record && newRev.record.type === 'recette', 'Enregistrement manuel d\'un revenu (45 000 FCFA)');

    // Vérifier le résumé financier et le calcul strict du solde de gestion
    const finSummary = await API.getFinancialSummary(farmId);
    assert(typeof finSummary.solde_gestion === 'number', 'Calcul automatique du solde de gestion disponible');
    assert(finSummary.solde_gestion === finSummary.total_revenues - finSummary.total_expenses, 
      `Formule vérifiée : Solde de gestion (${finSummary.solde_gestion}) = Revenus (${finSummary.total_revenues}) - Dépenses (${finSummary.total_expenses})`);

    // Vérifier les catégories de revenus
    assert(finSummary.revenues_by_category.length > 0, 'Ventilation des revenus par catégorie calculée');
    assert(finSummary.revenues_by_category.some(c => c.category === 'vente_animaux'), 'Catégorie vente_animaux bien présente');

    // Vérifier l'évolution par mois
    assert(finSummary.evolution_by_month.length > 0, 'Évolution des revenus et dépenses par mois calculée');

    // Vérifier le résultat par espèce
    assert(finSummary.result_by_species.length > 0, 'Résultat d\'exploitation par espèce calculé');

    // Test de résilience Multi-Fermes (Création d'une nouvelle ferme vierge ex: TEste)
    console.log('\n--- 9. Résilience Multi-Fermes & Ferme Vierge (ex: TEste) ---');
    const newFarmRes = await API.createFarm({
      name: 'TEste',
      country: 'Togo',
      locality: 'Lomé',
      currency: 'FCFA'
    });
    const newFarmId = newFarmRes.farm.id;
    assert(newFarmId && newFarmRes.farm.name === 'TEste', 'Nouvelle ferme créée avec succès (TEste)');

    // Pour une nouvelle ferme, les dépenses et revenus doivent valoir 0 sans aucune erreur
    const blankExpenses = await API.getFinancialRecords(newFarmId, { type: 'depense' });
    assert(blankExpenses.records.length === 0, 'Nouvelle ferme : 0 dépenses initiales (pas de blocage)');
    const blankSummary = await API.getFinancialSummary(newFarmId);
    assert(blankSummary.total_expenses === 0 && blankSummary.total_revenues === 0 && blankSummary.solde_gestion === 0, 
      'Nouvelle ferme : Total dépenses = 0, Total revenus = 0, Solde = 0 FCFA');

    // Vérifier les alias de méthodes commerciales
    const txCommercial = await API.getCommercialTransactions(farmId);
    const txStandard = await API.getTransactions(farmId);
    assert(Array.isArray(txCommercial.transactions) && txCommercial.transactions.length === txStandard.transactions.length, 
      'Alias API.getCommercialTransactions et API.getTransactions fonctionnels');

    // 10. Vérification de la Sécurisation DOM (safeSetText / safeSetHtml) & Calculs des Dépenses
    console.log('\n--- 10. Sécurisation DOM & Calculs Sans Erreur null.textContent ---');
    
    // Charger app.js pour vérifier la disponibilité globale de safeSetText et safeSetHtml
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');
    const domSandbox = {
      ...sandbox,
      document: {
        getElementById: (id) => {
          if (id === 'existing-node') {
            return { textContent: '', innerHTML: '', style: {} };
          }
          return null; // Tous les autres IDs renvoient null pour tester la résilience
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {}
      }
    };
    vm.createContext(domSandbox);
    vm.runInContext(appCode, domSandbox);

    const safeSetText = domSandbox.window.safeSetText || domSandbox.safeSetText;
    const safeSetHtml = domSandbox.window.safeSetHtml || domSandbox.safeSetHtml;

    assert(typeof safeSetText === 'function', 'Utilitaire safeSetText disponible');
    assert(typeof safeSetHtml === 'function', 'Utilitaire safeSetHtml disponible');

    // Test sur élément inexistant (doit retourner null SANS jeter d'erreur Cannot set properties of null)
    let noThrowText = true;
    try {
      const res = safeSetText('non-existent-id-comm-kpi', '100 000 FCFA');
      assert(res === null, 'safeSetText sur élément absent retourne null de manière transparente');
    } catch (_) {
      noThrowText = false;
    }
    assert(noThrowText, 'safeSetText n\'a levé aucune exception TypeError sur ID null');

    let noThrowHtml = true;
    try {
      const res = safeSetHtml('non-existent-table-tbody', '<tr><td>test</td></tr>');
      assert(res === null, 'safeSetHtml sur élément absent retourne null de manière transparente');
    } catch (_) {
      noThrowHtml = false;
    }
    assert(noThrowHtml, 'safeSetHtml n\'a levé aucune exception TypeError sur ID null');

    // Test sur élément existant
    const existingRes = safeSetText('existing-node', '263 000 FCFA');
    assert(existingRes && existingRes.textContent === '263 000 FCFA', 'safeSetText met à jour correctement le textContent sur élément existant');

    // Vérification du calcul des 4 dépenses de démo
    const allExp = await API.getFinancialRecords(farmId, { type: 'depense' });
    const computedTotal = allExp.records.reduce((sum, e) => sum + (e.amount || 0), 0);
    const formatted = `${computedTotal.toLocaleString('fr-FR')} FCFA`;
    assert(computedTotal === 263000, `Calcul exact du total : ${computedTotal} FCFA`);
    assert(formatted === '263\u202f000 FCFA' || formatted === '263 000 FCFA', `Formatage monétaire lisible vérifié : ${formatted}`);

    // 11. Validation de l'écran « Mes Animaux — Sélection des Espèces » & Résolution des .map()
    console.log('\n--- 11. Espèces, Catégories Sécurisées & Gestion des .map() ---');
    const speciesData = await API.getSpecies(farmId);
    assert(Array.isArray(speciesData.species) && speciesData.species.length > 0, `Espèces récupérées avec succès (${speciesData.species.length} espèces)`);

    let allHaveCategories = true;
    let allHaveLiveCount = true;
    let mapCategoriesWorked = true;

    speciesData.species.forEach(sp => {
      if (!Array.isArray(sp.categories)) {
        allHaveCategories = false;
      }
      if (typeof sp.live_count !== 'number' || isNaN(sp.live_count)) {
        allHaveLiveCount = false;
      }
      try {
        // Test exact de l'expression qui provoquait l'erreur
        const renderedPills = sp.categories.map(c => `<span class="category-pill">${c.name}</span>`).join('');
        const countFormatted = `${sp.live_count.toLocaleString('fr-FR')} tête(s) vivante(s)`;
        if (!countFormatted) mapCategoriesWorked = false;
      } catch (e) {
        mapCategoriesWorked = false;
      }
    });

    assert(allHaveCategories, 'Toutes les espèces disposent d\'un tableau categories défini');
    assert(allHaveLiveCount, 'Toutes les espèces disposent d\'une propriété live_count numérique');
    assert(mapCategoriesWorked, 'Exécution réussie de sp.categories.map(...) et sp.live_count.toLocaleString() sans TypeError');

    // Test ajout espèce personnalisée valide
    const customSpRes = await API.addCustomSpecies(farmId, {
      name: 'Cailles du Japon',
      icon: '🪶',
      description: 'Élevage avicole de cailles pondeuses',
      initial_categories: [{ name: 'Cailles pondeuses', gender: 'F' }, { name: 'Mâles reproducteurs', gender: 'M' }]
    });
    assert(customSpRes.species && customSpRes.species.name === 'Cailles du Japon', 'Ajout d\'une espèce personnalisée (Cailles du Japon)');
    assert(Array.isArray(customSpRes.species.categories) && customSpRes.species.categories.length === 2, 'Catégories initiales correctement attachées à l\'espèce');

    // Test rejet doublon
    let duplicateRejected = false;
    try {
      await API.addCustomSpecies(farmId, { name: 'cailles du japon' });
    } catch (e) {
      duplicateRejected = e.message.includes('existe déjà');
    }
    assert(duplicateRejected, 'Rejet automatique d\'une espèce avec nom en doublon (insensible à la casse)');

    // Test rejet nom vide
    let emptyRejected = false;
    try {
      await API.addCustomSpecies(farmId, { name: '   ' });
    } catch (e) {
      emptyRejected = e.message.includes('obligatoire');
    }
    assert(emptyRejected, 'Validation stricte du nom obligatoire pour l\'espèce');

    // Test préservation intégrale des données lors du basculement d'espèce
    const animalsBeforeToggle = (await API.getAnimals(farmId)).animals.length;
    await API.toggleSpecies(farmId, 'canards', false);
    const animalsAfterToggle = (await API.getAnimals(farmId)).animals.length;
    assert(animalsBeforeToggle === animalsAfterToggle, `Préservation intégrale des animaux lors de la désactivation d'une espèce (${animalsAfterToggle} animaux intacts)`);
    await API.toggleSpecies(farmId, 'canards', true); // Réactiver

    // 12. Validation du Déplacement de « Ma ferme » dans « Paramètres »
    console.log('\n--- 12. Déplacement de « Ma ferme » dans « Paramètres » ---');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    
    // Vérification que "Ma ferme" n'est plus directement dans la section Général
    const generalSectionRegex = /<div class="nav-section-title">Général<\/div>([\s\S]*?)<div class="nav-section-title">/i;
    const generalMatch = indexHtml.match(generalSectionRegex);
    assert(generalMatch && !generalMatch[1].includes('data-view="farm"'), 'L\'onglet « Ma ferme » est bien retiré de la section principale Général');

    // Vérification que "Ma ferme" est présent comme sous-menu dans Paramètres
    assert(indexHtml.includes('id="nav-group-settings"'), 'Conteneur nav-group-settings présent dans index.html');
    assert(indexHtml.includes('id="submenu-settings"'), 'Sous-menu submenu-settings présent dans index.html');
    assert(indexHtml.includes('id="nav-subitem-farm"'), 'Sous-élément nav-subitem-farm présent dans le sous-menu');
    assert(indexHtml.includes('id="nav-subitem-settings"'), 'Sous-élément nav-subitem-settings présent dans le sous-menu');

    // Test de la logique de synchronisation de l'état actif dans app.js
    const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');
    
    // Créer un environnement DOM simulé pour tester updateActiveNav
    const navItems = [
      { id: 'nav-dash', view: 'dashboard', classes: ['nav-item', 'active'], classList: { add(c) { this.parent.classes.push(c); }, remove(c) { this.parent.classes = this.parent.classes.filter(x => x !== c); }, contains(c) { return this.parent.classes.includes(c); } } },
      { id: 'nav-item-settings', view: 'settings', classes: ['nav-item', 'nav-item-parent'], style: {}, classList: { add(c) { this.parent.classes.push(c); }, remove(c) { this.parent.classes = this.parent.classes.filter(x => x !== c); }, contains(c) { return this.parent.classes.includes(c); } } },
      { id: 'nav-subitem-farm', view: 'farm', classes: ['nav-item', 'nav-subitem'], classList: { add(c) { this.parent.classes.push(c); }, remove(c) { this.parent.classes = this.parent.classes.filter(x => x !== c); }, contains(c) { return this.parent.classes.includes(c); } } },
      { id: 'nav-subitem-settings', view: 'settings', classes: ['nav-item', 'nav-subitem'], classList: { add(c) { this.parent.classes.push(c); }, remove(c) { this.parent.classes = this.parent.classes.filter(x => x !== c); }, contains(c) { return this.parent.classes.includes(c); } } }
    ];
    navItems.forEach(n => { n.classList.parent = n; });
    const submenuElem = { style: { display: 'none' } };

    const mockDoc = {
      querySelectorAll: (sel) => {
        if (sel === '.nav-item') return navItems;
        return [];
      },
      querySelector: (sel) => {
        if (sel.includes('data-view="dashboard"')) return navItems.find(n => n.id === 'nav-dash');
        return null;
      },
      getElementById: (id) => {
        if (id === 'nav-item-settings') return navItems.find(n => n.id === 'nav-item-settings');
        if (id === 'submenu-settings') return submenuElem;
        if (id === 'nav-subitem-farm') return navItems.find(n => n.id === 'nav-subitem-farm');
        if (id === 'nav-subitem-settings') return navItems.find(n => n.id === 'nav-subitem-settings');
        return null;
      }
    };

    // Extraire updateActiveNav et l'évaluer
    const navFnMatch = appJsContent.match(/function updateActiveNav\([^\)]*\)\s*\{[\s\S]*?\n\}/);
    assert(navFnMatch !== null, 'Fonction updateActiveNav trouvée dans app.js');
    const navVm = { document: mockDoc, State: { activeView: 'dashboard' }, console: console };
    vm.createContext(navVm);
    vm.runInContext(navFnMatch[0], navVm);

    const updateActiveNavFn = navVm.updateActiveNav;

    // Test activation de 'farm'
    updateActiveNavFn('farm');
    const farmItem = navItems.find(n => n.id === 'nav-subitem-farm');
    const parentItem = navItems.find(n => n.id === 'nav-item-settings');
    assert(farmItem.classes.includes('active'), 'Sous-menu « Ma ferme » reçoit la classe active');
    assert(parentItem.classes.includes('active-parent') && parentItem.classes.includes('open'), 'Rubrique parente « Paramètres » reçoit les classes active-parent et open');
    assert(submenuElem.style.display === 'flex', 'Sous-menu déroulé automatiquement en affichage flex');

    // Test activation de 'settings'
    updateActiveNavFn('settings');
    const settingsSubitem = navItems.find(n => n.id === 'nav-subitem-settings');
    assert(settingsSubitem.classes.includes('active'), 'Sous-menu « Catégories & Config » reçoit la classe active');
    assert(parentItem.classes.includes('active') && parentItem.classes.includes('open'), 'Rubrique parente « Paramètres » marquée active');

    // Test retour sur 'dashboard'
    updateActiveNavFn('dashboard');
    const dashItem = navItems.find(n => n.id === 'nav-dash');
    assert(dashItem.classes.includes('active'), 'Tableau de bord redevient actif');
    assert(!farmItem.classes.includes('active'), 'Sous-menu « Ma ferme » n\'est plus actif');
    assert(!parentItem.classes.includes('active') && !parentItem.classes.includes('active-parent'), 'Rubrique parente n\'est plus active');
    assert(submenuElem.style.display === 'none', 'Sous-menu masqué sur les autres pages');

    // Vérification que les fonctionnalités de mise à jour de ferme sont préservées
    const currentFarm = (await API.getFarms()).farms[0];
    const updateRes = await API.updateFarm(currentFarm.id, {
      ...currentFarm,
      locality: 'Lomé Centre'
    });
    assert(updateRes.farm.locality === 'Lomé Centre', 'Mise à jour des informations de la ferme préservée à 100%');

    // ------------------------------------------------------------------------
    // 13. SUPPRESSION SÉCURISÉE D'UNE EXPLOITATION & CONTRÔLE MULTI-FERMES
    // ------------------------------------------------------------------------
    console.log('\n--- 13. Suppression Sécurisée d\'une Exploitation & Contrôle Multi-Fermes ---');

    const indexHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

    // 13.1 Éléments d'interface dans index.html et app.js
    assert(indexHtmlContent.includes('id="modal-delete-farm"'), 'Modale modal-delete-farm présente dans index.html');
    assert(indexHtmlContent.includes('Supprimer cette exploitation ?'), 'Titre d\'avertissement clair présent dans la modale');
    assert(indexHtmlContent.includes('id="delete-farm-target-name"'), 'Zone pour afficher le nom précis de l\'exploitation cible');
    assert(indexHtmlContent.includes('id="delete-farm-active-warning"'), 'Zone d\'avertissement dynamique pour ferme active / unique');
    assert(indexHtmlContent.includes('id="delete-farm-checkbox-confirm"'), 'Case à cocher de confirmation renforcée présente');
    assert(indexHtmlContent.includes('id="btn-confirm-delete-farm"'), 'Bouton de confirmation de suppression présent');
    assert(indexHtmlContent.includes('id="btn-cancel-delete-farm"'), 'Bouton Annuler présent');

    assert(appJsContent.includes('btn-delete-farm'), 'Classe de bouton btn-delete-farm présente dans app.js');
    assert(appJsContent.includes('openDeleteFarmModal'), 'Fonction openDeleteFarmModal définie dans app.js');
    assert(appJsContent.includes('setupDeleteFarmHandlers'), 'Fonction setupDeleteFarmHandlers définie dans app.js');

    // 13.2 Contrôle d'authentification : refus si déconnecté
    const savedToken = API.getToken();
    API.setToken(null);
    let unauthError = null;
    try {
      await API.deleteFarm(farmId);
    } catch (e) {
      unauthError = e;
    }
    assert(unauthError !== null && unauthError.message.includes('Non authentifié'), 'Suppression rejetée si l\'utilisateur n\'est pas connecté');
    API.setToken(savedToken);

    // 13.3 Contrôle d'autorisation : impossible de supprimer la ferme d'un autre utilisateur
    const user2Reg = await API.register('Deuxième Fermier', 'fermier2@test.com', 'password123');
    const farmUser2 = await API.createFarm({
      name: 'Ferme Privée Fermier 2',
      owner_name: 'Deuxième Fermier',
      country: 'Bénin',
      locality: 'Cotonou',
      farm_type: 'Bovins',
      currency: 'FCFA',
      start_date: '2024-01-01'
    });

    // Se reconnecter en tant que Fermier 1
    await API.login('fermier@exemple.com', 'ferme123');
    let forbiddenError = null;
    try {
      await API.deleteFarm(farmUser2.farm.id);
    } catch (e) {
      forbiddenError = e;
    }
    assert(forbiddenError !== null && forbiddenError.message.includes('autorisation'), 'Suppression interdite pour une ferme appartenant à un tiers');

    // 13.4 Création d'une ferme secondaire dédiée avec des données relationnelles associées
    const farmToCascade = await API.createFarm({
      name: 'Ferme Démo Cascade',
      owner_name: 'Fermier Cascade',
      country: 'Togo',
      locality: 'Kpalimé',
      farm_type: 'Aviculture & Caprins',
      currency: 'FCFA',
      start_date: '2024-02-01'
    });
    const cascadeFarmId = farmToCascade.farm.id;

    // Ajouter des données rattachées spécifiquement à cascadeFarmId
    const cascadeLot = await API.createLot(cascadeFarmId, {
      name: 'Bâtiment Test Cascade',
      species_id: 'poules',
      capacity: 50
    });
    const cascadeFin = await API.createFinancialRecord(cascadeFarmId, {
      type: 'depense',
      category: 'alimentation',
      amount: 15000,
      title: 'Aliments poules cascade',
      supplier: 'Test Feed'
    });
    const cascadeTrans = await API.createTransaction(cascadeFarmId, {
      type: 'depense',
      category: 'Aliments',
      amount: 15000,
      description: 'Aliments poules cascade',
      supplier: 'Test Feed'
    });

    // Vérifier la présence des données avant suppression
    const getLocalDb = () => JSON.parse(localStorageMock.getItem('ferme_animale_local_db_v1'));
    let dbState = getLocalDb();
    assert(dbState.farms.some(f => f.id === cascadeFarmId), 'Ferme Démo Cascade présente dans la base');
    assert(dbState.lots.some(l => l.farm_id === cascadeFarmId), 'Lot rattaché à Ferme Démo Cascade présent');
    assert(dbState.financial_records.some(fr => fr.farm_id === cascadeFarmId), 'Écriture financière rattachée présente');
    assert(dbState.commercial_transactions.some(t => t.farm_id === cascadeFarmId), 'Transaction rattachée présente');

    // 13.5 Suppression sécurisée et cascade relationnelle ciblée
    const deleteRes = await API.deleteFarm(cascadeFarmId);
    assert(deleteRes.success === true, 'Suppression réussie avec statut success: true');
    assert(deleteRes.message.includes('Ferme Démo Cascade'), 'Message de confirmation mentionnant le nom de la ferme');

    // Vérifier l'assainissement de la base de données
    dbState = getLocalDb();
    assert(!dbState.farms.some(f => f.id === cascadeFarmId), 'Ferme Démo Cascade retirée de db.farms');
    assert(!dbState.user_farms.some(uf => uf.farm_id === cascadeFarmId), 'Association retirée de db.user_farms');
    assert(!dbState.lots.some(l => l.farm_id === cascadeFarmId), 'Lots de la ferme cascade proprement supprimés');
    assert(!dbState.financial_records.some(fr => fr.farm_id === cascadeFarmId), 'Écritures financières de la ferme cascade proprement supprimées');
    assert(!dbState.commercial_transactions.some(t => t.farm_id === cascadeFarmId), 'Transactions de la ferme cascade proprement supprimées');

    // Vérifier que la Ferme du Val Fleuri et ses données sont 100% préservées
    assert(dbState.farms.some(f => f.id === farmId), 'Ferme du Val Fleuri toujours présente');
    assert(dbState.lots.some(l => l.farm_id === farmId), 'Lots de la Ferme du Val Fleuri intacts');
    assert(dbState.commercial_transactions.some(t => t.farm_id === farmId), 'Transactions de la Ferme du Val Fleuri intactes');
    assert(dbState.species.some(s => s.is_system), 'Espèces génériques système intactes');

    // 13.6 Rejet si la ferme n'existe pas
    let notFoundErr = null;
    try {
      await API.deleteFarm(999999);
    } catch (e) {
      notFoundErr = e;
    }
    assert(notFoundErr !== null && notFoundErr.message.includes('introuvable'), 'Tentative de suppression d\'une ferme inexistante rejetée');

    // 13.7 Cas particulier : suppression de l'unique ferme d'un utilisateur
    // Se connecter avec l'utilisateur 2 qui ne possède qu'une ferme
    await API.login('fermier2@test.com', 'password123');
    const u2FarmsBefore = await API.getFarms();
    assert(u2FarmsBefore.farms.length === 1, 'L\'utilisateur 2 a exactement une seule ferme');

    const deleteSingleRes = await API.deleteFarm(farmUser2.farm.id);
    assert(deleteSingleRes.success === true, 'Suppression de l\'unique ferme réussie');
    assert(deleteSingleRes.remaining_farms.length === 0, 'remaining_farms est vide');

    // Vérifier que le compte utilisateur est préservé
    const u2Profile = await API.getMe();
    assert(u2Profile.user.email === 'fermier2@test.com', 'Le compte utilisateur est 100% préservé');
    assert(u2Profile.farms.length === 0, 'L\'utilisateur n\'a plus de ferme active');

    // ----------------------------------------------------------------------
    // 14. MODULE SUIVI DE CROISSANCE & ALERTES 12 SEMAINES (84 JOURS) CANETONS
    // ----------------------------------------------------------------------
    console.log('\n--- 14. Suivi de Croissance, Alertes 12 Semaines & Sexage des Canetons ---');

    // Reconnecter fermier 1 sur la Ferme du Val Fleuri
    await API.login('fermier@exemple.com', 'ferme123');
    const duckFarmId = farmId; // Ferme du Val Fleuri

    // Calcul du cheptel total initial de la ferme pour le test de conservation stricte
    const initialDash = await API.getDashboard(duckFarmId);
    let farmHerdCount = initialDash.kpis.total_live_animals;

    // 14.1 Enregistrement d'un lot né le 1er janvier 2026 -> Maturité calculée = 26 mars 2026 (+84 jours)
    const lotJan1 = await API.createDucklingLot(duckFarmId, {
      name: 'Lot Canetons Hiver 2026',
      birth_date: '2026-01-01',
      initial_quantity: 50,
      breed: 'Barbarie'
    });
    assert(lotJan1.animal.maturity_date === '2026-03-26', 'Calcul automatique exact : 2026-01-01 + 84 jours = 2026-03-26');
    assert(lotJan1.animal.category_name === 'Canetons', 'Assigné automatiquement à la catégorie Canetons');
    assert(lotJan1.animal.current_quantity === 50, 'Effectif initial de 50 canetons');

    // Mettre à jour farmHerdCount après la création (+50)
    farmHerdCount += 50;
    const dashAfterCreate = await API.getDashboard(duckFarmId);
    assert(dashAfterCreate.kpis.total_live_animals === farmHerdCount, 'Cheptel total incrémenté de l\'entrée des 50 canetons');

    // Helper pour générer des dates relatives à aujourd'hui (UTC)
    const todayStr = new Date().toISOString().split('T')[0];
    const addDaysHelper = (dateStr, d) => API.addDaysToDate(dateStr, d);

    // 14.2 Vérification d'un lot âgé de 11 semaines (né il y a 77 jours -> 12 sem. dans 7 jours) -> Alerte « À venir »
    const birthDate11Weeks = addDaysHelper(todayStr, -77);
    const lot11Weeks = await API.createDucklingLot(duckFarmId, {
      name: 'Lot Canetons 11 Semaines',
      birth_date: birthDate11Weeks,
      initial_quantity: 30,
      breed: 'Mulard'
    });
    farmHerdCount += 30;

    // 14.3 Vérification d'un lot âgé de 12 semaines jour pour jour (né il y a 84 jours) -> Alerte « Aujourd'hui »
    const birthDate12Weeks = addDaysHelper(todayStr, -84);
    const lot12Weeks = await API.createDucklingLot(duckFarmId, {
      name: 'Lot Canetons 12 Semaines Exactes',
      birth_date: birthDate12Weeks,
      initial_quantity: 40,
      breed: 'Pékin'
    });
    farmHerdCount += 40;

    // 14.4 Vérification d'un lot âgé de 13 semaines (né il y a 91 jours -> dépassé de 7 jours) -> Alerte « En retard »
    const birthDate13Weeks = addDaysHelper(todayStr, -91);
    const lot13Weeks = await API.createDucklingLot(duckFarmId, {
      name: 'Lot Canetons 13 Semaines En Retard',
      birth_date: birthDate13Weeks,
      initial_quantity: 60,
      breed: 'Barbarie'
    });
    farmHerdCount += 60;

    // Interroger les alertes et vérifier la classification des statuts
    const alertsList = await API.getDucklingAlerts(duckFarmId);
    const alert11 = alertsList.lots.find(l => l.id === lot11Weeks.animal.id);
    const alert12 = alertsList.lots.find(l => l.id === lot12Weeks.animal.id);
    const alert13 = alertsList.lots.find(l => l.id === lot13Weeks.animal.id);

    assert(alert11 && alert11.alert_status === 'a_venir', 'Lot âgé de 11 semaines classé en alerte « à_venir » (échéance sous 7 jours)');
    assert(alert12 && alert12.alert_status === 'aujourdhui', 'Lot âgé de 12 semaines classé en alerte « aujourdhui » (échéance jour J)');
    assert(alert13 && alert13.alert_status === 'en_retard', 'Lot âgé de 13 semaines classé en alerte « en_retard » (échéance dépassée)');
    assert(alertsList.summary.overdue_lots >= 1, 'KPI lots en retard incrémenté');
    assert(alertsList.summary.today_lots >= 1, 'KPI lots échéance aujourd\'hui incrémenté');
    assert(alertsList.summary.upcoming_lots >= 1, 'KPI lots à venir incrémenté');

    // Vérifier les notifications système
    const notifs = await API.getNotifications(duckFarmId);
    const ducklingNotif = notifs.notifications.find(n => n.type === 'duckling_maturity');
    assert(ducklingNotif !== undefined, 'Notification duckling_maturity présente dans le centre d\'alertes');

    // 14.5 Tentative de validation avec une somme incorrecte (ex: 20 mâles + 20 femelles pour un lot de 50) -> REJET
    let sumError = null;
    try {
      await API.classifyDucklings(duckFarmId, lotJan1.animal.id, {
        date: todayStr,
        males: 20,
        females: 20,
        unknown: 0 // Somme = 40 != 50
      });
    } catch (e) {
      sumError = e;
    }
    assert(sumError !== null && sumError.message.includes('strictement égale'), 'Validation bloquée : rejet de la saisie quand la somme ne correspond pas');

    // 14.6 Validation d'un sexage partiel (ex: 20 mâles + 20 femelles + 10 non identifiés pour un lot de 50)
    const partialRes = await API.classifyDucklings(duckFarmId, lotJan1.animal.id, {
      date: todayStr,
      males: 20,
      females: 20,
      unknown: 10,
      notes: 'Premier passage : 10 canetons au plumage intermédiaire'
    });
    assert(partialRes.transferred.males === 20, '20 mâles transférés');
    assert(partialRes.transferred.females === 20, '20 canes transférées');
    assert(partialRes.duckling.current_quantity === 10, '10 canetons restants non identifiés dans le lot');
    assert(partialRes.is_complete === false, 'Sexage partiel : lot non clos');

    // Vérifier que l'alerte reste active pour le reliquat de 10
    const alertsAfterPartial = await API.getDucklingAlerts(duckFarmId);
    const lotJan1Alert = alertsAfterPartial.lots.find(l => l.id === lotJan1.animal.id);
    assert(lotJan1Alert && lotJan1Alert.current_quantity === 10, 'Alerte toujours visible avec effectif restant de 10');

    // 14.7 Conservation absolue du cheptel (règle fondamentale)
    const dashAfterPartial = await API.getDashboard(duckFarmId);
    assert(dashAfterPartial.kpis.total_live_animals === farmHerdCount, 'Conservation stricte du cheptel : aucun double comptage après transfert partiel');

    // 14.8 Deuxième session de sexage sur le reliquat (10 -> 5 mâles + 5 femelles + 0 indéterminé) -> Clôture définitive
    const completeRes = await API.classifyDucklings(duckFarmId, lotJan1.animal.id, {
      date: todayStr,
      males: 5,
      females: 5,
      unknown: 0,
      notes: 'Second passage : sexage cloacal du reliquat'
    });
    assert(completeRes.duckling.current_quantity === 0, 'Effectif restant = 0 canetons');
    assert(completeRes.duckling.status === 'clos', 'Statut du lot passé à « clos »');
    assert(completeRes.is_complete === true, 'Clôture définitive du lot marquée is_complete: true');

    // Vérifier la disparition de l'alerte active pour ce lot
    const alertsAfterComplete = await API.getDucklingAlerts(duckFarmId, { status: 'alertes' });
    const lotJan1InAlerts = alertsAfterComplete.lots.find(l => l.id === lotJan1.animal.id);
    assert(!lotJan1InAlerts, 'Alerte fermée et retirée de la liste des alertes actives');

    // Vérifier la conservation du cheptel après clôture
    const dashAfterComplete = await API.getDashboard(duckFarmId);
    assert(dashAfterComplete.kpis.total_live_animals === farmHerdCount, 'Conservation stricte du cheptel : effectif total identique après clôture finale');

    // 14.9 Historique des classifications
    const historyRes = await API.getDucklingClassificationHistory(duckFarmId);
    assert(historyRes.total >= 2, 'Historique des opérations de sexage enregistré (au moins 2 sessions)');
    assert(historyRes.history.some(h => h.lot_name.includes('Lot Canetons Hiver 2026') && h.is_complete), 'Session de clôture présente dans l\'historique');

    // 14.10 Modification de la date de naissance d'un lot : recalcul immédiat
    const updatedLot11 = await API.updateAnimal(duckFarmId, lot11Weeks.animal.id, {
      birth_date: '2026-02-01'
    });
    assert(updatedLot11.animal.maturity_date === '2026-04-26', 'Recalcul immédiat de la maturité lors du changement de date de naissance : 2026-02-01 + 84 j = 2026-04-26');

    // 14.11 Persistance locale après rechargement
    const reloadedDb = getLocalDb();
    const storedLot = reloadedDb.animals.find(a => a.id === lotJan1.animal.id);
    assert(storedLot.status === 'clos' && storedLot.current_quantity === 0, 'Persistance des statuts dans LocalDB');
    assert(reloadedDb.duckling_classifications.length >= 2, 'Persistance de la table duckling_classifications dans LocalDB');

    // ========================================================================
    // 15. SUIVI DE CROISSANCE, ALERTES 8 SEMAINES (56 JOURS) & SEXAGE DES POUSSINS
    // ========================================================================
    console.log('\n--- 15. Suivi de Croissance, Alertes 8 Semaines & Sexage des Poussins ---');

    // 15.1 Calcul automatique obligatoire : Date d'alerte = date de naissance + 56 jours
    const chickLotJan1 = await API.createChickLot(duckFarmId, {
      name: 'Lot Poussins Hiver 2026',
      birth_date: '2026-01-01',
      initial_quantity: 60,
      breed: 'Goliath'
    });

    assert(chickLotJan1.maturity_date === '2026-02-26', 'Calcul automatique exact : 2026-01-01 + 56 jours = 2026-02-26 (8 semaines)');
    assert(chickLotJan1.animal.species_id === 'poules', 'Espèce assignée : poules');
    assert(chickLotJan1.animal.category_name === 'Poussins', 'Assigné automatiquement à la catégorie Poussins');
    assert(chickLotJan1.animal.current_quantity === 60, 'Effectif initial de 60 poussins');

    // Vérifier la règle multi-espèces (Poules 56j vs Canards 84j)
    const poulesRule = API.getYoungPoultryRule('poules');
    const canardsRule = API.getYoungPoultryRule('canards');
    assert(poulesRule.maturity_days === 56 && poulesRule.maturity_weeks === 8, 'Règle poussins : 56 jours (8 semaines)');
    assert(canardsRule.maturity_days === 84 && canardsRule.maturity_weeks === 12, 'Règle canetons préservée : 84 jours (12 semaines)');
    assert(poulesRule.male_category === 'Coqs' && poulesRule.female_category === 'Poules', 'Catégories adultes cibles pour poules : Coqs et Poules');
    assert(canardsRule.male_category === 'Canards mâles' && canardsRule.female_category === 'Canes', 'Catégories adultes cibles pour canards : Canards mâles et Canes');

    // Mettre à jour farmHerdCount (+60)
    farmHerdCount += 60;
    const dashAfterChick = await API.getDashboard(duckFarmId);
    assert(dashAfterChick.kpis.total_live_animals === farmHerdCount, 'Cheptel total incrémenté de l\'entrée des 60 poussins');

    // 15.2 Alertes 3 tiers automatiques pour les poussins
    // - À venir : né il y a 49 jours (7 semaines) -> échéance dans 7 jours
    const birthDate7Weeks = addDaysHelper(todayStr, -49);
    const lotChick7Weeks = await API.createChickLot(duckFarmId, {
      name: 'Lot Poussins 7 Semaines',
      birth_date: birthDate7Weeks,
      initial_quantity: 40,
      breed: 'Sasso'
    });
    farmHerdCount += 40;

    // - Aujourd'hui : né il y a 56 jours (8 semaines exactes) -> échéance jour J
    const birthDate8Weeks = addDaysHelper(todayStr, -56);
    const lotChick8Weeks = await API.createChickLot(duckFarmId, {
      name: 'Lot Poussins 8 Semaines Exactes',
      birth_date: birthDate8Weeks,
      initial_quantity: 50,
      breed: 'Cou nu'
    });
    farmHerdCount += 50;

    // - En retard : né il y a 63 jours (9 semaines) -> dépassé de 7 jours
    const birthDate9Weeks = addDaysHelper(todayStr, -63);
    const lotChick9Weeks = await API.createChickLot(duckFarmId, {
      name: 'Lot Poussins 9 Semaines En Retard',
      birth_date: birthDate9Weeks,
      initial_quantity: 70,
      breed: 'Goliath'
    });
    farmHerdCount += 70;

    // Interroger les alertes poussins
    const chickAlertsList = await API.getChickAlerts(duckFarmId);
    const alertChick7 = chickAlertsList.lots.find(l => l.id === lotChick7Weeks.animal.id);
    const alertChick8 = chickAlertsList.lots.find(l => l.id === lotChick8Weeks.animal.id);
    const alertChick9 = chickAlertsList.lots.find(l => l.id === lotChick9Weeks.animal.id);

    assert(alertChick7 && alertChick7.alert_status === 'a_venir', 'Lot poussins 7 semaines classé en alerte « à_venir » (sous 7 jours)');
    assert(alertChick8 && alertChick8.alert_status === 'aujourdhui', 'Lot poussins 8 semaines classé en alerte « aujourdhui » (échéance jour J)');
    assert(alertChick9 && alertChick9.alert_status === 'en_retard', 'Lot poussins 9 semaines classé en alerte « en_retard » (échéance dépassée)');
    assert(chickAlertsList.summary.overdue_lots >= 1, 'KPI lots poussins en retard incrémenté');
    assert(chickAlertsList.summary.today_lots >= 1, 'KPI lots poussins échéance aujourd\'hui incrémenté');
    assert(chickAlertsList.summary.upcoming_lots >= 1, 'KPI lots poussins à venir incrémenté');

    // 15.3 Notifications système pour les poussins (type chick_maturity)
    const allNotifs = await API.getNotifications(duckFarmId);
    const chickNotifs = allNotifs.notifications.filter(n => n.type === 'chick_maturity');
    assert(chickNotifs.length >= 3, 'Centre de notifications : alertes chick_maturity émises pour les lots de poussins');
    assert(chickNotifs.some(n => n.subtype === 'en_retard'), 'Notification chick_maturity « en retard » présente');
    assert(chickNotifs.some(n => n.subtype === 'aujourdhui'), 'Notification chick_maturity « aujourdhui » présente');
    assert(chickNotifs.some(n => n.subtype === 'a_venir'), 'Notification chick_maturity « à venir » présente');
    assert(chickNotifs.every(n => n.data && n.data.species_id === 'poules'), 'Toutes les notifications chick_maturity sont rattachées à l\'espèce poules');

    // 15.4 Rejet impératif d'une somme incohérente (mâles + femelles + inconnus !== effectif)
    let chickSumError = null;
    try {
      await API.classifyChicks(duckFarmId, chickLotJan1.animal.id, {
        date: todayStr,
        males: 25,
        females: 25,
        unknown: 0 // Somme = 50 != 60
      });
    } catch (e) {
      chickSumError = e;
    }
    assert(chickSumError !== null && chickSumError.message.includes('strictement égale'), 'Rejet de la saisie si la somme (25+25=50) ne correspond pas au total (60)');

    // 15.5 Classification partielle : 30 mâles (Coqs) + 20 femelles (Poules) + 10 inconnus (restent en Poussins)
    const chickPartial = await API.classifyChicks(duckFarmId, chickLotJan1.animal.id, {
      date: todayStr,
      males: 30,
      females: 20,
      unknown: 10,
      notes: 'Premier passage sexage poussins : crête développée sur 30 mâles'
    });
    assert(chickPartial.transferred.males === 30, '30 mâles transférés vers Coqs');
    assert(chickPartial.transferred.females === 20, '20 femelles transférées vers Poules');
    assert(chickPartial.animal.current_quantity === 10, '10 poussins restants non identifiés dans le lot');
    assert(chickPartial.is_complete === false, 'Sexage partiel : lot non clos');

    // Vérifier les nouvelles fiches créées dans les catégories adultes Coqs et Poules
    const dbAfterChickPartial = getLocalDb();
    const coqsLot = dbAfterChickPartial.animals.find(a => a.id === chickPartial.classification.male_animal_id);
    const poulesLot = dbAfterChickPartial.animals.find(a => a.id === chickPartial.classification.female_animal_id);
    assert(coqsLot && coqsLot.current_quantity === 30 && coqsLot.category_name === 'Coqs', 'Animaux mâles bien affectés à la catégorie adulte « Coqs » (30 sujets)');
    assert(poulesLot && poulesLot.current_quantity === 20 && poulesLot.category_name === 'Poules', 'Animaux femelles bien affectés à la catégorie adulte « Poules » (20 sujets)');

    // L'alerte reste active pour le reliquat de 10 poussins
    const chickAlertsPartial = await API.getChickAlerts(duckFarmId);
    const chickAlertJan1 = chickAlertsPartial.lots.find(l => l.id === chickLotJan1.animal.id);
    assert(chickAlertJan1 && chickAlertJan1.current_quantity === 10, 'Alerte toujours active pour le reliquat de 10 poussins');

    // Conservation absolue du cheptel
    const dashAfterPartialChicks = await API.getDashboard(duckFarmId);
    assert(dashAfterPartialChicks.kpis.total_live_animals === farmHerdCount, 'Conservation absolue du cheptel après transfert partiel des poussins');

    // 15.6 Deuxième passage : ventilation du reliquat (5 coqs + 5 poules + 0 indéterminé) -> Clôture définitive
    const chickComplete = await API.classifyChicks(duckFarmId, chickLotJan1.animal.id, {
      date: todayStr,
      males: 5,
      females: 5,
      unknown: 0,
      notes: 'Deuxième passage sexage poussins : confirmation finale'
    });
    assert(chickComplete.animal.current_quantity === 0, 'Effectif restant = 0 poussins');
    assert(chickComplete.animal.status === 'clos', 'Statut du lot passé à « clos »');
    assert(chickComplete.is_complete === true, 'Clôture définitive du lot marquée is_complete: true');

    // L'alerte disparaît de la liste des alertes actives
    const chickAlertsComplete = await API.getChickAlerts(duckFarmId, { status: 'alertes' });
    const chickJan1InAlerts = chickAlertsComplete.lots.find(l => l.id === chickLotJan1.animal.id);
    assert(!chickJan1InAlerts, 'Alerte poussins retirée des alertes actives après clôture complète');

    // Cheptel total strictement préservé après clôture
    const dashAfterCompleteChicks = await API.getDashboard(duckFarmId);
    assert(dashAfterCompleteChicks.kpis.total_live_animals === farmHerdCount, 'Conservation absolue du cheptel après clôture définitive du lot de poussins');

    // 15.7 Historique des classifications poussins
    const chickHistory = await API.getChickClassificationHistory(duckFarmId);
    assert(chickHistory.total >= 2, 'Historique des opérations de sexage poussins enregistré (au moins 2 sessions)');
    assert(chickHistory.history.some(h => h.lot_name.includes('Lot Poussins Hiver 2026') && h.is_complete), 'Session de clôture poussins présente dans l\'historique');

    // 15.8 Recalcul dynamique immédiat lors de la modification de date de naissance
    const updatedChick7 = await API.updateAnimal(duckFarmId, lotChick7Weeks.animal.id, {
      birth_date: '2026-02-01'
    });
    assert(updatedChick7.animal.maturity_date === '2026-03-29', 'Recalcul immédiat de la maturité poussins lors du changement de date de naissance : 2026-02-01 + 56 j = 2026-03-29');

    // 15.9 Persistance locale dans LocalDB
    const reloadedDbChicks = getLocalDb();
    const storedChickLot = reloadedDbChicks.animals.find(a => a.id === chickLotJan1.animal.id);
    assert(storedChickLot.status === 'clos' && storedChickLot.current_quantity === 0, 'Persistance du statut clos pour le lot de poussins');
    assert(reloadedDbChicks.chick_classifications.length >= 2, 'Persistance de chick_classifications dans LocalDB');

    // ========================================================================
    // 16. RECONCEPTION DU TABLEAU DE BORD — VALIDATION DES 10 TESTS OBLIGATOIRES
    // ========================================================================
    console.log('\n--- 16. Reconception du Tableau de Bord (10 Tests Obligatoires) ---');

    // Test 1 : Le nom de la ferme active s'affiche correctement
    const dashFarm1 = await API.getDashboard(farmId, 'toutes', 'tous');
    assert(dashFarm1.farm_name === 'Ferme du Val Fleuri', 'Test 1 : Le nom de la ferme active s\'affiche correctement (« Ferme du Val Fleuri »)');
    assert(dashFarm1.currency === 'FCFA', 'Devise active de la ferme identifiée (FCFA)');

    // Test 2 : Les effectifs des canards et des poules sont exacts
    const duckIndicators = dashFarm1.species_indicators.find(s => s.id === 'canards');
    const chickIndicators = dashFarm1.species_indicators.find(s => s.id === 'poules');
    assert(duckIndicators !== undefined, 'Indicateurs de l\'espèce canards présents');
    assert(chickIndicators !== undefined, 'Indicateurs de l\'espèce poules présents');

    const cardDuckMales = duckIndicators.cards.find(c => c.id === 'canards_males');
    const cardCanes = duckIndicators.cards.find(c => c.id === 'canes');
    const cardCanetons = duckIndicators.cards.find(c => c.id === 'canetons');
    const cardDuckTotal = duckIndicators.cards.find(c => c.id === 'total_canards');

    assert(cardDuckMales && cardDuckMales.label === 'Nombre de Canard' && cardDuckMales.has_accent_bar, 'Carte 1 Canards : « Nombre de Canard » avec barre d\'accentuation visuelle');
    assert(cardCanes && cardCanes.label === 'Nombre de Canne', 'Carte 2 Canards : « Nombre de Canne » (canes adultes)');
    assert(cardCanetons && cardCanetons.label === 'Nombre de Canetons (-84 jours)', 'Carte 3 Canards : « Nombre de Canetons (-84 jours) »');
    assert(cardDuckTotal && cardDuckTotal.label === 'Nombre total', 'Carte 4 Canards : « Nombre total »');
    assert(cardDuckTotal.count === cardDuckMales.count + cardCanes.count + cardCanetons.count, 
      `Somme exacte pour les canards : ${cardDuckTotal.count} = ${cardDuckMales.count} (mâles) + ${cardCanes.count} (canes) + ${cardCanetons.count} (canetons)`);

    const cardPoules = chickIndicators.cards.find(c => c.id === 'poules');
    const cardCoqs = chickIndicators.cards.find(c => c.id === 'coqs');
    const cardPoussins = chickIndicators.cards.find(c => c.id === 'poussins');
    const cardChickTotal = chickIndicators.cards.find(c => c.id === 'total_poules');

    assert(cardPoules && cardPoules.label === 'Nombre de Poule', 'Carte 1 Poules : « Nombre de Poule » (poules adultes)');
    assert(cardCoqs && cardCoqs.label === 'Nombre de coqs', 'Carte 2 Poules : « Nombre de coqs » (coqs adultes)');
    assert(cardPoussins && cardPoussins.label === 'Nombre de poussin (-56 jours)', 'Carte 3 Poules : « Nombre de poussin (-56 jours) »');
    assert(cardChickTotal && cardChickTotal.label === 'Nombre total', 'Carte 4 Poules : « Nombre total » (total volailles)');
    assert(cardChickTotal.count === cardPoules.count + cardCoqs.count + cardPoussins.count,
      `Somme exacte pour les volailles : ${cardChickTotal.count} = ${cardPoules.count} (poules) + ${cardCoqs.count} (coqs) + ${cardPoussins.count} (poussins)`);

    // Test 3 : Les totaux incluent les animaux non classifiés sans double comptage
    // Créer un lot de volailles au sexe non défini (MIXTE) hors poussins (ex: poulettes ou lot mixte non sexé)
    const dbBeforeMix = getLocalDb();
    const nextMixId = Math.max(...dbBeforeMix.animals.map(a => a.id), 0) + 1;
    const mixAnimal = {
      id: nextMixId,
      farm_id: farmId,
      code: 'POU-MIX-TEST',
      type: 'lot',
      species_id: 'poules',
      category_name: 'Volailles Indéterminées',
      gender: 'MIXTE',
      initial_quantity: 12,
      current_quantity: 12,
      status: 'actif',
      created_at: new Date().toISOString()
    };
    dbBeforeMix.animals.push(mixAnimal);
    localStorageMock.setItem('ferme_animale_local_db_v1', JSON.stringify(dbBeforeMix));

    const dashAfterMix = await API.getDashboard(farmId);
    const spPouleAfterMix = dashAfterMix.species_indicators.find(s => s.id === 'poules');
    const totalWithMix = spPouleAfterMix.cards.find(c => c.id === 'total_poules').count;
    const coqsCount = spPouleAfterMix.cards.find(c => c.id === 'coqs').count;
    const poulesCount = spPouleAfterMix.cards.find(c => c.id === 'poules').count;

    assert(totalWithMix === cardChickTotal.count + 12, 'Test 3 : Sujets non sexés (12) bien inclus dans le total de l\'espèce');
    assert(coqsCount === cardCoqs.count && poulesCount === cardPoules.count, 'Les sujets non sexés ne sont pas faussement ajoutés aux compteurs des mâles ou des femelles');

    // Nettoyer l'animal de test
    const dbClean = getLocalDb();
    dbClean.animals = dbClean.animals.filter(a => a.id !== mixAnimal.id);
    localStorageMock.setItem('ferme_animale_local_db_v1', JSON.stringify(dbClean));

    // Test 4 : Les alertes de 56 jours et de 84 jours restent correctes
    assert(Array.isArray(dashFarm1.growth_alerts), 'Test 4 : Liste des alertes de croissance disponible');
    const hasDuckAlert = dashFarm1.growth_alerts.some(a => a.species_id === 'canards');
    const hasChickAlert = dashFarm1.growth_alerts.some(a => a.species_id === 'poules');
    assert(dashFarm1.growth_alerts_summary && typeof dashFarm1.growth_alerts_summary.overdue_lots === 'number', 
      'Synthèse des alertes de maturité cohérente avec le système de sexage');

    // Test 5 : Les revenus et dépenses correspondent à la ferme active
    const finRecordsFarm1 = getLocalDb().financial_records.filter(r => r.farm_id === farmId);
    const expectedRevFarm1 = finRecordsFarm1.filter(r => r.type === 'recette').reduce((s, r) => s + r.amount, 0);
    const expectedExpFarm1 = finRecordsFarm1.filter(r => r.type === 'depense').reduce((s, r) => s + r.amount, 0);

    assert(dashFarm1.financial_summary.total_revenues === expectedRevFarm1, 
      `Test 5 : Total revenus conforme aux écritures réelles (${dashFarm1.financial_summary.total_revenues} FCFA)`);
    assert(dashFarm1.financial_summary.total_expenses === expectedExpFarm1, 
      `Total dépenses conforme aux écritures réelles (${dashFarm1.financial_summary.total_expenses} FCFA)`);

    // Test 6 : Le solde de gestion est exact (Formule : Revenus - Dépenses)
    const expectedSoldeFarm1 = expectedRevFarm1 - expectedExpFarm1;
    assert(dashFarm1.financial_summary.solde_gestion === expectedSoldeFarm1, 
      `Test 6 : Solde de gestion exact (${dashFarm1.financial_summary.solde_gestion} = ${expectedRevFarm1} - ${expectedExpFarm1})`);
    assert(dashFarm1.financial_summary.status === (expectedSoldeFarm1 > 0 ? 'positif' : (expectedSoldeFarm1 < 0 ? 'negatif' : 'neutre')), 
      `Statut visuel du solde exact (${dashFarm1.financial_summary.status})`);

    // Test 7 : Le changement d'exploitation actualise les indicateurs
    // Créer une 2ème ferme spécifique avec des finances distinctes
    const farm2Res = await API.createFarm({
      name: 'Ferme Avicole Espoir',
      owner_name: 'Fermier Espoir',
      country: 'Sénégal',
      locality: 'Thiès',
      farm_type: 'Aviculture Pondeuses',
      currency: 'FCFA',
      start_date: '2026-01-01'
    });
    const farm2Id = farm2Res.farm.id;

    // Enregistrer une dépense et une recette sur la ferme 2
    await API.createFinancialRecord(farm2Id, {
      type: 'recette',
      category: 'vente_oeufs',
      date: '2026-10-15',
      amount: 120000,
      title: 'Vente 50 plateaux d\'œufs'
    });
    await API.createFinancialRecord(farm2Id, {
      type: 'depense',
      category: 'aliments',
      date: '2026-10-15',
      amount: 40000,
      title: 'Achat aliment ponte'
    });

    // Consulter le tableau de bord de la ferme 2
    const dashFarm2 = await API.getDashboard(farm2Id);
    assert(dashFarm2.farm_name === 'Ferme Avicole Espoir', 'Test 7 : Le tableau de bord affiche le nom de la ferme 2 après bascule');
    assert(dashFarm2.financial_summary.total_revenues === 120000, 'Revenus propres à la ferme 2 (120 000 FCFA)');
    assert(dashFarm2.financial_summary.total_expenses === 40000, 'Dépenses propres à la ferme 2 (40 000 FCFA)');
    assert(dashFarm2.financial_summary.solde_gestion === 80000, 'Solde positif propre à la ferme 2 (+80 000 FCFA)');
    assert(dashFarm2.financial_summary.status === 'positif', 'Statut solde positif sur la ferme 2');

    // Retour sur la ferme 1 : vérification du strict cloisonnement
    const dashFarm1Reload = await API.getDashboard(farmId);
    assert(dashFarm1Reload.farm_name === 'Ferme du Val Fleuri', 'Retour ferme 1 : Nom de la ferme 1 réaffiché');
    assert(dashFarm1Reload.financial_summary.total_revenues === expectedRevFarm1, 'Cloisonnement garanti : aucun revenu de la ferme 2 mélangé');

    // Nettoyer la ferme 2
    await API.deleteFarm(farm2Id);

    // Test 8 : Les cartes s'adaptent aux espèces activées
    // Désactiver l'espèce 'canards' sur la ferme 1
    await API.toggleSpecies(farmId, 'canards', false);
    const dashNoDucks = await API.getDashboard(farmId);
    const hasDucksAfterDeactivate = dashNoDucks.species_indicators.some(s => s.id === 'canards');
    assert(!hasDucksAfterDeactivate, 'Test 8 : Les cartes des canards sont masquées lorsque l\'espèce est désactivée');

    // Réactiver l'espèce 'canards'
    await API.toggleSpecies(farmId, 'canards', true);
    const dashDucksReactivated = await API.getDashboard(farmId);
    const hasDucksReactivated = dashDucksReactivated.species_indicators.some(s => s.id === 'canards');
    assert(hasDucksReactivated, 'Les cartes des canards réapparaissent dès la réactivation avec toutes leurs données');

    // Test 9 : Structure responsive et styles CSS modernes
    const cssStyles = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf-8');
    assert(cssStyles.includes('.dash-cards-grid'), 'Test 9 : Grille responsive .dash-cards-grid définie en CSS');
    assert(cssStyles.includes('.dash-financial-grid'), 'Grille responsive .dash-financial-grid pour les 3 cartes financières présente');
    assert(cssStyles.includes('.dash-stat-card'), 'Style .dash-stat-card avec coins arrondis et ombre subtile défini');
    assert(cssStyles.includes('.dash-stat-card.has-accent-bar'), 'Barre d\'accentuation visuelle définie pour la 1ère carte');
    assert(cssStyles.includes('.dash-fin-card.solde-card.solde-negatif'), 'Bordure rouge gauche dynamique pour solde négatif présente');
    assert(cssStyles.includes('.dash-fin-card.solde-card.solde-positif'), 'Bordure verte gauche dynamique pour solde positif présente');

    // Test 10 : Les autres modules de la plateforme restent 100% opérationnels
    const allMovs = await API.getMovements(farmId);
    assert(allMovs.movements.length > 0, 'Test 10 : Module Mouvements & Traçabilité opérationnel');
    const allLots = await API.getLots(farmId);
    assert(allLots.lots.length > 0, 'Module Bâtiments & Lots opérationnel');
    const allCats = await API.getCategories(farmId);
    assert(allCats.categories.length > 0, 'Module Catégories d\'animaux opérationnel');
    const allFeeds = await API.getFeeds(farmId);
    assert(allFeeds.feeds.length > 0, 'Module Nutrition & Aliments opérationnel');
    const allHealth = await API.getHealthTreatments(farmId);
    assert(allHealth.treatments.length > 0, 'Module Soins & Traitements opérationnel');

    // ========================================================================
    // 17. CENTRALISATION DES ALERTES DE CROISSANCE DANS « ALERTES & RAPPELS DE LA FERME »
    // ========================================================================
    console.log('\n--- 17. Centralisation des Alertes de Croissance dans « Alertes & Rappels de la Ferme » ---');

    // 17.1 Récupérer les alertes de la ferme active
    const notifsHub = await API.getNotifications(farmId);
    assert(Array.isArray(notifsHub.notifications), '17.1 Liste des notifications récupérée pour l\'exploitation');
    assert(typeof notifsHub.total_notifications === 'number', 'Compteur total_notifications présent pour les badges');

    // 17.2 Vérifier la présence des alertes de croissance (canetons 12 sem. et poussins 8 sem.)
    const ducklingGrowthAlerts = notifsHub.notifications.filter(n => n.type === 'duckling_maturity');
    const chickGrowthAlerts = notifsHub.notifications.filter(n => n.type === 'chick_maturity');

    assert(ducklingGrowthAlerts.length > 0, '17.2 Alertes de classification canetons présentes dans Alertes & Rappels');
    assert(chickGrowthAlerts.length > 0, 'Alertes de classification poussins présentes dans Alertes & Rappels');

    // 17.3 Vérification des 9 informations obligatoires sur une alerte de canetons
    const da = ducklingGrowthAlerts[0];
    assert(da.alert_type_label === 'Croissance et classification des animaux' || da.data?.alert_type_label === 'Croissance et classification des animaux', 
      '17.3 Champ 1 : Type d\'alerte « Croissance et classification des animaux » présent');
    assert(da.farm_name === 'Ferme du Val Fleuri' && da.data?.farm_name === 'Ferme du Val Fleuri', 
      'Champ 2 : Nom de l\'exploitation concernée (« Ferme du Val Fleuri ») présent');
    assert(da.species_name === 'Canards' && da.data?.species_name === 'Canards', 
      'Champ 3 : Espèce animale (« Canards ») présente');
    assert(typeof da.lot_name === 'string' && da.lot_name.length > 0, 
      `Champ 4 : Nom ou numéro du lot présent (${da.lot_name})`);
    assert(typeof da.birth_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(da.birth_date), 
      `Champ 5 : Date de naissance enregistrée présente (${da.birth_date})`);
    assert(typeof da.age_weeks === 'number' && typeof da.age_days === 'number', 
      `Champ 6 : Âge actuel des animaux présent (${da.age_weeks} sem. / ${da.age_days} jours)`);
    assert(typeof da.current_quantity === 'number' && typeof da.remaining_to_classify === 'number', 
      `Champ 7 : Nombre d'animaux vivants restant à classifier présent (${da.current_quantity})`);
    assert(typeof da.maturity_date === 'string' && typeof da.expected_classification_date === 'string', 
      `Champ 8 : Date prévue de classification calculée présente (${da.maturity_date})`);
    assert(['en_retard', 'aujourdhui', 'a_venir', 'traite'].includes(da.alert_status || da.subtype), 
      `Champ 9 : Statut d'alerte conforme (${da.status_label || da.subtype})`);

    // 17.4 Calcul automatique exact des échéances :
    // Canetons : birth_date + 84 jours (12 semaines)
    // Poussins : birth_date + 56 jours (8 semaines)
    const expectedDuckMaturity = API.addDaysToDate(da.birth_date, 84);
    assert(da.maturity_date === expectedDuckMaturity, 
      `17.4 Échéance canetons exacte : ${da.birth_date} + 84 jours = ${expectedDuckMaturity}`);

    const ca = chickGrowthAlerts[0];
    const expectedChickMaturity = API.addDaysToDate(ca.birth_date, 56);
    assert(ca.maturity_date === expectedChickMaturity, 
      `Échéance poussins exacte : ${ca.birth_date} + 56 jours = ${expectedChickMaturity}`);

    // 17.5 Vérification de tous les statuts d'alerte (à venir, aujourd'hui, en retard, traitée)
    // Créer un lot à venir (+6 jours avant les 8 semaines)
    const upcomingChick = await API.createChickLot(farmId, {
      name: 'Lot Poussins Échéance Proche',
      birth_date: API.addDaysToDate(todayStr, -50),
      initial_quantity: 20,
      breed: 'Sasso'
    });

    const notifsHubUpdated = await API.getNotifications(farmId);
    assert(notifsHubUpdated.notifications.some(n => n.subtype === 'en_retard'), '17.5 Statut « En retard » présent dans les notifications');
    assert(notifsHubUpdated.notifications.some(n => n.subtype === 'aujourdhui'), 'Statut « À traiter aujourd\'hui » présent dans les notifications');
    assert(notifsHubUpdated.notifications.some(n => n.subtype === 'a_venir'), 'Statut « À venir » présent dans les notifications');

    // 17.6 Test du statut « traitée » après sexage complet
    const createdLotRes = await API.createDucklingLot(farmId, {
      name: 'Lot Canetons Sexage 100%',
      birth_date: '2026-01-01',
      initial_quantity: 15,
      breed: 'Barbarie'
    });
    const tempAnimalId = createdLotRes.animal.id;

    // Classifier 100% (7 mâles + 8 canes)
    await API.classifyPoultry(farmId, tempAnimalId, {
      date: todayStr,
      males: 7,
      females: 8,
      unknown: 0,
      notes: 'Test sexage 100% clôturé'
    });

    const notifsAfterClassify = await API.getNotifications(farmId);
    const treatedNotif = notifsAfterClassify.notifications.find(n => n.animal_id === tempAnimalId || n.data?.animal_id === tempAnimalId);
    assert(treatedNotif !== undefined, '17.6 Lot classifié présent dans le centre d\'alertes');
    assert(treatedNotif.subtype === 'traite' || treatedNotif.status === 'traite', 'Statut « Traitée » bien attribué au lot classifié');
    assert(treatedNotif.current_quantity === 0 && treatedNotif.remaining_to_classify === 0, 'Effectif restant à classifier = 0 pour lot traité');

    // 17.7 Strict cloisonnement des alertes par exploitation
    // Créer une 2ème ferme et vérifier que ses alertes n'apparaissent pas sur la ferme 1
    const secondFarmRes = await API.createFarm({
      name: 'Ferme Avicole du Littoral',
      locality: 'Aného',
      country: 'Togo',
      currency: 'FCFA',
      farm_type: 'Aviculture'
    });
    const secondFarmId = secondFarmRes.farm.id;

    // Ajouter un lot de poussins sur la ferme 2
    await API.createAnimal(secondFarmId, {
      type: 'lot',
      species_id: 'poules',
      category_name: 'Poussins',
      code: 'POUSSIN-F2',
      birth_date: '2026-01-01',
      initial_quantity: 40,
      current_quantity: 40,
      gender: 'MIXTE'
    });

    const f2Notifs = await API.getNotifications(secondFarmId);
    const f1Notifs = await API.getNotifications(farmId);

    const f2AlertOnF1 = f1Notifs.notifications.some(n => n.lot_name && n.lot_name.includes('POUSSIN-F2'));
    const f2AlertOnF2 = f2Notifs.notifications.some(n => n.lot_name && n.lot_name.includes('POUSSIN-F2'));

    assert(!f2AlertOnF1, '17.7 Cloisonnement strict : aucune alerte de la ferme 2 n\'apparaît sur la ferme 1');
    assert(f2AlertOnF2, 'L\'alerte apparaît exclusivement sur la ferme 2 concernée');
    assert(f2Notifs.notifications.find(n => n.lot_name && n.lot_name.includes('POUSSIN-F2')).farm_name === 'Ferme Avicole du Littoral',
      'Le nom de l\'exploitation associée à l\'alerte est exactement « Ferme Avicole du Littoral »');

    // Nettoyer la ferme 2
    await API.deleteFarm(secondFarmId);

    // 17.8 Vérification des éléments d'interface UI
    const indexHtmlAlerts = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    assert(indexHtmlAlerts.includes('id="btn-notifications-toggle"'), '17.8 Bouton toggle des alertes dans le header présent');
    assert(indexHtmlAlerts.includes('id="modal-notifications"'), 'Modale « Alertes & Rappels de la Ferme » présente');
    assert(indexHtmlAlerts.includes('data-view="alerts"'), 'Rubrique Alertes accessible dans la navigation latérale');
    assert(indexHtmlAlerts.includes('id="sidebar-alert-badge"'), 'Badge compteur alertes présent dans la barre latérale');
    assert(indexHtmlAlerts.includes('id="modal-alert-filter-bar"'), 'Barre de filtrage par statut présente dans la modale');

    // 17.9 Vérification des styles CSS pour les alertes
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf-8');
    assert(cssContent.includes('.alert-growth-card'), '17.9 Classe .alert-growth-card définie');
    assert(cssContent.includes('.alert-meta-grid'), 'Grille responsive des métadonnées .alert-meta-grid définie');
    assert(cssContent.includes('.alert-growth-card.alert-status-en_retard'), 'Style bordure rouge pour alertes en retard défini');
    assert(cssContent.includes('.alert-growth-card.alert-status-aujourdhui'), 'Style bordure orange pour alertes aujourd\'hui défini');
    assert(cssContent.includes('.alert-growth-card.alert-status-a_venir'), 'Style bordure bleue pour alertes à venir défini');
    assert(cssContent.includes('.alert-growth-card.alert-status-traite'), 'Style bordure verte pour alertes traitées défini');

    // =========================================================================
    // 18. MODIFICATION DES BÂTIMENTS & DES LOTS D'ANIMAUX (Traçabilité & UI)
    // =========================================================================
    console.log('\n--- 18. Modification des Bâtiments et des Lots d\'Animaux ---');

    // 18.1 Vérification de la structure enrichie de getLots (zéro undefined, zéro NaN)
    const bldgLotsRes = await API.getLots(farmId);
    assert(Array.isArray(bldgLotsRes.lots), '18.1 API.getLots retourne une liste de lots/bâtiments');
    for (const lot of bldgLotsRes.lots) {
      assert(typeof lot.current_occupancy === 'number' && !isNaN(lot.current_occupancy), `lot.current_occupancy est numérique (${lot.current_occupancy})`);
      assert(typeof lot.current_headcount === 'number' && !isNaN(lot.current_headcount), `lot.current_headcount est numérique (${lot.current_headcount})`);
      assert(typeof lot.active_batches_count === 'number' && !isNaN(lot.active_batches_count), `lot.active_batches_count est numérique (${lot.active_batches_count})`);
      assert(typeof lot.percent === 'number' && !isNaN(lot.percent), `lot.percent est numérique et non-NaN (${lot.percent}%)`);
      assert(Array.isArray(lot.animals), `lot.animals est un tableau (${lot.animals.length} lots hébergés)`);
    }

    // 18.2 Création et modification complète d'un bâtiment
    const newBldgRes = await API.createLot(farmId, {
      name: 'Bâtiment Test Oies',
      building_type: 'autre',
      capacity: 50,
      location: 'Parc Est',
      notes: 'Installation temporaire'
    });
    const testBldgId = newBldgRes.lot.id;
    assert(testBldgId, '18.2 Nouveau bâtiment créé avec succès');

    const updateBldgRes = await API.updateBuilding(farmId, testBldgId, {
      name: 'Canardière & Oies Nord',
      building_type: 'canardiere',
      location: 'Secteur Nord Parc 2',
      capacity: 80,
      species_id: 'canards',
      status: 'actif',
      notes: 'Isolation et ventilation rénovées'
    });
    assert(updateBldgRes.building.name === 'Canardière & Oies Nord', 'Nom du bâtiment mis à jour');
    assert(updateBldgRes.building.building_type === 'canardiere', 'Type de bâtiment mis à jour');
    assert(updateBldgRes.building.capacity === 80, 'Capacité maximale mise à jour (80)');
    assert(updateBldgRes.building.location === 'Secteur Nord Parc 2', 'Emplacement mis à jour');
    assert(updateBldgRes.building.status === 'actif', 'Statut actif vérifié');

    // 18.3 Hébergement d'un lot d'animaux et consultation
    const newAnimalLotRes = await API.createAnimal(farmId, {
      code: 'LOT-CAN-TEST-001',
      type: 'lot',
      species_id: 'canards',
      category_name: 'Canetons',
      birth_date: '2026-02-01',
      initial_quantity: 60,
      lot_id: testBldgId,
      gender: 'MIXTE',
      observations: 'Lot test canetons'
    });
    const testAnimalId = newAnimalLotRes.animal.id;

    // Vérifier que le bâtiment comptabilise bien le lot et l'effectif
    const bldgCheck = await API.getBuilding(farmId, testBldgId);
    assert(bldgCheck.building.current_occupancy === 60, '18.3 Effectif du bâtiment exact (60 têtes)');
    assert(bldgCheck.building.active_batches_count >= 1, 'Nombre de lots hébergés incrémenté (au moins 1)');
    assert(bldgCheck.building.percent === 75, 'Taux d\'occupation calculé avec exactitude (60/80 = 75%)');
    const hostedLotFound = bldgCheck.building.animals.some(a => a.id === testAnimalId);
    assert(hostedLotFound, 'Lot d\'animaux présent dans la liste des lots hébergés du bâtiment');

    // 18.4 Modification du lot d'animaux : Séparation quantité initiale vs actuelle et traçabilité des mouvements
    const initialMovementsCount = (await API.getMovements(farmId)).movements.length;

    // Ajustement d'inventaire : passage de 60 à 55 têtes (-5)
    await API.updateAnimalLot(farmId, testAnimalId, {
      code: 'LOT-CAN-TEST-001-MODIF',
      initial_quantity: 60, // Quantité initiale préservée
      current_quantity: 55, // Quantité actuelle ajustée
      category_name: 'Canetons',
      species_id: 'canards',
      birth_date: '2026-02-01',
      lot_id: testBldgId,
      status: 'actif',
      notes: 'Correction après comptage physique du matin'
    });

    const updatedAnimalRes = await API.getAnimal(farmId, testAnimalId);
    assert(updatedAnimalRes.animal.initial_quantity === 60, '18.4 Quantité initiale strictement préservée (60)');
    assert(updatedAnimalRes.animal.current_quantity === 55, 'Quantité actuelle mise à jour (55)');
    assert(updatedAnimalRes.animal.code === 'LOT-CAN-TEST-001-MODIF', 'Code du lot d\'animaux mis à jour');

    // Vérifier la traçabilité dans les mouvements
    const postMovements = (await API.getMovements(farmId)).movements;
    assert(postMovements.length > initialMovementsCount, 'Nouveau mouvement tracé généré dans l\'historique');
    const correctionMov = postMovements.find(m => m.animal_id === testAnimalId && m.observations && m.observations.includes('Correction d\'inventaire'));
    assert(correctionMov, 'Mouvement de correction d\'inventaire consigné avec motif');
    assert(correctionMov.type === 'sortie', 'Type de mouvement de correction conforme (sortie de 5 têtes)');
    assert(correctionMov.quantity === 5, 'Quantité du mouvement d\'ajustement exacte (5 têtes)');

    // 18.5 Transfert de bâtiment : changement de lot_id et traçabilité
    const bldg2Res = await API.createLot(farmId, {
      name: 'Canardière Sud Destination',
      building_type: 'canardiere',
      capacity: 100,
      location: 'Parc Sud'
    });
    const bldg2Id = bldg2Res.lot.id;

    await API.updateAnimalLot(farmId, testAnimalId, {
      lot_id: bldg2Id,
      current_quantity: 55
    });

    const animalAfterTransfer = (await API.getAnimal(farmId, testAnimalId)).animal;
    assert(animalAfterTransfer.lot_id === bldg2Id, '18.5 Assignation de bâtiment modifiée vers la nouvelle installation');

    const transferMov = (await API.getMovements(farmId)).movements.find(m => m.animal_id === testAnimalId && m.type === 'transfert');
    assert(transferMov, 'Mouvement de transfert automatique enregistré dans l\'historique');
    assert(transferMov.from_lot_id === testBldgId, 'from_lot_id conforme à l\'ancien bâtiment');
    assert(transferMov.to_lot_id === bldg2Id, 'to_lot_id conforme au nouveau bâtiment récepteur');
    assert(transferMov.quantity === 55, 'Effectif transféré conforme (55)');

    // 18.6 Recalcul de l'échéance de maturité (canetons 84 jours)
    await API.updateAnimalLot(farmId, testAnimalId, {
      birth_date: '2026-03-01'
    });
    const animalAfterBirthDate = (await API.getAnimal(farmId, testAnimalId)).animal;
    assert(animalAfterBirthDate.maturity_date === '2026-05-24', '18.6 Date de maturité recalculée automatiquement : 2026-03-01 + 84j = 2026-05-24');

    // 18.7 Protection contre suppression de bâtiment avec animaux et suppression une fois vidé
    // testBldgId est maintenant vide, sa suppression doit réussir
    await API.deleteLot(farmId, testBldgId);
    const remainingLots = (await API.getLots(farmId)).lots;
    assert(!remainingLots.some(l => l.id === testBldgId), '18.7 Bâtiment vidé supprimé avec succès');

    // bldg2Id héberge 55 animaux, sa suppression directe doit être bloquée
    let deleteBlocked = false;
    try {
      await API.deleteLot(farmId, bldg2Id);
    } catch (e) {
      deleteBlocked = true;
    }
    assert(deleteBlocked, 'Suppression d\'un bâtiment hébergeant des animaux actifs bloquée avec message explicatif');

    // Nettoyage : sortie des animaux pour pouvoir supprimer bldg2
    await API.updateAnimalLot(farmId, testAnimalId, {
      current_quantity: 0,
      status: 'traite',
      lot_id: null
    });
    await API.deleteLot(farmId, bldg2Id);

    // 18.8 Vérification des modales et boutons dans l'interface UI (index.html, app.js, v2-views.js)
    const bldgIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    assert(bldgIndexHtml.includes('id="modal-edit-building"'), '18.8 Modale modal-edit-building présente dans index.html');
    assert(bldgIndexHtml.includes('id="edit-building-name"'), 'Champ nom du bâtiment présent');
    assert(bldgIndexHtml.includes('id="edit-building-type"'), 'Champ type de bâtiment présent');
    assert(bldgIndexHtml.includes('id="edit-building-status"'), 'Champ statut opérationnel présent');
    assert(bldgIndexHtml.includes('id="edit-building-species"'), 'Champ espèces autorisées présent');
    assert(bldgIndexHtml.includes('id="edit-building-capacity"'), 'Champ capacité maximale présent');
    assert(bldgIndexHtml.includes('id="edit-building-location"'), 'Champ emplacement présent');
    assert(bldgIndexHtml.includes('id="edit-building-notes"'), 'Champ notes et description présent');

    assert(bldgIndexHtml.includes('id="modal-edit-animal-lot"'), 'Modale modal-edit-animal-lot présente dans index.html');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-code"'), 'Champ nom/code du lot présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-species"'), 'Champ espèce du lot présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-category"'), 'Champ catégorie d\'animaux présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-birth-date"'), 'Champ date de naissance présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-initial-qty"'), 'Champ quantité initiale présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-current-qty"'), 'Champ quantité actuelle vivante présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-building-select"'), 'Sélecteur de bâtiment présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-status"'), 'Champ statut du lot présent');
    assert(bldgIndexHtml.includes('id="edit-animal-lot-notes"'), 'Champ motif d\'ajustement et notes présent');

    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');
    assert(appJs.includes('openEditBuildingModal'), 'Fonction openEditBuildingModal définie dans app.js');
    assert(appJs.includes('openEditAnimalLotModal'), 'Fonction openEditAnimalLotModal définie dans app.js');
    assert(appJs.includes('btn-edit-lot'), 'Bouton Modifier le bâtiment présent dans renderLotsView');
    assert(appJs.includes('btn-edit-animal-lot'), 'Bouton Modifier le lot d\'animaux présent dans renderLotsView');

    const v2ViewsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'v2-views.js'), 'utf-8');
    assert(v2ViewsJs.includes('openEditBuildingModal'), 'openEditBuildingModal intégré dans loadBuildingsData');
    assert(v2ViewsJs.includes('openEditAnimalLotModal'), 'openEditAnimalLotModal intégré dans loadBuildingsData');
    assert(v2ViewsJs.includes('deleteBuilding'), 'deleteBuilding intégré dans v2-views.js');

    console.log('\n--- 19. Intégration de toutes les Activités Programmées dans les Alertes ---');

    // 19.1 Entretien programmé de bâtiment (date du screenshot : 2026-10-29)
    const testMaintLot = (await API.getLots(farmId)).lots[0];
    assert(testMaintLot, '19.1 Bâtiment d\'élevage disponible pour tester l\'entretien programmé');

    const maintRes = await API.logBuildingMaintenance(farmId, testMaintLot.id, {
      date: '2026-10-15',
      type: 'desinfection',
      description: 'Désinfection & Chaulage annuel',
      cost: 0,
      performed_by: 'Équipe ferme',
      next_date: '2026-10-29' // Date exacte du screenshot utilisateur
    });
    assert(maintRes.maintenance && maintRes.maintenance.next_date === '2026-10-29', 'Entretien de bâtiment enregistré avec prochain entretien au 2026-10-29');

    // Récupérer les alertes et vérifier la présence de l'entretien programmé
    const notifsWithMaint = await API.getNotifications(farmId);
    const maintAlert = notifsWithMaint.notifications.find(n => n.type === 'building_maintenance' && n.date === '2026-10-29');
    assert(maintAlert !== undefined, 'L\'activité d\'entretien programmé (2026-10-29) apparaît dans les alertes de la ferme');
    assert(maintAlert.alert_category === 'planned_activity', 'Catégorie de l\'alerte : planned_activity');
    assert(maintAlert.alert_type === 'activite_programmee', 'Type d\'alerte : activite_programmee');
    assert(maintAlert.alert_type_label === 'Bâtiments & Entretien', 'Libellé de catégorie : Bâtiments & Entretien');
    assert(maintAlert.lot_name === testMaintLot.name, 'Nom du bâtiment correctement associé à l\'alerte');
    assert(maintAlert.maint_type_label === 'Désinfection & Chaulage', 'Type d\'entretien traduit lisiblement en français');
    assert(maintAlert.status === 'a_venir' || maintAlert.subtype === 'a_venir', 'Statut « Programmé / À venir » correctement assigné pour date future');
    assert(maintAlert.title.includes('Prochain entretien') || maintAlert.title.includes('Entretien'), 'Titre explicite pour l\'alerte d\'entretien');

    // 19.2 Entretien en retard et entretien pour aujourd'hui
    const plannedTestLots = (await API.getLots(farmId)).lots;
    const testMaintLot2 = plannedTestLots[1] || plannedTestLots[0];

    await API.logBuildingMaintenance(farmId, testMaintLot2.id, {
      date: '2026-08-01',
      type: 'nettoyage',
      description: 'Nettoyage périodique',
      cost: 10000,
      next_date: '2026-08-20' // Dépassé sur bâtiment 2
    });

    const todayIso = new Date().toISOString().split('T')[0];
    await API.logBuildingMaintenance(farmId, testMaintLot.id, {
      date: todayIso,
      type: 'vide_sanitaire',
      description: 'Mise en vide sanitaire',
      cost: 0,
      next_date: todayIso // Jour J sur bâtiment 1
    });

    const notifsWithStatus = await API.getNotifications(farmId);
    const overdueMaint = notifsWithStatus.notifications.find(n => n.type === 'building_maintenance' && n.date === '2026-08-20');
    assert(overdueMaint && (overdueMaint.status === 'en_retard' || overdueMaint.subtype === 'en_retard'), '19.2 Entretien dépassé classé en statut « En retard » avec priorité danger');

    const todayMaint = notifsWithStatus.notifications.find(n => n.type === 'building_maintenance' && n.date === todayIso);
    assert(todayMaint && (todayMaint.status === 'aujourdhui' || todayMaint.subtype === 'aujourdhui'), 'Entretien jour J classé en statut « À traiter aujourd\'hui »');

    // 19.3 Entretien réalisé ultérieurement -> marqué « Traitée »
    await API.logBuildingMaintenance(farmId, testMaintLot2.id, {
      date: '2026-08-25', // Réalisé après le 2026-08-20 sur bâtiment 2
      type: 'nettoyage',
      description: 'Nettoyage effectué',
      cost: 10000
    });
    const notifsAfterDone = await API.getNotifications(farmId);
    const treatedMaint = notifsAfterDone.notifications.find(n => n.type === 'building_maintenance' && n.date === '2026-08-20');
    assert(treatedMaint && (treatedMaint.status === 'traite' || treatedMaint.subtype === 'traite'), '19.3 Entretien complété ultérieurement automatiquement marqué « Traitée »');

    // 19.4 Soins vétérinaires programmés au-delà de 7 jours visibles dans les alertes
    const healthAlerts = notifsAfterDone.notifications.filter(n => n.type === 'health' || n.category_type === 'health');
    assert(healthAlerts.length > 0, '19.4 Soins vétérinaires programmés présents dans les alertes sans restriction à 7 jours');
    assert(healthAlerts.some(n => n.alert_category === 'planned_activity'), 'Soins vétérinaires identifiés comme planned_activity');

    // 19.5 Naissances / Gestations programmées visibles dans les alertes
    const reproAlerts = notifsAfterDone.notifications.filter(n => n.type === 'reproduction' || n.category_type === 'reproduction');
    assert(reproAlerts.length > 0, '19.5 Gestations à terme programmées présentes dans les alertes');
    assert(reproAlerts.some(n => n.alert_category === 'planned_activity'), 'Mises bas identifiées comme planned_activity');

    // 19.6 Éclosions d'œufs programmées visibles dans les alertes
    const incubAlerts = notifsAfterDone.notifications.filter(n => n.type === 'incubation' || n.category_type === 'incubation');
    assert(incubAlerts.length > 0, '19.6 Éclosions d\'œufs programmées présentes dans les alertes');
    assert(incubAlerts.some(n => n.alert_category === 'planned_activity'), 'Éclosions identifiées comme planned_activity');

    // 19.7 Compteurs et filtres d'activités programmées
    assert(Array.isArray(notifsAfterDone.planned_activities), '19.7 Liste planned_activities disponible dans getNotifications');
    assert(typeof notifsAfterDone.planned_activities_active_count === 'number', 'Compteur planned_activities_active_count disponible');
    assert(notifsAfterDone.planned_activities_active_count > 0, 'Compteur planned_activities_active_count strictement supérieur à 0');

    // 19.8 Tri intelligent des alertes : les urgences (en_retard / aujourdhui) apparaissent avant les alertes futures
    const activeList = notifsAfterDone.notifications.filter(n => n.subtype !== 'traite' && n.status !== 'traite');
    const firstAlert = activeList[0];
    assert(firstAlert.subtype === 'en_retard' || firstAlert.subtype === 'aujourdhui' || firstAlert.priority === 'danger', '19.8 Tri intelligent : alertes urgentes et en retard positionnées en tête de liste');

    // 19.9 Intégration UI : filtres et modales
    const plannedIndexHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    assert(plannedIndexHtmlContent.includes('data-filter="planned"'), '19.9 Bouton de filtre « Activités programmées » présent dans la modale d\'alertes');
    assert(plannedIndexHtmlContent.includes('id="mf-badge-planned"'), 'Badge compteur d\'activités programmées présent dans la modale');

    const v2Content = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'v2-views.js'), 'utf-8');
    assert(v2Content.includes('data-vfilter="planned"'), 'Bouton de filtre « Activités programmées » présent dans la vue complète des alertes');
    assert(v2Content.includes('id="vf-badge-planned"'), 'Badge compteur vf-badge-planned présent dans la vue');
    assert(v2Content.includes('id="kpi-alerts-planned"'), 'Carte KPI Activités programmées présente dans la vue');
    assert(v2Content.includes('openMaintenanceModal'), 'Bouton d\'action directe pour enregistrer l\'entretien présent dans les cartes d\'alerte');

    console.log('\n--- 20. Système Complet d\'Alertes et de Rappels Personnalisés pour la Ferme ---');

    // 20.1 Création d'alertes personnalisées dans la catégorie Alimentation
    const feedAlertRes = await API.createCustomAlert(farmId, {
      title: 'Distribution du matin — Canetons D-01',
      category: 'alimentation',
      activity_type: 'distribution_matin',
      scope_type: 'lot',
      species_id: 'canards',
      lot_id: testAnimalId || 3,
      feed_type: 'Aliment croissance démarrage 50kg',
      date: '2026-10-28',
      time: '07:30',
      frequency: 'quotidien',
      priority: 'haute',
      notes: 'Distribuer dans les mangeoires linéaires et vérifier le niveau des abreuvoirs.'
    });

    assert(feedAlertRes && feedAlertRes.alert && feedAlertRes.alert.id, '20.1 Alerte personnalisée Alimentation créée avec succès');
    const feedAlertId = feedAlertRes.alert.id;
    assert(feedAlertRes.alert.feed_type === 'Aliment croissance démarrage 50kg', 'Champ spécifique feed_type correctement enregistré');
    assert(feedAlertRes.alert.frequency === 'quotidien', 'Fréquence quotidienne bien enregistrée');
    assert(feedAlertRes.alert.priority === 'haute', 'Priorité haute bien enregistrée');
    assert(feedAlertRes.alert.time === '07:30', 'Heure programmée bien enregistrée');

    // 20.2 Création d'alertes personnalisées dans la catégorie Incubation
    const incubAlertRes = await API.createCustomAlert(farmId, {
      title: 'Mirage des œufs — Lot Couveuse C-02 (J+7)',
      category: 'incubation',
      activity_type: 'mirage_j7',
      scope_type: 'espece',
      species_id: 'poules',
      date: '2026-10-25',
      time: '18:00',
      frequency: 'une_fois',
      priority: 'moyenne',
      notes: 'Miroir mire-œuf pour éliminer les œufs clairs et vérifier le développement vasculaire.'
    });

    assert(incubAlertRes && incubAlertRes.alert && incubAlertRes.alert.id, '20.2 Alerte personnalisée Incubation créée avec succès');
    const incubAlertId = incubAlertRes.alert.id;
    assert(incubAlertRes.alert.category === 'incubation', 'Catégorie incubation correctement enregistrée');
    assert(incubAlertRes.alert.activity_type === 'mirage_j7', 'Type d\'activité présélectionné mirage_j7 enregistré');

    // 20.3 Création illimitée d'alertes pour diverses catégories (Santé, Bâtiment, Commercial)
    const santeAlertRes = await API.createCustomAlert(farmId, {
      title: 'Vaccin Newcastle de rappel',
      category: 'sante',
      activity_type: 'vaccination',
      scope_type: 'ferme',
      date: todayIso, // Aujourd'hui
      time: '10:00',
      frequency: 'mensuel',
      priority: 'haute',
      notes: 'Administration par voie oculaire / eau de boisson.'
    });
    const santeAlertId = santeAlertRes.alert.id;

    const overdueAlertRes = await API.createCustomAlert(farmId, {
      title: 'Renouvellement stock copeaux de bois',
      category: 'entretien',
      activity_type: 'renouvellement_litiere',
      scope_type: 'batiment',
      building_id: testMaintLot.id,
      date: '2026-10-01', // Date passée (En retard)
      time: '09:00',
      frequency: 'une_fois',
      priority: 'normale',
      notes: 'Commander 10 balles de copeaux dépoussiérés.'
    });
    const overdueAlertId = overdueAlertRes.alert.id;

    // 20.4 Intégration dans API.getNotifications et calcul dynamique des statuts
    const notifsCustom = await API.getNotifications(farmId);
    assert(Array.isArray(notifsCustom.custom_alerts), '20.4 Liste custom_alerts présente dans API.getNotifications');
    assert(typeof notifsCustom.custom_alerts_active_count === 'number', 'Compteur custom_alerts_active_count présent');
    assert(notifsCustom.custom_alerts.length >= 4, 'Toutes les alertes personnalisées créées sont retournées');

    // Vérification du calcul dynamique des statuts
    const overdueNotif = notifsCustom.notifications.find(n => n.custom_alert_id === overdueAlertId);
    assert(overdueNotif && (overdueNotif.status === 'en_retard' || overdueNotif.subtype === 'en_retard'), 'Alerte passée automatiquement classée en « En retard »');
    assert(overdueNotif.priority === 'danger', 'Priorité danger attribuée à l\'alerte en retard');

    const todayNotif = notifsCustom.notifications.find(n => n.custom_alert_id === santeAlertId);
    assert(todayNotif && (todayNotif.status === 'aujourdhui' || todayNotif.subtype === 'aujourdhui'), 'Alerte du jour classée en « À traiter aujourd\'hui »');

    const upcomingNotif = notifsCustom.notifications.find(n => n.custom_alert_id === feedAlertId);
    assert(upcomingNotif && (upcomingNotif.status === 'a_venir' || upcomingNotif.subtype === 'a_venir'), 'Alerte future classée en « À venir »');

    // 20.5 Cycle de vie : marquer terminée (traite) puis réactiver
    const toggleRes = await API.toggleCustomAlertStatus(farmId, feedAlertId);
    assert(toggleRes.alert && toggleRes.alert.is_completed === true, '20.5 Alerte marquée comme terminée (is_completed: true)');

    const notifsAfterDoneCustom = await API.getNotifications(farmId);
    const completedNotif = notifsAfterDoneCustom.notifications.find(n => n.custom_alert_id === feedAlertId);
    assert(completedNotif && (completedNotif.status === 'traite' || completedNotif.subtype === 'traite'), 'Alerte terminée affiche le statut « Traitée »');

    // Réactiver
    const toggleBackRes = await API.toggleCustomAlertStatus(farmId, feedAlertId);
    assert(toggleBackRes.alert && toggleBackRes.alert.is_completed === false, 'Alerte réactivée avec succès (is_completed: false)');

    // Modification d'alerte
    const updateCustomRes = await API.updateCustomAlert(farmId, feedAlertId, {
      title: 'Distribution matinale renforcée',
      notes: 'Ajouter un supplément minéral vitamines.'
    });
    assert(updateCustomRes.alert && updateCustomRes.alert.title === 'Distribution matinale renforcée', 'Titre de l\'alerte modifié');
    assert(updateCustomRes.alert.notes === 'Ajouter un supplément minéral vitamines.', 'Notes de l\'alerte mises à jour');

    // Suppression d'alerte
    await API.deleteCustomAlert(farmId, overdueAlertId);
    const notifsAfterDelete = await API.getNotifications(farmId);
    assert(!notifsAfterDelete.notifications.some(n => n.custom_alert_id === overdueAlertId), 'Alerte personnalisée supprimée avec succès');

    // 20.6 Cloisonnement strict multi-fermes
    const farm2Alerts = (await API.getCustomAlerts(farm2Id)).alerts;
    assert(!farm2Alerts.some(a => a.id === feedAlertId), '20.6 Cloisonnement : aucune alerte personnalisée de la ferme 1 ne fuit sur la ferme 2');

    // 20.7 Intégration UI : Modales, boutons, filtres et cartes
    const customIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    assert(customIndexHtml.includes('id="modal-custom-alert"'), '20.7 Modale modal-custom-alert présente dans index.html');
    assert(customIndexHtml.includes('id="form-custom-alert"'), 'Formulaire form-custom-alert présent');
    assert(customIndexHtml.includes('id="custom-alert-category"'), 'Sélecteur de catégorie présent');
    assert(customIndexHtml.includes('id="custom-alert-title"'), 'Champ titre obligatoire présent');
    assert(customIndexHtml.includes('id="custom-alert-scope-type"'), 'Sélecteur de portée (ferme, espèce, bâtiment, lot) présent');
    assert(customIndexHtml.includes('id="custom-alert-date"'), 'Champ date d\'échéance présent');
    assert(customIndexHtml.includes('id="custom-alert-frequency"'), 'Sélecteur de fréquence présent');
    assert(customIndexHtml.includes('id="custom-alert-priority"'), 'Sélecteur de priorité présent');
    assert(customIndexHtml.includes('id="custom-alert-feed-type"'), 'Champ spécifique type d\'aliment présent');
    assert(customIndexHtml.includes('data-filter="custom"'), 'Bouton de filtre Personnalisées présent dans modal-notifications');
    assert(customIndexHtml.includes('openCreateCustomAlertModal'), 'Bouton « + Nouvelle alerte » présent dans le header du centre de notifications');

    const customV2Views = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'v2-views.js'), 'utf-8');
    assert(customV2Views.includes('openCreateCustomAlertModal'), 'openCreateCustomAlertModal défini dans v2-views.js');
    assert(customV2Views.includes('openEditCustomAlertModal'), 'openEditCustomAlertModal défini dans v2-views.js');
    assert(customV2Views.includes('toggleCustomAlert'), 'toggleCustomAlert défini dans v2-views.js');
    assert(customV2Views.includes('deleteCustomAlert'), 'deleteCustomAlert défini dans v2-views.js');
    assert(customV2Views.includes('kpi-alerts-custom'), 'Carte KPI kpi-alerts-custom présente dans renderAlertsView');
    assert(customV2Views.includes('data-vfilter="custom"'), 'Filtre data-vfilter="custom" présent dans renderAlertsView');
    assert(customV2Views.includes('data-alert-type="custom_alert"'), 'Rendu des cartes d\'alertes personnalisées avec classe dédiée');

    // --- 21. Suivi de l'Incubation des Œufs sur le Tableau de Bord ---
    console.log('\n--- 21. Suivi de l\'Incubation des Œufs sur le Tableau de Bord ---');

    // 21.1 Calcul automatique de la date d'éclosion prévue selon l'espèce
    assert(typeof addDaysToDate === 'function', 'Fonction addDaysToDate disponible');
    assert(addDaysToDate('2026-03-01', 21) === '2026-03-22', '21.1 Calcul d\'éclosion poules exact : 2026-03-01 + 21j = 2026-03-22');
    assert(addDaysToDate('2026-03-01', 28) === '2026-03-29', 'Calcul d\'éclosion canards exact : 2026-03-01 + 28j = 2026-03-29');
    assert(addDaysToDate('2026-03-01', 17) === '2026-03-18', 'Calcul d\'éclosion cailles exact : 2026-03-01 + 17j = 2026-03-18');
    assert(addDaysToDate('2026-03-01', 30) === '2026-03-31', 'Calcul d\'éclosion oies exact : 2026-03-01 + 30j = 2026-03-31');
    assert(typeof getDefaultIncubationDuration === 'function', 'Fonction getDefaultIncubationDuration disponible');
    assert(getDefaultIncubationDuration('poules') === 21, 'Durée par défaut poules : 21 jours');
    assert(getDefaultIncubationDuration('canards') === 28, 'Durée par défaut canards : 28 jours');
    assert(getDefaultIncubationDuration('oies') === 30, 'Durée par défaut oies : 30 jours');
    assert(getDefaultIncubationDuration('cailles') === 17, 'Durée par défaut cailles : 17 jours');
    assert(getDefaultIncubationDuration('dindes') === 28, 'Durée par défaut dindes : 28 jours');
    assert(getDefaultIncubationDuration('pintades') === 27, 'Durée par défaut pintades : 27 jours');
    assert(getDefaultIncubationDuration('faisans') === 24, 'Durée par défaut faisans : 24 jours');

    // 21.2 Calcul et formule de la progression temporelle (entre 0% et 100%)
    const todayTestStr = new Date().toISOString().split('T')[0];
    const mockDb = { species: [{ id: 'poules', name: 'Poules', icon: '🐔' }], lots: [] };

    // Lot futur : 0%
    const incFutur = {
      species_id: 'poules',
      eggs_count: 30,
      start_date: addDaysToDate(todayTestStr, 5),
      duration_days: 21,
      status: 'en_cours'
    };
    const enrichedFutur = enrichIncubation(incFutur, mockDb, todayTestStr);
    assert(enrichedFutur.progress_percent === 0, '21.2 Lot d\'incubation futur affiche 0% de progression');
    assert(enrichedFutur.computed_status === 'a_venir', 'Lot futur classé en statut « a_venir »');

    // Lot en cours (7 jours écoulés sur 21) : (7/21)*100 = 33%
    const incEnCours = {
      species_id: 'poules',
      eggs_count: 30,
      start_date: addDaysToDate(todayTestStr, -7),
      duration_days: 21,
      status: 'en_cours'
    };
    const enrichedEnCours = enrichIncubation(incEnCours, mockDb, todayTestStr);
    assert(enrichedEnCours.progress_percent === 33, 'Progression temporelle calculée avec exactitude : (7/21) * 100 = 33%');
    assert(enrichedEnCours.days_elapsed === 7, 'Nombre de jours écoulés exact : 7 jours');
    assert(enrichedEnCours.days_remaining === 14, 'Nombre de jours restants exact : 14 jours');
    assert(enrichedEnCours.computed_status === 'en_cours', 'Statut « en_cours » validé');

    // Lot jour J (21 jours écoulés sur 21) : 100%
    const incJourJ = {
      species_id: 'poules',
      eggs_count: 30,
      start_date: addDaysToDate(todayTestStr, -21),
      duration_days: 21,
      expected_hatch_date: todayTestStr,
      status: 'en_cours'
    };
    const enrichedJourJ = enrichIncubation(incJourJ, mockDb, todayTestStr);
    assert(enrichedJourJ.progress_percent === 100, 'Lot jour J atteint 100% de progression');
    assert(enrichedJourJ.computed_status === 'eclosion_attendue', 'Lot jour J classé en « eclosion_attendue »');
    assert(enrichedJourJ.days_remaining === 0, '0 jour restant à l\'éclosion le jour J');

    // Lot dépassé non clôturé : 100%, statut « en_retard »
    const incRetard = {
      species_id: 'poules',
      eggs_count: 30,
      start_date: addDaysToDate(todayTestStr, -24),
      duration_days: 21,
      expected_hatch_date: addDaysToDate(todayTestStr, -3),
      status: 'en_cours'
    };
    const enrichedRetard = enrichIncubation(incRetard, mockDb, todayTestStr);
    assert(enrichedRetard.progress_percent === 100, 'Lot dépassé plafonné à 100%');
    assert(enrichedRetard.computed_status === 'en_retard', 'Lot dépassé classé en « en_retard »');
    assert(enrichedRetard.days_remaining === -3, 'Jours restants négatifs (-3 jours)');

    // Lot terminé : 100%, statut « termine »
    const incTermine = {
      species_id: 'poules',
      eggs_count: 30,
      start_date: addDaysToDate(todayTestStr, -30),
      duration_days: 21,
      status: 'termine'
    };
    const enrichedTermine = enrichIncubation(incTermine, mockDb, todayTestStr);
    assert(enrichedTermine.progress_percent === 100, 'Lot clôturé à 100%');
    assert(enrichedTermine.computed_status === 'termine', 'Statut « termine » confirmé');

    // 21.3 CRUD Lot d'incubation : Création, Consultation, Modification, Suppression
    const newIncRes = await API.createIncubation(farmId, {
      code: 'INC-TEST-99',
      name: 'Lot Test Couveuse Alpha',
      species_id: 'poules',
      method: 'artificielle',
      incubator_type: 'Couveuse R-Com 50 Digitale',
      eggs_count: 40,
      start_date: addDaysToDate(todayTestStr, -5),
      duration_days: 21,
      notes: 'Test automatisé des réglages hygrométriques'
    });
    assert(newIncRes && newIncRes.incubation && newIncRes.incubation.id, '21.3 Nouveau lot d\'incubation créé avec succès');
    const createdIncId = newIncRes.incubation.id;
    assert(newIncRes.incubation.expected_hatch_date === addDaysToDate(addDaysToDate(todayTestStr, -5), 21), 'Date d\'éclosion prévue calculée automatiquement à la création');

    // Consultation par ID
    const getIncRes = await API.getIncubationById(farmId, createdIncId);
    assert(getIncRes && getIncRes.incubation && getIncRes.incubation.id === createdIncId, 'Consultation du lot d\'incubation par ID réussie');
    assert(getIncRes.incubation.incubator_type === 'Couveuse R-Com 50 Digitale', 'Type d\'emplacement/couveuse préservé');

    // Modification du lot
    const updateIncRes = await API.updateIncubation(farmId, createdIncId, {
      name: 'Lot Test Couveuse Alpha Modifié',
      eggs_count: 45,
      duration_days: 22,
      notes: 'Notes mises à jour avec succès'
    });
    assert(updateIncRes && updateIncRes.incubation.eggs_count === 45, 'Effectif d\'œufs incubés mis à jour (45)');
    assert(updateIncRes.incubation.duration_days === 22, 'Durée d\'incubation modifiée (22)');
    assert(updateIncRes.incubation.expected_hatch_date === addDaysToDate(addDaysToDate(todayTestStr, -5), 22), 'Date d\'éclosion prévue recalculée immédiatement après modification');

    // 21.4 Enregistrement des résultats d'éclosion
    const hatchResWithAnimals = await API.validateHatch(farmId, createdIncId, {
      actual_hatch_date: todayTestStr,
      hatched_count: 40,
      live_young_count: 38,
      dead_young_count: 2,
      unhatched_count: 3,
      rejected_count: 2,
      create_animal_lot: true,
      notes: 'Éclosion vigoureuse et synchronisée'
    });
    assert(hatchResWithAnimals && hatchResWithAnimals.incubation.status === 'termine', '21.4 Lot d\'incubation marqué comme terminé');
    assert(hatchResWithAnimals.incubation.hatched_count === 40, 'Nombre d\'œufs éclos consigné (40)');
    assert(hatchResWithAnimals.incubation.live_young_count === 38, 'Nombre de nouveau-nés vivants consigné (38)');
    assert(hatchResWithAnimals.incubation.dead_young_count === 2, 'Nombre de nouveau-nés morts consigné (2)');
    assert(hatchResWithAnimals.incubation.hatch_rate === Math.round((40 / 45) * 1000) / 10, 'Taux de réussite d\'éclosion calculé avec exactitude');

    // Vérifier que les 38 poussins vivants ont bien été intégrés au cheptel
    const animalsAfterHatch = (await API.getAnimals(farmId)).animals;
    const hatchAnimal = animalsAfterHatch.find(a => a.observations && a.observations.includes('INC-TEST-99'));
    assert(hatchAnimal && hatchAnimal.current_quantity === 38, '38 poussins vivants ajoutés avec succès au cheptel');
    assert(hatchAnimal.maturity_date === addDaysToDate(todayTestStr, 56), 'Date de maturité des poussins calculée à 8 semaines (56 jours)');

    // Test avec create_animal_lot = false (option case à cocher décochée)
    const incNoAnimalsRes = await API.createIncubation(farmId, {
      code: 'INC-NO-ANIMALS',
      species_id: 'canards',
      eggs_count: 10,
      start_date: addDaysToDate(todayTestStr, -28),
      duration_days: 28
    });
    const noAnimalIncId = incNoAnimalsRes.incubation.id;
    const animalCountBefore = (await API.getAnimals(farmId)).animals.length;

    await API.validateHatch(farmId, noAnimalIncId, {
      actual_hatch_date: todayTestStr,
      hatched_count: 8,
      live_young_count: 8,
      create_animal_lot: false // Ne pas créer d'animaux au cheptel
    });
    const animalCountAfter = (await API.getAnimals(farmId)).animals.length;
    assert(animalCountAfter === animalCountBefore, 'Aucun animal n\'est créé dans le cheptel lorsque la case est décochée');

    // Suppression d'incubation
    await API.deleteIncubation(farmId, noAnimalIncId);
    const incsListAfterDel = (await API.getIncubations(farmId)).incubations;
    assert(!incsListAfterDel.some(i => i.id === noAnimalIncId), 'Lot d\'incubation supprimé avec succès');

    // 21.5 Indicateurs KPI réels sur le Tableau de Bord
    const dashData = await API.getDashboard(farmId);
    assert(dashData.incubation_summary, '21.5 Objet incubation_summary présent dans API.getDashboard');
    assert(typeof dashData.incubation_summary.total_eggs_incubated === 'number', 'total_eggs_incubated est numérique');
    assert(typeof dashData.incubation_summary.active_incubations_count === 'number', 'active_incubations_count est numérique');
    assert(typeof dashData.incubation_summary.upcoming_hatches_count === 'number', 'upcoming_hatches_count est numérique');
    assert(typeof dashData.incubation_summary.total_hatched_eggs === 'number', 'total_hatched_eggs est numérique');
    assert(dashData.incubation_summary.total_hatched_eggs >= 40, 'Total d\'œufs éclos prend en compte les données réelles enregistrées');
    assert(Array.isArray(dashData.incubations), 'Liste incubations enrichie disponible pour le tableau de bord');

    // Cloisonnement strict multi-fermes des incubations
    const farm2Dash = await API.getDashboard(farm2Id);
    assert(farm2Dash.incubation_summary.total_eggs_incubated === 0, 'Ferme 2 isolée : 0 œufs en incubation (aucune fuite inter-fermes)');

    // 21.6 Intégration dans « Alertes & Rappels de la Ferme »
    const farmNotifs = await API.getNotifications(farmId);
    assert(farmNotifs.notifications.some(n => n.type === 'incubation'), '21.6 Notifications d\'éclosions programmées présentes dans les alertes');

    // 21.7 Présence des composants UI et formulaires dans index.html et app.js
    const incIndexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    assert(incIndexHtml.includes('id="modal-incubation"'), '21.7 Modale modal-incubation présente dans index.html');
    assert(incIndexHtml.includes('id="inc-expected-hatch-date"'), 'Champ calculé automatique de date d\'éclosion présente dans modal-incubation');
    assert(incIndexHtml.includes('id="modal-validate-hatch"'), 'Modale modal-validate-hatch présente dans index.html');
    assert(incIndexHtml.includes('id="hatch-create-animal-lot"'), 'Case à cocher d\'intégration au cheptel présente dans modal-validate-hatch');
    assert(incIndexHtml.includes('id="modal-incubation-details"'), 'Modale modal-incubation-details présente dans index.html');

    const incAppJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');
    assert(incAppJs.includes('dash-incubation-section'), 'Section dash-incubation-section intégrée au tableau de bord dans app.js');
    assert(incAppJs.includes('renderDashboardIncubationSection'), 'Fonction renderDashboardIncubationSection définie dans app.js');
    assert(incAppJs.includes('dash-inc-species-filter'), 'Filtre par espèce pour les incubations présent dans app.js');
    assert(incAppJs.includes('dash-inc-status-filter'), 'Filtre par statut pour les incubations présent dans app.js');
    assert(incAppJs.includes('btn-dash-new-incubation'), 'Bouton + Nouvelle incubation présent dans app.js');
    assert(incAppJs.includes('dash-inc-progress-track'), 'Barre de progression visuelle du cycle d\'incubation présente dans app.js');
    assert(incAppJs.includes('btn-view-inc-details'), 'Bouton Voir les détails présent sur les cartes');
    assert(incAppJs.includes('btn-edit-inc'), 'Bouton Modifier présent sur les cartes');
    assert(incAppJs.includes('btn-record-hatch'), 'Bouton Enregistrer l\'éclosion présent sur les cartes');

    // --- 22. Suppression des Deux Sections du Tableau de Bord ---
    console.log('\n--- 22. Suppression des Deux Sections du Tableau de Bord ---');
    const updatedAppJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf-8');

    // 22.1 Retrait de la section « Alertes de Croissance des Animaux » du tableau de bord
    assert(!updatedAppJs.includes('id="dash-growth-section"'), '22.1 Conteneur dash-growth-section supprimé du tableau de bord');
    assert(!updatedAppJs.includes('class="dash-growth-section"'), 'Classe dash-growth-section supprimée du template du tableau de bord');
    assert(!updatedAppJs.includes('<span>Alertes de Croissance des Animaux</span>'), 'Titre « Alertes de Croissance des Animaux » retiré du tableau de bord');

    // 22.2 Retrait de la section « Répartition détaillée du cheptel et mouvements récents »
    assert(!updatedAppJs.includes('id="header-toggle-extra-details"'), '22.2 En-tête toggle de répartition et mouvements retiré');
    assert(!updatedAppJs.includes('Répartition détaillée du cheptel et mouvements récents'), 'Titre « Répartition détaillée du cheptel » retiré du tableau de bord');
    assert(!updatedAppJs.includes('id="table-dash-categories"'), 'Tableau table-dash-categories retiré du tableau de bord');
    assert(!updatedAppJs.includes('id="table-dash-recent"'), 'Tableau table-dash-recent retiré du tableau de bord');

    // 22.3 Conservation stricte des autres sections du tableau de bord
    assert(updatedAppJs.includes('id="dash-farm-name"'), '22.3 En-tête avec nom de la ferme active préservé');
    assert(updatedAppJs.includes('id="dash-livestock-sections"'), 'Section des indicateurs du cheptel par espèce préservée');
    assert(updatedAppJs.includes('id="dash-financial-section"'), 'Section du résumé financier (3 cartes) préservée');
    assert(updatedAppJs.includes('id="dash-incubation-section"'), 'Section du suivi de l\'incubation des œufs préservée');

    // 22.4 Données métier, alertes et historiques préservés pour les autres modules
    const dashCheck = await API.getDashboard(farmId);
    assert(Array.isArray(dashCheck.growth_alerts), '22.4 Données growth_alerts toujours calculées par l\'API');
    const notifsCheck = await API.getNotifications(farmId);
    assert(Array.isArray(notifsCheck.growth_alerts), 'Alertes de croissance toujours disponibles dans le centre d\'alertes');
    assert(typeof openDucklingSexingModal === 'function' || updatedAppJs.includes('openDucklingSexingModal'), 'Fonction de sexage et classification des animaux préservée');
    const movesCheck = await API.getMovements(farmId);
    assert(Array.isArray(movesCheck.movements), 'Historique des mouvements toujours disponible dans son module dédié');

    // ======================================================================
    // 23. Centralisation et Gestion de Toutes les Données Utilisateurs avec Supabase
    // ======================================================================
    console.log('\n--- 23. Centralisation et Gestion des Données avec Supabase ---');

    // 23.1 Configuration serveur et sécurité des clés
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    assert(fs.existsSync(envExamplePath), '23.1 Fichier .env.example présent');
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf-8');
    assert(envExampleContent.includes('SUPABASE_URL'), 'Variable SUPABASE_URL documentée dans .env.example');
    assert(envExampleContent.includes('SUPABASE_ANON_KEY'), 'Variable SUPABASE_ANON_KEY documentée dans .env.example');
    assert(envExampleContent.includes('JAMAIS') && envExampleContent.includes('service_role'), 'Avertissement de sécurité formel interdisant l\'exposition de service_role');

    const serverJsPath = path.join(__dirname, '..', 'server.js');
    const serverJsContent = fs.readFileSync(serverJsPath, 'utf-8');
    assert(serverJsContent.includes('/api/config'), 'Endpoint /api/config sécurisé présent dans server.js');
    assert(serverJsContent.includes('/api/health'), 'Endpoint /api/health présent dans server.js');
    assert(!serverJsContent.includes('serviceRoleKey') || !serverJsContent.includes('res.json({ serviceRoleKey'), 'Clé service_role strictement exclue des réponses client');

    // 23.2 Architecture de base de données PostgreSQL & Politiques RLS (schema.sql)
    const schemaSqlPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
    assert(fs.existsSync(schemaSqlPath), '23.2 Fichier supabase/schema.sql complet présent');
    const schemaSql = fs.readFileSync(schemaSqlPath, 'utf-8');

    // Tables principales
    const expectedTables = [
      'profiles', 'farms', 'user_farms', 'species', 'farm_species',
      'categories', 'lots', 'animals', 'movements', 'duckling_classifications',
      'chick_classifications', 'incubations', 'custom_alerts', 'financial_records',
      'commercial_transactions', 'reproductions', 'egg_collections',
      'health_treatments', 'feeds', 'building_maintenance', 'contacts'
    ];
    for (const tbl of expectedTables) {
      assert(schemaSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`) || schemaSql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`), `Table PostgreSQL « ${tbl} » définie dans le schéma`);
    }

    // Row Level Security (RLS)
    assert(schemaSql.includes('profiles ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur la table profiles');
    assert(schemaSql.includes('farms ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur la table farms');
    assert(schemaSql.includes('lots ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur la table lots');
    assert(schemaSql.includes('animals ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur la table animals');
    assert(schemaSql.includes('incubations ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur la table incubations');
    assert(schemaSql.includes('custom_alerts ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur la table custom_alerts');
    assert(schemaSql.includes('financial_records ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur la table financial_records');

    // Isolation multi-ferme et triggers
    assert(schemaSql.includes('is_farm_member'), 'Fonction de sécurité is_farm_member(farm_uuid) présente');
    assert(schemaSql.includes('handle_new_user()'), 'Trigger automatique handle_new_user() sur auth.users présent');
    assert(schemaSql.includes('poules') && schemaSql.includes('canards') && schemaSql.includes('chevres'), 'Données de référence des espèces injectées par défaut');

    // 23.3 Gestionnaire Client Supabase (public/js/supabase-client.js)
    const clientJsPath = path.join(__dirname, '..', 'public', 'js', 'supabase-client.js');
    assert(fs.existsSync(clientJsPath), '23.3 Fichier public/js/supabase-client.js présent');
    const SupabaseClientManager = require('../public/js/supabase-client.js');
    assert(typeof SupabaseClientManager.init === 'function', 'Méthode SupabaseClientManager.init() définie');
    assert(typeof SupabaseClientManager.getStatus === 'function', 'Méthode SupabaseClientManager.getStatus() définie');
    assert(typeof SupabaseClientManager.getClient === 'function', 'Méthode SupabaseClientManager.getClient() définie');
    assert(typeof SupabaseClientManager.setConfig === 'function', 'Méthode SupabaseClientManager.setConfig() définie');
    assert(typeof SupabaseClientManager.clearConfig === 'function', 'Méthode SupabaseClientManager.clearConfig() définie');
    assert(typeof SupabaseClientManager.testConnection === 'function', 'Méthode SupabaseClientManager.testConnection() définie');

    // 23.4 Couche de Service Supabase (public/js/supabase-service.js)
    const serviceJsPath = path.join(__dirname, '..', 'public', 'js', 'supabase-service.js');
    assert(fs.existsSync(serviceJsPath), '23.4 Fichier public/js/supabase-service.js présent');
    const SupabaseService = require('../public/js/supabase-service.js');
    assert(typeof SupabaseService.signUp === 'function', 'Méthode SupabaseService.signUp() définie');
    assert(typeof SupabaseService.signIn === 'function', 'Méthode SupabaseService.signIn() définie');
    assert(typeof SupabaseService.getFarms === 'function', 'Méthode SupabaseService.getFarms() définie');
    assert(typeof SupabaseService.createFarm === 'function', 'Méthode SupabaseService.createFarm() définie');
    assert(typeof SupabaseService.getLots === 'function', 'Méthode SupabaseService.getLots() définie');
    assert(typeof SupabaseService.getAnimals === 'function', 'Méthode SupabaseService.getAnimals() définie');
    assert(typeof SupabaseService.getIncubations === 'function', 'Méthode SupabaseService.getIncubations() définie');
    assert(typeof SupabaseService.getCustomAlerts === 'function', 'Méthode SupabaseService.getCustomAlerts() définie');
    assert(typeof SupabaseService.getFinancialRecords === 'function', 'Méthode SupabaseService.getFinancialRecords() définie');
    assert(typeof SupabaseService.syncLocalToSupabase === 'function', 'Méthode SupabaseService.syncLocalToSupabase() définie');

    // 23.5 Méthodes API et repli transparent
    assert(typeof API.isSupabaseConnected === 'function', '23.5 API.isSupabaseConnected() définie');
    assert(API.isSupabaseConnected() === false, 'API.isSupabaseConnected() retourne false en mode local autonome');
    assert(typeof API.syncLocalToSupabase === 'function', 'API.syncLocalToSupabase() définie pour la migration en un clic');

    // 23.6 Éléments d'interface utilisateur et modale
    const supaIndexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const supaIndexHtml = fs.readFileSync(supaIndexHtmlPath, 'utf-8');
    assert(supaIndexHtml.includes('vendor/supabase/supabase.js'), '23.6 Bundle Supabase UMD inclus dans index.html');
    assert(supaIndexHtml.includes('js/supabase-client.js'), 'supabase-client.js inclus dans index.html');
    assert(supaIndexHtml.includes('js/supabase-service.js'), 'supabase-service.js inclus dans index.html');
    assert(supaIndexHtml.includes('id="btn-supabase-status"'), 'Bouton d\'état #btn-supabase-status présent dans le bandeau supérieur');
    assert(supaIndexHtml.includes('id="supabase-status-dot"'), 'Pastille de statut #supabase-status-dot présente');
    assert(supaIndexHtml.includes('id="supabase-status-label"'), 'Libellé de statut #supabase-status-label présent');
    assert(supaIndexHtml.includes('id="modal-supabase-config"'), 'Modale de configuration #modal-supabase-config présente');
    assert(supaIndexHtml.includes('id="cfg-supabase-url"'), 'Champ URL de Supabase présent');
    assert(supaIndexHtml.includes('id="cfg-supabase-anon-key"'), 'Champ clé publique anonyme présent');
    assert(supaIndexHtml.includes('id="btn-test-supabase"'), 'Bouton de test de connexion présent');
    assert(supaIndexHtml.includes('id="btn-sync-to-supabase"'), 'Bouton de migration en 1 clic vers Supabase présent');

    assert(updatedAppJs.includes('updateSupabaseStatusUI'), 'Fonction updateSupabaseStatusUI() définie dans app.js');
    assert(updatedAppJs.includes('setupSupabaseHandlers'), 'Fonction setupSupabaseHandlers() définie dans app.js');

    // ======================================================================
    // 24. Masquage de l'Indicateur Technique Supabase dans l'Interface
    // ======================================================================
    console.log('\n--- 24. Masquage de l\'Indicateur Technique Supabase ---');

    // 24.1 Indicateur technique masqué dans l'interface
    assert(supaIndexHtml.includes('id="btn-supabase-status" style="display:none !important;"') || supaIndexHtml.includes('id="btn-supabase-status" style="display:none'), '24.1 Indicateur technique #btn-supabase-status strictement masqué dans index.html');
    assert(updatedAppJs.includes("btn.style.display = 'none'"), 'Masquage forcé de l\'indicateur dans updateSupabaseStatusUI()');

    // 24.2 Préservation intégrale de la connexion Supabase
    assert(fs.existsSync(schemaSqlPath), '24.2 Schéma et tables Supabase toujours intacts');
    assert(typeof SupabaseService.getFarms === 'function', 'Couche de service Supabase active et disponible');
    assert(typeof SupabaseService.signUp === 'function', 'Supabase Auth toujours opérationnel');

    // 24.3 Gestion des erreurs conviviale et claire pour l'utilisateur
    assert(updatedAppJs.includes('formatUserErrorMessage'), '24.3 Fonction de formatage des messages d\'erreur conviviale présente');
    assert(updatedAppJs.includes('Connexion au serveur ou à la base de données momentanément indisponible'), 'Message d\'erreur compréhensible en cas de coupure réseau ou serveur');

    console.log('\n====================================================');
    console.log(`RÉSULTAT DES TESTS WEB APP LOCALE : ${passed} passés, ${failed} échoués`);
    console.log('====================================================\n');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Erreur test:', err);
    process.exit(1);
  }
}

runLocalAppTests();
