export interface ExamRecord {
  DNI: string;
  TEMA: string;
  Puntuación?: number;
  ESTADO?: string;
}

export interface ExamMetadata {
  CODIGO: string;
  TEMA: string;
  MES?: string;
  AREA?: string;
  CATEGORIA?: string;
  INICIO_TEMA?: Date | string | null;
}

export interface PersonalRecord {
  DNI: string;
  ESTADO: string;
  "APELLIDOS Y NOMBRES": string;
  FEC_ING?: Date | string | null;
}
