// ============================================================
//  ORDU-ERREGISTROA — Google Apps Script
//  Tinko Euskara Elkartea — Bertsioa 1.2
// ============================================================

const CONFIG = {
  SHEET_ID: '1f2JRirWlecZqQodpBOtIaElwxhv8p2iYp6RehssHeOo',

  EMAILS: {
    'inigo':   'inigo@tinkoeuskara.eus',
    'nerea':   'nerea@tinkoeuskara.eus',
    'naia':    'naia@tinkoeuskara.eus',
    'jaione':  'jaione@tinkoeuskara.eus'
  },

  EMAIL_ADMIN: 'inigo@tinkoeuskara.eus',

  LANALDIA_ORDUAK: {
    'inigo':  8 * 0.60,
    'nerea':  8 * 0.52,
    'naia':   8 * 0.6494,
    'jaione': 8 * 0.717
  },

  ABISU_ORDUA_LEHENETSIA: '09:00',
  DESBIDERAPEN_ATALASEA: 2,

  ORRIAK: {
    'inigo':         'Iñigo',
    'nerea':         'Nerea',
    'naia':          'Naia',
    'jaione':        'Jaione',
    'konsolidatua':  'Konsolidatua',
    'konfigurazioa': 'Konfigurazioa'
  }
};

// ── HTTP SARRERA-PUNTUA ───────────────────────────────────────
function doPost(e) {
  try {
    const datuak = JSON.parse(e.postData.contents);
    return erantzunJson(ekintza_prozesatu(datuak));
  } catch (err) {
    return erantzunJson({ ok: false, errorea: err.toString() });
  }
}

function doGet(e) {
  try {
    if (e.parameter && e.parameter.payload) {
      const datuak = JSON.parse(e.parameter.payload);
      return erantzunJson(ekintza_prozesatu(datuak));
    }
    return erantzunJson({ ok: true, mezua: 'Tinko ordu-erregistroa aktibo dago' });
  } catch (err) {
    return erantzunJson({ ok: false, errorea: err.toString() });
  }
}

function ekintza_prozesatu(datuak) {
  const ekintza = datuak.accion || datuak.ekintza;
  switch (ekintza) {
    case 'registrar':      return gertaeraErregistratu(datuak);
    case 'obtener_registros': return erregistroakEskuratu(datuak);
    case 'guardar_config': return pertsonarenKonfigGorde(datuak);
    case 'obtener_config': return pertsonarenKonfigEskuratu(datuak);
    default: return { ok: false, errorea: 'Ekintza ezezaguna: ' + ekintza };
  }
}

// ── GERTAERA ERREGISTRATU ─────────────────────────────────────
function gertaeraErregistratu(datuak) {
  const persona   = datuak.persona;
  const mota      = datuak.tipo || datuak.mota;
  const kokapena  = datuak.ubicacion || datuak.kokapena;
  const udalerria = datuak.municipio  || datuak.udalerria;
  const iruzkina  = datuak.comentario || datuak.iruzkina;
  const timestamp = datuak.timestamp  || datuak.denbora_marka;

  if (!CONFIG.EMAILS[persona]) {
    return { ok: false, errorea: 'Pertsonaia ezezaguna: ' + persona };
  }

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const orriaIzena = CONFIG.ORRIAK[persona];
  let orria = ss.getSheetByName(orriaIzena);
  if (!orria) orria = pertsonarenOrriaSortu(ss, orriaIzena);

  const data = timestamp ? new Date(timestamp) : new Date();
  const dataKatea  = Utilities.formatDate(data, 'Europe/Madrid', 'yyyy-MM-dd');
  const orduaKatea = Utilities.formatDate(data, 'Europe/Madrid', 'HH:mm:ss');

  // Calcular horas solo en el Irteera
  let lanaldiOrduak = '';
  if (mota === 'irteera' || mota === 'checkout') {
    lanaldiOrduak = lanaldiOrduakKalkulatu(orria, dataKatea, data);
  }

  orria.appendRow([
    dataKatea,
    orduaKatea,
    mota,
    kokapena  || '',
    udalerria || '',
    iruzkina  || '',
    lanaldiOrduak,
    new Date()
  ]);

  // Si es irteera y hay horas calculadas, actualizar filas anteriores del día
  if ((mota === 'irteera' || mota === 'checkout') && lanaldiOrduak !== '') {
    konsolidatuaEguneratu(ss, persona, dataKatea, mota, orduaKatea, kokapena, udalerria, lanaldiOrduak);
  } else {
    konsolidatuaEguneratu(ss, persona, dataKatea, mota, orduaKatea, kokapena, udalerria, '');
  }

  return { ok: true, data: dataKatea, ordua: orduaKatea, orduak: lanaldiOrduak };
}

