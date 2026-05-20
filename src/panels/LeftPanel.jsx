import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/store.js';
import {
  normalizeServiceBlocks,
  blocksToApi,
  getBlockDisplayTitle
} from '../lib/serviceBlocks.js';
import {
  Plus,
  Save,
  Upload,
  Download,
  LayoutGrid,
  BookOpen,
  Music,
  Bell,
  FileText,
  Video,
  Image,
  Square,
  Timer,
  GripVertical,
  Printer
} from 'lucide-react';

const API_BASE =
  typeof window !== 'undefined' && window.electron?.apiBase
    ? window.electron.apiBase
    : 'http://localhost:3000';

const BLOCK_ICONS = {
  scripture: BookOpen,
  song: Music,
  announcement: Bell,
  custom: FileText,
  video: Video,
  media: Image,
  countdown: Timer,
  blank: Square,
  welcome: FileText,
  sermon: FileText,
  offering: FileText,
  prayer: FileText
};

const BLOCK_TYPE_CLASS = {
  scripture: 'block-type-scripture',
  song: 'block-type-song',
  announcement: 'block-type-announcement',
  custom: 'block-type-custom',
  video: 'block-type-video',
  media: 'block-type-video',
  countdown: 'block-type-custom',
  blank: 'block-type-blank'
};

const BLOCK_TYPES = [
  'welcome',
  'song',
  'scripture',
  'countdown',
  'sermon',
  'offering',
  'prayer',
  'announcement',
  'video',
  'media',
  'custom',
  'blank'
];

