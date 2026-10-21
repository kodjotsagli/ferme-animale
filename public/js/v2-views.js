// ==========================================================================
// AGRO-FERME V2 — MODULES AVANCÉS DE GESTION AGRICOLE
// Reproduction, Œufs/Incubation, Santé, Alimentation, Bâtiments, Commercial, Finances & Alertes
// ==========================================================================

// Utilitaires de sécurisation DOM (Protection contre les erreurs null.textContent / null.innerHTML)
if (typeof safeSetText !== 'function') {
  function safeSetText(idOrElem, text) {
    if (!idOrElem) return null;
    const el = typeof idOrElem === 'string' ? document.getElementById(idOrElem) : idOrElem;
    if (el) {
      el.textContent = (text !== undefined && text !== null) ? text : '';
      return el;
    }
    return null;
  }
  window.safeSetText = safeSetText;
}

if (typeof safeSetHtml !== 'function') {
  function safeSetHtml(idOrElem, html) {
    if (!idOrElem) return null;
    const el = typeof idOrElem === 'string' ? document.getElementById(idOrElem) : idOrElem;
    if (el) {
      el.innerHTML = (html !== undefined && html !== null) ? html : '';
      return el;
    }
    return null;
  }
  window.safeSetHtml = safeSetHtml;
}

// --------------------------------------------------------------------------
// 0. CENTRE DE NOTIFICATIONS & ALERTES (HEADER BELL + MODALE + VUE DÉDIÉE)
// --------------------------------------------------------------------------

function formatDateFR(dateStr) {
  if (!dateStr) return '—';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return dateStr;
}
window.formatDateFR = formatDateFR;

function formatDateLongFR(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(d.getTime())) {
        const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        const day = d.getDate();
        const dayStr = day === 1 ? '1er' : `${day}`;
        return `${dayStr} ${months[d.getMonth()]} ${d.getFullYear()}`;
      }
    }
  } catch (e) {}
  return formatDateFR(dateStr);
}
window.formatDateLongFR = formatDateLongFR;

async function checkNotificationsBadge() {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  try {
    const data = await API.getNotifications(farmId);
    const headerBadge = document.getElementById('header-alert-badge');
    const sidebarBadge = document.getElementById('sidebar-alert-badge');
    const total = data.total_notifications || 0;

    [headerBadge, sidebarBadge].forEach(badge => {
      if (!badge) return;
      if (total > 0) {
        badge.textContent = total;
        badge.style.display = 'inline-block';
        badge.className = 'badge badge-red';
      } else {
        badge.style.display = 'none';
      }
    });
  } catch (err) {
    console.error('Erreur vérification alertes:', err);
  }
}
window.checkNotificationsBadge = checkNotificationsBadge;

