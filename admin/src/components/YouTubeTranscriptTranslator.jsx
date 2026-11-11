import React from 'react';
import { Globe, Languages, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const LANGUAGE_LABELS = {
  en: 'English',
  hi: 'Hindi',
  te: 'Telugu',
  ta: 'Tamil',
  bn: 'Bengali',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  gu: 'Gujarati',
  pa: 'Punjabi',
  ur: 'Urdu',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  zh: 'Chinese',
  'zh-cn': 'Chinese',
  ja: 'Japanese',
  ar: 'Arabic',
};

const NON_LATIN_SCRIPT_REGEX = /[\u0900-\u0DFF\u0600-\u06FF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/;

export const getLanguageName = (code, fallbackName = '') => {
  if (fallbackName && fallbackName.trim() && fallbackName.trim().toLowerCase() !== String(code || '').trim().toLowerCase()) {
    return fallbackName.trim();
  }
  const normalized = String(code || 'en').trim().toLowerCase();
  const base = normalized.split('-')[0];
  return LANGUAGE_LABELS[normalized] || LANGUAGE_LABELS[base] || (code || 'Unknown');
};

export const getLanguageDisplayLabel = (code, fallbackName = '') => {
  const cleanCode = String(code || 'en').trim();
  const name = getLanguageName(cleanCode, fallbackName);
  return `${name} (${cleanCode})`;
};

export const isNonEnglishLanguage = (code, text = '') => {
  const normalized = String(code || '').trim().toLowerCase();
  if (normalized && !normalized.startsWith('en') && normalized !== 'unknown') {
    return true;
  }
  if (typeof text === 'string' && NON_LATIN_SCRIPT_REGEX.test(text)) {
    return true;
  }
  return false;
};

const YouTubeTranscriptTranslator = ({
  rawText = '',
  languageCode = 'en',
  languageName = '',
  translatedText = '',
  translationStatus = 'not_required',
  viewMode = 'original',
  isTranslating = false,
  translationError = '',
  contentLabel = 'transcript',
  onTranslate,
  onViewModeChange,
}) => {
  const isTranslated = translationStatus === 'translated' && Boolean(translatedText && translatedText.trim());
  const nonEnglish = isNonEnglishLanguage(languageCode, rawText);
  const displayLang = getLanguageDisplayLabel(languageCode, languageName);
  const shortLangName = getLanguageName(languageCode, languageName);

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.6rem',
          padding: '0.6rem 0.85rem',
          borderRadius: 'var(--radius-md)',
          background: nonEnglish && !isTranslated
            ? 'rgba(245, 158, 11, 0.08)'
            : isTranslated
            ? 'rgba(16, 185, 129, 0.08)'
            : 'var(--surface-color-soft)',
          border: `1px solid ${
            nonEnglish && !isTranslated
              ? 'rgba(245, 158, 11, 0.3)'
              : isTranslated
              ? 'rgba(16, 185, 129, 0.3)'
              : 'var(--border-color)'
          }`,
        }}
      >
        {/* Left: Language Badge & Status */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span
            className="meta-pill"
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: nonEnglish ? 'var(--accent-orange)' : 'var(--text-primary)',
              borderColor: nonEnglish ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-color)',
            }}
          >
            <Globe size={13} />
            <span>{displayLang}</span>
          </span>

          {nonEnglish && !isTranslated && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Non-English {contentLabel} detected. Translate now to preview in English &amp; cache for pipeline.
            </span>
          )}

          {isTranslated && (
            <span
              className="badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '0.2rem 0.55rem',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--status-success)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              <CheckCircle2 size={12} />
              <span>English Translation Cached</span>
            </span>
          )}
        </div>

        {/* Right: Translate Action or Instant Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {!isTranslated ? (
            <button
              type="button"
              onClick={onTranslate}
              disabled={isTranslating || !rawText?.trim()}
              className={nonEnglish ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                padding: '0.4rem 0.85rem',
                fontWeight: 600,
              }}
            >
              {isTranslating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Translating...</span>
                </>
              ) : (
                <>
                  <Languages size={14} />
                  <span>Translate to English</span>
                </>
              )}
            </button>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                padding: '0.2rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-color-strong)',
                border: '1px solid var(--border-color)',
                gap: '0.2rem',
              }}
            >
              <button
                type="button"
                onClick={() => onViewModeChange('english')}
                style={{
                  padding: '0.3rem 0.7rem',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'english' ? 'var(--accent-blue)' : 'transparent',
                  color: viewMode === 'english' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                View English Translation
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('original')}
                style={{
                  padding: '0.3rem 0.7rem',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'original' ? 'var(--accent-blue)' : 'transparent',
                  color: viewMode === 'original' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                View Original ({shortLangName})
              </button>
            </div>
          )}
        </div>
      </div>

      {translationError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginTop: '0.5rem',
            padding: '0.55rem 0.8rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '0.8rem',
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{translationError}</span>
        </div>
      )}
    </div>
  );
};

export default YouTubeTranscriptTranslator;

