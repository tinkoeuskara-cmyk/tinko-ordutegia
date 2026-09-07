// ============================================================
//  TINKO — ORDU-ERREGISTROA — App JS
//  Bertsioa 1.1 — Euskaraz
// ============================================================

const CFG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbznq2o9hnsJNpwNbXwiiQ2lTSU25TCzauyP6VBKXXO9nT3nl23r1SYhxu4ae4NPP6SvPw/exec',

  PERTSONAIAK: {
    inigo:  { izena: 'Iñigo' },
    nerea:  { izena: 'Nerea' },
    naia:   { izena: 'Naia' },
    jaione: { izena: 'Jaione' }
  },

  GERTAERA_MOTAK: {
    sarrera:          'Sarrera',
    atseden_hasiera:  'Atsedenaren hasiera',
    atseden_bukaera:  'Atsedenaren bukaera',
    irteera:          'Irteera'
  },

  KOKAPENEN_IZENAK: {
    etxea:   '🏠 Etxea',
    zinema:  '🎬 Zinema-aretoa',
    bulegoa: '🏢 Bulegoa'
  },

  LANALDIA_ORDUAK: {
    inigo:  8 * 0.60,
    nerea:  8 * 0.52,
    naia:   8 * 0.6494,
    jaione: 8 * 0.717
  }
};

let egoera = {
  pertsonaia: null,
  pin: null,
  kokapena: null,
  udalerria: null,
  lanaldia: {
    sarreraOrdua: null,
    atsedenean: false,
    atsedenaHasieratik: null,
    irteeraOrdua: null
  },
  gaurkoErregistroak: [],
  ezarpenak: {
    gogorarazpen_ordua: '09:00',
    udalerriak: []
  }
};

// ── BILTEGI LOKALA ────────────────────────────────────────────
const Biltegi = {
  gorde(giltza, balioa) {
    try { localStorage.setItem('tinko_' + giltza, JSON.stringify(balioa)); } catch(e) {}
  },
  irakurri(giltza, lehenetsia = null) {
    try {
      const b = localStorage.getItem('tinko_' + giltza);
      return b !== null ? JSON.parse(b) : lehenetsia;
    } catch(e) { return lehenetsia; }
  },
  ezabatu(giltza) {
    try { localStorage.removeItem('tinko_' + giltza); } catch(e) {}
  }
};

// ── LAGUNTZAILEAK ─────────────────────────────────────────────
function orduakOrain() {
  return new Date().toLocaleTimeString('eu-ES', { hour: '2-digit', minute: '2-digit' });
}