function renderAlertNotificationCard(n, isModal = false) {
  const isGrowth = n.type === 'duckling_maturity' || n.type === 'chick_maturity' || n.alert_category === 'growth_classification';
  const farmName = n.farm_name || n.data?.farm_name || (State.currentFarm ? State.currentFarm.name : 'Exploitation');

  if (isGrowth) {
    const isChick = n.species_id === 'poules' || n.data?.species_id === 'poules';
    const speciesName = n.species_name || (isChick ? 'Poules' : 'Canards');
    const animalLabel = isChick ? 'poussin(s)' : 'caneton(s)';
    const icon = isChick ? '🐥' : '🦆';
    const lotName = n.lot_name || n.data?.lot_name || 'Lot';
    const birthDate = n.birth_date || n.data?.birth_date || '';
    const maturityDate = n.maturity_date || n.data?.maturity_date || '';
    const ageWeeks = n.age_weeks !== undefined ? n.age_weeks : (n.data?.age_weeks || 0);
    const ageDays = n.age_days !== undefined ? n.age_days : (n.data?.age_days || 0);
    const ageRemDays = n.age_rem_days !== undefined ? n.age_rem_days : (n.data?.age_rem_days || 0);
    const qty = n.current_quantity !== undefined ? n.current_quantity : (n.data?.current_quantity !== undefined ? n.data.current_quantity : 0);
    const st = n.subtype || n.alert_status || n.status || 'croissance';
    const animalId = n.animal_id || n.data?.animal_id;

    let badgeClass = 'badge-status-upcoming';
    let statusLabel = "À venir";
    let statusBadgeIcon = '⏳';
    let cardStatusClass = 'alert-status-a_venir';

    if (st === 'en_retard') {
      badgeClass = 'badge-status-retard';
      statusLabel = 'En retard';
      statusBadgeIcon = '🚨';
      cardStatusClass = 'alert-status-en_retard';
    } else if (st === 'aujourdhui') {
      badgeClass = 'badge-status-today';
      statusLabel = "À traiter aujourd'hui";
      statusBadgeIcon = '⏰';
      cardStatusClass = 'alert-status-aujourdhui';
    } else if (st === 'traite') {
      badgeClass = 'badge-status-done';
      statusLabel = 'Traitée';
      statusBadgeIcon = '✅';
      cardStatusClass = 'alert-status-traite';
    }

    const closeCall = isModal ? `closeModal('modal-notifications'); ` : '';
    const actionBtn = (qty > 0 && st !== 'traite')
      ? `<button class="btn btn-primary btn-sm" onclick="${closeCall}if (window.openDucklingSexingModal) window.openDucklingSexingModal(${animalId});" style="font-weight:700;">
           ⚡ Identifier les mâles et femelles
         </button>`
      : `<span class="badge badge-green" style="font-size:12px; font-weight:700;">✅ Lot classifié et transféré (100%)</span>`;

    return `
      <div class="alert-growth-card ${cardStatusClass}" data-alert-type="growth" data-alert-status="${st}">
        <div class="alert-growth-header">
          <div class="alert-growth-title-box">
            <span class="alert-growth-icon">${icon}</span>
            <div>
              <div class="alert-growth-type">Croissance et classification des animaux</div>
              <h4 class="alert-growth-title">Alerte : Classification des ${isChick ? 'poussins' : 'canetons'}</h4>
            </div>
          </div>
          <div>
            <span class="${badgeClass}">${statusBadgeIcon} ${statusLabel}</span>
          </div>
        </div>

        <div class="alert-growth-body">
          <div class="alert-meta-grid">
            <div class="alert-meta-item">
              <span class="alert-meta-label">🏡 Ferme</span>
              <strong class="alert-meta-val">${escapeHtml(farmName)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">🐾 Espèce animale</span>
              <strong class="alert-meta-val">${escapeHtml(speciesName)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">🏷️ Lot</span>
              <strong class="alert-meta-val">${escapeHtml(lotName)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">📅 Date de naissance</span>
              <strong class="alert-meta-val">${formatDateLongFR(birthDate)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">⏳ Âge actuel</span>
              <strong class="alert-meta-val">${ageWeeks} semaines ${ageRemDays > 0 ? ageRemDays + ' j' : ''} <span style="font-weight:normal; font-size:11.5px; color:#64748b;">(${ageDays} jours)</span></strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">🐣 Reste à classifier</span>
              <strong class="alert-meta-val" style="color:var(--primary-800);">${qty} ${animalLabel} vivants</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">🎯 Date prévue</span>
              <strong class="alert-meta-val">${formatDateLongFR(maturityDate)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">📌 Statut</span>
              <strong class="alert-meta-val">${statusLabel}</strong>
            </div>
          </div>
        </div>

        <div class="alert-growth-footer">
          <span style="font-size:12px; color:var(--gray-500);">
            Règle : échéance automatique à ${isChick ? '8 semaines (56 jours)' : '12 semaines (84 jours)'}
          </span>
          ${actionBtn}
        </div>
      </div>
    `;
  }

  // 2. Activités programmées (entretien des bâtiments, soins vétérinaires, gestations/naissances, incubations/éclosions)
  if (n.alert_category === 'planned_activity' || n.type === 'building_maintenance') {
    const isMaint = n.type === 'building_maintenance';
    const isRepro = n.type === 'reproduction' || n.type === 'birth_due';
    const isIncub = n.type === 'incubation' || n.type === 'hatch_due';
    const isHealth = n.type === 'health' || n.type === 'health_care';

    let icon = '🛠️';
    let targetLabel = 'Bâtiment / Installation';
    let targetVal = n.lot_name || n.data?.lot_name || 'Installation';
    let activityLabel = 'Type d\'activité';
    let activityVal = n.maint_type_label || n.data?.maint_type_label || 'Entretien';

    if (isRepro) {
      icon = '🍼';
      targetLabel = 'Femelle reproductrice';
      targetVal = n.data?.female_name || n.female_name || 'Femelle';
      activityLabel = 'Événement attendu';
      activityVal = 'Mise bas / Gestation à terme';
    } else if (isIncub) {
      icon = '🐣';
      targetLabel = 'Lot d\'incubation';
      targetVal = `${n.data?.code || n.code || 'Incubation'} (${n.data?.eggs_count || n.eggs_count || 0} œufs)`;
      activityLabel = 'Événement attendu';
      activityVal = 'Éclosion des œufs';
    } else if (isHealth) {
      icon = '🩺';
      targetLabel = 'Soin / Traitement';
      targetVal = n.data?.treatment_name || n.treatment_name || 'Soin vétérinaire';
      activityLabel = 'Protocole sanitaire';
      activityVal = 'Rappel ou intervention';
    }

    const st = n.subtype || n.status || 'a_venir';
    let badgeClass = 'badge-status-upcoming';
    let statusLabel = n.status_label || 'Programmé';
    let statusBadgeIcon = '⏳';
    let cardStatusClass = 'alert-status-a_venir';

    if (st === 'en_retard') {
      badgeClass = 'badge-status-retard';
      statusLabel = n.status_label || 'En retard';
      statusBadgeIcon = '🚨';
      cardStatusClass = 'alert-status-en_retard';
    } else if (st === 'aujourdhui') {
      badgeClass = 'badge-status-today';
      statusLabel = n.status_label || "À traiter aujourd'hui";
      statusBadgeIcon = '⏰';
      cardStatusClass = 'alert-status-aujourdhui';
    } else if (st === 'traite') {
      badgeClass = 'badge-status-done';
      statusLabel = n.status_label || 'Traitée';
      statusBadgeIcon = '✅';
      cardStatusClass = 'alert-status-traite';
    }

    let actionBtn = '';
    if (isMaint) {
      actionBtn = (st !== 'traite')
        ? `<button class="btn btn-primary btn-sm" onclick="${closeCall}State.setView('buildings'); if (window.openMaintenanceModal) openMaintenanceModal(${n.data?.lot_id || n.lot_id}, '${escapeHtml(targetVal)}');" style="font-weight:700;">
             🛠️ Enregistrer l'entretien
           </button>`
        : `<span class="badge badge-green" style="font-size:12px; font-weight:700;">✅ Entretien réalisé</span>`;
    } else if (isRepro) {
      actionBtn = (st !== 'traite')
        ? `<button class="btn btn-primary btn-sm" onclick="${closeCall}State.setView('reproduction'); if (window.openConfirmBirthModal) openConfirmBirthModal(${n.data?.repro_id || ''});" style="font-weight:700;">
             🍼 Confirmer la mise bas
           </button>`
        : `<span class="badge badge-green" style="font-size:12px; font-weight:700;">✅ Naissance enregistrée</span>`;
    } else if (isIncub) {
      actionBtn = `<button class="btn btn-primary btn-sm" onclick="${closeCall}State.setView('eggs');" style="font-weight:700;">
             🐣 Suivre l'éclosion
           </button>`;
    } else if (isHealth) {
      actionBtn = `<button class="btn btn-primary btn-sm" onclick="${closeCall}State.setView('health');" style="font-weight:700;">
             🩺 Effectuer le soin
           </button>`;
    }

    const alertTypeLabel = n.alert_type_label || (isMaint ? 'Bâtiments & Entretien programmé' : isRepro ? 'Reproduction & Gestation' : isIncub ? 'Ponte & Incubation' : 'Santé & Vétérinaire');

    return `
      <div class="alert-growth-card ${cardStatusClass}" data-alert-type="${n.type}" data-alert-status="${st}">
        <div class="alert-growth-header">
          <div class="alert-growth-title-box">
            <span class="alert-growth-icon">${icon}</span>
            <div>
              <div class="alert-growth-type">${escapeHtml(alertTypeLabel)}</div>
              <h4 class="alert-growth-title">${escapeHtml(n.title)}</h4>
            </div>
          </div>
          <div>
            <span class="${badgeClass}">${statusBadgeIcon} ${escapeHtml(statusLabel)}</span>
          </div>
        </div>

        <div class="alert-growth-body">
          <div class="alert-meta-grid">
            <div class="alert-meta-item">
              <span class="alert-meta-label">🏡 Ferme</span>
              <strong class="alert-meta-val">${escapeHtml(farmName)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">🎯 ${targetLabel}</span>
              <strong class="alert-meta-val">${escapeHtml(targetVal)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">📋 ${activityLabel}</span>
              <strong class="alert-meta-val">${escapeHtml(activityVal)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">📅 Date programmée</span>
              <strong class="alert-meta-val" style="color:var(--primary-800);">${formatDateLongFR(n.date)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">📌 Statut</span>
              <strong class="alert-meta-val">${escapeHtml(statusLabel)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">💬 Informations</span>
              <strong class="alert-meta-val" style="font-weight:normal; font-size:12.5px;">${escapeHtml(n.message)}</strong>
            </div>
          </div>
        </div>

        <div class="alert-growth-footer">
          <span style="font-size:12px; color:var(--gray-500);">
            Activité programmée — échéance : ${formatDateLongFR(n.date)}
          </span>
          ${actionBtn}
        </div>
      </div>
    `;
  }

  // 3. Alertes et rappels personnalisés (Alimentation, Incubation, Santé, etc.)
  if (n.type === 'custom_alert' || n.alert_category === 'custom_alert') {
    const caId = n.custom_alert_id || n.data?.id || n.id;
    const cat = n.category_type || n.data?.category || 'autre';
    const catIcons = {
      alimentation: '🌾',
      incubation: '🥚',
      sante: '🩺',
      reproduction: '🍼',
      entretien: '🧹',
      commercial: '💰',
      autre: '🔔'
    };
    const icon = catIcons[cat] || '🔔';

    const st = n.subtype || n.status || 'a_venir';
    let badgeClass = 'badge-status-upcoming';
    let statusLabel = n.status_label || 'À venir';
    let statusBadgeIcon = '⏳';
    let cardStatusClass = 'alert-status-a_venir';

    if (st === 'en_retard') {
      badgeClass = 'badge-status-retard';
      statusLabel = n.status_label || 'En retard';
      statusBadgeIcon = '🚨';
      cardStatusClass = 'alert-status-en_retard';
    } else if (st === 'aujourdhui') {
      badgeClass = 'badge-status-today';
      statusLabel = n.status_label || "À traiter aujourd'hui";
      statusBadgeIcon = '⏰';
      cardStatusClass = 'alert-status-aujourdhui';
    } else if (st === 'traite') {
      badgeClass = 'badge-status-done';
      statusLabel = n.status_label || 'Traitée';
      statusBadgeIcon = '✅';
      cardStatusClass = 'alert-status-traite';
    }

    const prio = n.custom_priority || n.data?.priority || 'normale';
    const prioBadges = {
      haute: `<span class="badge badge-red" style="font-size:11px; margin-left:6px;">🔴 Haute</span>`,
      moyenne: `<span class="badge badge-amber" style="font-size:11px; margin-left:6px;">🟠 Moyenne</span>`,
      normale: `<span class="badge badge-green" style="font-size:11px; margin-left:6px;">🟢 Normale</span>`
    };
    const prioBadge = prioBadges[prio] || prioBadges.normale;

    let targetText = 'Toute l\'exploitation';
    if (n.scope_type === 'espece' && n.species_name) {
      targetText = `🐾 Espèce : ${n.species_name}`;
    } else if (n.scope_type === 'batiment' && n.building_name) {
      targetText = `🛖 Bâtiment : ${n.building_name}`;
    } else if (n.scope_type === 'lot' && n.lot_name) {
      targetText = `🏷️ Lot : ${n.lot_name}${n.species_name ? ' (' + n.species_name + ')' : ''}`;
    }

    const freqText = n.frequency_label || (n.frequency === 'quotidien' ? 'Quotidien' : n.frequency === 'hebdomadaire' ? 'Hebdomadaire' : n.frequency === 'mensuel' ? 'Mensuel' : 'Ponctuel (Une fois)');

    let actionBtn = '';
    const closeCall = isModal ? `closeModal('modal-notifications'); ` : '';
    if (st !== 'traite') {
      actionBtn = `
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-outline-success btn-sm" onclick="${closeCall}toggleCustomAlert(${caId});" title="Marquer comme fait / traitée" style="font-weight:700;">
            ✅ Marquer terminée
          </button>
          <button class="btn btn-secondary btn-sm" onclick="${closeCall}openEditCustomAlertModal(${caId});" title="Modifier l'alerte" style="font-weight:700;">
            ✏️ Modifier
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="${closeCall}deleteCustomAlert(${caId});" title="Supprimer définitivement l'alerte" style="padding:4px 8px;">
            🗑️
          </button>
        </div>
      `;
    } else {
      actionBtn = `
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="${closeCall}toggleCustomAlert(${caId});" title="Réactiver ce rappel" style="font-weight:700;">
            🔄 Réactiver l'alerte
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="${closeCall}deleteCustomAlert(${caId});" title="Supprimer définitivement l'alerte" style="padding:4px 8px;">
            🗑️
          </button>
        </div>
      `;
    }

    return `
      <div class="alert-growth-card ${cardStatusClass}" data-alert-type="custom_alert" data-alert-status="${st}">
        <div class="alert-growth-header">
          <div class="alert-growth-title-box">
            <span class="alert-growth-icon">${icon}</span>
            <div>
              <div class="alert-growth-type">${escapeHtml(n.alert_type_label || 'Rappel personnalisé')}</div>
              <h4 class="alert-growth-title">${escapeHtml(n.data?.title || n.title || 'Alerte')}</h4>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="${badgeClass}">${statusBadgeIcon} ${escapeHtml(statusLabel)}</span>
            ${prioBadge}
          </div>
        </div>

        <div class="alert-growth-body">
          <div class="alert-meta-grid">
            <div class="alert-meta-item">
              <span class="alert-meta-label">🏡 Ferme</span>
              <strong class="alert-meta-val">${escapeHtml(farmName)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">🎯 Portée / Cible</span>
              <strong class="alert-meta-val">${escapeHtml(targetText)}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">📂 Catégorie</span>
              <strong class="alert-meta-val">${escapeHtml(n.alert_type_label || 'Personnalisée')}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">📅 Date & Heure</span>
              <strong class="alert-meta-val" style="color:var(--primary-800);">${formatDateLongFR(n.date)}${n.time ? ' à ' + n.time : ''}</strong>
            </div>
            <div class="alert-meta-item">
              <span class="alert-meta-label">🔁 Fréquence</span>
              <strong class="alert-meta-val">${escapeHtml(freqText)}</strong>
            </div>
            ${n.feed_type ? `
            <div class="alert-meta-item">
              <span class="alert-meta-label">🌾 Type d'aliment</span>
              <strong class="alert-meta-val" style="color:#166534;">${escapeHtml(n.feed_type)}</strong>
            </div>` : ''}
            <div class="alert-meta-item">
              <span class="alert-meta-label">📌 Statut</span>
              <strong class="alert-meta-val">${escapeHtml(statusLabel)}</strong>
            </div>
            ${n.notes ? `
            <div class="alert-meta-item" style="grid-column: 1 / -1;">
              <span class="alert-meta-label">💬 Consignes & Observations</span>
              <strong class="alert-meta-val" style="font-weight:normal; font-size:12.5px;">${escapeHtml(n.notes)}</strong>
            </div>` : ''}
          </div>
        </div>

        <div class="alert-growth-footer">
          <span style="font-size:12px; color:var(--gray-500);">
            Rappel ${freqText.toLowerCase()} — Échéance : ${formatDateLongFR(n.date)}${n.time ? ' à ' + n.time : ''}
          </span>
          ${actionBtn}
        </div>
      </div>
    `;
  }

  // Autres alertes génériques (alimentation, bâtiments surpopulation, finances)
  let icon = '🔔';
  let badgeClass = 'badge-amber';
  let actionBtn = '';
  const closeCall = isModal ? `closeModal('modal-notifications'); ` : '';

  if (n.type === 'feed_low' || n.type === 'feed') {
    icon = '🌾';
    badgeClass = 'badge-red';
    actionBtn = `<button class="btn btn-secondary btn-sm" onclick="${closeCall}State.setView('feed'); if (window.openFeedLogModal) openFeedLogModal();">Réapprovisionner</button>`;
  } else if (n.type === 'building_overflow' || n.type === 'building') {
    icon = '🛖';
    badgeClass = 'badge-red';
    actionBtn = `<button class="btn btn-secondary btn-sm" onclick="${closeCall}State.setView('buildings');">Gérer bâtiment</button>`;
  } else if (n.type === 'pending_payment') {
    icon = '💰';
    badgeClass = 'badge-blue';
    actionBtn = `<button class="btn btn-secondary btn-sm" onclick="${closeCall}State.setView('commercial');">Voir transaction</button>`;
  }

  const alertTypeLabel = n.alert_type_label || (n.type === 'feed' ? 'Alimentation & Stocks' : 'Alerte générale');

  return `
    <div class="alert-growth-card" style="border-left:5px solid var(--primary-600);" data-alert-type="${n.type}" data-alert-status="${n.priority || 'warning'}">
      <div class="alert-growth-header">
        <div class="alert-growth-title-box">
          <span class="alert-growth-icon">${icon}</span>
          <div>
            <div class="alert-growth-type">${escapeHtml(alertTypeLabel)}</div>
            <h4 class="alert-growth-title">${escapeHtml(n.title)}</h4>
          </div>
        </div>
        <div>
          <span class="badge ${badgeClass}" style="font-size:11px; font-weight:700;">${n.priority === 'danger' || n.severity === 'high' ? 'URGENT' : 'RAPPEL'}</span>
        </div>
      </div>

      <div class="alert-growth-body">
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
          <div style="font-size:12px; color:var(--gray-500); margin-bottom:4px;">
            🏡 Ferme : <strong style="color:var(--gray-800);">${escapeHtml(farmName)}</strong>
          </div>
          <div style="font-size:13.5px; color:var(--gray-700); line-height:1.45;">
            ${escapeHtml(n.message)}
          </div>
        </div>
      </div>

      <div class="alert-growth-footer">
        <span style="font-size:12px; color:var(--gray-500);">Échéance : ${formatDateLongFR(n.date)}</span>
        ${actionBtn}
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// MODALE NOTIFICATIONS & ALERTES DE LA FERME
// --------------------------------------------------------------------------
let currentModalNotificationsData = null;
let currentModalFilter = 'all';

async function openNotificationsModal(filter = 'all') {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  const farmName = State.currentFarm.name;
  currentModalFilter = filter;

  safeSetText('modal-alerts-farm-subtitle', `📍 ${State.currentFarm.locality || ''}, ${State.currentFarm.country || ''} — ${farmName}`);
  const listContainer = document.getElementById('notifications-list');
  if (listContainer) {
    listContainer.innerHTML = '<p style="text-align:center; padding:16px;">Chargement des alertes en cours...</p>';
  }

  openModal('modal-notifications');

  try {
    const data = await API.getNotifications(farmId);
    currentModalNotificationsData = data;

    const plannedActive = data.notifications.filter(n => (n.alert_category === 'planned_activity' || ['building_maintenance', 'health', 'reproduction', 'incubation'].includes(n.type)) && n.subtype !== 'traite');
    const growthActive = data.notifications.filter(n => ['duckling_maturity', 'chick_maturity'].includes(n.type) && n.subtype !== 'traite');
    const customActive = data.notifications.filter(n => (n.type === 'custom_alert' || n.alert_category === 'custom_alert') && n.subtype !== 'traite');
    const urgentActive = data.notifications.filter(n => ['en_retard', 'aujourdhui'].includes(n.subtype) || (n.priority === 'danger' && n.subtype !== 'traite'));
    const upcomingActive = data.notifications.filter(n => n.subtype === 'a_venir' || (n.priority === 'warning' && n.subtype !== 'traite'));
    const treatedList = data.notifications.filter(n => n.subtype === 'traite' || n.status === 'traite');

    safeSetText('mf-badge-all', data.notifications.length);
    safeSetText('mf-badge-planned', plannedActive.length);
    safeSetText('mf-badge-growth', growthActive.length);
    safeSetText('mf-badge-custom', customActive.length);
    safeSetText('mf-badge-urgent', urgentActive.length);
    safeSetText('mf-badge-upcoming', upcomingActive.length);
    safeSetText('mf-badge-traite', treatedList.length);

    setupModalFilterButtons();
    renderFilteredModalNotifications();

  } catch (err) {
    if (listContainer) {
      listContainer.innerHTML = `<p style="color:var(--danger-600);">Erreur de chargement : ${escapeHtml(err.message)}</p>`;
    }
  }
}
window.openNotificationsModal = openNotificationsModal;

function setupModalFilterButtons() {
  const container = document.getElementById('modal-alert-filter-bar');
  if (!container) return;

  container.querySelectorAll('.alert-filter-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.alert-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentModalFilter = btn.dataset.filter || 'all';
      renderFilteredModalNotifications();
    };
  });
}

function renderFilteredModalNotifications() {
  const listContainer = document.getElementById('notifications-list');
  if (!listContainer || !currentModalNotificationsData) return;

  const all = currentModalNotificationsData.notifications || [];
  let filtered = all;

  if (currentModalFilter === 'planned') {
    filtered = all.filter(n => n.alert_category === 'planned_activity' || ['building_maintenance', 'health', 'reproduction', 'incubation'].includes(n.type));
  } else if (currentModalFilter === 'growth') {
    filtered = all.filter(n => ['duckling_maturity', 'chick_maturity'].includes(n.type));
  } else if (currentModalFilter === 'custom') {
    filtered = all.filter(n => n.type === 'custom_alert' || n.alert_category === 'custom_alert');
  } else if (currentModalFilter === 'urgent') {
    filtered = all.filter(n => (['en_retard', 'aujourdhui'].includes(n.subtype) || n.priority === 'danger') && n.subtype !== 'traite');
  } else if (currentModalFilter === 'upcoming') {
    filtered = all.filter(n => (n.subtype === 'a_venir' || n.priority === 'warning') && n.subtype !== 'traite');
  } else if (currentModalFilter === 'traite') {
    filtered = all.filter(n => n.subtype === 'traite' || n.status === 'traite');
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; padding:35px 20px; color:var(--gray-500); background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1;">
        <div style="font-size:36px; margin-bottom:8px;">✅</div>
        <p style="font-weight:700; color:var(--gray-800); margin:0 0 4px 0;">Aucune alerte dans cette catégorie</p>
        <p style="font-size:13px; margin:0;">Tous les lots et rappels de cette catégorie sont à jour pour cette ferme.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = filtered.map(n => renderAlertNotificationCard(n, true)).join('');
}

// --------------------------------------------------------------------------
// PAGE DÉDIÉE : VUE « ALERTES & RAPPELS DE LA FERME »
// --------------------------------------------------------------------------
let currentViewAlertsFilter = 'all';

async function renderAlertsView() {
  const content = document.getElementById('page-container');
  if (!content) return;
  if (!State.currentFarm) {
    content.innerHTML = `<div class="card card-body"><p>Veuillez sélectionner ou créer une ferme.</p></div>`;
    return;
  }

  const farm = State.currentFarm;
  const farmId = farm.id;

  content.innerHTML = `
    <div class="alerts-page-container">
      <!-- 1. EN-TÊTE DU CENTRE D'ALERTES -->
      <div class="alerts-hero-header">
        <div class="alerts-title-wrap">
          <h2 class="alerts-title-main">
            <span>🔔</span>
            <span>Alertes & Rappels de la Ferme — <strong id="alerts-farm-name">${escapeHtml(farm.name)}</strong></span>
          </h2>
          <p class="alerts-title-sub">Centralisation en temps réel des activités programmées (entretiens des bâtiments, soins vétérinaires, gestations & incubations), alertes de croissance (canetons 12 sem., poussins 8 sem.) et approvisionnements.</p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-primary btn-sm" onclick="openCreateCustomAlertModal();" style="font-weight:700;">🔔 + Nouvelle alerte</button>
          <button class="btn btn-secondary btn-sm" onclick="openCreateChickLotModal();">➕ Poussins (8 sem.)</button>
          <button class="btn btn-secondary btn-sm" onclick="openCreateDucklingLotModal();">➕ Canetons (12 sem.)</button>
          <button class="btn btn-primary btn-sm" onclick="renderAlertsView();">🔄 Actualiser</button>
        </div>
      </div>

      <!-- 2. CARTES STATISTIQUES (KPIs) -->
      <div class="alerts-stats-grid">
        <div class="dash-stat-card" style="border-left:4px solid var(--primary-600);">
          <div class="dash-stat-label">Total alertes actives</div>
          <div class="dash-stat-value" id="kpi-alerts-total" style="color:var(--gray-900);">—</div>
          <div class="dash-stat-sub">Toutes rubriques confondues</div>
        </div>
        <div class="dash-stat-card" style="border-left:4px solid #06b6d4;">
          <div class="dash-stat-label">Alertes personnalisées</div>
          <div class="dash-stat-value" id="kpi-alerts-custom" style="color:#0891b2;">—</div>
          <div class="dash-stat-sub">Alimentation, incubation, rappels sur mesure</div>
        </div>
        <div class="dash-stat-card" style="border-left:4px solid #8b5cf6;">
          <div class="dash-stat-label">Activités programmées</div>
          <div class="dash-stat-value" id="kpi-alerts-planned" style="color:#7c3aed;">—</div>
          <div class="dash-stat-sub">Entretiens, soins, naissances & incubations</div>
        </div>
        <div class="dash-stat-card" style="border-left:4px solid #3b82f6;">
          <div class="dash-stat-label">Croissance & Classification</div>
          <div class="dash-stat-value" id="kpi-alerts-growth" style="color:#2563eb;">—</div>
          <div class="dash-stat-sub">Poussins (56 j) & Canetons (84 j)</div>
        </div>
        <div class="dash-stat-card" style="border-left:4px solid #dc2626;">
          <div class="dash-stat-label">À traiter d'urgence / En retard</div>
          <div class="dash-stat-value" id="kpi-alerts-urgent" style="color:#dc2626;">—</div>
          <div class="dash-stat-sub">Échéances dépassées ou jour J</div>
        </div>
        <div class="dash-stat-card" style="border-left:4px solid #f59e0b;">
          <div class="dash-stat-label">À venir</div>
          <div class="dash-stat-value" id="kpi-alerts-upcoming" style="color:#d97706;">—</div>
          <div class="dash-stat-sub">Prochaines échéances prévues</div>
        </div>
      </div>

      <!-- 3. BARRE DE FILTRES ET RECHERCHE -->
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div class="alert-filter-bar" id="view-alert-filter-bar">
          <button class="alert-filter-btn active" data-vfilter="all">Toutes <span class="badge badge-gray" id="vf-badge-all">0</span></button>
          <button class="alert-filter-btn" data-vfilter="planned">🗓️ Activités programmées <span class="badge badge-purple" id="vf-badge-planned">0</span></button>
          <button class="alert-filter-btn" data-vfilter="growth">🐣 Croissance & Sexage <span class="badge badge-blue" id="vf-badge-growth">0</span></button>
          <button class="alert-filter-btn" data-vfilter="custom">🔔 Personnalisées <span class="badge badge-purple" id="vf-badge-custom">0</span></button>
          <button class="alert-filter-btn" data-vfilter="urgent">⚠️ À traiter & En retard <span class="badge badge-red" id="vf-badge-urgent">0</span></button>
          <button class="alert-filter-btn" data-vfilter="upcoming">⏳ À venir <span class="badge badge-amber" id="vf-badge-upcoming">0</span></button>
          <button class="alert-filter-btn" data-vfilter="traite">✅ Traitées <span class="badge badge-green" id="vf-badge-traite">0</span></button>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="text" id="view-alert-search" class="form-control" placeholder="Rechercher par lot, espèce, bâtiment, aliment, soin..." style="width:250px; font-size:12.5px; padding:6px 12px;">
        </div>
      </div>

      <!-- 4. LISTE DES NOTIFICATIONS / ALERTES -->
      <div id="alerts-view-list" style="display:flex; flex-direction:column; gap:14px;">
        <div style="text-align:center; padding:40px; color:var(--gray-500);">
          <div class="spinner"></div>
          <p style="margin-top:10px;">Chargement des alertes et rappels de la ferme...</p>
        </div>
      </div>
    </div>
  `;

  try {
    const data = await API.getNotifications(farmId);
    const plannedActive = data.notifications.filter(n => (n.alert_category === 'planned_activity' || ['building_maintenance', 'health', 'reproduction', 'incubation'].includes(n.type)) && n.subtype !== 'traite');
    const growthActive = data.notifications.filter(n => ['duckling_maturity', 'chick_maturity'].includes(n.type) && n.subtype !== 'traite');
    const customActive = data.notifications.filter(n => (n.type === 'custom_alert' || n.alert_category === 'custom_alert') && n.subtype !== 'traite');
    const urgentActive = data.notifications.filter(n => ['en_retard', 'aujourdhui'].includes(n.subtype) || (n.priority === 'danger' && n.subtype !== 'traite'));
    const upcomingActive = data.notifications.filter(n => n.subtype === 'a_venir' || (n.priority === 'warning' && n.subtype !== 'traite'));
    const treatedList = data.notifications.filter(n => n.subtype === 'traite' || n.status === 'traite');

    safeSetText('kpi-alerts-total', data.total_notifications);
    safeSetText('kpi-alerts-planned', plannedActive.length);
    safeSetText('kpi-alerts-growth', growthActive.length);
    safeSetText('kpi-alerts-custom', customActive.length);
    safeSetText('kpi-alerts-urgent', urgentActive.length);
    safeSetText('kpi-alerts-upcoming', upcomingActive.length);

    safeSetText('vf-badge-all', data.notifications.length);
    safeSetText('vf-badge-planned', plannedActive.length);
    safeSetText('vf-badge-growth', growthActive.length);
    safeSetText('vf-badge-custom', customActive.length);
    safeSetText('vf-badge-urgent', urgentActive.length);
    safeSetText('vf-badge-upcoming', upcomingActive.length);
    safeSetText('vf-badge-traite', treatedList.length);

    setupViewFilterButtons(data);
    renderFilteredViewNotifications(data);

    const searchInput = document.getElementById('view-alert-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderFilteredViewNotifications(data);
      });
    }

  } catch (err) {
    const listEl = document.getElementById('alerts-view-list');
    if (listEl) {
      listEl.innerHTML = `<p style="color:var(--danger-600); padding:20px;">Erreur : ${escapeHtml(err.message)}</p>`;
    }
  }
}
window.renderAlertsView = renderAlertsView;

function setupViewFilterButtons(data) {
  const container = document.getElementById('view-alert-filter-bar');
  if (!container) return;

  container.querySelectorAll('.alert-filter-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.alert-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentViewAlertsFilter = btn.dataset.vfilter || 'all';
      renderFilteredViewNotifications(data);
    };
  });
}

function renderFilteredViewNotifications(data) {
  const listEl = document.getElementById('alerts-view-list');
  if (!listEl || !data) return;

  const all = data.notifications || [];
  let filtered = all;

  if (currentViewAlertsFilter === 'planned') {
    filtered = all.filter(n => n.alert_category === 'planned_activity' || ['building_maintenance', 'health', 'reproduction', 'incubation'].includes(n.type));
  } else if (currentViewAlertsFilter === 'growth') {
    filtered = all.filter(n => ['duckling_maturity', 'chick_maturity'].includes(n.type));
  } else if (currentViewAlertsFilter === 'custom') {
    filtered = all.filter(n => n.type === 'custom_alert' || n.alert_category === 'custom_alert');
  } else if (currentViewAlertsFilter === 'urgent') {
    filtered = all.filter(n => (['en_retard', 'aujourdhui'].includes(n.subtype) || n.priority === 'danger') && n.subtype !== 'traite');
  } else if (currentViewAlertsFilter === 'upcoming') {
    filtered = all.filter(n => (n.subtype === 'a_venir' || n.priority === 'warning') && n.subtype !== 'traite');
  } else if (currentViewAlertsFilter === 'traite') {
    filtered = all.filter(n => n.subtype === 'traite' || n.status === 'traite');
  }

  const query = (document.getElementById('view-alert-search')?.value || '').toLowerCase().trim();
  if (query) {
    filtered = filtered.filter(n =>
      (n.title && n.title.toLowerCase().includes(query)) ||
      (n.message && n.message.toLowerCase().includes(query)) ||
      (n.lot_name && n.lot_name.toLowerCase().includes(query)) ||
      (n.species_name && n.species_name.toLowerCase().includes(query)) ||
      (n.farm_name && n.farm_name.toLowerCase().includes(query)) ||
      (n.alert_type_label && n.alert_type_label.toLowerCase().includes(query)) ||
      (n.feed_type && n.feed_type.toLowerCase().includes(query)) ||
      (n.notes && n.notes.toLowerCase().includes(query)) ||
      (n.maint_type_label && n.maint_type_label.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:45px 20px; color:var(--gray-500); background:#ffffff; border-radius:12px; border:1px dashed #cbd5e1;">
        <div style="font-size:42px; margin-bottom:10px;">✅</div>
        <h4 style="font-weight:700; color:var(--gray-800); margin:0 0 6px 0;">Aucune alerte correspondante</h4>
        <p style="font-size:13.5px; margin:0;">Tous les lots et rappels de cette sélection sont à jour pour ${escapeHtml(State.currentFarm?.name || 'la ferme')}.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(n => renderAlertNotificationCard(n, false)).join('');
}


// --------------------------------------------------------------------------
// GESTIONNAIRE D'ALERTES ET RAPPELS PERSONNALISÉS
// --------------------------------------------------------------------------

const CUSTOM_ALERT_PRESETS = {
  alimentation: [
    { value: 'distribution_quotidienne', label: 'Distribution quotidienne des aliments' },
    { value: 'distribution_matin', label: 'Distribution du matin' },
    { value: 'distribution_soir', label: 'Distribution du soir' },
    { value: 'renouvellement_stock', label: 'Renouvellement des stocks d\'aliments' },
    { value: 'achat_aliment', label: 'Achat d\'aliments' },
    { value: 'changement_ration', label: 'Changement de ration' },
    { value: 'controle_consommation', label: 'Contrôle de la consommation' },
    { value: 'approvisionnement_eau', label: 'Approvisionnement en eau' },
    { value: 'autre_alimentation', label: 'Autre tâche d\'alimentation' }
  ],
  incubation: [
    { value: 'lancement_incubation', label: 'Lancement d\'incubation / mise en couveuse' },
    { value: 'controle_temp_humidite', label: 'Contrôle température et humidité' },
    { value: 'retournement_oeufs', label: 'Retournement des œufs' },
    { value: 'mirage_j7', label: 'Mirage des œufs (J+7)' },
    { value: 'mirage_j14', label: 'Mirage des œufs (J+14)' },
    { value: 'preparation_eclosion', label: 'Préparation à l\'éclosion' },
    { value: 'eclosion_prevue', label: 'Date d\'éclosion prévue' },
    { value: 'verification_nouveau_nes', label: 'Vérification des nouveau-nés' },
    { value: 'autre_incubation', label: 'Autre tâche d\'incubation' }
  ],
  sante: [
    { value: 'vaccination', label: 'Vaccination préventive' },
    { value: 'vermifuge', label: 'Traitement vermifuge' },
    { value: 'quarantaine', label: 'Contrôle quarantaine / isolement' },
    { value: 'visite_veto', label: 'Visite vétérinaire' },
    { value: 'autre_sante', label: 'Autre soin vétérinaire' }
  ],
  reproduction: [
    { value: 'saillie_insemination', label: 'Saillie / Insémination' },
    { value: 'controle_gestation', label: 'Contrôle de gestation' },
    { value: 'mise_bas', label: 'Mise bas / Naissance attendue' },
    { value: 'sevrage', label: 'Sevrage des petits' },
    { value: 'autre_reproduction', label: 'Autre rappel de reproduction' }
  ],
  entretien: [
    { value: 'nettoyage_desinfection', label: 'Nettoyage et désinfection' },
    { value: 'renouvellement_litiere', label: 'Renouvellement de litière' },
    { value: 'reparation_batiment', label: 'Réparation / Maintenance bâtiment' },
    { value: 'vide_sanitaire', label: 'Mise en vide sanitaire' },
    { value: 'autre_entretien', label: 'Autre tâche d\'entretien' }
  ],
  commercial: [
    { value: 'vente_programmee', label: 'Vente programmée d\'animaux ou produits' },
    { value: 'commande_client', label: 'Préparation commande client' },
    { value: 'livraison', label: 'Livraison client' },
    { value: 'autre_commercial', label: 'Autre tâche commerciale' }
  ],
  autre: [
    { value: 'tache_generale', label: 'Tâche générale de l\'exploitation' },
    { value: 'rappel_administratif', label: 'Rappel administratif / comptable' },
    { value: 'autre', label: 'Autre rappel personnalisé' }
  ]
};

function onCustomAlertCategoryChange(updateTitle = true) {
  const cat = document.getElementById('custom-alert-category')?.value || 'alimentation';
  const presetSelect = document.getElementById('custom-alert-activity-preset');
  const feedGroup = document.getElementById('group-custom-alert-feed');

  if (feedGroup) {
    feedGroup.style.display = (cat === 'alimentation') ? 'block' : 'none';
  }

  if (presetSelect) {
    const presets = CUSTOM_ALERT_PRESETS[cat] || CUSTOM_ALERT_PRESETS.autre;
    presetSelect.innerHTML = '<option value="">-- Choisir une activité type (optionnel) --</option>' +
      presets.map(p => `<option value="${escapeHtml(p.value)}">${escapeHtml(p.label)}</option>`).join('');

    if (updateTitle) {
      const titleInput = document.getElementById('custom-alert-title');
      if (titleInput) {
        titleInput.value = presets[0]?.label || '';
        presetSelect.value = presets[0]?.value || '';
      }
    }
  }
}
window.onCustomAlertCategoryChange = onCustomAlertCategoryChange;

function onCustomAlertPresetChange() {
  const cat = document.getElementById('custom-alert-category')?.value || 'alimentation';
  const presetSelect = document.getElementById('custom-alert-activity-preset');
  const titleInput = document.getElementById('custom-alert-title');
  if (!presetSelect || !titleInput) return;

  const val = presetSelect.value;
  if (!val) return;
  const presets = CUSTOM_ALERT_PRESETS[cat] || [];
  const found = presets.find(p => p.value === val);
  if (found) {
    titleInput.value = found.label;
  }
}
window.onCustomAlertPresetChange = onCustomAlertPresetChange;

function onCustomAlertScopeChange() {
  const scope = document.getElementById('custom-alert-scope-type')?.value || 'ferme';
  const spGroup = document.getElementById('group-custom-alert-species');
  const bldgGroup = document.getElementById('group-custom-alert-building');
  const lotGroup = document.getElementById('group-custom-alert-lot');

  if (spGroup) spGroup.style.display = (scope === 'espece' || scope === 'lot') ? 'block' : 'none';
  if (bldgGroup) bldgGroup.style.display = (scope === 'batiment') ? 'block' : 'none';
  if (lotGroup) lotGroup.style.display = (scope === 'lot') ? 'block' : 'none';
}
window.onCustomAlertScopeChange = onCustomAlertScopeChange;

function onCustomAlertSpeciesChange() {
  const scope = document.getElementById('custom-alert-scope-type')?.value;
  if (scope === 'lot') {
    populateCustomAlertLots();
  }
}
window.onCustomAlertSpeciesChange = onCustomAlertSpeciesChange;

async function populateCustomAlertSelects(selectedSpeciesId = null, selectedBldgId = null, selectedLotId = null) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  try {
    // 1. Espèces
    const spSelect = document.getElementById('custom-alert-species-id');
    if (spSelect) {
      const speciesList = await API.getFarmSpecies(farmId);
      const activeSpecies = (speciesList.species || []).filter(s => s.is_active);
      spSelect.innerHTML = activeSpecies.map(s => `<option value="${escapeHtml(s.species_id || s.id)}">${escapeHtml(s.name)}</option>`).join('');
      if (selectedSpeciesId) spSelect.value = selectedSpeciesId;
    }

    // 2. Bâtiments
    const bldgSelect = document.getElementById('custom-alert-building-id');
    if (bldgSelect) {
      const lotsData = await API.getLots(farmId);
      const bldgs = lotsData.lots || [];
      bldgSelect.innerHTML = '<option value="">-- Sélectionner un bâtiment --</option>' +
        bldgs.map(b => `<option value="${b.id}">${escapeHtml(b.name)} (${b.location || 'Bâtiment'})</option>`).join('');
      if (selectedBldgId) bldgSelect.value = selectedBldgId;
    }

    // 3. Lots d'animaux
    await populateCustomAlertLots(selectedLotId);
  } catch (err) {
    console.warn('Erreur populateCustomAlertSelects:', err);
  }
}

async function populateCustomAlertLots(selectedLotId = null) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  const lotSelect = document.getElementById('custom-alert-lot-id');
  if (!lotSelect) return;

  const spSelect = document.getElementById('custom-alert-species-id');
  const spFilter = spSelect ? spSelect.value : null;

  try {
    const animalsData = await API.getAnimals(farmId);
    let anList = animalsData.animals || [];
    if (spFilter) {
      anList = anList.filter(a => a.species_id === spFilter);
    }
    lotSelect.innerHTML = '<option value="">-- Sélectionner un lot d\'animaux --</option>' +
      anList.map(a => `<option value="${a.id}">${escapeHtml(a.name || a.code)} (${a.current_quantity || 0} vivants)</option>`).join('');
    if (selectedLotId) lotSelect.value = selectedLotId;
  } catch (e) {
    console.warn('Erreur chargement lots d\'animaux:', e);
  }
}

async function openCreateCustomAlertModal(initialCategory = 'alimentation') {
  if (!State.currentFarm) {
    if (window.showToast) showToast('Veuillez d\'abord sélectionner une ferme.', 'danger');
    return;
  }

  const modal = document.getElementById('modal-custom-alert');
  if (!modal) return;

  safeSetText('custom-alert-modal-title', '🔔 Nouvelle Alerte / Rappel');
  const idInput = document.getElementById('custom-alert-id');
  if (idInput) idInput.value = '';

  const catSelect = document.getElementById('custom-alert-category');
  if (catSelect) catSelect.value = initialCategory || 'alimentation';

  const scopeSelect = document.getElementById('custom-alert-scope-type');
  if (scopeSelect) scopeSelect.value = 'ferme';

  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('custom-alert-date');
  if (dateInput) dateInput.value = todayStr;

  const timeInput = document.getElementById('custom-alert-time');
  if (timeInput) timeInput.value = '08:00';

  const freqSelect = document.getElementById('custom-alert-frequency');
  if (freqSelect) freqSelect.value = 'une_fois';

  const prioSelect = document.getElementById('custom-alert-priority');
  if (prioSelect) prioSelect.value = 'normale';

  const feedInput = document.getElementById('custom-alert-feed-type');
  if (feedInput) feedInput.value = '';

  const notesInput = document.getElementById('custom-alert-notes');
  if (notesInput) notesInput.value = '';

  await populateCustomAlertSelects();
  onCustomAlertCategoryChange(true);
  onCustomAlertScopeChange();

  openModal('modal-custom-alert');
}
window.openCreateCustomAlertModal = openCreateCustomAlertModal;

async function openEditCustomAlertModal(alertId) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  try {
    const res = await API.getCustomAlert(farmId, alertId);
    const alert = res.alert;
    if (!alert) throw new Error('Alerte introuvable');

    safeSetText('custom-alert-modal-title', `✏️ Modifier l'alerte — ${alert.title}`);
    const idInput = document.getElementById('custom-alert-id');
    if (idInput) idInput.value = alert.id;

    const catSelect = document.getElementById('custom-alert-category');
    if (catSelect) catSelect.value = alert.category || 'alimentation';

    const scopeSelect = document.getElementById('custom-alert-scope-type');
    if (scopeSelect) scopeSelect.value = alert.scope_type || 'ferme';

    const titleInput = document.getElementById('custom-alert-title');
    if (titleInput) titleInput.value = alert.title || '';

    const dateInput = document.getElementById('custom-alert-date');
    if (dateInput) dateInput.value = alert.date || '';

    const timeInput = document.getElementById('custom-alert-time');
    if (timeInput) timeInput.value = alert.time || '';

    const freqSelect = document.getElementById('custom-alert-frequency');
    if (freqSelect) freqSelect.value = alert.frequency || 'une_fois';

    const prioSelect = document.getElementById('custom-alert-priority');
    if (prioSelect) prioSelect.value = alert.priority || 'normale';

    const feedInput = document.getElementById('custom-alert-feed-type');
    if (feedInput) feedInput.value = alert.feed_type || '';

    const notesInput = document.getElementById('custom-alert-notes');
    if (notesInput) notesInput.value = alert.notes || '';

    await populateCustomAlertSelects(alert.species_id, alert.building_id, alert.lot_id);
    onCustomAlertCategoryChange(false);
    onCustomAlertScopeChange();

    const presetSelect = document.getElementById('custom-alert-activity-preset');
    if (presetSelect && alert.activity_type) {
      presetSelect.value = alert.activity_type;
    }

    openModal('modal-custom-alert');
  } catch (err) {
    if (window.showToast) showToast(`Erreur chargement alerte : ${err.message}`, 'danger');
  }
}
window.openEditCustomAlertModal = openEditCustomAlertModal;