// ── LANALDIAREN ORDUAK KALKULATU (fix nagusia) ────────────────
function lanaldiOrduakKalkulatu(orria, dataKatea, irteeraData) {
  const datuak = orria.getDataRange().getValues();
  
  let orduakTotal = 0;
  let sarreraData = null;
  let atsedenaHasiera = null;
  let atsedenaMs = 0;

  for (let i = 1; i < datuak.length; i++) {
    const errenkadaData = datuak[i][0];
    const errenkadaDataStr = errenkadaData instanceof Date
      ? Utilities.formatDate(errenkadaData, 'Europe/Madrid', 'yyyy-MM-dd')
      : errenkadaData.toString().substring(0, 10);

    if (errenkadaDataStr !== dataKatea) continue;

    const mota    = datuak[i][2].toString().trim();
    const orduStr = datuak[i][1].toString().trim();

    // Parsear la hora correctamente
    let errenkadaDenbora = null;
    if (datuak[i][1] instanceof Date) {
      errenkadaDenbora = datuak[i][1];
    } else {
      // Es un string HH:mm:ss
      const zatiak = orduStr.split(':');
      if (zatiak.length >= 2) {
        const oinarria = new Date(irteeraData);
        oinarria.setHours(parseInt(zatiak[0]), parseInt(zatiak[1]), parseInt(zatiak[2] || 0), 0);
        errenkadaDenbora = oinarria;
      }
    }

    if (!errenkadaDenbora) continue;

    if (mota === 'sarrera' || mota === 'checkin') {
      // Nueva sarrera: cerrar ciclo anterior si existe
      if (sarreraData) {
        // Hubo un ciclo previo (sarrera sin irteera registrada aún)
        // No sumamos nada aquí, esperamos al irteera
      }
      sarreraData = errenkadaDenbora;
      atsedenaHasiera = null;
    } else if (mota === 'atseden_hasiera' || mota === 'pausa_inicio') {
      atsedenaHasiera = errenkadaDenbora;
    } else if ((mota === 'atseden_bukaera' || mota === 'pausa_fin') && atsedenaHasiera) {
      atsedenaMs += errenkadaDenbora - atsedenaHasiera;
      atsedenaHasiera = null;
    } else if (mota === 'irteera' || mota === 'checkout') {
      // Irteera intermedia: sumar ciclo y reiniciar
      if (sarreraData) {
        orduakTotal += (errenkadaDenbora - sarreraData) - atsedenaMs;
        atsedenaMs = 0;
        sarreraData = null;
        atsedenaHasiera = null;
      }
    }
  }

  // Sumar el ciclo actual (sarrera actual → irteera actual)
  if (sarreraData) {
    orduakTotal += (irteeraData - sarreraData) - atsedenaMs;
  }

  if (orduakTotal <= 0) return '';
  return Math.round(orduakTotal / 3600000 * 100) / 100; // Convertir ms a horas con 2 decimales
}

// ── PERTSONARREN ORRIA SORTU ──────────────────────────────────
function pertsonarenOrriaSortu(ss, izena) {
  const orria = ss.insertSheet(izena);
  const goiburuak = ['Data', 'Ordua', 'Gertaera mota', 'Kokapena', 'Udalerria', 'Iruzkina', 'Lanaldiaren orduak', 'Gordeta'];
  orria.appendRow(goiburuak);
  const tarteaG = orria.getRange(1, 1, 1, goiburuak.length);
  tarteaG.setFontWeight('bold');
  tarteaG.setBackground('#0f0f1a');
  tarteaG.setFontColor('#ffffff');
  orria.setFrozenRows(1);
  orria.setColumnWidth(1, 100);
  orria.setColumnWidth(2, 80);
  orria.setColumnWidth(3, 140);
  orria.setColumnWidth(4, 110);
  orria.setColumnWidth(5, 130);
  orria.setColumnWidth(6, 200);
  orria.setColumnWidth(7, 120);
  orria.setColumnWidth(8, 150);
  return orria;
}

