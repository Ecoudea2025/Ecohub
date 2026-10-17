// Ecohub · hero-graph-anim.js — Gráfica matemática interactiva y ciclo continuo sin cortes
// Fases: Ciclo Base -> Derivada dy/dx -> Integral y Riemann -> Equilibrio de Mercado -> Retorno armónico

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initHeroGraphAnimation() {
  const chart = document.getElementById('heroChart');
  const svg = document.getElementById('heroSvg');
  const line = document.getElementById('heroLine');
  const line2 = document.getElementById('heroLine2');
  const area = document.getElementById('heroArea');
  const riemannGroup = document.getElementById('riemannGroup');
  const tangent = document.getElementById('heroTangent');
  const dot = document.getElementById('heroDot');
  const eqMarker = document.getElementById('heroEqMarker');
  const eqRing = document.getElementById('heroEqRing');
  const mathBadge = document.getElementById('heroMathBadge');
  const badgeText = document.getElementById('heroBadgeText');
  const badgeBg = document.getElementById('heroBadgeBg');

  if (!chart || !svg || !line || !line2) return;

  // Curvas canónicas
  const D0_LINE1 = 'M0 100 C60 90 90 60 140 62 C190 64 210 90 260 70 C310 50 340 30 400 34 C430 36 460 20 480 14';
  const D0_LINE2 = 'M0 108 C80 100 120 78 180 80 C240 82 260 100 320 84 C370 72 420 60 480 48';
  const D_SUPPLY = 'M0 115 C90 110 160 95 240 70 C310 48 380 32 480 20';
  const D_CYCLE = 'M0 95 C60 82 100 52 150 56 C200 60 220 95 270 75 C320 55 350 25 410 30 C440 32 465 16 480 12';

  const totalLen = line.getTotalLength();
  let isUserInteracting = false;
  let masterTl = null;

  // Franjas verticales de Riemann entre x=70 y x=350
  function buildRiemannBars() {
    if (!riemannGroup) return;
    riemannGroup.innerHTML = '';
    const numBars = 18;
    const startX = 70;
    const endX = 350;
    const step = (endX - startX) / numBars;

    for (let i = 0; i <= numBars; i++) {
      const curX = startX + i * step;
      const pt = getPointAtX(curX);
      const rLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      rLine.setAttribute('class', 'riemann-bar');
      rLine.setAttribute('x1', curX.toFixed(1));
      rLine.setAttribute('y1', '120');
      rLine.setAttribute('x2', curX.toFixed(1));
      rLine.setAttribute('y2', pt.y.toFixed(1));
      riemannGroup.appendChild(rLine);
    }
  }

  // Búsqueda binaria rápida de punto (x, y) sobre la curva principal
  function getPointAtX(targetX) {
    let low = 0;
    let high = totalLen;
    let bestPt = line.getPointAtLength(0);

    for (let i = 0; i < 14; i++) {
      const mid = (low + high) * 0.5;
      const pt = line.getPointAtLength(mid);
      if (Math.abs(pt.x - targetX) < 0.35) return pt;
      if (pt.x < targetX) low = mid;
      else high = mid;
      bestPt = pt;
    }
    return bestPt;
  }

  // Actualizar recta tangente centrada en targetX
  function updateTangentAtX(targetX, tangentLength = 56) {
    const pt = getPointAtX(targetX);
    const p1 = getPointAtX(Math.max(0, targetX - 2));
    const p2 = getPointAtX(Math.min(480, targetX + 2));

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    const half = tangentLength * 0.5;

    const x1 = pt.x - Math.cos(angle) * half;
    const y1 = pt.y - Math.sin(angle) * half;
    const x2 = pt.x + Math.cos(angle) * half;
    const y2 = pt.y + Math.sin(angle) * half;

    tangent.setAttribute('x1', x1.toFixed(1));
    tangent.setAttribute('y1', y1.toFixed(1));
    tangent.setAttribute('x2', x2.toFixed(1));
    tangent.setAttribute('y2', y2.toFixed(1));

    dot.setAttribute('cx', pt.x.toFixed(1));
    dot.setAttribute('cy', pt.y.toFixed(1));

    // Pendiente matemática (inversión por orientación Y en SVG)
    const slope = dx !== 0 ? -(dy / dx) : 0;
    return { pt, slope, angle };
  }

  // Polígono SVG del área bajo la curva
  function updateAreaPath(startX = 70, endX = 350) {
    if (!area) return;
    const numPts = 20;
    const step = (endX - startX) / numPts;
    let d = `M ${startX.toFixed(1)} 120`;

    for (let i = 0; i <= numPts; i++) {
      const px = startX + i * step;
      const pt = getPointAtX(px);
      d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    d += ` L ${endX.toFixed(1)} 120 Z`;
    area.setAttribute('d', d);
  }

  // Configurar y posicionar la píldora matemática
  function setBadge(text, x, y, width = 135) {
    if (!mathBadge) return;
    badgeText.textContent = text;
    badgeBg.setAttribute('width', String(width));
    badgeBg.setAttribute('x', String(-width * 0.5));
    badgeBg.setAttribute('y', '-13');
    mathBadge.setAttribute('transform', `translate(${x.toFixed(1)}, ${Math.max(16, y - 22).toFixed(1)})`);
  }

  buildRiemannBars();
  updateAreaPath(70, 350);

  // Inicializar estado de elementos
  dot.setAttribute('opacity', '1');
  const initPt = getPointAtX(20);
  dot.setAttribute('cx', initPt.x.toFixed(1));
  dot.setAttribute('cy', initPt.y.toFixed(1));

  if (reducedMotion()) {
    dot.setAttribute('cx', '240');
    dot.setAttribute('cy', '70');
    return;
  }

  // ============================================================
  // MASTER TIMELINE — CICLO CONTINUO Y ELEGANTE (23.5s)
  // ============================================================
  function createMasterLoop() {
    const proxy = { x: 20, tangentLen: 0 };
    const syncDot = () => {
      if (isUserInteracting) return;
      const pt = getPointAtX(proxy.x);
      dot.setAttribute('cx', pt.x.toFixed(1));
      dot.setAttribute('cy', pt.y.toFixed(1));
      if (proxy.tangentLen > 0) {
        updateTangentAtX(proxy.x, proxy.tangentLen);
      }
    };

    masterTl = gsap.timeline({
      repeat: -1,
      paused: false,
      defaults: { ease: 'power2.inOut' },
      onUpdate: () => {
        if (isUserInteracting) return;
        const t = masterTl.time();
        if (t >= 4.5 && t < 9.1) {
          if (t < 5.8) {
            setBadge("f'(x*) = 0 · Óptimo", 140, 58, 140);
          } else {
            const pt = getPointAtX(proxy.x);
            setBadge("f'(x) = dy/dx", proxy.x, pt.y, 126);
          }
        } else if (t >= 9.5 && t < 14.8) {
          setBadge('∫ f(x)dx · Excedente', 210, 56, 146);
        } else if (t >= 15.0 && t < 19.8) {
          setBadge('E*(q*, p*) · Equilibrio', 240, 66, 154);
        }
      }
    });

    // ----------------------------------------------------
    // FASE 0: Ciclo Base y Fluctuación Cíclica (0.0s - 4.5s)
    // ----------------------------------------------------
    masterTl.addLabel('base', 0);
    masterTl.set([tangent, mathBadge, area, riemannGroup, eqMarker], { opacity: 0 }, 'base');

    masterTl.to(line, {
      attr: { d: D_CYCLE },
      duration: 2.2,
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut'
    }, 'base');

    masterTl.to(proxy, {
      x: 140,
      duration: 4.5,
      ease: 'power1.inOut',
      onUpdate: syncDot
    }, 'base');

    // ----------------------------------------------------
    // FASE 1: Derivada dy/dx & Recta Tangente en Óptimo (4.5s - 9.5s)
    // ----------------------------------------------------
    masterTl.addLabel('derivada', 4.5);

    masterTl.to(tangent, { opacity: 1, duration: 0.4 }, 'derivada');
    masterTl.to(mathBadge, { opacity: 1, duration: 0.35 }, 'derivada');

    masterTl.to(proxy, {
      tangentLen: 60,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: syncDot
    }, 'derivada');

    // Mover la tangente por el declive demostrando dy/dx cambiante
    masterTl.to(proxy, {
      x: 230,
      tangentLen: 56,
      duration: 3.2,
      ease: 'power1.inOut',
      onUpdate: syncDot
    }, 'derivada+=1.2');

    masterTl.to([tangent, mathBadge], { opacity: 0, duration: 0.45 }, 'derivada+=4.4');
    masterTl.to(proxy, { tangentLen: 0, duration: 0.45 }, 'derivada+=4.4');

    // ----------------------------------------------------
    // FASE 2: Integral & Sumas de Riemann / Excedente (9.5s - 15.0s)
    // ----------------------------------------------------
    masterTl.addLabel('integral', 9.5);

    masterTl.to(mathBadge, { opacity: 1, duration: 0.35 }, 'integral+=0.1');
    masterTl.to(area, { opacity: 0.85, duration: 0.8, ease: 'power2.out' }, 'integral+=0.1');

    const bars = riemannGroup ? riemannGroup.querySelectorAll('.riemann-bar') : [];
    masterTl.to(riemannGroup, { opacity: 1, duration: 0.3 }, 'integral+=0.2');
    if (bars.length > 0) {
      masterTl.fromTo(bars,
        { scaleY: 0, transformOrigin: '50% 100%' },
        { scaleY: 1, duration: 0.7, stagger: 0.025, ease: 'power2.out' },
        'integral+=0.3'
      );
    }

    masterTl.to(proxy, {
      x: 340,
      duration: 4.2,
      ease: 'sine.inOut',
      onUpdate: syncDot
    }, 'integral');

    masterTl.to([area, riemannGroup, mathBadge], { opacity: 0, duration: 0.65 }, 'integral+=4.5');

    // ----------------------------------------------------
    // FASE 3: Cruce y Equilibrio de Mercado (15.0s - 20.2s)
    // ----------------------------------------------------
    masterTl.addLabel('equilibrio', 15.0);

    masterTl.to(line2, {
      attr: { d: D_SUPPLY },
      stroke: '#ffc107',
      opacity: 0.95,
      duration: 1.5,
      ease: 'power2.out'
    }, 'equilibrio');

    masterTl.to(proxy, {
      x: 240,
      duration: 1.5,
      ease: 'power2.out',
      onUpdate: syncDot
    }, 'equilibrio');

    masterTl.to([eqMarker, mathBadge], { opacity: 1, duration: 0.35 }, 'equilibrio+=0.7');

    masterTl.fromTo(eqRing,
      { r: 5, opacity: 1 },
      { r: 26, opacity: 0, duration: 1.1, repeat: 1, ease: 'power1.out' },
      'equilibrio+=0.8'
    );

    masterTl.to([eqMarker, mathBadge], { opacity: 0, duration: 0.4 }, 'equilibrio+=4.4');

    // ----------------------------------------------------
    // FASE 4: Retorno Armónico al Estado Inicial (20.2s - 23.5s)
    // ----------------------------------------------------
    masterTl.addLabel('retorno', 20.2);

    masterTl.to(line, {
      attr: { d: D0_LINE1 },
      duration: 2.4,
      ease: 'power2.inOut'
    }, 'retorno');

    masterTl.to(line2, {
      attr: { d: D0_LINE2 },
      stroke: 'var(--pal-highlight)',
      opacity: 0.7,
      duration: 2.4,
      ease: 'power2.inOut'
    }, 'retorno');

    masterTl.to(proxy, {
      x: 20,
      duration: 3.3,
      ease: 'sine.inOut',
      onUpdate: syncDot
    }, 'retorno');

    window.__heroTimeline = masterTl;
    return masterTl;
  }

  createMasterLoop();

  // ============================================================
  // INTERACCIÓN CON EL CURSOR ("JUGARRETA")
  // ============================================================
  chart.addEventListener('mouseenter', () => {
    isUserInteracting = true;
    if (masterTl) masterTl.pause();
    gsap.to(tangent, { opacity: 1, duration: 0.25 });
  });

  chart.addEventListener('mousemove', (e) => {
    if (!isUserInteracting) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = Math.max(0, Math.min(480, (clientX / rect.width) * 480));

    const { pt, slope } = updateTangentAtX(svgX, 64);
    const sign = slope >= 0 ? '+' : '';
    setBadge(`dy/dx = ${sign}${slope.toFixed(2)}`, pt.x, pt.y, 120);
    gsap.to(mathBadge, { opacity: 1, duration: 0.2 });
  });

  chart.addEventListener('mouseleave', () => {
    isUserInteracting = false;
    gsap.to([tangent, mathBadge], { opacity: 0, duration: 0.35 });
    if (masterTl) masterTl.play();
  });

  chart.addEventListener('click', (e) => {
    e.preventDefault();
    gsap.to([line, line2], {
      scaleY: 1.08,
      duration: 0.16,
      yoyo: true,
      repeat: 1,
      transformOrigin: '50% 50%',
      ease: 'power2.out'
    });

    gsap.fromTo(dot,
      { r: 5 },
      { r: 9, duration: 0.2, yoyo: true, repeat: 1, ease: 'back.out(2)' }
    );

    if (masterTl) {
      isUserInteracting = false;
      gsap.to([tangent, mathBadge], { opacity: 0, duration: 0.3 });
      masterTl.play();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (masterTl) masterTl.pause();
    } else {
      if (masterTl && !isUserInteracting) masterTl.play();
    }
  });

  window.addEventListener('hashchange', () => {
    const isHome = location.hash === '' || location.hash === '#/' || location.hash === '#/inicio';
    if (!isHome) {
      if (masterTl) masterTl.pause();
    } else {
      if (masterTl && !isUserInteracting) masterTl.play();
    }
  });
}

