import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  serperKey:    process.env.SERPER_API_KEY,
  gmailUser:    process.env.GMAIL_USER,
  gmailPass:    process.env.GMAIL_APP_PASSWORD,
  emailTo:      process.env.EMAIL_TO || process.env.GMAIL_USER,
  minLeads:     3,
};

// ── MEMORY ────────────────────────────────────────────────────────────────
const MEMORY_FILE = 'memory.json';

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      return new Set(data.seen || []);
    }
  } catch(e) { console.log('⚠ Could not load memory'); }
  return new Set();
}

function saveMemory(seen) {
  try {
    const arr = [...seen].slice(-500);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify({ seen: arr, updated: new Date().toISOString() }, null, 2));
    console.log(`   💾 Memory saved — ${arr.length} companies tracked`);
  } catch(e) { console.log('⚠ Could not save memory:', e.message); }
}

function companyKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// ── SERPER QUERIES ────────────────────────────────────────────────────────
const QUERIES = [
  // Defense & aerospace — big contracts = big budgets = sponsor appetite
  'defense aerospace company contract awarded europe 2025 2026',
  'rheinmetall knds airbus saab thales leonardo new contract funding',
  'defense company hiring engineers recruitment europe 2026',
  'aerospace manufacturer expansion europe new facility',
  'military industrial company university partnership sponsorship stem',

  // Automotive — core Formula Student audience
  'automotive company europe investment expansion 2025 2026',
  'electric vehicle EV startup europe funding round',
  'automotive supplier new facility europe engineering',
  'motorsport racing sponsorship engineering brand partner',
  'formula student sponsor partner engineering competition europe',

  // Robotics & industrial automation
  'robotics automation company europe funding expansion 2026',
  'industrial automation startup europe investment',
  'manufacturing technology company europe growth',

  // Energy & fuel — potential infrastructure partner
  'fuel energy company europe sponsorship stem engineering',
  'OMV MOL shell BP total sponsorship university youth',
  'generator rental temporary power event company europe',

  // Engineering software — Siemens, Bosch, Ansys type
  'engineering software company student partnership europe',
  'siemens bosch continental ansys engineering student program',
  'CAD simulation software company europe expansion',

  // Infrastructure — tents, toilets, fencing
  'tent marquee temporary structure supplier event europe',
  'portable toilet sanitation event rental company europe',
  'fencing barrier crowd control event supplier europe',
  'container storage rental event company europe',

  // STEM sponsorship
  'company university stem sponsorship europe 2026',
  'company student engineering competition sponsor europe',
  'tech hardware startup engineering talent europe funding',
  'semiconductor electronics company europe expansion hiring',
];

async function searchSerper(query) {
  try {
    const response = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': CONFIG.serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 10, gl: 'us', hl: 'en' }),
    });
    const data = await response.json();
    return (data.news || []).map(item => ({
      title:   item.title || '',
      summary: item.snippet || '',
      link:    item.link || '',
      pubDate: item.date || '',
      source:  item.source || '',
      query,
    }));
  } catch(e) {
    console.log(`⚠ Serper failed for "${query}": ${e.message}`);
    return [];
  }
}

async function fetchAllArticles() {
  console.log(`   Running ${QUERIES.length} targeted searches…`);
  const allItems = [];
  for (const query of QUERIES) {
    const results = await searchSerper(query);
    allItems.push(...results);
    await new Promise(r => setTimeout(r, 200));
  }
  const seenLinks = new Set();
  const seenTitles = new Set();
  return allItems.filter(item => {
    const lk = item.link?.slice(0,80);
    const tk = item.title?.toLowerCase().slice(0,60);
    if (seenLinks.has(lk) || seenTitles.has(tk)) return false;
    seenLinks.add(lk); seenTitles.add(tk);
    return true;
  });
}