function dataGaur() {
  return new Date().toLocaleDateString('eu-ES', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

function iraupenaFormatatu(tik) {
  if (!tik) return '';
  const ms = Date.now() - new Date(tik).getTime();
  const o = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return o > 0 ? `${o}o ${m}min` : `${m} min`;
}

function toastErakutsi(testua, mota = 'ondo', iraupena = 2500) {
  const t = document.getElementById('toast');
  t.textContent = testua;
  t.className = `toast ikusgai ${mota}`;
  clearTimeout(toastErakutsi._tenporizadorea);
  toastErakutsi._tenporizadorea = setTimeout(() => {
    t.classList.remove('ikusgai');
  }, iraupena);
}

// ── API ───────────────────────────────────────────────────────
async function APIDeitu(datuak) {
  try {
    const params = new URLSearchParams({ payload: JSON.stringify(datuak) });
    const url = CFG.API_URL + '?' + params.toString();
    await fetch(url, { method: 'GET', mode: 'no-cors', redirect: 'follow' });
    return { ok: true };
  } catch (err) {
    const ilara = Biltegi.irakurri('ilara_offline', []);
    ilara.push({ ...datuak, _denbora_marka: Date.now() });
    Biltegi.gorde('ilara_offline', ilara);
    return { ondo: true, offline: true };
  }
}

async function sinkronizazioPendienteak() {
  const ilara = Biltegi.irakurri('ilara_offline', []);
  if (!ilara.length) return;
  const bidaliak = [];
  for (const elementua of ilara) {
    try {
      const e = await APIDeitu(elementua);
      if (e.ondo && !e.offline) bidaliak.push(elementua);
    } catch(err) {}
  }
  if (bidaliak.length) {
    const gelditzen = ilara.filter(i => !bidaliak.includes(i));
    Biltegi.gorde('ilara_offline', gelditzen);
    toastErakutsi(`${bidaliak.length} erregistro sinkronizatuta ✓`);
  }
}

// ── SAIO-HASIERA ──────────────────────────────────────────────
function loginHasieratu() {
  const saioGordea = Biltegi.irakurri('saioa');
  if (saioGordea) {
    egoera.pertsonaia = saioGordea.pertsonaia;
    egoera.pin = saioGordea.pin;
    appSartu();
    return;
  }

  document.querySelectorAll('.btn-pertsonaia').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-pertsonaia').forEach(b => b.classList.remove('aktibo'));
      btn.classList.add('aktibo');
      egoera.pertsonaia = btn.dataset.pertsonaia;
      document.getElementById('taldea-pin').style.display = 'block';
      document.getElementById('sarrera-pin').focus();
      const pinGordea = Biltegi.irakurri('pin_' + egoera.pertsonaia);
      document.getElementById('setup-esteka').style.display = pinGordea ? 'block' : 'none';
      btnSartuEguneratu();
    });
  });

  document.getElementById('sarrera-pin').addEventListener('input', btnSartuEguneratu);

  document.getElementById('btn-sartu').addEventListener('click', () => {
    const pin = document.getElementById('sarrera-pin').value;
    const pinGordea = Biltegi.irakurri('pin_' + egoera.pertsonaia);

    if (!pinGordea) {
      if (pin.length === 4) {
        Biltegi.gorde('pin_' + egoera.pertsonaia, pin);
        egoera.pin = pin;
        Biltegi.gorde('saioa', { pertsonaia: egoera.pertsonaia, pin });
        toastErakutsi('PIN gordea. Ongi etorri!', 'ondo');
        appSartu();
      } else {
        toastErakutsi('PINak 4 digitu behar ditu', 'errorea');
      }
    } else {
      if (pin === pinGordea) {
        egoera.pin = pin;
        Biltegi.gorde('saioa', { pertsonaia: egoera.pertsonaia, pin });
        appSartu();
      } else {
        toastErakutsi('PIN okerra', 'errorea');
        document.getElementById('sarrera-pin').value = '';
      }
    }
  });
}

function btnSartuEguneratu() {
  const pin = document.getElementById('sarrera-pin').value;
  const btn = document.getElementById('btn-sartu');
  btn.disabled = !(egoera.pertsonaia && pin.length === 4);
  const pinGordea = Biltegi.irakurri('pin_' + egoera.pertsonaia);
  btn.textContent = pinGordea ? 'Sartu' : 'PINa sortu eta sartu';
}

// ── APP SARTU ─────────────────────────────────────────────────
async function appSartu() {
  document.getElementById('pantaila-login').classList.remove('aktibo');
  document.getElementById('pantaila-nagusia').classList.add('aktibo');

  const p = CFG.PERTSONAIAK[egoera.pertsonaia];
  document.getElementById('goiburu-izena').textContent = p.izena;
  document.getElementById('goiburu-data').textContent = dataGaur();

  await ezarpenakKargatu();
  gaurkoEgoerraKargatu();
  historiaLaburraKargatu();
  asteLaburpenaKalkulatu();
  sinkronizazioPendienteak();

  setInterval(() => {
    document.getElementById('goiburu-data').textContent = dataGaur();
    iraupenaEguneratu();
  }, 10000);
}

// ── EZARPENAK ─────────────────────────────────────────────────
async function ezarpenakKargatu() {
  const lokalak = Biltegi.irakurri('ezarpenak_' + egoera.pertsonaia);
  if (lokalak) egoera.ezarpenak = lokalak;
  try {
    const e = await APIDeitu({ ekintza: 'obtener_config', persona: egoera.pertsonaia });
    if (e.ok) {
      egoera.ezarpenak = {
        gogorarazpen_ordua: e.hora_aviso || '09:00',
        udalerriak: e.municipios || []
      };
      Biltegi.gorde('ezarpenak_' + egoera.pertsonaia, egoera.ezarpenak);
    }
  } catch(err) {}
}

