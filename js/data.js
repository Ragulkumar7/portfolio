/* =====================================================================
   data.js — runtime data for the Ragul Kumar portfolio

   The image map is resolved relative to this script's own URL so every
   page (/, /work/, /services/, /skills, …) can share a single copy.
   Only screenshot files that actually exist in assets/img/ are listed —
   missing shots leave the SVG placeholders visible instead of showing
   broken images.

   Everything the pages render lives here: site flags, hero line,
   statement, marquee words, projects (the work index order), skills,
   about copy, experience, certificates, resume and github.

   site.showTodos: false hides every user-facing "TODO" (fields render
   empty, "TODO: review" suffixes are stripped, [data-todo] blocks are
   hidden). Set it to true to see the placeholders again.
   ===================================================================== */
(function () {
  'use strict';

  var base = '';
  try {
    if (document.currentScript && document.currentScript.src) {
      base = document.currentScript.src;
    }
  } catch (e) { /* older engines — fall back to root-relative paths */ }

  function asset(path) {
    if (!base) return path;
    try { return new URL('../' + path, base).href; } catch (e) { return path; }
  }

  var IMG = 'assets/img/';
  var files = [
    'theworldofnerds-desktop.webp', 'theworldofnerds-mobile.webp',
    'evarrah-desktop.png', 'evarrah-mobile.png',
    'opalline-desktop.png', 'opalline-mobile.png',
    'anichamboutique-desktop.webp', 'anichamboutique-mobile.webp',
    'rupnidhi-desktop.webp', 'rupnidhi-mobile.webp',
    'swarnalagna-desktop.webp', 'swarnalagna-mobile.webp',
    'voiceofjagadguru-desktop.png', 'voiceofjagadguru-mobile.png',
    'v4startup-desktop.png', 'v4startup-mobile.png',
    'workack-desktop.webp', 'workack-mobile.webp'
  ];

  var images = {};
  for (var i = 0; i < files.length; i++) {
    images[files[i].replace(/\.(webp|png)$/, '')] = asset(IMG + files[i]);
  }

  window.PORTFOLIO = {
    images: images,

    /* site-wide flags + home hero line */
    site: {
      showTodos: false,
      heroLine: 'I build CRMs, billing software and Shopify stores that businesses run on.'
    },

    /* guide avatar (js/avatar.js) — the dithered SVG companion.
       Every word it says lives here; the script holds no copy of its
       own. lines.* are keyed by trigger (page sections + greeting);
       reactions.* are arrays picked at random with no immediate repeat;
       anchors key the fixed position per page; thresholds hold every
       timing/limit so the script stays policy-free. No image — the
       avatar is drawn as inline SVG (see js/avatar.js). */
    avatar: {
      email: 'ragulthedeveloper@gmail.com',
      accent: 'Ragul',                       /* the first line highlights this word */

      /* elements the avatar must never sit on: if its box ever touches
         one of these the guide hides (the marquee sweeps the whole
         width while the page scrolls, so it can only be dodged by
         stepping aside, never by raising) */
      hideOver: ['.marquee'],

      /* page + section lines */
      lines: {
        hero: 'Hi, I’m Ragul. Stick around and I’ll walk you through what I build.',
        returning: 'Back again? Pick up where you left off.',
        work: 'Stores, CRMs and billing software. Take a look.',
        statement: 'Dashboards for every role. Content your team can publish themselves.',
        services: 'Websites, Shopify stores, web apps and UI/UX. Pick one.',
        about: 'That’s the short version of me.',
        experience: 'Huemind now, Neoera before.',
        skills: 'These are the tools I work with.',
        certificates: 'Tap a card to open it.',
        resume: 'Download it, or just read it here.',
        github: 'Live from GitHub.',
        contact: 'Write to me anytime. Click and the email is copied.',
        footer: 'Write to me anytime. Click and the email is copied.',
        copied: 'Copied. I’ll be waiting.'
      },

      /* project commentary — facts only; slugs without a line fall back
         to “<title> — <type>” built from projects[] inside the script */
      projects: {
        theworldofnerds: 'The World of Nerds is a Shopify store for anime and pop-culture collectibles.',
        evarrah: 'Evarrah is a Shopify store.',
        opalline: 'Opalline is a Shopify store plus billing software.',
        v4startup: 'V4 Startup is a complete CRM with separate dashboards for admins, employees and clients.',
        voiceofjagadguru: 'Voice of Jagadguru is a complete website with a CMS the owners use to upload content themselves.'
      },

      /* reaction lines — 2–3 variations each, picked with no repeat */
      reactions: {
        nose: {
          cough: ['Acho— oh. That tickles.', 'Hey, gentle with the nose.', 'Wrong hole, friend.'],
          sneeze: ['AHH-CHOO! Warn a guy.', 'My nose has feelings, you know.'],
          enough: ['That’s enough nose, thanks.']
        },
        body: {
          giggle: ['Hehe— stop it!', 'Ticklish! Very ticklish!', 'Okayokayokay— haha!'],
          stop: ['Stop, I can’t breathe— hahaha!', 'Too much! I yield! I yield!']
        },
        head: {
          pat: ['Head pats? Approved.', 'That’s the spot.', 'A little lower… perfect.']
        },
        eyes: {
          flinch: ['My eyes! They’re sensitive.', 'Careful with those!', 'Blink and you’ll miss it.']
        },
        ear: {
          flick: ['Ear wiggles: engaged.', 'Did you hear that?', 'Hello in there?']
        },
        mouth: {
          chatter: ['Blah blah blah— you get it.', 'Words! I have so many.', 'Talking to myself again.']
        },
        idle: {
          yawn: ['*yaaawn* …long day.', 'Just resting my eyes.', 'Hmm? Oh— hi.'],
          sleep: ['z z Z …', 'ZzZz…', 'zzz… (don’t prod me)'],
          wake: ['I wasn’t sleeping!', 'Who— oh. Hello.', 'Just… meditating.']
        },
        dizzy: {
          slow: ['Whoa— slow down!', 'The room is spinning.', 'Scroll much?']
        },
        hints: {
          nose: ['Try poking my nose.', 'Psst— tap the nose.'],
          tickle: ['I’m ticklish, you know.', 'The body is a no— wait, yes zone.'],
          pick: ['Hold me to pick me up.', 'Press and hold to lift me.']
        }
      },

      /* fixed positions per page — the key is the page slug (index.html
         → "index", work/v4startup.html → "v4startup"); unknown pages
         use "default". Each entry: selector (which section must be in
         view), side (left|right), size (avatar width px), bottom (px
         from the viewport bottom, before avoidance), line (a key in
         lines above, or "project" for a case page).

         "place" (index/.hero only) switches the anchor off the fixed
         bottom band and computes its spot from real element rects:
           ref      the element to sit beside (first .hero__line = RAGUL)
           edge     'right' = hug the right edge, 'ref-right' = sit
                    immediately right of ref
           size/hGap/avoid  as above, per breakpoint
           mobile   same keys, used at ≤700px
         "hide": true pins the avatar away while that anchor is active
         (the marquee). "noBubbleUntilTap" holds the bubble until the
         visitor taps the avatar.                                         */
      anchors: {
        index: [
          { selector: '.hero', side: 'right', size: 300, bottom: 24, line: 'hero',
            place: {
              ref: '.hero__line', edge: 'right', side: 'right', size: 300, hGap: 20,
              avoid: ['.hero__line--second', '.hero__top', '.header', '.hero__button'],
              mobile: {
                /* bubble on the outer side: the stage then never has to
                   shuffle sideways when the bubble finally appears */
                ref: '.hero__button', edge: 'ref-right', side: 'left', size: 90, hGap: 12,
                avoid: ['.hero__top', '.header', '.marquee', '.hero__line--second', '.hero__intro'],
                noBubbleUntilTap: true
              }
            } },
          { selector: '.marquee', side: 'right', size: 150, bottom: 24, line: '', hide: true },
          { selector: '.selected-work', side: 'right', size: 150, bottom: 24, line: 'work' },
          { selector: '.statement', side: 'left', size: 150, bottom: 24, line: 'statement' },
          { selector: '.service-tiles', side: 'right', size: 150, bottom: 24, line: 'services' },
          { selector: '.footer', side: 'right', size: 150, bottom: 24, line: 'footer' }
        ],
        contact: [{ selector: '.contact-form', side: 'left', size: 150, bottom: 24, line: 'contact' }],
        about: [{ selector: '.columns', side: 'right', size: 150, bottom: 24, line: 'about' }],
        experience: [{ selector: '[data-render="experience"]', side: 'right', size: 150, bottom: 24, line: 'experience' }],
        skills: [{ selector: '[data-render="skills"]', side: 'right', size: 150, bottom: 24, line: 'skills' }],
        certificates: [{ selector: '[data-render="certificates"]', side: 'right', size: 150, bottom: 24, line: 'certificates' }],
        resume: [{ selector: '[data-render="resume"]', side: 'right', size: 150, bottom: 24, line: 'resume' }],
        github: [{ selector: '[data-render="github"]', side: 'right', size: 150, bottom: 24, line: 'github' }],
        work: [{ selector: '[data-render="workIndex"]', side: 'right', size: 150, bottom: 24, line: 'work' }],
        services: [{ selector: '.service-list', side: 'right', size: 150, bottom: 24, line: 'services' }],
        /* case pages + service details fall back here */
        default: [{ selector: 'body', side: 'right', size: 150, bottom: 24, line: 'project' }]
      },

      thresholds: {
        travelMs: 900,          /* hop travel between anchors */
        enterMs: 700,           /* entrance peek */
        flipMs: 500,            /* horizontal flip on side change */
        blinkMinMs: 3000, blinkMaxMs: 6000, blinkMs: 120,
        pokeWindowMs: 6000, pokeSneeze: 3, pokeEnough: 4, calmResetMs: 10000,
        coughMs: 700, sneezeMs: 850, patMs: 650, flinchMs: 400, giggleMs: 700,
        flickMs: 600, chatterMs: 600, yawnMs: 1400, sleepMs: 0, wakeMs: 600,
        dizzyMs: 1200, holdMs: 450, pickupMs: 260,
        tickleMs: 400, tickleStopMs: 3000, tickleEndMs: 600,
        hintMs: 8000, hideMs: 5000, typeMs: 26,
        idleYawnMs: 25000, idleSleepMs: 50000,
        fastScrollMs: 1000, fastScrollPx: 900,
        eyePx: 4, headPx: 3, leanDeg: 4,
        avoidGap: 10,           /* clearance kept above controls/header */
        avoidStep: 6            /* px per avoidance probe */
      }
    },

    /* short intro line under each new page's title */
    intros: {
      skills: 'Languages, frameworks and tools I use day to day, grouped by area.',
      experience: 'Where I’ve worked and what I’ve built.',
      certificates: 'Six certificates from courses I’ve completed.',
      resume: 'Skills, experience, projects and education — summarised on one page.',
      github: 'My public repositories on GitHub, fetched live from the API.'
    },

    /* home marquee — every word must also exist in skills below */
    marquee: ['React.js', 'TypeScript', 'JavaScript', 'Node.js', 'PHP', 'Shopify',
              'Tailwind CSS', 'GraphQL', 'PostgreSQL', 'MongoDB', 'AWS', 'Docker'],

    /* home statement (the "(Hello)" scrub section) */
    statement: {
      text: 'I’m Ragul. I build full-stack web apps, CRMs and Shopify stores, from database to storefront. Separate dashboards for admins, employees and clients, and content your team can publish themselves.',
      italic: ['database', 'storefront'],
      accent: 'themselves.'
    },

    /* work index order — also drives home rows, dock, up-close, resume.
       year/role/client stay 'TODO' until supplied (hidden while
       site.showTodos is false). */
    projects: [
      {
        slug: 'theworldofnerds', name: 'The World of Nerds',
        site: 'theworldofnerds.com', url: 'https://theworldofnerds.com',
        type: 'Shopify store', listType: 'Shopify store', platform: '',
        employer: '',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'Shopify store for anime and pop-culture collectibles',
        altDesktop: 'The World of Nerds anime collectibles store on desktop',
        altMobile: 'The World of Nerds anime collectibles store on mobile'
      },
      {
        slug: 'evarrah', name: 'Evarrah',
        site: 'evarrah.com', url: 'https://evarrah.com',
        type: 'Shopify store', listType: 'Shopify store', platform: '',
        employer: 'Huemind',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'Shopify store',
        altDesktop: 'Evarrah ethnic wear store on desktop',
        altMobile: 'Evarrah ethnic wear store on mobile'
      },
      {
        slug: 'opalline', name: 'Opalline',
        site: 'opalline.com', url: 'https://opalline.com',
        type: 'Billing software + Shopify store', listType: 'Billing software',
        platform: '',
        employer: 'Huemind',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'Billing software with a live demo, plus a Shopify store',
        altDesktop: 'Opal Line Billing demo on desktop',
        altMobile: 'Opal Line Billing demo on mobile'
      },
      {
        slug: 'anichamboutique', name: 'Anicham Boutique',
        site: 'anichamboutique.com', url: 'https://anichamboutique.com',
        type: 'E-commerce website', listType: 'E-commerce website',
        platform: 'HTML · CSS · JS · React · MySQL',
        employer: '',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'E-commerce website with a custom CMS, built in HTML, CSS, JS, React and MySQL',
        altDesktop: 'Anicham Boutique women’s ethnic wear store on desktop',
        altMobile: 'Anicham Boutique women’s ethnic wear store on mobile'
      },
      {
        slug: 'rupnidhi', name: 'Rupnidhi',
        site: 'rupnidhi.com', url: 'https://rupnidhi.com',
        type: 'Web app design & build', listType: 'Web app', platform: 'PHP · MySQL',
        employer: '',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'POS and GST billing platform',
        altDesktop: 'Rupnidhi GST billing software dashboard on desktop',
        altMobile: 'Rupnidhi GST billing software on mobile'
      },
      {
        slug: 'swarnalagna', name: 'Swarna Lagna',
        site: 'swarnalagna.com', url: 'https://swarnalagna.com',
        type: 'Website design & build', listType: 'Website', platform: 'Static site',
        employer: 'Neoera Infotech',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'Matrimony website',
        altDesktop: 'Swarna Lagna matrimony website homepage on desktop',
        altMobile: 'Swarna Lagna matrimony website on mobile'
      },
      {
        slug: 'voiceofjagadguru', name: 'Voice of Jagadguru',
        site: 'voiceofjagadguru.com', url: 'https://voiceofjagadguru.com',
        type: 'Website with a CMS', listType: 'Website', platform: '',
        employer: 'Neoera Infotech',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'Complete website with a CMS so the owners publish content themselves',
        altDesktop: 'Voice of Jagadguru website on desktop',
        altMobile: 'Voice of Jagadguru website on mobile'
      },
      {
        slug: 'v4startup', name: 'V4 Startup',
        site: 'v4startup.com', url: 'https://v4startup.com',
        type: 'CRM', listType: 'CRM', platform: '',
        employer: 'Neoera Infotech',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'CRM with separate dashboards for admins, employees and clients',
        altDesktop: 'V4 Startup website on desktop',
        altMobile: 'V4 Startup website on mobile'
      },
      {
        slug: 'workack', name: 'Workack',
        site: 'workack.com', url: 'https://workack.com',
        type: 'Web app design & build', listType: 'Web app', platform: 'PHP · MySQL',
        employer: '',
        year: 'TODO', role: 'TODO', client: 'TODO',
        desc: 'CRM, HR and Sales dashboard',
        altDesktop: 'Workack HR and payroll platform homepage on desktop',
        altMobile: 'Workack HR and payroll platform on mobile'
      }
    ],

    /* about.html — drafts carry a "TODO: review" suffix (stripped while
       site.showTodos is false). toolkit entries are pulled from skills. */
    about: {
      lead: 'I’m Ragul, a full-stack and Shopify developer. I build the whole thing: the database, the back end, the dashboards, the storefront and the pages people actually see. TODO: review',
      paras: [
        'At Huemind, since August 2026, I build Shopify stores and Opalline, a billing software. Before that, at Neoera Infotech from July 2025 to April 2026, I built business platforms: Rupnidhi (POS and GST billing), Workack (CRM, HR and Sales dashboard), an e-commerce website with a custom CMS for Anicham Boutique, and a Blog CMS syndicating content across 3 websites. TODO: review',
        'I’ve also built a complete CRM with separate dashboards for admins, employees and clients, and a complete website with a CMS so the team publishes content themselves. Design is part of the job, but only part of it. TODO: review'
      ],
      toolkit: ['React.js', 'TypeScript', 'JavaScript', 'Node.js', 'PHP', 'Shopify',
                'Liquid', 'Tailwind CSS', 'GraphQL', 'PostgreSQL', 'MySQL', 'MongoDB',
                'AWS', 'Docker', 'Git']
    },

    /* skills.html — groups and names mirror chandruuuu.vercel.app/skills
       (source of truth); kept skills sit with their groups. level is
       optional — never invent one; render only when set. */
    skills: [
      { name: 'Frontend Development', items: [
        { name: 'HTML5' }, { name: 'CSS3' }, { name: 'JavaScript' },
        { name: 'React.js' }, { name: 'AJAX' }
      ] },
      { name: 'Design', items: [
        { name: 'Figma (UI/UX)' }, { name: 'Bootstrap' },
        { name: 'Tailwind CSS' }, { name: 'Responsive' }
      ] },
      { name: 'Programming Languages', items: [
        { name: 'Java' }, { name: 'JavaScript' }, { name: 'TypeScript' },
        { name: 'Python' }, { name: 'OOP' }
      ] },
      { name: 'Backend Development', items: [
        { name: 'Spring Boot' }, { name: 'Node.js' }, { name: 'Express.js' },
        { name: 'PHP' }
      ] },
      { name: 'Shopify Development', items: [
        { name: 'Liquid' }, { name: 'Online Store 2.0' }, { name: 'Shopify CLI' },
        { name: 'Admin API' }, { name: 'GraphQL' }, { name: 'Sections' },
        { name: 'Snippets' }, { name: 'Metafields' }, { name: 'Shopify' }
      ] },
      { name: 'API & Integration', items: [
        { name: 'REST API' }, { name: 'JWT Auth' }, { name: 'Axios' },
        { name: 'GraphQL' }
      ] },
      { name: 'Database Management', items: [
        { name: 'PostgreSQL' }, { name: 'MySQL' }, { name: 'MongoDB' }
      ] },
      { name: 'Tools & Platforms', items: [
        { name: 'VS Code' }, { name: 'Cursor' }, { name: 'Eclipse' },
        { name: 'Postman' }
      ] },
      { name: 'AI Tools', items: [
        { name: 'ChatGPT' }, { name: 'Claude' }, { name: 'Cursor' }
      ] },
      { name: 'Version Control & Collaboration', items: [
        { name: 'Git' }, { name: 'GitHub' }, { name: 'GitHub Actions' }
      ] },
      { name: 'Cloud & Deployment', items: [
        { name: 'AWS' }, { name: 'Vercel' }, { name: 'Docker' }
      ] },
      { name: 'Engineering Practices', items: [
        { name: 'System Design' }, { name: 'Layered Arch.' }, { name: 'API Testing' },
        { name: 'Agile' }, { name: 'Code Reviews' }
      ] },
      { name: 'Also', items: [
        { name: 'Python (TensorFlow, OpenCV)' }, { name: 'IoT (ESP8266)' }
      ] }
    ],

    /* experience.html — current position first, then Neoera roles, then
       current work. Dates are real; stack stays TODO until supplied. */
    experience: {
      workTitle: 'Work history',
      roles: [
        {
          label: 'Aug 2026 — Present',
          title: 'Full Stack & Shopify Developer',
          org: 'Huemind, Dharmapuri, Tamil Nadu',
          duties: [
            'Develop and customize Shopify websites for clients, including theme customization and Liquid-based dynamic rendering.',
            'Set up Shopify stores (products, collections, variants, navigation, payment gateways) and integrate and customize apps.'
          ],
          stack: 'TODO'
        },
        {
          label: 'Sep 2025 — Apr 2026',
          title: 'Full-Stack Developer',
          org: 'Neoera Infotech',
          duties: [
            'Delivered 15+ production full-stack web projects for clients, including backend development, database design, hosting and deployment.',
            'Engineered Rupnidhi (POS and GST billing), Workack (CRM, HR and Sales dashboard), an e-commerce website with a custom CMS for Anicham Boutique, and a Blog CMS syndicating content across 3 websites.',
            'Built secure admin backends for Voice of Jagadguru and Divasprik, an Attendance Portal, V4Startup with a PSG variant, and responsive brand websites for Swarnalagna and Virmodello.'
          ],
          stack: 'TODO'
        },
        {
          label: 'Jul 2025 — Aug 2025',
          title: 'Intern Developer',
          org: 'Neoera Infotech',
          duties: [
            'Completed a 2-month project training in web designing and development, applying it to real-world problems in hosting and deployment.'
          ],
          stack: 'TODO'
        }
      ],
      /* current work — experience page only; hrefs point at the case pages */
      currentWork: [
        {
          name: 'Opalline billing software',
          desc: 'Billing software demo. TODO: review',
          href: 'work/opalline.html',
          links: [{ label: 'Live demo ↗', url: 'https://opal-line.onrender.com' }],
          note: 'TODO: demo access'
        },
        {
          name: 'Shopify projects',
          desc: '',
          href: 'work/evarrah.html',
          links: [
            { label: 'evarrah.com', url: 'https://evarrah.com' },
            { label: 'opalline.com', url: 'https://opalline.com' }
          ],
          note: 'TODO: other Shopify projects'
        }
      ],
      /* the one education line, resume.html only (experience page shows
         the work timeline only) */
      education: [
        { label: '2025', title: 'MCA', desc: 'The Gandhigram Rural Institute' }
      ]
    },

    /* certificates.html — six cards.
       date / credentialId: fill in as "TODO" until known (hidden while
       site.showTodos is false). verifyUrl: leave '' — the verify link
       stays hidden until set. image: leave '' — a 4:3 gradient
       placeholder shows; drop files in assets/img/certs/ and set e.g.
       image: asset('assets/img/certs/ai-agent-databricks.png'). */
    certificates: [
      { title: 'AI Agent Fundamentals', issuer: 'Databricks', date: '22 Feb 2026', credentialId: '', verifyUrl: '', image: asset('assets/img/certs/Databricks - Generic_ragul_1.jpg') },
      { title: 'Understanding Agentic AI', issuer: 'agentacademy.ai', date: '22 Feb 2026', credentialId: '699b3252884316d9bf08427c', verifyUrl: '', image: asset('assets/img/certs/certificate-understanding-agentic-ai-ragul_1.jpg') },
      { title: 'AWS Cloud Quest: Cloud Practitioner', issuer: 'AWS', date: 'TODO', credentialId: '', verifyUrl: 'https://www.credly.com/badges/e374f9d0-ac86-40d0-83b2-cc21091de55f/public_url', image: asset('assets/img/certs/aws-cloud-quest-cloud-practitioner.png') },
      { title: 'Python 3.4.3 Training', issuer: 'IIT Bombay', date: '12 Dec 2024', credentialId: '', verifyUrl: '', image: asset('assets/img/certs/1000273208.jpg') },
      { title: 'Programming in Java', issuer: 'NPTEL', date: 'Jul – Oct 2024', credentialId: 'NPTEL24CS105S661100142', verifyUrl: '', image: asset('assets/img/certs/nptel-programming-in-java.jpg') },
      { title: 'C Programming', issuer: 'CSC', date: 'TODO', credentialId: 'TODO', verifyUrl: '', image: '' }
    ],

    /* resume.html — the one-page PDF lives in assets/resume/ (the .docx
       beside it is never linked). available:true enables Download/Open
       and the inline preview; the text summary stays in a closed
       <details> titled "Text version". */
    resume: {
      pdf: { path: 'assets/resume/Ragul_Kumar_OnePage.pdf', available: true },
      name: 'Ragul Kumar',
      role: 'Full-Stack & Shopify Developer',
      email: 'ragulthedeveloper@gmail.com'
    },

    /* github.html — live fetch with a 10-minute sessionStorage cache.
       The static fallback list only renders while site.showTodos is
       true; replace the TODO rows with real repo data whenever you like. */
    github: {
      user: 'Ragulkumar7',
      profileUrl: 'https://github.com/Ragulkumar7',
      apiUser: 'https://api.github.com/users/Ragulkumar7',
      apiRepos: 'https://api.github.com/users/Ragulkumar7/repos?per_page=100&sort=updated',
      fallback: [
        { name: 'TODO: repository name', description: 'TODO: one-line description', language: 'TODO', stars: 'TODO', updated: 'TODO', url: '' },
        { name: 'TODO: repository name', description: 'TODO: one-line description', language: 'TODO', stars: 'TODO', updated: 'TODO', url: '' },
        { name: 'TODO: repository name', description: 'TODO: one-line description', language: 'TODO', stars: 'TODO', updated: 'TODO', url: '' }
      ]
    }
  };
})();
