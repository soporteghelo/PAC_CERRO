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
  LINK_EXAMEN?: string;
  LINK_PRESENTACION?: string;
  LINK_VIDEO?: string;
}

export interface PersonalRecord {
  DNI: string;
  ESTADO: string;
  "APELLIDOS Y NOMBRES": string;
  FEC_ING?: Date | string | null;
}
