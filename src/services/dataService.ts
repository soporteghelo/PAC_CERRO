import * as XLSX from 'xlsx';
import type { ExamRecord, ExamMetadata, PersonalRecord } from '../types';

const URL_PERSONAL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTrKyssGrBF69UdCUULbIQDN2DzHQuB8Dz0Dh8zNy3VWLvrESD1hlKNZ3AMMqwYKufcEd2ZGdVgfHpg/pub?output=xlsx';
const URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQCJhNPq2aP810i1ImC_dwin3aw4nombiCFJriN1U56ACjV5y_WLFbdXJHy6To2LMd6URNggBwqjqEz/pub?output=xlsx';

const CACHE_KEY = 'exam_checker_cache_v3';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CacheData {
  timestamp: number;
  personal: PersonalRecord[];
  recopilado: ExamRecord[];
  masterList: ExamMetadata[];
  activeThemes: string[];
}

export const cleanDni = (dni: string) => {
  return dni.replace(/^0+/, '').trim();
};

const parseDateValue = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const fetchData = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CacheData = JSON.parse(cached);
      // Convert back stringified dates to Date objects if needed
      parsed.personal.forEach(p => { p.FEC_ING = parseDateValue(p.FEC_ING); });
      parsed.masterList.forEach(m => { m.INICIO_TEMA = parseDateValue(m.INICIO_TEMA); });

      if (Date.now() - parsed.timestamp < CACHE_DURATION) {
        return parsed;
      }
    }
  }

  const [personalRes, dataRes] = await Promise.all([
    fetch(URL_PERSONAL).then(res => res.arrayBuffer()),
    fetch(URL_DATA).then(res => res.arrayBuffer())
  ]);

  const personalWb = XLSX.read(personalRes, { type: 'array', cellDates: true });
  const dataWb = XLSX.read(dataRes, { type: 'array', cellDates: true });

  // 1. PERSONAL (REGISTER Sheet)
  const personalSheet = personalWb.Sheets['REGISTER'];
  const personalData: any[] = XLSX.utils.sheet_to_json(personalSheet);
  const personalClean: PersonalRecord[] = personalData
    .filter(p => String(p.ESTADO || '').toUpperCase().trim() === 'ACTIVO')
    .map(p => ({
      DNI: cleanDni(String(p.DNI)),
      ESTADO: String(p.ESTADO),
      "APELLIDOS Y NOMBRES": String(p["APELLIDOS Y NOMBRES"] || ''),
      FEC_ING: parseDateValue(p.FEC_ING)
    }));

  // 2. RECOPILADO
  const recopiladoSheet = dataWb.Sheets['RECOPILADO'];
  const recopiladoData: any[] = XLSX.utils.sheet_to_json(recopiladoSheet);
  

  // Limpieza robusta tipo Power Query
  const recopiladoClean: ExamRecord[] = (() => {
    // 1. Limpieza y normalización de campos
    let procesados = recopiladoData.map((row: any) => {
      // Limpia puntuación: soporta '20 / 20', '15', etc.
      let puntRaw = String(row.Puntuación ?? '').replace('/ 20', '').replace(',', '.').trim();
      let puntuacion = Number(puntRaw);
      // Limpia DNI y TEMA
      let dni = row.DNI == null ? '' : cleanDni(String(row.DNI));
      let tema = row.TEMA == null ? '' : String(row.TEMA).toUpperCase().trim();
      return {
        ...row,
        DNI: dni,
        TEMA: tema,
        Puntuación: puntuacion
      };
    });

    // 2. Filtra solo aprobados (>=12) y TEMA no vacío
    procesados = procesados.filter(row => !isNaN(row.Puntuación) && row.Puntuación >= 12 && row.TEMA !== '');

    // 3. Elimina duplicados por DNI y TEMA
    const vistos = new Set();
    const unicos = procesados.filter(row => {
      const clave = row.DNI + '|' + row.TEMA;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
    return unicos;
  })();

  // 3. activeThemes (Universe from RECOPILADO)
  const activeThemes = Array.from(new Set(
    recopiladoData
      .filter(r => r.TEMA)
      .map(r => String(r.TEMA).toUpperCase().trim())
  ));

  // 4. DATA_APP (MAIN sheet)
  const masterSheet = dataWb.Sheets['MAIN'];
  const masterData: any[] = XLSX.utils.sheet_to_json(masterSheet);
  const masterClean: ExamMetadata[] = masterData
    .filter(m => m.CODIGO) // Match logic uses CODIGO
    .map(m => ({
      CODIGO: String(m.CODIGO || '').toUpperCase().trim(),
      TEMA: String(m.TEMA || '').toUpperCase().trim(),
      MES: String(m.MES || ''),
      AREA: String(m.AREA || ''),
      CATEGORIA: String(m.CATEGORIA || ''),
      INICIO_TEMA: parseDateValue(m.INICIO_TEMA)
    }));

  const cache: CacheData = {
    timestamp: Date.now(),
    personal: personalClean,
    recopilado: recopiladoClean,
    masterList: masterClean,
    activeThemes
  };

  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  return cache;
};

export const getPendingExams = async (inputDni: string) => {
  const dni = cleanDni(inputDni);
  // Siempre forzar recarga de datos (ignorar caché)
  const data = await fetchData(true);

  const person = data.personal.find(p => p.DNI === dni);
  if (!person) {
    return { error: 'DNI no encontrado o personal no está activo.' };
  }

  // Passed exams
  const passedThemes = new Set(
    data.recopilado
      .filter(r => r.DNI === dni)
      .map(r => r.TEMA)
  );

  // Left Anti Join: All Active Themes minus Passed Themes
  const pendingThemes = data.activeThemes.filter(theme => !passedThemes.has(theme));

  // Build the final list with INCLUSION logic
  const result: ExamMetadata[] = [];

  for (const theme of pendingThemes) {
    // Note: The PQ logic maps x[CODIGO] = [TEMA]
    // so we search for the masterList entry where CODIGO matches theme
    let meta = data.masterList.find(m => m.CODIGO === theme);
    
    // Fallback: If not found by CODIGO, try TEMA to be safe
    if (!meta) {
        meta = data.masterList.find(m => m.TEMA === theme);
    }

    const fechaCap = meta?.INICIO_TEMA;
    const fecIng = person.FEC_ING;

    let inclusion = false;

    if (!fechaCap) {
      inclusion = true;
    } else if (!fecIng) {
      inclusion = false;
    } else {
      // FECHACAP >= Date.AddDays(FEC_ING, 15)
      // Extract dates safely discarding hours
      const dcap = new Date(fechaCap).setHours(0,0,0,0);
      const ding = new Date(fecIng);
      ding.setDate(ding.getDate() + 15);
      const ding15 = ding.setHours(0,0,0,0);
      
      inclusion = dcap >= ding15;
    }

    if (inclusion) {
      result.push(meta || { CODIGO: theme, TEMA: theme, MES: '' });
    }
  }

  return {
    person,
    pending: result,
  };
};
