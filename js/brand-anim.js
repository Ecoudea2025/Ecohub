// Ecohub · brand-anim.js — Animación viva del logo E con velas de inversión y "jugarreta" expandible
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initBrandAnimation() {
  const brand = document.getElementById('brandLogo');
  if (!brand) return;

  const logoSvg = brand.querySelector('.brand-candle-logo');
  const lettersWrap = brand.querySelector('.brand-letters-wrap');
  const letters = brand.querySelector('.brand-letters');
  const chars = brand.querySelectorAll('.b-char');
  const candles = brand.querySelectorAll('.logo-candles .candle');
  const greenCandles = brand.querySelectorAll('.logo-candles .candle-green');
  const redCandles = brand.querySelectorAll('.logo-candles .candle-red');

  if (!logoSvg || !lettersWrap || !chars.length) return;

  let isExpanded = true;
  let isAnimating = false;
  let idleTimer = null;
  let lastInteraction = Date.now();

  // Guardar ancho natural de las letras
  const getNaturalWidth = () => {
    if (!letters) return 68;
    return letters.scrollWidth || 68;
  };

  // 1. ANIMACIÓN AMBIENTAL DE VELAS (Ticker de cotizaciones en tiempo real)
  const ambientTweens = [];
  function startCandleAmbient() {
    if (reducedMotion()) return;
    candles.forEach((c, idx) => {
      const body = c.querySelector('.c-body');
      const wicks = c.querySelectorAll('.c-wick');
      const isGreen = c.classList.contains('candle-green');
      
      // Movimiento vertical flotante orgánico desfasado
      const dur = 1.4 + (idx * 0.22) % 1.2;
      const yDelta = isGreen ? -2.2 : 2.0;

      const t1 = gsap.to(c, {
        y: yDelta,
        duration: dur,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: (idx * 0.15) % 0.8,
      });
      ambientTweens.push(t1);

      if (body) {
        const t2 = gsap.to(body, {
          scaleY: 1.14,
          duration: dur * 0.9,
          repeat: -1,
          yoyo: true,
          transformOrigin: '50% 50%',
          ease: 'power1.inOut',
          delay: (idx * 0.18) % 0.7,
        });
        ambientTweens.push(t2);
      }

      if (wicks.length) {
        const t3 = gsap.to(wicks, {
          scaleY: 1.18,
          duration: dur * 1.1,
          repeat: -1,
          yoyo: true,
          transformOrigin: '50% 50%',
          ease: 'sine.inOut',
          delay: (idx * 0.2) % 0.9,
        });
        ambientTweens.push(t3);
      }
    });
  }

  // 2. EXPANDIR LETRAS ("cohub" emergen del logo E)
  function expand(onComplete = null) {
    if (reducedMotion()) {
      lettersWrap.style.width = 'auto';
      chars.forEach((ch) => { ch.style.opacity = '1'; ch.style.transform = 'none'; });
      isExpanded = true;
      if (onComplete) onComplete();
      return;
    }

    isAnimating = true;
    const targetW = getNaturalWidth();
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        isAnimating = false;
        isExpanded = true;
        lettersWrap.style.width = 'auto'; // Adaptable
        if (onComplete) onComplete();
      }
    });

    tl.to(lettersWrap, {
      width: targetW,
      opacity: 1,
      duration: 0.52,
      ease: 'back.out(1.5)',
    }, 0);

    tl.fromTo(chars, {
      x: -16,
      scale: 0.7,
      opacity: 0,
      rotateY: -20,
    }, {
      x: 0,
      scale: 1,
      opacity: 1,
      rotateY: 0,
      duration: 0.48,
      stagger: 0.05,
      ease: 'back.out(2.2)',
      clearProps: 'transform,opacity',
    }, 0.06);

    // Rally alcista en las velas verdes al expandirse
    tl.to(greenCandles, {
      y: -5,
      scaleY: 1.25,
      duration: 0.25,
      yoyo: true,
      repeat: 1,
      transformOrigin: '50% 100%',
      stagger: 0.03,
      ease: 'power2.out',
    }, 0);

    return tl;
  }

  // 3. CONTRAER LETRAS (se recogen dentro de la "E")
  function contract(onComplete = null) {
    if (reducedMotion()) {
      lettersWrap.style.width = '0px';
      isExpanded = false;
      if (onComplete) onComplete();
      return;
    }

    isAnimating = true;
    const currentW = lettersWrap.offsetWidth;
    lettersWrap.style.width = currentW + 'px';

    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating = false;
        isExpanded = false;
        lettersWrap.style.width = '0px';
        if (onComplete) onComplete();
      }
    });

    tl.to(chars, {
      x: -14,
      scale: 0.75,
      opacity: 0,
      duration: 0.28,
      stagger: { each: 0.03, from: 'end' },
      ease: 'power2.in',
    }, 0);

    tl.to(lettersWrap, {
      width: 0,
      opacity: 0,
      duration: 0.38,
      ease: 'power3.inOut',
    }, 0.1);

    // Efecto de compresión sutil en el logo
    tl.to(logoSvg, {
      scale: 0.94,
      duration: 0.18,
      yoyo: true,
      repeat: 1,
      transformOrigin: '50% 50%',
      ease: 'power1.inOut',
    }, 0.15);

    return tl;
  }

  // 4. "LA JUGARRETA" (Secuencia interactiva completa de alta energía y volatilidad)
  function playJugarreta() {
    if (reducedMotion() || isAnimating) return;
    lastInteraction = Date.now();
    isAnimating = true;

    // Detener temporalmente el ambient
    ambientTweens.forEach((t) => t.pause());

    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating = false;
        ambientTweens.forEach((t) => t.resume());
        lastInteraction = Date.now();
      }
    });

    // 1) Volatilidad extrema (trading rally): velas verdes suben, rojas oscilan
    tl.to(greenCandles, {
      y: -7,
      scaleY: 1.35,
      duration: 0.22,
      stagger: 0.04,
      transformOrigin: '50% 100%',
      ease: 'power3.out',
    }, 0);

    tl.to(redCandles, {
      y: 5,
      scaleY: 1.2,
      duration: 0.22,
      stagger: 0.04,
      transformOrigin: '50% 0%',
      ease: 'power3.out',
    }, 0.06);

    // 2) Retorno con rebote elástico
    tl.to(candles, {
      y: 0,
      scaleY: 1,
      duration: 0.55,
      stagger: 0.03,
      ease: 'elastic.out(1.2, 0.4)',
    }, 0.24);

    // 3) Onda elástica en las letras "cohub"
    tl.to(chars, {
      y: -6,
      scale: 1.15,
      duration: 0.2,
      stagger: 0.04,
      ease: 'power2.out',
    }, 0.12);

    tl.to(chars, {
      y: 0,
      scale: 1,
      duration: 0.45,
      stagger: 0.04,
      ease: 'elastic.out(1.4, 0.45)',
      clearProps: 'transform',
    }, 0.3);

    // 4) Pulso de luz en el marco de la E
    const brackets = brand.querySelectorAll('.logo-bracket');
    tl.to(brackets, {
      filter: 'brightness(1.35) drop-shadow(0 0 8px rgba(108, 154, 6, 0.75))',
      duration: 0.25,
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut',
    }, 0.1);
  }

  // 5. INICIALIZACIÓN Y EVENTOS
  startCandleAmbient();

  // Animación de entrada inicial: expande "cohub" con elegancia
  lettersWrap.style.width = '0px';
  lettersWrap.style.opacity = '0';
  setTimeout(() => {
    expand();
  }, 400);

  // Hover: si está contraído se expande; si está expandido genera una micro-jugarreta
  brand.addEventListener('mouseenter', () => {
    lastInteraction = Date.now();
    if (!isExpanded) {
      expand();
    } else {
      // Micro-rebote de trading
      gsap.to(greenCandles, {
        y: -4,
        duration: 0.18,
        yoyo: true,
        repeat: 1,
        stagger: 0.03,
        ease: 'power2.out',
      });
      gsap.to(chars, {
        y: -3,
        duration: 0.16,
        yoyo: true,
        repeat: 1,
        stagger: 0.03,
        ease: 'back.out(2)',
      });
    }
  });

  // Click: activa la jugarreta (contrae hacia la E y re-expande con rebote de velas)
  brand.addEventListener('click', (e) => {
    e.preventDefault();
    if (isAnimating) return;
    lastInteraction = Date.now();
    if (isExpanded) {
      contract(() => {
        gsap.to(greenCandles, {
          y: -5,
          scaleY: 1.25,
          duration: 0.18,
          yoyo: true,
          repeat: 1,
          stagger: 0.03,
          ease: 'power2.out',
        });
        setTimeout(() => {
          expand(() => {
            playJugarreta();
          });
        }, 300);
      });
    } else {
      expand(() => {
        playJugarreta();
      });
    }
  });

  // Ciclo Idle Automático: Cada ~15 segundos demuestra la jugarreta
  function setupIdleCycle() {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      if (document.hidden || reducedMotion()) return;
      const elapsed = Date.now() - lastInteraction;
      // Solo si el usuario no ha interactuado en los últimos 12 segundos
      if (elapsed >= 12000 && !isAnimating) {
        // Ciclo jugarreta: contrae suavemente y re-expande con rebote
        contract(() => {
          setTimeout(() => {
            expand(() => {
              playJugarreta();
            });
          }, 800);
        });
      }
    }, 15000);
  }

  setupIdleCycle();

  // Reajuste ante resize para mantener fluidez
  window.addEventListener('resize', () => {
    if (isExpanded && !isAnimating) {
      lettersWrap.style.width = 'auto';
    }
  }, { passive: true });
}