// ── CLAUDE ANALYSIS ───────────────────────────────────────────────────────
async function analyzeWithClaude(items, seenCompanies) {
  if (!items.length) return [];
  const batches = [];
  for (let i = 0; i < items.length; i += 20) batches.push(items.slice(i, i + 20));
  const allLeads = [];

  for (const batch of batches) {
    const itemsList = batch.map((item, i) =>
      `[${i}]\nTitle: ${item.title}\nSummary: ${item.summary}\nSource: ${item.source}\nURL: ${item.link}`
    ).join('\n\n---\n\n');

    const prompt = `You are a partnership analyst for Formula Student Alpe Adria (fs-alpeadria.com) — a university motorsport engineering competition in Croatia where student teams build and race single-seater cars.

The event attracts hundreds of engineering students and young engineers. It needs TWO types of partners:

TYPE A — IN-KIND INFRASTRUCTURE (highest priority):
Companies providing equipment FREE in exchange for logo exposure at the event:
- Tent / marquee / paddock structure suppliers
- Portable toilet and sanitation companies  
- Fencing and barrier suppliers
- Container and storage rental
- Fuel suppliers (petrol/diesel)
- Generator and temporary power rental
- Medical/first aid services
- Catering companies

TYPE B — BRAND SPONSORS:
Companies paying to put their brand in front of engineering students (their future employees):
- Defense & aerospace (Rheinmetall, KNDS, Lockheed, Airbus, Saab, Leonardo, Thales, BAE Systems)
- Automotive OEMs and suppliers
- Industrial automation and robotics
- Engineering software (CAD, simulation, PLM — Siemens, Ansys, Dassault)
- Electronics and semiconductors
- Energy companies (fuel, renewables)
- Any STEM company that recently got big funding or contracts and wants engineer recruitment visibility

STRONG signals to flag:
- Defense/aerospace company won contract or got funding → has budget, wants brand with engineering students
- Automotive/industrial company expanding → wants engineering talent pipeline
- Tech/hardware startup raised funding → needs STEM brand awareness among graduates
- Company announced engineering hiring push → Formula Student is perfect recruitment channel
- Fuel, energy or generator company expanding → potential fuel/power infrastructure partner
- Tent, portable toilet, fencing, container company → direct infrastructure partner
- Company already sponsoring other engineering/motorsport competitions → warm lead, they understand the value
- Large company launching university or student program → natural partnership

IMPORTANT: Each company only once — use the most relevant article.

SKIP: consumer lifestyle, finance, politics, crime, non-engineering sports.

For each lead return:
{
  "index": <article number>,
  "company": "<company name>",
  "partner_type": "Infrastructure|Brand Sponsor|Both",
  "opportunity": "<one sentence: what specific thing happened>",
  "pitch": "<one sentence: what THIS company gets from partnering with FSAA>",
  "urgency": "high|medium|low",
  "linkedin_role": "<Sponsorship Manager, Marketing Director, CSR Manager, Head of University Relations, CEO, Procurement Manager>",
  "linkedin_company": "<company name>",
  "sector": "<Defense|Automotive|Robotics|Energy|Tech|Infrastructure|Software|Other>"
}

Urgency: high = just got funding/contract (act now), medium = expanding (this month), low = general signal.

Return ONLY a JSON array. No text outside JSON. If nothing fits return [].

ARTICLES:
${itemsList}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key':CONFIG.anthropicKey, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:2000, messages:[{ role:'user', content:prompt }] }),
      });
      const data = await response.json();
      if (data.error) { console.log(`⚠ Claude error: ${JSON.stringify(data.error)}`); continue; }
      const text = data.content?.[0]?.text || '[]';
      console.log(`   Claude preview: ${text.slice(0,100)}`);
      const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
      for (const lead of parsed) {
        const original = batch[lead.index];
        if (!original) continue;
        const key = companyKey(lead.company);
        if (seenCompanies.has(key)) { console.log(`   ⏭ Skipping ${lead.company} (already seen)`); continue; }
        allLeads.push({ ...lead, link:original.link, pubDate:original.pubDate, source:original.source });
      }
    } catch(e) { console.log(`⚠ Claude batch failed: ${e.message}`); }
  }

  const seenInRun = new Set();
  const unique = allLeads.filter(l => {
    const k = companyKey(l.company);
    if (seenInRun.has(k)) return false;
    seenInRun.add(k); return true;
  });

  const order = { high:0, medium:1, low:2 };
  return unique.sort((a,b) => (order[a.urgency]||1)-(order[b.urgency]||1));
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function linkedInURL(company, role) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${role} ${company}`)}&origin=GLOBAL_SEARCH_HEADER`;
}

const SECTOR_COLOR = { Defense:'#FF3B5C', Automotive:'#1877F2', Robotics:'#8B5CF6', Energy:'#FF8C00', Tech:'#00C896', Infrastructure:'#FF6B2B', Software:'#0A66C2', Other:'#888' };
const TYPE_COLOR   = { 'Infrastructure':'#FF6B2B', 'Brand Sponsor':'#1877F2', 'Both':'#8B5CF6' };
const TYPE_ICON    = { 'Infrastructure':'🏗', 'Brand Sponsor':'🎯', 'Both':'⭐' };
const U_COLOR = { high:'#FF3B5C', medium:'#FF8C00', low:'#00C896' };
const U_LABEL = { high:'🔴 HOT', medium:'🟡 WARM', low:'🟢 COLD' };

// ── BUILD EMAIL ───────────────────────────────────────────────────────────
function buildEmail(leads, scannedCount) {
  const now = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const infraCount   = leads.filter(l => l.partner_type==='Infrastructure'||l.partner_type==='Both').length;
  const sponsorCount = leads.filter(l => l.partner_type==='Brand Sponsor'||l.partner_type==='Both').length;
  const highCount    = leads.filter(l => l.urgency==='high').length;

  const sectorCounts = {};
  leads.forEach(l => { sectorCounts[l.sector||'Other']=(sectorCounts[l.sector||'Other']||0)+1; });
  const sectorBadges = Object.entries(sectorCounts)
    .map(([s,n]) => `<span style="font-size:11px;background:${SECTOR_COLOR[s]||'#888'}25;color:${SECTOR_COLOR[s]||'#888'};border:1px solid ${SECTOR_COLOR[s]||'#888'}50;padding:3px 10px;border-radius:99px;font-weight:700">${s} · ${n}</span>`)
    .join(' ');

  const leadsHTML = leads.map(l => `
    <div style="background:white;border:1px solid #E0E0E0;border-radius:12px;padding:22px;margin-bottom:14px;border-left:4px solid ${U_COLOR[l.urgency]||'#888'}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;flex-wrap:wrap">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${U_COLOR[l.urgency]}">${U_LABEL[l.urgency]}</span>
        <span style="font-size:11px;font-weight:700;background:${TYPE_COLOR[l.partner_type]||'#888'};color:white;padding:2px 9px;border-radius:4px">${TYPE_ICON[l.partner_type]||'📌'} ${l.partner_type}</span>
        <span style="font-size:11px;font-weight:700;background:${SECTOR_COLOR[l.sector]||'#888'}20;color:${SECTOR_COLOR[l.sector]||'#888'};border:1px solid ${SECTOR_COLOR[l.sector]||'#888'}40;padding:2px 9px;border-radius:4px">${l.sector}</span>
        ${l.source ? `<span style="font-size:10px;color:#bbb">· ${l.source}</span>` : ''}
        ${l.pubDate ? `<span style="font-size:10px;color:#bbb;margin-left:auto">${l.pubDate}</span>` : ''}
      </div>
      <div style="font-size:20px;font-weight:800;color:#0A0A0A;letter-spacing:-0.5px;margin-bottom:8px;line-height:1.2">${l.company}</div>
      <div style="font-size:13px;color:#444;margin-bottom:8px;line-height:1.6"><span style="font-weight:700;color:#0A0A0A">Signal: </span>${l.opportunity}</div>
      <div style="font-size:13px;color:#1a56c4;margin-bottom:18px;line-height:1.6;background:#EEF4FF;padding:10px 14px;border-radius:8px;border-left:3px solid #1877F2"><span style="font-weight:700">💡 Pitch: </span>${l.pitch}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="${linkedInURL(l.linkedin_company, l.linkedin_role)}" style="display:inline-flex;align-items:center;gap:6px;background:#0A66C2;color:white;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:700">🔍 Find ${l.linkedin_role}</a>
        ${l.link ? `<a href="${l.link}" style="display:inline-flex;align-items:center;gap:6px;background:#F5F5F2;color:#333;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid #DDD">📰 Read article →</a>` : ''}
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#EBEBEB;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:28px 16px">

  <div style="background:#0A0A0A;border-radius:16px;overflow:hidden;margin-bottom:12px">
    <div style="padding:28px 28px 0;position:relative">
      <div style="position:absolute;top:0;right:0;width:0;height:0;border-left:120px solid transparent;border-top:120px solid #E8001C;opacity:0.9"></div>
      <div style="position:relative;z-index:1">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;color:#555;margin-bottom:6px">Partnership Intelligence</div>
        <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:white;letter-spacing:-1px;line-height:1.1;margin-bottom:4px">Formula Student<br/><span style="color:#E8001C">Alpe Adria</span></div>
        <div style="font-size:12px;color:#FFE600;font-weight:700;margin-bottom:20px">fs-alpeadria.com · ${now}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);text-align:center;padding:0 12px">
      ${[['#FFE600',leads.length,'Leads'],['#FF3B5C',highCount,'Hot'],['#FF6B2B',infraCount,'Infra'],['#1877F2',sponsorCount,'Sponsors'],['#777',scannedCount,'Scanned']]
        .map(([c,v,l]) => `<div style="padding:14px 6px"><div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:${c};line-height:1">${v}</div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:3px">${l}</div></div>`).join('')}
    </div>
    ${leads.length > 0 ? `<div style="padding:0 20px 20px;display:flex;gap:6px;flex-wrap:wrap">${sectorBadges}</div>` : '<div style="padding-bottom:20px"></div>'}
  </div>

  <div style="background:white;border:1px solid #E0E0E0;border-radius:10px;padding:12px 16px;margin-bottom:18px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#555">
    <span><b style="color:#FF6B2B">🏗 Infrastructure</b> — provides equipment in-kind</span>
    <span><b style="color:#1877F2">🎯 Brand Sponsor</b> — pays for engineer audience</span>
    <span><b style="color:#8B5CF6">⭐ Both</b></span>
  </div>

  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#999;margin-bottom:12px;display:flex;align-items:center;gap:8px">
    <div style="width:16px;height:2px;background:#E8001C;border-radius:2px"></div>Partnership Opportunities
  </div>

  ${leadsHTML}

  <div style="text-align:center;padding:24px 0 8px;font-size:11px;color:#AAA;line-height:1.8">
    Formula Student Alpe Adria · Partnership Intelligence<br/>
    Powered by Claude Sonnet + Serper · Europe-wide · Every 3 days
  </div>
