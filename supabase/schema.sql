-- ==============================================================================
-- AGRO-FERME — SCHÉMA COMPLET SUPABASE (POSTGRESQL & ROW LEVEL SECURITY)
-- ==============================================================================
-- Ce fichier contient l'ensemble des tables, relations, contraintes, index,
-- fonctions triggers et politiques RLS pour sécuriser la plateforme d'élevage.
--
-- Exécutez ce script dans l'Éditeur SQL de votre tableau de bord Supabase :
-- Dashboard Supabase > SQL Editor > New query > Run.
-- ==============================================================================

-- 1. EXTENSIONS REQUISES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. FONCTIONS UTILITAIRES & SÉCURITÉ
-- ==============================================================================

-- Fonction de mise à jour automatique du champ updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper RLS : vérifie si l'utilisateur connecté (auth.uid()) est membre d'une ferme donnée
CREATE OR REPLACE FUNCTION public.is_farm_member(target_farm_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_farms
    WHERE user_id = auth.uid() AND farm_id = target_farm_id
  ) OR EXISTS (
    SELECT 1 FROM public.farms
    WHERE id = target_farm_id AND owner_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 3. TABLES DU SYSTÈME & PROFILS
-- ==============================================================================

-- Table des profils utilisateurs reliée à auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'fermier',
  preferences JSONB DEFAULT '{"theme": "light", "notifications_enabled": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger pour créer automatiquement le profil lors de l'inscription auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'fermier')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 4. EXPLOITATIONS AGRICOLES (FARMS & USER_FARMS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.farms (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  owner_name TEXT,
  country TEXT DEFAULT 'Togo',
  locality TEXT,
  farm_type TEXT DEFAULT 'Élevage fermier',
  currency TEXT DEFAULT 'FCFA',
  start_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_farms_updated_at BEFORE UPDATE ON public.farms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table d'association multi-utilisateurs / multi-fermes (gestion des accès et rôles)
CREATE TABLE IF NOT EXISTS public.user_farms (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'proprietaire',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, farm_id)
);

-- ==============================================================================
-- 5. ESPÈCES ANIMALES ET CATÉGORIES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  categories JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.farm_species (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL REFERENCES public.species(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(farm_id, species_id)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  farm_id TEXT REFERENCES public.farms(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL REFERENCES public.species(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_gender TEXT DEFAULT 'MIXTE',
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 6. BÂTIMENTS, INSTALLATIONS & ENTRETIEN (LOTS & BUILDING_MAINTENANCE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.lots (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  species_id TEXT REFERENCES public.species(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  building_type TEXT DEFAULT 'autre',
  location TEXT,
  capacity INTEGER DEFAULT 0,
  allowed_species TEXT[] DEFAULT '{}'::text[],
  status TEXT DEFAULT 'actif',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_lots_updated_at BEFORE UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.building_maintenance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  building_id TEXT REFERENCES public.lots(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_date DATE,
  cost NUMERIC(12,2) DEFAULT 0,
  is_completed BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. CHEPTEL ET LOTS D'ANIMAUX (ANIMALS, MOVEMENTS, CLASSIFICATIONS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.animals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT,
  species_id TEXT NOT NULL REFERENCES public.species(id) ON DELETE RESTRICT,
  category_id TEXT,
  breed TEXT,
  sex TEXT DEFAULT 'MIXTE',
  birth_date DATE,
  maturity_date DATE,
  purchase_date DATE,
  purchase_price NUMERIC(12,2) DEFAULT 0,
  initial_quantity INTEGER NOT NULL DEFAULT 1,
  current_quantity INTEGER NOT NULL DEFAULT 1,
  current_weight NUMERIC(8,2),
  status TEXT DEFAULT 'vivant',
  lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_animals_updated_at BEFORE UPDATE ON public.animals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.movements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  animal_id TEXT REFERENCES public.animals(id) ON DELETE SET NULL,
  lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  price NUMERIC(12,2) DEFAULT 0,
  reason TEXT,
  from_lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  to_lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.duckling_classifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  lot_id TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_ducklings INTEGER DEFAULT 0,
  males_count INTEGER DEFAULT 0,
  females_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chick_classifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  lot_id TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_chicks INTEGER DEFAULT 0,
  males_count INTEGER DEFAULT 0,
  females_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. INCUBATION DES ŒUFS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.incubations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  species_id TEXT NOT NULL REFERENCES public.species(id) ON DELETE RESTRICT,
  method TEXT DEFAULT 'artificielle',
  incubator_type TEXT,
  eggs_count INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 21,
  expected_hatch_date DATE NOT NULL,
  target_lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'en_cours',
  hatched_count INTEGER DEFAULT 0,
  live_young_count INTEGER DEFAULT 0,
  dead_young_count INTEGER DEFAULT 0,
  unhatched_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  hatch_rate NUMERIC(5,2) DEFAULT 0,
  actual_hatch_date DATE,
  candling_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_incubations_updated_at BEFORE UPDATE ON public.incubations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 9. ALERTES ET RAPPELS DE LA FERME
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.custom_alerts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  scope_type TEXT DEFAULT 'farm',
  scope_id TEXT,
  due_date DATE NOT NULL,
  due_time TEXT,
  frequency TEXT DEFAULT 'once',
  priority TEXT DEFAULT 'normale',
  feed_type TEXT,
  activity_type TEXT,
  notes TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_custom_alerts_updated_at BEFORE UPDATE ON public.custom_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 10. REVENUS, DÉPENSES & TRANSACTIONS FINANCIÈRES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.financial_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'recette' ou 'depense'
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  payment_method TEXT DEFAULT 'especes',
  related_lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  related_animal_id TEXT REFERENCES public.animals(id) ON DELETE SET NULL,
  invoice_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_financial_records_updated_at BEFORE UPDATE ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.commercial_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  client_or_supplier TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'paye',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 11. AUTRES MODULES : REPRODUCTION, PONTE, SANTÉ, ALIMENTS & CONTACTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reproductions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL REFERENCES public.species(id) ON DELETE RESTRICT,
  type TEXT DEFAULT 'naturelle',
  mating_date DATE NOT NULL,
  female_id TEXT,
  male_id TEXT,
  target_lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  expected_birth_date DATE,
  actual_birth_date DATE,
  births_count INTEGER DEFAULT 0,
  alive_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'en_gestation',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.egg_collections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  species_id TEXT NOT NULL REFERENCES public.species(id) ON DELETE RESTRICT,
  lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  total_eggs INTEGER NOT NULL DEFAULT 0,
  good_eggs INTEGER NOT NULL DEFAULT 0,
  broken_eggs INTEGER NOT NULL DEFAULT 0,
  destination TEXT DEFAULT 'vente',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.health_treatments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL,
  species_id TEXT REFERENCES public.species(id) ON DELETE SET NULL,
  lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  animal_id TEXT REFERENCES public.animals(id) ON DELETE SET NULL,
  disease_or_reason TEXT,
  treatment_name TEXT NOT NULL,
  dosage TEXT,
  veterinarian TEXT,
  cost NUMERIC(12,2) DEFAULT 0,
  next_care_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.feeds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'autre',
  species_id TEXT REFERENCES public.species(id) ON DELETE SET NULL,
  target_category TEXT,
  unit TEXT DEFAULT 'kg',
  stock_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_threshold NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) DEFAULT 0,
  supplier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.feed_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  feed_id TEXT NOT NULL REFERENCES public.feeds(id) ON DELETE CASCADE,
  lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  farm_id TEXT NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'autre', -- 'client', 'fournisseur', 'veterinaire'
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 12. INDEX POUR LES PERFORMANCES DES REQUÊTES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_user_farms_user ON public.user_farms(user_id);
CREATE INDEX IF NOT EXISTS idx_user_farms_farm ON public.user_farms(farm_id);
CREATE INDEX IF NOT EXISTS idx_farms_owner ON public.farms(owner_id);

CREATE INDEX IF NOT EXISTS idx_animals_farm ON public.animals(farm_id);
CREATE INDEX IF NOT EXISTS idx_animals_species ON public.animals(species_id);
CREATE INDEX IF NOT EXISTS idx_animals_status ON public.animals(status);
CREATE INDEX IF NOT EXISTS idx_animals_lot ON public.animals(lot_id);

CREATE INDEX IF NOT EXISTS idx_lots_farm ON public.lots(farm_id);
CREATE INDEX IF NOT EXISTS idx_movements_farm ON public.movements(farm_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON public.movements(date);

CREATE INDEX IF NOT EXISTS idx_incubations_farm ON public.incubations(farm_id);
CREATE INDEX IF NOT EXISTS idx_incubations_status ON public.incubations(status);

CREATE INDEX IF NOT EXISTS idx_alerts_farm ON public.custom_alerts(farm_id);
CREATE INDEX IF NOT EXISTS idx_alerts_due ON public.custom_alerts(due_date);

CREATE INDEX IF NOT EXISTS idx_fin_farm ON public.financial_records(farm_id);
CREATE INDEX IF NOT EXISTS idx_fin_date ON public.financial_records(date);
CREATE INDEX IF NOT EXISTS idx_fin_type ON public.financial_records(type);

-- ==============================================================================
-- 13. SÉCURITÉ : ROW LEVEL SECURITY (RLS) SUR TOUTES LES TABLES
-- ==============================================================================

-- Activation RLS systématique
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_species ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duckling_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chick_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incubations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reproductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.egg_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- POLITIQUES RLS : PROFILES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- POLITIQUES RLS : FARMS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "farms_select_members" ON public.farms;
CREATE POLICY "farms_select_members" ON public.farms
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_farms WHERE user_id = auth.uid() AND farm_id = farms.id)
  );

DROP POLICY IF EXISTS "farms_insert_owner" ON public.farms;
CREATE POLICY "farms_insert_owner" ON public.farms
  FOR INSERT WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

DROP POLICY IF EXISTS "farms_update_members" ON public.farms;
CREATE POLICY "farms_update_members" ON public.farms
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_farms WHERE user_id = auth.uid() AND farm_id = farms.id AND role IN ('proprietaire', 'gerant'))
  );

DROP POLICY IF EXISTS "farms_delete_owner" ON public.farms;
CREATE POLICY "farms_delete_owner" ON public.farms
  FOR DELETE USING (owner_id = auth.uid());

-- ------------------------------------------------------------------------------
-- POLITIQUES RLS : USER_FARMS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_farms_select" ON public.user_farms;
CREATE POLICY "user_farms_select" ON public.user_farms
  FOR SELECT USING (user_id = auth.uid() OR public.is_farm_member(farm_id));

DROP POLICY IF EXISTS "user_farms_insert" ON public.user_farms;
CREATE POLICY "user_farms_insert" ON public.user_farms
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_farm_member(farm_id));

DROP POLICY IF EXISTS "user_farms_delete" ON public.user_farms;
CREATE POLICY "user_farms_delete" ON public.user_farms
  FOR DELETE USING (user_id = auth.uid() OR public.is_farm_member(farm_id));

-- ------------------------------------------------------------------------------
-- POLITIQUES RLS : SPECIES & CATEGORIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "species_select_all" ON public.species;
CREATE POLICY "species_select_all" ON public.species
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "species_insert_auth" ON public.species;
CREATE POLICY "species_insert_auth" ON public.species
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "farm_species_all" ON public.farm_species;
CREATE POLICY "farm_species_all" ON public.farm_species
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

DROP POLICY IF EXISTS "categories_all" ON public.categories;
CREATE POLICY "categories_all" ON public.categories
  FOR ALL USING (farm_id IS NULL OR public.is_farm_member(farm_id)) WITH CHECK (farm_id IS NULL OR public.is_farm_member(farm_id));

-- ------------------------------------------------------------------------------
-- POLITIQUES RLS GÉNÉRIQUES PAR FERME (ISOLATION RIGOUREUSE MULTI-TENANT)
-- ------------------------------------------------------------------------------

-- LOTS (Bâtiments)
DROP POLICY IF EXISTS "lots_isolation" ON public.lots;
CREATE POLICY "lots_isolation" ON public.lots
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- ENTRETIEN BÂTIMENTS
DROP POLICY IF EXISTS "building_maintenance_isolation" ON public.building_maintenance;
CREATE POLICY "building_maintenance_isolation" ON public.building_maintenance
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- ANIMAUX (Cheptel)
DROP POLICY IF EXISTS "animals_isolation" ON public.animals;
CREATE POLICY "animals_isolation" ON public.animals
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- MOUVEMENTS
DROP POLICY IF EXISTS "movements_isolation" ON public.movements;
CREATE POLICY "movements_isolation" ON public.movements
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- CLASSIFICATIONS CANETONS & POUSSINS
DROP POLICY IF EXISTS "duckling_classifications_isolation" ON public.duckling_classifications;
CREATE POLICY "duckling_classifications_isolation" ON public.duckling_classifications
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

DROP POLICY IF EXISTS "chick_classifications_isolation" ON public.chick_classifications;
CREATE POLICY "chick_classifications_isolation" ON public.chick_classifications
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- INCUBATION
DROP POLICY IF EXISTS "incubations_isolation" ON public.incubations;
CREATE POLICY "incubations_isolation" ON public.incubations
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- ALERTES PERSONNALISÉES
DROP POLICY IF EXISTS "custom_alerts_isolation" ON public.custom_alerts;
CREATE POLICY "custom_alerts_isolation" ON public.custom_alerts
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- FINANCES
DROP POLICY IF EXISTS "financial_records_isolation" ON public.financial_records;
CREATE POLICY "financial_records_isolation" ON public.financial_records
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

DROP POLICY IF EXISTS "commercial_transactions_isolation" ON public.commercial_transactions;
CREATE POLICY "commercial_transactions_isolation" ON public.commercial_transactions
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- REPRODUCTION
DROP POLICY IF EXISTS "reproductions_isolation" ON public.reproductions;
CREATE POLICY "reproductions_isolation" ON public.reproductions
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- PONTE D'ŒUFS
DROP POLICY IF EXISTS "egg_collections_isolation" ON public.egg_collections;
CREATE POLICY "egg_collections_isolation" ON public.egg_collections
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- SANTÉ
DROP POLICY IF EXISTS "health_treatments_isolation" ON public.health_treatments;
CREATE POLICY "health_treatments_isolation" ON public.health_treatments
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- ALIMENTS
DROP POLICY IF EXISTS "feeds_isolation" ON public.feeds;
CREATE POLICY "feeds_isolation" ON public.feeds
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

DROP POLICY IF EXISTS "feed_logs_isolation" ON public.feed_logs;
CREATE POLICY "feed_logs_isolation" ON public.feed_logs
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- CONTACTS
DROP POLICY IF EXISTS "contacts_isolation" ON public.contacts;
CREATE POLICY "contacts_isolation" ON public.contacts
  FOR ALL USING (public.is_farm_member(farm_id)) WITH CHECK (public.is_farm_member(farm_id));

-- ==============================================================================
-- 14. DONNÉES SYSTÈME DE RÉFÉRENCE (ESPÈCES DE BASE)
-- ==============================================================================

INSERT INTO public.species (id, name, icon, description, categories, is_system)
VALUES
  ('poules', 'Poules et coqs', '🐔', 'Élevage avicole pour la ponte d''œufs de consommation et la production de viande.', '[{"name":"Poules","gender":"FEMELLE"},{"name":"Coqs","gender":"MALE"},{"name":"Poulettes","gender":"FEMELLE"},{"name":"Poussins","gender":"MIXTE"}]'::jsonb, TRUE),
  ('canards', 'Canards', '🦆', 'Canards de chair (Barbarie, Pékin) ou ponte avec espace aquatique.', '[{"name":"Canes","gender":"FEMELLE"},{"name":"Canards mâles","gender":"MALE"},{"name":"Canetons","gender":"MIXTE"}]'::jsonb, TRUE),
  ('chevres', 'Chèvres et boucs', '🐐', 'Élevage caprin laitier ou boucher rustique.', '[{"name":"Chèvres","gender":"FEMELLE"},{"name":"Boucs","gender":"MALE"},{"name":"Chevreaux","gender":"MIXTE"}]'::jsonb, TRUE),
  ('moutons', 'Moutons et brebis', '🐑', 'Élevage ovin pour la viande, la laine et le lait.', '[{"name":"Brebis","gender":"FEMELLE"},{"name":"Béliers","gender":"MALE"},{"name":"Agneaux","gender":"MIXTE"}]'::jsonb, TRUE),
  ('bovins', 'Bovins', '🐄', 'Élevage bovin laitier ou allaitant.', '[{"name":"Vaches","gender":"FEMELLE"},{"name":"Taureaux","gender":"MALE"},{"name":"Génisses","gender":"FEMELLE"},{"name":"Veaux","gender":"MIXTE"}]'::jsonb, TRUE),
  ('porcs', 'Porcs', '🐖', 'Élevage porcin naisseur-engraisseur.', '[{"name":"Truies","gender":"FEMELLE"},{"name":"Verrats","gender":"MALE"},{"name":"Porcelets","gender":"MIXTE"},{"name":"Porcs charcutiers","gender":"MIXTE"}]'::jsonb, TRUE),
  ('lapins', 'Lapins', '🐇', 'Cuniculture pour la chair ou la reproduction.', '[{"name":"Lapines","gender":"FEMELLE"},{"name":"Mâles","gender":"MALE"},{"name":"Lapereaux","gender":"MIXTE"}]'::jsonb, TRUE),
  ('dindes', 'Dindes et dindons', '🦃', 'Élevage de dindes fermières.', '[{"name":"Dindes","gender":"FEMELLE"},{"name":"Dindons","gender":"MALE"},{"name":"Dindonneaux","gender":"MIXTE"}]'::jsonb, TRUE),
  ('pintades', 'Pintades', '🪶', 'Élevage de pintades fermières.', '[{"name":"Femelles","gender":"FEMELLE"},{"name":"Mâles","gender":"MALE"},{"name":"Pintadeaux","gender":"MIXTE"}]'::jsonb, TRUE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    description = EXCLUDED.description,
    categories = EXCLUDED.categories,
    is_system = TRUE;
