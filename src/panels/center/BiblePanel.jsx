import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { useStore } from '../../store/store.js';
import { Search } from 'lucide-react';

const API_BASE = (typeof window !== 'undefined' && window.electron?.apiBase)
  ? window.electron.apiBase
  : 'http://localhost:3000';

const BiblePanel = forwardRef((props, ref) => {
  const { setDisplayContent, displayContent, goLive, broadcast } = useStore();
  const [verseInput, setVerseInput] = useState('John 3:16');
  const [translation, setTranslation] = useState('KJV');
  const [secondEnabled, setSecondEnabled] = useState(false);
  const [secondTranslation, setSecondTranslation] = useState('NKJV');
  const [availableTranslations, setAvailableTranslations] = useState(['KJV']);
  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [book, setBook] = useState('John');
  const [chapter, setChapter] = useState(3);
  const [verse, setVerse] = useState(16);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const navLock = useRef(false);
  const verseInputRef = useRef(null);
  const [keyword, setKeyword] = useState('');
  const [keywordTranslation, setKeywordTranslation] = useState('');
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordResults, setKeywordResults] = useState([]);
  const [studyNote, setStudyNote] = useState('');
  const [studyAuto, setStudyAuto] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState([]);
  const [aiError, setAiError] = useState(null);

  useEffect(() => {
    const onFocus = () => {
      try {
        verseInputRef.current?.focus?.();
        verseInputRef.current?.select?.();
      } catch {}
    };
    window.addEventListener('pfp-focus-bible', onFocus);
    return () => window.removeEventListener('pfp-focus-bible', onFocus);
  }, []);

  useEffect(() => {
    const loadTranslations = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/bible/translations`);
        if (!response.ok) return;
        const data = await response.json();
        const list = Array.isArray(data.translations) ? data.translations.filter(Boolean) : [];
        if (list.length) {
          setAvailableTranslations(list);
          if (!list.includes(translation)) setTranslation(list[0]);
          if (!list.includes(secondTranslation)) setSecondTranslation(list[0] === 'KJV' ? (list[1] || list[0]) : list[0]);
        }
      } catch {}
    };
    loadTranslations();
    const onImported = () => loadTranslations();
    window.addEventListener('bible-imported', onImported);
    return () => window.removeEventListener('bible-imported', onImported);
  }, []);

  useEffect(() => {
    const loadBooks = async () => {
      setBooksLoading(true);
      try {
        const url = new URL(`${API_BASE}/api/bible/books`);
        url.searchParams.set('translation', translation);
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data.books) ? data.books.filter(Boolean) : [];
        setBooks(list);
        if (list.length && !list.includes(book)) {
          setBook(list[0]);
          setChapter(1);
          setVerse(1);
        }
      } catch {}
      finally {
        setBooksLoading(false);
      }
    };
    loadBooks();
  }, [translation]);

  const parseReference = (refText) => {
    const m = String(refText || '').trim().match(/^(.+?)\s+(\d+):(\d+)/);
    if (!m) return null;
    const parsedBook = m[1].trim();
    const ch = Number(m[2]);
    const vs = Number(m[3]);
    if (!parsedBook || !Number.isFinite(ch) || !Number.isFinite(vs)) return null;
    return { book: parsedBook, chapter: ch, verse: vs };
  };

  const refFromParts = (b = book, ch = chapter, vs = verse) => `${b} ${ch}:${vs}`;

  const runScriptureSuggester = async () => {
    const topic = String(aiTopic || '').trim();
    if (!topic) return;
    setAiLoading(true);
    setAiError(null);
    setAiResults([]);
    try {
      const res = await fetch(`${API_BASE}/api/ai/scripture-suggester`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'AI request failed');
      setAiResults(Array.isArray(data.results) ? data.results : []);
    } catch (e) {
      setAiError(e.message || 'AI unavailable — set API key in Settings');
    } finally {
      setAiLoading(false);
    }
  };

  const runRelatedPassages = async () => {
    const reference = String(displayContent?.reference || verseInput || '').trim();
    if (!reference) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(`${API_BASE}/api/ai/related-passages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'AI request failed');
      const refs = Array.isArray(data.references) ? data.references : [];
      setAiResults(refs.map((reference) => ({ reference, why: '' })));
    } catch (e) {
      setAiError(e.message || 'AI unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const getMaxChapter = async (b) => {
    const url = new URL(`${API_BASE}/api/bible/max`);
    url.searchParams.set('translation', translation);
    url.searchParams.set('book', b);
    const res = await fetch(url.toString());
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.maxChapter) || 0;
  };

  const getMaxVerse = async (b, ch) => {
    const url = new URL(`${API_BASE}/api/bible/max`);
    url.searchParams.set('translation', translation);
    url.searchParams.set('book', b);
    url.searchParams.set('chapter', String(ch));
    const res = await fetch(url.toString());
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.maxVerse) || 0;
  };

  const handleSearchVerse = async (verse = verseInput, trans = translation) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/verse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: verse,
          translation: trans,
          secondTranslation: secondEnabled ? secondTranslation : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to search verse');
      }

      const verseData = await response.json();
      const parsed = parseReference(verseData.reference);
      if (parsed) {
        setBook(parsed.book);
        setChapter(parsed.chapter);
        setVerse(parsed.verse);
        setVerseInput(verseData.reference);
      }
      setDisplayContent({
        text: verseData.text,
        reference: verseData.reference,
        translation: verseData.translation
      });
      if (studyAuto) {
        await broadcast({
          type: 'PREACHER_VERSE',
          payload: {
            text: verseData.text,
            reference: verseData.reference,
            translation: verseData.translation,
            note: studyNote || ''
          }
        });
      }

      const newEntry = { reference: verseData.reference, translation: trans };
      setHistory([...history, newEntry]);
      setHistoryIndex(history.length);
    } catch (err) {
      setError(err.message);
      if (import.meta.env.DEV) console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoParts = async () => {
    const b = String(book || '').trim();
    const ch = Number(chapter);
    const vs = Number(verse);
    if (!b || !Number.isFinite(ch) || !Number.isFinite(vs)) return;
    const refText = refFromParts(b, ch, vs);
    setVerseInput(refText);
    await handleSearchVerse(refText, translation);
  };

  const searchKeywords = async () => {
    const q = keyword.trim();
    if (!q) return;
    setKeywordLoading(true);
    try {
      const url = new URL(`${API_BASE}/api/bible/search`);
      url.searchParams.set('q', q);
      if (keywordTranslation) url.searchParams.set('translation', keywordTranslation);
      const res = await fetch(url.toString());
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const results = Array.isArray(data.results) ? data.results : [];
      setKeywordResults(results);
    } finally {
      setKeywordLoading(false);
    }
  };

  const sendStudyToPreacher = async () => {
    const payload = {
      text: displayContent?.text || '',
      reference: displayContent?.reference || '',
      translation: displayContent?.translation || translation,
      note: studyNote || ''
    };
    if (!String(payload.reference || '').trim() && !String(payload.text || '').trim()) return;
    await broadcast({ type: 'PREACHER_VERSE', payload });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearchVerse();
    }
  };

  const navigateRelative = async (delta) => {
    if (navLock.current) return;
    navLock.current = true;
    try {
      const currentBook = String(book || '').trim();
      const currentChapter = Number(chapter);
      const currentVerse = Number(verse);
      if (!currentBook || !Number.isFinite(currentChapter) || !Number.isFinite(currentVerse)) return;

      const bookList = books.length ? books : [currentBook];
      let bookIdx = Math.max(0, bookList.indexOf(currentBook));
      let ch = currentChapter;
      let vs = currentVerse + delta;

      if (delta > 0) {
        const maxV = await getMaxVerse(bookList[bookIdx], ch);
        if (vs <= maxV) {
          setVerse(vs);
          await handleSearchVerse(refFromParts(bookList[bookIdx], ch, vs), translation);
          return;
        }
        const maxCh = await getMaxChapter(bookList[bookIdx]);
        if (ch < maxCh) {
          ch += 1;
          vs = 1;
          setChapter(ch);
          setVerse(vs);
          await handleSearchVerse(refFromParts(bookList[bookIdx], ch, vs), translation);
          return;
        }
        if (bookIdx < bookList.length - 1) {
          bookIdx += 1;
        } else {
          bookIdx = 0;
        }
        ch = 1;
        vs = 1;
        setBook(bookList[bookIdx]);
        setChapter(ch);
        setVerse(vs);
        await handleSearchVerse(refFromParts(bookList[bookIdx], ch, vs), translation);
        return;
      }

      if (delta < 0) {
        if (vs >= 1) {
          setVerse(vs);
          await handleSearchVerse(refFromParts(bookList[bookIdx], ch, vs), translation);
          return;
        }
        if (ch > 1) {
          ch -= 1;
          const maxV = await getMaxVerse(bookList[bookIdx], ch);
          vs = maxV || 1;
          setChapter(ch);
          setVerse(vs);
          await handleSearchVerse(refFromParts(bookList[bookIdx], ch, vs), translation);
          return;
        }
        if (bookIdx > 0) {
          bookIdx -= 1;
        } else {
          bookIdx = bookList.length - 1;
        }
        const maxCh = await getMaxChapter(bookList[bookIdx]);
        ch = maxCh || 1;
        const maxV = await getMaxVerse(bookList[bookIdx], ch);
        vs = maxV || 1;
        setBook(bookList[bookIdx]);
        setChapter(ch);
        setVerse(vs);
        await handleSearchVerse(refFromParts(bookList[bookIdx], ch, vs), translation);
      }
    } finally {
      navLock.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    triggerNext: () => {
      void navigateRelative(1);
    },
    triggerPrev: () => {
      void navigateRelative(-1);
    },
    focusSearch: () => {
      try {
        verseInputRef.current?.focus?.();
        verseInputRef.current?.select?.();
      } catch {}
    }
  }));

  return (
    <div className="center-panel-inner bible-panel">
      <div className="search-area">
        <div className="bible-section">
          <div className="bible-section-title">Book / Chapter / Verse</div>

          <select value={book} onChange={(e) => { setBook(e.target.value); setChapter(1); setVerse(1); }} className="translation-select">
            {booksLoading && <option value={book}>Loading books...</option>}
            {!booksLoading && (books.length ? books : [book]).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <div className="editor-row" style={{ gridTemplateColumns: '1fr 1fr auto auto', alignItems: 'center' }}>
            <input
              className="search-input"
              inputMode="numeric"
              value={chapter}
              onChange={(e) => setChapter(Number(e.target.value) || 1)}
              placeholder="Chapter"
            />
            <input
              className="search-input"
              inputMode="numeric"
              value={verse}
              onChange={(e) => setVerse(Number(e.target.value) || 1)}
              placeholder="Verse"
            />
            <button className="btn-mini" onClick={() => void navigateRelative(-1)} title="Previous verse">
              Prev
            </button>
            <button className="btn-mini" onClick={() => void navigateRelative(1)} title="Next verse">
              Next
            </button>
          </div>

          <div className="editor-actions" style={{ marginTop: 10 }}>
            <button onClick={handleGoParts} disabled={loading} className="btn-search">
              {loading ? 'Loading...' : 'Go'}
            </button>
          </div>
        </div>

        <div className="bible-section">
          <div className="bible-section-title">Reference Search</div>

          <div className="search-input-group">
            <input
              type="text"
              value={verseInput}
              onChange={(e) => setVerseInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., John 3:16 or Romans 8:28-30"
              className="search-input"
              ref={verseInputRef}
            />
            <button onClick={() => handleSearchVerse()} disabled={loading} className="btn-search">
              <Search size={20} />
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <select value={translation} onChange={(e) => setTranslation(e.target.value)} className="translation-select" style={{ marginBottom: 0 }}>
            {availableTranslations.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="bible-inline-row">
            <label className="bible-inline-label">
              <input type="checkbox" checked={secondEnabled} onChange={(e) => setSecondEnabled(e.target.checked)} />
              Second translation
            </label>
            {secondEnabled && (
              <select value={secondTranslation} onChange={(e) => setSecondTranslation(e.target.value)} className="translation-select" style={{ marginBottom: 0 }}>
                {availableTranslations.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="bible-section">
          <div className="bible-section-title">Keyword Search</div>

          <div className="search-input-group">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchKeywords();
              }}
              placeholder="e.g., love world"
              className="search-input"
            />
            <button onClick={searchKeywords} disabled={keywordLoading} className="btn-search">
              {keywordLoading ? 'Searching...' : 'Find'}
            </button>
          </div>
          <select value={keywordTranslation} onChange={(e) => setKeywordTranslation(e.target.value)} className="translation-select" style={{ marginBottom: 0 }}>
            <option value="">All translations</option>
            {availableTranslations.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {keywordResults.length > 0 && (
            <div className="item-list keyword-results">
              {keywordResults.slice(0, 30).map((r, idx) => (
                <div
                  key={`${r.reference}_${r.translation}_${idx}`}
                  className="item-row"
                  onClick={() => {
                    setTranslation(r.translation || translation);
                    setVerseInput(r.reference);
                    handleSearchVerse(r.reference, r.translation || translation);
                  }}
                >
                  <div className="item-title">{r.reference} ({r.translation})</div>
                  <div className="item-sub">{String(r.text || '').slice(0, 120)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="bible-section">
        <div className="bible-section-title">AI Assist (optional)</div>
        <div className="search-input-group">
          <input
            type="text"
            className="search-input"
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder="Sermon topic for scripture suggestions"
          />
          <button type="button" className="btn-search" disabled={aiLoading} onClick={runScriptureSuggester}>
            {aiLoading ? '…' : 'Suggest'}
          </button>
        </div>
        <div className="editor-actions" style={{ marginBottom: 8 }}>
          <button type="button" className="btn-secondary" disabled={aiLoading} onClick={runRelatedPassages}>
            Related to current verse
          </button>
        </div>
        {aiError && <div className="error-message">{aiError}</div>}
        {aiResults.length > 0 && (
          <div className="item-list keyword-results">
            {aiResults.map((r, idx) => (
              <div
                key={`${r.reference}_${idx}`}
                className="item-row"
                onClick={() => {
                  setVerseInput(r.reference);
                  handleSearchVerse(r.reference, translation);
                }}
              >
                <div className="item-title">{r.reference}</div>
                {r.why && <div className="item-sub">{r.why}</div>}
              </div>
            ))}
          </div>
        )}
      </div>


      {error && (
        <div className="error-message">
          <strong>Search Failed:</strong> {error}
          <div style={{ fontSize: '12px', marginTop: '8px', color: '#CCC' }}>
            Try: John 3:16, Romans 8:28, Psalms 23:1, Genesis 1:1
          </div>
        </div>
      )}

      <div className="preview-area">
        <div className="bible-preview-block">
          <div className="preview-label">Preview {goLive && '(LIVE)'}</div>
          <div className="preview-content bible-preview-content">
            {displayContent.text ? (
              <>
                <div className="preview-verse">{displayContent.text}</div>
                <div className="preview-reference">{displayContent.reference}</div>
                <div className="preview-translation">{displayContent.translation}</div>
              </>
            ) : (
              <span>Search for a verse to preview</span>
            )}
          </div>
        </div>

        <div className="bible-study-block">
          <div className="preview-label">Pastor Study Mode (Preacher Only)</div>
          <label className="bible-inline-label">
            <input type="checkbox" checked={studyAuto} onChange={(e) => setStudyAuto(e.target.checked)} />
            Auto-send verse to preacher
          </label>
          <textarea
            className="editor-textarea bible-study-textarea"
            value={studyNote}
            onChange={(e) => setStudyNote(e.target.value)}
            placeholder="Private commentary / notes"
          />
          <div className="editor-actions">
            <button className="btn-secondary" onClick={sendStudyToPreacher} disabled={!displayContent?.reference && !displayContent?.text}>
              Send To Preacher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

BiblePanel.displayName = 'BiblePanel';
export default BiblePanel;

