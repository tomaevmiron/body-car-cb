(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ------------------------------------------------------------------
     Laca: el fondo es un panel de pintura negra visto de cerca.
     Cada píxel calcula su normal sobre la forma del panel y refleja una
     malla hexagonal colgada del techo, como las luces reales del taller.
     ------------------------------------------------------------------ */
  const FRAG = `
  #extension GL_OES_standard_derivatives : enable
  precision highp float;
  uniform vec2 uRes;
  uniform vec2 uTilt;
  uniform float uTime, uScroll, uLight, uWordShift;
  uniform sampler2D uWord;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  // Forma del panel: ondulación lenta y dos aristas de carrocería.
  float crease(vec2 p){ return p.y + .17 * p.x + .3; }
  float shoulder(vec2 p){ return p.y - .1 * p.x - .9; }
  float panel(vec2 p){
    float h = .034 * sin(p.x * 1.1 + .7) * cos(p.y * 1.5 - .2);
    float a = crease(p);
    h += .052 * sqrt(a * a + .0009);
    float b = shoulder(p);
    h -= .026 * sqrt(b * b + .004);
    return h;
  }

  // Distancia al borde del hexágono más cercano y centro de su celda.
  float hexEdge(vec2 p, out vec2 id){
    const vec2 s = vec2(1., 1.7320508);
    vec4 c = floor(vec4(p, p - vec2(.5, 1.)) / s.xyxy) + .5;
    vec4 h = vec4(p - c.xy * s, p - (c.zw + .5) * s);
    bool first = dot(h.xy, h.xy) < dot(h.zw, h.zw);
    vec2 g = first ? h.xy : h.zw;
    id = first ? c.xy * s : (c.zw + .5) * s;
    vec2 q = abs(g);
    return .5 - max(dot(q, s * .5), q.x);
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    float asp = uRes.x / uRes.y;
    vec2 p = (uv * 2. - 1.) * vec2(max(asp, .85), 1.);

    float e = .0025;
    float h0 = panel(p);
    vec3 n = normalize(vec3(-(panel(p + vec2(e, 0.)) - h0) / e, -(panel(p + vec2(0., e)) - h0) / e, 1.));
    vec2 peel = vec2(vnoise(p * 44. + 3.), vnoise(p * 44. + 17.)) - .5;
    n = normalize(n + vec3(peel * .0036 + uTilt * .04, 0.));

    // El techo visto en el reflejo: cerca de quien mira las celdas son grandes y al
    // alejarse se aplastan, igual que sobre el capó de un coche.
    float dn = max(.24, 1.08 - p.y + n.y * 1.75);
    vec2 Q = vec2((p.x + n.x * 1.6 - .28) / dn, 1.75 / dn);
    Q.y += uScroll * .85;
    Q.x += uTime * .005;

    const float S = 4.3;
    vec2 id;
    float d = hexEdge(Q * vec2(S, S * 1.32), id);
    vec2 cell = id / vec2(S, S * 1.32);
    // En vertical la malla sube para quedar entre el nombre y el texto.
    float tall = step(asp, 1.);
    vec2 home = vec2(mix(.36, .12, tall), mix(1.5, 1.98, tall) + uScroll * .85);
    vec2 box = abs(cell - home - vec2(uTime * .005, 0.)) - vec2(.74, .5);
    float lit = step(length(max(box, 0.)), .001);
    float aa = clamp(fwidth(d) * 1.15, .002, .1);
    float core = 1. - smoothstep(.019 - aa, .019 + aa, d);
    float halo = exp(-d * 13.) * .1 + exp(-d * 50.) * .26;

    // Cerca del borde inferior se apaga, para no competir con el texto.
    float low = mix(-.3, -.04, tall);
    float band = smoothstep(low - .48, low, p.y);
    float fres = .06 + .94 * pow(clamp(1. - dn * .34, 0., 1.), 3.);
    float tube = (core * .82 + halo) * lit * (.58 + fres) * band * uLight;

    // Aura: la luz también lava suavemente la laca alrededor de la malla.
    float near = length(max(abs(cell - home) - vec2(.62, .4), 0.));
    float aura = exp(-near * 1.5) * .07 * band * uLight;

    // Las aristas atrapan la luz en una línea larga y fina.
    float a = crease(p), b = shoulder(p);
    float fall = smoothstep(-2.1, -.2, p.x) * smoothstep(2.2, .3, p.x);
    float lines = (exp(-abs(a) * 70.) * .2 + exp(-abs(b) * 34.) * .085) * fall;
    float side = smoothstep(0., .5, a) * smoothstep(1.3, .4, a) * .022;

    float flake = (hash(floor(gl_FragCoord.xy)) - .5) * .006;
    float body = .012 + side + lines * (.45 + uLight * .55) + flake * (aura * 12. + .4);

    vec2 wuv = vec2(uv.x + n.x * .1, 1. - uv.y + n.y * .13 + uWordShift);
    float word = texture2D(uWord, wuv).a;

    float v = body + aura + tube + word * .3;
    v = 1. - exp(-v * 1.25);
    v *= 1. - .34 * dot(uv - .5, uv - .5) * 2.;
    vec3 col = v * mix(vec3(.985, .99, 1.), vec3(1.), v);
    col += (hash(gl_FragCoord.xy + uTime) - .5) / 255.;
    gl_FragColor = vec4(col, 1.);
  }`;

  const canvas = document.getElementById('laca');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (gl && gl.getExtension('OES_standard_derivatives')) {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.bindAttribLocation(prog, 0, 'a');
    gl.vertexAttribPointer(gl.getAttribLocation(prog, 'a'), 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);
    const U = { res: u('uRes'), tilt: u('uTilt'), time: u('uTime'), scroll: u('uScroll'), light: u('uLight'), shift: u('uWordShift') };

    // El nombre se refleja de verdad en el panel: se dibuja invertido en una textura.
    const wordCanvas = document.createElement('canvas');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

    const drawWord = () => {
      if (!innerWidth || !innerHeight) return;
      const k = .5;
      const W = wordCanvas.width = Math.ceil(innerWidth * k);
      const H = wordCanvas.height = Math.ceil(innerHeight * k);
      const c = wordCanvas.getContext('2d');
      const name = document.querySelector('.hero-name');
      const r = name.getBoundingClientRect();
      const top = r.top + scrollY;
      const size = parseFloat(getComputedStyle(name).fontSize);
      const base = top + r.height * .86;
      c.clearRect(0, 0, W, H);
      c.save();
      c.scale(k, k);
      c.translate(0, base * 2 + size * .05);
      c.scale(1, -1);
      c.font = `200 expanded ${size}px Archivo, sans-serif`;
      if ('letterSpacing' in c) c.letterSpacing = `${-.012 * size}px`;
      c.textBaseline = 'alphabetic';
      if ('filter' in c) c.filter = `blur(${Math.max(1, size * .012)}px)`;
      const fade = c.createLinearGradient(0, base, 0, base - size * .85);
      fade.addColorStop(0, 'rgba(255,255,255,.95)');
      fade.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = fade;
      c.fillText('BODY CAR', r.left, base);
      c.restore();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, wordCanvas);
    };

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const q = innerWidth < 760 ? .85 : .72;
      canvas.width = Math.round(innerWidth * dpr * q);
      canvas.height = Math.round(innerHeight * dpr * q);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      dirty = true;
    };

    const services = document.getElementById('servicios');
    let dirty = true, last = 0;
    let tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;
    // Una pestaña abierta en segundo plano puede arrancar con la ventana a 0 de alto.
    const pageTurns = () => scrollY / Math.max(innerHeight, 1);
    let scr = pageTurns(), light = 1;

    // Tras la portada la luz baja para que el texto se lea; vuelve a subir en el contacto.
    const aimLight = () => {
      const vh = Math.max(innerHeight, 1);
      const y = scrollY;
      const contact = document.getElementById('contacto').getBoundingClientRect().top;
      const hero = clamp(1 - y / (vh * .85), 0, 1);
      const end = clamp(1 - contact / (vh * .8), 0, 1);
      return Math.max(.13, hero, end * .3);
    };

    const paint = now => {
      requestAnimationFrame(paint);
      if (document.hidden) return;
      // Con el blanco perla tapando toda la pantalla no hace falta pintar el fondo.
      const pearl = services.getBoundingClientRect();
      if (pearl.top < 0 && pearl.bottom > innerHeight) return;
      const sAim = pageTurns();
      const lAim = aimLight();
      const moving = dirty || Math.abs(aimX - tiltX) + Math.abs(aimY - tiltY) > .0008
        || Math.abs(sAim - scr) > .0006 || Math.abs(lAim - light) > .002;
      if (!moving && (still || now - last < 42)) return;
      last = now;
      dirty = false;
      tiltX += (aimX - tiltX) * .06;
      tiltY += (aimY - tiltY) * .06;
      scr += (sAim - scr) * .12;
      light += (lAim - light) * .1;
      gl.uniform2f(U.tilt, tiltX, tiltY);
      gl.uniform1f(U.time, still ? 0 : now / 1000);
      gl.uniform1f(U.scroll, scr);
      gl.uniform1f(U.light, light);
      gl.uniform1f(U.shift, pageTurns());
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    addEventListener('resize', () => { resize(); drawWord(); }, { passive: true });
    addEventListener('scroll', () => { dirty = true; }, { passive: true });
    if (!still) {
      addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        aimX = e.clientX / innerWidth * 2 - 1;
        aimY = 1 - e.clientY / innerHeight * 2;
        document.documentElement.style.setProperty('--mx', `${(.2 + (aimX + 1) * .3) * 100}%`);
      }, { passive: true });
      addEventListener('deviceorientation', e => {
        if (e.gamma == null) return;
        aimX = clamp(e.gamma / 28, -1, 1);
        aimY = clamp((e.beta - 45) / 40, -1, 1);
      }, { passive: true });
    }

    resize();
    drawWord();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawWord(); dirty = true; });
    requestAnimationFrame(paint);
  }

  /* ------------------------------------------------------------------
     Deslizadores antes / después. Siguen al cursor o al dedo con un poco
     de inercia, y el rango pasa de los bordes para poder ver cada foto entera.
     ------------------------------------------------------------------ */
  const litObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-lit');
      obs.unobserve(en.target);
      if (en.target._intro) en.target._intro();
    });
  }, { threshold: .28 });

  document.querySelectorAll('.ba').forEach((el, index) => {
    let cur = 50, aim = 50, raf = 0, prev = 0, dragging = false, touched = false;

    const show = v => {
      el.style.setProperty('--x', `${v.toFixed(2)}%`);
      const n = Math.round(clamp(v, 0, 100));
      el.setAttribute('aria-valuenow', n);
      el.setAttribute('aria-valuetext', `Antes ${n} %, después ${100 - n} %`);
      el.classList.toggle('hide-b', v < 15);
      el.classList.toggle('hide-a', v > 85);
    };
    // La inercia depende del tiempo, no de los fotogramas: igual de suave en un móvil lento.
    const tick = now => {
      const dt = Math.min(now - prev, 100);
      prev = now;
      cur += (aim - cur) * (1 - Math.exp(-dt / 85));
      if (Math.abs(aim - cur) < .03) { cur = aim; raf = 0; } else raf = requestAnimationFrame(tick);
      show(cur);
    };
    const go = v => {
      aim = clamp(v, -8, 108);
      if (still) { cur = aim; show(cur); return; }
      if (!raf) { prev = performance.now(); raf = requestAnimationFrame(tick); }
    };
    const follow = e => {
      const r = el.getBoundingClientRect();
      touched = true;
      go((e.clientX - r.left) / r.width * 116 - 8);
    };

    el.addEventListener('pointerdown', e => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
      follow(e);
    });
    el.addEventListener('pointermove', e => {
      if (dragging || e.pointerType === 'mouse') follow(e);
    });
    ['pointerup', 'pointercancel'].forEach(t => el.addEventListener(t, () => { dragging = false; }));
    el.addEventListener('keydown', e => {
      const step = { ArrowLeft: -4, ArrowRight: 4, ArrowDown: -4, ArrowUp: 4 }[e.key];
      if (step) { e.preventDefault(); touched = true; go(clamp(aim, 0, 100) + step); }
      if (e.key === 'Home') { e.preventDefault(); touched = true; go(-8); }
      if (e.key === 'End') { e.preventDefault(); touched = true; go(108); }
    });

    // Al verlo por primera vez, la franja hace un barrido corto para que se entienda el gesto.
    if (!still) {
      el._intro = () => {
        const start = performance.now() + 500 + (index === 0 ? 300 : 0);
        const from = 50, swing = index % 2 ? -17 : 17;
        const run = t => {
          if (touched) return;
          const k = clamp((t - start) / 1900, 0, 1);
          if (k >= 1) { cur = aim = 50; show(50); return; }
          cur = aim = from + Math.sin(k * Math.PI * 2) * swing * (1 - k * .35);
          show(cur);
          requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
      };
    }
    litObserver.observe(el);
    show(50);
  });
  document.querySelectorAll('.shot').forEach(el => litObserver.observe(el));

  const riseObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); obs.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rise').forEach(el => riseObserver.observe(el));

  /* Proceso: la foto fija cambia según el paso que está en el centro de la pantalla. */
  const stage = [...document.querySelectorAll('.process-stage img')];
  const steps = [...document.querySelectorAll('.step')];
  const stepObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const i = steps.indexOf(en.target);
      steps.forEach((s, j) => s.classList.toggle('is-on', j === i));
      stage.forEach((s, j) => s.classList.toggle('is-on', j === i));
    });
  }, { rootMargin: '-46% 0px -46% 0px' });
  steps.forEach(s => stepObserver.observe(s));

  // Los paneles fijos solo existen en escritorio: en móvil no llegan a cruzarse y no descargan nada.
  const views = [document.querySelector('.svc-a'), document.querySelector('.svc-b')];
  const nearObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      obs.unobserve(en.target);
      if (en.target.classList.contains('process-stage')) stage.forEach(s => { s.loading = 'eager'; });
      else views[0].src = 'img/foto/urus-cabina-800.webp';
    });
  }, { rootMargin: '100% 0px' });
  nearObserver.observe(document.querySelector('.process-stage'));
  nearObserver.observe(document.querySelector('.svc-view'));

  /* Servicios: al pasar por una fila cambia la foto de al lado. */
  let viewOn = 0;
  const showService = row => {
    const next = views[1 - viewOn];
    const name = row.dataset.foto;
    document.querySelectorAll('.svc-row').forEach(r => r.classList.toggle('is-on', r === row));
    const swap = () => {
      next.classList.add('is-on');
      views[viewOn].classList.remove('is-on');
      viewOn = 1 - viewOn;
    };
    next.onload = swap;
    next.src = `img/foto/${name}-800.webp`;
    if (next.complete && next.naturalWidth) { next.onload = null; swap(); }
  };
  document.querySelectorAll('.svc-row').forEach(row => {
    row.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showService(row); });
    row.addEventListener('focus', () => showService(row));
  });

  /* Garaje */
  const park = document.querySelector('.park');
  document.querySelectorAll('.arrow').forEach(b => {
    b.addEventListener('click', () => {
      park.scrollBy({ left: Number(b.dataset.dir) * park.clientWidth * .7, behavior: still ? 'auto' : 'smooth' });
    });
  });

  /* Cabecera y barra de contacto en móvil */
  const top = document.getElementById('top');
  const dock = document.getElementById('dock');
  const toggle = top.querySelector('.top-toggle');
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    top.classList.toggle('is-solid', y > innerHeight * .6);
    if (!top.classList.contains('is-open')) top.classList.toggle('is-away', y > lastY && y > innerHeight * .6);
    dock.classList.toggle('is-on', y > innerHeight * .7);
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const setMenu = open => {
    top.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.textContent = open ? 'Cerrar' : 'Menú';
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setMenu(!top.classList.contains('is-open')));
  top.querySelectorAll('.top-nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));

  /* El formulario prepara el mensaje y abre WhatsApp; no se envía nada a ningún servidor. */
  document.getElementById('presupuesto').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const lines = ['Hola, quería pedir presupuesto.'];
    if (f.get('nombre')) lines.push(`Soy ${f.get('nombre')}.`);
    if (f.get('coche')) lines.push(`Coche: ${f.get('coche')}.`);
    if (f.get('mensaje')) lines.push(f.get('mensaje'));
    window.open(`https://wa.me/34601905115?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  });
})();
