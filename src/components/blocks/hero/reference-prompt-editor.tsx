'use client';

import { cn } from '@/lib/utils';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export type RefKind = 'image' | 'video' | 'audio';

export interface RefItem {
  id: string;
  /** Optional thumbnail for image chips. */
  thumbUrl?: string;
  /** Optional display name override (e.g. role name). When absent, falls
   *  back to the numbered label `Image1` / `Video2` / `Audio3`. */
  label?: string;
}

export interface ReferencePromptEditorHandle {
  /** Imperatively insert a chip at the current cursor position. If the
   *  editor isn't focused, appends to the end. */
  insertRef: (kind: RefKind, id: string) => void;
  focus: () => void;
}

interface ReferencePromptEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  onEnter?: () => void;
  /** Current reference items, used to number chips and feed the @-picker. */
  images: RefItem[];
  videos: RefItem[];
  audios: RefItem[];
  /** Called when a chip is removed via backspace or its X button so the
   *  parent can also drop the underlying reference. */
  onRefRemove?: (kind: RefKind, id: string) => void;
  /** Fired whenever the editor detects whether the caret is in a `@xxx`
   *  mention literal (i.e. an `@` followed by non-whitespace chars, with
   *  chip contents excluded). Lets the parent drive the asset / role
   *  picker that already exists outside the editor. */
  onMentionChange?: (open: boolean, query: string) => void;
  /** Whether the parent-rendered mention picker is currently open.
   *  Suppresses Enter-to-generate while open so picker selection works. */
  mentionOpen?: boolean;
  /** Asks the parent to close the mention picker (e.g. on Escape). */
  onCloseMention?: () => void;
}

const REF_PATTERN = /\{\{ref:(image|video|audio):([^}]+)\}\}/g;

interface Segment {
  kind: 'text' | 'ref';
  text?: string;
  refKind?: RefKind;
  refId?: string;
}

function parseSegments(value: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  REF_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iter pattern
  while ((match = REF_PATTERN.exec(value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: 'text',
        text: value.slice(lastIndex, match.index),
      });
    }
    segments.push({
      kind: 'ref',
      refKind: match[1] as RefKind,
      refId: match[2],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    segments.push({ kind: 'text', text: value.slice(lastIndex) });
  }
  return segments;
}

/** Serializes the contenteditable DOM back into the flat `{{ref:...}}`
 *  marker string. Walks `data-ref-*` spans for chips and concatenates
 *  raw text everywhere else. */
function serializeDom(root: HTMLElement): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const refKind = el.dataset.refKind as RefKind | undefined;
    const refId = el.dataset.refId;
    if (refKind && refId) {
      out += `{{ref:${refKind}:${refId}}}`;
      return;
    }
    if (el.tagName === 'BR') {
      out += '\n';
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
    if (
      el.tagName === 'DIV' &&
      el !== root &&
      !out.endsWith('\n') &&
      el.nextSibling
    ) {
      out += '\n';
    }
  };
  for (const child of Array.from(root.childNodes)) walk(child);
  return out;
}

function buildChipNode(
  kind: RefKind,
  id: string,
  label: string,
  thumbUrl?: string
): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.dataset.refKind = kind;
  span.dataset.refId = id;
  span.className = cn(
    'mx-0.5 inline-flex select-none items-center gap-1 rounded-md px-1.5 py-0.5 align-baseline text-[0.95em] leading-tight ring-1',
    kind === 'image' && 'bg-indigo-50 text-indigo-700 ring-indigo-200/70',
    kind === 'video' && 'bg-violet-50 text-violet-700 ring-violet-200/70',
    kind === 'audio' && 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    'dark:bg-foreground/[0.08] dark:text-foreground dark:ring-white/10'
  );
  if (kind === 'image' && thumbUrl) {
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.alt = '';
    img.className = 'size-4 rounded-full object-cover';
    img.loading = 'lazy';
    span.appendChild(img);
  } else {
    const icon = document.createElement('span');
    icon.className = cn(
      'inline-flex size-4 items-center justify-center rounded-sm',
      kind === 'video' && 'text-violet-600 dark:text-violet-300',
      kind === 'audio' && 'text-emerald-600 dark:text-emerald-300'
    );
    icon.innerHTML =
      kind === 'video'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polygon points="23 7 16 12 23 17 23 7" /><rect width="15" height="14" x="1" y="5" rx="2" ry="2" /></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>';
    span.appendChild(icon);
  }
  const text = document.createElement('span');
  text.textContent = label;
  text.className = 'font-medium';
  span.appendChild(text);
  return span;
}

