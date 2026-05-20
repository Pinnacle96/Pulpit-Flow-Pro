import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { useStore } from '../store/store.js';
import { BookOpen, Music, Bell, LayoutGrid, Settings, Image } from 'lucide-react';
import BiblePanel from './center/BiblePanel.jsx';
import SongsPanel from './center/SongsPanel.jsx';
import AnnouncementsPanel from './center/AnnouncementsPanel.jsx';
import BlockPanel from './center/BlockPanel.jsx';
import MediaPanel from './center/MediaPanel.jsx';

const CenterPanel = forwardRef((props, ref) => {
  const { centerTab, setCenterTab, currentBlock } = useStore();
  const bibleRef = useRef(null);

  useEffect(() => {
    if (currentBlock) setCenterTab('block');
  }, [currentBlock?.id, setCenterTab]);

  useImperativeHandle(ref, () => ({
    triggerNext: () => {
      if (centerTab === 'bible') bibleRef.current?.triggerNext?.();
    },
    triggerPrev: () => {
      if (centerTab === 'bible') bibleRef.current?.triggerPrev?.();
    },
    focusBibleSearch: () => {
      bibleRef.current?.focusSearch?.();
    }
  }));

  const tabs = [
    { id: 'bible', label: 'Bible', icon: BookOpen },
    { id: 'songs', label: 'Songs', icon: Music },
    { id: 'announcements', label: 'Announcements', icon: Bell },
    { id: 'media', label: 'Media', icon: Image },
    { id: 'block', label: 'Block', icon: Settings }
  ];

  return (
    <div className="center-panel panel">
      <div className="panel-header panel-header-minimal">
        <div className="panel-title">
          <LayoutGrid size={16} className="panel-title-icon" />
          Content
        </div>
      </div>
      <div className="center-tab-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={centerTab === tab.id}
            className={`center-tab ${centerTab === tab.id ? 'active' : ''}`}
            onClick={() => setCenterTab(tab.id)}
          >
            <tab.icon size={15} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="panel-body panel-body-flush">
        {centerTab === 'bible' && <BiblePanel ref={bibleRef} />}
        {centerTab === 'songs' && <SongsPanel />}
        {centerTab === 'announcements' && <AnnouncementsPanel />}
        {centerTab === 'media' && <MediaPanel />}
        {centerTab === 'block' && <BlockPanel />}
      </div>
    </div>
  );
});

CenterPanel.displayName = 'CenterPanel';
export default CenterPanel;
