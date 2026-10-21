// ============================================================================
// AGRO-FERME — GESTION LOCALE ENTIÈREMENT CLIENT-SIDE (SANS API BACKEND)
// Toutes les données sont persistées localement dans le navigateur (localStorage)
// ============================================================================

const LOCAL_STORAGE_DB_KEY = 'ferme_animale_local_db_v1';
const LOCAL_STORAGE_TOKEN_KEY = 'ferme_token';
const LOCAL_STORAGE_CURRENT_FARM_KEY = 'ferme_current_farm_id';

// Utilitaires de calcul de dates et d'échéances
function addDaysToDate(dateStr, days) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  return dt.toISOString().split('T')[0];
}

function getDaysDiff(fromStr, toStr) {
  if (!fromStr || !toStr) return 0;
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

// Règle de maturité et de sexage selon l'espèce (Poules: 8 sem. / 56 j, Canards: 12 sem. / 84 j)
function getYoungPoultryRule(speciesId, categoryName) {
  const sp = (speciesId || '').toLowerCase().trim();
  const cat = (categoryName || '').toLowerCase().trim();

  if (sp === 'canards' || cat.includes('caneton')) {
    return {
      species_id: 'canards',
      species_name: 'Canards',
      young_category: 'Canetons',
      male_category: 'Canards mâles',
      female_category: 'Canes',
      maturity_days: 84, // 12 semaines
      maturity_weeks: 12,
      label_young: 'caneton(s)',
      label_young_cap: 'Canetons',
      label_male: 'canards mâles',
      label_male_cap: 'Canards Mâles',
      label_female: 'canes',
      label_female_cap: 'Canes',
      icon: '🦆'
    };
  } else if (sp === 'poules' || cat.includes('poussin')) {
    return {
      species_id: 'poules',
      species_name: 'Poules et coqs',
      young_category: 'Poussins',
      male_category: 'Coqs',
      female_category: 'Poules',
      maturity_days: 56, // 8 semaines
      maturity_weeks: 8,
      label_young: 'poussin(s)',
      label_young_cap: 'Poussins',
      label_male: 'coqs',
      label_male_cap: 'Coqs',
      label_female: 'poules',
      label_female_cap: 'Poules',
      icon: '🐥'
    };
  }
  return null;
}

// Durées standard d'incubation par espèce animale (poules: 21j, canards: 28j, oies: 30j, etc.)
function getDefaultIncubationDuration(speciesId) {
  const sp = (speciesId || '').toLowerCase().trim();
  if (sp === 'poules' || sp.includes('poule') || sp.includes('coq') || sp.includes('poussin')) return 21;
  if (sp === 'canards' || sp.includes('canard') || sp.includes('cane')) return 28;
  if (sp === 'oies' || sp.includes('oie') || sp.includes('jars')) return 30;
  if (sp === 'dindes' || sp.includes('dinde') || sp.includes('dindon')) return 28;
  if (sp === 'cailles' || sp.includes('caille')) return 17;
  if (sp === 'pintades' || sp.includes('pintade')) return 27;
  if (sp === 'faisans' || sp.includes('faisan')) return 24;
  return 21;
}

// Enrichissement et calculs automatiques d'incubation (durée, dates, progression temporelle, statut)
function enrichIncubation(i, db, todayStr) {
  if (!todayStr) todayStr = new Date().toISOString().split('T')[0];
  const sp = (db && Array.isArray(db.species)) ? db.species.find(s => s.id === i.species_id) : null;
  const lot = (db && Array.isArray(db.lots)) ? db.lots.find(l => l.id === i.target_lot_id) : null;
  const duration = parseInt(i.duration_days, 10) || getDefaultIncubationDuration(i.species_id);
  const startDate = i.start_date || todayStr;
  const expectedHatch = i.expected_hatch_date || addDaysToDate(startDate, duration);

  const daysElapsed = getDaysDiff(startDate, todayStr);
  const daysRemaining = getDaysDiff(todayStr, expectedHatch);

  let progressPercent = 0;
  let computedStatus = i.status || 'en_cours';
  let statusLabel = 'En cours';
  let badgeClass = 'badge-blue';

  if (i.status === 'termine') {
    computedStatus = 'termine';
    statusLabel = 'Terminée';
    progressPercent = 100;
    badgeClass = 'badge-green';
  } else if (i.status === 'annule') {
    computedStatus = 'annule';
    statusLabel = 'Annulée';
    progressPercent = 0;
    badgeClass = 'badge-gray';
  } else if (todayStr < startDate) {
    computedStatus = 'a_venir';
    statusLabel = 'À venir';
    progressPercent = 0;
    badgeClass = 'badge-purple';
  } else if (todayStr > expectedHatch) {
    computedStatus = 'en_retard';
    statusLabel = 'Échéance dépassée';
    progressPercent = 100;
    badgeClass = 'badge-red';
  } else if (todayStr === expectedHatch) {
    computedStatus = 'eclosion_attendue';
    statusLabel = "Éclosion aujourd'hui";
    progressPercent = 100;
    badgeClass = 'badge-amber';
  } else {
    computedStatus = 'en_cours';
    statusLabel = 'En cours';
    progressPercent = Math.min(100, Math.max(0, Math.round((daysElapsed / duration) * 100)));
    badgeClass = 'badge-blue';
  }

  let daysRemainingLabel = '';
  if (daysRemaining > 0) {
    daysRemainingLabel = `Dans ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}`;
  } else if (daysRemaining === 0) {
    daysRemainingLabel = `Éclosion attendue aujourd'hui`;
  } else {
    daysRemainingLabel = `Échéance dépassée (+${Math.abs(daysRemaining)} j)`;
  }

  return {
    ...i,
    species_name: sp ? sp.name : (i.species_id || 'Volaille'),
    species_icon: sp ? sp.icon : '🥚',
    target_lot_name: lot ? lot.name : null,
    duration_days: duration,
    expected_hatch_date: expectedHatch,
    days_elapsed: Math.max(0, daysElapsed),
    days_remaining: daysRemaining,
    days_remaining_label: daysRemainingLabel,
    progress_percent: progressPercent,
    computed_status: computedStatus,
    status_label: statusLabel,
    badge_class: badgeClass
  };
}

if (typeof window !== 'undefined') {
  window.addDaysToDate = addDaysToDate;
  window.getDefaultIncubationDuration = getDefaultIncubationDuration;
  window.enrichIncubation = enrichIncubation;
}

// Base de données locale autonome
const LocalDB = {
  load() {
    let db = null;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
      if (raw) {
        db = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Erreur de lecture du localStorage, réinitialisation...', e);
    }
    const initial = this.getInitialData();
    if (!db || typeof db !== 'object') {
      this.save(initial);
      return initial;
    }

    let modified = false;
    for (const key of Object.keys(initial)) {
      if (!Array.isArray(db[key])) {
        db[key] = Array.isArray(initial[key]) ? [...initial[key]] : initial[key];
        modified = true;
      }
    }

    // Si les dépenses de démonstration manquent sur la ferme 1, les injecter pour garantir l'affichage
    if (db.financial_records && db.financial_records.length === 0 && initial.financial_records && initial.financial_records.length > 0) {
      db.financial_records = [...initial.financial_records];
      modified = true;
    }

    // Réconciliation & sécurisation des catégories d'espèces
    if (Array.isArray(db.species)) {
      const defaultSpecies = this.getDefaultSpecies();
      const defaultMap = {};
      defaultSpecies.forEach(ds => {
        defaultMap[ds.id] = ds.categories || [];
      });

      db.species.forEach(sp => {
        if (!Array.isArray(sp.categories) || sp.categories.length === 0) {
          if (defaultMap[sp.id] && defaultMap[sp.id].length > 0) {
            sp.categories = [...defaultMap[sp.id]];
            modified = true;
          } else {
            const dbCats = (db.categories || []).filter(c => c.species_id === sp.id);
            if (dbCats.length > 0) {
              sp.categories = dbCats.map(c => ({ name: c.name, gender: c.default_gender || 'MIXTE' }));
              modified = true;
            } else if (!Array.isArray(sp.categories)) {
              sp.categories = [];
              modified = true;
            }
          }
        }
      });
    }

    if (modified) {
      this.save(db);
    }
    return db;
  },

  save(data) {
    try {
      localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Erreur sauvegarde localStorage:', e);
    }
  },

  nextId(collection, inMemoryDb = null) {
    const db = inMemoryDb || this.load();
    const list = db[collection] || [];
    const maxId = list.reduce((m, item) => Math.max(m, Number(item.id) || 0), 0);
    return maxId + 1;
  },

  getDefaultSpecies() {
    return [
      {
        id: 'canards',
        name: 'Canards',
        icon: '🦆',
        description: 'Élevage de canards pour la chair, la reproduction et les œufs.',
        categories: [
          { name: 'Canes', gender: 'F' },
          { name: 'Canards mâles', gender: 'M' },
          { name: 'Canetons', gender: 'MIXTE' }
        ]
      },
      {
        id: 'poules',
        name: 'Poules et coqs',
        icon: '🐔',
        description: 'Élevage avicole pour la ponte et la chair.',
        categories: [
          { name: 'Poules', gender: 'F' },
          { name: 'Coqs', gender: 'M' },
          { name: 'Poulettes', gender: 'F' },
          { name: 'Poussins', gender: 'MIXTE' }
        ]
      },
      {
        id: 'chevres',
        name: 'Chèvres et boucs',
        icon: '🐐',
        description: 'Élevage caprin pour le lait, le fromage et la reproduction.',
        categories: [
          { name: 'Chèvres', gender: 'F' },
          { name: 'Boucs', gender: 'M' },
          { name: 'Chevreaux', gender: 'MIXTE' }
        ]
      },
      {
        id: 'moutons',
        name: 'Moutons et brebis',
        icon: '🐑',
        description: 'Élevage ovin pour la viande, la laine et le pastoralisme.',
        categories: [
          { name: 'Brebis', gender: 'F' },
          { name: 'Béliers', gender: 'M' },
          { name: 'Agneaux', gender: 'MIXTE' }
        ]
      },
      {
        id: 'bovins',
        name: 'Bovins',
        icon: '🐄',
        description: 'Élevage de vaches laitières, taurillons et veaux.',
        categories: [
          { name: 'Vaches', gender: 'F' },
          { name: 'Taureaux', gender: 'M' },
          { name: 'Génisses', gender: 'F' },
          { name: 'Veaux', gender: 'MIXTE' }
        ]
      },
      {
        id: 'porcs',
        name: 'Porcs',
        icon: '🐖',
        description: 'Élevage porcin naisseur et engraisseur.',
        categories: [
          { name: 'Truies', gender: 'F' },
          { name: 'Verrats', gender: 'M' },
          { name: 'Porcelets', gender: 'MIXTE' }
        ]
      },
      {
        id: 'lapins',
        name: 'Lapins',
        icon: '🐇',
        description: 'Cuniculture fermière pour chair et reproduction.',
        categories: [
          { name: 'Lapines', gender: 'F' },
          { name: 'Lapins mâles', gender: 'M' },
          { name: 'Lapereaux', gender: 'MIXTE' }
        ]
      },
      {
        id: 'dindes',
        name: 'Dindes',
        icon: '🦃',
        description: 'Élevage de dindes et dindons.',
        categories: [
          { name: 'Dindes', gender: 'F' },
          { name: 'Dindons', gender: 'M' },
          { name: 'Dindonneaux', gender: 'MIXTE' }
        ]
      },
      {
        id: 'pintades',
        name: 'Pintades',
        icon: '🪶',
        description: 'Élevage de pintades traditionnelles de plein air.',
        categories: [
          { name: 'Pintades femelles', gender: 'F' },
          { name: 'Pintades mâles', gender: 'M' },
          { name: 'Pintadeaux', gender: 'MIXTE' }
        ]
      },
      {
        id: 'autres',
        name: 'Autres espèces',
        icon: '🐾',
        description: 'Autres animaux d\'élevage spécifiques.',
        categories: [
          { name: 'Femelles', gender: 'F' },
          { name: 'Mâles', gender: 'M' },
          { name: 'Jeunes', gender: 'MIXTE' }
        ]
      }
    ];
  },

  getInitialData() {
    const defaultSpeciesList = this.getDefaultSpecies();

    // Tables relationnelles
    const db = {
      users: [
        {
          id: 1,
          name: 'Michel Dupont',
          email: 'fermier@exemple.com',
          password: 'ferme123',
          created_at: '2025-01-01'
        }
      ],
      farms: [
        {
          id: 1,
          owner_id: 1,
          name: 'Ferme du Val Fleuri',
          owner_name: 'Michel Dupont',
          country: 'Togo',
          locality: 'Lomé',
          farm_type: 'Élevage mixte avicole & caprin',
          currency: 'FCFA',
          start_date: '2025-03-01',
          created_at: '2025-03-01'
        }
      ],
      user_farms: [
        { user_id: 1, farm_id: 1, role: 'proprietaire' }
      ],
      species: defaultSpeciesList.map(s => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        description: s.description,
        categories: Array.isArray(s.categories) ? [...s.categories] : [],
        is_system: 1
      })),
      farm_species: [
        { farm_id: 1, species_id: 'canards', is_active: 1 },
        { farm_id: 1, species_id: 'poules', is_active: 1 },
        { farm_id: 1, species_id: 'chevres', is_active: 1 }
      ],
      categories: defaultSpeciesList.flatMap(s => 
        (s.categories || []).map((c, idx) => ({
          id: `${s.id}_cat_${idx + 1}`,
          farm_id: 1,
          species_id: s.id,
          name: c.name,
          default_gender: c.gender || 'MIXTE',
          is_system: 1,
          is_active: 1
        }))
      ),
      lots: [
        {
          id: 1,
          farm_id: 1,
          name: 'Poulailler Ponte 1',
          species_id: 'poules',
          location: 'Bâtiment Sud',
          capacity: 150,
          building_type: 'poulailler',
          notes: 'Parc pondeuses avec parcours extérieur',
          status: 'actif'
        },
        {
          id: 2,
          farm_id: 1,
          name: 'Poussinière Tempérée',
          species_id: 'poules',
          location: 'Bâtiment Nord',
          capacity: 100,
          building_type: 'poussiniere',
          notes: 'Élevage poussins sous lampe éleveuse',
          status: 'actif'
        },
        {
          id: 3,
          farm_id: 1,
          name: 'Lot canetons D-01',
          species_id: 'canards',
          location: 'Zone Ouest',
          capacity: 80,
          building_type: 'enclos',
          notes: 'Bassin naturel sécurisé',
          status: 'actif'
        },
        {
          id: 4,
          farm_id: 1,
          name: 'Bergerie & Chèvrerie',
          species_id: 'chevres',
          location: 'Hangar Est',
          capacity: 40,
          building_type: 'bergerie',
          notes: 'Chèvres laitières',
          status: 'actif'
        }
      ],
      animals: [
        {
          id: 1,
          farm_id: 1,
          code: 'POU-001',
          type: 'lot',
          species_id: 'poules',
          category_name: 'Poules',
          breed: 'Marans & rousses',
          gender: 'F',
          birth_date: '2025-04-10',
          purchase_date: '2025-06-01',
          initial_quantity: 50,
          current_quantity: 48,
          current_weight: null,
          purchase_price: 450,
          lot_id: 1,
          observations: 'Bonnes pondeuses',
          status: 'actif'
        },
        {
          id: 2,
          farm_id: 1,
          code: 'POU-002',
          type: 'lot',
          species_id: 'poules',
          category_name: 'Coqs',
          breed: 'Marans',
          gender: 'M',
          birth_date: '2025-04-10',
          purchase_date: '2025-06-01',
          initial_quantity: 4,
          current_quantity: 4,
          current_weight: null,
          purchase_price: 60,
          lot_id: 1,
          observations: 'Reproducteurs vigoureux',
          status: 'actif'
        },
        {
          id: 3,
          farm_id: 1,
          code: 'POU-003',
          type: 'lot',
          species_id: 'poules',
          category_name: 'Poussins',
          breed: 'Goliath',
          gender: 'MIXTE',
          birth_date: '2026-03-15',
          maturity_date: '2026-05-10',
          initial_quantity: 30,
          current_quantity: 30,
          current_weight: null,
          purchase_price: null,
          lot_id: 2,
          observations: 'Éclosion couveuse',
          status: 'actif'
        },
        {
          id: 4,
          farm_id: 1,
          code: 'CAN-001',
          type: 'lot',
          species_id: 'canards',
          category_name: 'Canes',
          breed: 'Barbarie',
          gender: 'F',
          birth_date: '2025-05-12',
          purchase_date: '2025-07-01',
          initial_quantity: 18,
          current_quantity: 18,
          current_weight: null,
          purchase_price: 270,
          lot_id: 3,
          observations: 'Canes calmes',
          status: 'actif'
        },
        {
          id: 5,
          farm_id: 1,
          code: 'CAN-002',
          type: 'lot',
          species_id: 'canards',
          category_name: 'Canards mâles',
          breed: 'Barbarie',
          gender: 'M',
          birth_date: '2025-05-12',
          purchase_date: '2025-07-01',
          initial_quantity: 6,
          current_quantity: 6,
          current_weight: null,
          purchase_price: 120,
          lot_id: 3,
          observations: 'Mâles reproducteurs',
          status: 'actif'
        },
        {
          id: 6,
          farm_id: 1,
          code: 'CHEV-001',
          type: 'lot',
          species_id: 'chevres',
          category_name: 'Chèvres',
          breed: 'Alpine Chamoisée',
          gender: 'F',
          birth_date: '2024-03-01',
          purchase_date: '2025-02-01',
          initial_quantity: 8,
          current_quantity: 8,
          current_weight: null,
          purchase_price: 960,
          lot_id: 4,
          observations: 'Excellente production laitière',
          status: 'actif'
        }
      ],
      movements: [
        {
          id: 1,
          farm_id: 1,
          animal_id: 1,
          type: 'achat',
          date: '2025-06-01',
          species_id: 'poules',
          category_name: 'Poules',
          quantity: 50,
          unit_price: 9,
          total_price: 450,
          from_lot_id: null,
          to_lot_id: 1,
          observations: 'Achat initial du cheptel pondeuses',
          created_by: 1
        },
        {
          id: 2,
          farm_id: 1,
          animal_id: 2,
          type: 'achat',
          date: '2025-06-01',
          species_id: 'poules',
          category_name: 'Coqs',
          quantity: 4,
          unit_price: 15,
          total_price: 60,
          from_lot_id: null,
          to_lot_id: 1,
          observations: 'Achat coqs reproducteurs',
          created_by: 1
        },
        {
          id: 3,
          farm_id: 1,
          animal_id: 4,
          type: 'achat',
          date: '2025-07-01',
          species_id: 'canards',
          category_name: 'Canes',
          quantity: 18,
          unit_price: 15,
          total_price: 270,
          from_lot_id: null,
          to_lot_id: 3,
          observations: 'Arrivée canes Barbarie',
          created_by: 1
        },
        {
          id: 4,
          farm_id: 1,
          animal_id: 5,
          type: 'achat',
          date: '2025-07-01',
          species_id: 'canards',
          category_name: 'Canards mâles',
          quantity: 6,
          unit_price: 20,
          total_price: 120,
          from_lot_id: null,
          to_lot_id: 3,
          observations: 'Arrivée canards mâles',
          created_by: 1
        },
        {
          id: 5,
          farm_id: 1,
          animal_id: 3,
          type: 'naissance',
          date: '2026-03-15',
          species_id: 'poules',
          category_name: 'Poussins',
          quantity: 30,
          unit_price: null,
          total_price: null,
          from_lot_id: null,
          to_lot_id: 2,
          observations: 'Éclosion réussie 30 poussins',
          created_by: 1
        },
        {
          id: 6,
          farm_id: 1,
          animal_id: 1,
          type: 'vente',
          date: '2026-04-02',
          species_id: 'poules',
          category_name: 'Poules',
          quantity: 2,
          unit_price: 18,
          total_price: 36,
          from_lot_id: 1,
          to_lot_id: null,
          observations: 'Vente de 2 poules à un voisin',
          created_by: 1
        }
      ],
      reproductions: [
        {
          id: 1,
          farm_id: 1,
          species_id: 'chevres',
          type: 'saillie',
          female_id: null,
          female_name: 'Chèvre n°1',
          male_id: null,
          male_name: 'Bouc Reproducteur Champion',
          service_date: '2026-05-28',
          gestation_days: 150,
          expected_birth_date: '2026-10-25',
          target_lot_id: 4,
          status: 'gestation_confirmee',
          notes: 'Échographie positive à 60 jours, 2 chevreaux attendus'
        }
      ],
      egg_collections: [
        {
          id: 1,
          farm_id: 1,
          date: '2026-10-10',
          species_id: 'poules',
          lot_id: 1,
          eggs_laid: 120,
          eggs_broken: 4,
          eggs_sold: 60,
          eggs_consumed: 26,
          eggs_incubated: 30,
          notes: 'Excellente ponte automnale'
        }
      ],
      incubations: [
        {
          id: 1,
          farm_id: 1,
          code: 'INC-POU-01',
          species_id: 'poules',
          method: 'artificielle',
          incubator_type: 'Couveuse R-Com 50',
          eggs_count: 30,
          start_date: '2026-02-22',
          duration_days: 21,
          expected_hatch_date: '2026-03-15',
          actual_hatch_date: '2026-03-15',
          hatched_count: 28,
          unhatched_count: 2,
          live_young_count: 28,
          dead_young_count: 0,
          rejected_count: 0,
          hatch_rate: 93.3,
          target_lot_id: 2,
          status: 'termine',
          candling_notes: 'Mirage J7: 29 fertiles. Mirage J14: 28 vivants.',
          notes: 'Éclosion réussie en couveuse automatique'
        },
        {
          id: 2,
          farm_id: 1,
          code: 'INC-CAN-02',
          species_id: 'canards',
          method: 'naturelle',
          incubator_type: 'Nid de paille - Cane Barbarie',
          eggs_count: 15,
          start_date: '2026-10-01',
          duration_days: 35,
          expected_hatch_date: '2026-11-05',
          target_lot_id: 3,
          status: 'en_cours',
          candling_notes: 'Couveuse naturelle sur nid de paille',
          notes: 'Cane Barbarie en couvaison active'
        },
        {
          id: 3,
          farm_id: 1,
          code: 'INC-POU-03',
          species_id: 'poules',
          method: 'artificielle',
          incubator_type: 'Couveuse Ducatillon 50',
          eggs_count: 24,
          start_date: addDaysToDate(new Date().toISOString().split('T')[0], -18),
          duration_days: 21,
          expected_hatch_date: addDaysToDate(new Date().toISOString().split('T')[0], 3),
          target_lot_id: 2,
          status: 'en_cours',
          candling_notes: 'Mirage J7 : 24 œufs féconds confirmés, développement embryonnaire optimal.',
          notes: 'Sélection pondeuses locales pour renouvellement'
        }
      ],
      health_treatments: [
        {
          id: 1,
          farm_id: 1,
          date: '2026-09-15',
          type: 'vaccination',
          species_id: 'poules',
          lot_id: 1,
          disease_or_reason: 'Prévention Newcastle',
          treatment_name: 'Vaccin Nobilis ND',
          dosage: 'Eau de boisson',
          veterinarian: 'Dr. Lambert',
          cost: 28000,
          next_care_date: '2026-12-15',
          notes: 'Rappel trimestriel collectif'
        },
        {
          id: 2,
          farm_id: 1,
          date: '2026-10-02',
          type: 'vermifugation',
          species_id: 'chevres',
          lot_id: 4,
          disease_or_reason: 'Parasitisme intestinal',
          treatment_name: 'Panacur 10%',
          dosage: '5ml/tête per os',
          veterinarian: 'Dr. Lambert',
          cost: 35000,
          next_care_date: '2027-01-02',
          notes: 'Traitement avant mise bas'
        }
      ],
      feeds: [
        {
          id: 1,
          farm_id: 1,
          name: 'Granulés Pondeuses Bio',
          category: 'ponte',
          species_id: 'poules',
          target_category: 'Poules',
          unit: 'kg',
          stock_quantity: 350,
          min_threshold: 80,
          unit_price: 350,
          supplier: 'Moulin Régional Bio',
          notes: 'Sac de 25kg certifié bio'
        },
        {
          id: 2,
          farm_id: 1,
          name: 'Miette Démarrage Poussin',
          category: 'demarrage',
          species_id: 'poules',
          target_category: 'Poussins',
          unit: 'kg',
          stock_quantity: 45,
          min_threshold: 60,
          unit_price: 500,
          supplier: 'Moulin Régional Bio',
          notes: 'Stock bas : à commander sous 48h'
        },
        {
          id: 3,
          farm_id: 1,
          name: 'Foin de Crau 1er Choix',
          category: 'fourrage',
          species_id: 'chevres',
          target_category: 'Chèvres',
          unit: 'botte',
          stock_quantity: 30,
          min_threshold: 10,
          unit_price: 4500,
          supplier: 'Fourrages du Bocage',
          notes: 'Haute valeur nutritionnelle'
        }
      ],
      feed_logs: [
        {
          id: 1,
          farm_id: 1,
          feed_id: 1,
          type: 'distribution',
          date: '2026-10-12',
          quantity: 15,
          lot_id: 1,
          notes: 'Distribution matin'
        }
      ],
      building_maintenance: [
        {
          id: 1,
          farm_id: 1,
          lot_id: 1,
          date: '2026-09-20',
          type: 'desinfection',
          description: 'Grand nettoyage haute pression et chaulage',
          cost: 45000,
          performed_by: 'Équipe ferme',
          next_date: '2026-12-20',
          notes: 'Litière neuve de copeaux de bois'
        }
      ],
      contacts: [
        {
          id: 1,
          farm_id: 1,
          type: 'client',
          name: 'Épicerie Gourmande Bio',
          phone: '+228 90 12 34 56',
          email: 'contact@epicerie-bio.tg',
          address: 'Boulevard Circulaire, Lomé',
          notes: 'Commande 60 œufs/semaine'
        },
        {
          id: 2,
          farm_id: 1,
          type: 'fournisseur',
          name: 'AgroFeed Togo',
          phone: '+228 91 22 33 44',
          email: 'agrofeed@togo.tg',
          address: 'Zone Industrielle, Lomé',
          notes: 'Fournisseur aliments et compléments'
        },
        {
          id: 3,
          farm_id: 1,
          type: 'fournisseur',
          name: 'Couvoir National',
          phone: '+228 92 33 44 55',
          email: 'couvoir@national.tg',
          address: 'Route d\'Atakpamé, Tsévié',
          notes: 'Fournisseur canetons et poussins'
        },
        {
          id: 4,
          farm_id: 1,
          type: 'fournisseur',
          name: 'Pharmacie Vétérinaire Centrale',
          phone: '+228 93 44 55 66',
          email: 'veto@centrale.tg',
          address: 'Avenue de la Libération, Lomé',
          notes: 'Vaccins et antiparasitaires'
        }
      ],
      commercial_transactions: [
        {
          id: 1,
          farm_id: 1,
          type: 'vente',
          product_type: 'oeufs',
          date: '2026-10-11',
          contact_id: 1,
          contact_name: 'Épicerie Gourmande Bio',
          description: 'Livraison 60 œufs fermiers extra-frais',
          quantity: 60,
          unit: 'unite',
          unit_price: 250,
          total_amount: 15000,
          paid_amount: 15000,
          payment_method: 'Virement bancaire',
          payment_status: 'paye'
        }
      ],
      financial_records: [
        {
          id: 1,
          farm_id: 1,
          type: 'recette',
          category: 'vente_oeufs',
          date: '2026-10-11',
          amount: 50000,
          payment_status: 'paye',
          payment_method: 'Virement bancaire',
          lot_id: 1,
          title: 'Vente œufs à l\'Épicerie Gourmande',
          supplier: null,
          notes: 'Facture #001'
        },
        {
          id: 2,
          farm_id: 1,
          type: 'recette',
          category: 'vente_animaux',
          date: '2026-04-02',
          amount: 36000,
          payment_status: 'paye',
          payment_method: 'Espèces',
          lot_id: 1,
          title: 'Vente de 2 poules',
          supplier: null,
          notes: 'Règlement comptant'
        },
        // Les 4 dépenses exactes de la capture d'écran utilisateur (Total : 263 000 FCFA)
        {
          id: 3,
          farm_id: 1,
          type: 'depense',
          category: 'Achat canetons',
          date: '2026-08-08',
          amount: 135000,
          payment_status: 'paye',
          payment_method: 'Espèces',
          lot_id: 3,
          title: '150 canetons d\'un jour à 900 FCFA',
          supplier: 'Couvoir National',
          notes: 'Lot canetons D-01'
        },
        {
          id: 4,
          farm_id: 1,
          type: 'depense',
          category: 'Aliments',
          date: '2026-09-07',
          amount: 85000,
          payment_status: 'paye',
          payment_method: 'T-Money',
          lot_id: 3,
          title: '250 kg aliment croissance',
          supplier: 'AgroFeed Togo',
          notes: 'Livraison par sac'
        },
        {
          id: 5,
          farm_id: 1,
          type: 'depense',
          category: 'Vaccins & Médicaments',
          date: '2026-09-27',
          amount: 18000,
          payment_status: 'paye',
          payment_method: 'Flooz',
          lot_id: 3,
          title: 'Vaccin peste du canard + vitamines AD3E',
          supplier: 'Pharmacie Vétérinaire Centrale',
          notes: 'Traitement préventif'
        },
        {
          id: 6,
          farm_id: 1,
          type: 'depense',
          category: 'Main-d\'œuvre',
          date: '2026-10-02',
          amount: 25000,
          payment_status: 'paye',
          payment_method: 'Espèces',
          lot_id: null,
          title: 'Curage complet litière et désinfection',
          supplier: 'Équipe d\'entretien',
          notes: 'Entretien périodique'
        }
      ],
      password_resets: [],
      duckling_classifications: [],
      chick_classifications: [],
      custom_alerts: []
    };

    // Créer les catégories initiales pour chaque espèce par défaut
    let catId = 1;
    for (const sp of defaultSpeciesList) {
      for (const cat of sp.categories) {
        db.categories.push({
          id: catId++,
          farm_id: null,
          species_id: sp.id,
          name: cat.name,
          default_gender: cat.gender,
          is_system: 1,
          is_active: 1
        });
      }
    }

    return db;
  }
};

