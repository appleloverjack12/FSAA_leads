import Parser from 'rss-parser';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

const parser = new Parser({ timeout: 10000 });

const CONFIG = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  gmailUser:    process.env.GMAIL_USER,
  gmailPass:    process.env.GMAIL_APP_PASSWORD,
  emailTo:      process.env.EMAIL_TO || process.env.GMAIL_USER,
};

const SOURCES = [
  { url: 'https://news.google.com/rss/search?q=defense+aerospace+company+contract+funding+europe+2026&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=rheinmetall+knds+thales+airbus+saab+leonardo+expansion&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=defense+company+hiring+engineers+recruitment+europe&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=aerospace+manufacturer+new+facility+europe+investment&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=automotive+company+europe+investment+expansion+2026&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=EV+electric+vehicle+startup+europe+funding+2026&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=motorsport+racing+sponsorship+engineering+brand&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=formula+student+sponsor+partner+engineering+competition&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=robotics+automation+company+europe+funding+expansion&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=industrial+automation+startup+europe+investment+2026&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=energy+fuel+company+europe+sponsorship+stem+engineering&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=OMV+MOL+shell+total+BP+europe+sponsorship+youth&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=engineering+software+company+europe+student+partnership&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=siemens+bosch+continental+aptiv+hiring+engineers+europe&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=tech+company+europe+engineering+hiring+talent+2026&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=semiconductor+electronics+company+europe+expansion&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=europe+startup+funding+round+engineering+hardware&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=event+tent+temporary+structure+supplier+europe&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=portable+toilet+sanitation+event+supplier+europe&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=generator+rental+power+event+company+europe&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=company+university+stem+partnership+sponsorship+europe+2026&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://news.google.com/rss/search?q=company+student+competition+sponsor+engineering+europe&hl=en&gl=US&ceid=US:en', region: 'EU' },
  { url: 'https://www.poslovni.hr/feed/', region: 'HR' },
  { url: 'https://lider.media/feed/', region: 'HR' },
];

const REGION_FLAG = { EU: '🇪🇺', HR: '🇭🇷', SI: '🇸🇮', AT: '🇦🇹' };

// ── RESOLVE GOOGLE NEWS REDIRECT URLS ─────────────────────────────────────
// Google News RSS links are redirect URLs - extract the actual article URL
function resolveGoogleNewsUrl(url) {
  if (!url) return null;
  try {
    // Google News URLs contain the real URL encoded in them
    // Format: https://news.google.com/rss/articles/...
    // Try to extract from query params first
    const urlObj = new URL(url);
    // Some have ?url= param
    const directUrl = urlObj.searchParams.get('url');
    if (directUrl) return directUrl;
    // Otherwise return as-is — it will redirect but at least it's clickable
    return url;
  } catch {
    return url;
  }
}