// ── GAURKO EGOERA ─────────────────────────────────────────────
function gaurkoEgoerraKargatu() {
  const gaur = new Date().toISOString().substring(0, 10);
  const gordeak = Biltegi.irakurri('erregistroak_' + egoera.pertsonaia + '_' + gaur, []);
  egoera.gaurkoErregistroak = gordeak;
  egoeraErrekonstritu();
}

function egoeraErrekonstritu() {
  egoera.lanaldia = { sarreraOrdua: null, atsedenean: false, atsedenaHasieratik: null, irteeraOrdua: null, lanaldiaBerriz: false };
  for (const e of egoera.gaurkoErregistroak) {
    if (e.mota === 'sarrera') {
      egoera.lanaldia.sarreraOrdua = e.denbora_marka;
      egoera.lanaldia.irteeraOrdua = null; // nueva sarrera reinicia el ciclo
      egoera.lanaldia.lanaldiaBerriz = false;
      egoera.kokapena = e.kokapena;
      egoera.udalerria = e.udalerria;
    } else if (e.mota === 'atseden_hasiera') {
      egoera.lanaldia.atsedenean = true;
      egoera.lanaldia.atsedenaHasieratik = e.denbora_marka;
    } else if (e.mota === 'atseden_bukaera') {
      egoera.lanaldia.atsedenean = false;
      egoera.lanaldia.atsedenaHasieratik = null;
    } else if (e.mota === 'irteera') {
      egoera.lanaldia.irteeraOrdua = e.denbora_marka;
      egoera.lanaldia.lanaldiaBerriz = false;
    }
  }
  UIEgoeraEguneratu();
}

function UIEgoeraEguneratu() {
  const etiketa  = document.getElementById('egoera-etiketa');
  const ordua    = document.getElementById('egoera-ordua');
  const kokapena = document.getElementById('egoera-kokapena');
  const iraupena = document.getElementById('egoera-iraupena');
  const l = egoera.lanaldia;

  if (l.irteeraOrdua && !l.lanaldiaBerriz) {
    etiketa.className = 'egoera-etiketa osatuta';
    etiketa.textContent = 'Lanaldia osatua';
    ordua.textContent = orduakOrain();
    kokapena.textContent = egoera.kokapena ? CFG.KOKAPENEN_IZENAK[egoera.kokapena] || '' : '';
    iraupena.textContent = '';
    botoi_guztiak_desgaitu();
    document.getElementById('btn-lanaldia-berriz').style.display = '';
    document.getElementById('btn-lanaldia-berriz').disabled = false;
  } else if (l.atsedenean) {
    document.getElementById('btn-lanaldia-berriz').style.display = 'none';
    etiketa.className = 'egoera-etiketa atsedena';
    etiketa.textContent = 'Atsedenean';
    ordua.textContent = orduakOrain();
    kokapena.textContent = egoera.kokapena ? CFG.KOKAPENEN_IZENAK[egoera.kokapena] || '' : '';
    iraupena.textContent = `Atsedena: ${iraupenaFormatatu(l.atsedenaHasieratik)}`;
    botoiaGaitu('btn-atseden-bukaera');
    document.getElementById('btn-atsedena').style.display = 'none';
    document.getElementById('btn-atseden-bukaera').style.display = '';
  } else if (l.sarreraOrdua) {
    document.getElementById('btn-lanaldia-berriz').style.display = 'none';
    etiketa.className = 'egoera-etiketa aktibo';
    etiketa.textContent = 'Lanean';
    ordua.textContent = orduakOrain();
    kokapena.textContent = egoera.kokapena ? CFG.KOKAPENEN_IZENAK[egoera.kokapena] || '' : '';
    iraupena.textContent = `Lanean: ${iraupenaFormatatu(l.sarreraOrdua)}`;
    botoiaGaitu('btn-atsedena');
    botoiaGaitu('btn-irteera');
    document.getElementById('btn-atsedena').style.display = '';
    document.getElementById('btn-atseden-bukaera').style.display = 'none';
  } else {
    document.getElementById('btn-lanaldia-berriz').style.display = 'none';
    etiketa.className = 'egoera-etiketa';
    etiketa.textContent = 'Erregistratu gabe';
    ordua.textContent = orduakOrain();
    kokapena.textContent = '';
    iraupena.textContent = '';
  }
}