</div></body></html>`;
}

// ── SEND EMAIL ────────────────────────────────────────────────────────────
async function sendEmail(html, leadCount) {
  const transporter = nodemailer.createTransport({ service:'gmail', auth:{ user:CONFIG.gmailUser, pass:CONFIG.gmailPass } });
  const subject = `🏎 ${leadCount} partnership leads · Formula Student Alpe Adria`;
  await transporter.sendMail({ from:`"FSAA Partnerships" <${CONFIG.gmailUser}>`, to:CONFIG.emailTo, subject, html });
  console.log(`✅ Email sent: "${subject}"`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏎  FSAA Partnership Intelligence — starting…');
  if (!CONFIG.anthropicKey) { console.error('❌ Missing ANTHROPIC_API_KEY'); process.exit(1); }
  if (!CONFIG.serperKey)    { console.error('❌ Missing SERPER_API_KEY');    process.exit(1); }
  if (!CONFIG.gmailUser)    { console.error('❌ Missing GMAIL_USER');         process.exit(1); }
  if (!CONFIG.gmailPass)    { console.error('❌ Missing GMAIL_APP_PASSWORD'); process.exit(1); }

  const seenCompanies = loadMemory();
  console.log(`📋 Memory: ${seenCompanies.size} companies already seen`);

  console.log('🔍 Searching via Serper…');
  const articles = await fetchAllArticles();
  console.log(`   Found ${articles.length} unique articles`);

  console.log('🧠 Analysing with Claude Sonnet…');
  const leads = await analyzeWithClaude(articles, seenCompanies);
  console.log(`   Found ${leads.length} new leads`);

  if (leads.length < CONFIG.minLeads) {
    console.log(`📭 Only ${leads.length} leads (min ${CONFIG.minLeads}) — skipping email`);
    leads.forEach(l => seenCompanies.add(companyKey(l.company)));
    saveMemory(seenCompanies);
    return;
  }

  leads.forEach(l => seenCompanies.add(companyKey(l.company)));
  saveMemory(seenCompanies);

  console.log('📧 Sending email…');
  const html = buildEmail(leads, articles.length);
  await sendEmail(html, leads.length);
  console.log('✅ Done.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
