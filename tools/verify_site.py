"""Site content verification — work-history dates and the two-step timeline.

    py tools\\verify_site.py            run every check
    py tools\\verify_site.py --static   file scan only (no browser)

Part 1 — FILE SCAN. Every served file is searched byte-wise, without
regard to case, for the three stale phrases. Project files must be clean;
third-party bundles under assets/vendor/ are reported but never failed
(their own method names are not site copy). The resume .docx is opened as
the zip it is and its document text is read too, and the authored text
files are additionally searched for the start month as a whole word, so a
leftover abbreviated date cannot slip past either.

Part 2 — RENDERED. experience.html, resume.html and about.html at
1440x900 and 390x844: exactly two roles and two timeline steps carrying
the real labels, no empty step, a spine that spans both steps, a meta
description that agrees with the copy, no stale wording in any rendered
text, no horizontal scroll and zero console errors.
"""

import os
import re
import sys
import zipfile

try:
    from playwright.sync_api import sync_playwright
except ImportError:                                     # pragma: no cover
    sys.exit('playwright for Python is required: py -m pip install playwright')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# assembled from pieces so this file never carries the literal strings the
# scan looks for — a tree-wide search must not match its own test
BAD = [chr(97) + 'ug' + 'ust', chr(97) + 'ug' + ' 2026', 'int' + 'ern']
MONTH_WORD = re.compile(r'\b' + chr(97) + 'ug' + r'\b', re.IGNORECASE)

SKIP_DIRS = {'.git', 'node_modules', '__pycache__'}
VENDOR = 'assets/vendor/'
AUTHORED_EXT = ('.html', '.js', '.py', '.json', '.md')

HUEMIND_LABEL = 'Jun 2026 \u2014 Present'
NEOERA_LABEL = 'Jul 2025 \u2014 Apr 2026'
HUEMIND_TITLE = 'Full Stack & Shopify Developer'
NEOERA_TITLE = 'Full-Stack Developer'
HUEMIND_ORG = 'Huemind, Dharmapuri, Tamil Nadu'
NEOERA_ORG = 'Neoera Infotech'
ABOUT_SINCE = 'since June 2026'
NEO_DUTY = 'an e-commerce platform with custom CMS for Anicham Boutique'
DUTY_COUNTS = [2, 3]

VIEWPORTS = [(1440, 900), (390, 844)]

failures = []
notes = []


def fail(where, check, detail=''):
    failures.append('[%s] %s%s' % (where, check, (' \u2014 ' + detail) if detail else ''))


# --------------------------------------------------------------- part 1 --

def walk():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, ROOT).replace('\\', '/')
            yield path, rel


def scan_phrases():
    for path, rel in walk():
        try:
            with open(path, 'rb') as fh:
                data = fh.read().lower()
        except OSError:
            continue
        for term in BAD:
            idx = data.find(term.encode('utf-8'))
            if idx < 0:
                continue
            if rel.startswith(VENDOR):
                notes.append('%s carries "%s" (third-party bundle: its own '
                             'method names, not site copy)' % (rel, term))
            else:
                fail('file scan', '"%s"' % term, '%s at byte %d' % (rel, idx))


def scan_month_word():
    """an abbreviated start month, as a whole word, in authored text files"""
    for path, rel in walk():
        if not rel.endswith(AUTHORED_EXT) or rel.startswith(VENDOR):
            continue
        try:
            with open(path, 'r', encoding='utf-8') as fh:
                text = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        m = MONTH_WORD.search(text)
        if m:
            line = text.count('\n', 0, m.start()) + 1
            fail('file scan', 'start month as a word', '%s:%d' % (rel, line))


def scan_docx():
    """the resume .docx is a zip — read the document text inside it"""
    for path, rel in walk():
        if not rel.endswith('.docx'):
            continue
        try:
            with zipfile.ZipFile(path) as zf:
                xml = zf.read('word/document.xml').decode('utf-8', 'replace')
        except Exception as exc:                          # noqa: BLE001
            notes.append('%s: could not be read (%s)' % (rel, exc))
            continue
        text = re.sub(r'<[^>]+>', ' ', xml).lower()
        for term in BAD:
            if term in text:
                fail('file scan', '"%s"' % term, '%s (document text)' % rel)


