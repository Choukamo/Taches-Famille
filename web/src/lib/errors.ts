// Transforme les erreurs techniques ("TypeError: Failed to fetch") en message compréhensible.
export function friendly(message: string | undefined | null): string {
  const m = message ?? ''
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m)) {
    return 'Pas de connexion internet. Réessaie dans un instant.'
  }
  return m || 'Une erreur est survenue.'
}
