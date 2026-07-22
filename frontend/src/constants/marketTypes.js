import { Sprout, Tent, Sparkles, Palette, Layers } from 'lucide-react';

export const MARKET_TYPES = [
  { value: 'farmers', label: "Farmers' Market", icon: Sprout, hint: 'Produce, food, weekly' },
  { value: 'flea', label: 'Flea Market', icon: Layers, hint: 'Mixed goods, resale' },
  { value: 'popup', label: 'Pop-up / Event', icon: Sparkles, hint: 'One-off or seasonal' },
  { value: 'craft', label: 'Craft Fair', icon: Palette, hint: 'Handmade, artisan' },
  { value: 'mixed', label: 'A little of everything', icon: Tent, hint: 'Multiple formats' },
];

export const MARKET_TYPE_OPTIONS = [
  { value: '', label: 'Not specified' },
  ...MARKET_TYPES.map(({ value, label }) => ({ value, label })),
];