function iraupenaEguneratu() { UIEgoeraEguneratu(); }

function botoi_guztiak_desgaitu() {
  ['btn-sarrera','btn-atsedena','btn-atseden-bukaera','btn-irteera'].forEach(id => {
    const btn = document.getElementById(id);
    btn.classList.remove('gaituta');
    btn.disabled = true;
  });
}

function botoiaGaitu(id) {
  const btn = document.getElementById(id);
  btn.classList.add('gaituta');
  btn.disabled = false;
}

// ── ERREGISTROAK ──────────────────────────────────────────────
function ekintza_botoiak_hasieratu() {

  document.querySelectorAll('.btn-kokapena').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-kokapena').forEach(b => b.classList.remove('aktibo'));
      btn.classList.add('aktibo');
      egoera.kokapena = btn.dataset.kokapena;

      const taldeaZinema = document.getElementById('taldea-udalerria');
      if (egoera.kokapena === 'zinema') {
        taldeaZinema.style.display = 'block';
        document.getElementById('sarrera-udalerria').focus();
      } else {
        taldeaZinema.style.display = 'none';
        egoera.udalerria = null;
      }

      // Activar sarrera si no hay jornada activa (incluye tras lanaldia berriz hasi)
      if (!egoera.lanaldia.sarreraOrdua) botoiaGaitu('btn-sarrera');
    });
  });

  const sarreraUdalerria = document.getElementById('sarrera-udalerria');
  const iradokizunZerrenda = document.getElementById('udalerri-iradokizunak');

  sarreraUdalerria.addEventListener('input', () => {
    const testua = sarreraUdalerria.value.toLowerCase().trim();
    egoera.udalerria = sarreraUdalerria.value;
    if (!testua) { iradokizunZerrenda.classList.remove('ikusgai'); return; }
    const udalerriak = egoera.ezarpenak.udalerriak || [];
    const iradokizunak = udalerriak.filter(u => u.toLowerCase().includes(testua));
    if (iradokizunak.length) {
      iradokizunZerrenda.innerHTML = iradokizunak.map(u =>
        `<div class="iradokizun-elementua">${u}</div>`).join('');
      iradokizunZerrenda.classList.add('ikusgai');
      iradokizunZerrenda.querySelectorAll('.iradokizun-elementua').forEach(el => {
        el.addEventListener('click', () => {
          sarreraUdalerria.value = el.textContent;
          egoera.udalerria = el.textContent;
          iradokizunZerrenda.classList.remove('ikusgai');
        });
      });
    } else {
      iradokizunZerrenda.classList.remove('ikusgai');
    }
  });

  document.getElementById('btn-sarrera').addEventListener('click', async () => {
    if (!egoera.kokapena) { toastErakutsi('Hautatu non zauden lehenik', 'abisua'); return; }
    if (egoera.kokapena === 'zinema' && !egoera.udalerria) {
      toastErakutsi('Adierazi zein udalerrira zoazen', 'abisua'); return;
    }
    await gertaeraErregistratu('sarrera');
  });

  document.getElementById('btn-atsedena').addEventListener('click', async () => {
    await gertaeraErregistratu('atseden_hasiera');
  });

  document.getElementById('btn-atseden-bukaera').addEventListener('click', async () => {
    await gertaeraErregistratu('atseden_bukaera');
  });

  document.getElementById('btn-irteera').addEventListener('click', async () => {
    await gertaeraErregistratu('irteera');
  });

  document.getElementById('btn-lanaldia-berriz').addEventListener('click', () => {
    // Reiniciar estado para nuevo ciclo manteniendo historial del día
    egoera.lanaldia.irteeraOrdua = null;
    egoera.lanaldia.lanaldiaBerriz = true;
    egoera.lanaldia.sarreraOrdua = null;
    egoera.lanaldia.atsedenean = false;
    egoera.kokapena = null;
    egoera.udalerria = null;

    // Resetear selector de ubicación visualmente
    document.querySelectorAll('.btn-kokapena').forEach(b => b.classList.remove('aktibo'));
    document.getElementById('taldea-udalerria').style.display = 'none';
    document.getElementById('sarrera-udalerria').value = '';
    document.getElementById('btn-lanaldia-berriz').style.display = 'none';

    // Actualizar estado visual
    const etiketa = document.getElementById('egoera-etiketa');
    etiketa.className = 'egoera-etiketa';
    etiketa.textContent = 'Bigarren txanda - hautatu kokapena';
    document.getElementById('egoera-kokapena').textContent = '';
    document.getElementById('egoera-iraupena').textContent = '';
    document.getElementById('egoera-ordua').textContent = orduakOrain();

    // Desactivar todos menos sarrera (que se activará al elegir ubicación)
    botoi_guztiak_desgaitu();

    // Hacer scroll arriba para que vean el selector de ubicación
    document.getElementById('sekzioa-kokapena').scrollIntoView({ behavior: 'smooth' });
  });
}

