export type ThemeId = 'clovrix'|'midnight'|'dark'|'ocean'|'light'|'white-blue';
export interface Theme { id:ThemeId; name:string; icon:string; vars:Record<string,string>; }

export const THEMES:Theme[] = [
  { id:'clovrix', name:'Clovrix', icon:'C', vars:{
    '--c-bg':'#f5f7fa','--c-bg2':'#ffffff','--c-bg3':'#eef2f7','--c-border':'#d4dce8',
    '--c-border2':'#bcc5d8','--c-text':'#001052','--c-text2':'#3d5285','--c-text3':'#7d8da6',
    '--c-accent':'#0056B3','--c-accent2':'#1DB9A2','--c-green':'#22c55e','--c-red':'#f43f5e',
    '--c-yellow':'#fbbf24','--c-orange':'#fb923c','--c-pink':'#e879f9',
    '--c-sidebar':'#f5f7fa','--c-topbar':'#ffffff','--c-scrollbar':'#bcc5d8',
  }},
  { id:'midnight', name:'Midnight', icon:'M', vars:{
    '--c-bg':'#0a0a18','--c-bg2':'#111128','--c-bg3':'#16163a','--c-border':'#1e1e48',
    '--c-border2':'#2a2a60','--c-text':'#f0f0ff','--c-text2':'#9898c8','--c-text3':'#6868a8',
    '--c-accent':'#7c6af7','--c-accent2':'#22d3ee','--c-green':'#22c55e','--c-red':'#f43f5e',
    '--c-yellow':'#fbbf24','--c-orange':'#fb923c','--c-pink':'#e879f9',
    '--c-sidebar':'#0e0e24','--c-topbar':'#0e0e24','--c-scrollbar':'#2a2a60',
  }},
  { id:'dark', name:'Dark', icon:'D', vars:{
    '--c-bg':'#0f1117','--c-bg2':'#13162a','--c-bg3':'#1a1d2e','--c-border':'#1e2140',
    '--c-border2':'#2d3150','--c-text':'#e8eaf0','--c-text2':'#a0aec0','--c-text3':'#6b7da0',
    '--c-accent':'#6366f1','--c-accent2':'#0d9488','--c-green':'#10b981','--c-red':'#ef4444',
    '--c-yellow':'#f59e0b','--c-orange':'#f97316','--c-pink':'#ec4899',
    '--c-sidebar':'#13162a','--c-topbar':'#13162a','--c-scrollbar':'#2d3150',
  }},
  { id:'ocean', name:'Ocean', icon:'O', vars:{
    '--c-bg':'#060e1a','--c-bg2':'#0a1628','--c-bg3':'#0f1f38','--c-border':'#162845',
    '--c-border2':'#1e3860','--c-text':'#e0f2fe','--c-text2':'#7fb3d3','--c-text3':'#4a7a9b',
    '--c-accent':'#0ea5e9','--c-accent2':'#06b6d4','--c-green':'#10b981','--c-red':'#f43f5e',
    '--c-yellow':'#fbbf24','--c-orange':'#f97316','--c-pink':'#818cf8',
    '--c-sidebar':'#080e1a','--c-topbar':'#080e1a','--c-scrollbar':'#1e3860',
  }},
  { id:'light', name:'Light', icon:'L', vars:{
    '--c-bg':'#f4f6fa','--c-bg2':'#ffffff','--c-bg3':'#eef1f7','--c-border':'#dde1eb',
    '--c-border2':'#c8ceda','--c-text':'#0d1117','--c-text2':'#374151','--c-text3':'#6b7280',
    '--c-accent':'#4f46e5','--c-accent2':'#0891b2','--c-green':'#059669','--c-red':'#dc2626',
    '--c-yellow':'#b45309','--c-orange':'#c2410c','--c-pink':'#be185d',
    '--c-sidebar':'#f0f3f9','--c-topbar':'#f0f3f9','--c-scrollbar':'#dde1eb',
  }},
  { id:'white-blue', name:'White & Blue', icon:'W', vars:{
    '--c-bg':'#ffffff','--c-bg2':'#f8fafc','--c-bg3':'#f1f5f9','--c-border':'#e2e8f0',
    '--c-border2':'#cbd5e1','--c-text':'#0056b3','--c-text2':'#1e90ff','--c-text3':'#4169e1',
    '--c-accent':'#0056b3','--c-accent2':'#1e90ff','--c-green':'#22c55e','--c-red':'#f43f5e',
    '--c-yellow':'#fbbf24','--c-orange':'#fb923c','--c-pink':'#e879f9',
    '--c-sidebar':'#f8fafc','--c-topbar':'#f8fafc','--c-scrollbar':'#cbd5e1',
  }},
];

const STORAGE_KEY = 'clovrix_theme';
export function getThemeId():ThemeId { if(typeof window==='undefined') return 'clovrix'; return (localStorage.getItem(STORAGE_KEY) as ThemeId)||'clovrix'; }
export function getTheme():Theme { return THEMES.find(t=>t.id===getThemeId())||THEMES[0]; }
export function applyTheme(id:ThemeId) {
  const theme = THEMES.find(t=>t.id===id)||THEMES[0];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k,v])=>root.style.setProperty(k,v));
  document.body.style.background = theme.vars['--c-bg'];
  document.body.style.color = theme.vars['--c-text'];
  localStorage.setItem(STORAGE_KEY,id);
  window.dispatchEvent(new CustomEvent('clovrix:theme-changed',{detail:id}));
}
export function initTheme() { if(typeof window!=='undefined') applyTheme(getThemeId()); }
