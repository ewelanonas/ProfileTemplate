/**
 * Cover letter drafting core.
 *
 * Pure logic, no DOM and no network: reads a job description, works out what it
 * is asking for, and assembles a draft letter from the profile. The same file
 * powers the admin tab and the standalone tool page.
 *
 * It also writes the .docx, because Word files are just a zip of XML parts and
 * doing it here keeps the whole feature client side.
 */
(function attach(root) {
  'use strict';

  /* ==========================================================================
     1. Reading the job description
     ========================================================================== */

  // Known job titles come first: an advert nearly always states the title plainly,
  // and sentence-shaped patterns tend to swallow half a paragraph.
  const ROLE_PATTERNS = [
    /(?:job title|position title|position|role title)\s*[:\-]\s*([^\n]{3,70})/i,
    /\b((?:senior|lead|principal|staff|junior)?\s*(?:sdet|software development engineer in test|quality (?:engineer|assurance engineer)(?:\s+(?:i{1,3}|iv|\d))?|qa (?:engineer|automation engineer|lead|analyst)|test (?:automation )?(?:engineer|lead|analyst|manager)|automation (?:engineer|architect)|software engineer in test)(?:\s+(?:i{1,3}|iv|\d))?)\b/i,
    /^\s*(?:we are (?:looking for|seeking|hiring)|hiring)\s+(?:an?\s+)?([^\n.,]{3,60}?)(?=\s+(?:to|who|that|for|in|at|with)\b|[.,\n])/im,
  ];

  const COMPANY_PATTERNS = [
    { weight: 5, pattern: /(?:company|employer|organisation|organization)\s*[:\-]\s*([^\n]{2,50})/i },
    // The keyword may start a sentence, so allow a capital on it while keeping the
    // company name itself case sensitive.
    { weight: 4, pattern: /\b[Aa]t\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})\s+in\b/ },
    { weight: 3, pattern: /\b[Aa]t\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})\s+(?:we|you will|you'll|the team|is|are)\b/ },
    { weight: 2, pattern: /\b[Jj]oin(?:ing)?\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})\b/ },
    { weight: 2, pattern: /\b([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})\s+(?:Inc|Ltd|Limited|LLC|PLC|GmbH|Group|Technologies|Systems)\b/ },
  ];

  /** Words that show up capitalised in adverts but are never the employer. */
  const COMPANY_STOPWORDS = [
    'we', 'our', 'the', 'this', 'you', 'your', 'job', 'role', 'team', 'responsibilities',
    'qualifications', 'about', 'what', 'who', 'why', 'benefits', 'apply', 'description',
    'requirements', 'department', 'division', 'hybrid', 'remote', 'full', 'part',
  ];

  const LOCATION_PATTERNS = [
    /(?:location|based in|office)\s*[:\-]?\s*([A-Z][A-Za-z .'\-]+(?:,\s*[A-Z][A-Za-z .'\-]+){0,2})/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:West|East)\s+Sussex)\b/,
    /\b(London|Manchester|Birmingham|Leeds|Bristol|Edinburgh|Glasgow|Reading|Brighton|Crawley|Burgess Hill|Gatwick|Croydon|Horsham|Haywards Heath)\b/,
  ];

  // Longest alternative first, or "Job Identification" matches "Job Id" and the
  // capture group walks off with "entification".
  const JOB_ID_PATTERNS = [
    /(?:job|vacancy|position)\s*(?:identification|identifier|id|number|no|reference|ref)\b\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-_]{3,19})/i,
    /\brequisition\s*(?:id|number|no)?\b\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-_]{3,19})/i,
    /\b(R-?\d{5,9})\b/,
  ];

  function firstMatch(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return '';
  }

  function tidy(value, max = 80) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]+$/, '')
      .trim()
      .slice(0, max);
  }

  /** Trims an advert's padding words from around a job title. */
  function tidyRole(value) {
    return tidy(
      String(value || '')
        .replace(/^(?:a|an|the)\s+/i, '')
        .replace(/^(?:high[- ]performing|enthusiastic|experienced|talented|passionate|motivated)\s+/i, '')
        .replace(/\s+(?:to|who|that|within|in|at|for)\s+.*$/i, '')
        .replace(/\s*\(.*$/, ''),
      60,
    );
  }

  /**
   * Picks the employer name.
   *
   * Several patterns propose candidates; the winner is the one with the best
   * combination of pattern confidence and how often it appears in the advert,
   * since the real employer is usually named more than once.
   */
  function findCompany(text) {
    const scores = new Map();

    for (const { pattern, weight } of COMPANY_PATTERNS) {
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let match = global.exec(text);
      while (match) {
        const candidate = tidy(match[1], 50);
        const words = candidate.split(/\s+/);
        const usable =
          candidate.length > 2 &&
          !COMPANY_STOPWORDS.includes(words[0].toLowerCase()) &&
          !/^(?:job|responsibilities|qualifications)$/i.test(candidate);

        if (usable) {
          const occurrences = text.split(candidate).length - 1;
          const score = weight + Math.min(occurrences, 4);
          scores.set(candidate, Math.max(scores.get(candidate) || 0, score));
        }
        match = global.exec(text);
      }
    }

    let best = '';
    let bestScore = 0;
    for (const [candidate, score] of scores) {
      // On a tie prefer the fuller name, so "Lloyds Banking Group" beats "Lloyds Banking".
      const better = score > bestScore || (score === bestScore && candidate.length > best.length);
      if (better) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  /** Pulls the obvious facts out of a pasted advert. Everything stays editable afterwards. */
  function parseJob(text) {
    const source = String(text || '');
    return {
      role: tidyRole(firstMatch(source, ROLE_PATTERNS)),
      company: findCompany(source),
      location: tidy(firstMatch(source, LOCATION_PATTERNS), 60),
      jobId: tidy(firstMatch(source, JOB_ID_PATTERNS), 24),
    };
  }

  /* ==========================================================================
     2. Matching the advert against what the profile can back up
     ========================================================================== */

  /**
   * Each theme carries the keywords that signal it in an advert and a sentence
   * written in the first person. Sentences only claim things the CV supports.
   */
  const THEMES = [
    {
      id: 'frameworks',
      weight: 10,
      keywords: [
        'automation framework', 'test framework', 'framework design', 'scalable automated',
        'test automation', 'automated testing', 'automated test',
      ],
      sentence:
        'At Cubic I design and maintain automated tests for web UI, REST API and MQTT-based ' +
        'applications using C#, Selenium, RestSharp and SpecFlow, and I have built and owned ' +
        'automation frameworks rather than only writing tests inside someone else{APOS}s.',
    },
    {
      id: 'ai',
      weight: 12,
      keywords: [
        'ai', 'copilot', 'cursor', 'claude', 'codex', 'genai', 'generative',
        'ai-assisted', 'ai assisted', 'llm', 'machine learning assisted', 'ai-powered', 'ai powered',
      ],
      sentence:
        'I use AWS Kiro, an agentic AI IDE, as part of my daily work: turning requirements into ' +
        'structured test designs, scaffolding and refactoring automation code and working through ' +
        'larger framework changes, alongside GitHub Copilot for test code. I review and validate ' +
        'every generated change before it reaches a pipeline, because generated test code that ' +
        'nobody has reasoned about is a liability rather than a saving.',
    },
    {
      id: 'playwright',
      weight: 11,
      keywords: ['playwright', 'typescript', 'javascript', 'cypress', 'webdriverio', 'node'],
      sentence:
        'I am currently mentoring our system test department in Playwright with TypeScript through ' +
        'hands-on sessions, pair programming and code reviews, and building proof-of-concept ' +
        'Playwright frameworks to shape how end-to-end tests are structured and owned.',
    },
    {
      id: 'api',
      weight: 9,
      keywords: [
        'api testing', 'rest assured', 'restassured', 'karate', 'postman', 'soapui',
        'rest api', 'graphql', 'microservices', 'contract testing', 'json schema',
      ],
      sentence:
        'API work is a large part of my day: I automate REST services with RestSharp, validate ' +
        'payloads against JSON Schema, and have used SoapUI, APIFortress and JMeter across REST ' +
        'and SOAP interfaces.',
    },
    {
      id: 'cicd',
      keywords: [
        'ci/cd', 'cicd', 'continuous integration', 'jenkins', 'github actions', 'gitlab ci',
        'azure devops', 'pipeline', 'devops',
      ],
      weight: 9,
      sentence:
        'I integrate automated suites into CI/CD pipelines with Jenkins so regressions surface on ' +
        'every build rather than at release, and I use Git, GitLab and Bitbucket day to day.',
    },
    {
      id: 'data',
      weight: 6,
      keywords: ['sql', 'postgresql', 'oracle', 'nosql', 'database', 'mongodb', 'sql server'],
      sentence:
        'I validate application behaviour directly against PostgreSQL and SQL Server rather than ' +
        'trusting the interface alone, which is usually where the interesting defects hide.',
    },
    {
      id: 'performance',
      weight: 6,
      keywords: ['performance testing', 'load testing', 'jmeter', 'gatling', 'stress test', 'scalability'],
      sentence:
        'On the performance side I designed JMeter coverage for critical API scenarios at ' +
        'Accenture and published recurring health checks so response-time regressions were ' +
        'visible early.',
    },
    {
      id: 'mentoring',
      weight: 8,
      keywords: [
        'mentor', 'coaching', 'lead', 'leadership', 'upskill', 'training', 'knowledge sharing',
        'community of practice', 'centre of excellence', 'center of excellence', 'champion',
      ],
      sentence:
        'Raising a team{APOS}s capability is the part of the work I enjoy most. I was a Katalon ' +
        'Studio subject-matter expert in Accenture{APOS}s Automation Centre of Excellence, ran ' +
        'training for boot camps and new hires, and mentor testers today.',
    },
    {
      id: 'agile',
      weight: 5,
      keywords: ['agile', 'scrum', 'safe', 'kanban', 'sprint', 'ceremonies', 'cross-functional'],
      sentence:
        'I have delivered inside Agile, Scrum and SAFe teams throughout, working alongside ' +
        'developers and product rather than testing at arm{APOS}s length.',
    },
    {
      id: 'rpa',
      weight: 4,
      keywords: ['rpa', 'uipath', 'automation anywhere', 'blue prism', 'robotic process'],
      sentence:
        'I also built RPA automation with UiPath and Automation Anywhere for scheduled ' +
        'production-sanity and regression runs, including orchestrator-based alerting.',
    },
    {
      id: 'quality-culture',
      weight: 5,
      keywords: [
        'shift left', 'quality engineering', 'embed quality', 'best practice', 'test strategy',
        'continuous improvement', 'defect management', 'root cause',
      ],
      sentence:
        'Across twelve years I have worked the full testing lifecycle, from test planning and ' +
        'analysis through automation, regression, integration and system testing to release ' +
        'coordination and defect management.',
    },
  ];

  /** Domain bridges: the advert{APOS}s sector mapped to the closest thing in the CV. */
  const DOMAINS = [
    {
      id: 'payments',
      keywords: ['payment', 'card', 'fintech', 'transaction', 'b2b payments', 'acquiring', 'merchant'],
      sentence:
        'My banking and financial services background at Finastra gives me a feel for the care ' +
        'that payment systems demand, and I would welcome the chance to apply it here.',
    },
    {
      id: 'banking',
      keywords: ['bank', 'lending', 'loan', 'capital markets', 'treasury', 'financial services'],
      sentence:
        'I led test automation for Finastra{APOS}s LoanIQ banking platform, so regulated financial ' +
        'software and the scrutiny that comes with it are familiar ground.',
    },
    {
      id: 'transport',
      keywords: ['transport', 'ticketing', 'mobility', 'rail', 'transit', 'fare'],
      sentence:
        'I work in transportation technology today at Cubic, where ticketing and fare systems have ' +
        'to behave correctly for the public every single day.',
    },
    {
      id: 'telecom',
      keywords: ['telecom', 'telco', 'billing', 'network operator', 'subscriber'],
      sentence:
        'At Accenture I spent years on telecommunications platforms including Kenan billing, Siebel ' +
        'and customer-facing portals, so high-volume billing and subscriber systems are familiar.',
    },
    {
      id: 'insurance',
      keywords: ['insurance', 'underwriting', 'claims', 'policy administration'],
      sentence:
        'My background is in regulated enterprise software across banking and financial services, ' +
        'which carries the same appetite for traceability and evidence.',
    },
  ];

  const LOCAL_AREAS = [
    'crawley', 'burgess hill', 'west sussex', 'east sussex', 'haywards heath', 'horsham',
    'gatwick', 'brighton', 'redhill', 'reigate', 'croydon', 'east grinstead',
  ];

  function countHits(haystack, keywords) {
    let hits = 0;
    const matched = [];
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) {
        hits += 1;
        matched.push(keyword);
      }
    }
    return { hits, matched };
  }

  /**
   * Scores every theme against the advert.
   * @returns {{themes: object[], domain: object|null, local: boolean, matchedKeywords: string[]}}
   */
  function analyseJob(jobText) {
    const haystack = ` ${String(jobText || '').toLowerCase().replace(/\s+/g, ' ')} `;

    const scored = THEMES.map((theme) => {
      const { hits, matched } = countHits(haystack, theme.keywords);
      return { ...theme, hits, matched, score: hits * theme.weight };
    })
      .filter((theme) => theme.hits > 0)
      .sort((a, b) => b.score - a.score);

    let domain = null;
    let bestDomainHits = 0;
    for (const candidate of DOMAINS) {
      const { hits } = countHits(haystack, candidate.keywords);
      if (hits > bestDomainHits) {
        bestDomainHits = hits;
        domain = candidate;
      }
    }

    const local = LOCAL_AREAS.some((area) => haystack.includes(area));
    const matchedKeywords = Array.from(new Set(scored.flatMap((theme) => theme.matched))).sort();

    return { themes: scored, domain, local, matchedKeywords };
  }

  /* ==========================================================================
     3. Assembling the draft
     ========================================================================== */

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  function formatDate(date) {
    const value = date instanceof Date ? date : new Date();
    return `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
  }

  function fill(sentence, apostrophe) {
    return sentence.replace(/\{APOS\}/g, apostrophe);
  }

  function yearsOfExperience(profile) {
    const match = String((profile && profile.summary) || '').match(/(\d{1,2})\s*\+?\s*years/i);
    return match ? Number(match[1]) : null;
  }

  function currentRole(profile) {
    const jobs = (profile && profile.experience) || [];
    return jobs.find((job) => job.current) || jobs[0] || null;
  }

  /**
   * Builds the letter.
   * @param {object} options
   * @param {object} options.profile the portfolio profile
   * @param {string} options.jobText pasted advert
   * @param {object} options.job overrides for role, company, location, jobId, hiringManager, date
   * @param {number} options.maxThemes how many matched themes to include as body paragraphs
   */
  function buildLetter(options) {
    const profile = (options && options.profile) || {};
    const jobText = (options && options.jobText) || '';
    const overrides = (options && options.job) || {};
    const maxThemes = (options && options.maxThemes) || 3;

    const APOS = '\u2019';
    const DASH = '\u2014';

    const parsed = parseJob(jobText);
    const job = {
      role: overrides.role || parsed.role || 'the advertised role',
      company: overrides.company || parsed.company || 'your company',
      location: overrides.location || parsed.location || '',
      jobId: overrides.jobId === undefined ? parsed.jobId : overrides.jobId,
      hiringManager: overrides.hiringManager || 'Hiring Manager',
      date: overrides.date || formatDate(new Date()),
    };

    const analysis = analyseJob(jobText);
    const role = currentRole(profile);
    const years = yearsOfExperience(profile);
    const yearsText = years ? `${years} years` : 'over a decade';

    /* ---- header ---- */
    const contact = [profile.location, profile.email].filter(Boolean).join('  |  ');
    const links = [
      profile.website,
      ...((profile.socials || []).map((social) => social.url)),
    ]
      .filter(Boolean)
      .map((url) => String(url).replace(/^https?:\/\//, '').replace(/\/$/, ''))
      .join('  |  ');

    /* ---- opening ---- */
    const openingParts = [
      `I am applying for the ${job.role} role at ${job.company}.`,
      `I am an ISTQB-certified SDET with ${yearsText} in software testing and test automation`,
    ];
    let opening = `${openingParts[0]} ${openingParts[1]}`;
    if (role && role.company) opening += `, currently ${role.role ? `working as a ${role.role} at ` : 'at '}${role.company}`;
    opening += '.';
    if (analysis.local && profile.location) {
      opening += ` I live in ${String(profile.location).split(',')[0]}, so the location works well for me.`;
    }

    /* ---- body from matched themes ---- */
    const chosen = analysis.themes.slice(0, maxThemes);
    const bodyParagraphs = chosen.map((theme) => fill(theme.sentence, APOS));

    // Nothing matched: fall back to a general capability paragraph.
    if (!bodyParagraphs.length) {
      bodyParagraphs.push(
        fill(THEMES.find((theme) => theme.id === 'frameworks').sentence, APOS),
        fill(THEMES.find((theme) => theme.id === 'quality-culture').sentence, APOS),
      );
    }

    /* ---- domain bridge ---- */
    if (analysis.domain) bodyParagraphs.push(fill(analysis.domain.sentence, APOS));

    /* ---- closing ---- */
    const closing =
      `Thank you for considering my application. I would be glad to discuss how I can help your ` +
      `team deliver quality at pace${job.location ? ` in ${job.location}` : ''}.`;

    const subject = job.jobId
      ? `Re: ${job.role} (Job ID ${job.jobId})`
      : `Re: ${job.role}`;

    const recipient = [job.hiringManager, job.company, job.location].filter(Boolean);

    return {
      job,
      analysis,
      blocks: {
        name: profile.name || '',
        headline: profile.headline ? String(profile.headline).replace(/\s*·\s*/g, ' | ') : '',
        contact,
        links,
        date: job.date,
        recipient,
        subject,
        salutation: `Dear ${job.hiringManager === 'Hiring Manager' ? 'Hiring Manager' : job.hiringManager},`,
        paragraphs: [opening, ...bodyParagraphs, closing],
        signOff: 'Yours sincerely,',
        signature: profile.name || '',
      },
      DASH,
    };
  }

  /** Plain text version, for pasting into an application form or an email. */
  function toPlainText(letter) {
    const blocks = letter.blocks;
    return [
      blocks.name,
      blocks.headline,
      blocks.contact,
      blocks.links,
      '',
      blocks.date,
      '',
      ...blocks.recipient,
      '',
      blocks.subject,
      '',
      blocks.salutation,
      '',
      ...blocks.paragraphs.flatMap((paragraph) => [paragraph, '']),
      blocks.signOff,
      '',
      blocks.signature,
    ]
      .filter((line) => line !== undefined)
      .join('\n');
  }

  /* ==========================================================================
     4. Writing the .docx
     ========================================================================== */

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    const buffer = Buffer.from(text, 'utf8');
    return new Uint8Array(buffer);
  }

  /**
   * Minimal zip writer, stored (uncompressed) entries only.
   * A letter is a few kilobytes, so compression buys nothing and this keeps the
   * implementation small enough to read in one sitting.
   */
  function zip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;

    const push = (bytes) => {
      chunks.push(bytes);
      offset += bytes.length;
    };

    const u16 = (value) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
    const u32 = (value) =>
      new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);

    for (const entry of entries) {
      const nameBytes = utf8(entry.name);
      const dataBytes = entry.data instanceof Uint8Array ? entry.data : utf8(entry.data);
      const checksum = crc32(dataBytes);
      const localOffset = offset;

      push(u32(0x04034b50));           // local file header
      push(u16(20));                   // version needed
      push(u16(0x0800));               // UTF-8 names
      push(u16(0));                    // stored
      push(u16(0));                    // time
      push(u16(0));                    // date
      push(u32(checksum));
      push(u32(dataBytes.length));
      push(u32(dataBytes.length));
      push(u16(nameBytes.length));
      push(u16(0));
      push(nameBytes);
      push(dataBytes);

      const header = [];
      header.push(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0));
      header.push(u32(checksum), u32(dataBytes.length), u32(dataBytes.length));
      header.push(u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset));
      header.push(nameBytes);
      central.push(header);
    }

    const centralStart = offset;
    for (const header of central) for (const part of header) push(part);
    const centralSize = offset - centralStart;

    push(u32(0x06054b50));
    push(u16(0));
    push(u16(0));
    push(u16(central.length));
    push(u16(central.length));
    push(u32(centralSize));
    push(u32(centralStart));
    push(u16(0));

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) {
      output.set(chunk, position);
      position += chunk.length;
    }
    return output;
  }

  function escapeXml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function wordParagraph(text, options) {
    const settings = options || {};
    const size = settings.size || 22;
    const after = settings.after || 0;
    const bold = settings.bold ? '<w:b/>' : '';
    const color = settings.color ? `<w:color w:val="${settings.color}"/>` : '';

    const paragraphProps =
      `<w:pPr><w:spacing w:before="0" w:after="${after}"/>` +
      `<w:rPr>${bold}<w:sz w:val="${size}"/></w:rPr></w:pPr>`;

    if (!text) return `<w:p>${paragraphProps}</w:p>`;

    const runProps = `<w:rPr>${bold}${color}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
    return (
      `<w:p>${paragraphProps}<w:r>${runProps}` +
      `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
    );
  }

  const GREY = '595959';

  /** @returns {Uint8Array} a .docx file */
  function buildDocx(letter) {
    const blocks = letter.blocks;

    const paragraphs = [
      wordParagraph(blocks.name, { size: 36, bold: true, after: 40 }),
      blocks.headline ? wordParagraph(blocks.headline, { size: 20, color: GREY, after: 40 }) : '',
      blocks.contact ? wordParagraph(blocks.contact, { size: 20, color: GREY, after: 40 }) : '',
      blocks.links ? wordParagraph(blocks.links, { size: 20, color: GREY, after: 320 }) : '',
      wordParagraph(blocks.date, { after: 320 }),
      ...blocks.recipient.map((line, index) =>
        wordParagraph(line, { after: index === blocks.recipient.length - 1 ? 320 : 0 }),
      ),
      wordParagraph(blocks.subject, { bold: true, after: 320 }),
      wordParagraph(blocks.salutation, { after: 240 }),
      ...blocks.paragraphs.map((text) => wordParagraph(text, { after: 240 })),
      wordParagraph(blocks.signOff, { after: 400 }),
      wordParagraph(blocks.signature, { bold: true }),
    ]
      .filter(Boolean)
      .join('');

    const sectionProps =
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1247" w:right="1361" w:bottom="1247" w:left="1361" ' +
      'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<w:body>${paragraphs}${sectionProps}</w:body></w:document>`;

    const stylesXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
      '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
      '<w:spacing w:after="0" w:line="259" w:lineRule="auto"/>' +
      '</w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
      '<w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>';

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>';

    const documentRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    const coreXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${escapeXml(`Cover letter ${DASH_TEXT} ${letter.job.role} ${DASH_TEXT} ${letter.job.company}`)}</dc:title>` +
      `<dc:creator>${escapeXml(blocks.name)}</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>` +
      '</cp:coreProperties>';

    return zip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/_rels/document.xml.rels', data: documentRels },
      { name: 'word/styles.xml', data: stylesXml },
      { name: 'docProps/core.xml', data: coreXml },
    ]);
  }

  const DASH_TEXT = '-';

  /** Suggested file name, e.g. Cover-Letter-AmericanExpress-QualityEngineerIII */
  function suggestFileName(letter) {
    const clean = (value, max) =>
      String(value || '')
        .replace(/[^a-z0-9]+/gi, ' ')
        .trim()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('')
        .slice(0, max);

    const parts = [
      'Cover-Letter',
      clean(letter.job.company, 28),
      clean(letter.job.role, 30),
    ].filter(Boolean);
    return parts.join('-');
  }

  root.LetterCore = {
    parseJob,
    analyseJob,
    buildLetter,
    toPlainText,
    buildDocx,
    suggestFileName,
    formatDate,
    THEMES,
    DOMAINS,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).LetterCore;
}