async function toggleCustomAlert(alertId) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  try {
    const res = await API.toggleCustomAlertStatus(farmId, alertId);
    if (window.showToast) showToast(res.message, 'success');
    if (State.currentView === 'alerts') {
      await renderAlertsView();
    }
    if (document.getElementById('modal-notifications')?.classList.contains('active')) {
      await openNotificationsModal(currentModalFilter);
    }
    if (window.updateAlertsBadge) {
      await window.updateAlertsBadge();
    }
  } catch (err) {
    if (window.showToast) showToast(`Erreur : ${err.message}`, 'danger');
  }
}
window.toggleCustomAlert = toggleCustomAlert;

async function deleteCustomAlert(alertId) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  if (!confirm('Êtes-vous certain de vouloir supprimer cette alerte ?')) return;

  try {
    const res = await API.deleteCustomAlert(farmId, alertId);
    if (window.showToast) showToast(res.message, 'success');
    if (State.currentView === 'alerts') {
      await renderAlertsView();
    }
    if (document.getElementById('modal-notifications')?.classList.contains('active')) {
      await openNotificationsModal(currentModalFilter);
    }
    if (window.updateAlertsBadge) {
      await window.updateAlertsBadge();
    }
  } catch (err) {
    if (window.showToast) showToast(`Erreur : ${err.message}`, 'danger');
  }
}
window.deleteCustomAlert = deleteCustomAlert;

// Initialisation de la soumission du formulaire d'alerte personnalisée
document.addEventListener('DOMContentLoaded', () => {
  const customAlertForm = document.getElementById('form-custom-alert');
  if (customAlertForm) {
    customAlertForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!State.currentFarm) return;
      const farmId = State.currentFarm.id;

      const idVal = document.getElementById('custom-alert-id')?.value;
      const title = document.getElementById('custom-alert-title')?.value;
      const category = document.getElementById('custom-alert-category')?.value;
      const activity_type = document.getElementById('custom-alert-activity-preset')?.value || null;
      const scope_type = document.getElementById('custom-alert-scope-type')?.value;
      const species_id = (scope_type === 'espece' || scope_type === 'lot') ? document.getElementById('custom-alert-species-id')?.value : null;
      const building_id = (scope_type === 'batiment') ? document.getElementById('custom-alert-building-id')?.value : null;
      const lot_id = (scope_type === 'lot') ? document.getElementById('custom-alert-lot-id')?.value : null;
      const feed_type = (category === 'alimentation') ? document.getElementById('custom-alert-feed-type')?.value : null;
      const date = document.getElementById('custom-alert-date')?.value;
      const time = document.getElementById('custom-alert-time')?.value || null;
      const frequency = document.getElementById('custom-alert-frequency')?.value;
      const priority = document.getElementById('custom-alert-priority')?.value;
      const notes = document.getElementById('custom-alert-notes')?.value;

      const payload = {
        title,
        category,
        activity_type,
        scope_type,
        species_id,
        building_id,
        lot_id,
        feed_type,
        date,
        time,
        frequency,
        priority,
        notes
      };

      try {
        if (idVal) {
          const res = await API.updateCustomAlert(farmId, idVal, payload);
          if (window.showToast) showToast(res.message, 'success');
        } else {
          const res = await API.createCustomAlert(farmId, payload);
          if (window.showToast) showToast(res.message, 'success');
        }

        closeModal('modal-custom-alert');

        if (State.currentView === 'alerts') {
          await renderAlertsView();
        }
        if (document.getElementById('modal-notifications')?.classList.contains('active')) {
          await openNotificationsModal(currentModalFilter);
        }
        if (window.updateAlertsBadge) {
          await window.updateAlertsBadge();
        }
      } catch (err) {
        if (window.showToast) showToast(`Erreur : ${err.message}`, 'danger');
      }
    });
  }
});

// --------------------------------------------------------------------------
// 1. MODULE REPRODUCTION & GESTATION
// --------------------------------------------------------------------------
async function renderReproductionView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">🐣 Reproduction & Gestation — ${escapeHtml(State.currentFarm.name)}</h2>
        <p class="page-subtitle">Suivi des saillies, inséminations, échographies, gestations et intégration directe des nouveau-nés au cheptel.</p>
      </div>
      <div>
        <button id="btn-new-reproduction" class="btn btn-primary">➕ Nouvelle Saillie / Insémination</button>
      </div>
    </div>

    <!-- STATISTIQUES REPRODUCTION -->
    <div class="kpi-grid" id="repro-kpis">
      <div class="kpi-card" style="border-left: 4px solid var(--accent-500);">
        <div class="kpi-icon-wrapper">🐑</div>
        <div class="kpi-info">
          <div class="kpi-value" id="repro-kpi-active">...</div>
          <div class="kpi-label">Gestations en cours</div>
        </div>
      </div>
      <div class="kpi-card" style="border-left: 4px solid var(--success-600);">
        <div class="kpi-icon-wrapper">🍼</div>
        <div class="kpi-info">
          <div class="kpi-value" id="repro-kpi-births">...</div>
          <div class="kpi-label">Mises bas réussies</div>
        </div>
      </div>
      <div class="kpi-card" style="border-left: 4px solid var(--primary-600);">
        <div class="kpi-icon-wrapper">✨</div>
        <div class="kpi-info">
          <div class="kpi-value" id="repro-kpi-young">...</div>
          <div class="kpi-label">Petits nés vivants intégrés</div>
        </div>
      </div>
    </div>

    <!-- TABLE DES REPRODUCTIONS -->
    <div class="card">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h3 class="card-title">Registre des Accouplements & Gestations</h3>
        <div style="display:flex; gap:8px;">
          <select id="repro-filter-status" class="form-control" style="width:auto; font-size:13px;">
            <option value="tous">Tous les statuts</option>
            <option value="en_attente">En attente confirmation</option>
            <option value="gestation_confirmee">Gestation confirmée</option>
            <option value="mise_bas_effectuee">Mise bas effectuée</option>
            <option value="echec">Échec / Non gestante</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-reproductions">
            <thead>
              <tr>
                <th>Date Saillie</th>
                <th>Espèce</th>
                <th>Reproducteurs</th>
                <th>Type</th>
                <th>Mise bas prévue</th>
                <th>Statut</th>
                <th>Portée vivante</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="8" style="text-align:center; padding:20px;">Chargement du registre...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-reproduction').addEventListener('click', openReproductionModal);
  document.getElementById('repro-filter-status').addEventListener('change', () => loadReproductionsTable());

  await loadReproductionsTable();
}

