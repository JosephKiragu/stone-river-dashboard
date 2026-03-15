export function parseIncludeInactive(searchParams: URLSearchParams): boolean {
  return searchParams.get('includeInactive') === 'true'
}