function renderInto(
  root: HTMLElement,
  value: string,
  resolveLabel: (kind: RefKind, id: string) => string | null,
  resolveThumb: (kind: RefKind, id: string) => string | undefined
): void {
  root.innerHTML = '';
  const segments = parseSegments(value);
  for (const seg of segments) {
    if (seg.kind === 'text' && seg.text !== undefined) {
      const lines = seg.text.split('\n');
      lines.forEach((line, idx) => {
        if (line.length > 0) root.appendChild(document.createTextNode(line));
        if (idx < lines.length - 1)
          root.appendChild(document.createElement('br'));
      });
    } else if (seg.kind === 'ref' && seg.refKind && seg.refId) {
      const label = resolveLabel(seg.refKind, seg.refId);
      if (label === null) continue; // orphan marker — silently drop
      const thumb = resolveThumb(seg.refKind, seg.refId);
      root.appendChild(buildChipNode(seg.refKind, seg.refId, label, thumb));
    }
  }
  // Trailing zero-width text node so the caret has somewhere to land
  // after a closing chip.
  root.appendChild(document.createTextNode(''));
}

function placeCaretAtEnd(root: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export const ReferencePromptEditor = forwardRef<
  ReferencePromptEditorHandle,
  ReferencePromptEditorProps
>(function ReferencePromptEditor(
  {
    value,
    onChange,
    placeholder,
    disabled,
    maxLength = 4000,
    className,
    onEnter,
    images,
    videos,
    audios,
    onRefRemove,
    onMentionChange,
    mentionOpen = false,
    onCloseMention,
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>('');
  const [empty, setEmpty] = useState(value.length === 0);

  const resolveLabel = useCallback(
    (kind: RefKind, id: string): string | null => {
      const list =
        kind === 'image' ? images : kind === 'video' ? videos : audios;
      const idx = list.findIndex((i) => i.id === id);
      if (idx === -1) return null;
      const item = list[idx];
      const numbered =
        kind === 'image'
          ? `Image${idx + 1}`
          : kind === 'video'
            ? `Video${idx + 1}`
            : `Audio${idx + 1}`;
      return `@${item.label ?? numbered}`;
    },
    [images, videos, audios]
  );

  const resolveThumb = useCallback(
    (kind: RefKind, id: string): string | undefined => {
      if (kind !== 'image') return undefined;
      return images.find((i) => i.id === id)?.thumbUrl;
    },
    [images]
  );

  // Sync DOM with value. We skip the full rebuild when `value` already
  // matches what we last emitted — that's the case for every keystroke
  // the user types, where rebuilding would destroy the caret's anchor
  // text node and bounce the cursor to the start of the editor. Renumber
  // existing chip labels in place instead so external item changes
  // (e.g. removing Image 1 → Image 2 becomes Image 1) still propagate.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (value !== lastEmittedRef.current) {
      renderInto(root, value, resolveLabel, resolveThumb);
      lastEmittedRef.current = value;
      setEmpty(value.length === 0);
      return;
    }
    // value already matches the DOM. Refresh chip labels in place so a
    // sibling chip's removal can renumber the rest without a rebuild.
    const chips = root.querySelectorAll<HTMLElement>(
      '[data-ref-kind][data-ref-id]'
    );
    chips.forEach((chip) => {
      const kind = chip.dataset.refKind as RefKind;
      const id = chip.dataset.refId;
      if (!id) return;
      const newLabel = resolveLabel(kind, id);
      if (newLabel === null) return; // orphan; caller is expected to drop the marker
      const labelSpan = chip.lastElementChild;
      if (labelSpan && labelSpan.textContent !== newLabel) {
        labelSpan.textContent = newLabel;
      }
    });
  }, [value, resolveLabel, resolveThumb]);

  /** Walk root's flat child list from start up to the caret, collecting
   *  visible text. Chips are treated as a non-`@` placeholder (space) so
   *  their inner "@Buddy" label can't trigger the @-picker. */
  const collectTextBeforeCaret = useCallback((): string | null => {
    const root = rootRef.current;
    if (!root) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      return null;
    }
    const range = sel.getRangeAt(0);
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const flat = Array.from(root.childNodes);
    let endIdx: number;
    let tailText = '';
    if (startContainer === root) {
      endIdx = startOffset;
    } else {
      endIdx = flat.indexOf(startContainer as ChildNode);
      if (endIdx === -1) return null;
      if (startContainer.nodeType === Node.TEXT_NODE) {
        tailText = (startContainer.textContent ?? '').slice(0, startOffset);
      }
    }
    let out = '';
    for (let i = 0; i < endIdx; i++) {
      const n = flat[i];
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.textContent ?? '';
      } else if (
        n.nodeType === Node.ELEMENT_NODE &&
        (n as HTMLElement).dataset.refKind
      ) {
        out += ' '; // chip acts as a non-`@` separator
      } else if ((n as HTMLElement).tagName === 'BR') {
        out += '\n';
      }
    }
    return out + tailText;
  }, []);

  const emitChange = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const serialized = serializeDom(root);
    if (serialized.length > maxLength) return;
    lastEmittedRef.current = serialized;
    setEmpty(serialized.length === 0);

    // @-picker trigger: report to the parent whether the text before the
    // caret ends in an `@xxx` literal. Chip contents are excluded from
    // the scan so a caret parked right after `@Buddy` doesn't re-open
    // the picker. The parent owns the actual picker UI.
    const before = collectTextBeforeCaret();
    if (before !== null && onMentionChange) {
      const at = before.lastIndexOf('@');
      const afterAt = at === -1 ? '' : before.slice(at + 1);
      if (at !== -1 && !/\s/.test(afterAt)) {
        onMentionChange(true, afterAt);
      } else {
        onMentionChange(false, '');
      }
    }

    onChange(serialized);
  }, [maxLength, onChange, collectTextBeforeCaret, onMentionChange]);

  const insertRefImpl = useCallback(
    (kind: RefKind, id: string) => {
      const root = rootRef.current;
      if (!root) return;
      const marker = `{{ref:${kind}:${id}}}`;

      const sel = window.getSelection();
      const hasFocus =
        sel && sel.rangeCount > 0 && root.contains(sel.anchorNode);

      if (!hasFocus) {
        // Use `lastEmittedRef` rather than the closure `value` so back-to-back
        // inserts (e.g. user clicks two role chips before React commits the
        // first setPrompt) compose correctly. Both rAF callbacks run in the
        // same frame, and React hasn't flushed the first onChange by the time
        // the second one fires — but `lastEmittedRef` is mutated synchronously
        // by every insert, so it always reflects the latest serialized state.
        const current = lastEmittedRef.current;
        const next =
          current.length === 0 || current.endsWith(' ')
            ? `${current}${marker} `
            : `${current} ${marker} `;
        lastEmittedRef.current = next;
        onChange(next);
        // Re-render and drop caret at end.
        requestAnimationFrame(() => {
          if (!rootRef.current) return;
          rootRef.current.focus();
          placeCaretAtEnd(rootRef.current);
        });
        return;
      }

      // Strip a trailing `@<query>` literal (from typing `@` then picking)
      // so the chip replaces the placeholder text instead of duplicating.
      const range = sel.getRangeAt(0);
      // Walk backwards from caret to find a leading `@` with no whitespace.
      const probe = range.cloneRange();
      probe.setStart(root, 0);
      const before = probe.toString();
      const at = before.lastIndexOf('@');
      let replaceCount = 0;
      if (at !== -1 && !/\s/.test(before.slice(at + 1))) {
        replaceCount = before.length - at;
      }
      // Delete `replaceCount` chars backward.
      for (let i = 0; i < replaceCount; i++) {
        sel.modify('extend', 'backward', 'character');
      }
      if (replaceCount > 0) range.deleteContents();

      // Insert the chip at the caret.
      const label = resolveLabel(kind, id) ?? `@${kind}`;
      const thumb = resolveThumb(kind, id);
      const chip = buildChipNode(kind, id, label, thumb);
      const trailing = document.createTextNode(' ');
      const r = sel.getRangeAt(0);
      r.insertNode(trailing);
      r.insertNode(chip);
      r.setStartAfter(trailing);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      onCloseMention?.();
      // Emit the new serialized state.
      emitChange();
      void marker;
    },
    [onChange, resolveLabel, resolveThumb, emitChange, onCloseMention]
  );

  useImperativeHandle(
    ref,
    () => ({
      insertRef: insertRefImpl,
      focus: () => rootRef.current?.focus(),
    }),
    [insertRefImpl]
  );

  /** Find the chip immediately adjacent to the caret in the given
   *  direction. Walks the root's flattened child list; treats whitespace-
   *  only text nodes as if they didn't exist so `[chip][" "][caret]`
   *  still resolves to the chip on backspace. */
  const findAdjacentChip = useCallback(
    (direction: 'backward' | 'forward'): HTMLElement | null => {
      const root = rootRef.current;
      if (!root) return null;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return null;
      if (!root.contains(range.startContainer)) return null;

      // Flatten the root's children so we can step linearly.
      const flat: Node[] = Array.from(root.childNodes);
      // Resolve the caret to (flatIndex, offsetInsideNode).
      let caretFlatIdx = -1;
      let caretOffset = 0;
      const startContainer = range.startContainer;
      const startOffset = range.startOffset;
      if (startContainer === root) {
        caretFlatIdx = startOffset; // caret sits between flat[startOffset-1] and flat[startOffset]
        caretOffset = direction === 'backward' ? 0 : 0;
        // Treat as "at boundary": the relevant adjacent node is flat[idx-1]
        // for backward, flat[idx] for forward.
      } else {
        caretFlatIdx = flat.indexOf(startContainer as ChildNode);
        if (caretFlatIdx === -1) {
          // Caret is nested inside a chip span (shouldn't happen since
          // chips are contentEditable=false) or some other descendant —
          // bail.
          return null;
        }
        caretOffset = startOffset;
      }

      const isText = (n: Node | undefined): n is Text =>
        !!n && n.nodeType === Node.TEXT_NODE;
      const isChip = (n: Node | undefined): n is HTMLElement =>
        !!n &&
        n.nodeType === Node.ELEMENT_NODE &&
        !!(n as HTMLElement).dataset.refKind;

      if (direction === 'backward') {
        // If caret is inside a text node and not at the very start, let
        // the browser handle the character delete.
        if (
          startContainer !== root &&
          isText(startContainer) &&
          caretOffset > 0
        ) {
          return null;
        }
        // Walk left from the boundary. Initial index = the flat slot
        // immediately to the left of the caret.
        let i = startContainer === root ? caretFlatIdx - 1 : caretFlatIdx - 1;
        while (i >= 0) {
          const n = flat[i];
          if (isChip(n)) return n;
          // Skip empty / whitespace-only text nodes so the chip "next to"
          // the caret is still found even with a stray space between.
          if (isText(n) && n.textContent && /\S/.test(n.textContent)) {
            return null;
          }
          if (!isText(n) && !isChip(n)) return null;
          i -= 1;
        }
        return null;
      }

      // forward
      if (
        startContainer !== root &&
        isText(startContainer) &&
        caretOffset < (startContainer.textContent?.length ?? 0)
      ) {
        return null;
      }
      let i = startContainer === root ? caretFlatIdx : caretFlatIdx + 1;
      while (i < flat.length) {
        const n = flat[i];
        if (isChip(n)) return n;
        if (isText(n) && n.textContent && /\S/.test(n.textContent)) {
          return null;
        }
        if (!isText(n) && !isChip(n)) return null;
        i += 1;
      }
      return null;
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
        e.preventDefault();
        onEnter?.();
        return;
      }
      if (e.key === 'Escape' && mentionOpen) {
        e.preventDefault();
        onCloseMention?.();
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && onRefRemove) {
        const direction = e.key === 'Backspace' ? 'backward' : 'forward';
        const chip = findAdjacentChip(direction);
        if (chip) {
          e.preventDefault();
          const kind = chip.dataset.refKind as RefKind;
          const id = chip.dataset.refId;
          if (!id) return;
          // Place the caret where the chip used to be so the next
          // keystroke types in the right spot, then strip the chip and
          // one adjacent space from the DOM. emitChange afterwards
          // serializes the new state and notifies the parent — this is
          // the same path normal typing takes, so the value/DOM stay in
          // lockstep and the caret survives.
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStartBefore(chip);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);

          const next = chip.nextSibling;
          const prev = chip.previousSibling;
          chip.remove();
          if (
            next?.nodeType === Node.TEXT_NODE &&
            next.textContent &&
            /^[  ]/.test(next.textContent)
          ) {
            next.textContent = next.textContent.replace(/^[  ]/, '');
          } else if (
            prev?.nodeType === Node.TEXT_NODE &&
            prev.textContent &&
            /[  ]$/.test(prev.textContent)
          ) {
            prev.textContent = prev.textContent.replace(/[  ]$/, '');
          }

          onCloseMention?.();
          emitChange();
          onRefRemove(kind, id);
        }
      }
    },
    [
      onEnter,
      mentionOpen,
      onCloseMention,
      onRefRemove,
      findAdjacentChip,
      emitChange,
    ]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      // Force plain-text paste so we never absorb foreign HTML / chips.
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(text));
      sel.collapseToEnd();
      emitChange();
    },
    [emitChange]
  );

  return (
    <div className="relative">
      <div
        ref={rootRef}
        role="textbox"
        tabIndex={disabled ? -1 : 0}
        aria-multiline="true"
        aria-placeholder={placeholder}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emitChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={cn(
          'min-h-[44px] max-h-60 overflow-y-auto whitespace-pre-wrap break-words p-0 text-sm leading-snug outline-none [&:empty]:before:pointer-events-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-[attr(aria-placeholder)]',
          disabled && 'cursor-not-allowed opacity-60',
          className
        )}
        data-placeholder={placeholder}
      />
      {empty && placeholder && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none text-sm leading-snug text-muted-foreground"
        >
          {placeholder}
        </span>
      )}
    </div>
  );
});

/** Replace `{{ref:kind:id}}` markers with the numbered plain-text form
 *  that the backend / model sees, e.g. "Image 1" / "Video 2" / "Audio 3".
 *  Items missing from the provided arrays are silently dropped. */
export function serializePromptForBackend(
  value: string,
  images: { id: string }[],
  videos: { id: string }[],
  audios: { id: string }[]
): string {
  return value
    .replace(REF_PATTERN, (_, kind: RefKind, id: string) => {
      const list =
        kind === 'image' ? images : kind === 'video' ? videos : audios;
      const idx = list.findIndex((i) => i.id === id);
      if (idx === -1) return '';
      const labelMap: Record<RefKind, string> = {
        image: 'Image',
        video: 'Video',
        audio: 'Audio',
      };
      return `${labelMap[kind]} ${idx + 1}`;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Build a marker string for embedding inline. */
export function refMarker(kind: RefKind, id: string): string {
  return `{{ref:${kind}:${id}}}`;
}
