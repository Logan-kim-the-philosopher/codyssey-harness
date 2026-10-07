import { EditorState, RangeSet } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { EditorView, Decoration, GutterMarker, gutterLineClass, hoverTooltip, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { findGrammarHelp } from './grammar-reference.mjs';

const languageExtensions = {
  css,
  html,
  javascript,
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  python,
};
let loadingCursor;

function showLoadingCursor(event) {
  if (!loadingCursor) {
    loadingCursor = document.createElement('span');
    loadingCursor.className = 'grammar-loading-cursor';
    loadingCursor.setAttribute('aria-hidden', 'true');
    document.body.append(loadingCursor);
  }
  loadingCursor.style.left = `${event.clientX}px`;
  loadingCursor.style.top = `${event.clientY}px`;
  loadingCursor.classList.add('visible');
}

function hideLoadingCursor() {
  loadingCursor?.classList.remove('visible');
}

class SelectedGutterMarker extends GutterMarker {
  get elementClass() { return 'cm-code-selected-gutter'; }
  eq(other) { return other instanceof SelectedGutterMarker; }
}

const selectedGutterMarker = new SelectedGutterMarker();

const codeHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c084fc' },
  { tag: t.definition(t.variableName), color: '#e9eef7' },
  { tag: t.function(t.variableName), color: '#d2a8ff' },
  { tag: t.string, color: '#86efac' },
  { tag: t.number, color: '#7dd3fc' },
  { tag: t.operator, color: '#e9eef7' },
  { tag: t.comment, color: '#94a3b8' },
  { tag: t.tagName, color: '#fda4af' },
  { tag: t.attributeName, color: '#7dd3fc' },
  { tag: t.attributeValue, color: '#86efac' },
  { tag: t.propertyName, color: '#7dd3fc' },
  { tag: t.className, color: '#d2a8ff' },
]);

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#0a1c3e', color: '#e9eef7' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: '15px', lineHeight: '1.55' },
  '.cm-content': { minWidth: 'max-content', padding: '18px 24px 24px 0', caretColor: 'transparent' },
  '.cm-line': { padding: '0', minWidth: 'calc(100% + 24px)' },
  '.cm-gutters': { backgroundColor: '#0a1c3e', color: '#7890ad', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '54px', padding: '0 18px 0 0', textAlign: 'right' },
  '.cm-code-selected': { backgroundColor: 'rgba(143,210,255,.16)' },
  '.cm-code-selected-gutter': { color: '#8fd2ff', backgroundColor: '#162c3a', boxShadow: 'inset 4px 0 #8fd2ff' },
  '&.cm-grammar-waiting, &.cm-grammar-waiting *': { cursor: 'none !important' },
  '.cm-tooltip': { border: '1px solid #40566b', borderRadius: '6px', padding: '10px 12px', backgroundColor: '#111a23', color: '#e8f1f8', boxShadow: '0 8px 28px rgba(0,0,0,.45)' },
  '.cm-tooltip-grammar-title': { color: '#8fd2ff', fontWeight: '700', marginBottom: '4px' },
  '.cm-tooltip-grammar-body': { maxWidth: '320px', whiteSpace: 'normal', lineHeight: '1.45' },
}, { dark: true });

function grammarHover(language, enabled) {
  const grammarLanguage = language === 'jsx' || language === 'tsx' ? 'javascript' : language;
  return hoverTooltip((view, pos) => {
    if (!enabled()) return null;
    const result = findGrammarHelp(grammarLanguage, syntaxTree(view.state).resolveInner(pos, -1));
    if (result) {
        return {
          pos: result.node.from,
          end: result.node.to,
          above: true,
          create() {
            const dom = document.createElement('div');
            const title = document.createElement('div');
            const body = document.createElement('div');
            title.className = 'cm-tooltip-grammar-title';
            title.textContent = result.definition[0];
            body.className = 'cm-tooltip-grammar-body';
            body.textContent = result.definition[1];
            dom.append(title, body);
            return { dom };
          },
        };
    }
    return null;
  }, { hoverTime: 0 });
}

function createEditor(container, data) {
  let grammarMode = false;
  let hoverWaitTimer;
  const languageSupport = languageExtensions[data.language];
  const selectedLineStarts = [];
  let lineStart = 0;
  data.source.split('\n').forEach((line, index) => {
    if (data.selectedLines.includes(index + 1)) selectedLineStarts.push(selectedGutterMarker.range(lineStart));
    lineStart += line.length + 1;
  });
  const selectedGutterLines = RangeSet.of(selectedLineStarts, true);
  const selectedLineDecoration = EditorView.decorations.of((view) => Decoration.set(
    data.selectedLines.map((line) => Decoration.line({ class: 'cm-code-selected' }).range(view.state.doc.line(line).from)),
    true,
  ));
  const view = new EditorView({
    parent: container,
    state: EditorState.create({
      doc: data.source,
      extensions: [
        lineNumbers({ formatNumber: (number) => String(number) }),
        languageSupport ? languageSupport() : [],
        syntaxHighlighting(codeHighlight),
        editorTheme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        selectedLineDecoration,
        gutterLineClass.of(selectedGutterLines),
        grammarHover(data.language, () => grammarMode),
      ],
    }),
  });
  const clearHoverWait = () => {
    clearTimeout(hoverWaitTimer);
    hoverWaitTimer = undefined;
    view.dom.classList.remove('cm-grammar-waiting');
    hideLoadingCursor();
  };
  view.dom.addEventListener('pointermove', (event) => {
    if (!grammarMode) return;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const node = pos == null ? null : syntaxTree(view.state).resolveInner(pos, -1);
    const grammarLanguage = data.language === 'jsx' || data.language === 'tsx' ? 'javascript' : data.language;
    if (!node || !findGrammarHelp(grammarLanguage, node)) {
      clearHoverWait();
      return;
    }
    clearHoverWait();
  });
  view.dom.addEventListener('pointerleave', clearHoverWait);
  return {
    view,
    setGrammarMode(enabled) {
      grammarMode = enabled;
      if (!enabled) clearHoverWait();
    },
    refresh() {
      view.requestMeasure();
      if (data.selectedLines.length) {
        const position = view.state.doc.line(data.selectedLines[0]).from;
        view.dispatch({ effects: EditorView.scrollIntoView(position, { y: 'start' }) });
      }
    },
  };
}

const editorsBySlide = new Map();
document.querySelectorAll('[data-editor]').forEach((container) => {
  const rows = [...container.querySelectorAll('.editor-line')];
  const data = {
    language: container.dataset.language,
    source: rows.map((row) => {
      const text = row.querySelector('code')?.textContent || '';
      return text === '\u00a0' ? '' : text;
    }).join('\n'),
    selectedLines: rows.flatMap((row, index) => row.classList.contains('selected') ? [index + 1] : []),
  };
  if (!rows.length || !languageExtensions[data.language]) return;
  container.replaceChildren();
  const editor = createEditor(container, data);
  const slide = container.closest('.editor-slide');
  if (!editorsBySlide.has(slide)) editorsBySlide.set(slide, []);
  editorsBySlide.get(slide).push(editor);
});

window.codysseyGrammarMode = (slide, enabled) => {
  for (const editor of editorsBySlide.get(slide) || []) editor.setGrammarMode(enabled);
};
window.codysseyRefreshEditors = (slide) => {
  for (const editor of editorsBySlide.get(slide) || []) editor.refresh();
};