// ── KONSOLIDATUA EGUNERATU ────────────────────────────────────
function konsolidatuaEguneratu(ss, persona, data, mota, ordua, kokapena, udalerria, orduak) {
  let orria = ss.getSheetByName(CONFIG.ORRIAK.konsolidatua);
  if (!orria) {
    orria = ss.insertSheet(CONFIG.ORRIAK.konsolidatua);
    orria.appendRow(['Data', 'Langilea', 'Gertaera mota', 'Kokapena', 'Udalerria', 'Lanaldiaren orduak']);
    orria.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1a3a1a').setFontColor('#ffffff');
    orria.setFrozenRows(1);
  }
  orria.appendRow([data, persona, mota, kokapena || '', udalerria || '', orduak || '']);
}

// ── ERREGISTROAK ESKURATU ─────────────────────────────────────
function erregistroakEskuratu(datuak) {
  const { persona, dias } = datuak;
  const muga = dias || 30;
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const orria = ss.getSheetByName(CONFIG.ORRIAK[persona]);
  if (!orria) return { ok: true, erregistroak: [] };

  const datu_guztiak = orria.getDataRange().getValues();
  const dataMuga = new Date();
  dataMuga.setDate(dataMuga.getDate() - muga);

  const erregistroak = [];
  for (let i = 1; i < datu_guztiak.length; i++) {
    const fechaFila = new Date(datu_guztiak[i][0]);
    if (fechaFila >= dataMuga) {
      erregistroak.push({
        data:      datu_guztiak[i][0],
        ordua:     datu_guztiak[i][1],
        mota:      datu_guztiak[i][2],
        kokapena:  datu_guztiak[i][3],
        udalerria: datu_guztiak[i][4],
        iruzkina:  datu_guztiak[i][5],
        orduak:    datu_guztiak[i][6]
      });
    }
  }
  return { ok: true, erregistroak: erregistroak.reverse() };
}

// ── KONFIGURAZIOA ─────────────────────────────────────────────
function pertsonarenKonfigGorde(datuak) {
  const { persona, hora_aviso, municipios_frecuentes } = datuak;
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let orria = ss.getSheetByName(CONFIG.ORRIAK.konfigurazioa);
  if (!orria) {
    orria = ss.insertSheet(CONFIG.ORRIAK.konfigurazioa);
    orria.appendRow(['Pertsonaia', 'Abisu-ordua', 'Udalerri ohikoenak', 'Eguneratua']);
  }
  const datuak2 = orria.getDataRange().getValues();
  let errenkadaExistitzen = -1;
  for (let i = 1; i < datuak2.length; i++) {
    if (datuak2[i][0] === persona) { errenkadaExistitzen = i + 1; break; }
  }
  const errenkada = [persona, hora_aviso, JSON.stringify(municipios_frecuentes || []), new Date()];
  if (errenkadaExistitzen > 0) {
    orria.getRange(errenkadaExistitzen, 1, 1, 4).setValues([errenkada]);
  } else {
    orria.appendRow(errenkada);
  }
  return { ok: true };
}

function pertsonarenKonfigEskuratu(datuak) {
  const { persona } = datuak;
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const orria = ss.getSheetByName(CONFIG.ORRIAK.konfigurazioa);
  if (!orria) return { ok: true, hora_aviso: CONFIG.ABISU_ORDUA_LEHENETSIA, municipios: [] };
  const errenkadak = orria.getDataRange().getValues();
  for (let i = 1; i < errenkadak.length; i++) {
    if (errenkadak[i][0] === persona) {
      return { ok: true, hora_aviso: errenkadak[i][1] || CONFIG.ABISU_ORDUA_LEHENETSIA, municipios: JSON.parse(errenkadak[i][2] || '[]') };
    }
  }
  return { ok: true, hora_aviso: CONFIG.ABISU_ORDUA_LEHENETSIA, municipios: [] };
}

