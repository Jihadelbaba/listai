/* ═══════════════════════════════════════
   listAI — Application Logic
   All features, auth, AI generation, history
════════════════════════════════════════ */

// ── Anthropic API key ──
// IMPORTANT: Rotate this key at console.anthropic.com — it was shared publicly
const MODEL = 'claude-sonnet-4-20250514';
function getApiKey() { return localStorage.getItem('listai_apikey') || ''; }

// ── Stripe Payment Links ──
const STRIPE_LINKS = {
  starter: 'https://buy.stripe.com/6oUaEYewEbkk0XVc614sE04',
  agent:   'https://buy.stripe.com/7sY3cw88g4VWeOL7PL4sE05',
  pro:     'https://buy.stripe.com/bJe3cw2NW3RS3631rn4sE06',
  team:    'https://buy.stripe.com/5kQ00k2NW3RS6if4Dz4sE07'
};

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
let currentUser  = null;
let platforms    = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn'];
let selectedTone = 'Luxury & Aspirational';
let lastResults  = null;
let selectedPlan = 'agent';

const PLANS = {
  starter: { name: 'Starter',  price: 4,  quota: 5,   label: '$4/mo · 5 listings/month' },
  agent:   { name: 'Agent',    price: 14, quota: 20,  label: '$14/mo · 20 listings/month' },
  pro:     { name: 'Pro',      price: 29, quota: 60,  label: '$29/mo · 60 listings/month' },
  team:    { name: 'Team',     price: 59, quota: 99999, label: '$59/mo · Unlimited listings' }
};

// ─────────────────────────────────────────
//  STORAGE HELPERS  (localStorage as DB)
// ─────────────────────────────────────────
function saveUsers(users)   { localStorage.setItem('listai_users', JSON.stringify(users)); }
function getUsers()         { return JSON.parse(localStorage.getItem('listai_users') || '{}'); }
function saveSession(user)  { localStorage.setItem('listai_session', JSON.stringify(user)); currentUser = user; }
function clearSession()     { localStorage.removeItem('listai_session'); currentUser = null; }
function getSession()       { const s = localStorage.getItem('listai_session'); return s ? JSON.parse(s) : null; }

function getUserData(email) {
  const users = getUsers();
  return users[email] || null;
}
function updateUserData(email, data) {
  const users = getUsers();
  users[email] = { ...users[email], ...data };
  saveUsers(users);
  if (currentUser && currentUser.email === email) {
    currentUser = { ...currentUser, ...data };
    saveSession(currentUser);
  }
}

function getHistory(email) {
  const key = `listai_history_${email}`;
  return JSON.parse(localStorage.getItem(key) || '[]');
}
function saveHistory(email, history) {
  const key = `listai_history_${email}`;
  localStorage.setItem(key, JSON.stringify(history));
}
function addToHistory(email, entry) {
  const plan = PLANS[getUserData(email)?.plan || 'agent'];
  const history = getHistory(email);
  // Enforce history limit: Starter = 30 days only (we store date), others unlimited
  history.unshift({ ...entry, id: Date.now(), date: new Date().toISOString() });
  saveHistory(email, history.slice(0, 500)); // keep max 500 entries
}

// ─────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ─────────────────────────────────────────
//  PAGE NAVIGATION
// ─────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) {
    pg.classList.add('active');
    window.scrollTo(0, 0);
  }
  // Update nav visibility
  const appPages = ['app', 'dashboard', 'settings'];
  const mainNav  = document.getElementById('main-nav');
  if (mainNav) mainNav.style.display = appPages.includes(name) ? 'none' : 'flex';

  if (name === 'app')       initApp();
  if (name === 'dashboard') initDashboard();
  if (name === 'settings')  initSettings();
}

