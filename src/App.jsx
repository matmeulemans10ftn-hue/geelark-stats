import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Ban,
  AlertTriangle,
  Zap,
  Eye,
  Heart,
  UserPlus,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS = {
  active: { label: 'Actif', color: '#c9a8ff', bg: 'rgba(201,168,255,0.1)' },
  weak: { label: 'Faible', color: '#ffb84d', bg: 'rgba(255,184,77,0.1)' },
  banned: { label: 'Banni', color: '#ff5d7a', bg: 'rgba(255,93,122,0.1)' },
};

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('ranking');
  const [entryDate, setEntryDate] = useState(todayStr());
  const [draft, setDraft] = useState({});
  const [newName, setNewName] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [pulse, setPulse] = useState({});
  const [filter, setFilter] = useState('all');
  const timers = useRef({});

  // Chargement initial + abonnement temps réel aux changements
  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel('geelark-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    const { data: accs } = await supabase.from('accounts').select('*').order('created_at');
    const { data: ents } = await supabase.from('entries').select('*');
    if (accs) {
      const merged = accs.map((a) => ({
        ...a,
        entries: (ents || []).filter((e) => e.account_id === a.id),
      }));
      setAccounts(merged);
    }
    setLoaded(true);
  };

  const addAccount = async () => {
    const name = newName.trim().replace(/^@/, '');
    if (!name) return;
    if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) return;
    await supabase.from('accounts').insert({ username: name, status: 'active' });
    setNewName('');
    loadAll();
  };

  const removeAccount = async (id) => {
    await supabase.from('accounts').delete().eq('id', id);
    loadAll();
  };

  const setStatus = async (id, status) => {
    await supabase.from('accounts').update({ status }).eq('id', id);
    loadAll();
  };

  const commitAccount = useCallback(
    async (accountId, values) => {
      const views = Number(values.views) || 0;
      const likes = Number(values.likes) || 0;
      const followers = Number(values.followers) || 0;
      if (!views && !likes && !followers) return;
      await supabase
        .from('entries')
        .upsert(
          { account_id: accountId, date: entryDate, views, likes, followers },
          { onConflict: 'account_id,date' }
        );
      setPulse((p) => ({ ...p, [accountId]: true }));
      setTimeout(() => setPulse((p) => ({ ...p, [accountId]: false })), 1000);
      loadAll();
    },
    [entryDate]
  );

  const setDraftField = (id, field, value) => {
    const nextValues = { ...draft[id], [field]: value };
    setDraft((prev) => ({ ...prev, [id]: nextValues }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => commitAccount(id, nextValues), 500);
  };

  useEffect(() => {
    const pre = {};
    accounts.forEach((acc) => {
      const e = acc.entries.find((en) => en.date === entryDate);
      if (e) pre[acc.id] = { views: String(e.views), likes: String(e.likes), followers: String(e.followers) };
    });
    setDraft(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDate, accounts.length]);

  const stats = useMemo(() => {
    const sevenAgo = new Date();
    sevenAgo.setDate(sevenAgo.getDate() - 6);
    const sevenStr = sevenAgo.toISOString().slice(0, 10);

    return accounts
      .map((acc) => {
        const sorted = [...acc.entries].sort((a, b) => a.date.localeCompare(b.date));
        const totalViews = sorted.reduce((s, e) => s + e.views, 0);
        const last7 = sorted.filter((e) => e.date >= sevenStr);
        const avg7 = last7.length ? last7.reduce((s, e) => s + e.views, 0) / last7.length : 0;
        const todayEntry = sorted.find((e) => e.date === entryDate);
        const latest = sorted[sorted.length - 1];
        const prevEntry = sorted[sorted.length - 2];
        const trend = latest && prevEntry ? latest.views - prevEntry.views : 0;
        return {
          ...acc,
          totalViews,
          avg7: Math.round(avg7),
          today: todayEntry || null,
          trend,
          entryCount: sorted.length,
        };
      })
      .sort((a, b) => (b.today?.views || 0) - (a.today?.views || 0) || b.avg7 - a.avg7);
  }, [accounts, entryDate]);

  const filtered = filter === 'all' ? stats : stats.filter((s) => s.status === filter);
  const bestToday = Math.max(1, ...stats.map((s) => s.today?.views || 0));
  const counts = {
    active: stats.filter((s) => s.status === 'active').length,
    weak: stats.filter((s) => s.status === 'weak').length,
    banned: stats.filter((s) => s.status === 'banned').length,
  };

  const totalViewsToday = stats.reduce((s, a) => s + (a.today?.views || 0), 0);
  const totalFollowersToday = stats.reduce((s, a) => s + (a.today?.followers || 0), 0);

  const CHART_COLORS = ['#c9a8ff', '#ff9ecb', '#7ee0c6', '#ffcc66', '#8aa5ff', '#ff8a8a'];

  const { chartData, topAccounts } = useMemo(() => {
    const top = [...stats].filter((s) => s.status !== 'banned').slice(0, 6);
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 29);
    const dates = [];
    for (let d = new Date(thirtyAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    const rows = dates.map((date) => {
      const row = { date: date.slice(5) };
      top.forEach((acc) => {
        const e = acc.entries.find((en) => en.date === date);
        row[acc.username] = e ? e.views : null;
      });
      return row;
    });
    return { chartData: rows, topAccounts: top };
  }, [stats]);

  if (!loaded) {
    return (
      <div style={S.loadingScreen}>
        <div style={S.loadingLogo}>GEELARK</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{`
        * { box-sizing: border-box; }
        input::placeholder { color: #5c4a78; }
        ::selection { background: #a855f755; }
        @keyframes glow { 0%,100%{opacity:.55} 50%{opacity:1} }
        body { margin: 0; }
      `}</style>

      <header style={S.header}>
        <div style={S.brandBlock}>
          <div style={S.brandName}>GEELARK</div>
          <div style={S.brandSub}>IG STATS</div>
        </div>
      </header>

      <div style={S.statCardsRow}>
        <StatCard label="Vues aujourd'hui" value={fmt(totalViewsToday)} color="#c9a8ff" />
        <StatCard label="Nouv. abonnés" value={`+${fmt(totalFollowersToday)}`} color="#7ee0c6" />
        <StatCard label="Comptes actifs" value={counts.active} color="#c9a8ff" />
        <StatCard label="Faibles" value={counts.weak} color="#ffb84d" />
        <StatCard label="Bannis" value={counts.banned} color="#ff5d7a" />
      </div>

      {topAccounts.length > 0 && (
        <div style={S.chartCard}>
          <div style={S.chartHeaderRow}>
            <div>
              <div style={S.chartTitle}>Tendances</div>
              <div style={S.chartSub}>Vues sur les 30 derniers jours · top comptes</div>
            </div>
          </div>
          <div style={S.chartLegend}>
            {topAccounts.map((acc, i) => (
              <span key={acc.id} style={S.legendItem}>
                <span style={{ ...S.legendDot, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                @{acc.username}
              </span>
            ))}
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#1e1132" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6b5c87', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b5c87', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#150a26',
                    border: '1px solid #2a1a45',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#c9a8ff' }}
                />
                {topAccounts.map((acc, i) => (
                  <Line
                    key={acc.id}
                    type="monotone"
                    dataKey={acc.username}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={S.tabs}>
        <button onClick={() => setView('ranking')} style={{ ...S.tab, ...(view === 'ranking' ? S.tabActive : {}) }}>
          Classement
        </button>
        <button onClick={() => setView('entry')} style={{ ...S.tab, ...(view === 'entry' ? S.tabActive : {}) }}>
          Saisie
        </button>
      </div>

      {view === 'ranking' && (
        <div style={S.section}>
          <div style={S.dateRow}>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={S.dateInput} />
            <div style={S.filterRow}>
              {['all', 'active', 'weak', 'banned'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{ ...S.filterChip, ...(filter === f ? S.filterChipActive : {}) }}
                >
                  {f === 'all' ? 'Tous' : STATUS[f].label}
                </button>
              ))}
            </div>
          </div>

          <div style={S.addRow}>
            <input
              style={S.input}
              placeholder="@nouveau.compte"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAccount()}
            />
            <button style={S.addBtn} onClick={addAccount}>
              <Plus size={16} />
            </button>
          </div>

          {filtered.length === 0 ? (
            <div style={S.empty}>Aucun compte dans cette catégorie.</div>
          ) : (
            <div style={S.list}>
              {filtered.map((acc, i) => {
                const st = STATUS[acc.status];
                return (
                  <div key={acc.id} style={S.card}>
                    <div style={S.cardTop} onClick={() => setExpanded(expanded === acc.id ? null : acc.id)}>
                      <div style={S.rankBadge(i)}>{i + 1}</div>
                      <div style={S.cardMain}>
                        <div style={S.cardNameRow}>
                          <span style={{ ...S.username, ...(acc.status === 'banned' ? S.usernameBanned : {}) }}>
                            @{acc.username}
                          </span>
                          <span style={{ ...S.statusBadge, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={S.barTrack}>
                          <div
                            style={{
                              ...S.barFill,
                              width: `${Math.max(3, ((acc.today?.views || 0) / bestToday) * 100)}%`,
                              background:
                                acc.status === 'banned'
                                  ? '#ff5d7a55'
                                  : 'linear-gradient(90deg, #7c3aed, #c9a8ff)',
                            }}
                          />
                        </div>
                      </div>
                      <button style={S.expandBtn}>
                        {expanded === acc.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    <div style={S.statRow}>
                      <MiniStat icon={<Eye size={12} />} value={acc.today?.views} />
                      <MiniStat icon={<Heart size={12} />} value={acc.today?.likes} />
                      <MiniStat icon={<UserPlus size={12} />} value={acc.today?.followers} />
                      <TrendTag trend={acc.trend} />
                    </div>

                    {expanded === acc.id && (
                      <div style={S.detail}>
                        <div style={S.detailStats}>
                          <DetailStat label="Total vues" value={fmt(acc.totalViews)} />
                          <DetailStat label="Moy. 7j" value={fmt(acc.avg7)} />
                          <DetailStat label="Jours" value={acc.entryCount} />
                        </div>
                        <div style={S.statusRow}>
                          {Object.keys(STATUS).map((k) => (
                            <button
                              key={k}
                              onClick={() => setStatus(acc.id, k)}
                              style={{
                                ...S.statusBtn,
                                color: STATUS[k].color,
                                background: acc.status === k ? STATUS[k].bg : 'transparent',
                                borderColor: acc.status === k ? STATUS[k].color : '#2a1f3d',
                              }}
                            >
                              {k === 'banned' && <Ban size={12} />}
                              {k === 'weak' && <AlertTriangle size={12} />}
                              {k === 'active' && <Zap size={12} />}
                              {STATUS[k].label}
                            </button>
                          ))}
                          <button style={S.deleteBtn} onClick={() => removeAccount(acc.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === 'entry' && (
        <div style={S.section}>
          <div style={S.dateRow}>
            <label style={S.dateLabel}>Date</label>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={S.dateInput} />
          </div>

          {accounts.length === 0 ? (
            <div style={S.empty}>Ajoute des comptes dans l'onglet "Classement".</div>
          ) : (
            <>
              <div style={S.entryHead}>
                <span style={{ flex: '1 1 auto' }}>Compte</span>
                <span style={S.entryHeadCol}>Vues</span>
                <span style={S.entryHeadCol}>Likes</span>
                <span style={S.entryHeadCol}>+Abo.</span>
              </div>
              <div style={S.entryList}>
                {accounts.map((acc) => (
                  <div key={acc.id} style={S.entryRow}>
                    <span
                      style={{
                        ...S.entryName,
                        ...(acc.status === 'banned' ? { color: '#ff5d7a', textDecoration: 'line-through' } : {}),
                      }}
                    >
                      @{acc.username}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      style={S.entryInput}
                      placeholder="0"
                      value={draft[acc.id]?.views ?? ''}
                      onChange={(e) => setDraftField(acc.id, 'views', e.target.value)}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      style={S.entryInput}
                      placeholder="0"
                      value={draft[acc.id]?.likes ?? ''}
                      onChange={(e) => setDraftField(acc.id, 'likes', e.target.value)}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      style={S.entryInput}
                      placeholder="0"
                      value={draft[acc.id]?.followers ?? ''}
                      onChange={(e) => setDraftField(acc.id, 'followers', e.target.value)}
                    />
                    <span style={S.pulseDot(pulse[acc.id])}>
                      <Check size={11} />
                    </span>
                  </div>
                ))}
              </div>
              <div style={S.liveNote}>
                Sauvegarde automatique · classement mis à jour en direct · statut "Banni" détecté
                automatiquement toutes les heures
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={S.statCard}>
      <div style={{ ...S.statCardValue, color }}>{value}</div>
      <div style={S.statCardLabel}>{label}</div>
    </div>
  );
}

function MiniStat({ icon, value }) {
  return (
    <span style={S.miniStat}>
      {icon}
      {value !== undefined && value !== null ? fmt(value) : '—'}
    </span>
  );
}

function TrendTag({ trend }) {
  if (!trend) return <Minus size={12} color="#4a3f5e" style={{ marginLeft: 'auto' }} />;
  const up = trend > 0;
  return (
    <span style={{ ...S.trendTag, color: up ? '#c9a8ff' : '#ff5d7a', marginLeft: 'auto' }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {fmt(Math.abs(trend))}
    </span>
  );
}

function DetailStat({ label, value }) {
  return (
    <div>
      <div style={S.detailValue}>{value}</div>
      <div style={S.detailLabel}>{label}</div>
    </div>
  );
}

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('fr-FR').format(n);
}

const S = {
  app: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 20% 0%, #1e0f38 0%, #0e0817 55%, #0a0612 100%)',
    color: '#f0eafa',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '20px 14px 40px',
  },
  loadingScreen: {
    minHeight: '100vh',
    background: '#0a0612',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    color: '#a855f7',
    fontWeight: 800,
    letterSpacing: '0.3em',
    fontSize: 14,
    animation: 'glow 1.4s infinite',
  },
  header: { marginBottom: 18 },
  brandBlock: { marginBottom: 4 },
  brandName: {
    fontSize: 42,
    fontWeight: 900,
    letterSpacing: '-0.01em',
    color: '#f5f2fb',
    lineHeight: 1,
    background: 'linear-gradient(90deg, #f5f2fb, #c9a8ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  brandSub: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.35em',
    color: '#a855f7',
    marginTop: 4,
  },
  statCardsRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    overflowX: 'auto',
    paddingBottom: 2,
  },
  statCard: {
    background: '#150a26',
    border: '1px solid #241638',
    borderRadius: 12,
    padding: '12px 14px',
    minWidth: 108,
    flex: '1 0 auto',
  },
  statCardValue: { fontSize: 19, fontWeight: 800, lineHeight: 1.1 },
  statCardLabel: { fontSize: 10, color: '#7a6a95', marginTop: 4, letterSpacing: '0.02em' },
  chartCard: {
    background: '#130923',
    border: '1px solid #221336',
    borderRadius: 16,
    padding: '16px 12px 8px',
    marginBottom: 18,
  },
  chartHeaderRow: { padding: '0 6px', marginBottom: 6 },
  chartTitle: { fontSize: 15, fontWeight: 800, color: '#f0eafa' },
  chartSub: { fontSize: 11, color: '#6b5c87', marginTop: 2 },
  chartLegend: { display: 'flex', flexWrap: 'wrap', gap: 10, padding: '4px 6px 8px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#b8a9d4', fontWeight: 600 },
  legendDot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block' },
  tabs: {
    display: 'flex',
    gap: 6,
    background: '#150a26',
    padding: 4,
    borderRadius: 11,
    marginBottom: 16,
    border: '1px solid #241638',
  },
  tab: {
    flex: 1,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 700,
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: '#7a6a95',
    cursor: 'pointer',
  },
  tabActive: { background: '#271441', color: '#c9a8ff' },
  section: {},
  dateRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  dateLabel: { fontSize: 12, color: '#9b8ab8', fontWeight: 600 },
  dateInput: {
    background: '#150a26',
    border: '1px solid #2a1a45',
    borderRadius: 8,
    padding: '8px 10px',
    color: '#f0eafa',
    fontSize: 12.5,
    colorScheme: 'dark',
  },
  filterRow: { display: 'flex', gap: 6, flex: 1 },
  filterChip: {
    background: 'transparent',
    border: '1px solid #241638',
    color: '#7a6a95',
    borderRadius: 20,
    padding: '6px 11px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterChipActive: { background: '#271441', color: '#c9a8ff', borderColor: '#5b3d8f' },
  addRow: { display: 'flex', gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    background: '#150a26',
    border: '1px solid #2a1a45',
    borderRadius: 9,
    padding: '11px 12px',
    color: '#f0eafa',
    fontSize: 14,
    outline: 'none',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    width: 44,
    cursor: 'pointer',
  },
  empty: {
    color: '#7a6a95',
    fontSize: 13,
    lineHeight: 1.6,
    padding: '30px 8px',
    textAlign: 'center',
    border: '1px dashed #2a1a45',
    borderRadius: 12,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    background: '#130923',
    border: '1px solid #221336',
    borderRadius: 13,
    padding: '11px 12px',
  },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
  rankBadge: (i) => ({
    width: 24,
    height: 24,
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
    flexShrink: 0,
    background: i === 0 ? 'linear-gradient(135deg, #7c3aed, #c9a8ff)' : '#1e1132',
    color: i === 0 ? '#0a0612' : '#8a7aab',
  }),
  cardMain: { flex: 1, minWidth: 0 },
  cardNameRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  username: {
    fontSize: 13.5,
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  usernameBanned: { color: '#ff5d7a', textDecoration: 'line-through', opacity: 0.7 },
  statusBadge: { fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 6, flexShrink: 0 },
  barTrack: { height: 4, background: '#1c1130', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  expandBtn: { background: 'none', border: 'none', color: '#5c4a78', padding: 4, cursor: 'pointer', flexShrink: 0 },
  statRow: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 9, paddingLeft: 34 },
  miniStat: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#b8a9d4', fontWeight: 600 },
  trendTag: { display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700 },
  detail: { marginTop: 12, paddingTop: 12, paddingLeft: 34, borderTop: '1px solid #1e1132' },
  detailStats: { display: 'flex', gap: 20, marginBottom: 12 },
  detailValue: { fontSize: 14, fontWeight: 800, color: '#c9a8ff' },
  detailLabel: { fontSize: 9.5, color: '#6b5c87', marginTop: 1 },
  statusRow: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  statusBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    border: '1px solid #2a1a45',
    borderRadius: 7,
    padding: '6px 9px',
    fontSize: 10.5,
    fontWeight: 700,
    cursor: 'pointer',
    background: 'transparent',
  },
  deleteBtn: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    background: 'transparent',
    border: '1px solid #3a1f2b',
    color: '#ff5d7a',
    borderRadius: 7,
    padding: '6px 8px',
    cursor: 'pointer',
  },
  entryHead: {
    display: 'flex',
    gap: 8,
    padding: '0 4px 8px',
    fontSize: 10.5,
    color: '#6b5c87',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  entryHeadCol: { width: 54, textAlign: 'center' },
  entryList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '56vh', overflowY: 'auto', paddingRight: 2 },
  entryRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' },
  entryName: {
    flex: '1 1 auto',
    fontSize: 12.5,
    fontWeight: 600,
    color: '#d5c9ec',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  entryInput: {
    width: 54,
    background: '#150a26',
    border: '1px solid #2a1a45',
    borderRadius: 7,
    padding: '7px 5px',
    color: '#f0eafa',
    fontSize: 13,
    textAlign: 'center',
    outline: 'none',
  },
  pulseDot: (active) => ({
    width: 16,
    height: 16,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: active ? '#0a0612' : 'transparent',
    background: active ? '#c9a8ff' : 'transparent',
    transition: 'all 0.25s ease',
  }),
  liveNote: { textAlign: 'center', fontSize: 11, color: '#5c4a78', padding: '14px 0 6px', lineHeight: 1.5 },
};