// Initialisation au chargement
LocalDB.load();

// ============================================================================
// FAÇADE API — 100% LOCALE ET ASYNCHRONE
// ============================================================================
const API = {
  addDaysToDate(dateStr, days) {
    return addDaysToDate(dateStr, days);
  },

  getDaysDiff(fromStr, toStr) {
    return getDaysDiff(fromStr, toStr);
  },

  isSupabaseConnected() {
    return Boolean(typeof window !== 'undefined' && window.SupabaseService && window.SupabaseService.isAvailable());
  },

  async syncLocalToSupabase(farmId) {
    if (typeof window !== 'undefined' && window.SupabaseService) {
      return await window.SupabaseService.syncLocalToSupabase(farmId);
    }
    throw new Error('SupabaseService non disponible.');
  },

  getToken() {
    return localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
  },

  setToken(token) {
    if (token) {
      localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    }
  },

  getCurrentFarmId() {
    return localStorage.getItem(LOCAL_STORAGE_CURRENT_FARM_KEY);
  },

  setCurrentFarmId(farmId) {
    if (farmId) {
      localStorage.setItem(LOCAL_STORAGE_CURRENT_FARM_KEY, farmId);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_CURRENT_FARM_KEY);
    }
  },

  // Simule une micro-latence pour fluidité UX
  async delay(ms = 20) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Récupère l'utilisateur actuellement connecté via token
  getLoggedUser() {
    const token = this.getToken();
    if (!token) return null;
    const db = LocalDB.load();
    const parts = token.split('-');
    const userId = Number(parts[1]);
    return db.users.find(u => u.id === userId) || null;
  },

  // --- AUTHENTIFICATION ---
  async login(email, password) {
    if (this.isSupabaseConnected()) {
      const res = await window.SupabaseService.signIn(email, password);
      if (res.token) this.setToken(res.token);
      return res;
    }
    await this.delay();
    const db = LocalDB.load();
    const user = db.users.find(u => u.email.toLowerCase() === (email || '').trim().toLowerCase());
    if (!user || user.password !== password) {
      throw new Error('Identifiants incorrects. Veuillez vérifier votre adresse e-mail et votre mot de passe.');
    }
    const token = `local-${user.id}-${Date.now()}`;
    this.setToken(token);

    const userFarmIds = db.user_farms.filter(uf => uf.user_id === user.id).map(uf => uf.farm_id);
    const farms = db.farms.filter(f => userFarmIds.includes(f.id));

    return {
      message: 'Connexion réussie',
      token,
      user: { id: user.id, name: user.name, email: user.email },
      farms
    };
  },

  async register(name, email, password) {
    if (this.isSupabaseConnected()) {
      const res = await window.SupabaseService.signUp(email, password, name);
      if (res.token) this.setToken(res.token);
      return res;
    }
    await this.delay();
    const db = LocalDB.load();
    const cleanEmail = (email || '').trim().toLowerCase();
    if (db.users.some(u => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('Cette adresse e-mail est déjà utilisée par un autre compte.');
    }
    const newUser = {
      id: LocalDB.nextId('users'),
      name: name.trim(),
      email: cleanEmail,
      password: password,
      created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    LocalDB.save(db);

    const token = `local-${newUser.id}-${Date.now()}`;
    this.setToken(token);

    return {
      message: 'Compte créé avec succès',
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
      farms: []
    };
  },

  async forgotPassword(email) {
    await this.delay();
    const db = LocalDB.load();
    const user = db.users.find(u => u.email.toLowerCase() === (email || '').trim().toLowerCase());
    if (!user) {
      throw new Error('Aucun compte associé à cette adresse e-mail.');
    }
    const code = '123456';
    db.password_resets = db.password_resets || [];
    db.password_resets.push({
      email: user.email,
      code,
      expires_at: Date.now() + 15 * 60 * 1000
    });
    LocalDB.save(db);
    return {
      message: `Code de vérification généré : ${code}`,
      code
    };
  },

  async resetPassword(email, code, newPassword) {
    await this.delay();
    const db = LocalDB.load();
    const user = db.users.find(u => u.email.toLowerCase() === (email || '').trim().toLowerCase());
    if (!user) {
      throw new Error('Utilisateur introuvable.');
    }
    if (code !== '123456') {
      const reset = (db.password_resets || []).find(r => r.email === user.email && r.code === code);
      if (!reset) {
        throw new Error('Code de vérification invalide ou expiré.');
      }
    }
    user.password = newPassword;
    LocalDB.save(db);
    return { message: 'Mot de passe réinitialisé avec succès.' };
  },

  async getMe() {
    if (this.isSupabaseConnected()) {
      const user = await window.SupabaseService.getCurrentUser();
      if (!user) {
        throw new Error('Non authentifié');
      }
      const farms = await window.SupabaseService.getFarms();
      return {
        user,
        farms
      };
    }
    await this.delay();
    const user = this.getLoggedUser();
    if (!user) {
      throw new Error('Non authentifié');
    }
    const db = LocalDB.load();
    const userFarmIds = db.user_farms.filter(uf => uf.user_id === user.id).map(uf => uf.farm_id);
    const farms = db.farms.filter(f => userFarmIds.includes(f.id));
    return {
      user: { id: user.id, name: user.name, email: user.email },
      farms
    };
  },

  // --- GESTION DES FERMES ---
  async getFarms() {
    if (this.isSupabaseConnected()) {
      const farms = await window.SupabaseService.getFarms();
      return { farms };
    }
    await this.delay();
    const user = this.getLoggedUser();
    if (!user) throw new Error('Non authentifié');
    const db = LocalDB.load();
    const userFarmIds = db.user_farms.filter(uf => uf.user_id === user.id).map(uf => uf.farm_id);
    const farms = db.farms.filter(f => userFarmIds.includes(f.id));
    return { farms };
  },

  async createFarm(farmData) {
    if (this.isSupabaseConnected()) {
      const farm = await window.SupabaseService.createFarm(farmData);
      return { farm };
    }
    await this.delay();
    const user = this.getLoggedUser();
    if (!user) throw new Error('Non authentifié');
    const db = LocalDB.load();
    const newFarm = {
      id: LocalDB.nextId('farms'),
      owner_id: user.id,
      name: farmData.name.trim(),
      owner_name: farmData.owner_name?.trim() || user.name,
      country: farmData.country?.trim() || 'Togo',
      locality: farmData.locality?.trim() || 'Lomé',
      farm_type: farmData.farm_type || 'Élevage mixte',
      currency: farmData.currency || 'FCFA',
      start_date: farmData.start_date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };
    db.farms.push(newFarm);
    db.user_farms.push({ user_id: user.id, farm_id: newFarm.id, role: 'proprietaire' });

    // Activer par défaut Poules et Canards
    db.farm_species.push({ farm_id: newFarm.id, species_id: 'poules', is_active: 1 });
    db.farm_species.push({ farm_id: newFarm.id, species_id: 'canards', is_active: 1 });

    LocalDB.save(db);
    return { message: 'Ferme créée avec succès.', farm: newFarm };
  },

  async getFarm(farmId) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const farm = db.farms.find(f => f.id === fId);
    if (!farm) throw new Error('Ferme introuvable');
    return { farm };
  },

  async updateFarm(farmId, farmData) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const farm = db.farms.find(f => f.id === fId);
    if (!farm) throw new Error('Ferme introuvable');
    Object.assign(farm, farmData);
    LocalDB.save(db);
    return { message: 'Ferme mise à jour.', farm };
  },

  async deleteFarm(farmId) {
    await this.delay();
    const user = this.getLoggedUser();
    if (!user) throw new Error('Non authentifié');
    const db = LocalDB.load();
    const fId = Number(farmId);

    // Vérifier l'existence de la ferme
    const farmIdx = (db.farms || []).findIndex(f => f.id === fId);
    if (farmIdx === -1) {
      throw new Error('Exploitation introuvable.');
    }

    // Vérifier les autorisations de l'utilisateur (propriétaire ou membre autorisé)
    const isOwnerOrMember = (db.user_farms || []).some(uf => uf.user_id === user.id && uf.farm_id === fId) ||
                            db.farms[farmIdx].owner_id === user.id;
    if (!isOwnerOrMember) {
      throw new Error('Vous n\'avez pas l\'autorisation de supprimer cette exploitation.');
    }

    const farmName = db.farms[farmIdx].name;

    // Suppression relationnelle en cascade pour cette exploitation UNIQUEMENT
    db.farms.splice(farmIdx, 1);
    db.user_farms = (db.user_farms || []).filter(uf => uf.farm_id !== fId);
    db.farm_species = (db.farm_species || []).filter(fs => fs.farm_id !== fId);
    db.categories = (db.categories || []).filter(c => c.farm_id !== fId);

    // Supprimer uniquement les espèces personnalisées spécifiques à cette ferme
    db.species = (db.species || []).filter(s => s.is_system || s.farm_id !== fId);

    db.lots = (db.lots || []).filter(l => l.farm_id !== fId);
    db.animals = (db.animals || []).filter(a => a.farm_id !== fId);
    db.movements = (db.movements || []).filter(m => m.farm_id !== fId);
    db.reproductions = (db.reproductions || []).filter(r => r.farm_id !== fId);
    db.egg_collections = (db.egg_collections || []).filter(e => e.farm_id !== fId);
    db.incubations = (db.incubations || []).filter(i => i.farm_id !== fId);
    db.health_treatments = (db.health_treatments || []).filter(h => h.farm_id !== fId);
    db.feeds = (db.feeds || []).filter(f => f.farm_id !== fId);
    db.feed_logs = (db.feed_logs || []).filter(fl => fl.farm_id !== fId);
    db.building_maintenance = (db.building_maintenance || []).filter(bm => bm.farm_id !== fId);
    db.contacts = (db.contacts || []).filter(c => c.farm_id !== fId);
    db.commercial_transactions = (db.commercial_transactions || []).filter(t => t.farm_id !== fId);
    db.financial_records = (db.financial_records || []).filter(fr => fr.farm_id !== fId);
    db.duckling_classifications = (db.duckling_classifications || []).filter(dc => dc.farm_id !== fId);
    db.chick_classifications = (db.chick_classifications || []).filter(cc => cc.farm_id !== fId);
    db.custom_alerts = (db.custom_alerts || []).filter(ca => ca.farm_id !== fId);

    if (Array.isArray(db.buildings)) {
      db.buildings = db.buildings.filter(b => b.farm_id !== fId);
    }
    if (Array.isArray(db.notifications)) {
      db.notifications = db.notifications.filter(n => n.farm_id !== fId);
    }

    LocalDB.save(db);

    // Calculer les fermes restantes pour l'utilisateur
    const remainingUserFarmIds = (db.user_farms || []).filter(uf => uf.user_id === user.id).map(uf => uf.farm_id);
    const remainingFarms = (db.farms || []).filter(f => remainingUserFarmIds.includes(f.id));

    return {
      success: true,
      message: `L'exploitation « ${farmName} » a été supprimée avec succès.`,
      remaining_farms: remainingFarms
    };
  },

  // --- ESPÈCES (« MES ANIMAUX ») ---
  async getSpecies(farmId) {
    if (this.isSupabaseConnected()) {
      const species = await window.SupabaseService.getSpecies(farmId);
      return { species };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    const farmSpMap = {};
    (db.farm_species || []).filter(fs => fs.farm_id === fId).forEach(fs => {
      farmSpMap[fs.species_id] = !!fs.is_active;
    });

    // Compter les effectifs et lots
    const activeAnimals = (db.animals || []).filter(a => a.farm_id === fId && a.status === 'actif');
    const lots = (db.lots || []).filter(l => l.farm_id === fId && l.status === 'actif');

    const defaultSpecies = LocalDB.getDefaultSpecies();
    const defaultMap = {};
    defaultSpecies.forEach(ds => {
      defaultMap[ds.id] = ds.categories || [];
    });

    const rawSpeciesList = Array.isArray(db.species) ? db.species : [];

    const species = rawSpeciesList.map(s => {
      const spAnimals = activeAnimals.filter(a => a.species_id === s.id);
      const head_count = spAnimals.reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);
      const lots_count = lots.filter(l => l.species_id === s.id).length;

      // Résolution garantie des catégories
      let categories = [];
      if (Array.isArray(s.categories) && s.categories.length > 0) {
        categories = s.categories;
      } else {
        const dbCats = (db.categories || []).filter(c => c.species_id === s.id && (c.farm_id === null || c.farm_id === fId || c.is_system));
        if (dbCats.length > 0) {
          categories = dbCats.map(c => ({ name: c.name, gender: c.default_gender || 'MIXTE' }));
        } else if (defaultMap[s.id] && defaultMap[s.id].length > 0) {
          categories = defaultMap[s.id];
        }
      }

      // Normaliser chaque catégorie pour garantir que c.name existe
      const safeCategories = (Array.isArray(categories) ? categories : []).map(c => {
        if (typeof c === 'string') {
          return { name: c, gender: 'MIXTE' };
        }
        return { name: (c && c.name ? String(c.name) : ''), gender: (c && c.gender ? c.gender : 'MIXTE') };
      }).filter(c => c.name.length > 0);

      return {
        ...s,
        is_active: farmSpMap[s.id] !== undefined ? (farmSpMap[s.id] ? 1 : 0) : (s.is_system ? 1 : 0),
        categories: safeCategories,
        head_count,
        live_count: head_count, // Garanti disponible et numérique pour .toLocaleString()
        lots_count
      };
    });

    return { species };
  },

  async toggleSpecies(farmId, species_id, is_active) {
    if (this.isSupabaseConnected()) {
      await window.SupabaseService.toggleSpecies(farmId, species_id, is_active);
      return { message: 'Statut de l\'espèce mis à jour.', species_id, is_active: is_active ? 1 : 0 };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const idx = db.farm_species.findIndex(fs => fs.farm_id === fId && fs.species_id === species_id);
    if (idx >= 0) {
      db.farm_species[idx].is_active = is_active ? 1 : 0;
    } else {
      db.farm_species.push({ farm_id: fId, species_id, is_active: is_active ? 1 : 0 });
    }
    LocalDB.save(db);
    return { message: 'Statut de l\'espèce mis à jour.', species_id, is_active: is_active ? 1 : 0 };
  },

  async addCustomSpecies(farmId, speciesData) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    const nameTrimmed = (speciesData && speciesData.name ? String(speciesData.name) : '').trim();
    if (!nameTrimmed) {
      throw new Error("Le nom de l'espèce est obligatoire.");
    }

    // Contrôle anti-doublon insensible à la casse
    const isDuplicate = (db.species || []).some(s => s.name && s.name.trim().toLowerCase() === nameTrimmed.toLowerCase());
    if (isDuplicate) {
      throw new Error(`Une espèce avec le nom « ${nameTrimmed} » existe déjà.`);
    }

    const spId = nameTrimmed.toLowerCase().replace(/[^a-z0-9]/gi, '_') + '_' + Date.now();

    // Normalisation des catégories initiales (supporte categories et initial_categories)
    const rawCats = speciesData.categories || speciesData.initial_categories || [];
    const normalizedCats = (Array.isArray(rawCats) ? rawCats : []).map(c => {
      if (typeof c === 'string') {
        return { name: c.trim(), gender: 'MIXTE' };
      }
      return { name: (c && c.name ? String(c.name) : '').trim(), gender: (c && c.gender ? c.gender : 'MIXTE') };
    }).filter(c => c.name.length > 0);

    const newSp = {
      id: spId,
      name: nameTrimmed,
      icon: (speciesData.icon ? String(speciesData.icon).trim() : '') || '🐾',
      description: (speciesData.description ? String(speciesData.description).trim() : '') || 'Espèce personnalisée',
      categories: normalizedCats,
      is_system: 0,
      farm_id: fId
    };

    if (!Array.isArray(db.species)) db.species = [];
    if (!Array.isArray(db.farm_species)) db.farm_species = [];
    if (!Array.isArray(db.categories)) db.categories = [];

    db.species.push(newSp);
    db.farm_species.push({ farm_id: fId, species_id: spId, is_active: 1 });

    normalizedCats.forEach(c => {
      db.categories.push({
        id: LocalDB.nextId('categories'),
        farm_id: fId,
        species_id: spId,
        name: c.name,
        default_gender: c.gender || 'MIXTE',
        is_system: 0,
        is_active: 1
      });
    });

    LocalDB.save(db);
    return { 
      message: `L'espèce personnalisée « ${nameTrimmed} » a été ajoutée et activée.`, 
      species: {
        ...newSp,
        is_active: 1,
        head_count: 0,
        live_count: 0,
        lots_count: 0
      }
    };
  },

  // --- CATÉGORIES ---
  async getCategories(farmId, speciesId = null) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let cats = db.categories.filter(c => (c.farm_id === null || c.farm_id === fId) && c.is_active);
    if (speciesId) {
      cats = cats.filter(c => c.species_id === speciesId);
    }
    return { categories: cats };
  },

  async addCategory(farmId, categoryData) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const newCat = {
      id: LocalDB.nextId('categories'),
      farm_id: fId,
      species_id: categoryData.species_id,
      name: categoryData.name,
      default_gender: categoryData.default_gender || 'MIXTE',
      is_system: 0,
      is_active: 1
    };
    db.categories.push(newCat);
    LocalDB.save(db);
    return { message: 'Catégorie ajoutée.', category: newCat };
  },

  // --- LOTS & BÂTIMENTS ---
  async getLots(farmId, filters = {}) {
    if (this.isSupabaseConnected()) {
      const lots = await window.SupabaseService.getLots(farmId);
      return { lots };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let lots = db.lots.filter(l => l.farm_id === fId);
    if (filters && filters.status) {
      lots = lots.filter(l => l.status === filters.status);
    }
    const animals = db.animals.filter(a => a.farm_id === fId && a.status === 'actif');

    const result = lots.map(l => {
      const lAnimals = animals.filter(a => a.lot_id === l.id);
      const current_occupancy = lAnimals.reduce((s, a) => s + (Number(a.current_quantity) || 0), 0);
      const sp = db.species.find(s => s.id === l.species_id);
      const cap = Number(l.capacity) || 0;
      const percent = cap > 0 ? Math.min(100, Math.round((current_occupancy / cap) * 100)) : 0;
      return {
        ...l,
        capacity: cap,
        current_headcount: current_occupancy,
        current_occupancy,
        occupancy: current_occupancy,
        active_batches_count: lAnimals.length,
        animals_count: lAnimals.length,
        percent,
        animals: lAnimals.map(a => {
          const asp = db.species.find(s => s.id === a.species_id);
          return {
            ...a,
            species_name: asp ? asp.name : a.species_id,
            species_icon: asp ? asp.icon : '🐾'
          };
        }),
        species_name: sp ? sp.name : null,
        species_icon: sp ? sp.icon : '🛖'
      };
    });

    return { lots: result };
  },

  async getLot(farmId, lotId) {
    await this.delay();
    const res = await this.getLots(farmId);
    const lot = (res.lots || []).find(l => l.id === Number(lotId));
    if (!lot) throw new Error('Installation / Bâtiment introuvable');
    return { lot };
  },

  async getBuilding(farmId, buildingId) {
    return this.getLot(farmId, buildingId).then(res => ({ building: res.lot }));
  },

  async createLot(farmId, lotData) {
    if (this.isSupabaseConnected()) {
      const lot = await window.SupabaseService.createLot(farmId, lotData);
      return { message: 'Installation créée avec succès.', lot };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const newLot = {
      id: LocalDB.nextId('lots'),
      farm_id: fId,
      name: lotData.name.trim(),
      species_id: lotData.species_id || null,
      location: lotData.location?.trim() || null,
      capacity: lotData.capacity ? Number(lotData.capacity) : 0,
      building_type: lotData.building_type || 'autre',
      notes: lotData.notes?.trim() || null,
      status: lotData.status || 'actif',
      created_at: new Date().toISOString()
    };
    db.lots.push(newLot);
    LocalDB.save(db);
    return { message: 'Installation créée avec succès.', lot: newLot };
  },

  async updateLot(farmId, lotId, lotData) {
    if (this.isSupabaseConnected()) {
      const lot = await window.SupabaseService.updateLot(farmId, lotId, lotData);
      return { message: 'Installation mise à jour avec succès.', lot };
    }
    await this.delay();
    const db = LocalDB.load();
    const lId = Number(lotId);
    const fId = Number(farmId);
    const lot = db.lots.find(l => l.id === lId && l.farm_id === fId);
    if (!lot) throw new Error('Installation / Bâtiment introuvable');
    if (lotData.name !== undefined) lot.name = String(lotData.name).trim();
    if (lotData.species_id !== undefined) lot.species_id = lotData.species_id || null;
    if (lotData.location !== undefined) lot.location = lotData.location ? String(lotData.location).trim() : null;
    if (lotData.capacity !== undefined) lot.capacity = Math.max(0, parseInt(lotData.capacity, 10) || 0);
    if (lotData.building_type !== undefined) lot.building_type = lotData.building_type || 'autre';
    if (lotData.status !== undefined) lot.status = lotData.status || 'actif';
    if (lotData.notes !== undefined) lot.notes = lotData.notes ? String(lotData.notes).trim() : null;
    lot.updated_at = new Date().toISOString();
    LocalDB.save(db);
    return { message: 'Installation mise à jour avec succès.', lot };
  },

  async deleteLot(farmId, lotId) {
    if (this.isSupabaseConnected()) {
      return await window.SupabaseService.deleteLot(farmId, lotId);
    }
    await this.delay();
    const db = LocalDB.load();
    const lId = Number(lotId);
    const fId = Number(farmId);
    const hasAnimals = db.animals.some(a => a.lot_id === lId && a.farm_id === fId && a.current_quantity > 0 && a.status === 'actif');
    if (hasAnimals) {
      throw new Error('Impossible de supprimer ce lot car il héberge encore des animaux actifs. Transférez-les d\'abord.');
    }
    const idx = db.lots.findIndex(l => l.id === lId && l.farm_id === fId);
    if (idx >= 0) {
      db.lots.splice(idx, 1);
      LocalDB.save(db);
    }
    return { message: 'Lot supprimé avec succès.' };
  },

  // --- CHEPTEL (ANIMAUX & LOTS) ---
  async getAnimals(farmId, filters = {}) {
    if (this.isSupabaseConnected()) {
      const animals = await window.SupabaseService.getAnimals(farmId, filters);
      return { animals };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    let animals = db.animals.filter(a => a.farm_id === fId);

    if (filters.status) {
      animals = animals.filter(a => a.status === filters.status);
    } else {
      animals = animals.filter(a => a.status === 'actif');
    }

    if (filters.species_id && filters.species_id !== 'toutes') {
      animals = animals.filter(a => a.species_id === filters.species_id);
    }
    if (filters.category_name && filters.category_name !== 'toutes') {
      animals = animals.filter(a => a.category_name === filters.category_name);
    }
    if (filters.lot_id && filters.lot_id !== 'tous') {
      animals = animals.filter(a => a.lot_id === Number(filters.lot_id));
    }
    if (filters.gender && filters.gender !== 'tous') {
      animals = animals.filter(a => a.gender === filters.gender);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      animals = animals.filter(a =>
        (a.code || '').toLowerCase().includes(q) ||
        (a.breed || '').toLowerCase().includes(q) ||
        (a.observations || '').toLowerCase().includes(q)
      );
    }

    // Enrichir avec infos espèce et lot
    const enriched = animals.map(a => {
      const sp = db.species.find(s => s.id === a.species_id);
      const lot = db.lots.find(l => l.id === a.lot_id);
      return {
        ...a,
        species_name: sp ? sp.name : a.species_id,
        species_icon: sp ? sp.icon : '🐾',
        lot_name: lot ? lot.name : null
      };
    });

    return { animals: enriched };
  },

  async getAnimal(farmId, animalId) {
    await this.delay();
    const db = LocalDB.load();
    const aId = Number(animalId);
    const fId = Number(farmId);
    const animal = db.animals.find(a => a.id === aId && a.farm_id === fId);
    if (!animal) throw new Error('Animal introuvable');
    const sp = db.species.find(s => s.id === animal.species_id);
    const lot = db.lots.find(l => l.id === animal.lot_id);
    const movements = db.movements.filter(m => m.animal_id === aId && m.farm_id === fId);

    return {
      animal: {
        ...animal,
        species_name: sp ? sp.name : animal.species_id,
        species_icon: sp ? sp.icon : '🐾',
        lot_name: lot ? lot.name : null
      },
      movements
    };
  },

  async createAnimal(farmId, animalData) {
    if (this.isSupabaseConnected()) {
      const animal = await window.SupabaseService.createAnimal(farmId, animalData);
      return { message: 'Animal / Lot enregistré avec succès.', animal };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const user = this.getLoggedUser();

    const code = animalData.code ? animalData.code.trim() : `AN-${Date.now().toString().slice(-6)}`;
    const qty = animalData.initial_quantity ? parseInt(animalData.initial_quantity, 10) : 1;

    const poultryRule = getYoungPoultryRule(animalData.species_id, animalData.category_name);
    const maturityDate = (poultryRule && animalData.birth_date) ? addDaysToDate(animalData.birth_date, poultryRule.maturity_days) : null;

    const newAnimal = {
      id: LocalDB.nextId('animals'),
      farm_id: fId,
      code,
      type: animalData.type || (qty > 1 ? 'lot' : 'individuel'),
      species_id: animalData.species_id,
      category_name: animalData.category_name,
      breed: animalData.breed?.trim() || null,
      gender: animalData.gender || 'MIXTE',
      birth_date: animalData.birth_date || null,
      maturity_date: maturityDate,
      purchase_date: animalData.purchase_date || null,
      initial_quantity: qty,
      current_quantity: qty,
      current_weight: animalData.current_weight ? parseFloat(animalData.current_weight) : null,
      purchase_price: animalData.purchase_price ? parseFloat(animalData.purchase_price) : null,
      lot_id: animalData.lot_id ? Number(animalData.lot_id) : null,
      observations: animalData.observations?.trim() || null,
      status: 'actif',
      created_at: new Date().toISOString()
    };
    db.animals.push(newAnimal);

    // Mouvement d'entrée initial (Achat ou Naissance)
    const movType = newAnimal.purchase_price ? 'achat' : 'naissance';
    db.movements.push({
      id: LocalDB.nextId('movements'),
      farm_id: fId,
      animal_id: newAnimal.id,
      type: movType,
      date: newAnimal.purchase_date || newAnimal.birth_date || new Date().toISOString().split('T')[0],
      species_id: newAnimal.species_id,
      category_name: newAnimal.category_name,
      quantity: qty,
      unit_price: newAnimal.purchase_price ? (newAnimal.purchase_price / qty) : null,
      total_price: newAnimal.purchase_price || null,
      from_lot_id: null,
      to_lot_id: newAnimal.lot_id,
      observations: `Entrée initiale : ${newAnimal.code} (${newAnimal.category_name})`,
      created_by: user ? user.id : 1
    });

    LocalDB.save(db);
    return { message: 'Fiche créée avec succès.', animal: newAnimal };
  },

  async updateAnimalLot(farmId, animalId, animalData) {
    await this.delay();
    const db = LocalDB.load();
    const aId = Number(animalId);
    const fId = Number(farmId);
    const user = this.getLoggedUser();
    const animal = db.animals.find(a => a.id === aId && a.farm_id === fId);
    if (!animal) throw new Error('Lot d\'animaux introuvable');

    const oldCurrentQty = Number(animal.current_quantity) || 0;
    const oldInitialQty = Number(animal.initial_quantity) || 0;
    const oldLotId = animal.lot_id !== undefined && animal.lot_id !== null ? Number(animal.lot_id) : null;

    const newCurrentQty = animalData.current_quantity !== undefined ? Math.max(0, parseInt(animalData.current_quantity, 10) || 0) : oldCurrentQty;
    const newInitialQty = animalData.initial_quantity !== undefined ? Math.max(0, parseInt(animalData.initial_quantity, 10) || 0) : oldInitialQty;
    const newLotId = animalData.lot_id !== undefined
      ? (animalData.lot_id !== '' && animalData.lot_id !== null ? Number(animalData.lot_id) : null)
      : oldLotId;

    const todayStr = new Date().toISOString().split('T')[0];
    const movementDate = animalData.date || todayStr;

    // 1. Règle critique : Séparation quantité initiale vs actuelle et traçabilité stricte
    if (newCurrentQty !== oldCurrentQty) {
      const diff = newCurrentQty - oldCurrentQty;
      const movType = diff > 0 ? 'entree' : 'sortie';
      db.movements.push({
        id: LocalDB.nextId('movements'),
        farm_id: fId,
        animal_id: animal.id,
        type: movType,
        date: movementDate,
        species_id: animalData.species_id || animal.species_id,
        category_name: animalData.category_name || animal.category_name,
        quantity: Math.abs(diff),
        unit_price: null,
        total_price: null,
        from_lot_id: diff < 0 ? oldLotId : null,
        to_lot_id: diff > 0 ? (newLotId || oldLotId) : null,
        observations: `Correction d'inventaire sur le lot ${animal.code || animal.id} : ${oldCurrentQty} ➔ ${newCurrentQty} têtes (${diff > 0 ? '+' + diff : diff}). ${animalData.notes || animalData.observations || ''}`.trim(),
        created_by: user ? user.id : 1,
        created_at: new Date().toISOString()
      });
    }

    // 2. Traçabilité lors du transfert entre bâtiments
    if (newLotId !== oldLotId && newCurrentQty > 0) {
      const fromLot = db.lots.find(l => l.id === oldLotId);
      const toLot = db.lots.find(l => l.id === newLotId);
      db.movements.push({
        id: LocalDB.nextId('movements'),
        farm_id: fId,
        animal_id: animal.id,
        type: 'transfert',
        date: movementDate,
        species_id: animalData.species_id || animal.species_id,
        category_name: animalData.category_name || animal.category_name,
        quantity: newCurrentQty,
        unit_price: null,
        total_price: null,
        from_lot_id: oldLotId,
        to_lot_id: newLotId,
        observations: `Transfert de bâtiment : ${fromLot ? fromLot.name : 'Non assigné'} ➔ ${toLot ? toLot.name : 'Non assigné'} (${newCurrentQty} têtes)`,
        created_by: user ? user.id : 1,
        created_at: new Date().toISOString()
      });
    }

    // 3. Mise à jour des champs du lot d'animaux
    if (animalData.code !== undefined) animal.code = String(animalData.code).trim();
    if (animalData.species_id !== undefined) animal.species_id = animalData.species_id;
    if (animalData.category_name !== undefined) animal.category_name = animalData.category_name;
    if (animalData.birth_date !== undefined) animal.birth_date = animalData.birth_date || null;
    animal.initial_quantity = newInitialQty;
    animal.current_quantity = newCurrentQty;
    animal.lot_id = newLotId;
    if (animalData.status !== undefined) {
      animal.status = animalData.status;
    } else if (newCurrentQty === 0 && animal.status === 'actif') {
      animal.status = 'traite';
    }
    if (animalData.observations !== undefined) animal.observations = animalData.observations ? String(animalData.observations).trim() : null;
    if (animalData.notes !== undefined && !animal.observations) animal.observations = animalData.notes ? String(animalData.notes).trim() : null;

    // Conserver les autres propriétés éventuellement passées
    for (const [key, val] of Object.entries(animalData)) {
      if (!['initial_quantity', 'current_quantity', 'lot_id', 'code', 'species_id', 'category_name', 'birth_date', 'status', 'observations', 'notes', 'date'].includes(key)) {
        animal[key] = val;
      }
    }

    // 4. Recalcul automatique de la date de maturité si volaille juvénile
    const poultryRule = getYoungPoultryRule(animal.species_id, animal.category_name);
    if (poultryRule && animal.birth_date) {
      animal.maturity_date = addDaysToDate(animal.birth_date, poultryRule.maturity_days);
    } else if (!poultryRule) {
      animal.maturity_date = null;
    }

    animal.updated_at = new Date().toISOString();
    LocalDB.save(db);
    return { message: 'Lot d\'animaux mis à jour avec succès.', animal };
  },

  async updateAnimal(farmId, animalId, animalData) {
    if (this.isSupabaseConnected()) {
      const animal = await window.SupabaseService.updateAnimal(farmId, animalId, animalData);
      return { message: 'Lot d\'animaux mis à jour avec succès.', animal };
    }
    return this.updateAnimalLot(farmId, animalId, animalData);
  },

  // --- MOUVEMENTS DU CHEPTEL ---
  async getMovements(farmId, filters = {}) {
    if (this.isSupabaseConnected()) {
      const movements = await window.SupabaseService.getMovements(farmId, filters);
      return { movements };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    let movs = db.movements.filter(m => m.farm_id === fId);

    if (filters.type && filters.type !== 'tous') {
      movs = movs.filter(m => m.type === filters.type);
    }
    if (filters.species_id && filters.species_id !== 'toutes') {
      movs = movs.filter(m => m.species_id === filters.species_id);
    }
    if (filters.date_start) {
      movs = movs.filter(m => m.date >= filters.date_start);
    }
    if (filters.date_end) {
      movs = movs.filter(m => m.date <= filters.date_end);
    }

    movs.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);

    const enriched = movs.map(m => {
      const sp = db.species.find(s => s.id === m.species_id);
      const fromLot = db.lots.find(l => l.id === m.from_lot_id);
      const toLot = db.lots.find(l => l.id === m.to_lot_id);
      return {
        ...m,
        species_name: sp ? sp.name : m.species_id,
        species_icon: sp ? sp.icon : '🐾',
        from_lot_name: fromLot ? fromLot.name : null,
        to_lot_name: toLot ? toLot.name : null
      };
    });

    return { movements: enriched };
  },

  async createMovement(farmId, data) {
    if (this.isSupabaseConnected()) {
      const movement = await window.SupabaseService.createMovement(farmId, data);
      return { message: 'Mouvement enregistré avec succès.', movement };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const user = this.getLoggedUser();

    const qty = parseInt(data.quantity, 10);
    if (!qty || qty <= 0) {
      throw new Error('La quantité doit être supérieure à zéro.');
    }

    const type = data.type;
    const date = data.date || new Date().toISOString().split('T')[0];
    const unit_price = data.unit_price ? parseFloat(data.unit_price) : null;
    const total_price = data.total_price ? parseFloat(data.total_price) : (unit_price ? unit_price * qty : null);

    // Contrôles de stock pour les sorties (vente, deces, perte, transfert, changement_categorie)
    if (['vente', 'deces', 'perte', 'transfert_lot', 'changement_categorie'].includes(type)) {
      if (data.animal_id) {
        const animal = db.animals.find(a => a.id === Number(data.animal_id) && a.farm_id === fId);
        if (!animal) throw new Error('Fiche animale introuvable.');
        if (animal.current_quantity < qty) {
          throw new Error(`Quantité insuffisante en stock. Disponible sur cette fiche : ${animal.current_quantity}`);
        }
        animal.current_quantity -= qty;
        if (animal.current_quantity <= 0) {
          animal.status = 'sorti';
        }
      } else {
        // Déduire du cheptel global de la catégorie dans la ferme
        const candidates = db.animals.filter(a =>
          a.farm_id === fId &&
          a.species_id === data.species_id &&
          a.category_name === data.category_name &&
          a.status === 'actif' &&
          a.current_quantity > 0
        );
        const totalDispo = candidates.reduce((s, a) => s + a.current_quantity, 0);
        if (totalDispo < qty) {
          throw new Error(`Quantité insuffisante en stock. Disponible pour ${data.category_name} : ${totalDispo}`);
        }
        let remainingToDeduct = qty;
        for (const a of candidates) {
          if (remainingToDeduct <= 0) break;
          const ded = Math.min(a.current_quantity, remainingToDeduct);
          a.current_quantity -= ded;
          remainingToDeduct -= ded;
          if (a.current_quantity <= 0) a.status = 'sorti';
        }
      }
    }

    // Gestion des entrées
    if (type === 'naissance' || type === 'achat') {
      if (data.animal_id) {
        const animal = db.animals.find(a => a.id === Number(data.animal_id) && a.farm_id === fId);
        if (animal) {
          animal.current_quantity += qty;
          animal.status = 'actif';
        }
      } else {
        // Créer une nouvelle fiche de lot pour accueillir les sujets
        const sp = db.species.find(s => s.id === data.species_id);
        const prefix = (sp ? sp.name.slice(0, 3).toUpperCase() : 'AN');
        db.animals.push({
          id: LocalDB.nextId('animals'),
          farm_id: fId,
          code: `${prefix}-${Date.now().toString().slice(-4)}`,
          type: qty > 1 ? 'lot' : 'individuel',
          species_id: data.species_id,
          category_name: data.category_name,
          breed: 'Standard',
          gender: data.category_name?.toLowerCase().includes('coq') || data.category_name?.toLowerCase().includes('mâle') ? 'M' : 'MIXTE',
          birth_date: type === 'naissance' ? date : null,
          purchase_date: type === 'achat' ? date : null,
          initial_quantity: qty,
          current_quantity: qty,
          current_weight: null,
          purchase_price: type === 'achat' ? total_price : null,
          lot_id: data.to_lot_id ? Number(data.to_lot_id) : null,
          observations: data.observations || `Entrée par ${type}`,
          status: 'actif',
          created_at: new Date().toISOString()
        });
      }

      // Synchroniser en compta si achat payant
      if (type === 'achat' && total_price > 0) {
        db.financial_records.push({
          id: LocalDB.nextId('financial_records'),
          farm_id: fId,
          type: 'depense',
          category: 'Achat d\'animaux',
          date,
          amount: total_price,
          payment_status: 'paye',
          payment_method: 'Espèces',
          species_id: data.species_id,
          lot_id: data.to_lot_id ? Number(data.to_lot_id) : null,
          title: `Achat cheptel : ${qty} ${data.category_name}`,
          notes: data.observations || null
        });
      }
    }

    // Gestion de la vente -> créer recette financière
    if (type === 'vente' && total_price > 0) {
      db.financial_records.push({
        id: LocalDB.nextId('financial_records'),
        farm_id: fId,
        type: 'recette',
        category: 'Vente animaux',
        date,
        amount: total_price,
        payment_status: 'paye',
        payment_method: 'Espèces',
        species_id: data.species_id,
        lot_id: data.from_lot_id ? Number(data.from_lot_id) : null,
        title: `Vente de ${qty} ${data.category_name}`,
        notes: data.observations || null
      });
    }

    // Gestion du transfert de lot
    if (type === 'transfert_lot' && data.to_lot_id) {
      // Créer ou ajouter dans le lot destinataire
      db.animals.push({
        id: LocalDB.nextId('animals'),
        farm_id: fId,
        code: `TR-${Date.now().toString().slice(-4)}`,
        type: 'lot',
        species_id: data.species_id,
        category_name: data.category_name,
        breed: 'Standard',
        gender: 'MIXTE',
        initial_quantity: qty,
        current_quantity: qty,
        lot_id: Number(data.to_lot_id),
        observations: `Transféré depuis un autre lot`,
        status: 'actif',
        created_at: new Date().toISOString()
      });
    }

    // Gestion du changement de catégorie (ne modifie pas le cheptel global)
    if (type === 'changement_categorie' && data.to_category) {
      db.animals.push({
        id: LocalDB.nextId('animals'),
        farm_id: fId,
        code: `EVO-${Date.now().toString().slice(-4)}`,
        type: 'lot',
        species_id: data.species_id,
        category_name: data.to_category,
        breed: 'Standard',
        gender: 'MIXTE',
        initial_quantity: qty,
        current_quantity: qty,
        lot_id: data.to_lot_id ? Number(data.to_lot_id) : null,
        observations: `Évolution depuis ${data.from_category || data.category_name}`,
        status: 'actif',
        created_at: new Date().toISOString()
      });
    }

    const newMov = {
      id: LocalDB.nextId('movements'),
      farm_id: fId,
      animal_id: data.animal_id ? Number(data.animal_id) : null,
      type,
      date,
      species_id: data.species_id,
      category_name: data.category_name,
      quantity: qty,
      unit_price,
      total_price,
      from_lot_id: data.from_lot_id ? Number(data.from_lot_id) : null,
      to_lot_id: data.to_lot_id ? Number(data.to_lot_id) : null,
      from_category: data.from_category || null,
      to_category: data.to_category || null,
      observations: data.observations || null,
      created_by: user ? user.id : 1
    };
    db.movements.push(newMov);

    LocalDB.save(db);
    return { message: 'Mouvement enregistré avec succès.', movement: newMov };
  },

  // --- TABLEAU DE BORD ---
  async getDashboard(farmId, speciesId = 'toutes', period = 'tous') {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    const activeAnimals = db.animals.filter(a => a.farm_id === fId && a.status === 'actif');
    const filteredAnimals = speciesId !== 'toutes'
      ? activeAnimals.filter(a => a.species_id === speciesId)
      : activeAnimals;

    const total_live_animals = filteredAnimals.reduce((s, a) => s + (Number(a.current_quantity) || 0), 0);

    // Répartition par espèce
    const farmSpMap = {};
    db.farm_species.filter(fs => fs.farm_id === fId && fs.is_active).forEach(fs => {
      farmSpMap[fs.species_id] = true;
    });

    const species_breakdown = db.species
      .filter(s => farmSpMap[s.id])
      .map(s => {
        const count = activeAnimals.filter(a => a.species_id === s.id).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);
        return {
          id: s.id,
          name: s.name,
          icon: s.icon,
          count
        };
      })
      .sort((a, b) => b.count - a.count);

    // Répartition par sexe
    const gender_breakdown = { M: 0, F: 0, MIXTE: 0 };
    filteredAnimals.forEach(a => {
      const g = (a.gender || 'MIXTE').toUpperCase();
      if (gender_breakdown[g] !== undefined) {
        gender_breakdown[g] += Number(a.current_quantity) || 0;
      }
    });

    // Répartition par catégorie
    const catMap = {};
    filteredAnimals.forEach(a => {
      const sp = db.species.find(s => s.id === a.species_id);
      const k = a.category_name || 'Autre';
      if (!catMap[k]) {
        catMap[k] = {
          category_name: k,
          species_icon: sp ? sp.icon : '🐾',
          species_name: sp ? sp.name : '',
          count: 0
        };
      }
      catMap[k].count += Number(a.current_quantity) || 0;
    });
    const category_breakdown = Object.values(catMap).sort((a, b) => b.count - a.count).slice(0, 10);

    // Filtrer les mouvements selon la période
    let movs = db.movements.filter(m => m.farm_id === fId);
    if (speciesId !== 'toutes') {
      movs = movs.filter(m => m.species_id === speciesId);
    }

    const now = new Date();
    if (period === 'today') {
      const today = now.toISOString().split('T')[0];
      movs = movs.filter(m => m.date === today);
    } else if (period === '7days') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      movs = movs.filter(m => m.date >= past);
    } else if (period === 'this_month') {
      const mStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      movs = movs.filter(m => m.date >= mStr);
    } else if (period === 'this_year') {
      const yStr = `${now.getFullYear()}-01-01`;
      movs = movs.filter(m => m.date >= yStr);
    }

    const births = movs.filter(m => m.type === 'naissance').reduce((s, m) => s + m.quantity, 0);
    const deaths = movs.filter(m => m.type === 'deces').reduce((s, m) => s + m.quantity, 0);
    const losses = movs.filter(m => m.type === 'perte').reduce((s, m) => s + m.quantity, 0);
    const purchases = movs.filter(m => m.type === 'achat').reduce((s, m) => s + m.quantity, 0);
    const sales = movs.filter(m => m.type === 'vente').reduce((s, m) => s + m.quantity, 0);
    const sales_revenue = movs.filter(m => m.type === 'vente').reduce((s, m) => s + (m.total_price || 0), 0);
    const purchases_expense = movs.filter(m => m.type === 'achat').reduce((s, m) => s + (m.total_price || 0), 0);

    const active_lots = db.lots.filter(l => l.farm_id === fId && (l.status === 'actif' || !l.status)).length;

    // V2 KPIs
    const active_gestations = db.reproductions.filter(r => r.farm_id === fId && ['en_attente', 'gestation_confirmee'].includes(r.status)).length;
    const total_eggs_laid = db.egg_collections.filter(e => e.farm_id === fId).reduce((s, e) => s + (e.eggs_laid || 0), 0);
    // Indicateurs et lots d'incubation réels
    const todayStr = now.toISOString().split('T')[0];
    const farmIncubations = (db.incubations || []).filter(i => i.farm_id === fId);
    const enrichedIncubations = farmIncubations.map(i => enrichIncubation(i, db, todayStr));
    const activeIncubationsList = enrichedIncubations.filter(i => i.status !== 'termine' && i.status !== 'annule');

    const total_eggs_incubated = activeIncubationsList.reduce((s, i) => s + (Number(i.eggs_count) || 0), 0);
    const active_incubations_count = activeIncubationsList.length;
    const upcoming_hatches_count = activeIncubationsList.filter(i => i.days_remaining >= 0 && i.days_remaining <= 7).length;
    const total_hatched_eggs = farmIncubations.reduce((s, i) => s + (Number(i.hatched_count) || 0), 0);

    const active_incubations = active_incubations_count;
    const termInc = farmIncubations.filter(i => i.status === 'termine');
    const totalYoung = termInc.reduce((s, i) => s + (i.live_young_count || 0), 0);
    const totalIncEggs = termInc.reduce((s, i) => s + (i.eggs_count || 0), 0);
    const avg_hatch_rate = totalIncEggs > 0 ? Math.round((totalYoung / totalIncEggs) * 1000) / 10 : 0;

    const low_stock_feeds = db.feeds.filter(f => f.farm_id === fId && f.stock_quantity <= f.min_threshold).length;
    const total_feed_distributed = db.feed_logs.filter(fl => fl.farm_id === fId && fl.type === 'distribution').reduce((s, fl) => s + (fl.quantity || 0), 0);

    const finRecords = db.financial_records.filter(fr => fr.farm_id === fId);
    const total_revenues = finRecords.filter(fr => fr.type === 'recette').reduce((s, fr) => s + (fr.amount || 0), 0);
    const total_expenses = finRecords.filter(fr => fr.type === 'depense').reduce((s, fr) => s + (fr.amount || 0), 0);
    const net_profit = total_revenues - total_expenses;

    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pending_health_care = db.health_treatments.filter(ht => ht.farm_id === fId && ht.next_care_date && ht.next_care_date <= in7days).length;

    // Suivi et alertes 12 semaines des canetons & 8 semaines des poussins
    const ducklingAlerts = this.computeDucklingAlertsFromDb(db, fId);
    const chickAlerts = this.computeChickAlertsFromDb(db, fId);
    const youngPoultryAlerts = this.computeYoungPoultryAlertsFromDb(db, fId);

    // Mouvements récents
    const recent_movements = db.movements
      .filter(m => m.farm_id === fId)
      .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
      .slice(0, 6)
      .map(m => {
        const sp = db.species.find(s => s.id === m.species_id);
        const an = db.animals.find(a => a.id === m.animal_id);
        return {
          ...m,
          species_name: sp ? sp.name : m.species_id,
          species_icon: sp ? sp.icon : '🐾',
          animal_code: an ? an.code : null
        };
      });

    // Tendances mensuelles
    const trendMap = {};
    db.movements.filter(m => m.farm_id === fId).forEach(m => {
      const month = (m.date || '').slice(0, 7);
      if (!month) return;
      if (!trendMap[month]) {
        trendMap[month] = { month, naissance: 0, achat: 0, vente: 0, deces: 0 };
      }
      if (['naissance', 'achat', 'vente', 'deces'].includes(m.type)) {
        trendMap[month][m.type] += m.quantity;
      }
    });
    const monthly_trends = Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));

    // Indicateurs dynamiques par espèce pour le nouveau tableau de bord
    const activeFarm = (db.farms || []).find(f => f.id === fId);
    const farmCurrency = (activeFarm && activeFarm.currency) || 'FCFA';

    const defaultSpeciesList = LocalDB.getDefaultSpecies();
    const defaultMap = {};
    defaultSpeciesList.forEach(ds => {
      defaultMap[ds.id] = ds.categories || [];
    });

    let targetSpeciesList = (db.species || []).filter(s => farmSpMap[s.id]);
    if (speciesId && speciesId !== 'toutes') {
      targetSpeciesList = targetSpeciesList.filter(s => s.id === speciesId);
    }

    const species_indicators = targetSpeciesList.map(s => {
      const spAnimals = activeAnimals.filter(a => a.species_id === s.id);
      const spTotal = spAnimals.reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);

      let cards = [];
      if (s.id === 'canards') {
        const males = spAnimals.filter(a => {
          const cat = (a.category_name || '').toLowerCase();
          if (cat.includes('caneton')) return false;
          return cat.includes('mâle') || cat === 'canards mâles' || (a.gender === 'M' && !cat.includes('cane'));
        }).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);

        const females = spAnimals.filter(a => {
          const cat = (a.category_name || '').toLowerCase();
          if (cat.includes('caneton')) return false;
          return cat === 'canes' || cat.includes('cane') || (a.gender === 'F' && !cat.includes('mâle'));
        }).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);

        const young = spAnimals.filter(a => {
          const cat = (a.category_name || '').toLowerCase();
          return cat.includes('caneton');
        }).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);

        cards = [
          { id: 'canards_males', label: 'Nombre de Canard', sublabel: 'Canards mâles adultes', count: males, has_accent_bar: true },
          { id: 'canes', label: 'Nombre de Canne', sublabel: 'Canes adultes', count: females },
          { id: 'canetons', label: 'Nombre de Canetons (-84 jours)', sublabel: 'Canetons (< 12 sem.)', count: young },
          { id: 'total_canards', label: 'Nombre total', sublabel: 'Total canards vivants', count: spTotal, is_total: true }
        ];
      } else if (s.id === 'poules') {
        const females = spAnimals.filter(a => {
          const cat = (a.category_name || '').toLowerCase();
          if (cat.includes('poussin')) return false;
          return cat === 'poules' || cat.includes('poule') || (a.gender === 'F' && !cat.includes('coq'));
        }).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);

        const males = spAnimals.filter(a => {
          const cat = (a.category_name || '').toLowerCase();
          if (cat.includes('poussin')) return false;
          return cat === 'coqs' || cat.includes('coq') || (a.gender === 'M' && !cat.includes('poule'));
        }).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);

        const young = spAnimals.filter(a => {
          const cat = (a.category_name || '').toLowerCase();
          return cat.includes('poussin');
        }).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);

        cards = [
          { id: 'poules', label: 'Nombre de Poule', sublabel: 'Poules adultes', count: females },
          { id: 'coqs', label: 'Nombre de coqs', sublabel: 'Coqs adultes', count: males },
          { id: 'poussins', label: 'Nombre de poussin (-56 jours)', sublabel: 'Poussins (< 8 sem.)', count: young },
          { id: 'total_poules', label: 'Nombre total', sublabel: 'Total volailles vivantes', count: spTotal, is_total: true }
        ];
      } else {
        let cats = [];
        if (Array.isArray(s.categories) && s.categories.length > 0) {
          cats = s.categories;
        } else if (defaultMap[s.id] && defaultMap[s.id].length > 0) {
          cats = defaultMap[s.id];
        } else {
          cats = (db.categories || []).filter(c => c.species_id === s.id);
        }

        if (cats && cats.length > 0) {
          cats.forEach(c => {
            const catName = typeof c === 'string' ? c : (c.name || 'Catégorie');
            const catCount = spAnimals.filter(a => (a.category_name || '').toLowerCase() === catName.toLowerCase()).reduce((sum, a) => sum + (Number(a.current_quantity) || 0), 0);
            cards.push({
              id: `${s.id}_${catName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              label: `Nombre de ${catName}`,
              sublabel: catName,
              count: catCount
            });
          });
        } else {
          cards.push({
            id: `${s.id}_sujets`,
            label: `Sujets actifs`,
            sublabel: s.name,
            count: spTotal
          });
        }

        cards.push({
          id: `total_${s.id}`,
          label: 'Nombre total',
          sublabel: `Total ${s.name}`,
          count: spTotal,
          is_total: true
        });
      }

      return {
        id: s.id,
        name: s.name,
        icon: s.icon || '🐾',
        total_count: spTotal,
        cards
      };
    });

    const solde_status = net_profit > 0 ? 'positif' : (net_profit < 0 ? 'negatif' : 'neutre');
    const financial_summary = {
      total_revenues,
      total_expenses,
      solde_gestion: net_profit,
      currency: farmCurrency,
      status: solde_status,
      formatted_revenues: `${total_revenues.toLocaleString('fr-FR')} ${farmCurrency}`,
      formatted_expenses: `${total_expenses.toLocaleString('fr-FR')} ${farmCurrency}`,
      formatted_solde: `${net_profit > 0 ? '+' : ''}${net_profit.toLocaleString('fr-FR')} ${farmCurrency}`
    };

    const pendingGrowthAlerts = (youngPoultryAlerts.lots || []).filter(l =>
      ['en_retard', 'aujourdhui', 'a_venir'].includes(l.status) && (Number(l.current_quantity) || 0) > 0
    );

    return {
      period,
      species_id: speciesId,
      farm_id: fId,
      farm_name: activeFarm ? activeFarm.name : 'Votre exploitation',
      currency: farmCurrency,
      species_indicators,
      financial_summary,
      growth_alerts: pendingGrowthAlerts,
      growth_alerts_summary: youngPoultryAlerts.summary,
      has_growth_alerts: pendingGrowthAlerts.length > 0,
      incubation_summary: {
        total_eggs_incubated,
        active_incubations_count,
        upcoming_hatches_count,
        total_hatched_eggs,
        avg_hatch_rate
      },
      incubations: enrichedIncubations,
      kpis: {
        total_live_animals,
        births,
        deaths,
        losses,
        purchases,
        sales,
        active_lots,
        sales_revenue,
        purchases_expense,
        active_gestations,
        total_eggs_laid,
        active_incubations,
        total_eggs_incubated,
        upcoming_hatches_count,
        total_hatched_eggs,
        avg_hatch_rate,
        total_feed_distributed,
        low_stock_feeds,
        pending_health_care,
        total_revenues,
        total_expenses,
        net_profit,
        duckling_summary: ducklingAlerts.summary,
        chick_summary: chickAlerts.summary,
        poultry_summary: youngPoultryAlerts.summary
      },
      species_breakdown,
      gender_breakdown,
      category_breakdown,
      recent_movements,
      monthly_trends
    };
  },

  // --- HISTORIQUE & AUDIT ---
  async getHistory(farmId, filters = {}) {
    await this.delay();
    return this.getMovements(farmId, filters);
  },

  // --- DÉMONSTRATION ---
  async seedDemo() {
    await this.delay();
    const freshData = LocalDB.getInitialData();
    LocalDB.save(freshData);
    return {
      message: 'Données de démonstration prêtes !',
      credentials: {
        email: 'fermier@exemple.com',
        password: 'ferme123'
      }
    };
  },

  // ==========================================================================
  // MODULES AVANCÉS V2
  // ==========================================================================

  // 1. REPRODUCTION & GESTATION
  async getReproductions(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let list = db.reproductions.filter(r => r.farm_id === fId);
    const enriched = list.map(r => {
      const sp = db.species.find(s => s.id === r.species_id);
      const lot = db.lots.find(l => l.id === r.target_lot_id);
      return {
        ...r,
        species_name: sp ? sp.name : r.species_id,
        species_icon: sp ? sp.icon : '🐾',
        lot_name: lot ? lot.name : null
      };
    });
    return { reproductions: enriched };
  },

  async createReproduction(farmId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const newRepro = {
      id: LocalDB.nextId('reproductions'),
      farm_id: fId,
      species_id: data.species_id,
      type: data.type || 'saillie',
      female_id: data.female_id ? Number(data.female_id) : null,
      female_name: data.female_name || null,
      male_id: data.male_id ? Number(data.male_id) : null,
      male_name: data.male_name || null,
      service_date: data.service_date,
      gestation_days: data.gestation_days ? Number(data.gestation_days) : 150,
      expected_birth_date: data.expected_birth_date || null,
      target_lot_id: data.target_lot_id ? Number(data.target_lot_id) : null,
      status: 'en_attente',
      notes: data.notes || null,
      created_at: new Date().toISOString()
    };
    db.reproductions.push(newRepro);
    LocalDB.save(db);
    return { message: 'Saillie/insémination enregistrée.', reproduction: newRepro };
  },

  async updateReproduction(farmId, id, data) {
    await this.delay();
    const db = LocalDB.load();
    const rId = Number(id);
    const repro = db.reproductions.find(r => r.id === rId && r.farm_id === Number(farmId));
    if (!repro) throw new Error('Reproduction introuvable');
    Object.assign(repro, data);
    LocalDB.save(db);
    return { message: 'Statut mis à jour.', reproduction: repro };
  },

  async updateReproductionStatus(farmId, id, status, notes) {
    return this.updateReproduction(farmId, id, { status, notes });
  },

  async confirmBirth(farmId, id, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const rId = Number(id);
    const user = this.getLoggedUser();

    const repro = db.reproductions.find(r => r.id === rId && r.farm_id === fId);
    if (!repro) throw new Error('Reproduction introuvable');

    const liveCount = data.live_born ? parseInt(data.live_born, 10) : 1;
    repro.status = 'mise_bas_effectuee';
    repro.actual_birth_date = data.birth_date || new Date().toISOString().split('T')[0];
    repro.litter_size = data.litter_size ? parseInt(data.litter_size, 10) : liveCount;
    repro.live_born = liveCount;
    repro.stillborn = data.stillborn ? parseInt(data.stillborn, 10) : 0;

    // Ajouter les jeunes au cheptel
    const sp = db.species.find(s => s.id === repro.species_id);
    const newAnimal = {
      id: LocalDB.nextId('animals'),
      farm_id: fId,
      code: `NB-${Date.now().toString().slice(-4)}`,
      type: liveCount > 1 ? 'lot' : 'individuel',
      species_id: repro.species_id,
      category_name: data.category_name || 'Jeunes',
      breed: 'Standard',
      gender: data.gender || 'MIXTE',
      birth_date: repro.actual_birth_date,
      initial_quantity: liveCount,
      current_quantity: liveCount,
      lot_id: repro.target_lot_id || null,
      observations: `Nouveau-nés de ${repro.female_name || 'Mère'} x ${repro.male_name || 'Père'}`,
      status: 'actif',
      created_at: new Date().toISOString()
    };
    db.animals.push(newAnimal);

    // Mouvement de naissance
    db.movements.push({
      id: LocalDB.nextId('movements'),
      farm_id: fId,
      animal_id: newAnimal.id,
      type: 'naissance',
      date: repro.actual_birth_date,
      species_id: repro.species_id,
      category_name: newAnimal.category_name,
      quantity: liveCount,
      from_lot_id: null,
      to_lot_id: newAnimal.lot_id,
      observations: `Mise bas confirmée (+${liveCount} nés vivants)`,
      created_by: user ? user.id : 1
    });

    LocalDB.save(db);
    return { message: 'Mise bas confirmée et jeunes ajoutés au cheptel !' };
  },

  // 2. ŒUFS & INCUBATION
  async getEggSummary(farmId) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    const collections = db.egg_collections.filter(e => e.farm_id === fId);
    const total_eggs_laid = collections.reduce((s, e) => s + (e.eggs_laid || 0), 0);
    const total_eggs_sold = collections.reduce((s, e) => s + (e.eggs_sold || 0), 0);

    const incubations = db.incubations.filter(i => i.farm_id === fId);
    const active_incubations = incubations.filter(i => i.status === 'en_cours').reduce((s, i) => s + (i.eggs_count || 0), 0);

    const finished = incubations.filter(i => i.status === 'termine');
    const totYoung = finished.reduce((s, i) => s + (i.live_young_count || 0), 0);
    const totInc = finished.reduce((s, i) => s + (i.eggs_count || 0), 0);
    const avg_hatch_rate = totInc > 0 ? Math.round((totYoung / totInc) * 1000) / 10 : 0;

    return {
      total_eggs_laid,
      total_eggs_sold,
      active_incubations,
      avg_hatch_rate
    };
  },

  async getEggCollections(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const cols = db.egg_collections.filter(c => c.farm_id === fId).sort((a, b) => new Date(b.date) - new Date(a.date));
    const enriched = cols.map(c => {
      const sp = db.species.find(s => s.id === c.species_id);
      const lot = db.lots.find(l => l.id === c.lot_id);
      return {
        ...c,
        species_name: sp ? sp.name : c.species_id,
        species_icon: sp ? sp.icon : '🥚',
        lot_name: lot ? lot.name : null
      };
    });
    return { collections: enriched };
  },

  async createEggCollection(farmId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const newCol = {
      id: LocalDB.nextId('egg_collections'),
      farm_id: fId,
      date: data.date || new Date().toISOString().split('T')[0],
      species_id: data.species_id,
      lot_id: data.lot_id ? Number(data.lot_id) : null,
      eggs_laid: parseInt(data.eggs_laid, 10) || 0,
      eggs_broken: parseInt(data.eggs_broken, 10) || 0,
      eggs_sold: parseInt(data.eggs_sold, 10) || 0,
      eggs_consumed: parseInt(data.eggs_consumed, 10) || 0,
      eggs_incubated: parseInt(data.eggs_incubated, 10) || 0,
      notes: data.notes || null,
      created_at: new Date().toISOString()
    };
    db.egg_collections.push(newCol);
    LocalDB.save(db);
    return { message: 'Collecte d\'œufs enregistrée.', collection: newCol };
  },

  async getIncubations(farmId, filters = {}) {
    if (this.isSupabaseConnected()) {
      const incubations = await window.SupabaseService.getIncubations(farmId, filters);
      const db = LocalDB.load();
      const todayStr = new Date().toISOString().split('T')[0];
      const enriched = (incubations || []).map(i => enrichIncubation(i, db, todayStr));
      return { incubations: enriched };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const todayStr = new Date().toISOString().split('T')[0];
    const incs = (db.incubations || []).filter(i => i.farm_id === fId);

    let enriched = incs.map(i => enrichIncubation(i, db, todayStr));

    // Filtre par espèce
    if (filters.species_id && filters.species_id !== 'toutes') {
      enriched = enriched.filter(i => i.species_id === filters.species_id);
    }

    // Filtre par statut (en_cours, termine, toutes)
    if (filters.status === 'en_cours') {
      enriched = enriched.filter(i => i.status !== 'termine' && i.status !== 'annule');
    } else if (filters.status === 'termine') {
      enriched = enriched.filter(i => i.status === 'termine');
    }

    // Tri intelligent : incubations en cours et échéances les plus proches en tête
    enriched.sort((a, b) => {
      const aDone = a.status === 'termine' || a.status === 'annule' ? 1 : 0;
      const bDone = b.status === 'termine' || b.status === 'annule' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      if (!aDone) {
        // En cours : date d'éclosion prévue croissante
        return (a.expected_hatch_date || '').localeCompare(b.expected_hatch_date || '');
      } else {
        // Terminées : plus récentes en premier
        return (b.actual_hatch_date || b.start_date || '').localeCompare(a.actual_hatch_date || a.start_date || '');
      }
    });

    return { incubations: enriched };
  },

  async getIncubationById(farmId, id) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const incId = Number(id);
    const inc = (db.incubations || []).find(i => i.id === incId && i.farm_id === fId);
    if (!inc) throw new Error('Lot d\'incubation introuvable');
    const todayStr = new Date().toISOString().split('T')[0];
    return { incubation: enrichIncubation(inc, db, todayStr) };
  },

  async createIncubation(farmId, data) {
    if (this.isSupabaseConnected()) {
      const incubation = await window.SupabaseService.createIncubation(farmId, data);
      return { message: 'Lot d\'incubation lancé avec succès.', incubation };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const duration = parseInt(data.duration_days, 10) || getDefaultIncubationDuration(data.species_id);
    const startDate = data.start_date || new Date().toISOString().split('T')[0];
    const expectedHatch = data.expected_hatch_date || addDaysToDate(startDate, duration);

    const newInc = {
      id: LocalDB.nextId('incubations'),
      farm_id: fId,
      code: data.code || `INC-${Date.now().toString().slice(-4)}`,
      name: data.name || data.code || `Lot Incubation #${LocalDB.nextId('incubations')}`,
      species_id: data.species_id || 'poules',
      method: data.method || 'artificielle',
      incubator_type: data.incubator_type || null,
      eggs_count: parseInt(data.eggs_count, 10) || 0,
      start_date: startDate,
      duration_days: duration,
      expected_hatch_date: expectedHatch,
      actual_hatch_date: null,
      hatched_count: 0,
      live_young_count: 0,
      dead_young_count: 0,
      unhatched_count: 0,
      rejected_count: 0,
      target_lot_id: data.target_lot_id ? Number(data.target_lot_id) : null,
      status: 'en_cours',
      notes: data.notes || null,
      candling_notes: data.candling_notes || null,
      created_at: new Date().toISOString()
    };

    db.incubations.push(newInc);
    LocalDB.save(db);
    return { message: 'Lot d\'incubation lancé avec succès.', incubation: newInc };
  },

  async updateIncubation(farmId, id, data) {
    if (this.isSupabaseConnected()) {
      const incubation = await window.SupabaseService.updateIncubation(farmId, id, data);
      return { message: 'Lot d\'incubation mis à jour.', incubation };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const incId = Number(id);
    const inc = (db.incubations || []).find(i => i.id === incId && i.farm_id === fId);
    if (!inc) throw new Error('Lot d\'incubation introuvable');

    if (data.code !== undefined) inc.code = data.code;
    if (data.name !== undefined) inc.name = data.name;
    if (data.species_id !== undefined) inc.species_id = data.species_id;
    if (data.method !== undefined) inc.method = data.method;
    if (data.incubator_type !== undefined) inc.incubator_type = data.incubator_type;
    if (data.eggs_count !== undefined) inc.eggs_count = parseInt(data.eggs_count, 10) || 0;
    if (data.start_date !== undefined) inc.start_date = data.start_date;
    if (data.duration_days !== undefined) {
      inc.duration_days = parseInt(data.duration_days, 10) || getDefaultIncubationDuration(inc.species_id);
    }
    // Recalcul automatique de l'éclosion prévue
    inc.expected_hatch_date = data.expected_hatch_date || addDaysToDate(inc.start_date, inc.duration_days);

    if (data.target_lot_id !== undefined) inc.target_lot_id = data.target_lot_id ? Number(data.target_lot_id) : null;
    if (data.notes !== undefined) inc.notes = data.notes;
    if (data.candling_notes !== undefined) inc.candling_notes = data.candling_notes;
    if (data.status !== undefined) inc.status = data.status;

    LocalDB.save(db);
    return { message: 'Lot d\'incubation mis à jour avec succès.', incubation: inc };
  },

  async deleteIncubation(farmId, id) {
    if (this.isSupabaseConnected()) {
      return await window.SupabaseService.deleteIncubation(farmId, id);
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const incId = Number(id);
    const initialLen = db.incubations.length;
    db.incubations = db.incubations.filter(i => !(i.id === incId && i.farm_id === fId));
    if (db.incubations.length === initialLen) throw new Error('Lot d\'incubation introuvable');
    LocalDB.save(db);
    return { message: 'Lot d\'incubation supprimé avec succès.' };
  },

  async updateCandling(farmId, id, candling_notes) {
    await this.delay();
    const db = LocalDB.load();
    const inc = db.incubations.find(i => i.id === Number(id) && i.farm_id === Number(farmId));
    if (!inc) throw new Error('Incubation introuvable');
    inc.candling_notes = candling_notes;
    LocalDB.save(db);
    return { message: 'Observations de mirage enregistrées.', incubation: inc };
  },

  async updateIncubationCandling(farmId, id, candling_notes) {
    return this.updateCandling(farmId, id, candling_notes);
  },

  async validateHatch(farmId, id, data) {
    if (this.isSupabaseConnected()) {
      const incubation = await window.SupabaseService.validateHatch(farmId, id, data);
      return { message: 'Éclosion validée avec succès.', incubation };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const inc = db.incubations.find(i => i.id === Number(id) && i.farm_id === fId);
    if (!inc) throw new Error('Incubation introuvable');
    const user = this.getLoggedUser();

    const hatched = parseInt(data.hatched_count, 10) || 0;
    const liveCount = (data.live_young_count !== undefined && data.live_young_count !== null && data.live_young_count !== '')
      ? parseInt(data.live_young_count, 10)
      : hatched;
    const deadCount = parseInt(data.dead_young_count, 10) || 0;
    const unhatched = (data.unhatched_count !== undefined && data.unhatched_count !== null && data.unhatched_count !== '')
      ? parseInt(data.unhatched_count, 10)
      : Math.max(0, inc.eggs_count - hatched);
    const rejected = parseInt(data.rejected_count, 10) || 0;

    const rate = inc.eggs_count > 0 ? Math.round((hatched / inc.eggs_count) * 1000) / 10 : 0;

    inc.status = 'termine';
    inc.actual_hatch_date = data.actual_hatch_date || data.hatch_date || new Date().toISOString().split('T')[0];
    inc.hatched_count = hatched;
    inc.live_young_count = liveCount;
    inc.dead_young_count = deadCount;
    inc.unhatched_count = unhatched;
    inc.rejected_count = rejected;
    inc.hatch_rate = rate;
    if (data.notes) inc.notes = data.notes;

    // Ajout conditionnel au cheptel (uniquement si demandé ou si non désactivé explicitement)
    const shouldCreateAnimals = data.create_animal_lot !== false && liveCount > 0;

    if (shouldCreateAnimals) {
      const categoryName = data.category_name || (inc.species_id === 'canards' ? 'Canetons' : 'Poussins');
      const poultryRule = getYoungPoultryRule(inc.species_id, categoryName);
      const maturityDate = (poultryRule && inc.actual_hatch_date) ? addDaysToDate(inc.actual_hatch_date, poultryRule.maturity_days) : null;

      const newAnimal = {
        id: LocalDB.nextId('animals'),
        farm_id: fId,
        code: `ECL-${Date.now().toString().slice(-4)}`,
        type: 'lot',
        species_id: inc.species_id,
        category_name: categoryName,
        breed: 'Standard',
        gender: 'MIXTE',
        birth_date: inc.actual_hatch_date,
        maturity_date: maturityDate,
        initial_quantity: liveCount,
        current_quantity: liveCount,
        lot_id: data.target_lot_id ? Number(data.target_lot_id) : (inc.target_lot_id || null),
        observations: `Éclosion lot ${inc.code} (${rate}% de réussite, ${liveCount} vivants)`,
        status: 'actif',
        created_at: new Date().toISOString()
      };
      db.animals.push(newAnimal);

      // Mouvement de naissance
      db.movements.push({
        id: LocalDB.nextId('movements'),
        farm_id: fId,
        animal_id: newAnimal.id,
        type: 'naissance',
        date: inc.actual_hatch_date,
        species_id: inc.species_id,
        category_name: categoryName,
        quantity: liveCount,
        from_lot_id: null,
        to_lot_id: newAnimal.lot_id,
        observations: `Éclosion validée depuis ${inc.code} : +${liveCount} sujets`,
        created_by: user ? user.id : 1
      });
    }

    LocalDB.save(db);
    return {
      message: shouldCreateAnimals
        ? `Éclosion validée : +${liveCount} nouveau-nés ajoutés au cheptel !`
        : `Éclosion enregistrée avec succès (lot d'incubation clôturé).`,
      hatch_rate: rate,
      incubation: inc
    };
  },

  // 3. SANTÉ & REGISTRE VÉTÉRINAIRE
  async getHealthTreatments(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const list = db.health_treatments.filter(t => t.farm_id === fId).sort((a, b) => new Date(b.date) - new Date(a.date));
    const enriched = list.map(t => {
      const sp = db.species.find(s => s.id === t.species_id);
      const lot = db.lots.find(l => l.id === t.lot_id);
      return {
        ...t,
        species_name: sp ? sp.name : t.species_id,
        species_icon: sp ? sp.icon : '🩺',
        lot_name: lot ? lot.name : null
      };
    });
    return { treatments: enriched };
  },

  async getTreatments(farmId) {
    return this.getHealthTreatments(farmId);
  },

  async getHealthReminders(farmId) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const nowStr = new Date().toISOString().split('T')[0];
    const in15days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const upcoming = db.health_treatments
      .filter(t => t.farm_id === fId && t.next_care_date && t.next_care_date >= nowStr && t.next_care_date <= in15days)
      .map(t => {
        const sp = db.species.find(s => s.id === t.species_id);
        const lot = db.lots.find(l => l.id === t.lot_id);
        return {
          ...t,
          species_name: sp ? sp.name : t.species_id,
          species_icon: sp ? sp.icon : '🩺',
          lot_name: lot ? lot.name : null
        };
      });
    return { upcoming_treatments: upcoming };
  },

  async createHealthTreatment(farmId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    const cost = parseFloat(data.cost) || 0;
    const newTreat = {
      id: LocalDB.nextId('health_treatments'),
      farm_id: fId,
      date: data.date || new Date().toISOString().split('T')[0],
      type: data.type || 'traitement',
      species_id: data.species_id,
      animal_id: data.animal_id ? Number(data.animal_id) : null,
      lot_id: data.lot_id ? Number(data.lot_id) : null,
      disease_or_reason: data.disease_or_reason || data.disease || '',
      treatment_name: data.treatment_name || '',
      dosage: data.dosage || null,
      veterinarian: data.veterinarian || null,
      cost,
      next_care_date: data.next_care_date || null,
      notes: data.notes || null,
      created_at: new Date().toISOString()
    };
    db.health_treatments.push(newTreat);

    // Synchronisation financière si coût > 0
    if (cost > 0) {
      db.financial_records.push({
        id: LocalDB.nextId('financial_records'),
        farm_id: fId,
        type: 'depense',
        category: 'soins_veto',
        date: newTreat.date,
        amount: cost,
        payment_status: 'paye',
        payment_method: 'Espèces',
        species_id: newTreat.species_id,
        lot_id: newTreat.lot_id,
        title: `Soin vétérinaire (${newTreat.type}) : ${newTreat.treatment_name}`,
        supplier: newTreat.veterinarian || 'Pharmacie Vétérinaire',
        notes: `Motif : ${newTreat.disease_or_reason}`
      });
    }

    LocalDB.save(db);
    return { message: 'Soin vétérinaire consigné avec succès.', treatment: newTreat };
  },

  // 4. ALIMENTATION & GESTION DES STOCKS
  async getFeeds(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const feeds = db.feeds.filter(f => f.farm_id === fId);
    const enriched = feeds.map(f => {
      const sp = db.species.find(s => s.id === f.species_id);
      return {
        ...f,
        species_name: sp ? sp.name : null,
        species_icon: sp ? sp.icon : '🌾'
      };
    });
    return { feeds: enriched };
  },

  async saveFeed(farmId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const newFeed = {
      id: LocalDB.nextId('feeds'),
      farm_id: fId,
      name: data.name.trim(),
      category: data.category || 'autre',
      species_id: data.species_id || null,
      target_category: data.target_category || null,
      unit: data.unit || 'kg',
      stock_quantity: parseFloat(data.stock_quantity) || 0,
      min_threshold: parseFloat(data.min_threshold) || 10,
      unit_price: parseFloat(data.unit_price) || 0,
      supplier: data.supplier?.trim() || null,
      notes: data.notes?.trim() || null,
      created_at: new Date().toISOString()
    };
    db.feeds.push(newFeed);
    LocalDB.save(db);
    return { message: 'Fiche aliment enregistrée.', feed: newFeed };
  },

  async createFeed(farmId, data) {
    return this.saveFeed(farmId, data);
  },

  async getFeedLogs(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const logs = db.feed_logs.filter(fl => fl.farm_id === fId).sort((a, b) => new Date(b.date) - new Date(a.date));
    const enriched = logs.map(l => {
      const feed = db.feeds.find(f => f.id === l.feed_id);
      const lot = db.lots.find(lo => lo.id === l.lot_id);
      return {
        ...l,
        feed_name: feed ? feed.name : 'Aliment',
        unit: feed ? feed.unit : 'kg',
        lot_name: lot ? lot.name : null
      };
    });
    return { logs: enriched };
  },

  async recordFeedMovement(farmId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const feed = db.feeds.find(f => f.id === Number(data.feed_id) && f.farm_id === fId);
    if (!feed) throw new Error('Aliment introuvable');

    const qty = parseFloat(data.quantity) || 0;
    const type = data.type; // 'achat', 'distribution', 'perte'
    const totalCost = data.total_cost ? parseFloat(data.total_cost) : (data.unit_price ? parseFloat(data.unit_price) * qty : 0);

    if (type === 'achat') {
      feed.stock_quantity += qty;
      // Dépense financière
      if (totalCost > 0) {
        db.financial_records.push({
          id: LocalDB.nextId('financial_records'),
          farm_id: fId,
          type: 'depense',
          category: 'Aliments',
          date: data.date || new Date().toISOString().split('T')[0],
          amount: totalCost,
          payment_status: 'paye',
          payment_method: 'Espèces',
          species_id: feed.species_id,
          lot_id: data.lot_id ? Number(data.lot_id) : null,
          title: `Achat aliment : ${qty} ${feed.unit} de ${feed.name}`,
          supplier: data.supplier || feed.supplier || 'Fournisseur Aliments',
          notes: data.notes || null
        });
      }
    } else {
      // Distribution ou perte
      if (feed.stock_quantity < qty) {
        throw new Error(`Stock insuffisant. Disponible : ${feed.stock_quantity} ${feed.unit}`);
      }
      feed.stock_quantity -= qty;
    }

    const log = {
      id: LocalDB.nextId('feed_logs'),
      farm_id: fId,
      feed_id: feed.id,
      type,
      date: data.date || new Date().toISOString().split('T')[0],
      quantity: qty,
      lot_id: data.lot_id ? Number(data.lot_id) : null,
      unit_price: data.unit_price ? parseFloat(data.unit_price) : null,
      total_cost: totalCost || null,
      supplier: data.supplier || null,
      notes: data.notes || null,
      created_at: new Date().toISOString()
    };
    db.feed_logs.push(log);

    LocalDB.save(db);
    return { message: 'Mouvement d\'aliment consigné avec succès.', log, remaining_stock: feed.stock_quantity };
  },

  async logFeedMovement(farmId, data) {
    return this.recordFeedMovement(farmId, data);
  },

  // 5. BÂTIMENTS & INSTALLATIONS
  async getBuildings(farmId) {
    await this.delay();
    return this.getLots(farmId).then(res => ({ buildings: res.lots }));
  },

  async updateBuilding(farmId, id, data) {
    await this.delay();
    return this.updateLot(farmId, id, data).then(res => ({ building: res.lot }));
  },

  async deleteBuilding(farmId, id) {
    await this.delay();
    return this.deleteLot(farmId, id);
  },

  async getBuildingMaintenance(farmId, lotId) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const lId = Number(lotId);
    const maints = db.building_maintenance
      .filter(bm => bm.farm_id === fId && bm.lot_id === lId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return { maintenance: maints };
  },

  async recordBuildingMaintenance(farmId, lotId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const lId = Number(lotId);
    const lot = db.lots.find(l => l.id === lId && l.farm_id === fId);

    const cost = parseFloat(data.cost) || 0;
    const newMaint = {
      id: LocalDB.nextId('building_maintenance'),
      farm_id: fId,
      lot_id: lId,
      date: data.date || new Date().toISOString().split('T')[0],
      type: data.type || 'nettoyage',
      description: data.description || '',
      cost,
      performed_by: data.performed_by || null,
      next_date: data.next_date || null,
      notes: data.notes || null,
      created_at: new Date().toISOString()
    };
    db.building_maintenance.push(newMaint);

    // Mettre à jour last_maintenance_date sur le lot
    if (lot) {
      lot.last_maintenance_date = newMaint.date;
    }

    // Dépense financière si coût > 0
    if (cost > 0) {
      db.financial_records.push({
        id: LocalDB.nextId('financial_records'),
        farm_id: fId,
        type: 'depense',
        category: 'Matériel & Équipements',
        date: newMaint.date,
        amount: cost,
        payment_status: 'paye',
        payment_method: 'Espèces',
        species_id: lot ? lot.species_id : null,
        lot_id: lId,
        title: `Entretien bâtiment (${newMaint.type}) : ${lot ? lot.name : 'Installation'}`,
        supplier: newMaint.performed_by || 'Équipe technique',
        notes: newMaint.description
      });
    }

    LocalDB.save(db);
    return { message: 'Entretien sanitaire enregistré avec succès.', maintenance: newMaint };
  },

  async logBuildingMaintenance(farmId, lotId, data) {
    return this.recordBuildingMaintenance(farmId, lotId, data);
  },

  // 6. CONTACTS & TRANSACTIONS COMMERCIALES
  async getContacts(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let contacts = db.contacts.filter(c => c.farm_id === fId);
    if (filters.type && filters.type !== 'tous') {
      contacts = contacts.filter(c => c.type === filters.type);
    }
    return { contacts };
  },

  async saveContact(farmId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const newContact = {
      id: LocalDB.nextId('contacts'),
      farm_id: fId,
      type: data.type || 'client',
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      notes: data.notes?.trim() || null,
      created_at: new Date().toISOString()
    };
    db.contacts.push(newContact);
    LocalDB.save(db);
    return { message: 'Contact enregistré avec succès.', contact: newContact };
  },

  async createContact(farmId, data) {
    return this.saveContact(farmId, data);
  },

  async getTransactions(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const txs = db.commercial_transactions.filter(t => t.farm_id === fId).sort((a, b) => new Date(b.date) - new Date(a.date));
    const enriched = txs.map(t => {
      const c = db.contacts.find(con => con.id === t.contact_id);
      return {
        ...t,
        contact_name: t.contact_name || (c ? c.name : 'Comptoir')
      };
    });
    return { transactions: enriched };
  },

  async getCommercialTransactions(farmId, filters = {}) {
    return this.getTransactions(farmId, filters);
  },

  async createTransaction(farmId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);

    const contact = db.contacts.find(c => c.id === Number(data.contact_id));
    const total = parseFloat(data.total_amount) || 0;
    const paid = parseFloat(data.paid_amount) || 0;

    const newTx = {
      id: LocalDB.nextId('commercial_transactions'),
      farm_id: fId,
      type: data.type || 'vente',
      product_type: data.product_type || 'oeufs',
      date: data.date || new Date().toISOString().split('T')[0],
      contact_id: data.contact_id ? Number(data.contact_id) : null,
      contact_name: contact ? contact.name : (data.contact_name || 'Client comptoir'),
      description: data.description || 'Transaction',
      quantity: parseFloat(data.quantity) || 1,
      unit: data.unit || 'unite',
      unit_price: parseFloat(data.unit_price) || 0,
      total_amount: total,
      paid_amount: paid,
      payment_method: data.payment_method || 'Espèces',
      payment_status: data.payment_status || (paid >= total ? 'paye' : 'en_attente'),
      created_at: new Date().toISOString()
    };
    db.commercial_transactions.push(newTx);

    // Enregistrer écriture financière
    const finType = newTx.type === 'vente' ? 'recette' : 'depense';
    const cat = newTx.product_type === 'oeufs' ? 'Vente œufs' : (newTx.product_type === 'animaux' ? 'Vente animaux' : 'Autre');
    db.financial_records.push({
      id: LocalDB.nextId('financial_records'),
      farm_id: fId,
      type: finType,
      category: cat,
      date: newTx.date,
      amount: newTx.total_amount,
      payment_status: newTx.payment_status === 'paye' ? 'paye' : 'en_attente',
      payment_method: newTx.payment_method,
      title: `${newTx.type === 'vente' ? 'Vente' : 'Achat'} : ${newTx.description}`,
      supplier: newTx.type === 'achat' ? newTx.contact_name : null,
      notes: `Règlement : ${newTx.paid_amount} / ${newTx.total_amount}`
    });

    LocalDB.save(db);
    return { message: 'Transaction commerciale enregistrée avec succès.', transaction: newTx };
  },

  async createCommercialTransaction(farmId, data) {
    return this.createTransaction(farmId, data);
  },

  // 7. FINANCES & TRÉSORERIE (COMPTABILITÉ DE GESTION LOCALE)
  async getFinancialSummary(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const farm = db.farms.find(f => f.id === fId);
    const cur = farm?.currency || 'FCFA';

    let records = (db.financial_records || []).filter(r => r.farm_id === fId);

    // Filtrage optionnel par période
    if (filters.period && filters.period !== 'all') {
      const now = new Date();
      if (filters.period === 'this_month') {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `${y}-${m}`;
        records = records.filter(r => r.date && r.date.startsWith(prefix));
      } else if (filters.period === 'this_year') {
        const prefix = `${now.getFullYear()}-`;
        records = records.filter(r => r.date && r.date.startsWith(prefix));
      }
    }

    // 1. Calculs fondamentaux
    const total_revenues = records.filter(r => r.type === 'recette').reduce((s, r) => s + (r.amount || 0), 0);
    const total_expenses = records.filter(r => r.type === 'depense').reduce((s, r) => s + (r.amount || 0), 0);
    // Solde de gestion = total des revenus enregistrés - total des dépenses enregistrées
    const solde_gestion = total_revenues - total_expenses;

    // 2. Revenus par catégorie
    const revCatLabels = {
      'vente_animaux': "Vente d'animaux",
      'vente_oeufs': "Vente d'œufs",
      'vente_lait': "Vente de lait",
      'autre_produit': "Vente d'autres produits",
      'autre_revenu': "Autre revenu"
    };
    const revCatMap = {};
    records.filter(r => r.type === 'recette').forEach(r => {
      const c = r.category || 'autre_revenu';
      revCatMap[c] = (revCatMap[c] || 0) + (r.amount || 0);
    });
    const revenues_by_category = Object.entries(revCatMap).map(([catKey, total_amount]) => ({
      category: catKey,
      label: revCatLabels[catKey] || catKey,
      total_amount,
      percentage: total_revenues > 0 ? Math.round((total_amount / total_revenues) * 100) : 0
    })).sort((a, b) => b.total_amount - a.total_amount);

    // 3. Dépenses par catégorie
    const expCatMap = {};
    records.filter(r => r.type === 'depense').forEach(r => {
      const c = r.category || 'Autre dépense';
      expCatMap[c] = (expCatMap[c] || 0) + (r.amount || 0);
    });
    const expenses_by_category = Object.entries(expCatMap).map(([category, total_amount]) => ({
      category,
      label: category,
      total_amount,
      percentage: total_expenses > 0 ? Math.round((total_amount / total_expenses) * 100) : 0
    })).sort((a, b) => b.total_amount - a.total_amount);

    // 4. Évolution des revenus et des dépenses (par mois)
    const monthMap = {};
    records.forEach(r => {
      const d = r.date ? r.date.substring(0, 7) : 'Inconnu';
      if (!monthMap[d]) {
        monthMap[d] = { period: d, revenues: 0, expenses: 0 };
      }
      if (r.type === 'recette') monthMap[d].revenues += (r.amount || 0);
      if (r.type === 'depense') monthMap[d].expenses += (r.amount || 0);
    });
    const evolution_by_month = Object.values(monthMap).map(m => {
      const [year, month] = m.period.split('-');
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
      const monthIndex = parseInt(month, 10) - 1;
      const label = (!isNaN(monthIndex) && monthNames[monthIndex]) ? `${monthNames[monthIndex]} ${year}` : m.period;
      return {
        ...m,
        label,
        balance: m.revenues - m.expenses
      };
    }).sort((a, b) => a.period.localeCompare(b.period));

    // 5. Résultat par espèce
    const activeAnimals = (db.animals || []).filter(a => a.farm_id === fId && a.status === 'actif');
    const farmSpeciesList = db.species || [];
    const activeFarmSpecies = (db.farm_species || []).filter(fs => fs.farm_id === fId && fs.is_active);
    const activeSpIds = activeFarmSpecies.map(fs => fs.species_id);

    const spMap = {};
    // Initialiser avec les espèces actives
    farmSpeciesList.filter(s => activeSpIds.includes(s.id)).forEach(sp => {
      const live_count = activeAnimals.filter(a => a.species_id === sp.id).reduce((sum, a) => sum + (a.current_quantity || 1), 0);
      spMap[sp.id] = {
        species_id: sp.id,
        species_name: sp.name,
        species_icon: sp.icon,
        live_count,
        revenues: 0,
        expenses: 0
      };
    });

    // Attribuer les opérations financières
    records.forEach(r => {
      let spId = r.species_id;
      if (!spId && r.lot_id) {
        const lot = (db.lots || []).find(l => l.id === r.lot_id);
        if (lot) spId = lot.species_id;
      }
      if (!spId) spId = 'general';

      if (!spMap[spId]) {
        const sp = farmSpeciesList.find(s => s.id === spId);
        const live_count = activeAnimals.filter(a => a.species_id === spId).reduce((sum, a) => sum + (a.current_quantity || 1), 0);
        spMap[spId] = {
          species_id: spId,
          species_name: sp ? sp.name : 'Charges générales',
          species_icon: sp ? sp.icon : '🌾',
          live_count,
          revenues: 0,
          expenses: 0
        };
      }
      if (r.type === 'recette') spMap[spId].revenues += (r.amount || 0);
      if (r.type === 'depense') spMap[spId].expenses += (r.amount || 0);
    });

    const result_by_species = Object.values(spMap).map(s => ({
      ...s,
      balance: s.revenues - s.expenses,
      cost_per_head: s.live_count > 0 ? Math.round(s.expenses / s.live_count) : 0
    }));

    // 6. Résultat par lot
    const farmLots = (db.lots || []).filter(l => l.farm_id === fId);
    const lotMap = {};
    farmLots.forEach(lot => {
      lotMap[lot.id] = {
        lot_id: lot.id,
        lot_name: lot.name,
        revenues: 0,
        expenses: 0
      };
    });
    records.filter(r => r.lot_id).forEach(r => {
      if (!lotMap[r.lot_id]) {
        const lot = (db.lots || []).find(l => l.id === r.lot_id);
        lotMap[r.lot_id] = {
          lot_id: r.lot_id,
          lot_name: lot ? lot.name : `Lot #${r.lot_id}`,
          revenues: 0,
          expenses: 0
        };
      }
      if (r.type === 'recette') lotMap[r.lot_id].revenues += (r.amount || 0);
      if (r.type === 'depense') lotMap[r.lot_id].expenses += (r.amount || 0);
    });

    const result_by_lot = Object.values(lotMap).map(l => ({
      ...l,
      balance: l.revenues - l.expenses
    }));

    return {
      currency: cur,
      total_revenues,
      total_expenses,
      solde_gestion,
      net_profit: solde_gestion,
      net_margin: solde_gestion,
      cash_balance: solde_gestion,
      kpis: {
        total_revenues,
        total_expenses,
        solde_gestion,
        net_profit: solde_gestion,
        cash_balance: solde_gestion
      },
      revenues_by_category,
      expenses_by_category,
      evolution_by_month,
      result_by_species,
      cost_by_species: result_by_species.map(s => ({
        species_id: s.species_id,
        species_name: s.species_name,
        species_icon: s.species_icon,
        live_count: s.live_count,
        total_cost: s.expenses
      })),
      result_by_lot,
      cost_by_lot: result_by_lot.map(l => ({
        lot_id: l.lot_id,
        lot_name: l.lot_name,
        total_cost: l.expenses
      }))
    };
  },

  async getFinancialRecords(farmId, filters = {}) {
    if (this.isSupabaseConnected()) {
      const records = await window.SupabaseService.getFinancialRecords(farmId, filters);
      return { records };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let records = (db.financial_records || []).filter(r => r.farm_id === fId);

    if (filters.type && filters.type !== 'tous') {
      records = records.filter(r => r.type === filters.type);
    }
    if (filters.category && filters.category !== 'toutes') {
      records = records.filter(r => r.category === filters.category);
    }

    records.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);

    const enriched = records.map(r => {
      const sp = (db.species || []).find(s => s.id === r.species_id);
      const lot = (db.lots || []).find(l => l.id === r.lot_id);
      return {
        ...r,
        species_name: sp ? sp.name : null,
        species_icon: sp ? sp.icon : '🌾',
        lot_name: lot ? lot.name : null,
        client_name: r.client_name || null,
        description: r.description || r.title || ''
      };
    });

    return { records: enriched };
  },

  async createFinancialRecord(farmId, data) {
    if (this.isSupabaseConnected()) {
      const record = await window.SupabaseService.createFinancialRecord(farmId, data);
      return {
        message: 'Écriture financière enregistrée avec succès.',
        record
      };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const amount = parseFloat(data.amount) || 0;
    if (amount <= 0) throw new Error('Le montant doit être supérieur à zéro.');

    const farm = db.farms.find(f => f.id === fId);
    const cur = data.currency || farm?.currency || 'FCFA';

    const newRec = {
      id: LocalDB.nextId('financial_records'),
      farm_id: fId,
      type: data.type === 'recette' ? 'recette' : 'depense',
      category: data.category || (data.type === 'recette' ? 'autre_revenu' : 'Autre dépense'),
      date: data.date || new Date().toISOString().split('T')[0],
      amount,
      currency: cur,
      payment_status: data.payment_status || 'paye',
      payment_method: data.payment_method || 'Espèces',
      species_id: data.species_id || null,
      lot_id: data.lot_id ? Number(data.lot_id) : null,
      title: data.description?.trim() || data.title?.trim() || (data.type === 'recette' ? 'Recette d\'exploitation' : 'Dépense'),
      description: data.description?.trim() || data.title?.trim() || '',
      client_name: data.client_name?.trim() || null,
      supplier: data.supplier?.trim() || null,
      notes: data.observations?.trim() || data.notes?.trim() || null,
      created_at: new Date().toISOString()
    };
    db.financial_records.push(newRec);
    LocalDB.save(db);
    return {
      message: `${newRec.type === 'recette' ? 'Revenu' : 'Dépense'} de ${amount.toLocaleString('fr-FR')} ${cur} enregistré(e) avec succès.`,
      record: newRec
    };
  },

  async deleteFinancialRecord(farmId, id) {
    await this.delay();
    const db = LocalDB.load();
    const rId = Number(id);
    const fId = Number(farmId);
    const idx = db.financial_records.findIndex(r => r.id === rId && r.farm_id === fId);
    if (idx < 0) throw new Error('Dépense introuvable.');
    db.financial_records.splice(idx, 1);
    LocalDB.save(db);
    return { message: 'Dépense supprimée avec succès.' };
  },

  // --------------------------------------------------------------------------
  // SUIVI DE CROISSANCE & ALERTES VOLAILLES (POUSSINS: 8 SEMAINES, CANETONS: 12 SEMAINES)
  // --------------------------------------------------------------------------
  addDaysToDate(dateStr, days) {
    return addDaysToDate(dateStr, days);
  },

  getDaysDiff(fromStr, toStr) {
    return getDaysDiff(fromStr, toStr);
  },

  getYoungPoultryRule(speciesId, categoryName) {
    return getYoungPoultryRule(speciesId, categoryName);
  },

  computeYoungPoultryAlertsFromDb(db, fId, filters = {}, targetSpecies = null) {
    const todayStr = new Date().toISOString().split('T')[0];
    const requestedSpecies = (filters.species_id || targetSpecies || '').toLowerCase().trim();

    const youngAnimals = (db.animals || []).filter(a => {
      if (a.farm_id !== fId) return false;
      const rule = getYoungPoultryRule(a.species_id, a.category_name);
      if (!rule) return false;
      if (requestedSpecies && requestedSpecies !== 'toutes' && requestedSpecies !== 'all' && requestedSpecies !== 'volaille') {
        if (rule.species_id !== requestedSpecies && a.species_id !== requestedSpecies) return false;
      }
      return true;
    });

    const duckClassifications = (db.duckling_classifications || []).filter(c => c.farm_id === fId);
    const chickClassifications = (db.chick_classifications || []).filter(c => c.farm_id === fId);
    let allClassifications = [...duckClassifications, ...chickClassifications];
    if (requestedSpecies && requestedSpecies !== 'toutes' && requestedSpecies !== 'all' && requestedSpecies !== 'volaille') {
      if (requestedSpecies === 'canards') allClassifications = duckClassifications;
      else if (requestedSpecies === 'poules') allClassifications = chickClassifications;
    }

    const lots = [];
    const alerts = [];

    youngAnimals.forEach(a => {
      const rule = getYoungPoultryRule(a.species_id, a.category_name);
      const birthDate = a.birth_date || a.created_at?.split('T')[0] || todayStr;
      const maturityDays = rule.maturity_days; // 56 j pour poules, 84 j pour canards
      const maturityDate = a.maturity_date || addDaysToDate(birthDate, maturityDays);
      const ageDays = getDaysDiff(birthDate, todayStr);
      const ageWeeks = Math.floor(Math.max(0, ageDays) / 7);
      const ageRemDays = Math.max(0, ageDays) % 7;
      const daysUntilMaturity = getDaysDiff(todayStr, maturityDate);
      const currentQty = Number(a.current_quantity) || 0;
      const initialQty = Number(a.initial_quantity) || currentQty;

      // Nom ou numéro du lot
      let lotName = a.code || `Lot ${rule.label_young}`;
      if (a.lot_id) {
        const bl = (db.lots || []).find(l => l.id === a.lot_id);
        if (bl) lotName = `${bl.name} (${a.code})`;
      }

      let status = 'croissance';
      let statusLabel = `En croissance (${ageWeeks} sem. / ${rule.maturity_weeks} sem.)`;
      let badgeClass = 'badge-blue';
      let priority = 'info';

      if (currentQty <= 0) {
        status = 'traite';
        statusLabel = 'Entièrement classifié / traité';
        badgeClass = 'badge-green';
        priority = 'normal';
      } else if (daysUntilMaturity < 0) {
        status = 'en_retard';
        const daysOverdue = Math.abs(daysUntilMaturity);
        statusLabel = `En retard de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''} (${ageWeeks} sem. ${ageRemDays} j.)`;
        badgeClass = 'badge-red';
        priority = 'danger';
      } else if (daysUntilMaturity === 0) {
        status = 'aujourdhui';
        statusLabel = `Atteint ${rule.maturity_weeks} semaines aujourd'hui (${maturityDays} jours)`;
        badgeClass = 'badge-amber';
        priority = 'danger';
      } else if (daysUntilMaturity <= 7) {
        status = 'a_venir';
        statusLabel = `Atteint ${rule.maturity_weeks} semaines dans ${daysUntilMaturity} jour${daysUntilMaturity > 1 ? 's' : ''}`;
        badgeClass = 'badge-purple';
        priority = 'warning';
      }

      const lotObj = {
        id: a.id,
        animal_id: a.id,
        lot_id: a.lot_id,
        name: lotName,
        lot_name: lotName,
        code: a.code,
        species_id: rule.species_id,
        species_name: rule.species_name,
        category_name: a.category_name,
        target_male_category: rule.male_category,
        target_female_category: rule.female_category,
        label_young: rule.label_young,
        label_young_cap: rule.label_young_cap,
        label_male: rule.label_male,
        label_male_cap: rule.label_male_cap,
        label_female: rule.label_female,
        label_female_cap: rule.label_female_cap,
        maturity_days: maturityDays,
        maturity_weeks: rule.maturity_weeks,
        icon: rule.icon,
        breed: a.breed || (rule.species_id === 'canards' ? 'Barbarie' : 'Goliath'),
        birth_date: birthDate,
        maturity_date: maturityDate,
        age_days: ageDays,
        age_weeks: ageWeeks,
        age_rem_days: ageRemDays,
        age_days_remainder: ageRemDays,
        days_until_maturity: daysUntilMaturity,
        days_diff: Math.abs(daysUntilMaturity),
        initial_quantity: initialQty,
        current_quantity: currentQty,
        status,
        alert_status: status,
        status_label: statusLabel,
        badge_class: badgeClass,
        priority
      };

      lots.push(lotObj);

      // Si le lot a encore des animaux vivants et est à échéance / retard / sous 7 jours
      if (currentQty > 0 && ['en_retard', 'aujourdhui', 'a_venir'].includes(status)) {
        alerts.push(lotObj);
      }
    });

    // Appliquer filtres éventuels sur 'lots'
    let filteredLots = [...lots];
    if (filters.status && filters.status !== 'tous') {
      if (filters.status === 'alertes') {
        filteredLots = filteredLots.filter(l => ['en_retard', 'aujourdhui', 'a_venir'].includes(l.status) && l.current_quantity > 0);
      } else {
        filteredLots = filteredLots.filter(l => l.status === filters.status);
      }
    }
    if (filters.species_id && filters.species_id !== 'toutes' && filters.species_id !== 'all') {
      filteredLots = filteredLots.filter(l => l.species_id === filters.species_id);
    }
    if (filters.lot_id && filters.lot_id !== 'tous') {
      filteredLots = filteredLots.filter(l => l.lot_id === Number(filters.lot_id) || l.animal_id === Number(filters.lot_id));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      filteredLots = filteredLots.filter(l =>
        l.lot_name.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.birth_date.includes(q) ||
        l.maturity_date.includes(q) ||
        (l.breed && l.breed.toLowerCase().includes(q))
      );
    }

    const duckLots = lots.filter(l => l.species_id === 'canards');
    const chickLots = lots.filter(l => l.species_id === 'poules');

    const summary = {
      // Compatibilité stricte canetons
      total_canetons_to_classify: alerts.filter(l => l.species_id === 'canards').reduce((s, l) => s + l.current_quantity, 0),
      total_active_canetons: duckLots.filter(l => l.current_quantity > 0).reduce((s, l) => s + l.current_quantity, 0),
      total_ducklings: duckLots.filter(l => l.current_quantity > 0).reduce((s, l) => s + l.current_quantity, 0),
      // Spécifique poussins
      total_poussins_to_classify: alerts.filter(l => l.species_id === 'poules').reduce((s, l) => s + l.current_quantity, 0),
      total_active_poussins: chickLots.filter(l => l.current_quantity > 0).reduce((s, l) => s + l.current_quantity, 0),
      total_chicks: chickLots.filter(l => l.current_quantity > 0).reduce((s, l) => s + l.current_quantity, 0),
      // Synthèse générale
      total_to_classify: alerts.reduce((s, l) => s + l.current_quantity, 0),
      total_active_young: lots.filter(l => l.current_quantity > 0).reduce((s, l) => s + l.current_quantity, 0),
      total_lots: lots.length,
      mature_lots: lots.filter(l => ['en_retard', 'aujourdhui'].includes(l.status) && l.current_quantity > 0).length,
      overdue_lots: lots.filter(l => l.status === 'en_retard' && l.current_quantity > 0).length,
      overdue_lots_count: lots.filter(l => l.status === 'en_retard' && l.current_quantity > 0).length,
      overdue_count: lots.filter(l => l.status === 'en_retard').reduce((s, l) => s + l.current_quantity, 0),
      today_lots: lots.filter(l => l.status === 'aujourdhui' && l.current_quantity > 0).length,
      today_lots_count: lots.filter(l => l.status === 'aujourdhui' && l.current_quantity > 0).length,
      today_count: lots.filter(l => l.status === 'aujourdhui').reduce((s, l) => s + l.current_quantity, 0),
      upcoming_lots: lots.filter(l => l.status === 'a_venir' && l.current_quantity > 0).length,
      upcoming_lots_count: lots.filter(l => l.status === 'a_venir' && l.current_quantity > 0).length,
      upcoming_count: lots.filter(l => l.status === 'a_venir').reduce((s, l) => s + l.current_quantity, 0),
      growing_lots: lots.filter(l => l.status === 'croissance' && l.current_quantity > 0).length,
      completed_lots_count: lots.filter(l => l.status === 'traite').length,
      classified_lots: lots.filter(l => l.status === 'traite').length,
      transferred_males_total: allClassifications.reduce((s, c) => s + (c.males_count || 0), 0),
      transferred_females_total: allClassifications.reduce((s, c) => s + (c.females_count || 0), 0)
    };

    return {
      summary,
      alerts,
      lots: filteredLots,
      all_lots: filteredLots,
      classifications_history: allClassifications
    };
  },

  computeDucklingAlertsFromDb(db, fId, filters = {}) {
    return this.computeYoungPoultryAlertsFromDb(db, fId, filters, 'canards');
  },

  computeChickAlertsFromDb(db, fId, filters = {}) {
    return this.computeYoungPoultryAlertsFromDb(db, fId, filters, 'poules');
  },

  async getDucklingAlerts(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    return this.computeDucklingAlertsFromDb(db, fId, filters);
  },

  async getChickAlerts(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    return this.computeChickAlertsFromDb(db, fId, filters);
  },

  async getYoungPoultryAlerts(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    return this.computeYoungPoultryAlertsFromDb(db, fId, filters, filters.species_id || null);
  },

  async createYoungPoultryLot(farmId, speciesId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const user = this.getLoggedUser();
    if (!user) throw new Error('Non authentifié');

    const rule = getYoungPoultryRule(speciesId, data.category_name);
    if (!rule) throw new Error(`Espèce ou catégorie non supportée pour le suivi des jeunes volailles : ${speciesId}`);

    if (!data.name || !data.name.trim()) throw new Error('Le nom ou numéro du lot est obligatoire.');
    if (!data.birth_date) throw new Error(`La date de naissance des ${rule.label_young} est obligatoire.`);

    const initialQty = parseInt(data.initial_quantity, 10);
    if (!initialQty || initialQty <= 0) throw new Error(`Le nombre initial de ${rule.label_young} doit être supérieur à zéro.`);

    const currentQty = data.current_quantity !== undefined && data.current_quantity !== ''
      ? parseInt(data.current_quantity, 10)
      : initialQty;

    if (currentQty < 0) throw new Error(`Le nombre de ${rule.label_young} vivants ne peut pas être négatif.`);

    // Formule obligatoire : Date d'alerte = date de naissance + maturity_days (56 j pour poussins, 84 j pour canetons)
    const maturityDate = addDaysToDate(data.birth_date, rule.maturity_days);

    let lotId = data.lot_id ? Number(data.lot_id) : null;
    if (!lotId && data.create_lot_building) {
      const bl = {
        id: LocalDB.nextId('lots'),
        farm_id: fId,
        name: data.name.trim(),
        species_id: rule.species_id,
        location: data.location?.trim() || null,
        capacity: initialQty,
        building_type: rule.species_id === 'canards' ? 'enclos' : 'poussiniere',
        notes: data.notes?.trim() || null,
        status: 'actif',
        created_at: new Date().toISOString()
      };
      db.lots.push(bl);
      lotId = bl.id;
    }

    const code = data.code ? data.code.trim() : data.name.trim();

    const newAnimal = {
      id: LocalDB.nextId('animals'),
      farm_id: fId,
      code,
      type: 'lot',
      species_id: rule.species_id,
      category_name: rule.young_category,
      breed: data.breed?.trim() || (rule.species_id === 'canards' ? 'Barbarie' : 'Goliath'),
      gender: 'MIXTE',
      birth_date: data.birth_date,
      maturity_date: maturityDate,
      initial_quantity: initialQty,
      current_quantity: currentQty,
      lot_id: lotId,
      observations: data.observations?.trim() || `Lot de ${rule.label_young} né le ${data.birth_date} (${rule.maturity_weeks} sem. le ${maturityDate})`,
      status: currentQty > 0 ? 'actif' : 'clos',
      created_at: new Date().toISOString()
    };
    db.animals.push(newAnimal);

    // Mouvement d'entrée initial
    db.movements.push({
      id: LocalDB.nextId('movements'),
      farm_id: fId,
      animal_id: newAnimal.id,
      type: 'naissance',
      date: data.birth_date,
      species_id: rule.species_id,
      category_name: rule.young_category,
      quantity: initialQty,
      from_lot_id: null,
      to_lot_id: lotId,
      observations: `Entrée initiale lot de ${rule.label_young} : ${newAnimal.code} (+${initialQty} sujets)`,
      created_by: user.id
    });

    LocalDB.save(db);

    return {
      success: true,
      message: `Lot de ${rule.label_young} « ${newAnimal.code} » créé avec succès. Échéance des ${rule.maturity_weeks} semaines : ${maturityDate}.`,
      animal: newAnimal,
      duckling: newAnimal,
      chick: newAnimal,
      maturity_date: maturityDate
    };
  },

  async createDucklingLot(farmId, data) {
    return this.createYoungPoultryLot(farmId, 'canards', data);
  },

  async createChickLot(farmId, data) {
    return this.createYoungPoultryLot(farmId, 'poules', data);
  },

  async classifyPoultry(farmId, animalId, data) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const aId = Number(animalId);
    const user = this.getLoggedUser();
    if (!user) throw new Error('Non authentifié');

    const animal = (db.animals || []).find(a => a.id === aId && a.farm_id === fId);
    if (!animal) throw new Error('Lot de volailles introuvable.');

    const rule = getYoungPoultryRule(animal.species_id, animal.category_name);
    if (!rule) throw new Error(`Ce lot (${animal.category_name}) n'est pas éligible à la classification par sexage.`);

    const available = Number(animal.current_quantity) || 0;
    if (available <= 0) throw new Error(`Aucun ${rule.label_young} vivant disponible à classifier dans ce lot.`);

    const males = parseInt(data.males !== undefined ? data.males : (data.males_count !== undefined ? data.males_count : (data.coqs !== undefined ? data.coqs : 0)), 10) || 0;
    const females = parseInt(data.females !== undefined ? data.females : (data.females_count !== undefined ? data.females_count : (data.poules !== undefined ? data.poules : 0)), 10) || 0;
    const unknown = parseInt(data.unknown !== undefined ? data.unknown : (data.unknown_count !== undefined ? data.unknown_count : (data.inconnus !== undefined ? data.inconnus : 0)), 10) || 0;
    const totalToTransfer = data.total_to_transfer !== undefined
      ? parseInt(data.total_to_transfer, 10)
      : (data.total !== undefined ? parseInt(data.total, 10) : available);

    if (males < 0 || females < 0 || unknown < 0) {
      throw new Error('Les quantités de mâles, femelles et inconnus ne peuvent pas être négatives.');
    }

    if (males + females === 0 && unknown === 0 && totalToTransfer > 0) {
      throw new Error(`Veuillez renseigner au moins un mâle, une femelle ou un ${rule.label_young} à classifier.`);
    }

    // Règle impérative : Nombre de mâles + nombre de femelles + nombre de sexe inconnu = nombre d'animaux vivants à transférer.
    if (males + females + unknown !== totalToTransfer) {
      throw new Error(`La somme (mâles: ${males} + femelles: ${females} + inconnus: ${unknown} = ${males + females + unknown}) doit être strictement égale au nombre de ${rule.label_young} vivants à transférer (${totalToTransfer}).`);
    }

    if (totalToTransfer > available) {
      throw new Error(`Le nombre à transférer (${totalToTransfer}) dépasse l'effectif vivant disponible (${available}).`);
    }

    const classificationDate = data.classification_date || data.date || new Date().toISOString().split('T')[0];
    const transferredTotal = males + females;

    // 1. Déduire du lot jeune uniquement les animaux transférés
    animal.current_quantity -= transferredTotal;
    if (animal.current_quantity <= 0) {
      animal.current_quantity = 0;
      animal.status = 'clos';
    }

    // 2. Ajouter les mâles dans la catégorie adulte mâle
    let maleAnimal = null;
    if (males > 0) {
      const maleLotId = data.male_lot_id ? Number(data.male_lot_id) : (data.target_building_id ? Number(data.target_building_id) : animal.lot_id);
      maleAnimal = (db.animals || []).find(a =>
        a.farm_id === fId &&
        a.species_id === rule.species_id &&
        a.category_name === rule.male_category &&
        a.lot_id === maleLotId &&
        a.status === 'actif'
      );
      if (maleAnimal) {
        maleAnimal.current_quantity += males;
        maleAnimal.initial_quantity += males;
      } else {
        const prefix = rule.species_id === 'canards' ? 'CAN-M' : 'COQ';
        maleAnimal = {
          id: LocalDB.nextId('animals', db),
          farm_id: fId,
          code: `${prefix}-${Date.now().toString().slice(-4)}`,
          type: 'lot',
          species_id: rule.species_id,
          category_name: rule.male_category,
          breed: animal.breed || (rule.species_id === 'canards' ? 'Barbarie' : 'Goliath'),
          gender: 'M',
          birth_date: animal.birth_date,
          initial_quantity: males,
          current_quantity: males,
          lot_id: maleLotId,
          origin_animal_id: animal.id,
          observations: `Issu du sexage à ${rule.maturity_weeks} sem. du lot ${animal.code}`,
          status: 'actif',
          created_at: new Date().toISOString()
        };
        db.animals.push(maleAnimal);
      }
    }

    // 3. Ajouter les femelles dans la catégorie adulte femelle
    let femaleAnimal = null;
    if (females > 0) {
      const femaleLotId = data.female_lot_id ? Number(data.female_lot_id) : (data.target_building_id ? Number(data.target_building_id) : animal.lot_id);
      femaleAnimal = (db.animals || []).find(a =>
        a.farm_id === fId &&
        a.species_id === rule.species_id &&
        a.category_name === rule.female_category &&
        a.lot_id === femaleLotId &&
        a.status === 'actif'
      );
      if (femaleAnimal) {
        femaleAnimal.current_quantity += females;
        femaleAnimal.initial_quantity += females;
      } else {
        const prefix = rule.species_id === 'canards' ? 'CAN-F' : 'POULE';
        femaleAnimal = {
          id: LocalDB.nextId('animals', db),
          farm_id: fId,
          code: `${prefix}-${Date.now().toString().slice(-4)}`,
          type: 'lot',
          species_id: rule.species_id,
          category_name: rule.female_category,
          breed: animal.breed || (rule.species_id === 'canards' ? 'Barbarie' : 'Goliath'),
          gender: 'F',
          birth_date: animal.birth_date,
          initial_quantity: females,
          current_quantity: females,
          lot_id: femaleLotId,
          origin_animal_id: animal.id,
          observations: `Issue du sexage à ${rule.maturity_weeks} sem. du lot ${animal.code}`,
          status: 'actif',
          created_at: new Date().toISOString()
        };
        db.animals.push(femaleAnimal);
      }
    }

    // 4. Mouvement de transfert dans l'historique
    db.movements.push({
      id: LocalDB.nextId('movements', db),
      farm_id: fId,
      animal_id: animal.id,
      type: 'transfert',
      date: classificationDate,
      species_id: rule.species_id,
      category_name: rule.young_category,
      quantity: transferredTotal,
      from_lot_id: animal.lot_id,
      to_lot_id: (maleAnimal ? maleAnimal.lot_id : (femaleAnimal ? femaleAnimal.lot_id : animal.lot_id)),
      observations: `Classification ${rule.maturity_weeks} semaines (${animal.code}) : ${males} ${rule.label_male}, ${females} ${rule.label_female} transférés. Reste ${animal.current_quantity} ${rule.label_young} non identifiés.`,
      created_by: user.id
    });

    // 5. Enregistrer l'historique de la classification
    let lotName = animal.code;
    if (animal.lot_id) {
      const bl = (db.lots || []).find(l => l.id === animal.lot_id);
      if (bl) lotName = `${bl.name} (${animal.code})`;
    }

    const classificationRecord = {
      id: LocalDB.nextId(rule.species_id === 'canards' ? 'duckling_classifications' : 'chick_classifications', db),
      farm_id: fId,
      species_id: rule.species_id,
      animal_id: animal.id,
      lot_id: animal.lot_id,
      lot_name: lotName,
      classification_date: classificationDate,
      total_transferred: transferredTotal,
      males_count: males,
      females_count: females,
      unknown_count: unknown,
      remaining_count: animal.current_quantity,
      remaining_canetons: rule.species_id === 'canards' ? animal.current_quantity : undefined,
      remaining_poussins: rule.species_id === 'poules' ? animal.current_quantity : undefined,
      is_complete: animal.current_quantity === 0,
      male_animal_id: maleAnimal ? maleAnimal.id : null,
      female_animal_id: femaleAnimal ? femaleAnimal.id : null,
      notes: data.notes?.trim() || null,
      user_id: user.id,
      user_name: user.name || 'Exploitant',
      created_at: new Date().toISOString()
    };

    if (rule.species_id === 'canards') {
      db.duckling_classifications = db.duckling_classifications || [];
      db.duckling_classifications.push(classificationRecord);
    } else {
      db.chick_classifications = db.chick_classifications || [];
      db.chick_classifications.push(classificationRecord);
    }

    LocalDB.save(db);

    return {
      success: true,
      message: `Classification validée : ${males} ${rule.label_male} et ${females} ${rule.label_female} transférés avec succès. Reste ${animal.current_quantity} ${rule.label_young}.`,
      classification: classificationRecord,
      animal,
      duckling: animal,
      chick: animal,
      transferred: {
        males,
        females,
        unknown,
        total: transferredTotal
      },
      remaining_quantity: animal.current_quantity,
      remaining_canetons: animal.current_quantity,
      remaining_poussins: animal.current_quantity,
      is_complete: animal.current_quantity === 0
    };
  },

  async classifyDucklings(farmId, animalId, data) {
    return this.classifyPoultry(farmId, animalId, data);
  },

  async classifyChicks(farmId, animalId, data) {
    return this.classifyPoultry(farmId, animalId, data);
  },

  async getDucklingClassificationHistory(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let history = (db.duckling_classifications || []).filter(c => c.farm_id === fId);
    if (filters.animal_id) {
      history = history.filter(c => c.animal_id === Number(filters.animal_id));
    }
    const formatted = history.map(h => ({
      ...h,
      date: h.classification_date,
      initial_quantity: (h.total_transferred || 0) + (h.remaining_canetons !== undefined ? h.remaining_canetons : (h.remaining_count || 0)),
      males: h.males_count || 0,
      females: h.females_count || 0,
      unknown: h.unknown_count || 0
    })).reverse();
    return {
      total: formatted.length,
      history: formatted
    };
  },

  async getChickClassificationHistory(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let history = (db.chick_classifications || []).filter(c => c.farm_id === fId);
    if (filters.animal_id) {
      history = history.filter(c => c.animal_id === Number(filters.animal_id));
    }
    const formatted = history.map(h => ({
      ...h,
      date: h.classification_date,
      initial_quantity: (h.total_transferred || 0) + (h.remaining_poussins !== undefined ? h.remaining_poussins : (h.remaining_count || 0)),
      males: h.males_count || 0,
      females: h.females_count || 0,
      unknown: h.unknown_count || 0
    })).reverse();
    return {
      total: formatted.length,
      history: formatted
    };
  },

  async getYoungPoultryClassificationHistory(farmId, filters = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const duckHist = (db.duckling_classifications || []).filter(c => c.farm_id === fId);
    const chickHist = (db.chick_classifications || []).filter(c => c.farm_id === fId);
    let all = [...duckHist, ...chickHist];
    if (filters.species_id && filters.species_id !== 'toutes' && filters.species_id !== 'all') {
      all = all.filter(c => c.species_id === filters.species_id);
    }
    if (filters.animal_id) {
      all = all.filter(c => c.animal_id === Number(filters.animal_id));
    }
    all.sort((a, b) => new Date(b.classification_date) - new Date(a.classification_date) || b.id - a.id);
    const formatted = all.map(h => ({
      ...h,
      date: h.classification_date,
      initial_quantity: (h.total_transferred || 0) + (h.remaining_count !== undefined ? h.remaining_count : (h.remaining_canetons || h.remaining_poussins || 0)),
      males: h.males_count || 0,
      females: h.females_count || 0,
      unknown: h.unknown_count || 0
    }));
    return {
      total: formatted.length,
      history: formatted
    };
  },

  // 7.4 ALERTES ET RAPPELS PERSONNALISÉS
  async getCustomAlerts(farmId, filters = {}) {
    if (this.isSupabaseConnected()) {
      const alerts = await window.SupabaseService.getCustomAlerts(farmId, filters);
      return { total: alerts.length, alerts };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    let list = (db.custom_alerts || []).filter(a => a.farm_id === fId);

    if (filters.category && filters.category !== 'all' && filters.category !== 'toutes') {
      list = list.filter(a => a.category === filters.category);
    }
    if (filters.scope_type) {
      list = list.filter(a => a.scope_type === filters.scope_type);
    }
    if (filters.species_id) {
      list = list.filter(a => a.species_id === filters.species_id);
    }
    if (filters.status) {
      const todayStr = new Date().toISOString().split('T')[0];
      list = list.filter(a => {
        const st = a.is_completed ? 'traite' : (a.date < todayStr ? 'en_retard' : (a.date === todayStr ? 'aujourdhui' : 'a_venir'));
        return st === filters.status;
      });
    }

    list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (b.id - a.id));
    return {
      total: list.length,
      alerts: list
    };
  },

  async getCustomAlert(farmId, alertId) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const aId = Number(alertId);
    const alert = (db.custom_alerts || []).find(a => a.id === aId && a.farm_id === fId);
    if (!alert) {
      throw new Error('Alerte personnalisée introuvable.');
    }
    return { alert };
  },

  async createCustomAlert(farmId, alertData) {
    if (this.isSupabaseConnected()) {
      const alert = await window.SupabaseService.createCustomAlert(farmId, alertData);
      return {
        message: 'Alerte personnalisée enregistrée avec succès.',
        alert
      };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    if (!alertData.title || !alertData.title.trim()) {
      throw new Error('Le titre ou libellé de l\'alerte est obligatoire.');
    }
    if (!alertData.date) {
      throw new Error('La date d\'échéance de l\'alerte est obligatoire.');
    }

    db.custom_alerts = db.custom_alerts || [];
    const newAlert = {
      id: LocalDB.nextId('custom_alerts'),
      farm_id: fId,
      title: alertData.title.trim(),
      category: alertData.category || 'alimentation',
      activity_type: alertData.activity_type || null,
      scope_type: alertData.scope_type || 'ferme',
      species_id: alertData.species_id || null,
      building_id: alertData.building_id ? Number(alertData.building_id) : null,
      lot_id: alertData.lot_id ? Number(alertData.lot_id) : null,
      feed_type: alertData.feed_type ? alertData.feed_type.trim() : null,
      date: alertData.date,
      time: alertData.time || null,
      frequency: alertData.frequency || 'une_fois',
      priority: alertData.priority || 'normale',
      notes: alertData.notes ? alertData.notes.trim() : '',
      is_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.custom_alerts.push(newAlert);
    LocalDB.save(db);
    return {
      message: 'Alerte personnalisée enregistrée avec succès.',
      alert: newAlert
    };
  },

  async updateCustomAlert(farmId, alertId, alertData) {
    if (this.isSupabaseConnected()) {
      const alert = await window.SupabaseService.updateCustomAlert(farmId, alertId, alertData);
      return {
        message: 'Alerte personnalisée mise à jour avec succès.',
        alert
      };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const aId = Number(alertId);
    db.custom_alerts = db.custom_alerts || [];
    const alert = db.custom_alerts.find(a => a.id === aId && a.farm_id === fId);
    if (!alert) {
      throw new Error('Alerte personnalisée introuvable.');
    }

    if (alertData.title !== undefined) {
      if (!alertData.title.trim()) throw new Error('Le titre de l\'alerte ne peut pas être vide.');
      alert.title = alertData.title.trim();
    }
    if (alertData.category !== undefined) alert.category = alertData.category;
    if (alertData.activity_type !== undefined) alert.activity_type = alertData.activity_type;
    if (alertData.scope_type !== undefined) alert.scope_type = alertData.scope_type;
    if (alertData.species_id !== undefined) alert.species_id = alertData.species_id;
    if (alertData.building_id !== undefined) alert.building_id = alertData.building_id ? Number(alertData.building_id) : null;
    if (alertData.lot_id !== undefined) alert.lot_id = alertData.lot_id ? Number(alertData.lot_id) : null;
    if (alertData.feed_type !== undefined) alert.feed_type = alertData.feed_type ? alertData.feed_type.trim() : null;
    if (alertData.date !== undefined) {
      if (!alertData.date) throw new Error('La date d\'échéance ne peut pas être vide.');
      alert.date = alertData.date;
    }
    if (alertData.time !== undefined) alert.time = alertData.time;
    if (alertData.frequency !== undefined) alert.frequency = alertData.frequency;
    if (alertData.priority !== undefined) alert.priority = alertData.priority;
    if (alertData.notes !== undefined) alert.notes = alertData.notes ? alertData.notes.trim() : '';
    if (alertData.is_completed !== undefined) alert.is_completed = !!alertData.is_completed;

    alert.updated_at = new Date().toISOString();
    LocalDB.save(db);
    return {
      message: 'Alerte personnalisée mise à jour avec succès.',
      alert
    };
  },

  async toggleCustomAlertStatus(farmId, alertId) {
    if (this.isSupabaseConnected()) {
      const { alerts } = await this.getCustomAlerts(farmId);
      const curr = (alerts || []).find(a => String(a.id) === String(alertId));
      const nextStatus = curr ? !curr.is_completed : true;
      const alert = await window.SupabaseService.updateCustomAlert(farmId, alertId, { is_completed: nextStatus });
      return {
        message: nextStatus ? 'Alerte marquée comme terminée / traitée.' : 'Alerte réactivée avec succès.',
        alert
      };
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const aId = Number(alertId);
    db.custom_alerts = db.custom_alerts || [];
    const alert = db.custom_alerts.find(a => a.id === aId && a.farm_id === fId);
    if (!alert) {
      throw new Error('Alerte introuvable.');
    }
    alert.is_completed = !alert.is_completed;
    alert.updated_at = new Date().toISOString();
    LocalDB.save(db);
    return {
      message: alert.is_completed ? 'Alerte marquée comme terminée / traitée.' : 'Alerte réactivée avec succès.',
      alert
    };
  },

  async deleteCustomAlert(farmId, alertId) {
    if (this.isSupabaseConnected()) {
      return await window.SupabaseService.deleteCustomAlert(farmId, alertId);
    }
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const aId = Number(alertId);
    db.custom_alerts = db.custom_alerts || [];
    const beforeLen = db.custom_alerts.length;
    db.custom_alerts = db.custom_alerts.filter(a => !(a.id === aId && a.farm_id === fId));
    if (db.custom_alerts.length === beforeLen) {
      throw new Error('Alerte introuvable ou déjà supprimée.');
    }
    LocalDB.save(db);
    return {
      message: 'Alerte personnalisée supprimée avec succès.'
    };
  },

  // 8. NOTIFICATIONS & ALERTES
  async getNotifications(farmId, options = {}) {
    await this.delay();
    const db = LocalDB.load();
    const fId = Number(farmId);
    const farm = (db.farms || []).find(f => f.id === fId);
    const farmName = farm ? farm.name : 'Exploitation';
    const notifs = [];
    let notifId = 1;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const statusLabelMap = {
      'en_retard': 'En retard',
      'aujourdhui': "À traiter aujourd'hui",
      'a_venir': 'À venir',
      'traite': 'Traitée',
      'croissance': 'En croissance'
    };

    // 1. Naissances prévues & Gestations programmées (sans restriction artificielle de 7 jours)
    (db.reproductions || [])
      .filter(r => r.farm_id === fId && ['en_attente', 'gestation_confirmee'].includes(r.status) && r.expected_birth_date)
      .forEach(r => {
        let st = 'a_venir';
        let priority = 'warning';
        let stLabel = 'Programmé';
        let title = `🍼 Mise bas programmée : ${r.female_name || 'Femelle'}`;
        let message = `Ferme : ${farmName} • Mise bas attendue le ${r.expected_birth_date} (${r.female_name || 'Femelle'}). Surveillance et préparation de la loge.`;

        if (r.expected_birth_date < todayStr) {
          st = 'en_retard';
          priority = 'danger';
          stLabel = 'En retard';
          title = `⚠️ Mise bas en retard : ${r.female_name || 'Femelle'}`;
          message = `Ferme : ${farmName} • Date de mise bas dépassée (prévue le ${r.expected_birth_date} pour ${r.female_name || 'Femelle'}). Contrôle d'urgence requis.`;
        } else if (r.expected_birth_date === todayStr) {
          st = 'aujourdhui';
          priority = 'danger';
          stLabel = "À traiter aujourd'hui";
          title = `🍼 Mise bas attendue aujourd'hui : ${r.female_name || 'Femelle'}`;
          message = `Ferme : ${farmName} • Mise bas prévue aujourd'hui (${r.expected_birth_date}) pour ${r.female_name || 'Femelle'}. Préparez la loge de mise bas.`;
        }

        notifs.push({
          id: notifId++,
          type: 'reproduction',
          subtype: st,
          category_type: 'reproduction',
          alert_category: 'planned_activity',
          alert_type: 'activite_programmee',
          alert_type_label: 'Reproduction & Gestation',
          farm_id: fId,
          farm_name: farmName,
          status: st,
          status_label: stLabel,
          priority,
          severity: priority === 'danger' ? 'high' : 'medium',
          title,
          message,
          date: r.expected_birth_date,
          data: {
            farm_id: fId,
            farm_name: farmName,
            repro_id: r.id,
            female_name: r.female_name,
            expected_birth_date: r.expected_birth_date,
            status: st,
            status_label: stLabel
          }
        });
      });

    // 2. Éclosions attendues & Incubations en cours (sans restriction artificielle de 7 jours)
    (db.incubations || [])
      .filter(i => i.farm_id === fId && i.status === 'en_cours' && i.expected_hatch_date)
      .forEach(i => {
        let st = 'a_venir';
        let priority = 'warning';
        let stLabel = 'Programmé';
        let title = `🐣 Éclosion programmée : ${i.code}`;
        let message = `Ferme : ${farmName} • Lot ${i.code} (${i.eggs_count} œufs) : date d'éclosion estimée le ${i.expected_hatch_date}.`;

        if (i.expected_hatch_date < todayStr) {
          st = 'en_retard';
          priority = 'danger';
          stLabel = 'En retard';
          title = `⚠️ Éclosion en retard : ${i.code}`;
          message = `Ferme : ${farmName} • Date d'éclosion dépassée pour le lot ${i.code} (${i.eggs_count} œufs, prévue le ${i.expected_hatch_date}). Vérifiez la couveuse.`;
        } else if (i.expected_hatch_date === todayStr) {
          st = 'aujourdhui';
          priority = 'danger';
          stLabel = "À traiter aujourd'hui";
          title = `🐣 Éclosion attendue aujourd'hui : ${i.code}`;
          message = `Ferme : ${farmName} • Lot ${i.code} (${i.eggs_count} œufs) : éclosion attendue ce jour (${i.expected_hatch_date}). Préparez les éleveuses.`;
        }

        notifs.push({
          id: notifId++,
          type: 'incubation',
          subtype: st,
          category_type: 'incubation',
          alert_category: 'planned_activity',
          alert_type: 'activite_programmee',
          alert_type_label: 'Ponte & Incubation',
          farm_id: fId,
          farm_name: farmName,
          status: st,
          status_label: stLabel,
          priority,
          severity: priority === 'danger' ? 'high' : 'medium',
          title,
          message,
          date: i.expected_hatch_date,
          data: {
            farm_id: fId,
            farm_name: farmName,
            incubation_id: i.id,
            code: i.code,
            eggs_count: i.eggs_count,
            expected_hatch_date: i.expected_hatch_date,
            status: st,
            status_label: stLabel
          }
        });
      });

    // 3. Soins vétérinaires & Traitements programmés (sans restriction artificielle de 7 jours)
    (db.health_treatments || [])
      .filter(t => t.farm_id === fId && t.next_care_date)
      .forEach(t => {
        let st = 'a_venir';
        let priority = 'warning';
        let stLabel = 'Programmé';
        let title = `🩺 Soin vétérinaire programmé : ${t.treatment_name}`;
        let message = `Ferme : ${farmName} • ${t.treatment_name} programmé pour le ${t.next_care_date}.`;

        if (t.next_care_date < todayStr) {
          st = 'en_retard';
          priority = 'danger';
          stLabel = 'En retard';
          title = `⚠️ Soin vétérinaire en retard : ${t.treatment_name}`;
          message = `Ferme : ${farmName} • Rappel de soin vétérinaire dépassé depuis le ${t.next_care_date} (${t.treatment_name}). À effectuer sans délai.`;
        } else if (t.next_care_date === todayStr) {
          st = 'aujourdhui';
          priority = 'danger';
          stLabel = "À traiter aujourd'hui";
          title = `🩺 Soin vétérinaire prévu aujourd'hui : ${t.treatment_name}`;
          message = `Ferme : ${farmName} • ${t.treatment_name} prévu ce jour (${t.next_care_date}). Préparez le matériel et l'intervention.`;
        }

        notifs.push({
          id: notifId++,
          type: 'health',
          subtype: st,
          category_type: 'health',
          alert_category: 'planned_activity',
          alert_type: 'activite_programmee',
          alert_type_label: 'Santé & Vétérinaire',
          farm_id: fId,
          farm_name: farmName,
          status: st,
          status_label: stLabel,
          priority,
          severity: priority === 'danger' ? 'high' : 'medium',
          title,
          message,
          date: t.next_care_date,
          data: {
            farm_id: fId,
            farm_name: farmName,
            treatment_id: t.id,
            treatment_name: t.treatment_name,
            next_care_date: t.next_care_date,
            status: st,
            status_label: stLabel
          }
        });
      });

    // 4. Entretiens programmés des bâtiments & installations
    const maintTypeLabels = {
      'nettoyage': 'Nettoyage complet',
      'desinfection': 'Désinfection & Chaulage',
      'changement_litiere': 'Changement de litière',
      'vide_sanitaire': 'Mise en vide sanitaire',
      'reparation': 'Réparation / Clôture'
    };

    (db.building_maintenance || [])
      .filter(bm => bm.farm_id === fId && bm.next_date)
      .forEach(bm => {
        const lot = (db.lots || []).find(l => l.id === bm.lot_id);
        const lotName = lot ? lot.name : `Bâtiment #${bm.lot_id}`;
        const typeLabel = maintTypeLabels[bm.type] || bm.type || 'Entretien';

        // Vérifier si un entretien postérieur a déjà été réalisé sur ce même bâtiment
        const subsequentMaint = (db.building_maintenance || []).some(other =>
          other.id !== bm.id &&
          other.farm_id === fId &&
          other.lot_id === bm.lot_id &&
          other.date && other.date >= bm.next_date &&
          other.id > bm.id
        );

        let st = 'a_venir';
        let priority = 'warning';
        let stLabel = 'Programmé';
        let title = `🛠️ Prochain entretien : ${lotName}`;
        let message = `Ferme : ${farmName} • Bâtiment : ${lotName} • Type : ${typeLabel} • Prévu le ${bm.next_date}.`;

        if (subsequentMaint) {
          st = 'traite';
          priority = 'normal';
          stLabel = 'Traitée';
          title = `✅ Entretien réalisé : ${lotName}`;
          message = `Ferme : ${farmName} • Bâtiment : ${lotName} • Entretien de type ${typeLabel} complété avec succès.`;
        } else if (bm.next_date < todayStr) {
          st = 'en_retard';
          priority = 'danger';
          stLabel = 'En retard';
          title = `⚠️ Entretien en retard : ${lotName}`;
          message = `Ferme : ${farmName} • Entretien dépassé depuis le ${bm.next_date} (${typeLabel} sur ${lotName}). À réaliser d'urgence.`;
        } else if (bm.next_date === todayStr) {
          st = 'aujourdhui';
          priority = 'danger';
          stLabel = "À traiter aujourd'hui";
          title = `🛠️ Entretien prévu aujourd'hui : ${lotName}`;
          message = `Ferme : ${farmName} • ${typeLabel} prévu ce jour (${bm.next_date}) sur ${lotName}.`;
        }

        notifs.push({
          id: notifId++,
          type: 'building_maintenance',
          subtype: st,
          category_type: 'building_maintenance',
          alert_category: 'planned_activity',
          alert_type: 'activite_programmee',
          alert_type_label: 'Bâtiments & Entretien',
          farm_id: fId,
          farm_name: farmName,
          lot_id: bm.lot_id,
          lot_name: lotName,
          maint_type: bm.type,
          maint_type_label: typeLabel,
          status: st,
          status_label: stLabel,
          priority,
          severity: priority === 'danger' ? 'high' : priority === 'warning' ? 'medium' : 'low',
          title,
          message,
          date: bm.next_date,
          data: {
            farm_id: fId,
            farm_name: farmName,
            maint_id: bm.id,
            lot_id: bm.lot_id,
            lot_name: lotName,
            maint_type: bm.type,
            maint_type_label: typeLabel,
            next_date: bm.next_date,
            status: st,
            status_label: stLabel
          }
        });
      });

    // 5. Stocks faibles d'aliments
    db.feeds
      .filter(f => f.farm_id === fId && f.stock_quantity <= f.min_threshold)
      .forEach(f => {
        notifs.push({
          id: notifId++,
          type: 'feed',
          category_type: 'feed',
          alert_type: 'feed',
          alert_type_label: 'Alimentation & Stocks',
          farm_id: fId,
          farm_name: farmName,
          priority: 'danger',
          title: 'Stock d\'aliment critique',
          message: `Ferme : ${farmName} • ${f.name} : reste seulement ${f.stock_quantity} ${f.unit} (seuil : ${f.min_threshold} ${f.unit}). Réapprovisionnez rapidement.`,
          date: now.toISOString().split('T')[0],
          data: {
            farm_id: fId,
            farm_name: farmName,
            feed_id: f.id,
            name: f.name,
            stock_quantity: f.stock_quantity,
            unit: f.unit,
            min_threshold: f.min_threshold
          }
        });
      });

    // Dépassements de capacité des bâtiments
    const lots = db.lots.filter(l => l.farm_id === fId && (l.status === 'actif' || !l.status));
    const animals = db.animals.filter(a => a.farm_id === fId && a.status === 'actif');
    lots.forEach(l => {
      const headcount = animals.filter(a => a.lot_id === l.id).reduce((s, a) => s + (Number(a.current_quantity) || 0), 0);
      if (l.capacity > 0 && headcount > l.capacity) {
        notifs.push({
          id: notifId++,
          type: 'building',
          category_type: 'building',
          alert_type: 'building',
          alert_type_label: 'Bâtiments & Capacité',
          farm_id: fId,
          farm_name: farmName,
          priority: 'danger',
          title: 'Capacité maximale dépassée',
          message: `Ferme : ${farmName} • ${l.name} : ${headcount} animaux hébergés pour une capacité limite de ${l.capacity} têtes (+${headcount - l.capacity} en surpopulation).`,
          date: now.toISOString().split('T')[0],
          data: {
            farm_id: fId,
            farm_name: farmName,
            lot_id: l.id,
            lot_name: l.name,
            headcount,
            capacity: l.capacity
          }
        });
      }
    });

    // Alertes de maturité 12 semaines pour les canetons (Canards : 84 jours)
    const ducklingAlertsData = this.computeDucklingAlertsFromDb(db, fId);
    // 1. Alertes actives (en retard, aujourd'hui, à venir)
    ducklingAlertsData.alerts.forEach(da => {
      const stLabel = statusLabelMap[da.status] || da.status;
      notifs.push({
        id: notifId++,
        type: 'duckling_maturity',
        subtype: da.status,
        alert_category: 'growth_classification',
        alert_type: 'croissance_classification',
        alert_type_label: 'Croissance et classification des animaux',
        farm_id: fId,
        farm_name: farmName,
        species_id: 'canards',
        species_name: 'Canards',
        lot_id: da.lot_id,
        lot_name: da.lot_name,
        animal_id: da.animal_id,
        birth_date: da.birth_date,
        maturity_date: da.maturity_date,
        expected_classification_date: da.maturity_date,
        age_days: da.age_days,
        age_weeks: da.age_weeks,
        age_rem_days: da.age_rem_days,
        age_label: `${da.age_weeks} semaine${da.age_weeks > 1 ? 's' : ''}${da.age_rem_days > 0 ? ' (' + da.age_days + ' jours)' : ''}`,
        initial_quantity: da.initial_quantity,
        current_quantity: da.current_quantity,
        remaining_to_classify: da.current_quantity,
        alert_status: da.status,
        status: da.status,
        status_label: stLabel,
        priority: da.status === 'a_venir' ? 'warning' : 'danger',
        severity: da.status === 'a_venir' ? 'medium' : 'high',
        title: da.status === 'en_retard'
          ? `⚠️ Sexage en retard : ${da.lot_name}`
          : da.status === 'aujourdhui'
          ? `🦆 12 semaines atteintes : ${da.lot_name}`
          : `⏳ Échéance 12 semaines proche : ${da.lot_name}`,
        message: `Ferme : ${farmName} • Espèce : Canards • Lot : ${da.lot_name} • Né le ${da.birth_date} (âge : ${da.age_weeks} sem.) • ${da.current_quantity} caneton(s) à classifier • Date prévue : ${da.maturity_date} • Statut : ${stLabel}`,
        date: da.maturity_date,
        data: {
          animal_id: da.animal_id,
          lot_id: da.lot_id,
          lot_name: da.lot_name,
          species_id: 'canards',
          species_name: 'Canards',
          farm_id: fId,
          farm_name: farmName,
          birth_date: da.birth_date,
          maturity_date: da.maturity_date,
          expected_classification_date: da.maturity_date,
          age_days: da.age_days,
          age_weeks: da.age_weeks,
          age_rem_days: da.age_rem_days,
          age_label: `${da.age_weeks} semaine${da.age_weeks > 1 ? 's' : ''}`,
          initial_quantity: da.initial_quantity,
          current_quantity: da.current_quantity,
          remaining_to_classify: da.current_quantity,
          alert_type_label: 'Croissance et classification des animaux',
          status: da.status,
          alert_status: da.status,
          status_label: stLabel
        }
      });
    });

    // 2. Lots traités pour les canetons
    (ducklingAlertsData.lots || []).filter(l => l.status === 'traite').forEach(da => {
      const stLabel = statusLabelMap.traite;
      notifs.push({
        id: notifId++,
        type: 'duckling_maturity',
        subtype: 'traite',
        alert_category: 'growth_classification',
        alert_type: 'croissance_classification',
        alert_type_label: 'Croissance et classification des animaux',
        farm_id: fId,
        farm_name: farmName,
        species_id: 'canards',
        species_name: 'Canards',
        lot_id: da.lot_id,
        lot_name: da.lot_name,
        animal_id: da.animal_id,
        birth_date: da.birth_date,
        maturity_date: da.maturity_date,
        expected_classification_date: da.maturity_date,
        age_days: da.age_days,
        age_weeks: da.age_weeks,
        age_rem_days: da.age_rem_days,
        age_label: `${da.age_weeks} semaine${da.age_weeks > 1 ? 's' : ''}`,
        initial_quantity: da.initial_quantity,
        current_quantity: 0,
        remaining_to_classify: 0,
        alert_status: 'traite',
        status: 'traite',
        status_label: stLabel,
        priority: 'normal',
        severity: 'low',
        title: `✅ Classification terminée : ${da.lot_name}`,
        message: `Ferme : ${farmName} • Espèce : Canards • Lot : ${da.lot_name} • Né le ${da.birth_date} • 100% sexé et transféré • Statut : ${stLabel}`,
        date: da.maturity_date,
        data: {
          animal_id: da.animal_id,
          lot_id: da.lot_id,
          lot_name: da.lot_name,
          species_id: 'canards',
          species_name: 'Canards',
          farm_id: fId,
          farm_name: farmName,
          birth_date: da.birth_date,
          maturity_date: da.maturity_date,
          expected_classification_date: da.maturity_date,
          age_days: da.age_days,
          age_weeks: da.age_weeks,
          age_rem_days: da.age_rem_days,
          age_label: `${da.age_weeks} semaine${da.age_weeks > 1 ? 's' : ''}`,
          initial_quantity: da.initial_quantity,
          current_quantity: 0,
          remaining_to_classify: 0,
          alert_type_label: 'Croissance et classification des animaux',
          status: 'traite',
          alert_status: 'traite',
          status_label: stLabel
        }
      });
    });

    // Alertes de maturité 8 semaines pour les poussins (Poules : 56 jours)
    const chickAlertsData = this.computeChickAlertsFromDb(db, fId);
    // 1. Alertes actives
    chickAlertsData.alerts.forEach(ca => {
      const stLabel = statusLabelMap[ca.status] || ca.status;
      notifs.push({
        id: notifId++,
        type: 'chick_maturity',
        subtype: ca.status,
        alert_category: 'growth_classification',
        alert_type: 'croissance_classification',
        alert_type_label: 'Croissance et classification des animaux',
        farm_id: fId,
        farm_name: farmName,
        species_id: 'poules',
        species_name: 'Poules',
        lot_id: ca.lot_id,
        lot_name: ca.lot_name,
        animal_id: ca.animal_id,
        birth_date: ca.birth_date,
        maturity_date: ca.maturity_date,
        expected_classification_date: ca.maturity_date,
        age_days: ca.age_days,
        age_weeks: ca.age_weeks,
        age_rem_days: ca.age_rem_days,
        age_label: `${ca.age_weeks} semaine${ca.age_weeks > 1 ? 's' : ''}${ca.age_rem_days > 0 ? ' (' + ca.age_days + ' jours)' : ''}`,
        initial_quantity: ca.initial_quantity,
        current_quantity: ca.current_quantity,
        remaining_to_classify: ca.current_quantity,
        alert_status: ca.status,
        status: ca.status,
        status_label: stLabel,
        priority: ca.status === 'a_venir' ? 'warning' : 'danger',
        severity: ca.status === 'a_venir' ? 'medium' : 'high',
        title: ca.status === 'en_retard'
          ? `⚠️ Sexage en retard : ${ca.lot_name}`
          : ca.status === 'aujourdhui'
          ? `🐥 8 semaines atteintes : ${ca.lot_name}`
          : `⏳ Échéance 8 semaines proche : ${ca.lot_name}`,
        message: `Ferme : ${farmName} • Espèce : Poules • Lot : ${ca.lot_name} • Né le ${ca.birth_date} (âge : ${ca.age_weeks} sem.) • ${ca.current_quantity} poussin(s) à classifier • Date prévue : ${ca.maturity_date} • Statut : ${stLabel}`,
        date: ca.maturity_date,
        data: {
          animal_id: ca.animal_id,
          lot_id: ca.lot_id,
          lot_name: ca.lot_name,
          species_id: 'poules',
          species_name: 'Poules',
          farm_id: fId,
          farm_name: farmName,
          birth_date: ca.birth_date,
          maturity_date: ca.maturity_date,
          expected_classification_date: ca.maturity_date,
          age_days: ca.age_days,
          age_weeks: ca.age_weeks,
          age_rem_days: ca.age_rem_days,
          age_label: `${ca.age_weeks} semaine${ca.age_weeks > 1 ? 's' : ''}`,
          initial_quantity: ca.initial_quantity,
          current_quantity: ca.current_quantity,
          remaining_to_classify: ca.current_quantity,
          alert_type_label: 'Croissance et classification des animaux',
          status: ca.status,
          alert_status: ca.status,
          status_label: stLabel
        }
      });
    });

    // 2. Lots traités pour les poussins
    (chickAlertsData.lots || []).filter(l => l.status === 'traite').forEach(ca => {
      const stLabel = statusLabelMap.traite;
      notifs.push({
        id: notifId++,
        type: 'chick_maturity',
        subtype: 'traite',
        alert_category: 'growth_classification',
        alert_type: 'croissance_classification',
        alert_type_label: 'Croissance et classification des animaux',
        farm_id: fId,
        farm_name: farmName,
        species_id: 'poules',
        species_name: 'Poules',
        lot_id: ca.lot_id,
        lot_name: ca.lot_name,
        animal_id: ca.animal_id,
        birth_date: ca.birth_date,
        maturity_date: ca.maturity_date,
        expected_classification_date: ca.maturity_date,
        age_days: ca.age_days,
        age_weeks: ca.age_weeks,
        age_rem_days: ca.age_rem_days,
        age_label: `${ca.age_weeks} semaine${ca.age_weeks > 1 ? 's' : ''}`,
        initial_quantity: ca.initial_quantity,
        current_quantity: 0,
        remaining_to_classify: 0,
        alert_status: 'traite',
        status: 'traite',
        status_label: stLabel,
        priority: 'normal',
        severity: 'low',
        title: `✅ Classification terminée : ${ca.lot_name}`,
        message: `Ferme : ${farmName} • Espèce : Poules • Lot : ${ca.lot_name} • Né le ${ca.birth_date} • 100% sexé et transféré • Statut : ${stLabel}`,
        date: ca.maturity_date,
        data: {
          animal_id: ca.animal_id,
          lot_id: ca.lot_id,
          lot_name: ca.lot_name,
          species_id: 'poules',
          species_name: 'Poules',
          farm_id: fId,
          farm_name: farmName,
          birth_date: ca.birth_date,
          maturity_date: ca.maturity_date,
          expected_classification_date: ca.maturity_date,
          age_days: ca.age_days,
          age_weeks: ca.age_weeks,
          age_rem_days: ca.age_rem_days,
          age_label: `${ca.age_weeks} semaine${ca.age_weeks > 1 ? 's' : ''}`,
          initial_quantity: ca.initial_quantity,
          current_quantity: 0,
          remaining_to_classify: 0,
          alert_type_label: 'Croissance et classification des animaux',
          status: 'traite',
          alert_status: 'traite',
          status_label: stLabel
        }
      });
    });

    // 5. Alertes & Rappels personnalisés de la ferme (Alimentation, Incubation, Santé, etc.)
    const categoryInfoMap = {
      'alimentation': { label: 'Alimentation & Eau', icon: '🌾' },
      'incubation': { label: 'Incubation & Éclosion', icon: '🥚' },
      'sante': { label: 'Santé & Vétérinaire', icon: '🩺' },
      'reproduction': { label: 'Reproduction & Gestation', icon: '🍼' },
      'entretien': { label: 'Bâtiments & Entretien', icon: '🧹' },
      'commercial': { label: 'Commercial & Ventes', icon: '💰' },
      'autre': { label: 'Alerte générale', icon: '🔔' }
    };

    const frequencyLabelMap = {
      'une_fois': 'Une seule fois (Ponctuel)',
      'quotidien': 'Quotidien',
      'hebdomadaire': 'Hebdomadaire',
      'mensuel': 'Mensuel'
    };

    (db.custom_alerts || [])
      .filter(ca => ca.farm_id === fId)
      .forEach(ca => {
        let st = 'a_venir';
        if (ca.is_completed) {
          st = 'traite';
        } else if (ca.date < todayStr) {
          st = 'en_retard';
        } else if (ca.date === todayStr) {
          st = 'aujourdhui';
        } else {
          st = 'a_venir';
        }

        const stLabel = statusLabelMap[st] || (st === 'traite' ? 'Traitée' : st);
        const catInfo = categoryInfoMap[ca.category] || categoryInfoMap.autre;
        const freqLabel = frequencyLabelMap[ca.frequency] || ca.frequency || 'Une fois';

        // Target scope resolution
        let targetLabel = 'Toute l\'exploitation';
        let speciesName = null;
        let buildingName = null;
        let lotName = null;

        if (ca.species_id) {
          const sp = (db.species || []).find(s => s.id === ca.species_id);
          speciesName = sp ? sp.name : ca.species_id;
        }
        if (ca.building_id) {
          const bldg = (db.lots || []).find(l => l.id === ca.building_id);
          buildingName = bldg ? bldg.name : `Bâtiment #${ca.building_id}`;
        }
        if (ca.lot_id) {
          const anLot = (db.animals || []).find(a => a.id === ca.lot_id);
          lotName = anLot ? (anLot.name || anLot.code) : `Lot #${ca.lot_id}`;
        }

        if (ca.scope_type === 'espece' && speciesName) {
          targetLabel = `Espèce : ${speciesName}`;
        } else if (ca.scope_type === 'batiment' && buildingName) {
          targetLabel = `Bâtiment : ${buildingName}`;
        } else if (ca.scope_type === 'lot' && lotName) {
          targetLabel = `Lot : ${lotName}${speciesName ? ' (' + speciesName + ')' : ''}`;
        }

        const prio = ca.priority || 'normale';
        let priorityStyle = 'normal';
        let severity = 'low';
        if (prio === 'haute') {
          priorityStyle = 'danger';
          severity = 'high';
        } else if (prio === 'moyenne') {
          priorityStyle = 'warning';
          severity = 'medium';
        }

        let notifPriority = priorityStyle;
        if (st === 'en_retard') notifPriority = 'danger';
        else if (st === 'aujourdhui') notifPriority = 'warning';
        else if (st === 'traite') notifPriority = 'normal';

        let notifTitle = `${catInfo.icon} ${ca.title}`;
        if (st === 'traite') {
          notifTitle = `✅ ${ca.title} (Terminée)`;
        } else if (st === 'en_retard') {
          notifTitle = `⚠️ En retard : ${ca.title}`;
        }

        let msg = `Ferme : ${farmName} • Cible : ${targetLabel} • Prévu le ${ca.date}${ca.time ? ' à ' + ca.time : ''} • Fréquence : ${freqLabel} • Statut : ${stLabel}`;
        if (ca.feed_type) {
          msg += ` • Aliment : ${ca.feed_type}`;
        }
        if (ca.notes) {
          msg += ` • Notes : ${ca.notes}`;
        }

        notifs.push({
          id: notifId++,
          custom_alert_id: ca.id,
          type: 'custom_alert',
          subtype: st,
          category_type: ca.category,
          alert_category: 'custom_alert',
          alert_type: 'custom_alert',
          alert_type_label: catInfo.label,
          farm_id: fId,
          farm_name: farmName,
          scope_type: ca.scope_type || 'ferme',
          species_id: ca.species_id || null,
          species_name: speciesName,
          building_id: ca.building_id || null,
          building_name: buildingName,
          lot_id: ca.lot_id || null,
          lot_name: lotName,
          feed_type: ca.feed_type || null,
          activity_type: ca.activity_type || null,
          date: ca.date,
          time: ca.time || null,
          frequency: ca.frequency || 'une_fois',
          frequency_label: freqLabel,
          priority: notifPriority,
          custom_priority: prio,
          severity,
          title: notifTitle,
          message: msg,
          notes: ca.notes || '',
          is_completed: !!ca.is_completed,
          status: st,
          alert_status: st,
          status_label: stLabel,
          data: {
            ...ca,
            targetLabel,
            catInfo,
            freqLabel
          }
        });
      });

    // Tri intelligent des notifications :
    // 1. En retard en premier
    // 2. Aujourd'hui
    // 3. À venir / Programmées (chronologique croissant)
    // 4. Alertes générales (stock, bâtiment)
    // 5. Traitées en dernier
    const statusWeight = {
      'en_retard': 1,
      'aujourdhui': 2,
      'a_venir': 3,
      'croissance': 4,
      'traite': 5
    };
    notifs.sort((a, b) => {
      const wa = statusWeight[a.subtype || a.status] || (a.priority === 'danger' ? 2 : 3);
      const wb = statusWeight[b.subtype || b.status] || (b.priority === 'danger' ? 2 : 3);
      if (wa !== wb) return wa - wb;
      if (a.date && b.date) {
        return a.date.localeCompare(b.date);
      }
      return 0;
    });

    const activeNotifs = notifs.filter(n => n.subtype !== 'traite' && n.status !== 'traite');
    const plannedNotifs = notifs.filter(n => n.alert_category === 'planned_activity' || ['building_maintenance', 'health', 'reproduction', 'incubation'].includes(n.type));
    const customAlertsNotifs = notifs.filter(n => n.type === 'custom_alert');
    const customAlertsActiveCount = activeNotifs.filter(n => n.type === 'custom_alert').length;

    return {
      notifications: notifs,
      total_notifications: activeNotifs.length,
      unread_count: activeNotifs.length,
      active_count: activeNotifs.length,
      all_count: notifs.length,
      growth_alerts: notifs.filter(n => ['duckling_maturity', 'chick_maturity'].includes(n.type)),
      growth_alerts_active_count: activeNotifs.filter(n => ['duckling_maturity', 'chick_maturity'].includes(n.type)).length,
      planned_activities: plannedNotifs,
      planned_activities_active_count: activeNotifs.filter(n => n.alert_category === 'planned_activity' || ['building_maintenance', 'health', 'reproduction', 'incubation'].includes(n.type)).length,
      custom_alerts: customAlertsNotifs,
      custom_alerts_active_count: customAlertsActiveCount,
      urgent_count: activeNotifs.filter(n => ['en_retard', 'aujourdhui'].includes(n.subtype) || n.priority === 'danger').length,
      upcoming_count: activeNotifs.filter(n => n.subtype === 'a_venir' || n.priority === 'warning').length,
      treated_count: notifs.filter(n => n.subtype === 'traite' || n.status === 'traite').length
    };
  }
};

API.getYoungPoultryRule = getYoungPoultryRule;

window.API = API;
if (typeof module !== 'undefined') {
  module.exports = API;
}