function navScroll(id) {
  showPage('landing');
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

function toggleMobileMenu() {
  const m = document.getElementById('mobile-menu');
  m.classList.toggle('open');
}

// ─────────────────────────────────────────
//  AUTH — SIGNUP
// ─────────────────────────────────────────
function handleSignup() {
  const name  = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim().toLowerCase();
  const pass  = document.getElementById('su-pass').value;
  const err   = document.getElementById('signup-error');

  err.style.display = 'none';

  if (!name || !email || !pass) { showAuthError('signup', 'Please fill in all fields.'); return; }
  if (!email.includes('@'))     { showAuthError('signup', 'Please enter a valid email.'); return; }
  if (pass.length < 8)          { showAuthError('signup', 'Password must be at least 8 characters.'); return; }

  const users = getUsers();
  if (users[email])             { showAuthError('signup', 'An account with this email already exists.'); return; }

  const userData = {
    name, email,
    password: btoa(pass), // basic obfuscation — in production use a real backend
    plan: selectedPlan,
    usedThisMonth: 0,
    monthReset: new Date().toISOString(),
    brandVoice: '',
    createdAt: new Date().toISOString()
  };

  users[email] = userData;
  saveUsers(users);
  saveSession(userData);

  showToast('Account created! Welcome to listAI.');
  showPage('app');
}

function showAuthError(page, msg) {
  const el = document.getElementById(page + '-error');
  el.textContent = msg;
  el.style.display = 'block';
}

// ─────────────────────────────────────────
//  AUTH — LOGIN
// ─────────────────────────────────────────
function handleLogin() {
  const email = document.getElementById('li-email').value.trim().toLowerCase();
  const pass  = document.getElementById('li-pass').value;

  const user = getUserData(email);
  if (!user || user.password !== btoa(pass)) {
    showAuthError('login', 'Email or password is incorrect.');
    return;
  }
  saveSession(user);
  showToast('Welcome back, ' + user.name.split(' ')[0] + '!');
  showPage('app');
}

function handleLogout() {
  clearSession();
  showToast('Signed out.');
  showPage('landing');
}

// ─────────────────────────────────────────
//  PLAN SELECTION & STRIPE
// ─────────────────────────────────────────
function goStripe(plan) {
  // Open Stripe checkout for the selected plan
  window.open(STRIPE_LINKS[plan], '_blank');
}

function selectPlan(plan) {
  selectedPlan = plan;
  showPage('signup');
  const box = document.getElementById('signup-plan-info');
  box.textContent = `Selected: ${PLANS[plan].name} — ${PLANS[plan].label}`;
  box.style.display = 'block';
  document.querySelectorAll('.plan-option').forEach(o => {
    o.classList.toggle('active', o.dataset.plan === plan);
  });
}

function choosePlan(plan) {
  selectedPlan = plan;
  document.querySelectorAll('.plan-option').forEach(o => {
    o.classList.toggle('active', o.dataset.plan === plan);
  });
}

// ─────────────────────────────────────────
//  USER MENU
// ─────────────────────────────────────────
function toggleUserMenu() {
  document.getElementById('user-dropdown').classList.toggle('open');
}
function toggleUserMenu2() {
  document.getElementById('user-dropdown2').classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu')) {
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('open'));
  }
});

// ─────────────────────────────────────────
//  APP INIT — check auth, set plan UI
// ─────────────────────────────────────────
function initApp() {
  currentUser = getSession();
  if (!currentUser) { showPage('login'); return; }

  checkMonthReset();

  const plan    = PLANS[currentUser.plan] || PLANS.agent;
  const quota   = plan.quota === 99999 ? '∞' : plan.quota;
  const used    = currentUser.usedThisMonth || 0;
  const remaining = plan.quota === 99999 ? '∞' : Math.max(0, plan.quota - used);

  // Update usage pill
  document.getElementById('usage-pill').textContent =
    `${used} / ${quota} listings`;

  // Update avatars & user name
  const initials = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('user-avatar').textContent  = initials;
  document.getElementById('user-name-display').textContent  = currentUser.name;
  document.getElementById('user-plan-display').textContent  = plan.name + ' plan';

  // Brand voice section (Pro+)
  const bvSection = document.getElementById('brand-voice-section');
  if (['pro', 'team'].includes(currentUser.plan)) {
    bvSection.style.display = 'block';
    if (currentUser.brandVoice) {
      document.getElementById('f-brand-voice').value = currentUser.brandVoice;
    }
  }

  // Email newsletter + bio section (Pro+)
  const extraSection = document.getElementById('email-newsletter-section');
  if (['pro', 'team'].includes(currentUser.plan)) {
    extraSection.style.display = 'block';
  }

  // CSV export (Pro+)
  const csvBtn = document.getElementById('export-csv-btn');
  if (['pro', 'team'].includes(currentUser.plan)) {
    csvBtn.style.display = 'inline-block';
  }

  // Reset app view
  setStep(1);
  showAppView('form');
}