def scan_tree():
    scan_phrases()
    scan_month_word()
    scan_docx()
    notes.append('assets/resume/*.pdf: its text streams are font-encoded, '
                 'so no word scan can read them (pre-existing binary asset)')


# --------------------------------------------------------------- part 2 --

EXPERIENCE_JS = r"""
() => {
  const steps = Array.from(document.querySelectorAll('.process-timeline__step'));
  const q = (s, el) => { const n = el.querySelector(s); return n ? n.textContent.trim() : ''; };
  const meta = document.querySelector('meta[name="description"]');
  const track = document.querySelector('.process-timeline__track');
  const list = document.querySelector('.process-timeline__list');
  const metaText = meta ? meta.content : '';
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return { t: Math.round(r.top), b: Math.round(r.bottom) };
  };
  return {
    steps: steps.length,
    labels: steps.map((s) => q('.process-timeline__label', s)),
    titles: steps.map((s) => q('.process-timeline__step-title', s)),
    duties: steps.map((s) => s.querySelectorAll('.process-timeline__duties li').length),
    dutyText: steps.map((s) => Array.from(s.querySelectorAll('.process-timeline__duties li'))
      .map((li) => li.textContent.trim())),
    empty: steps.filter((s) => !q('.process-timeline__step-title', s)).length,
    spine: (track && list) ? { track: box(track), list: box(list) } : null,
    meta: metaText,
    hScroll: document.documentElement.scrollWidth - window.innerWidth
  };
}
"""

RESUME_JS = r"""
() => {
  const heads = Array.from(document.querySelectorAll('.resume__h'));
  const h = heads.find((n) => n.textContent.trim() === 'Experience');
  const ul = h ? h.parentElement.querySelector('ul.resume__list') : null;
  const items = ul ? Array.from(ul.children)
    .map((li) => li.textContent.replace(/\s+/g, ' ').trim()) : [];
  return {
    items,
    hScroll: document.documentElement.scrollWidth - window.innerWidth
  };
}
"""

ABOUT_JS = r"""
() => {
  const body = (document.body.innerText || '').toLowerCase();
  return {
    sinceJune: body.indexOf('since june 2026') >= 0,
    hScroll: document.documentElement.scrollWidth - window.innerWidth
  };
}
"""


def url(rel):
    return 'file:///' + os.path.join(ROOT, rel).replace('\\', '/')


def open_page(browser, rel, w, h):
    page = browser.new_page(viewport={'width': w, 'height': h})
    errors = []

    def on_console(msg):
        kind = getattr(msg, 'type', '')
        kind = kind() if callable(kind) else kind
        if kind == 'error':
            text = getattr(msg, 'text', '')
            text = text() if callable(text) else text
            errors.append(text)

    page.on('console', on_console)
    page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
    page.goto(url(rel), wait_until='load')
    return page, errors


def check_geometry(where, hscroll, bad):
    if hscroll > 1:
        fail(where, 'horizontal scroll', '+%dpx' % hscroll)
    if bad:
        fail(where, 'stale wording in rendered text', ', '.join(bad))


def rendered_bad(page, text=None):
    """the stale phrases plus the bare month word, in `text` or the body"""
    return page.evaluate(
        "(args) => {"
        " const raw = (args.text === null || args.text === undefined)"
        "   ? (document.body.innerText || '') : args.text;"
        " const s = String(raw).toLowerCase();"
        " const out = args.words.filter((w) => s.indexOf(w) >= 0);"
        " const mo = new RegExp('(^|[^a-z])' + 'a' + 'ug' + '([^a-z]|$)', 'i');"
        " if (mo.test(s)) out.push('a' + 'ug (month word)');"
        " return out; }",
        {'words': BAD, 'text': text})


