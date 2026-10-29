export interface ViewSettings {
  captions: boolean;
  details: boolean;
  groups: boolean;
  columns: number;
}

export function readViewSettings(search: string): ViewSettings {
  const params = new URLSearchParams(search);
  return {
    columns: ['2', '3', '4'].includes(params.get('columns') || '')
      ? Number(params.get('columns'))
      : 2,
    captions: params.get('captions') !== '0',
    details: params.get('details') !== '0',
    groups: params.get('groups') !== '0',
  };
}

export function viewSettingsSearch(settings: ViewSettings): string {
  const params = new URLSearchParams();
  for (const key of ['captions', 'details', 'groups'] as const)
    if (!settings[key]) params.set(key, '0');
  if (settings.columns !== 2) params.set('columns', String(settings.columns));
  const search = params.toString();
  return search ? `?${search}` : '';
}