function checkMonthReset() {
  if (!currentUser) return;
  const lastReset = new Date(currentUser.monthReset || currentUser.createdAt);
  const now       = new Date();
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    updateUserData(currentUser.email, { usedThisMonth: 0, monthReset: now.toISOString() });
  }
}

// ─────────────────────────────────────────
//  CHIP TOGGLE (platforms & tones)
// ─────────────────────────────────────────
document.querySelectorAll('#plat-chips .chip').forEach(c => {
  c.addEventListener('click', () => {
    c.classList.toggle('on');
    platforms = [...document.querySelectorAll('#plat-chips .chip.on')].map(x => x.dataset.v);
  });
});

document.querySelectorAll('#tone-chips .chip').forEach(c => {
  c.addEventListener('click', () => {
    document.querySelectorAll('#tone-chips .chip').forEach(x => x.classList.remove('on'));
    c.classList.add('on');
    selectedTone = c.dataset.v;
  });
});

// ─────────────────────────────────────────
//  STEP INDICATOR
// ─────────────────────────────────────────
function setStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById('ps' + i);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < n)      el.classList.add('done');
    else if (i === n) el.classList.add('active');
  });
}

function showAppView(view) {
  document.getElementById('app-form').style.display    = view === 'form'    ? 'block' : 'none';
  document.getElementById('app-loading').style.display = view === 'loading' ? 'block' : 'none';
  document.getElementById('app-results').style.display = view === 'results' ? 'block' : 'none';
}

function resetApp() {
  lastResults = null;
  setStep(1);
  showAppView('form');
}

// ─────────────────────────────────────────
//  LOADING STEP ANIMATION
// ─────────────────────────────────────────
function animateLoadSteps() {
  ['ls1','ls2','ls3','ls4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('done');
  });
  let i = 0;
  const steps = ['ls1','ls2','ls3','ls4'];
  const iv = setInterval(() => {
    if (i < steps.length) {
      const el = document.getElementById(steps[i]);
      if (el) el.classList.add('done');
      i++;
    } else {
      clearInterval(iv);
    }
  }, 900);
}

// ─────────────────────────────────────────
//  QUOTA CHECK
// ─────────────────────────────────────────
function hasQuota() {
  if (!currentUser) return false;
  const plan = PLANS[currentUser.plan] || PLANS.agent;
  if (plan.quota === 99999) return true;
  return (currentUser.usedThisMonth || 0) < plan.quota;
}

function incrementUsage() {
  const used = (currentUser.usedThisMonth || 0) + 1;
  updateUserData(currentUser.email, { usedThisMonth: used });
  const plan  = PLANS[currentUser.plan] || PLANS.agent;
  const quota = plan.quota === 99999 ? '∞' : plan.quota;
  document.getElementById('usage-pill').textContent = `${used} / ${quota} listings`;
}

