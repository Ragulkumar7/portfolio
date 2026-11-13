"""Marker-guarded editor for the guide avatar.

PAGES — the HTML pages are never edited outside a marker pair. Every
page gets

    <!-- guide:head:start -->
    <script src="<prefix>js/avatar.js" defer></script>
    <!-- guide:head:end -->

planted right after the js/main.js script tag (the only anchor insert
this script ever performs); from then on every run rewrites only the
text between the markers, so the tool is idempotent and cannot touch
any other part of a page.

CSS — the marked section of css/style.css (between the lines holding
"marker: guide-avatar START" and "marker: guide-avatar END") is
refreshed from tools/guide_avatar.css, again only inside the markers.

Usage:
    py tools\\guide_apply.py            rewrite the marked regions
    py tools\\guide_apply.py --check    verify, write nothing
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = '<!-- guide:head:start -->'
END = '<!-- guide:head:end -->'
ANCHOR = re.compile(r'[ \t]*<script src="[^"]*js/main\.js" defer></script>[ \t]*\r?\n')
CSS_PATH = os.path.join(ROOT, 'css', 'style.css')
CSS_FILE = os.path.join(ROOT, 'tools', 'guide_avatar.css')
CSS_START = 'marker: guide-avatar START'
CSS_END = 'marker: guide-avatar END'

# footer toggle: planted once before the Back-to-top button, then only
# rewritten between the markers on every later run
FSTART = '<!-- guide:footer:start -->'
FEND = '<!-- guide:footer:end -->'
FANCHOR = re.compile(r'[ \t]*<button[^>]*data-back-to-top[^>]*>')
FBLOCK = ('<button type="button" class="footer__guide" data-guide-toggle="" '
          'aria-pressed="true" data-cursor="Guide">Guide: on</button>')


def io_open(path, mode='r'):
    return io.open(path, mode, encoding='utf-8', newline='')


def build_block(prefix, eol='\n'):
    return (START + eol +
            '<script src="%sjs/avatar.js" defer></script>%s' % (prefix, eol) +
            END)


def transform_page(text, prefix, rel):
    eol = '\r\n' if '\r\n' in text else '\n'
    has_start = START in text
    has_end = END in text
    if has_start or has_end:
        # guard: a half-planted marker pair is an error, never a guess
        if not (has_start and has_end):
            raise SystemExit('%s: marker mismatch (only one of start/end found)' % rel)
        i = text.index(START)
        j = text.index(END) + len(END)
        if i > j:
            raise SystemExit('%s: markers out of order' % rel)
        new = text[:i] + build_block(prefix, eol) + text[j:]
        return new, ('ok' if new == text else 'refreshed')
    m = ANCHOR.search(text)
    if not m:
        raise SystemExit('%s: js/main.js anchor not found' % rel)
    new = text[:m.end()] + build_block(prefix, eol) + eol + text[m.end():]
    return new, 'marked'


def transform_footer(text, rel):
    """Plant/refresh the footer Guide toggle between marker guards."""
    eol = '\r\n' if '\r\n' in text else '\n'
    has_s, has_e = FSTART in text, FEND in text
    if has_s or has_e:
        if not (has_s and has_e):
            raise SystemExit('%s: footer marker mismatch' % rel)
        i = text.index(FSTART)
        j = text.index(FEND) + len(FEND)
        if i > j:
            raise SystemExit('%s: footer markers out of order' % rel)
        block = FSTART + eol + FBLOCK + eol + FEND
        # keep the block inline (no line breaks) for a compact footer row
        block = FSTART + FBLOCK + FEND
        new = text[:i] + block + text[j:]
        return new, ('ok' if new == text else 'refreshed')
    m = FANCHOR.search(text)
    if not m:
        raise SystemExit('%s: footer back-to-top anchor not found' % rel)
    block = FSTART + FBLOCK + FEND
    # plant immediately before the Back-to-top button
    new = text[:m.start()] + block + eol + text[m.start():]
    return new, 'marked'


def marker_region(lines, start_token, end_token, what):
    """Line indices of the marked region — both markers are required."""
    begin = None
    for i, line in enumerate(lines):
        if begin is None:
            if start_token in line:
                begin = i
        elif end_token in line:
            return begin, i
    raise SystemExit('%s: guide-avatar markers missing or incomplete' % what)


def transform_css(text):
    with io_open(CSS_FILE) as fh:
        block = fh.read()
    block_lines = block.split('\n')
    b0, b1 = marker_region(block_lines, CSS_START, CSS_END, CSS_FILE)
    region = block_lines[b0:b1 + 1]

    lines = text.split('\n')
    a0, a1 = marker_region(lines, CSS_START, CSS_END, 'css/style.css')
    if lines[a0:a1 + 1] == region:
        return text, 'ok'
    new = '\n'.join(lines[:a0] + region + lines[a1 + 1:])
    return new, 'refreshed'


def main():
    check = '--check' in sys.argv
    changed = 0

    with io_open(CSS_PATH) as fh:
        text = fh.read()
    new, status = transform_css(text)
    if status != 'ok':
        changed += 1
        if not check:
            with io_open(CSS_PATH, 'w') as fh:
                fh.write(new)
    print('  %-8s css/style.css' % (status.upper() if check else status))

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ('assets', 'tools', 'node_modules')]
        for name in sorted(filenames):
            if not name.endswith('.html'):
                continue
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, ROOT).replace('\\', '/')
            prefix = '../' * rel.count('/')
            with io_open(path) as fh:
                text = fh.read()
            new, status = transform_page(text, prefix, rel)
            if status != 'ok':
                changed += 1
            new2, status2 = transform_footer(new, rel)
            if status2 != 'ok':
                changed += 1
            if not check and (status != 'ok' or status2 != 'ok'):
                with io_open(path, 'w') as fh:
                    fh.write(new2)
            shown = status if status != 'ok' else status2
            print('  %-8s %s' % (shown.upper() if check else shown, rel))

    print('%s %d file(s)' % ('would change' if check else 'changed', changed))


if __name__ == '__main__':
    main()