// ── TRIGGER: GOIZEKO GOGORARAZPENA ───────────────────────────
function goizekGogorarazpena() {
  const orain = new Date();
  const gaurData = Utilities.formatDate(orain, 'Europe/Madrid', 'yyyy-MM-dd');
  if ([0, 6].includes(orain.getDay())) return;

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  Object.keys(CONFIG.EMAILS).filter(p => p !== 'inigo').forEach(persona => {
    const orria = ss.getSheetByName(CONFIG.ORRIAK[persona]);
    if (!orria) return;
    if (!gaurSarreraEgiaztatu(orria, gaurData)) {
      const konfig = pertsonarenKonfigEskuratu({ persona });
      const [o, m] = (konfig.hora_aviso || '09:00').split(':').map(Number);
      const abisuData = new Date(orain);
      abisuData.setHours(o, m, 0, 0);
      if (orain > abisuData) {
        const izena = persona.charAt(0).toUpperCase() + persona.slice(1);
        GmailApp.sendEmail(CONFIG.EMAILS[persona],
          '⏰ Gogorarazpena: oraindik ez duzu sarrera erregistratu',
          `Kaixo ${izena},\n\n${Utilities.formatDate(orain, 'Europe/Madrid', 'HH:mm')} dira eta oraindik ez duzu gaur sarrera erregistratu.\n\nAgur,\nTinko Ordu-erregistroa`);
      }
    }
  });
}

function gaurSarreraEgiaztatu(orria, gaurData) {
  const datuak = orria.getDataRange().getValues();
  for (let i = 1; i < datuak.length; i++) {
    const d = datuak[i][0] instanceof Date
      ? Utilities.formatDate(datuak[i][0], 'Europe/Madrid', 'yyyy-MM-dd')
      : datuak[i][0].toString().substring(0, 10);
    if (d === gaurData && ['sarrera','checkin'].includes(datuak[i][2])) return true;
  }
  return false;
}

// ── TRIGGER: IRTEERA GABE ABISUA ─────────────────────────────
function irteeraGabeAbisua() {
  const orain = new Date();
  const gaurData = Utilities.formatDate(orain, 'Europe/Madrid', 'yyyy-MM-dd');
  if ([0, 6].includes(orain.getDay())) return;

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  Object.keys(CONFIG.EMAILS).filter(p => p !== 'inigo').forEach(persona => {
    const orria = ss.getSheetByName(CONFIG.ORRIAK[persona]);
    if (!orria) return;
    const badaSarrera = gaurGertaeraEgiaztatu(orria, gaurData, ['sarrera','checkin']);
    const badaIrteera = gaurGertaeraEgiaztatu(orria, gaurData, ['irteera','checkout']);
    if (badaSarrera && !badaIrteera) {
      const izena = persona.charAt(0).toUpperCase() + persona.slice(1);
      GmailApp.sendEmail(CONFIG.EMAILS[persona],
        '🔔 Gogoratu irteera erregistratzea',
        `Kaixo ${izena},\n\nGaur sarrera erregistratu duzu baina oraindik ez duzu irteera markatu.\n\nAgur,\nTinko Ordu-erregistroa`);
    }
  });
}

function gaurGertaeraEgiaztatu(orria, gaurData, motak) {
  const datuak = orria.getDataRange().getValues();
  for (let i = 1; i < datuak.length; i++) {
    const d = datuak[i][0] instanceof Date
      ? Utilities.formatDate(datuak[i][0], 'Europe/Madrid', 'yyyy-MM-dd')
      : datuak[i][0].toString().substring(0, 10);
    if (d === gaurData && motak.includes(datuak[i][2])) return true;
  }
  return false;
}

