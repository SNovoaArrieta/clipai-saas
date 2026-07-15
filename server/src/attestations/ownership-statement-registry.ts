export const OWNERSHIP_STATEMENT_VERSION = 'ownership-v1' as const;

export const OWNERSHIP_STATEMENTS = Object.freeze({
  [OWNERSHIP_STATEMENT_VERSION]:
    'Confirmo que soy titular de este contenido o que cuento con autorización suficiente del titular para cargarlo y permitir que ClipAI lo procese con el fin de generar transcripciones, análisis y recomendaciones de contenido. Soy responsable de respetar los derechos de terceros.',
});

export type OwnershipStatementVersion = keyof typeof OWNERSHIP_STATEMENTS;

export function isOwnershipStatementVersion(
  value: unknown,
): value is OwnershipStatementVersion {
  return value === OWNERSHIP_STATEMENT_VERSION;
}
