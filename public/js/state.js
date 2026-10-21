// État central réactif de l'application
const State = {
  user: null,
  farms: [],
  currentFarm: null,
  species: [],
  categories: [],
  lots: [],
  animals: [],
  activeView: 'dashboard',
  dashboardFilters: {
    species_id: 'toutes',
    period: 'tous'
  },
  dashboardIncubationFilters: {
    species_id: 'toutes',
    status: 'en_cours'
  },
  charts: {
    speciesChart: null,
    genderChart: null,
    movementsChart: null
  },

  listeners: [],

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },

  notify(event, data) {
    for (const listener of this.listeners) {
      listener(event, data);
    }
  },

  setCurrentFarm(farm) {
    this.currentFarm = farm;
    if (farm) {
      API.setCurrentFarmId(farm.id);
    } else {
      API.setCurrentFarmId(null);
    }
    this.notify('farm:changed', farm);
  },

  setView(viewName) {
    this.activeView = viewName;
    this.notify('view:changed', viewName);
  },

  destroyCharts() {
    if (this.charts.speciesChart) {
      this.charts.speciesChart.destroy();
      this.charts.speciesChart = null;
    }
    if (this.charts.genderChart) {
      this.charts.genderChart.destroy();
      this.charts.genderChart = null;
    }
    if (this.charts.movementsChart) {
      this.charts.movementsChart.destroy();
      this.charts.movementsChart = null;
    }
  }
};