// ── TRIGGER: ASTEKO BERRIKUSPENA ─────────────────────────────
function astekoBerrikuspena() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const gaur = new Date();
  const astelehena = new Date(gaur);
  astelehena.setDate(gaur.getDate() - gaur.getDay() - 6);
  astelehena.setHours(0,0,0,0);
  const ostirala = new Date(astelehena);
  ostirala.setDate(astelehena.getDate() + 4);
  ostirala.setHours(23,59,59,999);

  Object.keys(CONFIG.EMAILS).forEach(persona => {
    const orria = ss.getSheetByName(CONFIG.ORRIAK[persona]);
    if (!orria) return;
    const { orduakEginak, orduakEsperatuak } = astekoOrduakKalkulatu(orria, astelehena, ostirala, persona);
    const desbiderapena = orduakEginak - orduakEsperatuak;
    if (Math.abs(desbiderapena) >= CONFIG.DESBIDERAPEN_ATALASEA) {
      const izena = persona.charAt(0).toUpperCase() + persona.slice(1);
      const asteKatea = `${dataFormatatu(astelehena)} – ${dataFormatatu(ostirala)}`;
      const ikurra = desbiderapena > 0 ? '+' : '';
      const testua = desbiderapena > 0
        ? `Aste honetan estimatutakoa baino ${ikurra}${desbiderapena.toFixed(1)}h gehiago lan egin duzu.`
        : `Aste honetan estimatutakoa baino ${Math.abs(desbiderapena).toFixed(1)}h gutxiago lan egin duzu.`;
      GmailApp.sendEmail(CONFIG.EMAILS[persona],
        `📊 Asteko ordu-laburpena — ${asteKatea}`,
        `Kaixo ${izena},\n\nAstea: ${asteKatea}\nEgindako orduak:     ${orduakEginak.toFixed(1)}h\nEstimatutako orduak: ${orduakEsperatuak.toFixed(1)}h\nAldea:               ${ikurra}${desbiderapena.toFixed(1)}h\n\n${testua}\n\nAgur,\nTinko Ordu-erregistroa`);
    }
  });
}

function astekoOrduakKalkulatu(orria, astelehena, ostirala, persona) {
  const datuak = orria.getDataRange().getValues();
  let orduakEginak = 0;
  let lanEgunak = 0;
  const aldi = new Date(astelehena);
  while (aldi <= ostirala) {
    if (aldi.getDay() !== 0 && aldi.getDay() !== 6) lanEgunak++;
    aldi.setDate(aldi.getDate() + 1);
  }
  for (let i = 1; i < datuak.length; i++) {
    const data = datuak[i][0] instanceof Date ? datuak[i][0] : new Date(datuak[i][0]);
    const mota = datuak[i][2].toString();
    if (data >= astelehena && data <= ostirala && ['irteera','checkout'].includes(mota) && datuak[i][6]) {
      orduakEginak += parseFloat(datuak[i][6]) || 0;
    }
  }
  return { orduakEginak, orduakEsperatuak: (CONFIG.LANALDIA_ORDUAK[persona] || 8) * lanEgunak };
}