// ─────────────────────────────────────────
//  AI GENERATION
// ─────────────────────────────────────────
async function generate() {
  if (!currentUser) { showPage('login'); return; }

  if (!hasQuota()) {
    document.getElementById('gen-error').textContent =
      'You have reached your monthly listing limit. Please upgrade your plan to continue.';
    document.getElementById('gen-error').style.display = 'block';
    return;
  }

  const type    = document.getElementById('f-type').value;
  const listing = document.getElementById('f-listing').value;
  const beds    = document.getElementById('f-beds').value    || 'N/A';
  const baths   = document.getElementById('f-baths').value   || 'N/A';
  const size    = document.getElementById('f-size').value    || 'N/A';
  const price   = document.getElementById('f-price').value;
  const loc     = document.getElementById('f-loc').value;
  const feats   = document.getElementById('f-feats').value;
  const agent   = document.getElementById('f-agent').value   || currentUser.name || 'your agent';

  const errEl = document.getElementById('gen-error');
  errEl.style.display = 'none';

  if (!loc || !price) {
    errEl.textContent = 'Please enter at least the location and price.';
    errEl.style.display = 'block';
    return;
  }
  if (platforms.length === 0) {
    errEl.textContent = 'Please select at least one platform.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('gen-btn');
  btn.disabled = true;
  setStep(2);
  showAppView('loading');
  animateLoadSteps();

  // Plan-based extras
  const isPro  = ['pro','team'].includes(currentUser.plan);
  const isAgent = ['agent','pro','team'].includes(currentUser.plan);
  const brandVoice = isPro && currentUser.brandVoice
    ? `\nAgent brand voice: ${currentUser.brandVoice}`
    : '';
  const wantEmail  = isPro && document.getElementById('toggle-email')?.checked;
  const wantBio    = isPro && document.getElementById('toggle-bio')?.checked;

  const platList = platforms.join(', ');

  const prompt = `You are listAI, the world's best real estate social media AI. Generate a complete content package.

Property:
- Type: ${type} | Listing: ${listing}
- Bedrooms: ${beds} | Bathrooms: ${baths} | Size: ${size} sq ft
- Price: ${price} | Location: ${loc}
- Features: ${feats}
- Tone: ${selectedTone}
- Agent name: ${agent}
- Platforms: ${platList}${brandVoice}

Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation before or after.

Required JSON structure:
{
  "platforms": {
    "PLATFORM_NAME": {
      "post1": "full compelling post text",
      "post1_caption": "one punchy hook line",
      "post2": "different angle post text",
      "post2_caption": "hook for post 2",
      "post3": "third perspective post text",
      "post3_caption": "hook for post 3",
      "hashtags": "10-15 relevant hashtags as single string"
    }
  },
  ${isAgent ? `"video_script": {
    "hook": "First 3 seconds — stop the scroll line",
    "intro": "15-second intro establishing property and vibe",
    "walkthrough": "40-second spoken walkthrough hitting key rooms emotionally",
    "highlight": "15-second standout feature moment",
    "cta": "10-second closing call to action mentioning agent name",
    "shooting_tips": "3 specific filming tips for this property",
    "total_duration": "~90 seconds"
  },
  "action_plan": {
    "title": "Neighbourhood Go-Live Plan for ${loc}",
    "step1_title": "concise action title",
    "step1_desc": "specific action targeting local community for ${loc}",
    "step1_badge": "Day 1",
    "step2_title": "concise action title",
    "step2_desc": "specific action",
    "step2_badge": "Day 1-2",
    "step3_title": "concise action title",
    "step3_desc": "specific action",
    "step3_badge": "Day 2-3",
    "step4_title": "concise action title",
    "step4_desc": "specific action",
    "step4_badge": "Week 1"
  }` : '"video_script": null, "action_plan": null'}
  ${wantEmail ? `,"email": {
    "subject": "compelling email subject line",
    "body": "full professional email newsletter about this property, 3-4 paragraphs, ready to send"
  }` : ''}
  ${wantBio ? `,"agent_bio": "2-3 sentence professional bio for ${agent} as a real estate specialist"` : ''}
}

CRITICAL RULES:
- Only include platform keys for: ${platList}
- Instagram: visual, emotional, 10-15 hashtags
- TikTok: punchy, trend-aware, short hooks, relevant hashtags  
- LinkedIn: professional, investment-focused, no hashtags
- Facebook: warm, community-friendly, few hashtags
- WhatsApp: direct, personal, very short
- Twitter/X: concise, punchy, max 280 chars per post, 2-3 hashtags
- Each platform must have genuinely DIFFERENT posts — different angles, hooks, perspectives
- Video script lines must be spoken naturally on camera
- Action plan must reference specific strategies for ${loc} community`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) throw new Error('API error: ' + response.status);

    const data = await response.json();
    const raw  = data.content.map(i => i.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    lastResults = JSON.parse(clean);

    // Increment usage
    incrementUsage();

    // Save to history
    const historyEntry = {
      type, listing, beds, baths, size, price, location: loc, features: feats,
      platforms: platList, tone: selectedTone, results: lastResults
    };
    addToHistory(currentUser.email, historyEntry);

    // Render results
    document.getElementById('res-sub').textContent =
      `${type} · ${listing} · ${loc} · ${price}`;
    renderResults(lastResults, isAgent, wantEmail, wantBio);
    setStep(3);
    showAppView('results');

  } catch (err) {
    console.error('Generation error:', err);
    errEl.textContent = 'Something went wrong. Please check your property details and try again.';
    errEl.style.display = 'block';
    setStep(1);
    showAppView('form');
  }

  btn.disabled = false;
}