async function gertaeraErregistratu(mota) {
  const orain = new Date();
  const iruzkina = document.getElementById('sarrera-iruzkina').value.trim();

  const datuakErregistroa = {
    ekintza:      'registrar',
    persona:      egoera.pertsonaia,
    tipo:         mota,
    ubicacion:    egoera.kokapena,
    municipio:    egoera.udalerria || null,
    comentario:   iruzkina || null,
    timestamp:    orain.toISOString(),
    mota, kokapena: egoera.kokapena, udalerria: egoera.udalerria,
    denbora_marka: orain.toISOString()
  };

  const gaur = orain.toISOString().substring(0, 10);
  const erregistroak = Biltegi.irakurri('erregistroak_' + egoera.pertsonaia + '_' + gaur, []);
  erregistroak.push(datuakErregistroa);
  Biltegi.gorde('erregistroak_' + egoera.pertsonaia + '_' + gaur, erregistroak);
  egoera.gaurkoErregistroak = erregistroak;

  if (mota === 'sarrera') egoera.lanaldia.sarreraOrdua = orain.toISOString();
  else if (mota === 'atseden_hasiera') { egoera.lanaldia.atsedenean = true; egoera.lanaldia.atsedenaHasieratik = orain.toISOString(); }
  else if (mota === 'atseden_bukaera') { egoera.lanaldia.atsedenean = false; egoera.lanaldia.atsedenaHasieratik = null; }
  else if (mota === 'irteera') egoera.lanaldia.irteeraOrdua = orain.toISOString();

  UIEgoeraEguneratu();
  historiaLaburraKargatu();
  document.getElementById('sarrera-iruzkina').value = '';

  const mezuak = {
    sarrera:         '✓ Sarrera erregistratua',
    atseden_hasiera: '⏸ Atsedena hasita',
    atseden_bukaera: '▶ Lanera itzuli zara',
    irteera:         '✓ Irteera erregistratua'
  };
  toastErakutsi(mezuak[mota] || 'Gordea');

  APIDeitu(datuakErregistroa).then(e => {
    if (e.offline) toastErakutsi('Konexiorik gabe gordea. Beranduago bidaliko da.', 'abisua', 3500);
  });
}

// ── HISTORIA ──────────────────────────────────────────────────
function historiaLaburraKargatu() {
  const edukiontzia = document.getElementById('historia-laburra');
  const gaur = new Date().toISOString().substring(0, 10);
  const erregistroak = Biltegi.irakurri('erregistroak_' + egoera.pertsonaia + '_' + gaur, []);

  if (!erregistroak.length) {
    edukiontzia.innerHTML = '<p class="daturik-ez">Gaur oraindik erregistrorik ez</p>';
    return;
  }

  const elementuak = [...erregistroak].reverse().slice(0, 5).map(e => {
    const ordua = new Date(e.denbora_marka).toLocaleTimeString('eu-ES', { hour: '2-digit', minute: '2-digit' });
    const kop = e.kokapena ? ` · ${CFG.KOKAPENEN_IZENAK[e.kokapena] || e.kokapena}` : '';
    const udal = e.udalerria ? ` · ${e.udalerria}` : '';
    const iruzk = e.iruzkina ? `<div class="hist-meta" style="margin-top:2px">"${e.iruzkina}"</div>` : '';
    return `
      <div class="historia-elementua">
        <div class="hist-puntua ${e.mota}"></div>
        <div class="hist-info">
          <div class="hist-mota">${CFG.GERTAERA_MOTAK[e.mota] || e.mota}</div>
          <div class="hist-meta">${kop}${udal}</div>
          ${iruzk}
        </div>
        <div class="hist-ordua">${ordua}</div>
      </div>`;
  }).join('');

  edukiontzia.innerHTML = elementuak;
}

