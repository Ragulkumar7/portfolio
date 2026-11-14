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

COPY — page copy listed in BLOCKS (a meta description, a static
paragraph) gets its own marker pair on the first run and is rewritten
only between those markers afterwards, so no page text is ever edited
outside a marker pair.

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

# managed page copy — a marker pair is planted once around each block and
# only the text between the markers is rewritten afterwards, so page copy
# is never edited outside a marker pair either. `find` locates the original
# block on the first run (after that the markers are the only handle).
def content_markers(bid):
    return ('<!-- guide:%s:start -->' % bid, '<!-- guide:%s:end -->' % bid)


BLOCKS = {
    'experience.html': [(
        'meta',
        r'<meta name="description" content="[^"]*">',
        '<meta name="description" content="Work history \u2014 Huemind (since June 2026) '
        'and Neoera Infotech (July 2025 to April 2026): roles, dates and what I did.">'
    )],
    'services/web-apps.html': [(
        'text',
        r'<p class="just-text__paragraph" data-reveal="">PHP and MySQL[^<]*</p>',
        '<p class="just-text__paragraph" data-reveal="">PHP and MySQL have run the '
        'web&#x27;s back rooms for decades. They&#x27;re documented everywhere, hired '
        'everywhere, and they don&#x27;t rewrite themselves every two years.</p>'
    )],
}

# footer controls: planted once before the Back-to-top button, then only
# rewritten between the markers on every later run. The tour link points
# at this page's index.html (avatar.js starts it on the home page and
# carries the intent over from anywhere else).
FSTART = '<!-- guide:footer:start -->'
FEND = '<!-- guide:footer:end -->'
FANCHOR = re.compile(r'[ \t]*<button[^>]*data-back-to-top[^>]*>')
FBLOCK = ('<a class="footer__tour" data-tour-link data-cursor="Tour" '
          'href="{prefix}index.html">Take the tour</a>'
          '<button type="button" class="footer__guide" data-guide-toggle="" '
          'aria-pressed="true" data-cursor="Guide">Guide: on</button>'
          '<button type="button" class="footer__sound" data-sound-toggle '
          'aria-pressed="false" data-cursor="Sound">Sound: off</button>')


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


def transform_footer(text, rel, prefix=''):
    """Plant/refresh the footer tour link + Guide/Sound toggles."""
    eol = '\r\n' if '\r\n' in text else '\n'
    block = FSTART + FBLOCK.format(prefix=prefix) + FEND
    has_s, has_e = FSTART in text, FEND in text
    if has_s or has_e:
        if not (has_s and has_e):
            raise SystemExit('%s: footer marker mismatch' % rel)
        i = text.index(FSTART)
        j = text.index(FEND) + len(FEND)
        if i > j:
            raise SystemExit('%s: footer markers out of order' % rel)
        new = text[:i] + block + text[j:]
        return new, ('ok' if new == text else 'refreshed')
    m = FANCHOR.search(text)
    if not m:
        raise SystemExit('%s: footer back-to-top anchor not found' % rel)
    # plant immediately before the Back-to-top button
    new = text[:m.start()] + block + eol + text[m.start():]
    return new, 'marked'


def transform_content(text, rel):
    """Plant/refresh the managed copy blocks of one page (marker-guarded)."""
    status = 'ok'
    for bid, find, markup in BLOCKS.get(rel, []):
        s, e = content_markers(bid)
        if s in text and e in text:
            i, j = text.index(s), text.index(e) + len(e)
            if i > j:
                raise SystemExit('%s: content markers out of order (%s)' % (rel, bid))
            new = text[:i] + s + markup + e + text[j:]
        else:
            m = re.search(find, text)
            if not m:
                raise SystemExit('%s: managed block %r not found' % (rel, bid))
            new = text[:m.start()] + s + markup + e + text[m.end():]
            if status == 'ok':
                status = 'marked'
        if status == 'ok' and new != text:
            status = 'refreshed'
        text = new
    return text, status


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
            new, status2 = transform_footer(new, rel, prefix)
            new, status3 = transform_content(new, rel)
            pending = next((s for s in (status, status2, status3) if s != 'ok'), 'ok')
            if pending != 'ok':
                changed += 1
            if not check and pending != 'ok':
                with io_open(path, 'w') as fh:
                    fh.write(new)
            print('  %-8s %s' % (pending.upper() if check else pending, rel))

    print('%s %d file(s)' % ('would change' if check else 'changed', changed))


if __name__ == '__main__':
    main()