// ─────────────────────────────────────────
//  RENDER RESULTS
// ─────────────────────────────────────────
const PLAT_COLORS = {
  'Instagram': '#E1306C',
  'TikTok':    '#010101',
  'Facebook':  '#1877F2',
  'LinkedIn':  '#0A66C2',
  'WhatsApp':  '#25D366',
  'Twitter/X': '#000000'
};

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function renderResults(results, isAgent, wantEmail, wantBio) {
  const tabsEl  = document.getElementById('out-tabs');
  const cardsEl = document.getElementById('out-cards');
  tabsEl.innerHTML  = '';
  cardsEl.innerHTML = '';

  const allTabs = [
    ...platforms.map(p => ({ id: 'p' + p.replace(/\W/g, ''), label: p, type: 'plat', key: p })),
    ...(isAgent ? [{ id: 'script', label: 'Video script', type: 'script' }] : []),
    ...(isAgent ? [{ id: 'action', label: 'Action plan', type: 'action' }] : []),
    ...(wantEmail && results.email  ? [{ id: 'email', label: 'Email newsletter', type: 'email' }] : []),
    ...(wantBio   && results.agent_bio ? [{ id: 'bio', label: 'Agent bio', type: 'bio' }] : [])
  ];

  // Tabs
  allTabs.forEach((t, i) => {
    const tb = document.createElement('button');
    tb.className = 'out-tab' + (i === 0 ? ' active' : '');
    tb.id = 'tab-' + t.id;
    tb.innerHTML = `<span class="tab-dot"></span>${t.label}`;
    tb.addEventListener('click', () => {
      allTabs.forEach(x => {
        const tb2 = document.getElementById('tab-' + x.id);
        const cd  = document.getElementById('card-' + x.id);
        if (tb2) tb2.classList.toggle('active', x.id === t.id);
        if (cd)  cd.classList.toggle('active', x.id === t.id);
      });
    });
    tabsEl.appendChild(tb);
  });

  // Platform cards
  platforms.forEach((p, i) => {
    const d   = results.platforms && results.platforms[p];
    if (!d) return;
    const id  = 'p' + p.replace(/\W/g, '');
    const col = PLAT_COLORS[p] || '#888';
    const card = document.createElement('div');
    card.className = 'out-card' + (i === 0 ? ' active' : '');
    card.id = 'card-' + id;
    card.innerHTML = `
      <div class="card-head">
        <div class="card-head-left">
          <div class="plat-badge" style="background:${col}">${p.substring(0,2).toUpperCase()}</div>
          <div>
            <div class="card-head-title">${p}</div>
            <div class="card-head-sub">3 posts · captions · hashtags</div>
          </div>
        </div>
        <button class="copy-all-btn" data-id="${id}">Copy all</button>
      </div>
      <div class="posts-grid">
        ${[1,2,3].map(n => `
          <div class="post-cell">
            <div class="post-label">Post ${n}</div>
            <div class="post-body">${esc(d['post'+n])}</div>
            <div class="post-caption-line">${esc(d['post'+n+'_caption'])}</div>
            ${n === 1 ? `<div class="post-tags-line">${esc(d.hashtags)}</div>` : ''}
          </div>`).join('')}
      </div>
      <div class="card-foot">
        ${[1,2,3].map(n => `<button class="act-btn" data-id="${id}" data-n="${n}">Copy post ${n}</button>`).join('')}
      </div>`;
    cardsEl.appendChild(card);
  });

  // Video script card
  if (isAgent && results.video_script) {
    const sc = results.video_script;
    const scCard = document.createElement('div');
    scCard.className = 'out-card';
    scCard.id = 'card-script';
    const scriptSections = [
      ['hook',       'Hook (0–3s)',           'Stop the scroll instantly'],
      ['intro',      'Intro (3–18s)',          'Set the scene and vibe'],
      ['walkthrough','Walkthrough (18–58s)',   'The full spoken tour'],
      ['highlight',  'Standout feature (58–73s)', 'The wow moment'],
      ['cta',        'Call to action (73–83s)', 'Close with confidence']
    ];
    scCard.innerHTML = `
      <div class="card-head">
        <div class="card-head-left">
          <div class="plat-badge" style="background:#7c3aed">VS</div>
          <div>
            <div class="card-head-title">Video script</div>
            <div class="card-head-sub">${esc(sc.total_duration || '~90 seconds')} · ready to film</div>
          </div>
        </div>
        <button class="copy-all-btn" id="copy-script-btn">Copy script</button>
      </div>
      <div class="script-body">
        ${scriptSections.map(([k, tag, note]) => `
          <div class="script-seg">
            <div class="seg-tag">${tag}</div>
            <div class="seg-text">${esc(sc[k])}</div>
            <div class="seg-note">${note}</div>
          </div>`).join('')}
        <div class="tips-box">
          <div class="seg-tag">Filming tips</div>
          <div class="seg-text">${esc(sc.shooting_tips)}</div>
        </div>
      </div>`;
    cardsEl.appendChild(scCard);
  }

  // Action plan card
  if (isAgent && results.action_plan) {
    const ap = results.action_plan;
    const apCard = document.createElement('div');
    apCard.className = 'out-card';
    apCard.id = 'card-action';
    apCard.innerHTML = `
      <div class="card-head">
        <div class="card-head-left">
          <div class="plat-badge" style="background:#059669">AP</div>
          <div>
            <div class="card-head-title">Neighbourhood action plan</div>
            <div class="card-head-sub">${esc(ap.title || 'Go-live strategy')}</div>
          </div>
        </div>
        <button class="copy-all-btn" id="copy-action-btn">Copy plan</button>
      </div>
      <div class="action-body">
        <div class="action-grid">
          ${[1,2,3,4].map(n => `
            <div class="action-item">
              <div class="action-num">0${n}</div>
              <div class="action-title">${esc(ap['step'+n+'_title'])}</div>
              <div class="action-desc">${esc(ap['step'+n+'_desc'])}</div>
              <div class="action-badge">${esc(ap['step'+n+'_badge'])}</div>
            </div>`).join('')}
        </div>
      </div>`;
    cardsEl.appendChild(apCard);
  }

  // Email card
  if (wantEmail && results.email) {
    const em = results.email;
    const emCard = document.createElement('div');
    emCard.className = 'out-card';
    emCard.id = 'card-email';
    emCard.innerHTML = `
      <div class="card-head">
        <div class="card-head-left">
          <div class="plat-badge" style="background:#D97706">EM</div>
          <div>
            <div class="card-head-title">Email newsletter draft</div>
            <div class="card-head-sub">Ready to send to your contact list</div>
          </div>
        </div>
        <button class="copy-all-btn" id="copy-email-btn">Copy email</button>
      </div>
      <div class="email-body">
        <div class="email-subject">Subject line</div>
        <div class="email-subject-text">${esc(em.subject)}</div>
        <div class="email-content">${esc(em.body)}</div>
      </div>`;
    cardsEl.appendChild(emCard);
  }

  // Bio card
  if (wantBio && results.agent_bio) {
    const bioCard = document.createElement('div');
    bioCard.className = 'out-card';
    bioCard.id = 'card-bio';
    bioCard.innerHTML = `
      <div class="card-head">
        <div class="card-head-left">
          <div class="plat-badge" style="background:#0891B2">AB</div>
          <div>
            <div class="card-head-title">Agent bio snippet</div>
            <div class="card-head-sub">Append to posts and emails</div>
          </div>
        </div>
        <button class="copy-all-btn" id="copy-bio-btn">Copy bio</button>
      </div>
      <div class="bio-body">
        <div class="bio-text">${esc(results.agent_bio)}</div>
      </div>`;
    cardsEl.appendChild(bioCard);
  }

  // Attach all copy events
  attachCopyEvents();
}

