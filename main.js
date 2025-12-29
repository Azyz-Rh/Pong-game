
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    let CW = 0, CH = 0;
    let IS_MOBILE = window.matchMedia && window.matchMedia("(max-width: 980px)").matches;

    function scaleCanvasForDPR() {
      IS_MOBILE = window.matchMedia && window.matchMedia("(max-width: 980px)").matches;

      canvas.style.width = "";
      canvas.style.height = "";

      const rawDpr = window.devicePixelRatio || 1;
      const dpr = IS_MOBILE ? Math.min(rawDpr, 2) : rawDpr;
      const rect = canvas.getBoundingClientRect();
      const displayWidth  = rect.width;
      const displayHeight = rect.height;

      canvas.width  = Math.max(1, Math.round(displayWidth  * dpr));
      canvas.height = Math.max(1, Math.round(displayHeight * dpr));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      CW = displayWidth;
      CH = displayHeight;
    }
    scaleCanvasForDPR();
    window.addEventListener("resize", () => {
      scaleCanvasForDPR();
      resetPositions();
    });

    const themeToggle = document.getElementById("themeToggle");
    const helpBtn = document.getElementById("helpBtn");
    const startBtn = document.getElementById("startBtn");
    const startBigBtn = document.getElementById("startBigBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const resumeBtn = document.getElementById("resumeBtn");
    const resumeBtn2 = document.getElementById("resumeBtn2");
    const resetBtn = document.getElementById("resetBtn");
    const playAgainBtn = document.getElementById("playAgainBtn");

    const settingsBtn = document.getElementById("settingsBtn");
    const settingsBackdrop = document.getElementById("settingsBackdrop");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");

    const ballSpeedInput = document.getElementById("ballSpeed");
    const aiDiffInput = document.getElementById("aiDiff");
    const targetScoreInput = document.getElementById("targetScore");
    const modeSelect = document.getElementById("modeSelect");
    const colorInput = document.getElementById("color");
    const soundToggle = document.getElementById("soundToggle");

    const scorePlayerEl = document.getElementById("scorePlayer");
    const scoreAIEl = document.getElementById("scoreAI");
    const targetLabel = document.getElementById("targetLabel");
    const highLabel = document.getElementById("highLabel");

    const hintbar = document.getElementById("hintbar");
    const labelP1 = document.getElementById("labelP1");
    const labelP2 = document.getElementById("labelP2");
    const nameP1Input = document.getElementById("nameP1");
    const nameP2Input = document.getElementById("nameP2");

    const menuOverlay = document.getElementById("menuOverlay");
    const pauseOverlay = document.getElementById("pauseOverlay");
    const gameoverOverlay = document.getElementById("gameoverOverlay");
    const winnerText = document.getElementById("winnerText");
    const summaryText = document.getElementById("summaryText");

    let audioCtx = null;
    function initAudio() {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    function beep(freq=440, duration=0.07, type="square", volume=0.18) {
      if (!audioCtx || !soundToggle.checked) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      setTimeout(()=>osc.stop(), duration*1000);
    }

    const LS_KEY = "pong_pro_high_score";
    const LS_SETTINGS_KEY = "pong_pro_settings_v2";

    const Physics = {
      maxBallSpeed: 980,
      paddleHitRamp: 1.035,
      spinFactor: 0.22,
      minHorizontalFactor: 0.14,
      maxBounceAngle: Math.PI / 3
    };

    const State = {
      mode: "menu",
      gameType: "ai",
      baseHint: "",
      lastTime: performance.now(),
      playerScore: 0, aiScore: 0,
      targetScore: parseInt(targetScoreInput.value, 10),
      highScore: parseInt(localStorage.getItem(LS_KEY)||"0",10),
      serveTimer: 0,
      serveDir: "up",
      ball: null,
      trail: [],
      player: { w: 130, h: 14, x: 0, y: 0, prevX: 0, vx: 0, speed: 560, color: "#f8fafc" },
      ai: { w: 130, h: 14, x: 0, y: 0, prevX: 0, vx: 0, color: "#f8fafc", speed: 420, reactionDelay: 0.2, reactionTimer: 0, errorStd: 30, targetX: 0 },
      input: { left:false, right:false, p2left:false, p2right:false },
      mouse: { inside:false, x:null },
      aim: { p1x: null, p2x: null, p1type: null, p2type: null },
      pointers: {
        active: Object.create(null)
      }
    };

    function lerp(a, b, t) { return a + (b - a) * t; }
    function smoothAlpha(dt, tau = 0.055) {
      if (!Number.isFinite(dt) || dt <= 0) return 1;
      const a = 1 - Math.exp(-dt / tau);
      return clamp(a, 0, 1);
    }

    function clientToCanvas(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function recomputeAimFromPointers() {
      let p1 = null;
      let p2 = null;
      for (const id in State.pointers.active) {
        const p = State.pointers.active[id];
        if (!p) continue;
        if (p.role === "p1") {
          if (!p1 || p.t > p1.t) p1 = p;
        } else if (p.role === "p2") {
          if (!p2 || p.t > p2.t) p2 = p;
        }
      }
      State.aim.p1x = p1 ? p1.x : null;
      State.aim.p2x = p2 ? p2.x : null;
      State.aim.p1type = p1 ? p1.type : null;
      State.aim.p2type = p2 ? p2.type : null;
    }

    function saveSettings() {
      const settings = {
        theme: document.body.getAttribute("data-theme") || "dark",
        mode: modeSelect.value,
        ballSpeed: ballSpeedInput.value,
        aiDiff: aiDiffInput.value,
        targetScore: targetScoreInput.value,
        sound: soundToggle.checked,
        color: colorInput.value,
        nameP1: nameP1Input ? nameP1Input.value : "",
        nameP2: nameP2Input ? nameP2Input.value : ""
      };
      try { localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings)); } catch { }
    }

    function loadSettings() {
      let settings = null;
      try { settings = JSON.parse(localStorage.getItem(LS_SETTINGS_KEY) || "null"); } catch { settings = null; }
      if (!settings) return;

      if (settings.theme === "light" || settings.theme === "dark") {
        document.body.setAttribute("data-theme", settings.theme);
        themeToggle.checked = (settings.theme === "light");
      }

      if (settings.mode === "ai" || settings.mode === "local2") modeSelect.value = settings.mode;
      if (typeof settings.ballSpeed === "string") ballSpeedInput.value = settings.ballSpeed;
      if (typeof settings.aiDiff === "string") aiDiffInput.value = settings.aiDiff;
      if (typeof settings.targetScore === "string") targetScoreInput.value = settings.targetScore;
      if (typeof settings.sound === "boolean") soundToggle.checked = settings.sound;
      if (typeof settings.color === "string") colorInput.value = settings.color;

      if (nameP1Input && typeof settings.nameP1 === "string") nameP1Input.value = settings.nameP1;
      if (nameP2Input && typeof settings.nameP2 === "string") nameP2Input.value = settings.nameP2;
    }

    function getPlayerName(which) {
      if (which === 1) {
        const v = nameP1Input ? nameP1Input.value.trim() : "";
        return v || "لاعب 1";
      }
      const v = nameP2Input ? nameP2Input.value.trim() : "";
      return v || "لاعب 2";
    }

    function updateHintbar() {
      const extra = State.serveTimer > 0
        ? ` • إرسال بعد ${Math.ceil(State.serveTimer)} (Space للإرسال)`
        : "";
      hintbar.textContent = (State.baseHint || "") + extra;
    }

    function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
    function rndGauss(std=1) {
      const u = 1-Math.random(), v=1-Math.random();
      return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*std;
    }

    function resetPositions() {
      State.player.x = CW/2 - State.player.w/2;
      State.player.prevX = State.player.x;
      State.player.vx = 0;
      State.player.y = CH - 28;
      State.ai.x = CW/2 - State.ai.w/2;
      State.ai.prevX = State.ai.x;
      State.ai.vx = 0;
      State.ai.y = 14;
    }

    function spawnBall(dir="up") {
      const speed = parseFloat(ballSpeedInput.value);
      const spread = Math.PI/3;
      const base = dir==="up" ? -Math.PI/2 : Math.PI/2;
      const a = base + (Math.random()*spread - spread/2);
      State.ball = {
        x: CW/2,
        y: CH/2,
        r: 10,
        color: colorInput.value,
        vx: Math.cos(a)*speed,
        vy: Math.sin(a)*speed
      };
      State.trail.length = 0;
    }

    function scheduleServe(dir) {
      State.ball = null;
      State.trail.length = 0;
      State.serveDir = dir;
      State.serveTimer = 0.9;
      updateHintbar();
    }

    function applyAIDifficulty() {
      const d = parseInt(aiDiffInput.value, 10);
      State.ai.speed = 280 + d*42;
      State.ai.reactionDelay = Math.max(0.05, 0.35 - d*0.03);
      State.ai.errorStd = Math.max(6, 60 - d*5);
    }

    function clampBallSpeed(b) {
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > Physics.maxBallSpeed) {
        const k = Physics.maxBallSpeed / speed;
        b.vx *= k;
        b.vy *= k;
      }
    }

    function reflectPredictX(x, r) {
      if (x < r) return r + (r - x);
      if (x > CW - r) return (CW - r) - (x - (CW - r));
      return x;
    }

    function predictBallXAtY(b, targetY) {
      if (!b || b.vy === 0) return b ? b.x : CW/2;

      const r = b.r;
      let x = b.x, y = b.y;
      let vx = b.vx, vy = b.vy;

      const tToY = (targetY - y) / vy;
      if (tToY <= 0 || !Number.isFinite(tToY)) return x;

      let tLeft = tToY;
      for (let i = 0; i < 10 && tLeft > 0; i++) {
        let tWall = Infinity;
        if (vx > 0) tWall = ((CW - r) - x) / vx;
        else if (vx < 0) tWall = (r - x) / vx;

        if (!Number.isFinite(tWall) || tWall <= 0) tWall = Infinity;

        if (tWall >= tLeft) {
          x = x + vx * tLeft;
          y = y + vy * tLeft;
          break;
        }

        x = x + vx * tWall;
        y = y + vy * tWall;
        if (x <= r) { x = r; vx = Math.abs(vx); }
        else if (x >= CW - r) { x = CW - r; vx = -Math.abs(vx); }
        tLeft -= tWall;
      }

      x = reflectPredictX(x, r);
      return clamp(x, r, CW - r);
    }

    function clear() {
      ctx.clearRect(0, 0, CW, CH);

      const grd = ctx.createLinearGradient(0, 0, 0, CH);
      grd.addColorStop(0, "rgba(255,255,255,0.04)");
      grd.addColorStop(1, "rgba(255,255,255,0.02)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, CW, CH);
    }

    function drawRoundedRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.arcTo(x+w, y, x+w, y+h, r);
      ctx.arcTo(x+w, y+h, x, y+h, r);
      ctx.arcTo(x, y+h, x, y, r);
      ctx.arcTo(x, y, x+w, y, r);
      ctx.closePath();
    }

    function drawPaddle(p) {
      ctx.fillStyle = p.color;
      drawRoundedRect(p.x, p.y, p.w, p.h, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.stroke();
    }

    function drawBall(b) {
      if (State.trail.length > 1) {
        for (let i = 0; i < State.trail.length; i++) {
          const t = i / State.trail.length;
          const p = State.trail[i];
          ctx.globalAlpha = 0.05 + t*0.12;
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 8*(t), 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = IS_MOBILE ? 10 : 18;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.closePath();
      const grad = ctx.createRadialGradient(b.x - b.r/3, b.y - b.r/3, b.r/4, b.x, b.y, b.r);
      grad.addColorStop(0, "#fff");
      grad.addColorStop(0.25, b.color);
      grad.addColorStop(1, "rgba(10,10,10,0.9)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    function drawHUD() {
      if (State.mode === "menu") { }
      else if (State.mode === "paused") { }
      else if (State.mode === "gameover") { }
    }

    function updatePlayer(dt) {
      const p = State.player;
      const prevX = p.x;
      let vx = 0;
      if (State.input.left) vx -= p.speed;
      if (State.input.right) vx += p.speed;
      p.x += vx * dt;

      const pointerX = State.aim.p1x;
      const mouseX = (State.mouse.inside && State.mouse.x != null) ? State.mouse.x : null;
      const inputX = (pointerX != null) ? pointerX : mouseX;
      if (inputX != null) {
        const target = inputX - p.w/2;
        const isTouch = (pointerX != null) && (State.aim.p1type === "touch");
        if (isTouch) p.x = target;
        else p.x = lerp(p.x, target, smoothAlpha(dt));
      }
      p.x = clamp(p.x, 0, CW - p.w);
      p.y = CH - 26;

      p.vx = dt > 0 ? (p.x - prevX) / dt : 0;
      p.prevX = p.x;
    }

    function updateP2(dt) {
      const p2 = State.ai;
      const prevX = p2.x;
      let vx = 0;
      if (State.input.p2left) vx -= p2.speed;
      if (State.input.p2right) vx += p2.speed;
      p2.x += vx * dt;

      const inputX = State.aim.p2x;
      if (inputX != null) {
        const target = inputX - p2.w/2;
        const isTouch = (State.aim.p2type === "touch");
        if (isTouch) p2.x = target;
        else p2.x = lerp(p2.x, target, smoothAlpha(dt));
      }
      p2.x = clamp(p2.x, 0, CW - p2.w);
      p2.y = 14;

      p2.vx = dt > 0 ? (p2.x - prevX) / dt : 0;
      p2.prevX = p2.x;
    }

    function updateAI(dt) {
      const ai = State.ai, b = State.ball;

      const prevX = ai.x;
      ai.reactionTimer -= dt;
      if (ai.reactionTimer <= 0) {
        ai.reactionTimer = ai.reactionDelay;

        if (b && b.vy < 0) {
          const interceptY = ai.y + ai.h + b.r;
          const predictedX = predictBallXAtY(b, interceptY);
          const noisy = predictedX + rndGauss(ai.errorStd);
          ai.targetX = clamp(noisy - ai.w/2, 0, CW - ai.w);
        } else {
          ai.targetX = clamp(CW/2 - ai.w/2, 0, CW - ai.w);
        }
      }
      const dir = Math.sign(ai.targetX - ai.x);
      ai.x += dir * ai.speed * dt;
      ai.x = clamp(ai.x, 0, CW - ai.w);
      ai.y = 14;

      ai.vx = dt > 0 ? (ai.x - prevX) / dt : 0;
      ai.prevX = ai.x;
    }

    function handleWallBounce(b) {
      if (b.x - b.r <= 0) { b.x = b.r; b.vx = Math.abs(b.vx); beep(220,0.05,"sine",0.15); }
      else if (b.x + b.r >= CW) { b.x = CW - b.r; b.vx = -Math.abs(b.vx); beep(220,0.05,"sine",0.15); }
    }

    function collideWithPaddle(b, p, isPlayer) {
      const horiz = b.x + b.r >= p.x && b.x - b.r <= p.x + p.w;
      const vert = isPlayer
        ? (b.y + b.r >= p.y && b.y - b.r <= p.y + p.h && b.vy > 0)
        : (b.y - b.r <= p.y + p.h && b.y + b.r >= p.y && b.vy < 0);
      if (horiz && vert) {
        const rel = (b.x - (p.x + p.w/2)) / (p.w/2);
        let speed = Math.hypot(b.vx, b.vy) * Physics.paddleHitRamp;
        const center = isPlayer ? -Math.PI/2 : Math.PI/2;
        let angle = center + rel * Physics.maxBounceAngle;

        const horizFactor = Math.abs(Math.cos(angle));
        if (horizFactor < Physics.minHorizontalFactor) {
          const nudge = (rel === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(rel)) * 0.18;
          angle += nudge;
        }

        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;

        b.vx += (p.vx || 0) * Physics.spinFactor;
        clampBallSpeed(b);
        b.y = isPlayer ? (p.y - b.r) : (p.y + p.h + b.r);
        beep(isPlayer?540:430, 0.06, "square", 0.2);
      }
    }

    function updateBall(dt) {
      const b = State.ball;
      b.x += b.vx*dt;
      b.y += b.vy*dt;
      handleWallBounce(b);
      collideWithPaddle(b, State.player, true);
      collideWithPaddle(b, State.ai, false);

      State.trail.push({x:b.x, y:b.y});
      const maxTrail = IS_MOBILE ? 12 : 20;
      if (State.trail.length > maxTrail) State.trail.shift();

      if (b.y - b.r <= -8) {
        State.playerScore++;
        if (State.playerScore > State.highScore) {
          State.highScore = State.playerScore;
          localStorage.setItem(LS_KEY, String(State.highScore));
        }
        beep(660, 0.12, "triangle", 0.22);
        checkWinOrServe("down");
      } else if (b.y + b.r >= CH + 8) {
        State.aiScore++;
        beep(300, 0.12, "sawtooth", 0.22);
        checkWinOrServe("up");
      }
    }

    function checkWinOrServe(dir) {
      const p = State.playerScore;
      const a = State.aiScore;
      const t = State.targetScore;
      const reached = (p >= t || a >= t);
      const won = reached;

      if (won) {
        State.mode = "gameover";
        showGameOver();
      } else {
        scheduleServe(dir);
      }
      updateScoreDOM();
    }

    function loop(now) {
      const dt = Math.min((now - State.lastTime)/1000, 0.033);
      State.lastTime = now;

      clear();

      if (State.mode === "playing") {
        updatePlayer(dt);
        if (State.gameType === "local2") updateP2(dt);
        else updateAI(dt);

        if (State.serveTimer > 0) {
          State.serveTimer = Math.max(0, State.serveTimer - dt);
          if (State.serveTimer === 0 && !State.ball) {
            spawnBall(State.serveDir);
          }
          updateHintbar();
        }

        if (State.ball) updateBall(dt);
      }

      drawPaddle(State.ai);
      drawPaddle(State.player);
      if (State.ball) drawBall(State.ball);
      drawHUD();

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    function updateScoreDOM() {
      scorePlayerEl.textContent = State.playerScore;
      scoreAIEl.textContent = State.aiScore;
      targetLabel.textContent = State.targetScore;
      highLabel.textContent = State.highScore;
    }

    function showMenu() {
      menuOverlay.classList.add("show");
      pauseOverlay.classList.remove("show");
      gameoverOverlay.classList.remove("show");
    }
    function hideOverlays() {
      menuOverlay.classList.remove("show");
      pauseOverlay.classList.remove("show");
      gameoverOverlay.classList.remove("show");
    }
    function showPause() { pauseOverlay.classList.add("show"); }
    function showGameOver() {
      const isLocal = State.gameType === "local2";
      const p1Name = isLocal ? getPlayerName(1) : "أنت";
      const p2Name = isLocal ? getPlayerName(2) : "الذكاء الاصطناعي";

      const p1Score = State.playerScore;
      const p2Score = State.aiScore;
      const p1Win = p1Score > p2Score;
      const winnerName = p1Win ? p1Name : p2Name;

      winnerText.textContent = isLocal
        ? `فاز ${winnerName} 🏆`
        : (p1Win ? "أنت الفائز! 🎉" : `فاز ${p2Name} 🤖`);

      summaryText.textContent = isLocal
        ? `النتيجة — ${p1Name}: ${p1Score} • ${p2Name}: ${p2Score}`
        : `النتيجة — أنت: ${p1Score} • ${p2Name}: ${p2Score}`;
      gameoverOverlay.classList.add("show");
    }

    function applyGameTypeUI() {
      State.gameType = modeSelect.value === "local2" ? "local2" : "ai";

      document.body.classList.toggle("local2", State.gameType === "local2");

      if (labelP1) labelP1.textContent = getPlayerName(1);

      if (State.gameType === "local2") {
        if (labelP2) labelP2.textContent = getPlayerName(2);
        if (nameP2Input) nameP2Input.disabled = false;
      } else {
        if (labelP2) labelP2.textContent = "الذكاء الاصطناعي";
        if (nameP2Input) nameP2Input.disabled = true;
      }

      State.baseHint = State.gameType === "local2"
        ? "التحكم: أنت ← → أو A/D • لاعب 2: J/L • لمس: أسفل للمضرب السفلي وأعلى للمضرب العلوي • P إيقاف مؤقت"
        : "التحكم: ← → أو A/D • الماوس/اللمس لتحريك المضرب • P إيقاف مؤقت";
      updateHintbar();

      aiDiffInput.disabled = (State.gameType === "local2");
    }

    loadSettings();
    resetPositions();
    updateScoreDOM();
    showMenu();
    applyGameTypeUI();
    saveSettings();

    if (nameP1Input) {
      nameP1Input.addEventListener("input", () => {
        if (labelP1) labelP1.textContent = getPlayerName(1);
        saveSettings();
      });
    }
    if (nameP2Input) {
      nameP2Input.addEventListener("input", () => {
        if (State.gameType === "local2" && labelP2) labelP2.textContent = getPlayerName(2);
        saveSettings();
      });
    }

    function startGame() {
      initAudio();
      State.mode = "playing";
      State.playerScore = 0; State.aiScore = 0;
      State.targetScore = parseInt(targetScoreInput.value, 10);
      State.highScore = parseInt(localStorage.getItem(LS_KEY)||"0",10);
      applyGameTypeUI();
      if (State.gameType === "ai") applyAIDifficulty();
      resetPositions();
      scheduleServe(Math.random()<0.5 ? "up" : "down");
      updateScoreDOM();
      hideOverlays();
      State.lastTime = performance.now();
    }

    startBtn.addEventListener("click", startGame);
    startBigBtn.addEventListener("click", startGame);
    playAgainBtn.addEventListener("click", startGame);

    pauseBtn.addEventListener("click", () => {
      if (State.mode === "playing") { State.mode = "paused"; showPause(); }
    });
    document.getElementById("resumeBtn").addEventListener("click", () => {
      if (State.mode === "paused") { State.mode = "playing"; hideOverlays(); State.lastTime = performance.now(); }
    });
    resumeBtn2.addEventListener("click", () => {
      if (State.mode === "paused") { State.mode = "playing"; hideOverlays(); State.lastTime = performance.now(); }
    });

    resetBtn.addEventListener("click", () => {
      State.mode = "menu";
      State.playerScore = 0; State.aiScore = 0;
      State.ball = null; State.trail.length = 0;
      resetPositions();
      updateScoreDOM();
      showMenu();
    });

    helpBtn.addEventListener("click", () => {
      const msg = State.gameType === "local2"
        ? "وضع لاعبَين: اللاعب 1 (أسفل): أسهم ←/→ أو A/D. اللاعب 2 (أعلى): J/L.\nعلى الهاتف: المس في النصف السفلي لتحريك المضرب السفلي، والمس في النصف العلوي لتحريك المضرب العلوي (يمكن استعمال إصبعين).\nمفتاح P للإيقاف المؤقت.\nاضبط سرعة الكرة وهدف النقاط من لوحة الإعدادات."
        : "التحكم: أسهم ←/→ أو A/D لتحريك المضرب. يمكنك أيضًا التحريك بالماوس/اللمس داخل اللوحة.\nمفتاح P للإيقاف المؤقت.\nاضبط الصعوبة وسرعة الكرة وهدف النقاط من لوحة الإعدادات.";
      alert(msg);
    });

    themeToggle.addEventListener("change", (e) => {
      document.body.setAttribute("data-theme", e.target.checked ? "light" : "dark");
      saveSettings();
    });

    colorInput.addEventListener("input", () => { if (State.ball) State.ball.color = colorInput.value; saveSettings(); });
    ballSpeedInput.addEventListener("input", () => { saveSettings(); });
    aiDiffInput.addEventListener("input", () => { applyAIDifficulty(); saveSettings(); });
    modeSelect.addEventListener("change", () => {
      applyGameTypeUI();
      saveSettings();
    });
    targetScoreInput.addEventListener("input", () => {
      State.targetScore = parseInt(targetScoreInput.value, 10);
      targetLabel.textContent = State.targetScore;
      saveSettings();
    });
    soundToggle.addEventListener("change", saveSettings);

    function setSettingsOpen(open) {
      document.body.classList.toggle("show-settings", !!open);
      if (!settingsBackdrop) return;
      settingsBackdrop.hidden = !open;
      settingsBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }

    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        const open = !document.body.classList.contains("show-settings");
        setSettingsOpen(open);
      });
    }
    if (settingsBackdrop) {
      settingsBackdrop.addEventListener("click", () => setSettingsOpen(false));
    }
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener("click", () => setSettingsOpen(false));
    }

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (e.key === "Escape") {
        if (document.body.classList.contains("show-settings")) setSettingsOpen(false);
      }
      if (e.key === "ArrowLeft" || k === "a") State.input.left = true;
      if (e.key === "ArrowRight" || k === "d") State.input.right = true;
      if (State.gameType === "local2") {
        if (k === "j") State.input.p2left = true;
        if (k === "l") State.input.p2right = true;
      }
      if (e.code === "Space") {
        if (State.mode === "playing" && State.serveTimer > 0) {
          State.serveTimer = 0;
          spawnBall(State.serveDir);
          updateHintbar();
        }
      }
      if (k === "p") {
        if (State.mode === "playing") { State.mode = "paused"; showPause(); }
        else if (State.mode === "paused") { State.mode = "playing"; hideOverlays(); State.lastTime = performance.now(); }
      }
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (e.key === "ArrowLeft" || k === "a") State.input.left = false;
      if (e.key === "ArrowRight" || k === "d") State.input.right = false;
      if (k === "j") State.input.p2left = false;
      if (k === "l") State.input.p2right = false;
    });

    canvas.addEventListener("mouseenter", () => { State.mouse.inside = true; });
    canvas.addEventListener("mouseleave", () => {
      if (Object.keys(State.pointers.active).length > 0) return;
      State.mouse.inside = false;
      State.mouse.x = null;
    });
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      State.mouse.x = e.clientX - r.left;
    });

    function pointerRoleFromPos(pos) {
      if (State.gameType !== "local2") return "p1";
      return (pos.y > CH/2) ? "p1" : "p2";
    }

    function handlePointerDown(e) {
      if (e.pointerType === "touch") e.preventDefault();
      const pos = clientToCanvas(e);
      State.mouse.inside = true;

      const role = pointerRoleFromPos(pos);
      State.pointers.active[String(e.pointerId)] = { role, x: pos.x, y: pos.y, t: performance.now(), type: e.pointerType || "unknown" };
      try { canvas.setPointerCapture(e.pointerId); } catch { }

      if (role === "p1") {
        State.player.x = clamp(pos.x - State.player.w/2, 0, CW - State.player.w);
      }
      recomputeAimFromPointers();
    }

    function handlePointerMove(e) {
      if (e.pointerType === "touch") e.preventDefault();
      const key = String(e.pointerId);
      const p = State.pointers.active[key];
      if (!p) return;
      const pos = clientToCanvas(e);
      p.x = pos.x;
      p.y = pos.y;
      p.t = performance.now();
      p.type = e.pointerType || p.type || "unknown";
      recomputeAimFromPointers();
    }

    function handlePointerEnd(e) {
      const key = String(e.pointerId);
      if (State.pointers.active[key]) {
        try { canvas.releasePointerCapture(e.pointerId); } catch { }
        delete State.pointers.active[key];
        recomputeAimFromPointers();
      }
      if (Object.keys(State.pointers.active).length === 0) {
        State.mouse.inside = false;
        State.mouse.x = null;
      }
    }

    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
    canvas.addEventListener("pointermove", handlePointerMove, { passive: false });
    canvas.addEventListener("pointerup", handlePointerEnd);
    canvas.addEventListener("pointercancel", handlePointerEnd);