// ── ASTE LABURPENA ─────────────────────────────────────────────
function asteLaburpenaKalkulatu() {
  const gaur = new Date();
  const astelehena = new Date(gaur);
  astelehena.setDate(gaur.getDate() - (gaur.getDay() === 0 ? 6 : gaur.getDay() - 1));

  let orduTotalak = 0;
  let lanEgunak = 0;

  for (let i = 0; i < 7; i++) {
    const e = new Date(astelehena);
    e.setDate(astelehena.getDate() + i);
    if (e > gaur) break;
    const giltza = e.toISOString().substring(0, 10);
    const erregistroak = Biltegi.irakurri('erregistroak_' + egoera.pertsonaia + '_' + giltza, []);
    const sarreraR = erregistroak.find(r => r.mota === 'sarrera');
    const irteeraR = erregistroak.find(r => r.mota === 'irteera');
    if (sarreraR && irteeraR) {
      const ms = new Date(irteeraR.denbora_marka) - new Date(sarreraR.denbora_marka);
      let atsMs = 0, atsHasiera = null;
      for (const r of erregistroak) {
        if (r.mota === 'atseden_hasiera') atsHasiera = new Date(r.denbora_marka);
        if (r.mota === 'atseden_bukaera' && atsHasiera) {
          atsMs += new Date(r.denbora_marka) - atsHasiera;
          atsHasiera = null;
        }
      }
      orduTotalak += (ms - atsMs) / 3600000;
      lanEgunak++;
    } else if (sarreraR) {
      lanEgunak++;
    }
  }

  const esperoTarteak = (CFG.LANALDIA_ORDUAK[egoera.pertsonaia] || 8) * lanEgunak;
  const balantzea = orduTotalak - esperoTarteak;
  const ikurra = balantzea >= 0 ? '+' : '';

  document.getElementById('aste-orduak').textContent = orduTotalak.toFixed(1) + 'o';
  document.getElementById('aste-egunak').textContent = lanEgunak;
  document.getElementById('aste-balantzea').textContent = ikurra + balantzea.toFixed(1) + 'o';
  document.getElementById('aste-balantzea').style.color =
    balantzea >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
}

