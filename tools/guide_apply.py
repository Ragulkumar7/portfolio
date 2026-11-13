"""Marker-guarded page editor for the guide avatar.

The HTML pages are never edited outside a marker pair. Every page gets

    <!-- guide:head:start -->
    <script src="<prefix>js/avatar.js" defer></script>
    <!-- guide:head:end -->

planted right after the js/main.js script tag (the only anchor insert
this script ever performs); from then on every run rewrites only the
text between the markers, so the tool is idempotent and cannot touch
any other part of a page.

Usage:
    py tools\\guide_apply.py            rewrite the marked regions
    py tools\\guide_apply.py --check    verify, write nothing
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = '<!-- guide:head:start -->'
END = '<!-- guide:head:end -->'
ANCHOR = re.compile(r'[ \t]*<script src="[^"]*js/main\.js" defer></script>[ \t]*\r?\n')


def build_block(prefix, eol='\n'):
    return (START + eol +
            '<script src="%sjs/avatar.js" defer></script>%s' % (prefix, eol) +
            END)


def transform(text, prefix, rel):
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


def main():
    check = '--check' in sys.argv
    changed = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ('assets', 'tools', 'node_modules')]
        for name in sorted(filenames):
            if not name.endswith('.html'):
                continue
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, ROOT).replace('\\', '/')
            depth = rel.count('/')
            prefix = '../' * depth
            with io_open(path) as fh:
                text = fh.read()
            new, status = transform(text, prefix, rel)
            if status == 'ok':
                print('  ok       %s' % rel)
                continue
            changed += 1
            if check:
                print('  %-8s %s' % (status.upper(), rel))
                continue
            with io_open(path, 'w') as fh:
                fh.write(new)
            print('  %-8s %s' % (status, rel))
    print('%s %d page(s)' % ('would change' if check else 'changed', changed))


def io_open(path, mode='r'):
    import io
    return io.open(path, mode, encoding='utf-8', newline='')


if __name__ == '__main__':
    main()
