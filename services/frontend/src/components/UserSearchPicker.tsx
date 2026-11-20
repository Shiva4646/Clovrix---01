import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { colors } from './ui';

export function UserSearchPicker({ selected, onChange, label, roleFilter, singleSelect }: {
  selected: any[];
  onChange: (users: any[]) => void;
  label?: string;
  roleFilter?: string[];
  singleSelect?: boolean;
}) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, []);

  const search = async (q: string) => {
    setLoading(true);
    try {
      let r = await api.searchUsers(q || undefined) as any[];
      if (roleFilter?.length) r = r.filter(u => roleFilter.includes(u.role));
      r = r.filter(u => !selected.find(s => s.id === u.id));
      setResults(r);
    } catch { setResults([]); }
    setLoading(false);
    setOpen(true);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(v), 250);
  };

  const pick = (u: any) => {
    const next = singleSelect ? [u] : [...selected, u];
    onChange(next);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const remove = (id: string) => onChange(selected.filter(u => u.id !== id));

  return (
    <div ref={wrapRef}>
      {label && <div style={{ fontSize:11, color:colors.text3, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>}
      {selected.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:6 }}>
          {selected.map(u => (
            <span key={u.id} style={{
              display:'inline-flex', alignItems:'center', gap:5,
              background:`${colors.indigo}20`, color:colors.indigo,
              borderRadius:99, padding:'3px 8px 3px 10px', fontSize:12, fontWeight:600,
            }}>
              {u.full_name || u.email}
              <button onMouseDown={e => e.stopPropagation()} onClick={() => remove(u.id)} style={{
                background:'none', border:'none', cursor:'pointer', color:colors.text3,
                fontSize:13, lineHeight:1, padding:'0 1px',
              }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position:'relative' }}>
        <input
          value={query}
          onChange={onInput}
          onFocus={() => search(query)}
          placeholder={roleFilter?.length ? `Search ${roleFilter.join('/')} users…` : 'Search by name or email…'}
          style={{ width:'100%', background:'var(--c-bg3)', border:`1px solid ${colors.border}`,
            borderRadius:8, padding:'8px 12px', color:colors.text, fontSize:13, outline:'none' }}
        />
        {open && (
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:9999,
            background:'var(--c-bg2)', border:`1px solid ${colors.border2}`,
            borderRadius:10, boxShadow:'0 8px 28px rgba(0,0,0,.35)',
            maxHeight:220, overflowY:'auto',
          }}>
            {loading && <div style={{ padding:10, fontSize:12, color:colors.text3, textAlign:'center' }}>Searching…</div>}
            {!loading && results.length === 0 && (
              <div style={{ padding:10, fontSize:12, color:colors.text3, textAlign:'center' }}>No users found</div>
            )}
            {results.map(u => (
              <div key={u.id}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); pick(u); }}
                style={{ padding:'9px 14px', cursor:'pointer', borderBottom:`1px solid ${colors.border}`,
                  display:'flex', alignItems:'center', gap:10 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{
                  width:28, height:28, borderRadius:'50%', flexShrink:0,
                  background:`${colors.indigo}30`, display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:12, fontWeight:700, color:colors.indigo,
                }}>
                  {(u.full_name||u.email||'?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:colors.text }}>{u.full_name}</div>
                  <div style={{ fontSize:11, color:colors.text3 }}>{u.email} · {u.role}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
