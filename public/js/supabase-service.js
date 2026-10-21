// ==============================================================================
// AGRO-FERME — COUCHE DE SERVICE CENTRALISÉE SUPABASE (DATABASE & AUTH)
// ==============================================================================
// Cette couche fournit toutes les opérations de lecture, écriture, mise à jour
// et suppression directement sur PostgreSQL via le client officiel Supabase.
// Elle gère également l'authentification par Supabase Auth.
// ==============================================================================

const SupabaseService = {
  getClient() {
    return (typeof window !== 'undefined' && window.SupabaseClientManager)
      ? window.SupabaseClientManager.client
      : null;
  },

  isAvailable() {
    const client = this.getClient();
    return Boolean(client && window.SupabaseClientManager && window.SupabaseClientManager.isReady());
  },

  // ============================================================================
  // 1. AUTHENTIFICATION & UTILISATEURS (SUPABASE AUTH & PROFILES)
  // ============================================================================

  async signUp(email, password, fullName = '') {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase n\'est pas connecté.');

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (fullName || '').trim();

    // 1. Tenter la création via le backend Supabase Admin (contourne "email rate limit exceeded")
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, name: cleanName })
      });

      if (resp.ok) {
        // Utilisateur créé et auto-confirmé par l'API Admin -> Connexion immédiate
        const loginRes = await this.signIn(cleanEmail, password);
        return {
          user: loginRes.user,
          session: loginRes.token ? { access_token: loginRes.token } : null,
          token: loginRes.token,
          farms: loginRes.farms || [],
          message: 'Compte créé avec succès et activé automatiquement !'
        };
      } else {
        const errData = await resp.json().catch(() => ({}));
        if (errData && errData.error) {
          // Si l'utilisateur existe déjà ou erreur de validation, propager l'erreur
          if (!errData.error.includes('administrateur')) {
            throw new Error(errData.error);
          }
        }
      }
    } catch (adminErr) {
      if (adminErr.message && !adminErr.message.includes('administrateur') && !adminErr.message.includes('Failed to fetch')) {
        throw adminErr;
      }
      console.warn('Backend admin non disponible, repli sur supabase.auth.signUp() :', adminErr.message);
    }

    // 2. Fallback client direct via supabase.auth.signUp()
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          role: 'fermier'
        }
      }
    });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('rate limit')) {
        throw new Error('Quota d\'e-mails Supabase atteint ("email rate limit exceeded"). Désactivez "Confirm email" dans le tableau de bord Supabase (Authentication > Providers > Email) ou utilisez l\'API backend.');
      }
      throw error;
    }

    // Mettre à jour le profil si la session est active (le trigger handle_new_user s'en charge aussi)
    if (data.user && data.session) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email,
          full_name: cleanName,
          role: 'fermier'
        });
      } catch (profileErr) {
        console.warn('Note : Le profil sera initialisé par le trigger de base :', profileErr.message);
      }
    }

    return {
      user: data.user ? {
        id: data.user.id,
        email: data.user.email,
        name: cleanName || data.user.email
      } : null,
      session: data.session,
      token: data.session ? data.session.access_token : null
    };
  },

  async signIn(email, password) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase n\'est pas connecté.');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // Récupérer le profil et les exploitations associées
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    const { data: farms } = await supabase
      .from('farms')
      .select('*')
      .order('created_at', { ascending: true });

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: (profile && profile.full_name) || data.user.email,
        role: (profile && profile.role) || 'fermier'
      },
      token: data.session ? data.session.access_token : 'supabase-auth-token',
      farms: Array.isArray(farms) ? farms : []
    };
  },

  async signOut() {
    const supabase = this.getClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  },

  async getCurrentSession() {
    const supabase = this.getClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data ? data.session : null;
  },

  async getCurrentUser() {
    const supabase = this.getClient();
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email,
      name: (profile && profile.full_name) || user.email,
      role: (profile && profile.role) || 'fermier',
      avatar_url: profile ? profile.avatar_url : null
    };
  },

  async resetPasswordForEmail(email) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase n\'est pas connecté.');
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    return { success: true, message: 'Un e-mail de réinitialisation vous a été envoyé.' };
  },

  // ============================================================================
  // 2. EXPLOITATIONS AGRICOLES (FARMS)
  // ============================================================================

  async getFarms() {
    const supabase = this.getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('farms')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getFarmById(farmId) {
    const supabase = this.getClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('farms')
      .select('*')
      .eq('id', String(farmId))
      .single();
    if (error) throw error;
    return data;
  },

  async createFarm(farmData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const user = await this.getCurrentUser();
    const payload = {
      name: farmData.name,
      owner_name: farmData.owner_name || (user ? user.name : ''),
      country: farmData.country || 'Togo',
      locality: farmData.locality || '',
      farm_type: farmData.farm_type || 'Élevage mixte',
      currency: farmData.currency || 'FCFA',
      start_date: farmData.start_date || new Date().toISOString().split('T')[0],
      owner_id: user ? user.id : null,
      is_active: true
    };

    const { data, error } = await supabase
      .from('farms')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Associer l'utilisateur dans user_farms
    if (user && data) {
      await supabase.from('user_farms').insert([{
        user_id: user.id,
        farm_id: data.id,
        role: 'proprietaire'
      }]);

      // Activer les espèces de base pour cette nouvelle ferme
      const baseSpecies = ['poules', 'canards', 'chevres'];
      const farmSpeciesRows = baseSpecies.map(spId => ({
        farm_id: data.id,
        species_id: spId,
        is_active: true
      }));
      await supabase.from('farm_species').upsert(farmSpeciesRows);
    }

    return data;
  },

  async updateFarm(farmId, farmData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase
      .from('farms')
      .update({
        ...farmData,
        updated_at: new Date().toISOString()
      })
      .eq('id', String(farmId))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteFarm(farmId) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { error } = await supabase
      .from('farms')
      .delete()
      .eq('id', String(farmId));

    if (error) throw error;
    return { success: true };
  },

  // ============================================================================
  // 3. ESPÈCES ET CATÉGORIES
  // ============================================================================

  async getSpecies(farmId) {
    const supabase = this.getClient();
    if (!supabase) return [];

    const fId = String(farmId);
    const { data: allSpecies, error: spErr } = await supabase
      .from('species')
      .select('*')
      .order('name');
    if (spErr) throw spErr;

    const { data: farmSpecies, error: fsErr } = await supabase
      .from('farm_species')
      .select('species_id, is_active')
      .eq('farm_id', fId);
    if (fsErr) throw fsErr;

    const activeMap = {};
    (farmSpecies || []).forEach(fs => {
      activeMap[fs.species_id] = fs.is_active;
    });

    // Calculer le total d'animaux vivants par espèce
    const { data: animals } = await supabase
      .from('animals')
      .select('species_id, current_quantity')
      .eq('farm_id', fId)
      .eq('status', 'vivant');

    const countsMap = {};
    (animals || []).forEach(a => {
      countsMap[a.species_id] = (countsMap[a.species_id] || 0) + (a.current_quantity || 1);
    });

    return (allSpecies || []).map(s => ({
      ...s,
      is_active: activeMap[s.id] !== undefined ? activeMap[s.id] : (s.id === 'poules' || s.id === 'canards'),
      count: countsMap[s.id] || 0
    }));
  },

  async toggleSpecies(farmId, speciesId, isActive) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase
      .from('farm_species')
      .upsert({
        farm_id: String(farmId),
        species_id: String(speciesId),
        is_active: Boolean(isActive)
      }, { onConflict: 'farm_id, species_id' })
      .select();

    if (error) throw error;
    return data;
  },

  // ============================================================================
  // 4. BÂTIMENTS & INSTALLATIONS (LOTS)
  // ============================================================================

  async getLots(farmId) {
    const supabase = this.getClient();
    if (!supabase) return [];

    const fId = String(farmId);
    const { data: lots, error } = await supabase
      .from('lots')
      .select('*')
      .eq('farm_id', fId)
      .order('name');
    if (error) throw error;

    // Récupérer les animaux pour calculer l'effectif actuel par bâtiment
    const { data: animals } = await supabase
      .from('animals')
      .select('id, lot_id, current_quantity, species_id, name, code, status')
      .eq('farm_id', fId)
      .eq('status', 'vivant');

    return (lots || []).map(lot => {
      const hostedAnimals = (animals || []).filter(a => String(a.lot_id) === String(lot.id));
      const currentCount = hostedAnimals.reduce((acc, a) => acc + (a.current_quantity || 0), 0);
      const cap = Number(lot.capacity) || 0;
      const rate = cap > 0 ? Math.round((currentCount / cap) * 100) : 0;

      return {
        ...lot,
        current_count: currentCount,
        occupancy_rate: rate,
        hosted_animals: hostedAnimals
      };
    });
  },

  async createLot(farmId, lotData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const payload = {
      farm_id: String(farmId),
      name: lotData.name,
      building_type: lotData.building_type || 'autre',
      location: lotData.location || '',
      capacity: parseInt(lotData.capacity, 10) || 0,
      species_id: lotData.species_id || null,
      allowed_species: Array.isArray(lotData.allowed_species) ? lotData.allowed_species : [],
      status: lotData.status || 'actif',
      notes: lotData.notes || ''
    };

    const { data, error } = await supabase
      .from('lots')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateLot(farmId, lotId, lotData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase
      .from('lots')
      .update({
        ...lotData,
        updated_at: new Date().toISOString()
      })
      .eq('id', String(lotId))
      .eq('farm_id', String(farmId))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteLot(farmId, lotId) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    // Vérifier si des animaux sont hébergés
    const { data: animals } = await supabase
      .from('animals')
      .select('id')
      .eq('farm_id', String(farmId))
      .eq('lot_id', String(lotId))
      .eq('status', 'vivant')
      .limit(1);

    if (animals && animals.length > 0) {
      throw new Error('Impossible de supprimer ce bâtiment : il héberge actuellement des animaux vivants. Transférez-les d\'abord.');
    }

    const { error } = await supabase
      .from('lots')
      .delete()
      .eq('id', String(lotId))
      .eq('farm_id', String(farmId));

    if (error) throw error;
    return { success: true };
  },

  // ============================================================================
  // 5. CHEPTEL ET ANIMAUX (ANIMALS & MOVEMENTS)
  // ============================================================================

  async getAnimals(farmId, filters = {}) {
    const supabase = this.getClient();
    if (!supabase) return [];

    let query = supabase
      .from('animals')
      .select('*, lots(name, location)')
      .eq('farm_id', String(farmId));

    if (filters.species_id && filters.species_id !== 'toutes') {
      query = query.eq('species_id', filters.species_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    } else {
      query = query.eq('status', 'vivant');
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createAnimal(farmId, animalData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const fId = String(farmId);
    const qty = parseInt(animalData.initial_quantity || animalData.current_quantity, 10) || 1;

    const payload = {
      farm_id: fId,
      code: animalData.code || `ANI-${Date.now().toString().slice(-6)}`,
      name: animalData.name || '',
      species_id: animalData.species_id,
      category_id: animalData.category_id || null,
      breed: animalData.breed || '',
      sex: animalData.sex || 'MIXTE',
      birth_date: animalData.birth_date || null,
      maturity_date: animalData.maturity_date || null,
      purchase_date: animalData.purchase_date || null,
      purchase_price: parseFloat(animalData.purchase_price) || 0,
      initial_quantity: qty,
      current_quantity: qty,
      current_weight: parseFloat(animalData.current_weight) || null,
      status: animalData.status || 'vivant',
      lot_id: animalData.lot_id ? String(animalData.lot_id) : null,
      notes: animalData.notes || ''
    };

    const { data, error } = await supabase
      .from('animals')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Enregistrer le mouvement initial d'entrée
    await supabase.from('movements').insert([{
      farm_id: fId,
      animal_id: data.id,
      lot_id: data.lot_id,
      type: animalData.purchase_date ? 'achat' : 'naissance',
      quantity: qty,
      date: animalData.purchase_date || animalData.birth_date || new Date().toISOString().split('T')[0],
      price: payload.purchase_price,
      reason: 'Enregistrement initial du cheptel',
      notes: payload.notes
    }]);

    return data;
  },

  async updateAnimal(farmId, animalId, updateData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase
      .from('animals')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', String(animalId))
      .eq('farm_id', String(farmId))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteAnimal(farmId, animalId) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { error } = await supabase
      .from('animals')
      .delete()
      .eq('id', String(animalId))
      .eq('farm_id', String(farmId));

    if (error) throw error;
    return { success: true };
  },

  async getMovements(farmId, filters = {}) {
    const supabase = this.getClient();
    if (!supabase) return [];

    let query = supabase
      .from('movements')
      .select('*, animals(code, name, species_id), lots(name)')
      .eq('farm_id', String(farmId));

    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createMovement(farmId, movementData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const fId = String(farmId);
    const qty = parseInt(movementData.quantity, 10) || 1;

    const payload = {
      farm_id: fId,
      animal_id: movementData.animal_id ? String(movementData.animal_id) : null,
      lot_id: movementData.lot_id ? String(movementData.lot_id) : null,
      type: movementData.type,
      quantity: qty,
      date: movementData.date || new Date().toISOString().split('T')[0],
      price: parseFloat(movementData.price) || 0,
      reason: movementData.reason || '',
      from_lot_id: movementData.from_lot_id ? String(movementData.from_lot_id) : null,
      to_lot_id: movementData.to_lot_id ? String(movementData.to_lot_id) : null,
      notes: movementData.notes || ''
    };

    const { data, error } = await supabase
      .from('movements')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Mettre à jour l'effectif actuel de l'animal si concerné
    if (payload.animal_id) {
      const { data: animal } = await supabase
        .from('animals')
        .select('current_quantity, status')
        .eq('id', payload.animal_id)
        .single();

      if (animal) {
        let newQty = animal.current_quantity;
        if (payload.type === 'vente' || payload.type === 'deces' || payload.type === 'abattage') {
          newQty = Math.max(0, newQty - qty);
        } else if (payload.type === 'naissance' || payload.type === 'achat') {
          newQty += qty;
        }

        const newStatus = newQty === 0 ? (payload.type === 'vente' ? 'vendu' : 'decede') : 'vivant';
        await supabase
          .from('animals')
          .update({
            current_quantity: newQty,
            status: newStatus,
            lot_id: payload.to_lot_id || animal.lot_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.animal_id);
      }
    }

    return data;
  },

  // ============================================================================
  // 6. INCUBATION DES ŒUFS (INCUBATIONS)
  // ============================================================================

  async getIncubations(farmId, filters = {}) {
    const supabase = this.getClient();
    if (!supabase) return [];

    let query = supabase
      .from('incubations')
      .select('*')
      .eq('farm_id', String(farmId));

    if (filters.species_id && filters.species_id !== 'toutes') {
      query = query.eq('species_id', filters.species_id);
    }
    if (filters.status && filters.status !== 'toutes') {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query.order('start_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createIncubation(farmId, incData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const fId = String(farmId);
    const duration = parseInt(incData.duration_days, 10) || 21;
    const startDate = incData.start_date || new Date().toISOString().split('T')[0];

    // Calculer date d'éclosion prévue
    const [y, m, d] = startDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + duration));
    const expectedHatch = incData.expected_hatch_date || dt.toISOString().split('T')[0];

    const payload = {
      farm_id: fId,
      code: incData.code || `INC-${Date.now().toString().slice(-6)}`,
      species_id: incData.species_id,
      method: incData.method || 'artificielle',
      incubator_type: incData.incubator_type || '',
      eggs_count: parseInt(incData.eggs_count, 10) || 0,
      start_date: startDate,
      duration_days: duration,
      expected_hatch_date: expectedHatch,
      target_lot_id: incData.target_lot_id ? String(incData.target_lot_id) : null,
      status: 'en_cours',
      candling_notes: incData.candling_notes || '',
      notes: incData.notes || ''
    };

    const { data, error } = await supabase
      .from('incubations')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateIncubation(farmId, id, updateData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase
      .from('incubations')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', String(id))
      .eq('farm_id', String(farmId))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteIncubation(farmId, id) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { error } = await supabase
      .from('incubations')
      .delete()
      .eq('id', String(id))
      .eq('farm_id', String(farmId));

    if (error) throw error;
    return { success: true };
  },

  async validateHatch(farmId, id, hatchData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const hatched = parseInt(hatchData.hatched_count, 10) || 0;
    const live = parseInt(hatchData.live_young_count, 10) || hatched;
    const dead = parseInt(hatchData.dead_young_count, 10) || 0;
    const unhatched = parseInt(hatchData.unhatched_count, 10) || 0;
    const rejected = parseInt(hatchData.rejected_count, 10) || 0;

    const { data: inc } = await supabase
      .from('incubations')
      .select('*')
      .eq('id', String(id))
      .single();

    const totalEggs = (inc && inc.eggs_count) || (hatched + unhatched);
    const hatchRate = totalEggs > 0 ? Math.round((hatched / totalEggs) * 100) : 0;

    const { data, error } = await supabase
      .from('incubations')
      .update({
        status: 'termine',
        hatched_count: hatched,
        live_young_count: live,
        dead_young_count: dead,
        unhatched_count: unhatched,
        rejected_count: rejected,
        hatch_rate: hatchRate,
        actual_hatch_date: hatchData.actual_hatch_date || new Date().toISOString().split('T')[0],
        notes: (inc.notes || '') + (hatchData.notes ? `\n[Éclosion] ${hatchData.notes}` : ''),
        updated_at: new Date().toISOString()
      })
      .eq('id', String(id))
      .select()
      .single();

    if (error) throw error;

    // Si l'utilisateur a demandé d'intégrer les petits vivants au cheptel
    if (hatchData.create_animal_lot && live > 0) {
      const spId = inc.species_id;
      const isChick = spId === 'poules';
      const maturityDays = isChick ? 56 : (spId === 'canards' ? 84 : 60);

      const [y, m, d] = (hatchData.actual_hatch_date || new Date().toISOString().split('T')[0]).split('-').map(Number);
      const dtMat = new Date(Date.UTC(y, m - 1, d + maturityDays));

      await this.createAnimal(farmId, {
        code: `ECLO-${inc.code || id}`,
        name: `Nouveau-nés lot ${inc.code}`,
        species_id: spId,
        category_id: isChick ? 'poules_cat_4' : (spId === 'canards' ? 'canards_cat_3' : null),
        sex: 'MIXTE',
        birth_date: hatchData.actual_hatch_date || new Date().toISOString().split('T')[0],
        maturity_date: dtMat.toISOString().split('T')[0],
        initial_quantity: live,
        current_quantity: live,
        status: 'vivant',
        notes: `Issu de l'éclosion du lot ${inc.code}`
      });
    }

    return data;
  },

  // ============================================================================
  // 7. ALERTES ET RAPPELS (CUSTOM_ALERTS)
  // ============================================================================

  async getCustomAlerts(farmId, filters = {}) {
    const supabase = this.getClient();
    if (!supabase) return [];

    let query = supabase
      .from('custom_alerts')
      .select('*')
      .eq('farm_id', String(farmId));

    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }
    if (filters.is_completed !== undefined) {
      query = query.eq('is_completed', filters.is_completed);
    }

    const { data, error } = await query.order('due_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createCustomAlert(farmId, alertData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const user = await this.getCurrentUser();
    const payload = {
      farm_id: String(farmId),
      user_id: user ? user.id : null,
      title: alertData.title,
      category: alertData.category || 'alimentation',
      scope_type: alertData.scope_type || 'farm',
      scope_id: alertData.scope_id ? String(alertData.scope_id) : null,
      due_date: alertData.due_date || alertData.date,
      due_time: alertData.due_time || alertData.time || null,
      frequency: alertData.frequency || 'once',
      priority: alertData.priority || 'normale',
      feed_type: alertData.feed_type || null,
      activity_type: alertData.activity_type || null,
      notes: alertData.notes || '',
      is_completed: false
    };

    const { data, error } = await supabase
      .from('custom_alerts')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateCustomAlert(farmId, alertId, updateData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase
      .from('custom_alerts')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', String(alertId))
      .eq('farm_id', String(farmId))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteCustomAlert(farmId, alertId) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { error } = await supabase
      .from('custom_alerts')
      .delete()
      .eq('id', String(alertId))
      .eq('farm_id', String(farmId));

    if (error) throw error;
    return { success: true };
  },

  // ============================================================================
  // 8. FINANCES (FINANCIAL_RECORDS)
  // ============================================================================

  async getFinancialRecords(farmId, filters = {}) {
    const supabase = this.getClient();
    if (!supabase) return [];

    let query = supabase
      .from('financial_records')
      .select('*')
      .eq('farm_id', String(farmId));

    if (filters.type && filters.type !== 'all') {
      query = query.eq('type', filters.type);
    }

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createFinancialRecord(farmId, recordData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const payload = {
      farm_id: String(farmId),
      type: recordData.type,
      category: recordData.category,
      amount: parseFloat(recordData.amount) || 0,
      date: recordData.date || new Date().toISOString().split('T')[0],
      description: recordData.description || '',
      payment_method: recordData.payment_method || 'especes',
      related_lot_id: recordData.related_lot_id ? String(recordData.related_lot_id) : null,
      related_animal_id: recordData.related_animal_id ? String(recordData.related_animal_id) : null,
      invoice_number: recordData.invoice_number || null
    };

    const { data, error } = await supabase
      .from('financial_records')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateFinancialRecord(farmId, recordId, updateData) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase
      .from('financial_records')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', String(recordId))
      .eq('farm_id', String(farmId))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteFinancialRecord(farmId, recordId) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase non disponible');

    const { error } = await supabase
      .from('financial_records')
      .delete()
      .eq('id', String(recordId))
      .eq('farm_id', String(farmId));

    if (error) throw error;
    return { success: true };
  },

  // ============================================================================
  // 9. MIGRATION & SYNCHRONISATION EN 1 CLIC (LOCAL -> SUPABASE)
  // ============================================================================

  /**
   * Transfère toutes les données locales du navigateur vers Supabase
   */
  async syncLocalToSupabase(farmId) {
    const supabase = this.getClient();
    if (!supabase) throw new Error('Supabase n\'est pas connecté.');

    const localDbRaw = localStorage.getItem('ferme_animale_local_db_v1');
    if (!localDbRaw) {
      return { count: 0, message: 'Aucune donnée locale à synchroniser.' };
    }

    const localDb = JSON.parse(localDbRaw);
    const fId = String(farmId);
    let insertedCount = 0;

    // 1. Synchroniser l'exploitation
    const localFarm = (localDb.farms || []).find(f => String(f.id) === fId);
    if (localFarm) {
      await supabase.from('farms').upsert({
        id: String(localFarm.id),
        name: localFarm.name,
        owner_name: localFarm.owner_name || '',
        country: localFarm.country || 'Togo',
        locality: localFarm.locality || '',
        farm_type: localFarm.farm_type || 'Élevage mixte',
        currency: localFarm.currency || 'FCFA',
        start_date: localFarm.start_date || '2025-01-01',
        is_active: true
      });
      insertedCount++;
    }

    // 2. Synchroniser les espèces de la ferme
    const localFarmSpecies = (localDb.farm_species || []).filter(fs => String(fs.farm_id) === fId);
    if (localFarmSpecies.length > 0) {
      const rows = localFarmSpecies.map(fs => ({
        farm_id: fId,
        species_id: String(fs.species_id),
        is_active: Boolean(fs.is_active)
      }));
      await supabase.from('farm_species').upsert(rows, { onConflict: 'farm_id, species_id' });
      insertedCount += rows.length;
    }

    // 3. Synchroniser les bâtiments / lots
    const localLots = (localDb.lots || []).filter(l => String(l.farm_id) === fId);
    if (localLots.length > 0) {
      const lotRows = localLots.map(l => ({
        id: String(l.id),
        farm_id: fId,
        name: l.name,
        building_type: l.building_type || 'autre',
        location: l.location || '',
        capacity: parseInt(l.capacity, 10) || 0,
        species_id: l.species_id || null,
        allowed_species: Array.isArray(l.allowed_species) ? l.allowed_species : [],
        status: l.status || 'actif',
        notes: l.notes || ''
      }));
      await supabase.from('lots').upsert(lotRows);
      insertedCount += lotRows.length;
    }

    // 4. Synchroniser les animaux
    const localAnimals = (localDb.animals || []).filter(a => String(a.farm_id) === fId);
    if (localAnimals.length > 0) {
      const animalRows = localAnimals.map(a => ({
        id: String(a.id),
        farm_id: fId,
        code: a.code || `ANI-${a.id}`,
        name: a.name || '',
        species_id: a.species_id,
        category_id: a.category_id || null,
        breed: a.breed || '',
        sex: a.sex || 'MIXTE',
        birth_date: a.birth_date || null,
        maturity_date: a.maturity_date || null,
        purchase_date: a.purchase_date || null,
        purchase_price: parseFloat(a.purchase_price) || 0,
        initial_quantity: parseInt(a.initial_quantity, 10) || 1,
        current_quantity: parseInt(a.current_quantity, 10) || 1,
        current_weight: parseFloat(a.current_weight) || null,
        status: a.status || 'vivant',
        lot_id: a.lot_id ? String(a.lot_id) : null,
        notes: a.notes || ''
      }));
      await supabase.from('animals').upsert(animalRows);
      insertedCount += animalRows.length;
    }

    // 5. Synchroniser les incubations
    const localInc = (localDb.incubations || []).filter(i => String(i.farm_id) === fId);
    if (localInc.length > 0) {
      const incRows = localInc.map(i => ({
        id: String(i.id),
        farm_id: fId,
        code: i.code || `INC-${i.id}`,
        species_id: i.species_id,
        method: i.method || 'artificielle',
        incubator_type: i.incubator_type || '',
        eggs_count: parseInt(i.eggs_count, 10) || 0,
        start_date: i.start_date || new Date().toISOString().split('T')[0],
        duration_days: parseInt(i.duration_days, 10) || 21,
        expected_hatch_date: i.expected_hatch_date,
        target_lot_id: i.target_lot_id ? String(i.target_lot_id) : null,
        status: i.status || 'en_cours',
        hatched_count: parseInt(i.hatched_count, 10) || 0,
        live_young_count: parseInt(i.live_young_count, 10) || 0,
        dead_young_count: parseInt(i.dead_young_count, 10) || 0,
        unhatched_count: parseInt(i.unhatched_count, 10) || 0,
        hatch_rate: parseFloat(i.hatch_rate) || 0,
        actual_hatch_date: i.actual_hatch_date || null,
        candling_notes: i.candling_notes || '',
        notes: i.notes || ''
      }));
      await supabase.from('incubations').upsert(incRows);
      insertedCount += incRows.length;
    }

    // 6. Synchroniser les finances
    const localFin = (localDb.financial_records || []).filter(r => String(r.farm_id) === fId);
    if (localFin.length > 0) {
      const finRows = localFin.map(r => ({
        id: String(r.id),
        farm_id: fId,
        type: r.type,
        category: r.category,
        amount: parseFloat(r.amount) || 0,
        date: r.date || new Date().toISOString().split('T')[0],
        description: r.description || '',
        payment_method: r.payment_method || 'especes',
        related_lot_id: r.related_lot_id ? String(r.related_lot_id) : null
      }));
      await supabase.from('financial_records').upsert(finRows);
      insertedCount += finRows.length;
    }

    // 7. Synchroniser les alertes personnalisées
    const localAlerts = (localDb.custom_alerts || []).filter(a => String(a.farm_id) === fId);
    if (localAlerts.length > 0) {
      const alertRows = localAlerts.map(a => ({
        id: String(a.id),
        farm_id: fId,
        title: a.title,
        category: a.category || 'alimentation',
        scope_type: a.scope_type || 'farm',
        scope_id: a.scope_id ? String(a.scope_id) : null,
        due_date: a.due_date,
        due_time: a.due_time || null,
        frequency: a.frequency || 'once',
        priority: a.priority || 'normale',
        feed_type: a.feed_type || null,
        activity_type: a.activity_type || null,
        notes: a.notes || '',
        is_completed: Boolean(a.is_completed)
      }));
      await supabase.from('custom_alerts').upsert(alertRows);
      insertedCount += alertRows.length;
    }

    return {
      success: true,
      count: insertedCount,
      message: `${insertedCount} enregistrement(s) synchronisé(s) avec succès vers votre base Supabase !`
    };
  }
};

if (typeof window !== 'undefined') {
  window.SupabaseService = SupabaseService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseService;
}