// ── FETCH ALL FEEDS ───────────────────────────────────────────────────────
async function fetchAllFeeds() {
  const allItems = [];
  const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const item of (feed.items || [])) {
        const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
        if (pubDate < fiveDaysAgo) continue;

        // Resolve the actual URL from Google News redirect
        const resolvedLink = resolveGoogleNewsUrl(item.link || '');

        allItems.push({
          title:   item.title || '',
          summary: item.contentSnippet || item.content || '',
          link:    resolvedLink || '',
          pubDate: item.pubDate || '',
          region:  source.region,
        });
      }
    } catch (e) { console.log(`⚠ Feed failed: ${source.url} — ${e.message}`); }
  }

  // Deduplicate by title
  const seen = new Set();
  return allItems.filter(item => {
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── CLAUDE ANALYSIS ───────────────────────────────────────────────────────
async function analyzeWithClaude(items) {
  if (!items.length) return [];
  const batches = [];
  for (let i = 0; i < items.length; i += 20) batches.push(items.slice(i, i + 20));
  const allLeads = [];

  for (const batch of batches) {
    const itemsList = batch.map((item, i) =>
      `[${i}] ${REGION_FLAG[item.region] || '🌍'}\nTitle: ${item.title}\nSummary: ${item.summary.slice(0, 300)}\nURL: ${item.link}`
    ).join('\n\n---\n\n');

    const prompt = `You are a partnership analyst for Formula Student Alpe Adria (fs-alpeadria.com), a university motorsport engineering competition in Croatia where student teams build and race single-seater cars.

The event needs TWO types of partners:

TYPE A — IN-KIND INFRASTRUCTURE (highest priority):
Companies providing equipment for FREE in exchange for logo exposure:
- Tent/marquee/paddock structure suppliers
- Portable toilet and sanitation companies
- Fencing and barrier suppliers
- Container and storage rental
- Fuel suppliers (petrol/diesel)
- Generator and temporary power rental
- Medical/first aid services
- Catering companies

TYPE B — BRAND SPONSORS:
Companies paying to reach engineering students (future employees):
- Defense & aerospace (Rheinmetall, KNDS, Lockheed, Airbus, Saab, Leonardo, Thales etc.)
- Automotive OEMs and suppliers
- Industrial automation and robotics companies
- Engineering software companies (CAD, simulation, PLM)
- Electronics and semiconductor companies
- Energy companies
- Any STEM company that recently got big funding or contracts and wants engineer recruitment visibility

FLAG these signals:
- Defense/aerospace company won contract or got funding → has budget, wants engineer brand visibility
- Automotive/industrial company expanding → wants engineering talent pipeline
- Tech/hardware startup raised funding → needs STEM brand awareness
- Company announced engineering hiring push → Formula Student is perfect for them
- Fuel, energy or generator company mentioned → potential infrastructure partner
- Tent, portable toilet, fencing, container company → direct infrastructure partner
- Company already sponsoring other engineering/motorsport competitions → warm lead
- Large industrial company launching student or university program

IMPORTANT: If the same company appears in multiple articles, include it ONLY ONCE using the most relevant article.

SKIP: consumer lifestyle, finance, politics, crime, sports unrelated to engineering.

JSON format for each lead:
{
  "index": <number of the BEST article for this company>,
  "company": "<name>",
  "partner_type": "Infrastructure|Brand Sponsor|Both",
  "opportunity": "<one sentence trigger>",
  "pitch": "<one sentence: what does THIS company get from partnering with Formula Student Alpe Adria>",
  "urgency": "high|medium|low",
  "linkedin_role": "<best contact title>",
  "linkedin_company": "<company name>",
  "sector": "<Defense|Automotive|Robotics|Energy|Tech|Infrastructure|Software|Other>"
}

Return ONLY a JSON array. No text outside JSON. If nothing fits return [].

NEWS:
${itemsList}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CONFIG.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await response.json();
      if (data.error) { console.log(`⚠ Claude API error: ${JSON.stringify(data.error)}`); continue; }
      const text = data.content?.[0]?.text || '[]';
      console.log(`   Claude preview: ${text.slice(0, 120)}`);
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      for (const lead of parsed) {
        const original = batch[lead.index];
        if (original) allLeads.push({ ...lead, title: original.title, link: original.link, pubDate: original.pubDate });
      }
    } catch (e) { console.log(`⚠ Claude batch failed: ${e.message}`); }
  }

  // Deduplicate by company name across batches
  const seenCompanies = new Set();
  const uniqueLeads = allLeads.filter(l => {
    const key = l.company.toLowerCase().trim();
    if (seenCompanies.has(key)) return false;
    seenCompanies.add(key);
    return true;
  });

  const order = { high: 0, medium: 1, low: 2 };
  return uniqueLeads.sort((a, b) => (order[a.urgency] || 1) - (order[b.urgency] || 1));
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function linkedInURL(company, role) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${role} ${company}`)}&origin=GLOBAL_SEARCH_HEADER`;
}

const SECTOR_COLOR = { Defense:'#FF3B5C', Automotive:'#1877F2', Robotics:'#8B5CF6', Energy:'#FF8C00', Tech:'#00C896', Infrastructure:'#FF6B2B', Software:'#0A66C2', Other:'#888' };
const TYPE_COLOR   = { 'Infrastructure':'#FF6B2B', 'Brand Sponsor':'#1877F2', 'Both':'#8B5CF6' };
const TYPE_ICON    = { 'Infrastructure':'🏗', 'Brand Sponsor':'🎯', 'Both':'⭐' };

// ── BUILD EMAIL ───────────────────────────────────────────────────────────
function buildEmail(leads, fetchedCount) {
  const now = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const uColor = { high:'#FF3B5C', medium:'#FF8C00', low:'#00C896' };
  const uLabel = { high:'🔴 HOT', medium:'🟡 WARM', low:'🟢 COLD' };

  const infraCount   = leads.filter(l => l.partner_type === 'Infrastructure' || l.partner_type === 'Both').length;
  const sponsorCount = leads.filter(l => l.partner_type === 'Brand Sponsor'  || l.partner_type === 'Both').length;
  const highCount    = leads.filter(l => l.urgency === 'high').length;

  const sectorCounts = {};
  leads.forEach(l => { sectorCounts[l.sector||'Other'] = (sectorCounts[l.sector||'Other']||0)+1; });
  const sectorBadges = Object.entries(sectorCounts)
    .map(([s,n]) => `<span style="font-size:11px;background:${SECTOR_COLOR[s]||'#888'}25;color:${SECTOR_COLOR[s]||'#888'};border:1px solid ${SECTOR_COLOR[s]||'#888'}50;padding:3px 10px;border-radius:99px;font-weight:700">${s} · ${n}</span>`)
    .join(' ');

  const leadsHTML = leads.length === 0
    ? `<div style="text-align:center;padding:48px 24px;color:#888;font-size:14px">No leads found this cycle. Next scan in 3 days.</div>`
    : leads.map(l => `
      <div style="background:white;border:1px solid #E0E0E0;border-radius:12px;padding:22px;margin-bottom:14px;border-left:4px solid ${uColor[l.urgency]||'#888'}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;flex-wrap:wrap">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${uColor[l.urgency]}">${uLabel[l.urgency]}</span>
          <span style="font-size:11px;font-weight:700;background:${TYPE_COLOR[l.partner_type]||'#888'};color:white;padding:2px 9px;border-radius:4px">${TYPE_ICON[l.partner_type]||'📌'} ${l.partner_type}</span>
          <span style="font-size:11px;font-weight:700;background:${SECTOR_COLOR[l.sector]||'#888'}20;color:${SECTOR_COLOR[l.sector]||'#888'};border:1px solid ${SECTOR_COLOR[l.sector]||'#888'}40;padding:2px 9px;border-radius:4px">${l.sector}</span>
          ${l.pubDate ? `<span style="font-size:10px;color:#bbb;margin-left:auto">${new Date(l.pubDate).toLocaleDateString('en-GB')}</span>` : ''}
        </div>

        <div style="font-size:20px;font-weight:800;color:#0A0A0A;letter-spacing:-0.5px;margin-bottom:8px;line-height:1.2">${l.company}</div>

        <div style="font-size:13px;color:#444;margin-bottom:8px;line-height:1.6">
          <span style="font-weight:700;color:#0A0A0A">Signal: </span>${l.opportunity}
        </div>

        <div style="font-size:13px;color:#1a56c4;margin-bottom:18px;line-height:1.6;background:#EEF4FF;padding:10px 14px;border-radius:8px;border-left:3px solid #1877F2">
          <span style="font-weight:700">💡 Pitch: </span>${l.pitch}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="${linkedInURL(l.linkedin_company, l.linkedin_role)}"
             style="display:inline-flex;align-items:center;gap:6px;background:#0A66C2;color:white;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:700">
            🔍 Find ${l.linkedin_role}
          </a>
          ${l.link && !l.link.includes('news.google.com') ? `
          <a href="${l.link}"
             style="display:inline-flex;align-items:center;gap:6px;background:#F5F5F2;color:#333;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid #DDD">
            📰 Read article →
          </a>` : ''}
        </div>
      </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#EBEBEB;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:28px 16px">

  <!-- ── HEADER ── -->
  <div style="background:#0A0A0A;border-radius:16px;overflow:hidden;margin-bottom:12px">

    <!-- Top bar with logo -->
    <div style="padding:28px 28px 0;position:relative">
      <div style="position:absolute;top:0;right:0;width:0;height:0;border-left:120px solid transparent;border-top:120px solid #E8001C;opacity:0.9"></div>
      <div style="position:relative;z-index:1">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:3px;color:#555;margin-bottom:6px">Partnership Intelligence</div>
        <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:white;letter-spacing:-1px;line-height:1.1;margin-bottom:4px">
          Formula Student<br/><span style="color:#E8001C">Alpe Adria</span>
        </div>
        <div style="font-size:12px;color:#FFE600;font-weight:700;letter-spacing:0.5px;margin-bottom:20px">fs-alpeadria.com · ${now}</div>
      </div>
    </div>

    <!-- Stats row -->
    <div style="display:flex;border-top:1px solid #1A1A1A;margin:0 28px"></div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);text-align:center;padding:0 12px 0">
      ${[
        ['#FFE600', leads.length,  'Leads'],
        ['#FF3B5C', highCount,     'Hot'],
        ['#FF6B2B', infraCount,    'Infra'],
        ['#1877F2', sponsorCount,  'Sponsors'],
        ['#777',    fetchedCount,  'Scanned'],
      ].map(([color, val, label]) => `
        <div style="padding:16px 8px">
          <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:${color};line-height:1">${val}</div>
          <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:3px">${label}</div>
        </div>`).join('')}
    </div>

    <!-- Sector badges -->
    ${leads.length > 0 ? `
    <div style="padding:0 20px 20px;display:flex;gap:6px;flex-wrap:wrap">
      ${sectorBadges}
    </div>` : '<div style="padding-bottom:20px"></div>'}
  </div>

  <!-- ── LEGEND ── -->
  <div style="background:white;border:1px solid #E0E0E0;border-radius:10px;padding:12px 16px;margin-bottom:18px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
    <span style="font-size:11px;color:#555"><b style="color:#FF6B2B">🏗 Infrastructure</b> — equipment in-kind</span>
    <span style="font-size:11px;color:#555"><b style="color:#1877F2">🎯 Brand Sponsor</b> — pays for STEM audience</span>
    <span style="font-size:11px;color:#555"><b style="color:#8B5CF6">⭐ Both</b></span>
  </div>

  <!-- ── LEADS ── -->
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#999;margin-bottom:12px;display:flex;align-items:center;gap:8px">
    <div style="width:16px;height:2px;background:#E8001C;border-radius:2px"></div>
    Partnership Opportunities This Cycle
  </div>

  ${leadsHTML}

  <!-- ── FOOTER ── -->
  <div style="text-align:center;padding:24px 0 8px;font-size:11px;color:#AAA;line-height:1.8">
    Formula Student Alpe Adria · Partnership Intelligence<br/>
    Scans every 3 days · Europe-wide scope · Powered by Claude AI
  </div>

</div>
</body>
</html>`;
}

// ── SEND EMAIL ────────────────────────────────────────────────────────────
async function sendEmail(html, leadCount) {
  const transporter = nodemailer.createTransport({ service:'gmail', auth:{ user:CONFIG.gmailUser, pass:CONFIG.gmailPass } });
  const subject = leadCount > 0
    ? `🏎 ${leadCount} partnership leads · Formula Student Alpe Adria`
    : `📭 No leads this cycle · FSAA Intelligence`;
  await transporter.sendMail({ from:`"FSAA Partnerships" <${CONFIG.gmailUser}>`, to:CONFIG.emailTo, subject, html });
  console.log(`✅ Email sent: "${subject}"`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏎  FSAA Partnership Intelligence — starting scan…');
  if (!CONFIG.anthropicKey) { console.error('❌ Missing ANTHROPIC_API_KEY'); process.exit(1); }
  if (!CONFIG.gmailUser)    { console.error('❌ Missing GMAIL_USER');         process.exit(1); }
  if (!CONFIG.gmailPass)    { console.error('❌ Missing GMAIL_APP_PASSWORD'); process.exit(1); }
  console.log('📡 Fetching feeds…');
  const items = await fetchAllFeeds();
  console.log(`   Found ${items.length} items`);
  console.log('🧠 Analysing with Claude…');
  const leads = await analyzeWithClaude(items);
  console.log(`   Found ${leads.length} unique leads`);
  console.log('📧 Sending…');
  const html = buildEmail(leads, items.length);
  await sendEmail(html, leads.length);
  console.log('✅ Done.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