async function loadReproductionsTable() {
  const farmId = State.currentFarm.id;
  const statusFilter = document.getElementById('repro-filter-status')?.value || 'tous';

  try {
    const data = await API.getReproductions(farmId);
    let list = data.reproductions || [];

    // KPI update
    const activeCount = list.filter(r => r.status === 'en_attente' || r.status === 'gestation_confirmee').length;
    const birthCount = list.filter(r => r.status === 'mise_bas_effectuee').length;
    const totalYoung = list.reduce((sum, r) => sum + (r.litter_size || 0), 0);

    safeSetText('repro-kpi-active', activeCount.toLocaleString());
    safeSetText('repro-kpi-births', birthCount.toLocaleString());
    safeSetText('repro-kpi-young', totalYoung.toLocaleString());

    if (statusFilter !== 'tous') {
      list = list.filter(r => r.status === statusFilter);
    }

    const tbody = document.querySelector('#table-reproductions tbody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--gray-500);">Aucun événement de reproduction enregistré.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(r => {
      let statusBadge = '';
      if (r.status === 'en_attente') statusBadge = '<span class="badge badge-amber">En attente</span>';
      else if (r.status === 'gestation_confirmee') statusBadge = '<span class="badge badge-purple">Gestation confirmée</span>';
      else if (r.status === 'mise_bas_effectuee') statusBadge = '<span class="badge badge-green">Mise bas OK</span>';
      else if (r.status === 'echec') statusBadge = '<span class="badge badge-red">Échec</span>';

      // Calcul des jours restants
      let countdown = '';
      if (r.expected_birth_date && r.status !== 'mise_bas_effectuee' && r.status !== 'echec') {
        const diffDays = Math.ceil((new Date(r.expected_birth_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) countdown = `<div style="font-size:11px; color:var(--danger-600); font-weight:700;">Terme dépassé de ${Math.abs(diffDays)}j</div>`;
        else if (diffDays <= 7) countdown = `<div style="font-size:11px; color:var(--accent-600); font-weight:700;">Dans ${diffDays} jour(s)</div>`;
        else countdown = `<div style="font-size:11px; color:var(--gray-500);">Dans ${diffDays} jours</div>`;
      }

      let actions = '';
      if (r.status === 'en_attente') {
        actions += `
          <button class="btn btn-secondary btn-sm" onclick="updateReproStatus(${r.id}, 'gestation_confirmee')">✅ Gestante</button>
          <button class="btn btn-secondary btn-sm" onclick="updateReproStatus(${r.id}, 'echec')">❌ Échec</button>
          <button class="btn btn-primary btn-sm" onclick="openConfirmBirthModal(${r.id})">🍼 Mise Bas</button>
        `;
      } else if (r.status === 'gestation_confirmee') {
        actions += `
          <button class="btn btn-primary btn-sm" onclick="openConfirmBirthModal(${r.id})">🍼 Valider Mise Bas</button>
        `;
      } else if (r.status === 'mise_bas_effectuee') {
        actions += `<span style="font-size:12px; color:var(--success-700); font-weight:600;">✅ Intégré cheptel</span>`;
      }

      const femaleInfo = r.female_code ? `♀️ ${escapeHtml(r.female_code)}` : (r.female_name ? `♀️ ${escapeHtml(r.female_name)}` : '♀️ Non précisée');
      const maleInfo = r.male_code ? `♂️ ${escapeHtml(r.male_code)}` : (r.male_name ? `♂️ ${escapeHtml(r.male_name)}` : '♂️ Non précisé');

      return `
        <tr>
          <td style="font-size:12.5px;">${escapeHtml(r.service_date)}</td>
          <td>${r.species_icon || '🐾'} <strong>${escapeHtml(r.species_name || r.species_id)}</strong></td>
          <td>
            <div style="font-weight:600;">${femaleInfo}</div>
            <div style="font-size:11.5px; color:var(--gray-500);">${maleInfo}</div>
          </td>
          <td><span class="badge badge-gray">${r.type === 'insemination' ? 'Insémination' : 'Saillie'}</span></td>
          <td>
            <div>${escapeHtml(r.expected_birth_date || '—')}</div>
            ${countdown}
          </td>
          <td>${statusBadge}</td>
          <td style="font-weight:700;">${r.litter_size ? `+${r.litter_size} jeunes` : '—'}</td>
          <td style="text-align:right;">
            <div style="display:flex; gap:4px; justify-content:flex-end;">${actions}</div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.warn('loadReproductionsTable warning:', err);
  }
}

async function updateReproStatus(reproId, newStatus) {
  const farmId = State.currentFarm.id;
  try {
    await API.updateReproduction(farmId, reproId, { status: newStatus });
    showToast('Statut mis à jour avec succès.');
    loadReproductionsTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openReproductionModal() {
  const farmId = State.currentFarm.id;

  // Remplir espèces mammifères / actives
  const spSelect = document.getElementById('repro-species-select');
  const speciesRes = await API.getSpecies(farmId);
  const activeSpecies = speciesRes.species.filter(s => s.is_active);

  spSelect.innerHTML = activeSpecies.map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');

  // Remplir animaux reproducteurs
  const animalsRes = await API.getAnimals(farmId, { status: 'actif' });
  const females = animalsRes.animals.filter(a => a.gender === 'F');
  const males = animalsRes.animals.filter(a => a.gender === 'M');

  const femSelect = document.getElementById('repro-female-select');
  femSelect.innerHTML = '<option value="">Sélectionner une femelle (ou laisser vide)...</option>' +
    females.map(f => `<option value="${f.id}">${f.species_icon || ''} ${escapeHtml(f.code)} — ${escapeHtml(f.category_name)} (${escapeHtml(f.breed || 'Sans race')})</option>`).join('');

  const maleSelect = document.getElementById('repro-male-select');
  maleSelect.innerHTML = '<option value="">Sélectionner un mâle de la ferme (optionnel)...</option>' +
    males.map(m => `<option value="${m.id}">${m.species_icon || ''} ${escapeHtml(m.code)} — ${escapeHtml(m.category_name)}</option>`).join('');

  // Remplir les lots
  const lotsRes = await API.getLots(farmId);
  const lotSelect = document.getElementById('repro-target-lot');
  lotSelect.innerHTML = '<option value="">Lot / Bâtiment actuel de la femelle</option>' +
    lotsRes.lots.map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');

  // Date par défaut aujourd'hui
  document.getElementById('repro-date-input').value = new Date().toISOString().split('T')[0];

  // Durée estimée par défaut selon espèce
  spSelect.onchange = () => {
    const sp = spSelect.value;
    let days = 150;
    if (sp === 'bovins') days = 283;
    else if (sp === 'porcs') days = 114;
    else if (sp === 'chevres' || sp === 'moutons') days = 150;
    else if (sp === 'lapins') days = 31;
    document.getElementById('repro-days-input').value = days;
  };
  spSelect.onchange();

  openModal('modal-reproduction');
}

async function openConfirmBirthModal(reproId) {
  const farmId = State.currentFarm.id;
  document.getElementById('birth-repro-id').value = reproId;
  document.getElementById('birth-date-input').value = new Date().toISOString().split('T')[0];

  const lotsRes = await API.getLots(farmId);
  const lotSelect = document.getElementById('birth-target-lot');
  lotSelect.innerHTML = '<option value="">Maternité / Bâtiment d\'accueil...</option>' +
    lotsRes.lots.map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');

  openModal('modal-confirm-birth');
}

// --------------------------------------------------------------------------
// 2. MODULE PONTE, ŒUFS & INCUBATION
// --------------------------------------------------------------------------
async function renderEggsView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">🥚 Gestion de la Ponte & Incubation — ${escapeHtml(State.currentFarm.name)}</h2>
        <p class="page-subtitle">Ramassage quotidien, destination des œufs (vente, consommation, incubation), calcul du taux d'éclosion et intégration des poussins.</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="btn-new-egg-collection" class="btn btn-secondary">🥚 Enregistrer Ramassage</button>
        <button id="btn-new-incubation" class="btn btn-primary">🐣 Lancer un Lot d'Incubation</button>
      </div>
    </div>

    <!-- STATISTIQUES PONTE & COUVAISON -->
    <div class="kpi-grid">
      <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
        <div class="kpi-icon-wrapper">🥚</div>
        <div class="kpi-info">
          <div class="kpi-value" id="egg-kpi-laid">...</div>
          <div class="kpi-label">Total œufs collectés</div>
        </div>
      </div>
      <div class="kpi-card" style="border-left: 4px solid var(--primary-600);">
        <div class="kpi-icon-wrapper">💰</div>
        <div class="kpi-info">
          <div class="kpi-value" id="egg-kpi-sold">...</div>
          <div class="kpi-label">Œufs commercialisés</div>
        </div>
      </div>
      <div class="kpi-card" style="border-left: 4px solid var(--accent-500);">
        <div class="kpi-icon-wrapper">🐣</div>
        <div class="kpi-info">
          <div class="kpi-value" id="egg-kpi-incubating">...</div>
          <div class="kpi-label">Lots en incubation</div>
        </div>
      </div>
      <div class="kpi-card" style="border-left: 4px solid var(--success-600);">
        <div class="kpi-icon-wrapper">🐥</div>
        <div class="kpi-info">
          <div class="kpi-value" id="egg-kpi-rate">...</div>
          <div class="kpi-label">Taux moyen d'éclosion</div>
        </div>
      </div>
    </div>

    <!-- SECTION 1 : LOTS D'INCUBATION -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="card-title">🐣 Lots d'Incubation & Couvaison</h3>
        <span class="badge badge-purple">Écloserie & Couveuses</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-incubations">
            <thead>
              <tr>
                <th>Code Lot</th>
                <th>Espèce</th>
                <th>Méthode</th>
                <th>Œufs Incubés</th>
                <th>Démarrage</th>
                <th>Éclosion Prévue</th>
                <th>Statut</th>
                <th>Taux d'Éclosion</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="9" style="text-align:center; padding:20px;">Chargement des lots d'incubation...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- SECTION 2 : HISTORIQUE DE COLLECTE DES ŒUFS -->
    <div class="card">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="card-title">🥚 Derniers Ramassages de Ponte</h3>
        <span class="badge badge-amber">Journal de ponte</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-egg-collections">
            <thead>
              <tr>
                <th>Date</th>
                <th>Espèce</th>
                <th>Lot / Poulailler</th>
                <th>Œufs Ramassés</th>
                <th>Propres / Cassés</th>
                <th>Destination (Vente / Couveuse / Conso)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="7" style="text-align:center; padding:20px;">Chargement des collectes...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-egg-collection').addEventListener('click', openEggCollectionModal);
  document.getElementById('btn-new-incubation').addEventListener('click', openIncubationModal);

  await loadEggsData();
}

async function loadEggsData() {
  const farmId = State.currentFarm.id;

  try {
    const summary = await API.getEggSummary(farmId);
    const collectionsRes = await API.getEggCollections(farmId);
    const incubationsRes = await API.getIncubations(farmId);

    // Mettre à jour les KPIs
    safeSetText('egg-kpi-laid', (summary.total_eggs_laid || 0).toLocaleString());
    safeSetText('egg-kpi-sold', (summary.total_eggs_sold || 0).toLocaleString());
    safeSetText('egg-kpi-incubating', (summary.active_incubations || 0).toLocaleString());
    safeSetText('egg-kpi-rate', summary.avg_hatch_rate ? `${summary.avg_hatch_rate}%` : '—');

    // Remplir tableau incubations
    const incTbody = document.querySelector('#table-incubations tbody');
    const incList = incubationsRes.incubations || [];

    if (incTbody) {
      if (incList.length === 0) {
        incTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--gray-500);">Aucun lot d'incubation en cours.</td></tr>`;
      } else {
        incTbody.innerHTML = incList.map(inc => {
          let statusBadge = '';
          if (inc.status === 'en_cours') statusBadge = '<span class="badge badge-amber">En incubation</span>';
          else if (inc.status === 'termine') statusBadge = '<span class="badge badge-green">Éclosion validée</span>';
          else statusBadge = '<span class="badge badge-red">Annulé</span>';

          let diffDaysStr = '';
          if (inc.status === 'en_cours' && inc.expected_hatch_date) {
            const diff = Math.ceil((new Date(inc.expected_hatch_date) - new Date()) / (1000 * 60 * 60 * 24));
            diffDaysStr = diff <= 0 ? `<div style="font-size:11px; color:var(--danger-600); font-weight:700;">Éclosion imminente !</div>` : `<div style="font-size:11px; color:var(--gray-500);">J-${diff}</div>`;
          }

          let actions = '';
          if (inc.status === 'en_cours') {
            actions = `
              <button class="btn btn-secondary btn-sm" onclick="promptCandling(${inc.id})">🔍 Mirage</button>
              <button class="btn btn-primary btn-sm" onclick="openValidateHatchModal(${inc.id}, ${inc.eggs_count})">🐥 Valider Éclosion</button>
            `;
          } else if (inc.status === 'termine') {
            actions = `<span style="font-size:12px; color:var(--success-700); font-weight:600;">+${inc.live_young_count} jeunes au cheptel</span>`;
          }

          const hatchRate = inc.hatch_rate !== null ? `<strong>${inc.hatch_rate}%</strong> (${inc.live_young_count}/${inc.eggs_count})` : '—';

          return `
            <tr>
              <td><strong>${escapeHtml(inc.code)}</strong></td>
              <td>${inc.species_icon || '🥚'} ${escapeHtml(inc.species_name || inc.species_id)}</td>
              <td><span class="badge badge-gray">${inc.method === 'artificielle' ? '⚡ Couveuse' : '🪺 Naturelle'}</span></td>
              <td style="font-weight:700;">${inc.eggs_count}</td>
              <td style="font-size:12.5px;">${escapeHtml(inc.start_date)}</td>
              <td>
                <div>${escapeHtml(inc.expected_hatch_date || '—')}</div>
                ${diffDaysStr}
              </td>
              <td>${statusBadge}</td>
              <td>${hatchRate}</td>
              <td style="text-align:right;">
                <div style="display:flex; gap:6px; justify-content:flex-end;">${actions}</div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Remplir tableau ramassages
    const colTbody = document.querySelector('#table-egg-collections tbody');
    const colList = collectionsRes.collections || [];

    if (colTbody) {
      if (colList.length === 0) {
        colTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--gray-500);">Aucune collecte enregistrée.</td></tr>`;
      } else {
        colTbody.innerHTML = colList.map(c => `
          <tr>
            <td style="font-size:12.5px;">${escapeHtml(c.date)}</td>
            <td>${c.species_icon || '🥚'} ${escapeHtml(c.species_name || c.species_id)}</td>
            <td>${c.lot_name ? `🛖 ${escapeHtml(c.lot_name)}` : 'Général'}</td>
            <td style="font-weight:700; color:var(--primary-800);">${c.eggs_laid}</td>
            <td><span class="badge badge-green">${c.eggs_laid - (c.eggs_broken || 0)}</span> ${c.eggs_broken > 0 ? `<span class="badge badge-red">-${c.eggs_broken} cassés</span>` : ''}</td>
            <td style="font-size:12px;">
              ${c.eggs_sold > 0 ? `<span style="color:var(--primary-700); font-weight:600;">Vente: ${c.eggs_sold}</span> • ` : ''}
              ${c.eggs_incubated > 0 ? `<span style="color:var(--accent-700); font-weight:600;">Incub.: ${c.eggs_incubated}</span> • ` : ''}
              <span>Conso: ${c.eggs_consumed || 0}</span>
            </td>
            <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(c.notes || '—')}</td>
          </tr>
        `).join('');
      }
    }

  } catch (err) {
    console.warn('loadEggsData warning:', err);
  }
}

async function promptCandling(incId) {
  const farmId = State.currentFarm.id;
  const notes = prompt('Saisir le résultat du mirage des œufs (ex: 28 œufs féconds avec embryons vivants, 2 œufs clairs retirés) :');
  if (notes) {
    try {
      await API.updateIncubationCandling(farmId, incId, notes);
      showToast('Observations de mirage enregistrées !');
      loadEggsData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function openEggCollectionModal() {
  const farmId = State.currentFarm.id;

  // Espèces pondeuses (poules, canards, dindes, etc.)
  const spSelect = document.getElementById('egg-species-select');
  const speciesRes = await API.getSpecies(farmId);
  spSelect.innerHTML = speciesRes.species.filter(s => s.is_active).map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');

  // Lots
  const lotsRes = await API.getLots(farmId);
  const lotSelect = document.getElementById('egg-lot-select');
  lotSelect.innerHTML = '<option value="">Poulailler / Bâtiment d\'origine (optionnel)...</option>' +
    lotsRes.lots.map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');

  document.getElementById('egg-date-input').value = new Date().toISOString().split('T')[0];
  openModal('modal-egg-collection');
}

async function openNewIncubationModal() {
  return openIncubationModal(null);
}

async function openEditIncubationModal(incId) {
  return openIncubationModal(incId);
}

async function openIncubationModal(editIncId = null) {
  const farmId = State.currentFarm.id;

  const spSelect = document.getElementById('inc-species-select');
  const speciesRes = await API.getSpecies(farmId);
  const activeSpecies = (speciesRes && speciesRes.species) ? speciesRes.species.filter(s => s.is_active) : [];
  if (spSelect) {
    spSelect.innerHTML = activeSpecies.map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');
  }

  const lotsRes = await API.getLots(farmId);
  const lotSelect = document.getElementById('inc-target-lot');
  if (lotSelect) {
    lotSelect.innerHTML = '<option value="">Poussinière / Lot d\'accueil des jeunes (optionnel)...</option>' +
      (lotsRes.lots || []).map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');
  }

  const startDateInput = document.getElementById('inc-start-date');
  const durationInput = document.getElementById('inc-duration-days');
  const expectedHatchInput = document.getElementById('inc-expected-hatch-date');
  const titleEl = document.getElementById('modal-incubation-title');
  const btnSubmit = document.getElementById('btn-submit-incubation');
  const idInput = document.getElementById('inc-id');

  const updateCalculatedHatchDate = () => {
    if (!startDateInput || !durationInput) return;
    const sDate = startDateInput.value;
    const dur = parseInt(durationInput.value, 10) || 21;
    if (sDate && dur && typeof addDaysToDate === 'function') {
      const expDate = addDaysToDate(sDate, dur);
      if (expectedHatchInput) expectedHatchInput.value = expDate;
    }
  };

  if (spSelect) {
    spSelect.onchange = () => {
      const dur = typeof getDefaultIncubationDuration === 'function'
        ? getDefaultIncubationDuration(spSelect.value)
        : (spSelect.value === 'canards' ? 28 : (spSelect.value === 'oies' ? 30 : (spSelect.value === 'cailles' ? 17 : 21)));
      if (durationInput) durationInput.value = dur;
      updateCalculatedHatchDate();
    };
  }

  if (startDateInput) startDateInput.oninput = updateCalculatedHatchDate;
  if (durationInput) durationInput.oninput = updateCalculatedHatchDate;

  if (editIncId) {
    try {
      const res = await API.getIncubationById(farmId, editIncId);
      const inc = res.incubation;
      if (titleEl) titleEl.textContent = '✏️ Modifier le Lot d\'Incubation';
      if (btnSubmit) btnSubmit.textContent = 'Enregistrer les modifications';
      if (idInput) idInput.value = inc.id;

      if (document.getElementById('inc-code-input')) document.getElementById('inc-code-input').value = inc.code || inc.name || '';
      if (spSelect && inc.species_id) spSelect.value = inc.species_id;
      if (document.getElementById('inc-method-select')) document.getElementById('inc-method-select').value = inc.method || 'artificielle';
      if (document.getElementById('inc-incubator-type')) document.getElementById('inc-incubator-type').value = inc.incubator_type || '';
      if (document.getElementById('inc-eggs-count')) document.getElementById('inc-eggs-count').value = inc.eggs_count || 0;
      if (startDateInput) startDateInput.value = inc.start_date || '';
      if (durationInput) durationInput.value = inc.duration_days || 21;
      if (expectedHatchInput) expectedHatchInput.value = inc.expected_hatch_date || '';
      if (lotSelect) lotSelect.value = inc.target_lot_id || '';
      if (document.getElementById('inc-notes')) document.getElementById('inc-notes').value = inc.notes || '';
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
  } else {
    if (titleEl) titleEl.textContent = '🐣 Lancer un Lot d\'Incubation';
    if (btnSubmit) btnSubmit.textContent = 'Démarrer l\'incubation';
    if (idInput) idInput.value = '';

    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('inc-code-input')) document.getElementById('inc-code-input').value = `INC-${Date.now().toString().slice(-4)}`;
    if (document.getElementById('inc-incubator-type')) document.getElementById('inc-incubator-type').value = '';
    if (document.getElementById('inc-eggs-count')) document.getElementById('inc-eggs-count').value = 20;
    if (startDateInput) startDateInput.value = today;
    if (document.getElementById('inc-notes')) document.getElementById('inc-notes').value = '';
    if (lotSelect) lotSelect.value = '';
    if (spSelect) spSelect.onchange();
  }

  openModal('modal-incubation');
}

async function openRecordHatchModal(incId, eggCount) {
  return openValidateHatchModal(incId, eggCount);
}

async function openValidateHatchModal(incId, eggCount) {
  const farmId = State.currentFarm.id;
  let inc = null;
  try {
    const res = await API.getIncubationById(farmId, incId);
    inc = res.incubation;
  } catch (e) {
    console.warn('Could not fetch inc details', e);
  }

  const totalEggs = inc ? inc.eggs_count : (eggCount || 20);

  const idInput = document.getElementById('hatch-inc-id');
  if (idInput) idInput.value = incId;

  safeSetText('hatch-lot-info-title', inc ? `Lot : ${inc.code || inc.name} (${inc.species_name || ''})` : `Lot d'incubation #${incId}`);
  safeSetText('hatch-total-eggs-display', `${totalEggs} œufs`);

  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('hatch-date-input');
  if (dateInput) dateInput.value = today;

  const hatchedInput = document.getElementById('hatch-hatched-count');
  const liveInput = document.getElementById('hatch-live-count');
  const deadInput = document.getElementById('hatch-dead-count');
  const unhatchedInput = document.getElementById('hatch-unhatched-count');
  const rejectedInput = document.getElementById('hatch-rejected-count');
  const optCreateLot = document.getElementById('hatch-create-animal-lot');

  if (optCreateLot) optCreateLot.checked = true;

  const defaultHatched = Math.max(0, totalEggs - 2);
  if (hatchedInput) hatchedInput.value = defaultHatched;
  if (liveInput) liveInput.value = defaultHatched;
  if (deadInput) deadInput.value = 0;
  if (unhatchedInput) unhatchedInput.value = Math.max(0, totalEggs - defaultHatched);
  if (rejectedInput) rejectedInput.value = 0;

  if (hatchedInput) {
    hatchedInput.oninput = () => {
      const hVal = parseInt(hatchedInput.value, 10) || 0;
      const dVal = parseInt(deadInput?.value, 10) || 0;
      if (liveInput) liveInput.value = Math.max(0, hVal - dVal);
      if (unhatchedInput) unhatchedInput.value = Math.max(0, totalEggs - hVal);
    };
  }

  if (liveInput && deadInput) {
    const syncHatched = () => {
      const lVal = parseInt(liveInput.value, 10) || 0;
      const dVal = parseInt(deadInput.value, 10) || 0;
      if (hatchedInput) hatchedInput.value = lVal + dVal;
      if (unhatchedInput) unhatchedInput.value = Math.max(0, totalEggs - (lVal + dVal));
    };
    liveInput.oninput = syncHatched;
    deadInput.oninput = syncHatched;
  }

  const lotsRes = await API.getLots(farmId);
  const lotSelect = document.getElementById('hatch-target-lot');
  if (lotSelect) {
    lotSelect.innerHTML = '<option value="">Lot / Poussinière d\'accueil (optionnel)</option>' +
      (lotsRes.lots || []).map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');
    if (inc && inc.target_lot_id) lotSelect.value = inc.target_lot_id;
  }

  openModal('modal-validate-hatch');
}

async function openIncubationDetailsModal(incId) {
  const farmId = State.currentFarm.id;
  try {
    const res = await API.getIncubationById(farmId, incId);
    const inc = res.incubation;

    const titleEl = document.getElementById('inc-details-title');
    if (titleEl) titleEl.innerHTML = `<span>${inc.species_icon || '🥚'}</span> <span>Détails — ${escapeHtml(inc.code || inc.name)}</span>`;

    const bodyEl = document.getElementById('inc-details-body');
    if (bodyEl) {
      let fillClass = '';
      if (inc.computed_status === 'en_retard') fillClass = 'fill-red';
      else if (inc.computed_status === 'eclosion_attendue') fillClass = 'fill-amber';

      const methodLabel = inc.incubator_type || (inc.method === 'artificielle' ? '⚡ Couveuse artificielle' : '🪺 Couvaison naturelle');

      bodyEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
          <div>
            <div style="font-size:16px; font-weight:700; color:#0f172a;">${escapeHtml(inc.name || inc.code)}</div>
            <div style="font-size:12.5px; color:#64748b;">${escapeHtml(inc.species_name || '')} • ${inc.eggs_count} œufs mis en place</div>
          </div>
          <span class="badge ${inc.badge_class}" style="font-size:12px; font-weight:700; padding:6px 12px;">${inc.status_label}</span>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
          <div style="background:#f8fafc; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
            <div style="font-size:11px; color:#64748b; font-weight:600;">DATE DE DÉMARRAGE</div>
            <div style="font-size:14px; font-weight:700; color:#0f172a; margin-top:2px;">${escapeHtml(inc.start_date || '—')}</div>
          </div>
          <div style="background:#f8fafc; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
            <div style="font-size:11px; color:#64748b; font-weight:600;">ÉCLOSION PRÉVUE (${inc.duration_days} j)</div>
            <div style="font-size:14px; font-weight:700; color:#0f172a; margin-top:2px;">${escapeHtml(inc.expected_hatch_date || '—')}</div>
          </div>
        </div>

        <div class="dash-inc-progress-wrap" style="margin-bottom:16px;">
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

        <div style="margin-bottom:16px;">
          <h5 style="font-size:13px; font-weight:700; color:#334155; margin-bottom:8px;">Installation & Paramètres</h5>
          <div class="dash-inc-meta-row">
            <span style="color:#64748b;">Méthode / Emplacement :</span>
            <strong style="color:#1e293b;">${escapeHtml(methodLabel)}</strong>
          </div>
          <div class="dash-inc-meta-row">
            <span style="color:#64748b;">Destination des jeunes :</span>
            <span>${escapeHtml(inc.target_lot_name || 'Non assigné')}</span>
          </div>
        </div>

        ${(inc.status === 'termine' || inc.hatched_count > 0) ? `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 14px; margin-bottom:16px;">
            <h5 style="font-size:13px; font-weight:700; color:#166534; margin:0 0 8px;">Résultats de l'Éclosion</h5>
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; text-align:center;">
              <div style="background:#ffffff; padding:6px; border-radius:6px; border:1px solid #bbf7d0;">
                <div style="font-size:11px; color:#15803d;">Éclos</div>
                <div style="font-size:16px; font-weight:800; color:#166534;">${inc.hatched_count || 0}</div>
              </div>
              <div style="background:#ffffff; padding:6px; border-radius:6px; border:1px solid #bbf7d0;">
                <div style="font-size:11px; color:#15803d;">Vivants</div>
                <div style="font-size:16px; font-weight:800; color:#15803d;">${inc.live_young_count || inc.hatched_count || 0}</div>
              </div>
              <div style="background:#ffffff; padding:6px; border-radius:6px; border:1px solid #bbf7d0;">
                <div style="font-size:11px; color:#15803d;">Taux</div>
                <div style="font-size:16px; font-weight:800; color:#166534;">${inc.hatch_rate || 0}%</div>
              </div>
            </div>
            ${inc.dead_young_count ? `<div style="font-size:12px; color:#b91c1c; margin-top:6px;">⚠️ ${inc.dead_young_count} mort-né(s) ou non viable(s)</div>` : ''}
            ${inc.unhatched_count ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">• ${inc.unhatched_count} œuf(s) non éclos</div>` : ''}
            ${inc.rejected_count ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">• ${inc.rejected_count} œuf(s) clairs / éliminés</div>` : ''}
          </div>
        ` : ''}

        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <h5 style="font-size:13px; font-weight:700; color:#334155; margin:0;">Observations de Mirage</h5>
            <button class="btn btn-secondary btn-sm" onclick="promptCandling(${inc.id}); closeModal('modal-incubation-details');" style="font-size:11px; padding:2px 8px;">
              🔍 Noter le mirage
            </button>
          </div>
          <div style="font-size:12.5px; color:#475569; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
            ${escapeHtml(inc.candling_notes || 'Aucune observation de mirage enregistrée pour le moment.')}
          </div>
        </div>

        <div>
          <h5 style="font-size:13px; font-weight:700; color:#334155; margin-bottom:4px;">Notes & Observations</h5>
          <div style="font-size:12.5px; color:#475569; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
            ${escapeHtml(inc.notes || 'Aucune note particulière.')}
          </div>
        </div>
      `;
    }

    const footerEl = document.getElementById('inc-details-footer');
    if (footerEl) {
      footerEl.innerHTML = `
        <button type="button" class="btn btn-secondary btn-close-modal">Fermer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal('modal-incubation-details'); openEditIncubationModal(${inc.id});">
          ✏️ Modifier
        </button>
        ${inc.status !== 'termine' ? `
          <button type="button" class="btn btn-primary" onclick="closeModal('modal-incubation-details'); openRecordHatchModal(${inc.id}, ${inc.eggs_count});">
            🐣 Enregistrer l'éclosion
          </button>
        ` : ''}
      `;
    }

    openModal('modal-incubation-details');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --------------------------------------------------------------------------
// 3. MODULE SANTÉ & VÉTÉRINAIRE
// --------------------------------------------------------------------------
async function renderHealthView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">🩺 Santé Animale & Vétérinaire — ${escapeHtml(State.currentFarm.name)}</h2>
        <p class="page-subtitle">Vaccinations, vermifugations, traitements, consultations vétérinaires et rappels sanitaires préventifs.</p>
      </div>
      <div>
        <button id="btn-new-health" class="btn btn-primary">➕ Nouveau Soin / Vaccin</button>
      </div>
    </div>

    <!-- CARTE D'ALERTES SANITAIRES -->
    <div id="health-reminders-box" style="margin-bottom:20px;"></div>

    <!-- TABLE DES TRAITEMENTS -->
    <div class="card">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h3 class="card-title">Carnet Sanitaire & Historique des Interventions</h3>
        <select id="health-filter-type" class="form-control" style="width:auto; font-size:13px;">
          <option value="tous">Toutes les interventions</option>
          <option value="vaccination">Vaccinations</option>
          <option value="vermifugation">Vermifugations</option>
          <option value="traitement">Traitements curatifs</option>
          <option value="consultation">Consultations vétérinaires</option>
        </select>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-health">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Espèce</th>
                <th>Cible (Animal / Lot)</th>
                <th>Diagnostic / Maladie</th>
                <th>Produit & Posologie</th>
                <th>Vétérinaire</th>
                <th>Coût</th>
                <th>Prochain Rappel</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="9" style="text-align:center; padding:20px;">Chargement du carnet sanitaire...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-health').addEventListener('click', openHealthModal);
  document.getElementById('health-filter-type').addEventListener('change', () => loadHealthTable());

  await loadHealthTable();
}

async function loadHealthTable() {
  const farmId = State.currentFarm.id;
  const filterType = document.getElementById('health-filter-type')?.value || 'tous';

  try {
    const treatmentsRes = await API.getTreatments(farmId);
    const remindersRes = await API.getHealthReminders(farmId);

    // Boîte de rappels
    const reminderBox = document.getElementById('health-reminders-box');
    const upcoming = remindersRes.upcoming_treatments || [];
    if (reminderBox) {
      if (upcoming.length > 0) {
        reminderBox.innerHTML = `
          <div class="card card-body" style="background:#fffbeb; border-left:4px solid #f59e0b; padding:14px 18px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <span style="font-size:20px;">⚠️</span>
              <strong style="color:#b45309; font-size:14px;">Rappels de soins prévus dans les 7 prochains jours :</strong>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${upcoming.map(u => `
                <div style="font-size:13px; color:#78350f;">
                  • <strong>${escapeHtml(u.next_care_date)}</strong> : ${escapeHtml(u.treatment_name)} pour ${escapeHtml(u.species_name || '')} (${escapeHtml(u.disease || '')})
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        reminderBox.innerHTML = '';
      }
    }

    let list = treatmentsRes.treatments || [];
    if (filterType !== 'tous') {
      list = list.filter(t => t.type === filterType);
    }

    const tbody = document.querySelector('#table-health tbody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--gray-500);">Aucune intervention sanitaire enregistrée.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(t => {
      let typeBadge = '';
      if (t.type === 'vaccination') typeBadge = '<span class="badge badge-purple">Vaccin</span>';
      else if (t.type === 'vermifugation') typeBadge = '<span class="badge badge-green">Vermifuge</span>';
      else if (t.type === 'traitement') typeBadge = '<span class="badge badge-red">Traitement</span>';
      else typeBadge = '<span class="badge badge-gray">Consultation</span>';

      const target = t.animal_code ? `🐾 ${escapeHtml(t.animal_code)}` : (t.lot_name ? `🛖 Lot ${escapeHtml(t.lot_name)}` : 'Tout le cheptel');
      const cur = State.currentFarm?.currency || 'FCFA';

      return `
        <tr>
          <td style="font-size:12.5px;">${escapeHtml(t.date)}</td>
          <td>${typeBadge}</td>
          <td>${t.species_icon || '🐾'} ${escapeHtml(t.species_name || t.species_id)}</td>
          <td><strong>${target}</strong></td>
          <td>${escapeHtml(t.disease || 'Contrôle')}</td>
          <td>
            <div style="font-weight:600;">${escapeHtml(t.treatment_name)}</div>
            ${t.dosage ? `<div style="font-size:11px; color:var(--gray-500);">${escapeHtml(t.dosage)}</div>` : ''}
          </td>
          <td>${escapeHtml(t.veterinarian || 'Éleveur')}</td>
          <td style="font-weight:700;">${t.cost ? `${t.cost.toLocaleString()} ${cur}` : '—'}</td>
          <td>${t.next_care_date ? `<span class="badge badge-amber">${t.next_care_date}</span>` : '—'}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.warn('loadHealthData warning:', err);
  }
}

async function openHealthModal() {
  const farmId = State.currentFarm.id;

  const spSelect = document.getElementById('health-species-select');
  const speciesRes = await API.getSpecies(farmId);
  spSelect.innerHTML = speciesRes.species.filter(s => s.is_active).map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');

  const animalsRes = await API.getAnimals(farmId, { status: 'actif' });
  const animSelect = document.getElementById('health-animal-select');
  animSelect.innerHTML = '<option value="">Aucun animal individuel (sélectionner un lot ci-dessous)</option>' +
    animalsRes.animals.map(a => `<option value="${a.id}">${a.species_icon || ''} ${escapeHtml(a.code)} — ${escapeHtml(a.category_name)}</option>`).join('');

  const lotsRes = await API.getLots(farmId);
  const lotSelect = document.getElementById('health-lot-select');
  lotSelect.innerHTML = '<option value="">Lot complet traité (optionnel)...</option>' +
    lotsRes.lots.map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');

  document.getElementById('health-date').value = new Date().toISOString().split('T')[0];
  openModal('modal-health');
}

// --------------------------------------------------------------------------
// 4. MODULE ALIMENTATION & GESTION DES STOCKS
// --------------------------------------------------------------------------
async function renderFeedView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">🌾 Alimentation & Gestion des Stocks — ${escapeHtml(State.currentFarm.name)}</h2>
        <p class="page-subtitle">Gestion des rations alimentaires, approvisionnements, distributions quotidiennes et alertes automatiques de stock bas.</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="btn-new-feed" class="btn btn-secondary">➕ Nouvel Aliment</button>
        <button id="btn-new-feed-log" class="btn btn-primary">⚖️ Achat ou Distribution</button>
      </div>
    </div>

    <!-- BANDEAU ALERTE STOCK BAS -->
    <div id="feed-alerts-banner" style="margin-bottom:20px;"></div>

    <!-- GRILLE DES STOCKS D'ALIMENTS -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="card-title">Inventaire & Niveaux de Stocks des Aliments</h3>
        <span class="badge badge-green">Stocks en temps réel</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-feeds">
            <thead>
              <tr>
                <th>Aliment</th>
                <th>Catégorie</th>
                <th>Espèce ciblée</th>
                <th>Stock Disponible</th>
                <th>Seuil d'Alerte</th>
                <th>Prix Unitaire</th>
                <th>Fournisseur</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="8" style="text-align:center; padding:20px;">Chargement des stocks...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- JOURNAL DES DISTRIBUTIONS & ACHATS -->
    <div class="card">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="card-title">Journal des Mouvements d'Aliments</h3>
        <span class="badge badge-gray">Traçabilité des rations</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-feed-logs">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opération</th>
                <th>Aliment</th>
                <th>Quantité</th>
                <th>Lot destinataire</th>
                <th>Coût total</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="7" style="text-align:center; padding:20px;">Chargement des mouvements...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-feed').addEventListener('click', openFeedModal);
  document.getElementById('btn-new-feed-log').addEventListener('click', openFeedLogModal);

  await loadFeedData();
}

async function loadFeedData() {
  const farmId = State.currentFarm.id;

  try {
    const feedsRes = await API.getFeeds(farmId);
    const logsRes = await API.getFeedLogs(farmId);
    const cur = State.currentFarm?.currency || 'FCFA';

    const feeds = feedsRes.feeds || [];
    const lowStockFeeds = feeds.filter(f => f.stock_quantity <= f.min_threshold);

    // Alerte stock bas
    const banner = document.getElementById('feed-alerts-banner');
    if (banner) {
      if (lowStockFeeds.length > 0) {
        banner.innerHTML = `
          <div class="card card-body" style="background:#fef2f2; border-left:4px solid #ef4444; padding:14px 18px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span style="font-size:20px;">⚠️</span>
              <strong style="color:#b91c1c; font-size:14px;">Alerte Rupture / Stock Bas (${lowStockFeeds.length} aliment(s) sous le seuil critique) :</strong>
            </div>
            <div style="font-size:13px; color:#991b1b;">
              ${lowStockFeeds.map(f => `• <strong>${escapeHtml(f.name)}</strong> : Stock restant ${f.stock_quantity} ${escapeHtml(f.unit)} (Seuil minimum : ${f.min_threshold} ${escapeHtml(f.unit)})`).join('<br>')}
            </div>
          </div>
        `;
      } else {
        banner.innerHTML = '';
      }
    }

    // Tableau des aliments
    const feedsTbody = document.querySelector('#table-feeds tbody');
    if (feedsTbody) {
      if (feeds.length === 0) {
        feedsTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--gray-500);">Aucun aliment enregistré. Cliquez sur « Nouvel Aliment » pour démarrer.</td></tr>`;
      } else {
        feedsTbody.innerHTML = feeds.map(f => {
          const isLow = f.stock_quantity <= f.min_threshold;
          const stockBadge = isLow
            ? `<span class="badge badge-red" style="font-size:13px; font-weight:800;">⚠️ ${f.stock_quantity} ${escapeHtml(f.unit)}</span>`
            : `<span class="badge badge-green" style="font-size:13px; font-weight:700;">${f.stock_quantity} ${escapeHtml(f.unit)}</span>`;

          return `
            <tr>
              <td><strong>${escapeHtml(f.name)}</strong></td>
              <td><span class="badge badge-gray">${escapeHtml(f.category)}</span></td>
              <td>${f.species_icon || '🐾'} ${escapeHtml(f.species_name || 'Toutes espèces')}</td>
              <td>${stockBadge}</td>
              <td style="color:var(--gray-600);">${f.min_threshold} ${escapeHtml(f.unit)}</td>
              <td>${f.unit_price ? `${f.unit_price} ${cur}/${f.unit}` : '—'}</td>
              <td>${escapeHtml(f.supplier || '—')}</td>
              <td style="text-align:right;">
                <button class="btn btn-secondary btn-sm" onclick="distributeFeedQuick(${f.id})">🍽️ Distribuer</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Tableau des logs
    const logsTbody = document.querySelector('#table-feed-logs tbody');
    const logs = logsRes.logs || [];
    if (logsTbody) {
      if (logs.length === 0) {
        logsTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--gray-500);">Aucun mouvement d'aliment tracé.</td></tr>`;
      } else {
        logsTbody.innerHTML = logs.map(l => {
          let typeBadge = '';
          if (l.type === 'distribution') typeBadge = '<span class="badge badge-blue">🍽️ Distribution</span>';
          else if (l.type === 'achat') typeBadge = '<span class="badge badge-green">🛒 Achat (Entrée)</span>';
          else typeBadge = '<span class="badge badge-red">⚠️ Perte</span>';

          return `
            <tr>
              <td style="font-size:12.5px;">${escapeHtml(l.date)}</td>
              <td>${typeBadge}</td>
              <td><strong>${escapeHtml(l.feed_name)}</strong></td>
              <td style="font-weight:700;">${l.quantity} ${escapeHtml(l.unit || '')}</td>
              <td>${l.lot_name ? `🛖 Lot ${escapeHtml(l.lot_name)}` : 'Général'}</td>
              <td style="font-weight:600;">${l.total_cost ? `${l.total_cost.toLocaleString()} ${cur}` : '—'}</td>
              <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(l.notes || '—')}</td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.warn('loadFeedData warning:', err);
  }
}

function distributeFeedQuick(feedId) {
  openFeedLogModal();
  const feedSelect = document.getElementById('feed-log-feed-select');
  if (feedSelect) feedSelect.value = feedId;
}

async function openFeedModal() {
  const farmId = State.currentFarm.id;
  const spSelect = document.getElementById('feed-species-select');
  const speciesRes = await API.getSpecies(farmId);
  spSelect.innerHTML = '<option value="">Toutes espèces (Aliment polyvalent)...</option>' +
    speciesRes.species.filter(s => s.is_active).map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');

  document.getElementById('form-feed').reset();
  openModal('modal-feed');
}

async function openFeedLogModal() {
  const farmId = State.currentFarm.id;

  const feedSelect = document.getElementById('feed-log-feed-select');
  const feedsRes = await API.getFeeds(farmId);
  feedSelect.innerHTML = feedsRes.feeds.map(f => `<option value="${f.id}">${escapeHtml(f.name)} (Dispo: ${f.stock_quantity} ${escapeHtml(f.unit)})</option>`).join('');

  const lotSelect = document.getElementById('feed-log-lot-select');
  const lotsRes = await API.getLots(farmId);
  lotSelect.innerHTML = '<option value="">Sélectionner un lot destinataire...</option>' +
    lotsRes.lots.map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');

  document.getElementById('feed-log-date').value = new Date().toISOString().split('T')[0];

  const typeSelect = document.getElementById('feed-log-type');
  typeSelect.onchange = () => {
    const isAchat = typeSelect.value === 'achat';
    document.getElementById('feed-log-group-price').style.display = isAchat ? 'flex' : 'none';
    document.getElementById('feed-log-group-lot').style.display = isAchat ? 'none' : 'block';
  };
  typeSelect.onchange();

  openModal('modal-feed-log');
}

// --------------------------------------------------------------------------
// 5. MODULE BÂTIMENTS & INSTALLATIONS
// --------------------------------------------------------------------------
async function renderBuildingsView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">🛖 Installations & Bâtiments d'Élevage — ${escapeHtml(State.currentFarm.name)}</h2>
        <p class="page-subtitle">Poulaillers, bergeries, chèvreries, étables, enclos et suivi des capacités d'accueil et d'entretien.</p>
      </div>
      <div>
        <button id="btn-new-building" class="btn btn-primary">➕ Nouvelle Installation</button>
      </div>
    </div>

    <!-- GRILLE DES INSTALLATIONS -->
    <div class="lots-grid" id="buildings-grid" style="margin-bottom:30px;">
      <p style="padding:20px;">Chargement des installations...</p>
    </div>

    <!-- HISTORIQUE DES ENTRETIENS -->
    <div class="card">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="card-title">Registre des Entretiens & Opérations Sanitaires</h3>
        <span class="badge badge-purple">Désinfections & Vides Sanitaires</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-building-maintenance">
            <thead>
              <tr>
                <th>Date</th>
                <th>Installation</th>
                <th>Type d'Entretien</th>
                <th>Travaux Réalisés</th>
                <th>Intervenant</th>
                <th>Coût</th>
                <th>Prochain Entretien</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="7" style="text-align:center; padding:20px;">Chargement des entretiens...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-building').addEventListener('click', openLotModal);

  await loadBuildingsData();
}

async function loadBuildingsData() {
  const farmId = State.currentFarm.id;

  try {
    const data = await API.getBuildings(farmId);
    const buildings = data.buildings || [];
    const container = document.getElementById('buildings-grid');

    if (buildings.length === 0) {
      container.innerHTML = `<p style="padding:24px; color:var(--gray-500);">Aucune installation configurée. Créez des poulaillers, bergeries ou enclos en cliquant sur « Nouvelle Installation ».</p>`;
    } else {
      container.innerHTML = buildings.map(b => {
        const capacity = Number(b.capacity) || 0;
        const current = Number(b.current_occupancy ?? b.current_headcount) || 0;
        const pct = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
        const isOverflow = capacity > 0 && current > capacity;

        const overflowBadge = isOverflow
          ? `<div class="badge badge-red" style="font-size:11px; font-weight:800; margin-top:6px;">⚠️ Surcharge : +${current - capacity} animaux !</div>`
          : '';

        let typeIcon = '🛖';
        const bName = (b.name || '').toLowerCase();
        const bType = (b.building_type || '').toLowerCase();
        if (bType.includes('canard') || bName.includes('canard') || bName.includes('oie')) typeIcon = '🦆';
        else if (bType.includes('poul') || bName.includes('poul')) typeIcon = '🐔';
        else if (bType.includes('chèvr') || bType.includes('chevr') || bName.includes('chèvre') || bName.includes('bergerie')) typeIcon = '🐐';
        else if (bType.includes('berg') || bName.includes('mouton')) typeIcon = '🐑';
        else if (bType.includes('étab') || bType.includes('etab') || bName.includes('étable') || bName.includes('bovin')) typeIcon = '🐄';
        else if (bName.includes('couveuse') || bName.includes('incubateur')) typeIcon = '🐣';
        else if (bType.includes('enclos') || bName.includes('enclos') || bName.includes('parc')) typeIcon = '🌿';

        const animalsListHtml = (b.animals && b.animals.length > 0)
          ? `<div style="margin: 12px 0 10px 0; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 6px; padding: 8px 10px;">
               <div style="font-size:11px; font-weight:700; color:var(--gray-600); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">
                 🐾 Lots d'animaux hébergés (${b.animals.length})
               </div>
               <div style="display:flex; flex-direction:column; gap:6px;">
                 ${b.animals.map(a => `
                   <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid var(--gray-200); border-radius:5px; padding:6px 8px; font-size:12px;">
                     <div>
                       <strong>${escapeHtml(a.code || ('Lot #' + a.id))}</strong>
                       <span style="color:var(--gray-600); margin-left:4px;">(${a.species_icon || '🐾'} ${escapeHtml(a.category_name || a.species_name || '')})</span>
                       <span class="badge badge-green" style="font-size:10.5px; margin-left:4px; padding:2px 6px;">${a.current_quantity || 0} têtes</span>
                     </div>
                     <button class="btn btn-secondary btn-sm" onclick="openEditAnimalLotModal(${a.id})" title="Modifier ce lot d'animaux" style="padding:2px 8px; font-size:11px; display:inline-flex; align-items:center; gap:3px;">
                       ✏️ Modifier
                     </button>
                   </div>
                 `).join('')}
               </div>
             </div>`
          : `<div style="font-size:12px; color:var(--gray-500); font-style:italic; margin: 10px 0; padding:4px 0;">
               Aucun lot d'animaux actuellement hébergé dans cette installation.
             </div>`;

        return `
          <div class="lot-card" style="border-top: 4px solid ${isOverflow ? 'var(--danger-500)' : 'var(--primary-600)'}; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div class="lot-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <h4 class="lot-name" style="margin:0; display:flex; align-items:center; gap:6px;">
                    <span>${typeIcon}</span> <span>${escapeHtml(b.name)}</span>
                  </h4>
                  <div class="lot-location" style="margin-top:2px;">📍 ${escapeHtml(b.location || 'Non précisé')}</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span class="badge ${isOverflow ? 'badge-red' : (b.status === 'inactif' ? 'badge-gray' : 'badge-green')}">${pct}% occupé</span>
                  <button class="btn btn-secondary btn-sm" onclick="openEditBuildingModal(${b.id})" title="Modifier l'installation" style="padding:3px 8px; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
                    ✏️ Modifier
                  </button>
                </div>
              </div>

              <div style="margin: 14px 0;">
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:6px;">
                  <span>Effectif présent :</span>
                  <span style="color:${isOverflow ? 'var(--danger-600)' : 'var(--primary-800)'}; font-size:15px; font-weight:800;">${current} / ${capacity > 0 ? capacity : 'Illimité'}</span>
                </div>
                <div style="background:var(--gray-200); height:8px; border-radius:4px; overflow:hidden;">
                  <div style="background:${isOverflow ? 'var(--danger-500)' : 'var(--primary-600)'}; width:${pct}%; height:100%;"></div>
                </div>
                ${overflowBadge}
              </div>

              <div style="font-size:12px; color:var(--gray-600); margin-bottom:10px;">
                <div>Espèce hébergée : <strong>${b.species_icon || '🐾'} ${escapeHtml(b.species_name || 'Mixte')}</strong></div>
                <div>Statut opérationnel : <strong>${escapeHtml(b.status || 'actif')}</strong></div>
                <div>Dernier entretien : ${b.last_maintenance_date ? `<strong>${b.last_maintenance_date}</strong>` : 'Aucun'}</div>
              </div>

              ${animalsListHtml}
            </div>

            <div class="lot-card-footer" style="padding-top:10px; border-top:1px solid var(--gray-100); display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              <button class="btn btn-secondary btn-sm" onclick="openMaintenanceModal(${b.id}, '${escapeHtml(b.name)}')">🛠️ Entretien</button>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-secondary btn-sm" onclick="openEditBuildingModal(${b.id})" style="display:inline-flex; align-items:center; gap:4px;">
                  ✏️ Modifier
                </button>
                <button class="btn btn-secondary btn-sm" onclick="deleteBuilding(${b.id})" style="color:var(--danger-600); display:inline-flex; align-items:center; gap:4px;">
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Charger l'historique de tous les entretiens
    const tbody = document.querySelector('#table-building-maintenance tbody');
    // Récupérer les logs des bâtiments
    let allLogs = [];
    for (const b of buildings) {
      try {
        const mRes = await API.getBuildingMaintenance(farmId, b.id);
        if (mRes.maintenance) {
          allLogs = allLogs.concat(mRes.maintenance.map(m => ({ ...m, building_name: b.name })));
        }
      } catch (e) {}
    }

    allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (tbody) {
      if (allLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--gray-500);">Aucun historique d'entretien consigné.</td></tr>`;
      } else {
        const cur = State.currentFarm?.currency || 'FCFA';
        tbody.innerHTML = allLogs.slice(0, 15).map(m => `
          <tr>
            <td style="font-size:12.5px;">${escapeHtml(m.date)}</td>
            <td><strong>🛖 ${escapeHtml(m.building_name)}</strong></td>
            <td><span class="badge badge-purple">${escapeHtml(m.type)}</span></td>
            <td>${escapeHtml(m.description)}</td>
            <td>${escapeHtml(m.performed_by || 'Équipe ferme')}</td>
            <td>${m.cost ? `${m.cost.toLocaleString()} ${cur}` : '—'}</td>
            <td>${m.next_date ? `<span class="badge badge-amber">${m.next_date}</span>` : '—'}</td>
          </tr>
        `).join('');
      }
    }

  } catch (err) {
    console.warn('loadBuildingsData warning:', err);
  }
}

function openMaintenanceModal(lotId, lotName) {
  document.getElementById('maint-lot-id').value = lotId;
  document.getElementById('maint-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('maint-desc').value = `Nettoyage et désinfection de ${lotName}`;
  openModal('modal-building-maintenance');
}

async function deleteBuilding(buildingId) {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  if (confirm('Voulez-vous vraiment supprimer cette installation ?')) {
    try {
      await API.deleteBuilding(farmId, buildingId);
      showToast('Installation supprimée avec succès.');
      await loadBuildingsData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}
window.deleteBuilding = deleteBuilding;

// --------------------------------------------------------------------------
// 6. MODULE GESTION DES DÉPENSES & ACHATS (COMMERCIAL)
// --------------------------------------------------------------------------
let currentExpensesList = [];

function formatDateFR(dateStr) {
  if (!dateStr) return '—';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return dateStr;
}

function exportExpensesExcel(expenses, currency, farmName) {
  if (!expenses || expenses.length === 0) {
    showToast('Aucune dépense à exporter.', 'error');
    return;
  }
  const headers = ['Date', 'Catégorie', 'Description', 'Lot', 'Fournisseur', 'Mode de règlement', 'Montant', 'Devise'];
  const rows = expenses.map(e => [
    formatDateFR(e.date),
    `"${(e.category || '').replace(/"/g, '""')}"`,
    `"${(e.title || '').replace(/"/g, '""')}"`,
    `"${(e.lot_name || 'Général').replace(/"/g, '""')}"`,
    `"${(e.supplier || '—').replace(/"/g, '""')}"`,
    `"${(e.payment_method || 'Espèces').replace(/"/g, '""')}"`,
    e.amount,
    currency
  ]);
  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const now = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `depenses_${(farmName || 'ferme').replace(/\s+/g, '_')}_${now}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Export Excel/CSV généré avec succès !');
}

async function openExpenseModal() {
  const farmId = State.currentFarm.id;
  const cur = State.currentFarm?.currency || 'FCFA';

  const form = document.getElementById('form-expense');
  if (form) form.reset();

  const labelAmount = document.getElementById('label-expense-amount');
  if (labelAmount) {
    labelAmount.textContent = `Montant (${cur}) *`;
  }

  const dateInput = document.getElementById('expense-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Charger les lots de la ferme
  const lotSelect = document.getElementById('expense-lot-select');
  if (lotSelect) {
    try {
      const lotsRes = await API.getLots(farmId);
      lotSelect.innerHTML = '<option value="">Général Ferme</option>' +
        (lotsRes.lots || []).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
    } catch (_) {
      lotSelect.innerHTML = '<option value="">Général Ferme</option>';
    }
  }

  openModal('modal-expense');
}
window.openExpenseModal = openExpenseModal;

async function openRevenueModal() {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  const cur = State.currentFarm?.currency || 'FCFA';

  const labelAmount = document.getElementById('label-revenue-amount');
  if (labelAmount) labelAmount.textContent = `Montant (${cur}) *`;

  const curInput = document.getElementById('revenue-currency');
  if (curInput) curInput.value = cur;

  const spSelect = document.getElementById('revenue-species-select');
  if (spSelect) {
    try {
      const speciesRes = await API.getSpecies(farmId);
      spSelect.innerHTML = '<option value="">Ferme globale</option>' +
        (speciesRes.species || []).filter(s => s.is_active).map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');
    } catch (_) {
      spSelect.innerHTML = '<option value="">Ferme globale</option>';
    }
  }

  const lotSelect = document.getElementById('revenue-lot-select');
  if (lotSelect) {
    try {
      const lotsRes = await API.getLots(farmId);
      lotSelect.innerHTML = '<option value="">Aucun lot spécifique</option>' +
        (lotsRes.lots || []).map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');
    } catch (_) {
      lotSelect.innerHTML = '<option value="">Aucun lot spécifique</option>';
    }
  }

  const dateInput = document.getElementById('revenue-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  openModal('modal-revenue');
}
window.openRevenueModal = openRevenueModal;

async function loadExpensesData() {
  const tbody = document.getElementById('table-expenses-body');

  if (!State.currentFarm) {
    safeSetText('expenses-total-cumule', '0 FCFA');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--gray-500);">Veuillez sélectionner une ferme.</td></tr>`;
    return;
  }

  const farmId = State.currentFarm.id;
  const cur = State.currentFarm?.currency || 'FCFA';

  try {
    const res = await API.getFinancialRecords(farmId, { type: 'depense' });
    const expenses = (res && res.records) ? res.records : [];
    // Trier par date croissante comme sur la capture d'écran
    expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
    currentExpensesList = expenses;

    // Calculer le total cumulé
    const totalCumule = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    safeSetText('expenses-total-cumule', `${totalCumule.toLocaleString('fr-FR')} ${cur}`);

    if (!tbody) return;

    if (expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--gray-500);">Aucune dépense enregistrée pour cette ferme. Cliquez sur « + Nouvelle Dépense » pour enregistrer un achat ou une charge.</td></tr>`;
      return;
    }

    tbody.innerHTML = expenses.map(exp => {
      const formattedDate = formatDateFR(exp.date);
      const formattedAmount = (exp.amount || 0).toLocaleString('fr-FR') + ' ' + cur;
      const catBadge = `<span style="background:#e0f2fe; color:#0369a1; padding:4px 12px; border-radius:9999px; font-weight:500; font-size:0.82rem; display:inline-block;">${escapeHtml(exp.category || 'Dépense')}</span>`;
      const lotText = exp.lot_name ? escapeHtml(exp.lot_name) : '—';
      const supplierText = exp.supplier ? escapeHtml(exp.supplier) : '—';
      const modeText = exp.payment_method ? escapeHtml(exp.payment_method) : 'Espèces';

      return `
        <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s ease;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
          <td style="padding:14px 16px; font-size:0.9rem; color:#334155; white-space:nowrap;">${formattedDate}</td>
          <td style="padding:14px 16px;">${catBadge}</td>
          <td style="padding:14px 16px; font-weight:500; color:#0f172a; max-width:280px;">${escapeHtml(exp.title || '—')}</td>
          <td style="padding:14px 16px; font-size:0.9rem; color:#475569;">${lotText}</td>
          <td style="padding:14px 16px; font-size:0.9rem; color:#475569;">${supplierText}</td>
          <td style="padding:14px 16px; font-size:0.9rem; color:#475569;">${modeText}</td>
          <td style="padding:14px 16px; text-align:right; font-weight:700; color:#dc2626; font-size:0.95rem; white-space:nowrap;">${formattedAmount}</td>
          <td style="padding:14px 16px; text-align:center;">
            <button class="btn-delete-expense" data-id="${exp.id}" title="Supprimer cette dépense" style="background:none; border:none; cursor:pointer; font-size:1.15rem; color:#ef4444; padding:4px 8px; border-radius:6px; transition:background 0.15s ease;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attacher les écouteurs de suppression
    tbody.querySelectorAll('.btn-delete-expense').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!confirm('Voulez-vous vraiment supprimer cette dépense ?')) return;
        try {
          await API.deleteFinancialRecord(farmId, id);
          showToast('Dépense supprimée avec succès !');
          await loadExpensesData();
          checkNotificationsBadge();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    console.warn("Erreur loadExpensesData:", err);
    safeSetText('expenses-total-cumule', `0 ${cur}`);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--gray-500);">Aucune dépense enregistrée. Cliquez sur « + Nouvelle Dépense » pour ajouter une charge.</td></tr>`;
  }
}
window.loadExpensesData = loadExpensesData;

async function renderCommercialView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  const cur = State.currentFarm?.currency || 'FCFA';

  content.innerHTML = `
    <!-- EN-TÊTE CONFORME CAPTURE D'ÉCRAN : GESTION COMPLÈTE DES DÉPENSES -->
    <div class="page-header" style="margin-bottom:20px;">
      <div>
        <h2 class="page-title" style="font-size:1.55rem; font-weight:800; color:#0f172a; margin-bottom:4px;">Gestion Complète des Dépenses</h2>
        <div style="font-size:1.12rem; font-weight:700; color:#dc2626;" id="expenses-subtitle-total">
          Total cumulé : <span id="expenses-total-cumule">Chargement...</span>
        </div>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <button id="btn-export-excel" class="btn btn-secondary" style="display:flex; align-items:center; gap:6px; font-weight:600; padding:9px 16px; background:#fff; border:1px solid #cbd5e1; color:#334155;">
          <span>📊</span> Export Excel
        </button>
        <button id="btn-new-expense" class="btn" style="background-color:#16a34a; color:#fff; display:flex; align-items:center; gap:6px; font-weight:600; padding:9px 18px; border-radius:var(--radius-md); border:none; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <span style="font-size:1.1rem; line-height:1;">+</span> Nouvelle Dépense
        </button>
      </div>
    </div>

    <!-- SOUS-ONGLETS COMMERCIAUX -->
    <div class="subnav-tabs" style="display:flex; gap:8px; margin-bottom:22px; border-bottom:1px solid var(--gray-200); padding-bottom:10px;">
      <button class="subnav-tab active" id="tab-btn-expenses" style="padding:8px 16px; border-radius:8px; border:none; font-weight:600; font-size:0.9rem; cursor:pointer; background:#e0f2fe; color:#0369a1;">
        💳 Dépenses & Achats
      </button>
      <button class="subnav-tab" id="tab-btn-sales" style="padding:8px 16px; border-radius:8px; border:none; font-weight:600; font-size:0.9rem; cursor:pointer; background:#f1f5f9; color:#475569;">
        📈 Ventes & Produits
      </button>
      <button class="subnav-tab" id="tab-btn-contacts" style="padding:8px 16px; border-radius:8px; border:none; font-weight:600; font-size:0.9rem; cursor:pointer; background:#f1f5f9; color:#475569;">
        👥 Fournisseurs & Clients
      </button>
    </div>

    <!-- SECTION 1 : DÉPENSES & ACHATS (ACTIF PAR DÉFAUT) -->
    <div id="section-expenses-view">
      <div class="card" style="border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid var(--gray-200); overflow:hidden;">
        <div class="table-responsive">
          <table class="table" id="table-expenses" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background-color:#f8fafc; border-bottom:1px solid #e2e8f0; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em; color:#64748b;">
                <th style="padding:12px 16px; text-align:left; font-weight:700;">DATE</th>
                <th style="padding:12px 16px; text-align:left; font-weight:700;">CATÉGORIE</th>
                <th style="padding:12px 16px; text-align:left; font-weight:700;">DESCRIPTION</th>
                <th style="padding:12px 16px; text-align:left; font-weight:700;">LOT</th>
                <th style="padding:12px 16px; text-align:left; font-weight:700;">FOURNISSEUR</th>
                <th style="padding:12px 16px; text-align:left; font-weight:700;">MODE</th>
                <th style="padding:12px 16px; text-align:right; font-weight:700;">MONTANT</th>
                <th style="padding:12px 16px; text-align:center; font-weight:700;">ACTIONS</th>
              </tr>
            </thead>
            <tbody id="table-expenses-body">
              <tr><td colspan="8" style="text-align:center; padding:30px; color:var(--gray-500);">Chargement des dépenses...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- SECTION 2 : VENTES & PRODUITS -->
    <div id="section-sales-view" style="display:none;">
      <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
        <button id="btn-new-transaction" class="btn btn-primary">💰 Nouvelle Vente / Recette</button>
      </div>

      <!-- KPIS COMMERCIAUX VENTES & ACHATS -->
      <div class="kpi-grid">
        <div class="kpi-card" style="border-left: 4px solid var(--success-600);">
          <div class="kpi-icon-wrapper">📈</div>
          <div class="kpi-info">
            <div class="kpi-value" id="comm-kpi-sales">0 ${cur}</div>
            <div class="kpi-label">Chiffre d'Affaires Encaissé</div>
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid var(--danger-600);">
          <div class="kpi-icon-wrapper">🛒</div>
          <div class="kpi-info">
            <div class="kpi-value" id="comm-kpi-purchases">0 ${cur}</div>
            <div class="kpi-label">Dépenses & Achats Liés</div>
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
          <div class="kpi-icon-wrapper">⏳</div>
          <div class="kpi-info">
            <div class="kpi-value" id="comm-kpi-pending-in">0 ${cur}</div>
            <div class="kpi-label">Créances clients en attente</div>
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid var(--primary-600);">
          <div class="kpi-icon-wrapper">👥</div>
          <div class="kpi-info">
            <div class="kpi-value" id="comm-kpi-contacts">0</div>
            <div class="kpi-label">Contacts & Partenaires</div>
          </div>
        </div>
      </div>

      <!-- TABLE DES TRANSACTIONS -->
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="card-title">Registre des Ventes</h3>
          <span class="badge badge-green">Ventes & Facturation</span>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-responsive">
            <table class="table" id="table-transactions">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Produit</th>
                  <th>Description</th>
                  <th>Contact (Client)</th>
                  <th>Quantité</th>
                  <th>Montant Total</th>
                  <th>Statut Paiement</th>
                  <th>Règlement</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="9" style="text-align:center; padding:20px;">Chargement des transactions...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION 3 : FOURNISSEURS & CLIENTS -->
    <div id="section-contacts-view" style="display:none;">
      <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
        <button id="btn-new-contact" class="btn btn-secondary">👤 Nouveau Contact</button>
      </div>

      <!-- TABLE DES CONTACTS -->
      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="card-title">Répertoire des Clients & Fournisseurs</h3>
          <span class="badge badge-gray">Carnet d'adresses</span>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-responsive">
            <table class="table" id="table-contacts">
              <thead>
                <tr>
                  <th>Nom / Raison Sociale</th>
                  <th>Type</th>
                  <th>Téléphone</th>
                  <th>Email</th>
                  <th>Adresse</th>
                  <th>Conditions & Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="6" style="text-align:center; padding:20px;">Chargement des contacts...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // Gestion des sous-onglets
  const tabExpenses = document.getElementById('tab-btn-expenses');
  const tabSales = document.getElementById('tab-btn-sales');
  const tabContacts = document.getElementById('tab-btn-contacts');

  const secExpenses = document.getElementById('section-expenses-view');
  const secSales = document.getElementById('section-sales-view');
  const secContacts = document.getElementById('section-contacts-view');

  function selectTab(activeTab, activeSec) {
    [tabExpenses, tabSales, tabContacts].forEach(t => {
      if (t) {
        t.style.background = '#f1f5f9';
        t.style.color = '#475569';
      }
    });
    [secExpenses, secSales, secContacts].forEach(s => {
      if (s) s.style.display = 'none';
    });

    if (activeTab) {
      activeTab.style.background = '#e0f2fe';
      activeTab.style.color = '#0369a1';
    }
    if (activeSec) {
      activeSec.style.display = 'block';
    }
  }

  if (tabExpenses) tabExpenses.onclick = () => selectTab(tabExpenses, secExpenses);
  if (tabSales) {
    tabSales.onclick = () => {
      selectTab(tabSales, secSales);
      loadCommercialData();
    };
  }
  if (tabContacts) {
    tabContacts.onclick = () => {
      selectTab(tabContacts, secContacts);
      loadCommercialData();
    };
  }

  // Boutons d'action principaux
  const btnExport = document.getElementById('btn-export-excel');
  if (btnExport) {
    btnExport.onclick = () => {
      exportExpensesExcel(currentExpensesList, cur, State.currentFarm?.name);
    };
  }
  const btnNewExpense = document.getElementById('btn-new-expense');
  if (btnNewExpense) btnNewExpense.onclick = openExpenseModal;

  const btnNewContact = document.getElementById('btn-new-contact');
  if (btnNewContact) btnNewContact.onclick = openContactModal;

  const btnNewTx = document.getElementById('btn-new-transaction');
  if (btnNewTx) btnNewTx.onclick = openTransactionModal;

  // Charger les dépenses immédiatement
  await loadExpensesData();
  // Précharger également les données de vente et contact
  loadCommercialData();
}

async function loadCommercialData() {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  try {
    const txRes = (typeof API.getCommercialTransactions === 'function')
      ? await API.getCommercialTransactions(farmId)
      : (typeof API.getTransactions === 'function' ? await API.getTransactions(farmId) : { transactions: [] });
    const contactsRes = (typeof API.getContacts === 'function')
      ? await API.getContacts(farmId)
      : { contacts: [] };
    const cur = State.currentFarm?.currency || 'FCFA';

    const transactions = (txRes && txRes.transactions) || [];
    const contacts = (contactsRes && contactsRes.contacts) || [];

    // Calculs KPI
    const totalSalesPaid = transactions.filter(t => t.type === 'vente').reduce((s, t) => s + (t.paid_amount || 0), 0);
    const totalPurchasesPaid = transactions.filter(t => t.type === 'achat').reduce((s, t) => s + (t.paid_amount || 0), 0);
    const pendingSales = transactions.filter(t => t.type === 'vente' && t.payment_status !== 'paye')
      .reduce((s, t) => s + ((t.total_amount || 0) - (t.paid_amount || 0)), 0);

    safeSetText('comm-kpi-sales', `${totalSalesPaid.toLocaleString()} ${cur}`);
    safeSetText('comm-kpi-purchases', `${totalPurchasesPaid.toLocaleString()} ${cur}`);
    safeSetText('comm-kpi-pending-in', `${pendingSales.toLocaleString()} ${cur}`);
    safeSetText('comm-kpi-contacts', contacts.length.toLocaleString());

    // Remplir transactions
    const txTbody = document.querySelector('#table-transactions tbody');
    if (txTbody) {
      if (transactions.length === 0) {
        txTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--gray-500);">Aucune transaction commerciale enregistrée.</td></tr>`;
      } else {
        txTbody.innerHTML = transactions.map(t => {
          const isVente = t.type === 'vente';
          const typeBadge = isVente ? '<span class="badge badge-green">💰 Vente</span>' : '<span class="badge badge-blue">🛒 Achat</span>';

          let payBadge = '';
          if (t.payment_status === 'paye') payBadge = '<span class="badge badge-green">Payé</span>';
          else if (t.payment_status === 'partiel') payBadge = '<span class="badge badge-amber">Acompte / Partiel</span>';
          else payBadge = '<span class="badge badge-red">En attente (Dette)</span>';

          return `
            <tr>
              <td style="font-size:12.5px;">${escapeHtml(t.date)}</td>
              <td>${typeBadge}</td>
              <td><strong>${escapeHtml(t.product_type)}</strong></td>
              <td>${escapeHtml(t.description)}</td>
              <td>${t.contact_name ? `👤 ${escapeHtml(t.contact_name)}` : 'Client comptoir'}</td>
              <td style="font-weight:700;">${t.quantity} ${escapeHtml(t.unit || '')}</td>
              <td style="font-weight:800; color:${isVente ? 'var(--success-700)' : 'var(--danger-600)'};">${t.total_amount.toLocaleString()} ${cur}</td>
              <td>${payBadge}</td>
              <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(t.payment_method || 'Espèces')}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Remplir contacts
    const cTbody = document.querySelector('#table-contacts tbody');
    if (cTbody) {
      if (contacts.length === 0) {
        cTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--gray-500);">Aucun contact dans le carnet d'adresses.</td></tr>`;
      } else {
        cTbody.innerHTML = contacts.map(c => `
          <tr>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td><span class="badge badge-gray">${escapeHtml(c.type)}</span></td>
            <td>${escapeHtml(c.phone || '—')}</td>
            <td>${escapeHtml(c.email || '—')}</td>
            <td>${escapeHtml(c.address || '—')}</td>
            <td style="font-size:12px; color:var(--gray-600);">${escapeHtml(c.notes || '—')}</td>
          </tr>
        `).join('');
      }
    }

  } catch (err) {
    console.warn("loadCommercialData warning:", err);
  }
}
window.loadCommercialData = loadCommercialData;

async function openContactModal() {
  document.getElementById('form-contact').reset();
  openModal('modal-contact');
}

async function openTransactionModal() {
  const farmId = State.currentFarm.id;

  const contactSelect = document.getElementById('tx-contact-select');
  if (contactSelect) {
    try {
      const contactsRes = await API.getContacts(farmId);
      contactSelect.innerHTML = '<option value="">Client / Fournisseur comptoir (Sans compte)...</option>' +
        (contactsRes.contacts || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.type})</option>`).join('');
    } catch (_) {
      contactSelect.innerHTML = '<option value="">Client / Fournisseur comptoir (Sans compte)...</option>';
    }
  }

  const txDate = document.getElementById('tx-date');
  if (txDate) txDate.value = new Date().toISOString().split('T')[0];

  const qtyInput = document.getElementById('tx-qty');
  const unitPriceInput = document.getElementById('tx-unit-price');
  const totalAmountInput = document.getElementById('tx-total-amount');
  const paidAmountInput = document.getElementById('tx-paid-amount');

  function recalc() {
    if (!qtyInput || !unitPriceInput || !totalAmountInput) return;
    const q = parseFloat(qtyInput.value) || 0;
    const p = parseFloat(unitPriceInput.value) || 0;
    const tot = Math.round(q * p * 100) / 100;
    totalAmountInput.value = tot;
    if (paidAmountInput) paidAmountInput.value = tot;
  }
  if (qtyInput) qtyInput.oninput = recalc;
  if (unitPriceInput) unitPriceInput.oninput = recalc;

  openModal('modal-transaction');
}

// --------------------------------------------------------------------------
// 7. MODULE GESTION FINANCIÈRE & SOLDE DE GESTION
// --------------------------------------------------------------------------
let currentFinancePeriod = 'all';
let currentFinanceType = 'all';

async function renderFinanceView() {
  const content = document.getElementById('page-container');
  if (!State.currentFarm) {
    content.innerHTML = `<div class="card card-body"><p>Veuillez sélectionner une ferme.</p></div>`;
    return;
  }
  const farmId = State.currentFarm.id;
  const cur = State.currentFarm.currency || 'FCFA';

  content.innerHTML = `
    <!-- EN-TÊTE FINANCIER -->
    <div class="page-header" style="margin-bottom:22px; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
      <div>
        <h2 class="page-title" style="font-size:1.6rem; font-weight:800; color:#0f172a; margin-bottom:4px;">
          💰 Registre Financier & Solde de Gestion — ${escapeHtml(State.currentFarm.name)}
        </h2>
        <p class="page-subtitle" style="color:#64748b; font-size:0.92rem; margin:0;">
          Registre comptable de gestion interne : enregistrement manuel des revenus et dépenses, suivi du solde de gestion et analyse par atelier.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button id="btn-fin-add-revenue" class="btn" style="background:#16a34a; color:#fff; display:flex; align-items:center; gap:6px; font-weight:600; padding:10px 18px; border-radius:var(--radius-md); border:none; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <span style="font-size:1.15rem; line-height:1;">+</span> Enregistrer un Revenu
        </button>
        <button id="btn-fin-add-expense" class="btn" style="background:#dc2626; color:#fff; display:flex; align-items:center; gap:6px; font-weight:600; padding:10px 18px; border-radius:var(--radius-md); border:none; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <span style="font-size:1.15rem; line-height:1;">+</span> Enregistrer une Dépense
        </button>
      </div>
    </div>

    <!-- FILTRES DE PÉRIODE & TYPE -->
    <div class="card" style="margin-bottom:22px; padding:12px 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:0.85rem; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.04em;">Période :</span>
          <select id="fin-filter-period" class="form-control" style="width:auto; padding:6px 12px; font-weight:600; font-size:0.9rem; background:#fff;">
            <option value="all">Tout l'historique</option>
            <option value="this_month">Ce mois-ci</option>
            <option value="this_year">Cette année</option>
          </select>
        </div>
        <div style="font-size:0.85rem; color:#64748b; font-style:italic;">
          💡 Fonctionnement 100% hors-ligne — Données stockées localement en toute confidentialité
        </div>
      </div>
    </div>

    <!-- 4 GRANDS INDICATEURS CLÉS (KPIS) -->
    <div class="kpi-grid" style="margin-bottom:24px;">
      <!-- 1. TOTAL DES REVENUS ENREGISTRÉS -->
      <div class="kpi-card" style="border-left: 4px solid var(--success-600); background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div class="kpi-icon-wrapper" style="background:#dcfce7; color:#16a34a; font-size:1.4rem;">📈</div>
        <div class="kpi-info">
          <div class="kpi-value" id="fin-kpi-rev" style="color:#16a34a; font-weight:800; font-size:1.45rem;">...</div>
          <div class="kpi-label" style="font-weight:700; color:#1e293b;">Total des Revenus Enregistrés</div>
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Ventes d'animaux, œufs, lait & produits</div>
        </div>
      </div>

      <!-- 2. TOTAL DES DÉPENSES ENREGISTRÉES -->
      <div class="kpi-card" style="border-left: 4px solid var(--danger-600); background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div class="kpi-icon-wrapper" style="background:#fee2e2; color:#dc2626; font-size:1.4rem;">📉</div>
        <div class="kpi-info">
          <div class="kpi-value" id="fin-kpi-exp" style="color:#dc2626; font-weight:800; font-size:1.45rem;">...</div>
          <div class="kpi-label" style="font-weight:700; color:#1e293b;">Total des Dépenses Enregistrées</div>
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Aliments, santé, cheptel & charges</div>
        </div>
      </div>

      <!-- 3. SOLDE DE GESTION (CALCUL AUTOMATIQUE OBLIGATOIRE) -->
      <div class="kpi-card" id="fin-card-balance" style="border-left: 4px solid #2563eb; background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div class="kpi-icon-wrapper" style="background:#dbeafe; color:#2563eb; font-size:1.4rem;">⚖️</div>
        <div class="kpi-info">
          <div class="kpi-value" id="fin-kpi-balance" style="font-weight:800; font-size:1.45rem;">...</div>
          <div class="kpi-label" style="font-weight:700; color:#1e293b;">Solde de Gestion</div>
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px; font-weight:500;">
            Solde = Revenus − Dépenses
          </div>
          <div style="font-size:0.72rem; color:#94a3b8; font-style:italic; margin-top:3px; line-height:1.25;">
            Indicateur de gestion interne (ne constitue pas un solde bancaire réel)
          </div>
        </div>
      </div>

      <!-- 4. NOMBRE D'OPÉRATIONS ENREGISTRÉES -->
      <div class="kpi-card" style="border-left: 4px solid #8b5cf6; background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div class="kpi-icon-wrapper" style="background:#f3e8ff; color:#7c3aed; font-size:1.4rem;">📑</div>
        <div class="kpi-info">
          <div class="kpi-value" id="fin-kpi-count" style="color:#7c3aed; font-weight:800; font-size:1.45rem;">...</div>
          <div class="kpi-label" style="font-weight:700; color:#1e293b;">Écritures Enregistrées</div>
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;" id="fin-kpi-split">...</div>
        </div>
      </div>
    </div>

    <!-- REVENUS ET DÉPENSES PAR CATÉGORIE -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap:22px; margin-bottom:24px;">
      <!-- REVENUS PAR CATÉGORIE -->
      <div class="card" style="border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
        <div class="card-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <h3 class="card-title" style="font-size:1rem; font-weight:700; color:#0f172a; margin:0;">📈 Revenus par Catégorie</h3>
          <span class="badge badge-green" style="font-size:0.75rem;">Recettes</span>
        </div>
        <div class="card-body" id="fin-container-rev-categories" style="padding:16px;">
          <div style="text-align:center; color:#64748b; padding:20px;">Chargement des catégories de revenus...</div>
        </div>
      </div>

      <!-- DÉPENSES PAR CATÉGORIE -->
      <div class="card" style="border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
        <div class="card-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <h3 class="card-title" style="font-size:1rem; font-weight:700; color:#0f172a; margin:0;">📉 Dépenses par Catégorie</h3>
          <span class="badge badge-red" style="font-size:0.75rem;">Charges</span>
        </div>
        <div class="card-body" id="fin-container-exp-categories" style="padding:16px;">
          <div style="text-align:center; color:#64748b; padding:20px;">Chargement des catégories de dépenses...</div>
        </div>
      </div>
    </div>

    <!-- RÉSULTAT PAR PÉRIODE & ÉVOLUTION -->
    <div class="card" style="border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; margin-bottom:24px;">
      <div class="card-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 class="card-title" style="font-size:1rem; font-weight:700; color:#0f172a; margin:0;">📅 Résultat par Période & Évolution</h3>
          <div style="font-size:0.8rem; color:#64748b;">Synthèse chronologique des revenus, dépenses et soldes mensuels</div>
        </div>
        <span class="badge badge-blue">Évolution</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-fin-periods" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.04em; color:#64748b;">
                <th style="padding:10px 16px; text-align:left;">Période</th>
                <th style="padding:10px 16px; text-align:right;">Revenus Enregistrés</th>
                <th style="padding:10px 16px; text-align:right;">Dépenses Enregistrées</th>
                <th style="padding:10px 16px; text-align:right;">Solde de Gestion</th>
                <th style="padding:10px 16px; text-align:center;">Tendance</th>
              </tr>
            </thead>
            <tbody id="table-fin-periods-body">
              <tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">Chargement des périodes...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- RÉSULTAT PAR ESPÈCE OU PAR LOT -->
    <div class="card" style="border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; margin-bottom:24px;">
      <div class="card-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 class="card-title" style="font-size:1rem; font-weight:700; color:#0f172a; margin:0;">🐾 Résultat par Espèce Animale & Lot</h3>
          <div style="font-size:0.8rem; color:#64748b;">Comptabilité analytique par atelier de production</div>
        </div>
        <span class="badge badge-purple">Rentabilité par atelier</span>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-fin-species-body" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.04em; color:#64748b;">
                <th style="padding:10px 16px; text-align:left;">Espèce / Atelier</th>
                <th style="padding:10px 16px; text-align:center;">Effectif Vivant</th>
                <th style="padding:10px 16px; text-align:right;">Revenus Générés</th>
                <th style="padding:10px 16px; text-align:right;">Dépenses Imputées</th>
                <th style="padding:10px 16px; text-align:right;">Solde Net d'Exploitation</th>
                <th style="padding:10px 16px; text-align:right;">Coût / Tête</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Chargement des données par espèce...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- GRAND LIVRE DES ÉCRITURES (REGISTRE COMPTABLE) -->
    <div class="card" style="border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
      <div class="card-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h3 class="card-title" style="font-size:1rem; font-weight:700; color:#0f172a; margin:0;">📖 Registre Comptable Complet (Grand Livre)</h3>
          <div style="font-size:0.8rem; color:#64748b;">Toutes les opérations enregistrées manuellement pour cette ferme</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-sm" id="btn-filter-all" style="padding:4px 12px; border-radius:6px; border:1px solid #cbd5e1; background:#0284c7; color:#fff; font-weight:600; cursor:pointer;">Tous</button>
          <button class="btn btn-sm" id="btn-filter-rev" style="padding:4px 12px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; color:#475569; font-weight:600; cursor:pointer;">Revenus</button>
          <button class="btn btn-sm" id="btn-filter-exp" style="padding:4px 12px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; color:#475569; font-weight:600; cursor:pointer;">Dépenses</button>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-responsive">
          <table class="table" id="table-financial-records" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.04em; color:#64748b;">
                <th style="padding:10px 16px; text-align:left;">Date</th>
                <th style="padding:10px 16px; text-align:left;">Type</th>
                <th style="padding:10px 16px; text-align:left;">Catégorie</th>
                <th style="padding:10px 16px; text-align:left;">Description / Libellé</th>
                <th style="padding:10px 16px; text-align:left;">Espèce / Lot</th>
                <th style="padding:10px 16px; text-align:left;">Client / Fournisseur</th>
                <th style="padding:10px 16px; text-align:left;">Règlement</th>
                <th style="padding:10px 16px; text-align:right;">Montant</th>
                <th style="padding:10px 16px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="9" style="text-align:center; padding:24px; color:#64748b;">Chargement des écritures...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Écouteurs des boutons d'ajout
  document.getElementById('btn-fin-add-revenue').onclick = openRevenueModal;
  document.getElementById('btn-fin-add-expense').onclick = openExpenseModal;

  // Filtrage période
  const periodSel = document.getElementById('fin-filter-period');
  if (periodSel) {
    periodSel.value = currentFinancePeriod;
    periodSel.onchange = async () => {
      currentFinancePeriod = periodSel.value;
      await loadFinanceData();
    };
  }

  // Filtrage type d'écriture
  const btnAll = document.getElementById('btn-filter-all');
  const btnRev = document.getElementById('btn-filter-rev');
  const btnExp = document.getElementById('btn-filter-exp');

  function updateTypeFilterButtons(activeBtn) {
    [btnAll, btnRev, btnExp].forEach(b => {
      if (!b) return;
      b.style.background = '#fff';
      b.style.color = '#475569';
    });
    if (activeBtn) {
      activeBtn.style.background = '#0284c7';
      activeBtn.style.color = '#fff';
    }
  }

  if (btnAll) {
    btnAll.onclick = () => {
      currentFinanceType = 'all';
      updateTypeFilterButtons(btnAll);
      filterFinanceTable();
    };
  }
  if (btnRev) {
    btnRev.onclick = () => {
      currentFinanceType = 'recette';
      updateTypeFilterButtons(btnRev);
      filterFinanceTable();
    };
  }
  if (btnExp) {
    btnExp.onclick = () => {
      currentFinanceType = 'depense';
      updateTypeFilterButtons(btnExp);
      filterFinanceTable();
    };
  }

  await loadFinanceData();
}

let allFinanceRecordsCache = [];

function filterFinanceTable() {
  const tbody = document.querySelector('#table-financial-records tbody');
  if (!tbody) return;
  const cur = State.currentFarm?.currency || 'FCFA';

  let list = allFinanceRecordsCache;
  if (currentFinanceType !== 'all') {
    list = list.filter(r => r.type === currentFinanceType);
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748b;">Aucune écriture comptable correspondant au filtre.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(r => {
    const isRecette = r.type === 'recette';
    const typeBadge = isRecette
      ? '<span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:9999px; font-weight:700; font-size:0.78rem;">📈 Revenu</span>'
      : '<span style="background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:9999px; font-weight:700; font-size:0.78rem;">📉 Dépense</span>';
    const sign = isRecette ? '+' : '-';
    const color = isRecette ? '#16a34a' : '#dc2626';

    const catLabels = {
      'vente_animaux': "Vente d'animaux",
      'vente_oeufs': "Vente d'œufs",
      'vente_lait': "Vente de lait",
      'autre_produit': "Vente d'autres produits",
      'autre_revenu': "Autre revenu"
    };
    const catDisplay = catLabels[r.category] || r.category || (isRecette ? 'Revenu' : 'Dépense');
    const desc = r.description || r.title || '—';
    const thirdParty = r.client_name ? `👤 ${escapeHtml(r.client_name)}` : (r.supplier ? `🏢 ${escapeHtml(r.supplier)}` : '—');
    const entity = r.species_name ? escapeHtml(r.species_name) : (r.lot_name ? `Lot ${escapeHtml(r.lot_name)}` : 'Exploitation');

    return `
      <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s ease;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
        <td style="padding:12px 16px; font-size:0.88rem; color:#334155; white-space:nowrap;">${formatDateFR(r.date)}</td>
        <td style="padding:12px 16px;">${typeBadge}</td>
        <td style="padding:12px 16px;"><span class="badge badge-gray" style="font-size:0.8rem;">${escapeHtml(catDisplay)}</span></td>
        <td style="padding:12px 16px; font-weight:500; color:#0f172a; max-width:260px;">${escapeHtml(desc)}</td>
        <td style="padding:12px 16px; font-size:0.88rem; color:#475569;">${entity}</td>
        <td style="padding:12px 16px; font-size:0.88rem; color:#475569;">${thirdParty}</td>
        <td style="padding:12px 16px; font-size:0.85rem; color:#64748b;">${escapeHtml(r.payment_method || 'Espèces')}</td>
        <td style="padding:12px 16px; text-align:right; font-weight:800; font-size:0.95rem; color:${color}; white-space:nowrap;">
          ${sign}${Number(r.amount || 0).toLocaleString('fr-FR')} ${cur}
        </td>
        <td style="padding:12px 16px; text-align:center;">
          <button class="btn-delete-fin-record" data-id="${r.id}" title="Supprimer cette écriture" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:#ef4444; padding:4px 8px; border-radius:6px; transition:background 0.15s ease;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach delete handlers
  tbody.querySelectorAll('.btn-delete-fin-record').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (!confirm('Voulez-vous vraiment supprimer cette écriture comptable ?')) return;
      try {
        await API.deleteFinancialRecord(State.currentFarm.id, id);
        showToast('Écriture supprimée avec succès !');
        await loadFinanceData();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

async function loadFinanceData() {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;
  const cur = State.currentFarm?.currency || 'FCFA';

  try {
    const summary = await API.getFinancialSummary(farmId, { period: currentFinancePeriod });
    const recordsRes = await API.getFinancialRecords(farmId);

    const rev = summary.total_revenues || 0;
    const exp = summary.total_expenses || 0;
    // Solde de gestion = total des revenus enregistrés - total des dépenses enregistrées
    const solde = (typeof summary.solde_gestion === 'number') ? summary.solde_gestion : (rev - exp);

    // 1. Mise à jour des 4 KPIs
    const elRev = document.getElementById('fin-kpi-rev');
    if (elRev) elRev.textContent = `${rev.toLocaleString('fr-FR')} ${cur}`;

    const elExp = document.getElementById('fin-kpi-exp');
    if (elExp) elExp.textContent = `${exp.toLocaleString('fr-FR')} ${cur}`;

    const elBalance = document.getElementById('fin-kpi-balance');
    const cardBalance = document.getElementById('fin-card-balance');
    if (elBalance) {
      elBalance.textContent = `${solde >= 0 ? '+' : ''}${solde.toLocaleString('fr-FR')} ${cur}`;
      elBalance.style.color = solde >= 0 ? '#16a34a' : '#dc2626';
    }
    if (cardBalance) {
      cardBalance.style.borderLeftColor = solde >= 0 ? '#16a34a' : '#dc2626';
    }

    const records = recordsRes.records || [];
    allFinanceRecordsCache = records;

    const elCount = document.getElementById('fin-kpi-count');
    if (elCount) elCount.textContent = `${records.length} opérations`;

    const elSplit = document.getElementById('fin-kpi-split');
    if (elSplit) {
      const recCount = records.filter(r => r.type === 'recette').length;
      const expCount = records.filter(r => r.type === 'depense').length;
      elSplit.textContent = `${recCount} recettes • ${expCount} dépenses`;
    }

    // 2. Revenus par catégorie
    const revContainer = document.getElementById('fin-container-rev-categories');
    if (revContainer) {
      const revCategories = summary.revenues_by_category || [];
      if (revCategories.length === 0) {
        revContainer.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:24px 16px;">Aucun revenu enregistré. Cliquez sur « + Enregistrer un Revenu » pour comptabiliser une vente.</div>`;
      } else {
        revContainer.innerHTML = revCategories.map(cat => `
          <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.88rem;">
              <span style="font-weight:600; color:#334155;">${escapeHtml(cat.label)}</span>
              <span style="font-weight:700; color:#16a34a;">${cat.total_amount.toLocaleString('fr-FR')} ${cur} <span style="font-size:0.75rem; color:#64748b;">(${cat.percentage}%)</span></span>
            </div>
            <div style="width:100%; height:8px; background:#f1f5f9; border-radius:9999px; overflow:hidden;">
              <div style="width:${cat.percentage}%; height:100%; background:#16a34a; border-radius:9999px; transition:width 0.3s ease;"></div>
            </div>
          </div>
        `).join('');
      }
    }

    // 3. Dépenses par catégorie
    const expContainer = document.getElementById('fin-container-exp-categories');
    if (expContainer) {
      const expCategories = summary.expenses_by_category || [];
      if (expCategories.length === 0) {
        expContainer.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:24px 16px;">Aucune dépense enregistrée. Cliquez sur « + Enregistrer une Dépense » pour ajouter une charge.</div>`;
      } else {
        expContainer.innerHTML = expCategories.map(cat => `
          <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.88rem;">
              <span style="font-weight:600; color:#334155;">${escapeHtml(cat.label)}</span>
              <span style="font-weight:700; color:#dc2626;">${cat.total_amount.toLocaleString('fr-FR')} ${cur} <span style="font-size:0.75rem; color:#64748b;">(${cat.percentage}%)</span></span>
            </div>
            <div style="width:100%; height:8px; background:#f1f5f9; border-radius:9999px; overflow:hidden;">
              <div style="width:${cat.percentage}%; height:100%; background:#dc2626; border-radius:9999px; transition:width 0.3s ease;"></div>
            </div>
          </div>
        `).join('');
      }
    }

    // 4. Évolution des revenus et des dépenses (par période)
    const periodTbody = document.getElementById('table-fin-periods-body');
    if (periodTbody) {
      const evolution = summary.evolution_by_month || [];
      if (evolution.length === 0) {
        periodTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px;">Aucun historique de période disponible.</td></tr>`;
      } else {
        periodTbody.innerHTML = evolution.map(p => {
          const bal = p.balance || 0;
          const isPos = bal >= 0;
          const balColor = isPos ? '#16a34a' : '#dc2626';
          const trendBadge = isPos
            ? '<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:9999px; font-weight:700; font-size:0.75rem;">Excédent</span>'
            : '<span style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:9999px; font-weight:700; font-size:0.75rem;">Déficit</span>';

          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:12px 16px; font-weight:600; color:#0f172a;">${escapeHtml(p.label)}</td>
              <td style="padding:12px 16px; text-align:right; font-weight:700; color:#16a34a;">+${(p.revenues || 0).toLocaleString('fr-FR')} ${cur}</td>
              <td style="padding:12px 16px; text-align:right; font-weight:700; color:#dc2626;">-${(p.expenses || 0).toLocaleString('fr-FR')} ${cur}</td>
              <td style="padding:12px 16px; text-align:right; font-weight:800; color:${balColor};">
                ${isPos ? '+' : ''}${bal.toLocaleString('fr-FR')} ${cur}
              </td>
              <td style="padding:12px 16px; text-align:center;">${trendBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // 5. Résultat par espèce animale
    const speciesTbody = document.querySelector('#table-fin-species-body tbody');
    if (speciesTbody) {
      const spBreakdown = summary.result_by_species || [];
      if (spBreakdown.length === 0) {
        speciesTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Aucune imputation spécifique par espèce.</td></tr>`;
      } else {
        speciesTbody.innerHTML = spBreakdown.map(s => {
          const bal = s.balance || 0;
          const isPos = bal >= 0;
          const balColor = isPos ? '#16a34a' : '#dc2626';
          const perHead = s.cost_per_head || 0;

          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:12px 16px;">${s.species_icon || '🐾'} <strong>${escapeHtml(s.species_name)}</strong></td>
              <td style="padding:12px 16px; text-align:center;"><span class="badge badge-gray">${s.live_count || 0} têtes</span></td>
              <td style="padding:12px 16px; text-align:right; font-weight:700; color:#16a34a;">+${(s.revenues || 0).toLocaleString('fr-FR')} ${cur}</td>
              <td style="padding:12px 16px; text-align:right; font-weight:700; color:#dc2626;">-${(s.expenses || 0).toLocaleString('fr-FR')} ${cur}</td>
              <td style="padding:12px 16px; text-align:right; font-weight:800; color:${balColor};">${isPos ? '+' : ''}${bal.toLocaleString('fr-FR')} ${cur}</td>
              <td style="padding:12px 16px; text-align:right; font-weight:600; color:#0369a1;">${perHead > 0 ? perHead.toLocaleString('fr-FR') + ' ' + cur : '—'}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // 6. Remplir le Grand Livre
    filterFinanceTable();

  } catch (err) {
    console.warn("loadFinanceData warning:", err);
  }
}
window.loadFinanceData = loadFinanceData;

async function openFinancialRecordModal() {
  if (!State.currentFarm) return;
  const farmId = State.currentFarm.id;

  const spSelect = document.getElementById('fin-species-select');
  if (spSelect) {
    try {
      const speciesRes = await API.getSpecies(farmId);
      spSelect.innerHTML = '<option value="">Ferme globale (sans imputation espèce)...</option>' +
        (speciesRes.species || []).filter(s => s.is_active).map(s => `<option value="${s.id}">${s.icon} ${escapeHtml(s.name)}</option>`).join('');
    } catch (_) {
      spSelect.innerHTML = '<option value="">Ferme globale</option>';
    }
  }

  const lotSelect = document.getElementById('fin-lot-select');
  if (lotSelect) {
    try {
      const lotsRes = await API.getLots(farmId);
      lotSelect.innerHTML = '<option value="">Aucun lot particulier...</option>' +
        (lotsRes.lots || []).map(l => `<option value="${l.id}">🛖 ${escapeHtml(l.name)}</option>`).join('');
    } catch (_) {
      lotSelect.innerHTML = '<option value="">Aucun lot particulier</option>';
    }
  }

  const finDate = document.getElementById('fin-date');
  if (finDate) finDate.value = new Date().toISOString().split('T')[0];

  openModal('modal-financial-record');
}
window.openFinancialRecordModal = openFinancialRecordModal;

// --------------------------------------------------------------------------
// 8. ÉCOUTEURS DES FORMULAIRES V2
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setupV2FormListeners();
});

function setupV2FormListeners() {
  // 1. Bouton cloche notifications
  const btnNotifs = document.getElementById('btn-notifications-toggle');
  if (btnNotifs) {
    btnNotifs.addEventListener('click', openNotificationsModal);
  }

  // 2. Formulaire Reproduction
  const formRepro = document.getElementById('form-reproduction');
  if (formRepro) {
    formRepro.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        species_id: document.getElementById('repro-species-select').value,
        type: document.getElementById('repro-type-select').value,
        female_id: document.getElementById('repro-female-select').value || null,
        male_id: document.getElementById('repro-male-select').value || null,
        male_name: document.getElementById('repro-male-name').value || null,
        service_date: document.getElementById('repro-date-input').value,
        gestation_days: parseInt(document.getElementById('repro-days-input').value, 10) || 150,
        target_lot_id: document.getElementById('repro-target-lot').value || null,
        notes: document.getElementById('repro-notes-input').value || null
      };

      try {
        const res = await API.createReproduction(farmId, payload);
        showToast(res.message);
        closeModal('modal-reproduction');
        formRepro.reset();
        renderReproductionView();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 3. Formulaire Confirmation Mise Bas
  const formBirth = document.getElementById('form-confirm-birth');
  if (formBirth) {
    formBirth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const reproId = document.getElementById('birth-repro-id').value;
      const payload = {
        actual_birth_date: document.getElementById('birth-date-input').value,
        live_count: parseInt(document.getElementById('birth-live-qty').value, 10) || 0,
        males_count: parseInt(document.getElementById('birth-males').value, 10) || 0,
        females_count: parseInt(document.getElementById('birth-females').value, 10) || 0,
        stillborn_count: parseInt(document.getElementById('birth-stillborn').value, 10) || 0,
        target_lot_id: document.getElementById('birth-target-lot').value || null,
        breed: document.getElementById('birth-breed').value || null,
        notes: document.getElementById('birth-obs').value || null
      };

      try {
        const res = await API.confirmBirth(farmId, reproId, payload);
        showToast(res.message);
        closeModal('modal-confirm-birth');
        formBirth.reset();
        renderReproductionView();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 4. Formulaire Ramassage Œufs
  const formEgg = document.getElementById('form-egg-collection');
  if (formEgg) {
    formEgg.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        date: document.getElementById('egg-date-input').value,
        species_id: document.getElementById('egg-species-select').value,
        lot_id: document.getElementById('egg-lot-select').value || null,
        eggs_laid: parseInt(document.getElementById('egg-laid-input').value, 10) || 0,
        eggs_broken: parseInt(document.getElementById('egg-broken-input').value, 10) || 0,
        eggs_sold: parseInt(document.getElementById('egg-sold-input').value, 10) || 0,
        eggs_incubated: parseInt(document.getElementById('egg-incubated-input').value, 10) || 0,
        eggs_consumed: parseInt(document.getElementById('egg-consumed-input').value, 10) || 0,
        notes: document.getElementById('egg-notes-input').value || null
      };

      try {
        const res = await API.createEggCollection(farmId, payload);
        showToast(res.message);
        closeModal('modal-egg-collection');
        formEgg.reset();
        renderEggsView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 5. Formulaire Lancer / Modifier Incubation
  const formInc = document.getElementById('form-incubation');
  if (formInc) {
    formInc.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const incId = document.getElementById('inc-id')?.value;
      const payload = {
        code: document.getElementById('inc-code-input').value || null,
        species_id: document.getElementById('inc-species-select').value,
        method: document.getElementById('inc-method-select').value,
        incubator_type: document.getElementById('inc-incubator-type')?.value || null,
        eggs_count: parseInt(document.getElementById('inc-eggs-count').value, 10) || 0,
        start_date: document.getElementById('inc-start-date').value,
        duration_days: parseInt(document.getElementById('inc-duration-days').value, 10) || 21,
        expected_hatch_date: document.getElementById('inc-expected-hatch-date')?.value || null,
        target_lot_id: document.getElementById('inc-target-lot').value || null,
        notes: document.getElementById('inc-notes').value || null
      };

      try {
        let res;
        if (incId) {
          res = await API.updateIncubation(farmId, incId, payload);
        } else {
          res = await API.createIncubation(farmId, payload);
        }
        showToast(res.message);
        closeModal('modal-incubation');
        formInc.reset();
        if (typeof refreshDashboardData === 'function') {
          refreshDashboardData();
        }
        if (document.getElementById('table-incubations')) {
          renderEggsView();
        }
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 6. Formulaire Valider / Enregistrer Éclosion
  const formHatch = document.getElementById('form-validate-hatch');
  if (formHatch) {
    formHatch.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const incId = document.getElementById('hatch-inc-id').value;

      const live = parseInt(document.getElementById('hatch-live-count').value, 10) || 0;
      const dead = parseInt(document.getElementById('hatch-dead-count')?.value, 10) || 0;
      let hatched = parseInt(document.getElementById('hatch-hatched-count')?.value, 10);
      if (isNaN(hatched)) hatched = live + dead;

      const payload = {
        actual_hatch_date: document.getElementById('hatch-date-input').value,
        hatched_count: hatched,
        live_young_count: live,
        dead_young_count: dead,
        unhatched_count: parseInt(document.getElementById('hatch-unhatched-count')?.value, 10) || 0,
        rejected_count: parseInt(document.getElementById('hatch-rejected-count')?.value, 10) || 0,
        create_animal_lot: document.getElementById('hatch-create-animal-lot') ? document.getElementById('hatch-create-animal-lot').checked : true,
        target_lot_id: document.getElementById('hatch-target-lot')?.value || null,
        notes: document.getElementById('hatch-obs')?.value || null
      };

      try {
        const res = await API.validateHatch(farmId, incId, payload);
        showToast(`${res.message} (Taux d'éclosion : ${res.hatch_rate}%)`);
        closeModal('modal-validate-hatch');
        formHatch.reset();
        if (typeof refreshDashboardData === 'function') {
          refreshDashboardData();
        }
        if (document.getElementById('table-incubations')) {
          renderEggsView();
        }
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 7. Formulaire Soin Santé
  const formHealth = document.getElementById('form-health');
  if (formHealth) {
    formHealth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        date: document.getElementById('health-date').value,
        type: document.getElementById('health-type').value,
        species_id: document.getElementById('health-species-select').value,
        animal_id: document.getElementById('health-animal-select').value || null,
        lot_id: document.getElementById('health-lot-select').value || null,
        disease: document.getElementById('health-disease').value,
        treatment_name: document.getElementById('health-treatment').value,
        dosage: document.getElementById('health-dosage').value || null,
        veterinarian: document.getElementById('health-vet').value || null,
        cost: parseFloat(document.getElementById('health-cost').value) || 0,
        next_care_date: document.getElementById('health-next-date').value || null,
        notes: document.getElementById('health-notes').value || null
      };

      try {
        const res = await API.createHealthTreatment(farmId, payload);
        showToast(res.message);
        closeModal('modal-health');
        formHealth.reset();
        renderHealthView();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 8. Formulaire Création Aliment
  const formFeed = document.getElementById('form-feed');
  if (formFeed) {
    formFeed.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        name: document.getElementById('feed-name').value,
        category: document.getElementById('feed-category').value,
        unit: document.getElementById('feed-unit').value,
        species_id: document.getElementById('feed-species-select').value || null,
        target_category: document.getElementById('feed-target-cat').value || null,
        stock_quantity: parseFloat(document.getElementById('feed-stock').value) || 0,
        min_threshold: parseFloat(document.getElementById('feed-threshold').value) || 10,
        unit_price: parseFloat(document.getElementById('feed-price').value) || null,
        supplier: document.getElementById('feed-supplier').value || null,
        notes: document.getElementById('feed-notes').value || null
      };

      try {
        const res = await API.createFeed(farmId, payload);
        showToast(res.message);
        closeModal('modal-feed');
        formFeed.reset();
        renderFeedView();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 9. Formulaire Mouvement Aliment
  const formFeedLog = document.getElementById('form-feed-log');
  if (formFeedLog) {
    formFeedLog.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        date: document.getElementById('feed-log-date').value,
        type: document.getElementById('feed-log-type').value,
        feed_id: document.getElementById('feed-log-feed-select').value,
        quantity: parseFloat(document.getElementById('feed-log-qty').value) || 0,
        lot_id: document.getElementById('feed-log-lot-select').value || null,
        unit_price: parseFloat(document.getElementById('feed-log-unit-price').value) || null,
        total_cost: parseFloat(document.getElementById('feed-log-total-cost').value) || null,
        notes: document.getElementById('feed-log-notes').value || null
      };

      try {
        const res = await API.logFeedMovement(farmId, payload);
        showToast(res.message);
        closeModal('modal-feed-log');
        formFeedLog.reset();
        renderFeedView();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 10. Formulaire Entretien Bâtiment
  const formMaint = document.getElementById('form-building-maintenance');
  if (formMaint) {
    formMaint.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const lotId = document.getElementById('maint-lot-id').value;
      const payload = {
        date: document.getElementById('maint-date').value,
        type: document.getElementById('maint-type').value,
        description: document.getElementById('maint-desc').value,
        cost: parseFloat(document.getElementById('maint-cost').value) || 0,
        performed_by: document.getElementById('maint-performed-by').value || null,
        next_date: document.getElementById('maint-next-date').value || null
      };

      try {
        const res = await API.logBuildingMaintenance(farmId, lotId, payload);
        showToast(res.message);
        closeModal('modal-building-maintenance');
        formMaint.reset();
        renderBuildingsView();
        if (window.checkNotificationsBadge) checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 11. Formulaire Contact
  const formContact = document.getElementById('form-contact');
  if (formContact) {
    formContact.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        type: document.getElementById('contact-type').value,
        name: document.getElementById('contact-name').value,
        phone: document.getElementById('contact-phone').value || null,
        email: document.getElementById('contact-email').value || null,
        address: document.getElementById('contact-address').value || null,
        notes: document.getElementById('contact-notes').value || null
      };

      try {
        const res = await API.createContact(farmId, payload);
        showToast(res.message);
        closeModal('modal-contact');
        formContact.reset();
        renderCommercialView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 12. Formulaire Transaction Commerciale
  const formTx = document.getElementById('form-transaction');
  if (formTx) {
    formTx.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        type: document.getElementById('tx-type').value,
        product_type: document.getElementById('tx-product-type').value,
        date: document.getElementById('tx-date').value,
        contact_id: document.getElementById('tx-contact-select').value || null,
        description: document.getElementById('tx-desc').value,
        quantity: parseFloat(document.getElementById('tx-qty').value) || 1,
        unit: document.getElementById('tx-unit').value,
        unit_price: parseFloat(document.getElementById('tx-unit-price').value) || 0,
        total_amount: parseFloat(document.getElementById('tx-total-amount').value) || 0,
        paid_amount: parseFloat(document.getElementById('tx-paid-amount').value) || 0,
        payment_method: document.getElementById('tx-payment-method').value,
        payment_status: document.getElementById('tx-payment-status').value
      };

      try {
        const res = await API.createCommercialTransaction(farmId, payload);
        showToast(res.message);
        closeModal('modal-transaction');
        formTx.reset();
        renderCommercialView();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 13. Formulaire Écriture Financière
  const formFin = document.getElementById('form-financial-record');
  if (formFin) {
    formFin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const payload = {
        type: document.getElementById('fin-type').value,
        category: document.getElementById('fin-category').value,
        date: document.getElementById('fin-date').value,
        amount: parseFloat(document.getElementById('fin-amount').value) || 0,
        title: document.getElementById('fin-title').value,
        species_id: document.getElementById('fin-species-select').value || null,
        lot_id: document.getElementById('fin-lot-select').value || null,
        payment_status: document.getElementById('fin-status').value
      };

      try {
        const res = await API.createFinancialRecord(farmId, payload);
        showToast(res.message);
        closeModal('modal-financial-record');
        formFin.reset();
        renderFinanceView();
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 14. Formulaire Enregistrer une Dépense (conforme capture d'écran)
  const formExpense = document.getElementById('form-expense');
  if (formExpense) {
    formExpense.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const lotVal = document.getElementById('expense-lot-select').value;
      const payload = {
        type: 'depense',
        category: document.getElementById('expense-category').value,
        date: document.getElementById('expense-date').value,
        amount: parseFloat(document.getElementById('expense-amount').value) || 0,
        lot_id: lotVal ? parseInt(lotVal, 10) : null,
        title: document.getElementById('expense-description').value,
        description: document.getElementById('expense-description').value,
        supplier: document.getElementById('expense-supplier').value || null,
        payment_method: document.getElementById('expense-payment-method').value,
        payment_status: 'paye'
      };

      try {
        const res = await API.createFinancialRecord(farmId, payload);
        showToast(res.message || 'Dépense enregistrée avec succès !');
        closeModal('modal-expense');
        formExpense.reset();
        if (State.activeView === 'finance') {
          await renderFinanceView();
        } else if (typeof window.loadExpensesData === 'function') {
          await window.loadExpensesData();
        }
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 15. Formulaire Enregistrer un Revenu (Comptabilité de gestion interne)
  const formRevenue = document.getElementById('form-revenue');
  if (formRevenue) {
    formRevenue.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmId = State.currentFarm.id;
      const spVal = document.getElementById('revenue-species-select').value;
      const lotVal = document.getElementById('revenue-lot-select').value;
      const payload = {
        type: 'recette',
        category: document.getElementById('revenue-category').value,
        date: document.getElementById('revenue-date').value,
        amount: parseFloat(document.getElementById('revenue-amount').value) || 0,
        currency: document.getElementById('revenue-currency').value || State.currentFarm?.currency || 'FCFA',
        description: document.getElementById('revenue-description').value,
        title: document.getElementById('revenue-description').value,
        client_name: document.getElementById('revenue-client').value || null,
        species_id: spVal || null,
        lot_id: lotVal ? parseInt(lotVal, 10) : null,
        payment_method: document.getElementById('revenue-payment-method').value,
        observations: document.getElementById('revenue-notes').value || null,
        payment_status: 'paye'
      };

      try {
        const res = await API.createFinancialRecord(farmId, payload);
        showToast(res.message || 'Revenu enregistré avec succès !');
        closeModal('modal-revenue');
        formRevenue.reset();
        if (State.activeView === 'finance') {
          await renderFinanceView();
        } else if (typeof window.loadCommercialData === 'function') {
          await window.loadCommercialData();
        }
        checkNotificationsBadge();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}