// ── TRIGGER: HILEKO EMAILA ────────────────────────────────────
function hilerokoEmaila() {
  const gaur = new Date();
  if (gaur.getDate() !== 1) return;

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const hilekoAurrekoa = new Date(gaur);
  hilekoAurrekoa.setMonth(hilekoAurrekoa.getMonth() - 1);
  const hilabeteIzena = Utilities.formatDate(hilekoAurrekoa, 'Europe/Madrid', 'MMMM yyyy');
  const urtea = hilekoAurrekoa.getFullYear();
  const hilabetea = hilekoAurrekoa.getMonth();

  let adminLaburpena = `HILEKO LABURPENA — ${hilabeteIzena.toUpperCase()}\n${'='.repeat(50)}\n\n`;

  Object.keys(CONFIG.EMAILS).forEach(persona => {
    const orria = ss.getSheetByName(CONFIG.ORRIAK[persona]);
    if (!orria) return;
    const { csv, orduakOsoak, lanEgunak } = hilerokoCSVSortu(orria, urtea, hilabetea);
    const orduakEsperatuak = hilabetekoOrduakEsperatu(urtea, hilabetea, persona);
    const desbiderapena = orduakOsoak - orduakEsperatuak;
    const ikurra = desbiderapena >= 0 ? '+' : '';
    const izena = persona.charAt(0).toUpperCase() + persona.slice(1);
    const blob = Utilities.newBlob(csv, 'text/csv', `ordutegia_${persona}_${hilabeteIzena.replace(' ','_')}.csv`);
    GmailApp.sendEmail(CONFIG.EMAILS[persona],
      `📋 Zure ordu-erregistroa — ${hilabeteIzena}`,
      `Kaixo ${izena},\n\nHona hemen ${hilabeteIzena}ko zure ordu-erregistroa:\n\n• Lan-egunak:          ${lanEgunak}\n• Egindako orduak:     ${orduakOsoak.toFixed(1)}h\n• Estimatutako orduak: ${orduakEsperatuak.toFixed(1)}h\n• Balantzea:           ${ikurra}${desbiderapena.toFixed(1)}h\n\nXehetasun osoa CSV fitxategian erantsia doa.\n\nAgur,\nTinko Ordu-erregistroa`,
      { attachments: [blob] });
    adminLaburpena += `${izena.toUpperCase()}\n  Lan-egunak:          ${lanEgunak}\n  Egindako orduak:     ${orduakOsoak.toFixed(1)}h\n  Estimatutako orduak: ${orduakEsperatuak.toFixed(1)}h\n  Balantzea:           ${ikurra}${desbiderapena.toFixed(1)}h\n\n`;
  });

  GmailApp.sendEmail(CONFIG.EMAIL_ADMIN,
    `📊 Hileko konsolidatua — ${hilabeteIzena}`,
    adminLaburpena + `\nAutomatikoki sortua: ${dataFormatatu(gaur)}\nTinko Ordu-erregistroa`);
}

function hilerokoCSVSortu(orria, urtea, hilabetea) {
  const datuak = orria.getDataRange().getValues();
  let csv = 'Data,Ordua,Gertaera mota,Kokapena,Udalerria,Iruzkina,Lanaldiaren orduak\n';
  let orduakOsoak = 0;
  const lanEgunakMultzoa = new Set();
  for (let i = 1; i < datuak.length; i++) {
    const data = datuak[i][0] instanceof Date ? datuak[i][0] : new Date(datuak[i][0]);
    if (data.getFullYear() === urtea && data.getMonth() === hilabetea) {
      csv += datuak[i].slice(0, 7).map(b => `"${b}"`).join(',') + '\n';
      if (['irteera','checkout'].includes(datuak[i][2]) && datuak[i][6]) {
        orduakOsoak += parseFloat(datuak[i][6]) || 0;
        lanEgunakMultzoa.add(datuak[i][0].toString());
      }
    }
  }
  return { csv, orduakOsoak, lanEgunak: lanEgunakMultzoa.size };
}

function hilabetekoOrduakEsperatu(urtea, hilabetea, persona) {
  let lanEgunak = 0;
  const data = new Date(urtea, hilabetea, 1);
  while (data.getMonth() === hilabetea) {
    if (![0,6].includes(data.getDay())) lanEgunak++;
    data.setDate(data.getDate() + 1);
  }
  return (CONFIG.LANALDIA_ORDUAK[persona] || 8) * lanEgunak;
}

// ── LAGUNTZAILEAK ─────────────────────────────────────────────
function erantzunJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function dataFormatatu(data) {
  return Utilities.formatDate(data, 'Europe/Madrid', 'dd/MM/yyyy');
}

// ── TRIGGERRAK INSTALATU ──────────────────────────────────────
function triggerrakInstalatu() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('goizekGogorarazpena').timeBased().everyDays(1).atHour(9).nearMinute(15).inTimezone('Europe/Madrid').create();
  ScriptApp.newTrigger('irteeraGabeAbisua').timeBased().everyDays(1).atHour(20).nearMinute(0).inTimezone('Europe/Madrid').create();
  ScriptApp.newTrigger('astekoBerrikuspena').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone('Europe/Madrid').create();
  ScriptApp.newTrigger('hilerokoEmaila').timeBased().everyDays(1).atHour(7).nearMinute(0).inTimezone('Europe/Madrid').create();
  Logger.log('✅ Triggerrak ondo instalatuta daude');
}