// ─────────────────────────────────────────
//  COPY EVENTS
// ─────────────────────────────────────────
function attachCopyEvents() {
  // Copy all platform posts
  document.querySelectorAll('.copy-all-btn[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = document.getElementById('card-' + btn.dataset.id);
      const text = [...card.querySelectorAll('.post-body,.post-caption-line,.post-tags-line')]
        .map(el => el.innerText).join('\n\n');
      copyText(text, btn, 'Copy all', 'Copied!');
    });
  });

  // Copy individual posts
  document.querySelectorAll('.act-btn[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = document.getElementById('card-' + btn.dataset.id);
      const cells = card.querySelectorAll('.post-cell');
      const n = parseInt(btn.dataset.n) - 1;
      const text = cells[n] ? cells[n].innerText : '';
      copyText(text, btn, 'Copy post ' + (n + 1), 'Copied!');
    });
  });

  // Script copy
  const scriptCopyBtn = document.getElementById('copy-script-btn');
  if (scriptCopyBtn) {
    scriptCopyBtn.addEventListener('click', () => {
      const card = document.getElementById('card-script');
      let out = '';
      card.querySelectorAll('.script-seg,.tips-box').forEach(s => {
        const tag = s.querySelector('.seg-tag');
        const txt = s.querySelector('.seg-text');
        if (tag && txt) out += tag.innerText + '\n' + txt.innerText + '\n\n';
      });
      copyText(out, scriptCopyBtn, 'Copy script', 'Copied!');
    });
  }

  // Action plan copy
  const actionCopyBtn = document.getElementById('copy-action-btn');
  if (actionCopyBtn) {
    actionCopyBtn.addEventListener('click', () => {
      const card = document.getElementById('card-action');
      const text = card.innerText;
      copyText(text, actionCopyBtn, 'Copy plan', 'Copied!');
    });
  }

  // Email copy
  const emailCopyBtn = document.getElementById('copy-email-btn');
  if (emailCopyBtn) {
    emailCopyBtn.addEventListener('click', () => {
      const card = document.getElementById('card-email');
      const text = card.querySelectorAll('.email-subject-text,.email-content');
      const out = [...text].map(el => el.innerText).join('\n\n');
      copyText(out, emailCopyBtn, 'Copy email', 'Copied!');
    });
  }

  // Bio copy
  const bioCopyBtn = document.getElementById('copy-bio-btn');
  if (bioCopyBtn) {
    bioCopyBtn.addEventListener('click', () => {
      const text = document.querySelector('.bio-text')?.innerText || '';
      copyText(text, bioCopyBtn, 'Copy bio', 'Copied!');
    });
  }
}