def check_experience(browser, w, h):
    where = 'experience %dx%d' % (w, h)
    page, errors = open_page(browser, 'experience.html', w, h)
    try:
        page.wait_for_selector('.process-timeline__step', timeout=9000)
        page.wait_for_timeout(500)
        d = page.evaluate(EXPERIENCE_JS)
        if d['steps'] != 2:
            fail(where, 'timeline step count', str(d['steps']))
        if d['empty']:
            fail(where, 'empty timeline step', str(d['empty']))
        if d['labels'] != [HUEMIND_LABEL, NEOERA_LABEL]:
            fail(where, 'step labels', str(d['labels']))
        if d['titles'] != [HUEMIND_TITLE, NEOERA_TITLE]:
            fail(where, 'step titles', str(d['titles']))
        if d['duties'] != DUTY_COUNTS:
            fail(where, 'duty count per step', str(d['duties']))
        neo_duties = d['dutyText'][1] if len(d['dutyText']) > 1 else []
        if len(neo_duties) < 2 or NEO_DUTY not in neo_duties[1]:
            fail(where, 'Neoera duty 2 wording', str(neo_duties))
        joined = ' '.join(' '.join(t) for t in d['dutyText']).lower()
        if BAD[2] in joined:
            fail(where, 'removed-role wording inside the duties')
        if not d['spine']:
            fail(where, 'timeline spine missing')
        else:
            t, l = d['spine']['track'], d['spine']['list']
            if abs(t['t'] - l['t']) > 2 or abs(t['b'] - l['b']) > 2:
                fail(where, 'spine does not span both steps',
                     'track %s list %s' % (t, l))
        if ABOUT_SINCE not in d['meta']:
            fail(where, 'meta description', d['meta'])
        meta_bad = rendered_bad(page, d['meta'])
        if meta_bad:
            fail(where, 'stale wording in meta description', ', '.join(meta_bad))
        check_geometry(where, d['hScroll'], rendered_bad(page))
        if errors:
            fail(where, 'console errors', ' | '.join(errors))
    finally:
        page.close()


def check_resume(browser, w, h):
    where = 'resume text %dx%d' % (w, h)
    page, errors = open_page(browser, 'resume.html', w, h)
    try:
        page.wait_for_selector('details.resume__details', timeout=9000)
        page.evaluate("() => { const d = document.querySelector('details.resume__details'); if (d) d.open = true; }")
        page.wait_for_timeout(300)
        d = page.evaluate(RESUME_JS)
        items = d['items']
        if len(items) != 2:
            fail(where, 'experience item count', str(len(items)))
        else:
            first, second = items[0], items[1]
            for token in (HUEMIND_TITLE, HUEMIND_ORG, HUEMIND_LABEL):
                if token not in first:
                    fail(where, 'first role missing "%s"' % token, first)
            for token in (NEOERA_TITLE, NEOERA_ORG, NEOERA_LABEL):
                if token not in second:
                    fail(where, 'second role missing "%s"' % token, second)
        check_geometry(where, d['hScroll'], rendered_bad(page))
        if errors:
            fail(where, 'console errors', ' | '.join(errors))
    finally:
        page.close()


def check_about(browser, w, h):
    where = 'about %dx%d' % (w, h)
    page, errors = open_page(browser, 'about.html', w, h)
    try:
        page.wait_for_selector('.page-title__title', timeout=9000)
        page.wait_for_timeout(700)
        d = page.evaluate(ABOUT_JS)
        if not d['sinceJune']:
            fail(where, 'About paragraph does not carry "%s"' % ABOUT_SINCE)
        check_geometry(where, d['hScroll'], rendered_bad(page))
        if errors:
            fail(where, 'console errors', ' | '.join(errors))
    finally:
        page.close()


def rendered():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w, h in VIEWPORTS:
            check_experience(browser, w, h)
            check_resume(browser, w, h)
            check_about(browser, w, h)
        browser.close()


def main():
    print('file scan\u2026')
    scan_tree()
    if '--static' not in sys.argv:
        print('rendered (1440x900 + 390x844)\u2026')
        rendered()
    print('')
    for n in notes:
        print('  note ' + n)
    if failures:
        print('')
        print('FAILURES (%d):' % len(failures))
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('ALL CHECKS PASSED')


if __name__ == '__main__':
    main()