// ── EZARPENAK ─────────────────────────────────────────────────
function ezarpenakHasieratu() {
  const btnEzarpenak  = document.getElementById('btn-ezarpenak');
  const panelEzarpen  = document.getElementById('panel-ezarpenak');
  const btnItxi       = document.getElementById('btn-ezarpenak-itxi');
  const overlay       = document.getElementById('overlay');

  btnEzarpenak.addEventListener('click', panelIreki);
  btnItxi.addEventListener('click', panelItxi);
  overlay.addEventListener('click', panelItxi);

  function panelIreki() {
    document.getElementById('ezarpen-gogorarazpen-ordua').value = egoera.ezarpenak.gogorarazpen_ordua || '09:00';
    udalerriakBistaratu();
    panelEzarpen.classList.add('irekita');
    overlay.classList.add('ikusgai');
  }

  function panelItxi() {
    panelEzarpen.classList.remove('irekita');
    overlay.classList.remove('ikusgai');
  }

  function udalerriakBistaratu() {
    const zerrenda = document.getElementById('udalerri-zerrenda');
    const udalerriak = egoera.ezarpenak.udalerriak || [];
    if (!udalerriak.length) {
      zerrenda.innerHTML = '<span style="font-size:12px;color:var(--c-text3)">Udalerririk ez gordeta</span>';
      return;
    }
    zerrenda.innerHTML = udalerriak.map((u, i) => `
      <div class="udalerri-etiketa">${u}
        <button onclick="udalerriEzabatu(${i})" aria-label="${u} ezabatu">✕</button>
      </div>`).join('');
  }

  window.udalerriEzabatu = function(idx) {
    egoera.ezarpenak.udalerriak.splice(idx, 1);
    udalerriakBistaratu();
  };

  document.getElementById('btn-udalerria-gehitu').addEventListener('click', () => {
    const sarrera = document.getElementById('udalerri-berria');
    const balioa = sarrera.value.trim();
    if (!balioa) return;
    if (!egoera.ezarpenak.udalerriak) egoera.ezarpenak.udalerriak = [];
    if (!egoera.ezarpenak.udalerriak.includes(balioa)) {
      egoera.ezarpenak.udalerriak.push(balioa);
      udalerriakBistaratu();
    }
    sarrera.value = '';
  });

  document.getElementById('btn-ezarpenak-gorde').addEventListener('click', async () => {
    egoera.ezarpenak.gogorarazpen_ordua = document.getElementById('ezarpen-gogorarazpen-ordua').value;
    Biltegi.gorde('ezarpenak_' + egoera.pertsonaia, egoera.ezarpenak);
    await APIDeitu({
      ekintza: 'guardar_config',
      persona: egoera.pertsonaia,
      hora_aviso: egoera.ezarpenak.gogorarazpen_ordua,
      municipios_frecuentes: egoera.ezarpenak.udalerriak
    });
    toastErakutsi('Ezarpenak gordeta ✓');
    panelItxi();
  });

  document.getElementById('btn-pin-aldatu').addEventListener('click', () => {
    const pinZaharra = document.getElementById('ezarpen-pin-zaharra').value;
    const pinBerria  = document.getElementById('ezarpen-pin-berria').value;
    const pinGordea  = Biltegi.irakurri('pin_' + egoera.pertsonaia);
    if (pinZaharra !== pinGordea) { toastErakutsi('PIN zaharra okerra', 'errorea'); return; }
    if (pinBerria.length !== 4)   { toastErakutsi('PIN berriak 4 digitu behar ditu', 'errorea'); return; }
    Biltegi.gorde('pin_' + egoera.pertsonaia, pinBerria);
    egoera.pin = pinBerria;
    Biltegi.gorde('saioa', { pertsonaia: egoera.pertsonaia, pin: pinBerria });
    toastErakutsi('PINa aldatua ✓');
    document.getElementById('ezarpen-pin-zaharra').value = '';
    document.getElementById('ezarpen-pin-berria').value = '';
  });

  document.getElementById('btn-saioa-itxi').addEventListener('click', () => {
    if (confirm('Saioa itxi nahi duzu?')) {
      Biltegi.ezabatu('saioa');
      egoera.pertsonaia = null;
      panelItxi();
      document.getElementById('pantaila-nagusia').classList.remove('aktibo');
      document.getElementById('pantaila-login').classList.add('aktibo');
      document.querySelectorAll('.btn-pertsonaia').forEach(b => b.classList.remove('aktibo'));
      document.getElementById('taldea-pin').style.display = 'none';
      document.getElementById('sarrera-pin').value = '';
    }
  });
}

// ── HISTORIA OSOA ──────────────────────────────────────────────
function historiaHasieratu() {
  document.getElementById('btn-dena-ikusi').addEventListener('click', () => {
    historiaOsoaErakutsi();
    document.getElementById('pantaila-nagusia').classList.remove('aktibo');
    document.getElementById('pantaila-historia').classList.add('aktibo');
  });
  document.getElementById('btn-historia-itzuli').addEventListener('click', () => {
    document.getElementById('pantaila-historia').classList.remove('aktibo');
    document.getElementById('pantaila-nagusia').classList.add('aktibo');
  });
}