function tempId() {
  try {
    return `tmp_${crypto.randomUUID()}`;
  } catch {
    return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

export default function LeftPanel() {
  const {
    servicePlan,
    setServicePlan,
    currentBlock,
    activeBlockIndex,
    activateBlockByIndex,
    getBlockTitle
  } = useStore();

  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [planTitle, setPlanTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [songs, setSongs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);

  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/plans`);
      if (!res.ok) return;
      const data = await res.json();
      setPlans(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => {
    loadPlans();
    (async () => {
      try {
        const [sRes, aRes] = await Promise.all([
          fetch(`${API_BASE}/api/songs`),
          fetch(`${API_BASE}/api/announcements`)
        ]);
        if (sRes.ok) setSongs(await sRes.json());
        if (aRes.ok) setAnnouncements(await aRes.json());
      } catch {}
    })();
  }, [loadPlans]);

  const loadPlan = async (id) => {
    if (!id) return;
    setIsLoading(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/plans/${id}`);
      if (!res.ok) throw new Error('Failed to load plan');
      const plan = await res.json();
      setActivePlanId(Number(plan.id));
      setPlanTitle(plan.title || '');
      const blocks = normalizeServiceBlocks(plan.blocks);
      setServicePlan(blocks);
      if (blocks.length > 0) {
        await activateBlockByIndex(0);
      } else {
        useStore.setState({ currentBlock: null, activeBlockIndex: -1 });
      }
    } catch (e) {
      setSaveStatus({ ok: false, message: e.message || 'Load failed' });
    }
    setIsLoading(false);
  };

  const createNewPlan = () => {
    setActivePlanId(null);
    setPlanTitle('New Service');
    setServicePlan([]);
    useStore.setState({ currentBlock: null, activeBlockIndex: -1 });
    setSaveStatus(null);
  };

  const savePlan = async () => {
    const title = String(planTitle || '').trim();
    if (!title) {
      setSaveStatus({ ok: false, message: 'Plan title is required' });
      return;
    }
    setSaveStatus(null);
    try {
      let planId = activePlanId;
      if (!planId) {
        const res = await fetch(`${API_BASE}/api/plans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, template: false })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Create plan failed');
        planId = Number(data.id);
        setActivePlanId(planId);
      } else {
        const res = await fetch(`${API_BASE}/api/plans/${planId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, template: false })
        });
        if (!res.ok) throw new Error('Update plan failed');
      }

      const blocksRes = await fetch(`${API_BASE}/api/plans/${planId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: blocksToApi(servicePlan) })
      });
      if (!blocksRes.ok) throw new Error('Save blocks failed');

      await loadPlans();
      await loadPlan(planId);
      setSaveStatus({ ok: true, message: 'Plan saved' });
    } catch (e) {
      setSaveStatus({ ok: false, message: e.message || 'Save failed' });
    }
  };

  useEffect(() => {
    const onSave = () => savePlan();
    window.addEventListener('pfp-save-plan', onSave);
    return () => window.removeEventListener('pfp-save-plan', onSave);
  });

  const addBlock = (type) => {
    const block = {
      id: tempId(),
      type,
      position: servicePlan.length,
      completed: false,
      notes: '',
      scriptureRef: type === 'scripture' ? 'John 3:16' : '',
      translation: 'KJV',
      title: type === 'welcome' ? 'Welcome' : '',
      mediaId: null,
      backgroundUrl: '',
      countdownSec: type === 'countdown' ? 600 : 0,
      sectionIndex: 0
    };
    const next = [...servicePlan, block];
    setServicePlan(next);
    activateBlockByIndex(next.length - 1);
  };

  const toggleCompleted = (index, e) => {
    e.stopPropagation();
    const next = servicePlan.map((b, i) =>
      i === index ? { ...b, completed: !b.completed } : b
    );
    setServicePlan(next);
  };

  const reorderBlocks = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= servicePlan.length || to >= servicePlan.length) return;
    const next = [...servicePlan];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setServicePlan(next);
    const curId = currentBlock?.id;
    if (curId != null) {
      const newIdx = next.findIndex((b) => b.id === curId);
      if (newIdx >= 0) useStore.setState({ activeBlockIndex: newIdx });
    }
  };

  const handleExport = async () => {
    if (!activePlanId || !window.electron?.exportPlanJson) {
      setSaveStatus({ ok: false, message: 'Save plan first to export' });
      return;
    }
    const result = await window.electron.exportPlanJson(activePlanId);
    if (result?.ok) setSaveStatus({ ok: true, message: 'Exported' });
    else if (!result?.canceled) setSaveStatus({ ok: false, message: result?.error || 'Export failed' });
  };

  const handleImport = async () => {
    if (!window.electron?.importPlanJson) return;
    const result = await window.electron.importPlanJson();
    if (result?.ok && result.id) {
      await loadPlans();
      await loadPlan(result.id);
      setSaveStatus({ ok: true, message: 'Imported' });
    } else if (!result?.canceled) {
      setSaveStatus({ ok: false, message: result?.error || 'Import failed' });
    }
  };

  const displayTitle = (block) =>
    getBlockDisplayTitle(block, { songs, announcements }) || getBlockTitle(block);

  const getBlockTypeClass = (type) => BLOCK_TYPE_CLASS[type] || 'block-type-custom';

  const handlePrint = () => {
    const blocks = Array.isArray(servicePlan) ? servicePlan : [];
    const title = String(planTitle || 'Service Order').trim() || 'Service Order';
    const rows = blocks.map((b, i) => {
      const label = displayTitle(b);
      const type = String(b?.type || '').trim();
      const notes = String(b?.notes || '').trim();
      const completed = !!b?.completed;
      return { idx: i + 1, label, type, notes, completed };
    });

    const escape = (v) =>
      String(v || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escape(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 10px; vertical-align: top; }
    th { background: #f3f3f3; text-align: left; }
    .muted { color: #666; font-size: 12px; }
    .check { font-weight: bold; }
    @media print { body { margin: 0.5in; } }
  </style>
</head>
<body>
  <h1>${escape(title)}</h1>
  <div class="meta">Printed: ${escape(new Date().toLocaleString())} • Items: ${rows.length}</div>
  <table>
    <thead>
      <tr>
        <th style="width:56px;">#</th>
        <th>Item</th>
        <th style="width:140px;">Type</th>
        <th>Notes</th>
        <th style="width:90px;">Done</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td>${r.idx}</td>
        <td><div>${escape(r.label)}</div></td>
        <td class="muted">${escape(r.type)}</td>
        <td>${escape(r.notes)}</td>
        <td class="check">${r.completed ? '✓' : ''}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>
  <script>
    window.onload = () => { try { window.print(); } catch (e) {} };
  </script>
</body>
</html>`;

    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="panel left-panel">
      <div className="panel-header">
        <div className="panel-title">
          <LayoutGrid size={16} className="panel-title-icon" />
          Service Plan
        </div>
        <div className="panel-actions">
          <button className="icon-btn" onClick={createNewPlan} title="New Plan">
            <Plus size={16} />
          </button>
          <button className="icon-btn" onClick={handlePrint} title="Print service order">
            <Printer size={16} />
          </button>
          {window.electron?.importPlanJson && (
            <button className="icon-btn" onClick={handleImport} title="Import .pfp">
              <Upload size={16} />
            </button>
          )}
          {window.electron?.exportPlanJson && (
            <button className="icon-btn" onClick={handleExport} title="Export .pfp" disabled={!activePlanId}>
              <Download size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="panel-body">
        <div className="plan-toolbar">
          <select
            className="form-select form-select-sm"
            value={activePlanId || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v) loadPlan(v);
              else createNewPlan();
            }}
            disabled={isLoading}
          >
            <option value="">-- Select Plan --</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title || `Plan #${plan.id}`}
              </option>
            ))}
          </select>
          <button className="icon-btn icon-btn-sm" onClick={savePlan} title="Save Plan (Ctrl+S)">
            <Save size={14} />
          </button>
        </div>

        <input
          className="form-input form-input-sm"
          style={{ marginBottom: 8 }}
          value={planTitle}
          onChange={(e) => setPlanTitle(e.target.value)}
          placeholder="Service plan title"
        />

        <div className="plan-toolbar" style={{ marginBottom: 8 }}>
          <select
            className="form-select form-select-sm"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                addBlock(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="">+ Add block...</option>
            {BLOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {saveStatus && (
          <div className={`settings-message ${saveStatus.ok ? 'ok' : 'error'}`} style={{ marginBottom: 8 }}>
            {saveStatus.message}
          </div>
        )}

        <div className="plan-list">
          {servicePlan.length === 0 ? (
            <div className="empty-state">
              <p>No items in service plan</p>
              <p className="text-sm text-muted">Select a plan or add blocks</p>
            </div>
          ) : (
            servicePlan.map((block, index) => {
              const Icon = BLOCK_ICONS[block.type] || FileText;
              const isActive = activeBlockIndex === index || currentBlock?.id === block.id;
              return (
                <div
                  key={block.id || index}
                  className={`plan-block ${isActive ? 'active' : ''} ${block.completed ? 'completed' : ''}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex != null) reorderBlocks(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  onClick={() => activateBlockByIndex(index)}
                >
                  <div className="plan-block-handle">
                    <GripVertical size={16} />
                  </div>
                  <div className="plan-block-content">
                    <div className={`plan-block-type ${getBlockTypeClass(block.type)}`}>
                      <Icon size={14} />
                      <span>{block.type || 'custom'}</span>
                    </div>
                    <div className="plan-block-title">{displayTitle(block)}</div>
                  </div>
                  <div className="plan-block-actions">
                    <button
                      className="icon-btn icon-btn-sm"
                      onClick={(e) => toggleCompleted(index, e)}
                      title={block.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {block.completed ? '○' : '✓'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
