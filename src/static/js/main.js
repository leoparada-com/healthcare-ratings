// app/static/js/main.js
// =========================================================
// Calificaciones Salud (1–7) — Versión 100% front-end (sin backend)
// - Routing con History API (?page=inicio | ?page=ranking)
// - Datos simulados (promedios/votos de base)
// - Votación local (actualiza tarjetas y ranking)
// - Bloqueo de ranking hasta enviar + Modal de espera
// - Gráficos con Chart.js (histograma + torta)
// =========================================================
(() => {
  "use strict";

  // ---------------------------
  // Utilidades DOM / formato
  // ---------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt2 = (n) => (typeof n === "number" && !Number.isNaN(n)) ? n.toFixed(2) : "";
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function toast(msg, ms = 2200) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = `
      position:fixed;left:50%;top:24px;transform:translateX(-50%);
      background:#0f172a;color:#fff;padding:10px 14px;border-radius:10px;
      z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.2);font-weight:700`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // 1 -> 0%, 7 -> 100%
  const avgToPct = (avg) => avg == null ? 0 : clamp01((avg - 1) / 6) * 100;

  // ---------------------------
  // Fallback avatar (si no hay foto)
  // ---------------------------
  const FALLBACK_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="21" fill="#e5e7eb" stroke="#cbd5e1" stroke-width="2"/>
      <circle cx="22" cy="16" r="7" fill="#cbd5e1"/>
      <rect x="10" y="26" width="24" height="10" rx="5" fill="#cbd5e1"/>
    </svg>`
  );

  // ---------------------------
  // Datos simulados
  // ---------------------------
  const ROLES = ["Médico/a","Paramédico/a","TENS","Enfermero/a"];
  const HOSPITALES = [
    "Hospital General Central","Hospital Universitario Latinoamericano","Clínica Metropolitana",
    "Centro Médico Integral","Instituto de Especialidades Médicas","Clínica del Norte",
    "Red de Salud Andina","Hospital San Martín","Centro de Salud Familiar","Clínica Los Pinos",
    "Hospital del Sur","Policlínico La Esperanza",
  ];
  const SEED = {
    "Primaria": [
      "Ana Pérez González","Carlos Rivas Soto","Daniela Soto Morales",
      "Felipe Muñoz Vargas","Gabriela Vidal Fuentes","Héctor Pardo León",
      "Isabel Núñez Díaz","Jorge Araya Silva","Karla Fuentes Torres",
    ],
    "Secundaria": [
      "María López Ramírez","Nicolás Reyes Castro","Olga Carrasco Pérez",
      "Pedro Molina Ruiz","Quintín Salas Herrera","Rocío Campos Méndez",
      "Sebastián Vega Rojas","Tamara Ruiz Sandoval","Úrsula Pinto Bravo",
    ],
    "Terciaria": [
      "Walter Gutiérrez Paredes","Ximena Bravo Salinas","Yolanda Pizarro Tapia",
      "Zoe Navarro Cárdenas","Alberto Cifuentes Cornejo","Bárbara Ortiz Palma",
      "Cecilia Álvarez Peña","Diego Figueroa Lagos","Elena Contreras Soto",
    ]
  };

  function buildPeople(){
    const out = [];
    let pid = 1;
    for (const level of ["Primaria","Secundaria","Terciaria"]){
      for (const name of SEED[level]){
        const idx = pid - 1;
        out.push({
          id: pid,
          name,
          level,
          role: ROLES[idx % ROLES.length],
          org:  HOSPITALES[idx % HOSPITALES.length],
          photo_url: `src/static/img/faces/${pid}.png`, // ruta estática solicitada
          avg: null,
          votes: 0
        });
        pid++;
      }
    }
    return out;
  }

  // Asigna votos/promedios iniciales (70% con datos)
  function seedRatings(people){
    for (const p of people){
      if (Math.random() < 0.7){
        const votes = Math.floor(Math.random()*120)+5; // 5..124
        const mu = 4.6 + (Math.random()-0.5)*1.6;      // media ~4.6
        p.votes = votes;
        p.avg   = Math.min(7, Math.max(1, +mu.toFixed(2)));
      } else {
        p.votes = 0;
        p.avg   = null;
      }
    }
    return people;
  }

  // ---------------------------
  // Estado global
  // ---------------------------
  let PEOPLE = seedRatings(buildPeople());
  const SELECTED = new Map();        // person_id -> score (selecciones actuales)
  let LAST_BATCH_VOTED = new Set();  // ids resaltados en ranking
  let hasSubmitted = false;          // bloquea ranking hasta primer envío

  // ---------------------------
  // Tarjetas (Inicio)
  // ---------------------------
  function cardTemplate(p){
    const pct = avgToPct(p.avg);
    const noData = (p.votes || 0) === 0;
    const levelClass =
      p.level === "Primaria"  ? "level-primaria" :
      p.level === "Secundaria"? "level-secundaria" : "level-terciaria";

    return `
      <article class="card ${levelClass} ${noData?'no-data':''}" data-person-id="${p.id}">
        <div class="card-top">
          <img class="avatar-img" src="${p.photo_url}" alt="Foto de ${p.name}"
               onerror="this.onerror=null;this.src='${FALLBACK_SVG}';">
          <div class="who">
            <div class="who-head"><strong class="who-name">${p.name}</strong></div>
            <span class="who-chip">Atención ${p.level}</span>
            <p class="who-meta" title="${p.role} · ${p.org}"><strong>${p.role}</strong> · ${p.org}</p>
          </div>
        </div>

        <div class="rate" role="group" aria-label="Seleccionar nota de 1 a 7">
          ${Array.from({length:7},(_,i)=>`<button class="btn rate-btn" type="button" data-score="${i+1}" aria-pressed="false">${i+1}</button>`).join('')}
        </div>

        <div class="calif">
          <div class="calif-header">
            <span class="calif-title">Calificación</span>
            <div class="kpi-votes" title="Total de votos">
              <i class="fa-regular fa-user" aria-hidden="true"></i>
              <span class="votes">${p.votes||0}</span> votos
            </div>
          </div>

          <div class="calif-body-h">
            <div class="kpi-value">
              <span class="avg ${noData?'is-empty':''}">${noData ? "" : fmt2(p.avg)}</span>
            </div>
            <div class="h-meter" role="img" aria-label="Promedio sobre 7">
              <div class="h-track">
                <div class="h-fill"   style="width:${noData?0:pct}%"></div>
                <div class="h-marker" style="left:${noData?0:pct}%"></div>
                <div class="h-ticks" aria-hidden="true"></div>
              </div>
              <div class="h-labels" aria-hidden="true"><span>1</span><span>7</span></div>
            </div>
          </div>

          <div class="calif-spacer" aria-hidden="true"></div>
        </div>
      </article>
    `;
  }

  function renderCards(){
    for (const lvl of ["Primaria","Secundaria","Terciaria"]){
      const container = $(`#cards-${lvl}`);
      container.innerHTML = PEOPLE.filter(p=>p.level===lvl).map(cardTemplate).join('');
    }
    bindRateButtons();
  }

  function bindRateButtons(){
    $$(".card").forEach(card=>{
      const pid = +card.dataset.personId;
      $$(".rate-btn",card).forEach(btn=>{
        btn.addEventListener("click", ()=>{
          $$(".rate-btn",card).forEach(b=>{ b.setAttribute("aria-pressed","false"); b.classList.remove("sel"); });
          btn.setAttribute("aria-pressed","true");
          btn.classList.add("sel");
          SELECTED.set(pid, +btn.dataset.score);
        });
      });
    });
  }

  // ---------------------------
  // Modal de espera (simulación)
  // ---------------------------
  const modalEl = $("#submitModal");
  let lastFocusEl = null;

  const setButtonsDisabled = (flag) => {
    const ids = ["btnSubmit","btnClear","btnReset"];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = flag; });
  };

  const showModal = () => {
    if (!modalEl) return;
    lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalEl.classList.add("show");
    modalEl.setAttribute("aria-hidden", "false");
    if (!modalEl.hasAttribute("tabindex")) modalEl.setAttribute("tabindex","-1");
    document.body.classList.add("modal-open");   // bloquea scroll (CSS)
    setButtonsDisabled(true);
    // mueve el foco a la modal (accesibilidad)
    modalEl.focus({preventScroll:true});
  };

  const hideModal = () => {
    if (!modalEl) return;
    modalEl.classList.remove("show");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    setButtonsDisabled(false);
    // devuelve el foco
    (lastFocusEl || document.getElementById("btnSubmit") || document.body).focus();
  };

  // ---------------------------
  // Envío de votos (simulado)
  // ---------------------------
  function applyPendingVotes(){
    if (SELECTED.size===0){
      toast("Selecciona al menos una nota.");
      return;
    }

    showModal(); // abre la modal con fade-in

    // Simula una espera de servidor
    setTimeout(() => {
      LAST_BATCH_VOTED = new Set();

      for (const [pid,score] of SELECTED.entries()){
        const p = PEOPLE.find(x=>x.id===pid);
        if (!p) continue;
        const baseVotes = p.votes || 0;
        const newVotes  = baseVotes + 1;
        const newAvg    = baseVotes===0 ? score : ((p.avg*baseVotes + score) / newVotes);

        p.votes = newVotes;
        p.avg   = +newAvg.toFixed(2);
        LAST_BATCH_VOTED.add(pid);

        // Actualiza card en vivo
        const card = document.querySelector(`.card[data-person-id="${pid}"]`);
        if (card){
          $(".votes",card).textContent = newVotes;
          const avgEl = $(".avg",card);
          avgEl.classList.remove("is-empty");
          avgEl.textContent = fmt2(p.avg);

          const pct = avgToPct(p.avg);
          $(".h-fill",card).style.width  = pct+"%";
          $(".h-marker",card).style.left = pct+"%";

          // limpiar selección de botones
          $$(".rate-btn",card).forEach(b=>{ b.setAttribute("aria-pressed","false"); b.classList.remove("sel"); });
          card.classList.remove("no-data");
        }
      }
      SELECTED.clear();

      hasSubmitted = true;   // habilita ranking

      hideModal();           // cierra la modal
      setPage("ranking", {push:true}); // navega y construye ranking
    }, 1200); // duración simulada
  }

  function clearSelections(){
    SELECTED.clear();
    $$(".rate-btn[aria-pressed='true']").forEach(b=>{ b.setAttribute("aria-pressed","false"); b.classList.remove("sel"); });
  }

  function resetSimulation(){
    PEOPLE = seedRatings(buildPeople());
    SELECTED.clear();
    LAST_BATCH_VOTED = new Set();
    hasSubmitted = false; // vuelve a bloquear ranking hasta nuevo envío
    renderCards();
    setPage("inicio", {push:true});
  }

  // ---------------------------
  // Ranking + Gráficos
  // ---------------------------
  let histChart, pieChart;

  function buildDistribution(rowsRated){
    const labels = ["1-2","2-3","3-4","4-5","5-6","6-7"];
    const counts = [0,0,0,0,0,0];
    let total = 0;
    for (const r of rowsRated){
      const avg = r.avg;
      if (avg==null) continue;
      total++;
      if      (avg>=1 && avg<2) counts[0]++; else
      if      (avg>=2 && avg<3) counts[1]++; else
      if      (avg>=3 && avg<4) counts[2]++; else
      if      (avg>=4 && avg<5) counts[3]++; else
      if      (avg>=5 && avg<6) counts[4]++; else
      if      (avg>=6 && avg<=7) counts[5]++;
    }
    const percents = total ? counts.map(c=>+(c*100/total).toFixed(2)) : [0,0,0,0,0,0];
    return {labels,counts,percents,total};
  }

  function renderRanking(skipChartsRebuild=false){
    const rated = PEOPLE.filter(p=>p.votes>0).sort((a,b)=>{
      if (a.avg==null && b.avg!=null) return 1;
      if (a.avg!=null && b.avg==null) return -1;
      if (b.avg!==a.avg) return (b.avg||0) - (a.avg||0);
      if (b.votes!==a.votes) return b.votes - a.votes;
      return a.name.localeCompare(b.name);
    });
    const unrated = PEOPLE.filter(p=>p.votes===0);

    // Tabla: con calificaciones
    const tbodyRated = $("#tbodyRated");
    tbodyRated.innerHTML = rated.map((r,i)=>{
      const isLow = r.avg < 4;
      const isHL  = LAST_BATCH_VOTED.has(r.id);
      return `
        <tr class="${isHL?'highlight-row':''} ${isLow?'low-row':''}" data-person-id="${r.id}">
          <td>${i+1}</td>
          <td>
            <div class="row" style="gap:8px; align-items:center">
              <img class="avatar-img" src="${r.photo_url}" alt="Foto de ${r.name}"
                   onerror="this.onerror=null;this.src='${FALLBACK_SVG}';">
              <span>${r.name}</span>
              ${isHL?`<span class="chip"><i class="fa-solid fa-check" aria-hidden="true"></i>&nbsp;Tu voto</span>`:''}
            </div>
          </td>
          <td>Atención ${r.level}</td>
          <td class="avg-cell ${isLow?'low-score':''}" style="text-align:right">${fmt2(r.avg)}</td>
          <td style="text-align:right">${r.votes}</td>
        </tr>
      `;
    }).join("");

    // Tabla: sin calificaciones
    const tbodyUn = $("#tbodyUnrated");
    tbodyUn.innerHTML = unrated.map((r,i)=>`
      <tr data-person-id="${r.id}">
        <td>${i+1}</td>
        <td>
          <div class="row" style="gap:8px; align-items:center">
            <img class="avatar-img" src="${r.photo_url}" alt="Foto de ${r.name}"
                 onerror="this.onerror=null;this.src='${FALLBACK_SVG}';">
            <span>${r.name}</span>
          </div>
        </td>
        <td>Atención ${r.level}</td>
        <td style="text-align:right"><span class="chip"><i class="fa-regular fa-circle" aria-hidden="true"></i>&nbsp;Sin calificación</span></td>
      </tr>
    `).join("");

    // Gráficos
    const {labels,counts,percents,total} = buildDistribution(rated);
    $("#distTotal").textContent = total;
    const chartsPanel = $("#chartsPanel");
    const voteHint   = $("#voteHint");
    chartsPanel.hidden = total===0;
    voteHint.style.display = LAST_BATCH_VOTED.size>0 ? "block" : "none";

    if (!chartsPanel.hidden){
      if (window.ChartDataLabels) Chart.register(ChartDataLabels);
      Chart.defaults.responsiveAnimationDuration = 0;

      if (!skipChartsRebuild){
        if (histChart) histChart.destroy();
        if (pieChart)  pieChart.destroy();

        histChart = new Chart($("#histChart"), {
          type:"bar",
          data:{ labels, datasets:[{ label:"Profesionales", data:counts }] },
          options:{
            responsive:true, maintainAspectRatio:true,
            animation:{ duration:900, easing:"easeOutCubic" },
            plugins:{
              legend:{ display:false },
              tooltip:{ callbacks:{ label:(ctx)=>{
                const i=ctx.dataIndex; return `${counts[i]||0} (${percents[i]||0}%)`; } } }
            },
            scales:{ y:{ beginAtZero:true, ticks:{precision:0} } }
          }
        });

        pieChart = new Chart($("#pieChart"), {
          type:"pie",
          data:{ labels, datasets:[{ data:counts }] },
          options:{
            responsive:true, maintainAspectRatio:true,
            animation:{ duration:700, easing:"easeOutCubic" },
            plugins:{
              legend:{ position:"bottom", labels:{ boxWidth:14 } },
              tooltip:{ callbacks:{ label:(ctx)=>{
                const i=ctx.dataIndex; return ` ${ctx.label}: ${counts[i]||0} (${percents[i]||0}%)`; } } },
              datalabels: window.ChartDataLabels ? {
                formatter:(value,context)=>{ const p=percents[context.dataIndex]||0; return p>0? p+'%':''; },
                color:'#0f172a', font:{ weight:'700', size:12 }
              } : undefined
            }
          }
        });
      }
    }
  }

  // ---------------------------
  // Router (History API) con bloqueo de ranking
  // ---------------------------
  function currentPage() {
    const q = new URLSearchParams(location.search);
    const p = (q.get("page") || "inicio").toLowerCase();
    return (p === "ranking") ? "ranking" : "inicio";
  }

  function setPage(page, {push=true} = {}){
    // Si intentan ir a ranking antes del primer envío, fuerza inicio
    if (page === "ranking" && !hasSubmitted) {
      page = "inicio";
      if (push) toast("Primero envía tus calificaciones para ver el ranking.");
    }

    $$(".view").forEach(v=>v.classList.remove("active"));
    if (page === "ranking"){
      $("#view-ranking").classList.add("active");
      renderRanking(); // construir solo cuando se accede y ya hubo envío
      document.title = "Ranking — Calificaciones";
    } else {
      $("#view-inicio").classList.add("active");
      document.title = "Inicio — Calificaciones";
    }

    // Actualiza la URL
    if (push){
      const url = new URL(location.href);
      url.searchParams.set("page", page);
      history.pushState({page}, "", url);
    }
    window.scrollTo({top:0, behavior:"instant"});
  }

  // Intercepta enlaces de navegación
  document.addEventListener("click", (ev)=>{
    const a = ev.target.closest("a[data-link]");
    if (!a) return;
    const url  = new URL(a.href, location.origin);
    const page = (url.searchParams.get("page") || "inicio").toLowerCase();
    ev.preventDefault();
    setPage(page, {push:true});
  });

  // Soporte back/forward (aplica misma política de bloqueo)
  window.addEventListener("popstate", ()=>{
    setPage(currentPage(), {push:false});
  });

  // ---------------------------
  // Controles globales
  // ---------------------------
  function bindControls() {
    const clearBtn = $("#btnClear");
    const submitBtn = $("#btnSubmit");
    const resetBtn  = $("#btnReset");

    if (clearBtn) clearBtn.addEventListener("click", clearSelections);
    if (submitBtn) submitBtn.addEventListener("click", applyPendingVotes);
    if (resetBtn)  resetBtn.addEventListener("click", resetSimulation);
  }

  // ---------------------------
  // Init
  // ---------------------------
  document.addEventListener("DOMContentLoaded", () => {
    renderCards();                  // genera tarjetas
    // NO renderRanking al cargar (se construye tras el primer envío)
    setPage(currentPage(), {push:false}); // respeta ?page, pero bloquea ranking si no hay envío
    bindControls();
  });

})();