function historiaOsoaErakutsi() {
  const erregistroakEgunez = {};
  for (let i = 0; i < 60; i++) {
    const e = new Date();
    e.setDate(e.getDate() - i);
    const giltza = e.toISOString().substring(0, 10);
    const erregistroak = Biltegi.irakurri('erregistroak_' + egoera.pertsonaia + '_' + giltza, []);
    if (erregistroak.length) erregistroakEgunez[giltza] = erregistroak;
  }

  const edukiontzia = document.getElementById('historia-osoa');
  if (!Object.keys(erregistroakEgunez).length) {
    edukiontzia.innerHTML = '<p class="daturik-ez">Lokalki gordeta erregistrorik ez</p>';
    return;
  }

  const html = Object.entries(erregistroakEgunez).sort(([a],[b]) => b.localeCompare(a)).map(([data, erregistroak]) => {
    const sarreraR = erregistroak.find(r => r.mota === 'sarrera');
    const irteeraR = erregistroak.find(r => r.mota === 'irteera');
    let orduakKatea = '';
    if (sarreraR && irteeraR) {
      const ms = new Date(irteeraR.denbora_marka) - new Date(sarreraR.denbora_marka);
      orduakKatea = (ms / 3600000).toFixed(1) + 'o';
    }
    const dataObj = new Date(data + 'T12:00:00');
    const dataTestua = dataObj.toLocaleDateString('eu-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const elementuak = erregistroak.map(e => {
      const ordua = new Date(e.denbora_marka).toLocaleTimeString('eu-ES', { hour: '2-digit', minute: '2-digit' });
      const kop = e.kokapena ? ` · ${CFG.KOKAPENEN_IZENAK[e.kokapena] || e.kokapena}` : '';
      const udal = e.udalerria ? ` · ${e.udalerria}` : '';
      const iruzk = e.iruzkina ? `<div class="hist-meta" style="margin-top:3px;font-style:italic">"${e.iruzkina}"</div>` : '';
      return `
        <div class="historia-elementua">
          <div class="hist-puntua ${e.mota}"></div>
          <div class="hist-info">
            <div class="hist-mota">${CFG.GERTAERA_MOTAK[e.mota] || e.mota}</div>
            <div class="hist-meta">${kop}${udal}</div>
            ${iruzk}
          </div>
          <div class="hist-ordua">${ordua}</div>
        </div>`;
    }).join('');
    return `
      <div class="hist-egun-taldea">
        <div class="hist-egun-titulua">
          <span>${dataTestua}</span>
          ${orduakKatea ? `<span class="hist-egun-orduak">${orduakKatea}</span>` : ''}
        </div>
        <div class="historia-zerrenda">${elementuak}</div>
      </div>`;
  }).join('');

  edukiontzia.innerHTML = html;
}

// ── JAKINARAZPENAK ─────────────────────────────────────────────
async function jakinarazpenak_baimendu() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { gogorarazpenak_programatu(); return; }
  if (Notification.permission !== 'denied') {
    const baimena = await Notification.requestPermission();
    if (baimena === 'granted') gogorarazpenak_programatu();
  }
}

function gogorarazpenak_programatu() {
  const ordua = egoera.ezarpenak.gogorarazpen_ordua || '09:00';
  const [o, m] = ordua.split(':').map(Number);
  const orain = new Date();
  const abisuaData = new Date();
  abisuaData.setHours(o, m, 0, 0);
  if (abisuaData <= orain) abisuaData.setDate(abisuaData.getDate() + 1);
  const msArt = abisuaData - orain;
  setTimeout(() => {
    const gaur = new Date().toISOString().substring(0, 10);
    const erregistroak = Biltegi.irakurri('erregistroak_' + egoera.pertsonaia + '_' + gaur, []);
    const badago = erregistroak.some(r => r.mota === 'sarrera');
    if (!badago) {
      new Notification('⏰ Sarrera erregistratu!', {
        body: 'Oraindik ez duzu gaur sarrera erregistratu.',
        icon: 'icons/icon-192.png'
      });
    }
    setTimeout(gogorarazpenak_programatu, 24 * 3600 * 1000);
  }, msArt);
}

// Service Worker desactivado para evitar problemas de caché

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loginHasieratu();
  ekintza_botoiak_hasieratu();
  ezarpenakHasieratu();
  historiaHasieratu();
  jakinarazpenak_baimendu();
  setInterval(iraupenaEguneratu, 10000);
});