function copyText(text, btn, original, successMsg) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = successMsg;
    showToast('Copied to clipboard!');
    setTimeout(() => btn.textContent = original, 1800);
  }).catch(() => {
    showToast('Copy failed — please select and copy manually.');
  });
}

// ─────────────────────────────────────────
//  CSV EXPORT (Pro+)
// ─────────────────────────────────────────
function exportCSV() {
  if (!lastResults) return;
  const rows = [['Platform', 'Post', 'Caption', 'Hashtags']];
  Object.entries(lastResults.platforms || {}).forEach(([plat, d]) => {
    [1,2,3].forEach(n => {
      rows.push([
        plat,
        (d['post'+n] || '').replace(/\n/g,' '),
        d['post'+n+'_caption'] || '',
        n === 1 ? (d.hashtags || '') : ''
      ]);
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'listai-posts.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported!');
}

// ─────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────
function initDashboard() {
  currentUser = getSession();
  if (!currentUser) { showPage('login'); return; }

  const plan      = PLANS[currentUser.plan] || PLANS.agent;
  const used      = currentUser.usedThisMonth || 0;
  const quota     = plan.quota === 99999 ? '∞' : plan.quota;
  const remaining = plan.quota === 99999 ? '∞' : Math.max(0, plan.quota - used);
  const pct       = plan.quota === 99999 ? 0 : Math.min(100, (used / plan.quota) * 100);

  document.getElementById('dash-greeting').textContent =
    `Welcome back, ${currentUser.name.split(' ')[0]}!`;
  document.getElementById('stat-used').textContent      = used;
  document.getElementById('stat-remaining').textContent = remaining;
  document.getElementById('stat-plan').textContent      = plan.name;
  document.getElementById('usage-bar-text').textContent = `${used} / ${quota}`;
  document.getElementById('usage-fill').style.width     = pct + '%';

  // Avatars
  const initials = currentUser.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  ['user-avatar2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
  const nd = document.getElementById('user-name-display2');
  if (nd) nd.textContent = currentUser.name;

  // History
  renderHistory();
}

function renderHistory() {
  const listEl = document.getElementById('history-list');
  const history = getHistory(currentUser.email);

  // For Starter plan: only show last 30 days
  let filtered = history;
  if (currentUser.plan === 'starter') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    filtered = history.filter(h => new Date(h.date) > cutoff);
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="history-empty">No listings yet. <span onclick="showPage('app')">Generate your first →</span></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(h => {
    const date = new Date(h.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    return `
      <div class="history-item">
        <div class="history-info">
          <strong>${h.type} · ${h.listing} · ${h.location}</strong>
          <span>${h.price} · ${h.platforms}</span>
        </div>
        <div class="history-date">${date}</div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────
function initSettings() {
  currentUser = getSession();
  if (!currentUser) { showPage('login'); return; }

  document.getElementById('set-name').value  = currentUser.name  || '';
  document.getElementById('set-email').value = currentUser.email || '';

  const plan = PLANS[currentUser.plan] || PLANS.agent;
  document.getElementById('plan-name-display').textContent = plan.name + ' plan';
  document.getElementById('plan-desc-display').textContent = plan.label;

  // Brand voice (Pro+)
  const bvSection = document.getElementById('brand-voice-settings');
  if (['pro','team'].includes(currentUser.plan)) {
    bvSection.style.display = 'block';
    document.getElementById('set-brand-voice').value = currentUser.brandVoice || '';
  } else {
    bvSection.style.display = 'none';
  }
}

function saveProfile() {
  const name  = document.getElementById('set-name').value.trim();
  const email = document.getElementById('set-email').value.trim().toLowerCase();
  if (!name || !email) { showToast('Please fill in your name and email.'); return; }
  updateUserData(currentUser.email, { name, email });
  showToast('Profile saved!');
}

function saveBrandVoice() {
  const bv = document.getElementById('set-brand-voice').value.trim();
  updateUserData(currentUser.email, { brandVoice: bv });
  showToast('Brand voice saved!');
}

function deleteAccount() {
  if (!confirm('Are you sure? This will permanently delete your account and all listing history.')) return;
  const users = getUsers();
  delete users[currentUser.email];
  saveUsers(users);
  localStorage.removeItem(`listai_history_${currentUser.email}`);
  clearSession();
  showToast('Account deleted.');
  showPage('landing');
}


// ─────────────────────────────────────────
//  ADMIN SETUP — API key management
// ─────────────────────────────────────────
function saveApiKey() {
  const key = document.getElementById('setup-key').value.trim();
  const status = document.getElementById('setup-status');
  if (!key.startsWith('sk-ant-')) {
    status.textContent = 'That does not look like a valid Anthropic key. It should start with sk-ant-';
    status.style.color = '#C0392B';
    status.style.display = 'block';
    return;
  }
  localStorage.setItem('listai_apikey', key);
  status.textContent = 'API key saved successfully! Your site is ready to generate listings.';
  status.style.color = '#2E7D52';
  status.style.display = 'block';
  document.getElementById('key-status').textContent = 'Key saved and active';
  document.getElementById('setup-key').value = '';
  showToast('API key saved! listAI is ready.');
}

function clearApiKey() {
  localStorage.removeItem('listai_apikey');
  document.getElementById('key-status').textContent = 'No key saved';
  showToast('API key cleared.');
}

function initSetup() {
  const key = getApiKey();
  const el = document.getElementById('key-status');
  if (el) el.textContent = key ? 'Key saved and active ✓' : 'No key saved yet';
}

// ─────────────────────────────────────────
//  BOOT — auto-login if session exists
// ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const session = getSession();
  if (session) {
    currentUser = session;
  }
  // Check if URL has #setup hash — show admin setup page
  if (window.location.hash === '#setup') {
    showPage('setup');
    initSetup();
  } else {
    showPage('landing');
  }
});

window.addEventListener('hashchange', () => {
  if (window.location.hash === '#setup') {
    showPage('setup');
    initSetup();
  }
});
