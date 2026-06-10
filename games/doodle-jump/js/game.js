"use strict";

class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = input;
    this.player = new Player();
    this.particles = new Particles();
    this.high = parseInt(Store.get("dj_high", "0"), 10) || 0;
    this.state = "start";
    this.reset();
  }

  // ----- difficulty -------------------------------------------------------
  rowDifficulty(worldY) {
    const depth = Math.max(0, this.startY - worldY);
    return clamp(depth / 22000, 0, 1);
  }

  reset() {
    this.player.reset();
    this.startY = this.player.y;
    this.cameraY = 0;
    this.startCameraY = this.cameraY;
    this.bestY = this.player.y;
    this.score = 0;
    this.shootCd = 0;
    this.overTimer = 0;
    this.paused = false;

    this.platforms = [];
    this.enemies = [];
    this.bullets = [];
    this.gears = [];          // jetpacks/propellers that have fallen off
    this.particles.list = [];
    this.death = null;

    this.lastType = PT.GREEN;
    this.lastEnemyY = Infinity;

    // Guaranteed starter platform directly under the player
    const starter = new Platform(CONFIG.W / 2 - CONFIG.PLAT_W / 2, CONFIG.H - 100, PT.GREEN);
    this.platforms.push(starter);
    this.spawnCursorY = starter.y - randInt(60, 85);

    // Track the last *landable* platform so each new row is placed within
    // horizontal reach of it (see reachableX / spawnRow).
    this.lastPlatX = CONFIG.W / 2;
    this.lastPlatY = starter.y;

    this.ensureContent();
  }

  start() {
    this.reset();
    this.state = "play";
  }

  // ----- spawning ---------------------------------------------------------
  ensureContent() {
    while (this.spawnCursorY > this.cameraY - CONFIG.H) {
      this.spawnRow(this.spawnCursorY);
      const t = this.rowDifficulty(this.spawnCursorY);
      const gap = randInt(54, Math.round(80 + 46 * t));
      this.spawnCursorY -= gap;
    }
    // Drop content that has scrolled below the view. For vertically-moving
    // (gray) platforms, keep them as long as the TOP of their travel range
    // could still scroll back into view — only cull once their whole cycle is
    // permanently below the screen and thus unreachable.
    const cut = this.cameraY + CONFIG.H + 80;
    this.platforms = this.platforms.filter((p) => {
      if (p.dead) return false;
      // Account for a booster/power-up riding on top (it sits above the platform
      // and so stays visible a little longer than the platform itself).
      const base = (p.type === PT.GRAY) ? (p.baseY - p.range) : p.y;
      return base - p.gadgetHeight < cut;
    });
    this.enemies = this.enemies.filter((e) => e.y < cut && !e.dead);
  }

  pickType(t) {
    // After an unreliable platform, force a dependable one so the run is fair.
    const lastUnreliable = [PT.WHITE, PT.YELLOW, PT.BROWN].includes(this.lastType);
    if (lastUnreliable) {
      return weightedPick({ [PT.GREEN]: 6, [PT.BLUE]: 2 + 3 * t, [PT.GRAY]: 1 + 2 * t });
    }
    return weightedPick({
      [PT.GREEN]:  62 - 42 * t,
      [PT.BLUE]:    6 + 18 * t,
      [PT.WHITE]:   5 + 14 * t,
      [PT.GRAY]:    2 + 12 * t,
      [PT.YELLOW]:  1 + 9 * t,
      [PT.BROWN]:   1 + 12 * t,
    });
  }

  // Pick an x for a platform whose centre is within horizontal reach of the
  // previous landable platform. Reach scales with the vertical gap (a bigger
  // jump buys more air time) and the player wraps around the screen edges, so
  // the target is wrapped into range before being clamped on-screen.
  reachableX(lastCenter, gap) {
    const reach = clamp(70 + gap * 0.8, 80, 175);
    let c = lastCenter + rand(-reach, reach);
    c = ((c % CONFIG.W) + CONFIG.W) % CONFIG.W; // wrap into [0, W)
    return clamp(c - CONFIG.PLAT_W / 2, 0, CONFIG.W - CONFIG.PLAT_W);
  }

  // Pick an x for an enemy of width `ew` that doesn't sit horizontally above a
  // landable platform on this row — otherwise bouncing off that platform would
  // launch the player straight into the enemy's side with no escape.
  enemyX(ew, y) {
    const rowPlats = this.platforms.filter(
      (pl) => pl.type !== PT.BROWN && pl.solid && Math.abs(pl.y - y) < 40
    );
    for (let i = 0; i < 16; i++) {
      const cand = rand(20, CONFIG.W - ew - 20);
      const clear = rowPlats.every((pl) => cand + ew < pl.x - 6 || cand > pl.x + pl.w + 6);
      if (clear) return cand;
    }
    // Fallback: put it on the opposite half from the first landable platform.
    const pl = rowPlats[0];
    if (pl && pl.x + pl.w / 2 > CONFIG.W / 2) return clamp(rand(10, CONFIG.W * 0.4 - ew), 10, CONFIG.W - ew);
    return clamp(rand(CONFIG.W * 0.6, CONFIG.W - ew - 10), 10, CONFIG.W - ew);
  }

  // Is it fair to spawn a fresh enemy right now? A new enemy only scrolls into
  // view ~CAMERA_LINE*H above the player, so it must never be planted where the
  // player can't see and react to it in time. Three cases:
  //   - Power-up flight: allowed. The player is invincible and simply passes
  //     over anything that appears, so enemies may still populate the climb.
  //   - The grace window right after a power-up ends: NOT allowed. This is the
  //     vulnerable hand-off back to normal play, so we don't plant a fresh enemy
  //     (especially an unshootable black hole) in the spot the player drops into.
  //   - Otherwise: allowed only at normal climb speed. While rocketing up faster
  //     than a normal jump (spring/trampoline launch or stomp boost) the player
  //     would blow past the reveal point before reacting, so the enemy is
  //     deferred to a later row once the climb settles.
  // Either way the enemy isn't deleted — lastEnemyY is left open so it spawns
  // higher up — and existing enemies and ordinary-platform play are unaffected.
  enemySpawnIsFair() {
    const p = this.player;
    if (p.powerup) return true;
    if (p.grace > 0) return false;
    return -p.vy <= CONFIG.JUMP_V;
  }

  spawnRow(y) {
    const t = this.rowDifficulty(y);
    const type = this.pickType(t);

    // Place this row's landing target within reach of the last one.
    const gap = (this.lastPlatY != null) ? (this.lastPlatY - y) : 70;
    const rx = this.reachableX(this.lastPlatX, gap);

    if (type === PT.BROWN) {
      // A brown platform is a fake that breaks when you land on it. The row
      // still gets a dependable companion at the reachable spot so it's never a
      // forced death, and that companion (not the fake) is the path we track for
      // the next row.
      const safeType = chance(0.7) ? PT.GREEN : PT.BLUE;
      this.platforms.push(new Platform(rx, y, safeType));
      this.lastPlatX = rx + CONFIG.PLAT_W / 2;

      // Scatter the fake instead of stamping it level with the companion: nudge
      // it off the row line by a guaranteed margin (so it never shares a height
      // with another platform) and give it a freely randomized x, kept clear of
      // the companion's column so the two never read as a stacked pair.
      const fakeY = y + (chance(0.5) ? -1 : 1) * rand(14, 26);
      let fakeX;
      do { fakeX = rand(0, CONFIG.W - CONFIG.PLAT_W); }
      while (fakeX + CONFIG.PLAT_W > rx - 10 && fakeX < rx + CONFIG.PLAT_W + 10);
      this.platforms.push(new Platform(fakeX, fakeY, PT.BROWN));
    } else {
      const plat = new Platform(rx, y, type);
      // Boosters and power-ups ride on top of dependable platforms (never on
      // fakes / vanishing ones). At most one gadget per platform.
      if ([PT.GREEN, PT.BLUE, PT.GRAY].includes(type)) {
        const roll = Math.random();
        if (roll < 0.05) plat.booster = new Booster(plat, "spring");
        else if (roll < 0.072) plat.booster = new Booster(plat, "trampoline");
        else if (roll < 0.082) plat.powerup = new PowerUp(plat, "jetpack");
        else if (roll < 0.105) plat.powerup = new PowerUp(plat, "propeller");
        else if (roll < 0.125) plat.powerup = new PowerUp(plat, "springy");
      }
      this.platforms.push(plat);
      this.lastPlatX = rx + CONFIG.PLAT_W / 2;
    }
    this.lastType = type;
    this.lastPlatY = y;

    // Enemies, spaced out, only once the climb gets going. Skipped while the
    // player is rocketing upward (booster/stomp launch) so a fresh enemy never
    // pops into their blind spot with no time to react — it'll spawn on a later
    // row once the climb slows. lastEnemyY stays put so that retry can happen.
    const depth = this.startY - y;
    if (depth > 1400 && Math.abs(y - this.lastEnemyY) > 360 && this.enemySpawnIsFair()) {
      const r = Math.random();
      let kind = null;
      if (r < 0.03 + 0.06 * t) kind = "monster";
      else if (r < 0.04 + 0.10 * t) kind = "ufo";
      else if (depth > 4000 && r < 0.05 + 0.13 * t) kind = "blackhole";
      if (kind) {
        const ew = kind === "ufo" ? 64 : kind === "blackhole" ? 56 : 50;
        const ex = this.enemyX(ew, y);
        this.enemies.push(new Enemy(ex, y - 46, kind));
        this.lastEnemyY = y;
      }
    }
  }

  // Auto-pause request from outside (window blur / tab hidden).
  requestPause() {
    if (this.state === "play") this.paused = true;
  }

  // ----- main loop --------------------------------------------------------
  update(dt) {
    // Pause toggle (P / Esc). Drain the flag every frame so it can't queue up
    // while on the start/over screens and then fire on the first play frame.
    const pauseToggled = this.input.consumePauseToggle();
    if (this.state === "play" && pauseToggled) this.paused = !this.paused;
    if (this.paused) {
      if (this.state !== "play") this.paused = false; // safety: only pause in-play
      Sfx.setFlightLoop(null); // silence the flight drone while paused
      this.input.consumeShots();
      this.input.consumeAction();
      return;
    }

    if (this.state === "dying") {
      Sfx.setFlightLoop(null);
      this.updateDying(dt);
      for (const gr of this.gears) gr.update(dt);
      this.particles.update(dt);
      this.input.consumeShots();
      this.input.consumeAction();
      return;
    }
    if (this.state !== "play") {
      Sfx.setFlightLoop(null);
      if (this.overTimer > 0) this.overTimer -= dt;
      if (this.input.consumeAction() && this.overTimer <= 0) this.start();
      this.input.consumeShots();
      return;
    }

    const p = this.player;
    p.update(dt, this.input);
    // Keep the looping flight drone in sync with the active power-up: it starts
    // on pickup, stops the moment the gear expires, and (via the early returns
    // above) also stops on pause / death / game-over.
    Sfx.setFlightLoop(p.powerup ? p.powerup.kind : null);

    // A finished power-up falls off the player, keeping their momentum
    if (p.droppedGear) {
      this.spawnDroppedGear(p, p.droppedGear);
      p.droppedGear = null;
    }
    for (const gr of this.gears) gr.update(dt);

    for (const plat of this.platforms) plat.update(dt);
    // Yellow platforms that finished their fade explode into particles
    for (const plat of this.platforms) {
      if (plat.justExploded) {
        plat.justExploded = false;
        this.particles.burst(plat.x + plat.w / 2, plat.y + plat.h / 2, "#ff5a3c", 16, 240);
        Sfx.break_();
      }
    }
    for (const e of this.enemies) e.update(dt);
    for (const b of this.bullets) b.update(dt);
    this.particles.update(dt);

    this.handleShooting(dt);
    this.handleLanding();
    this.handlePowerups();
    this.handleSpringyDrop();
    this.handleEnemies();
    this.handleBullets();
    this.updateYellow();

    // Camera follows the player upward only
    const target = p.y - CONFIG.CAMERA_LINE * CONFIG.H;
    if (target < this.cameraY) this.cameraY = target;

    // Score from the highest point reached
    if (p.y < this.bestY) this.bestY = p.y;
    this.score = Math.floor((this.startY - this.bestY) / 10);

    this.ensureContent();

    // Bullets that left the top of the view
    this.bullets = this.bullets.filter((b) => !b.dead && b.y - this.cameraY > -30 && b.y - this.cameraY < CONFIG.H + 60);
    // Dropped gear that fell off the bottom
    this.gears = this.gears.filter((gr) => gr.y - this.cameraY < CONFIG.H + 80);

    // Death: fell below the screen
    if (p.y - this.cameraY > CONFIG.H + 10) this.die("fall");
  }

  handleShooting(dt) {
    if (this.shootCd > 0) this.shootCd -= dt;
    const shots = this.input.consumeShots();
    // No shooting while riding a jetpack/propeller (hands are full).
    if (this.player.powerup) return;
    if (!shots.length || this.shootCd > 0) return;

    const shot = shots[0];
    const m = this.player.muzzle();
    let dx = 0, dy = -1;
    if (shot) {
      dx = shot.x - m.x;
      dy = shot.y - (m.y - this.cameraY);
      dy = Math.min(dy, -10); // always fire upward
    }
    const dir = { x: dx, y: dy };
    this.bullets.push(new Bullet(m.x, m.y, dx, dy));
    this.player.noteShot(dir);
    this.shootCd = CONFIG.SHOOT_COOLDOWN;
    Sfx.shoot();
  }

  handleLanding() {
    const p = this.player;
    if (p.invincible) return;

    const prevBottom = p.prevY + p.h;
    const bottom = p.y + p.h;

    const colliding = [];
    for (const plat of this.platforms) {
      if (!plat.solid) continue;
      // A platform is unreachable only once it AND its gadget have scrolled below
      // the visible screen. While a booster/power-up still pokes above the bottom
      // edge it stays usable (the bounce snaps the player back on-screen).
      if (plat.topWithGadget - this.cameraY > CONFIG.H) continue;
      const horiz = p.x + p.w > plat.x && p.x < plat.x + plat.w;
      // Landing is decided in the platform's own frame of reference: the feet go
      // from above the top last frame (relPrev <= 0) to at/below it this frame
      // (relCur >= 0). This means "descending relative to the platform", so it
      // works no matter how fast the platform moves and even bounces a player
      // whose absolute vy is ~0 at the apex when a rising platform meets them —
      // while still never grabbing a player jumping up through it from below.
      const relPrev = prevBottom - plat.prevY;
      const relCur = bottom - plat.y;
      const cross = relPrev <= 0 && relCur >= 0;
      if (horiz && cross) colliding.push(plat);
    }
    if (!colliding.length) return;

    const bouncy = colliding.filter((c) => c.type !== PT.BROWN);
    if (bouncy.length) {
      // Land on the highest valid platform
      bouncy.sort((a, b) => a.y - b.y);
      const plat = bouncy[0];
      let launch = plat.onLand(p);
      if (plat.booster && plat.booster.hitsPlayer(p)) {
        // A booster (spring/trampoline) takes priority over spring shoes: it
        // supplies its own launch (a trampoline therefore still flips you the
        // full height) and this bounce does NOT spend a shoe charge.
        launch = plat.booster.velocity;
        plat.booster.bounce(); // play the squash/stretch animation
        if (plat.booster.kind === "trampoline") p.startFlip(); // do a front flip
        Sfx.spring();
        this.particles.burst(plat.booster.x + plat.booster.w / 2, plat.booster.y, "#888", 8, 150);
      } else if (p.springy > 0 && launch > 0) {
        // Spring shoes: a plain platform bounce launches as high as a spring and
        // spends one charge. (launch > 0 excludes fakes, which give no bounce.)
        launch = Math.max(launch, CONFIG.SPRING_V);
        p.springy--;
        Sfx.spring();
        this.particles.burst(p.x + p.w / 2, plat.y, "#e0457b", 8, 160);
        if (p.springy === 0) p.springyDropPending = true; // worn out -> drop near apex
      }
      p.y = plat.y - p.h;
      p.bounce(launch);
    } else {
      // Only fakes here -> they break and the player keeps falling
      for (const plat of colliding) {
        plat.onLand(p);
        this.particles.burst(plat.x + plat.w / 2, plat.y, "#8a5a2d", 8, 160);
      }
    }
  }

  // Spawn a falling jetpack/propeller where it was worn, carrying the player's
  // current velocity so it flies off naturally before dropping.
  spawnDroppedGear(p, kind) {
    let gx, gy;
    if (kind === "jetpack") {
      gx = p.facing >= 0 ? p.x + 4 : p.x + p.w - 4;
      gy = p.y + 24;
    } else {
      gx = p.x + p.w / 2;
      gy = p.y + 4;
    }
    this.gears.push(new DiscardedGear(kind, gx, gy, p.vx, p.vy));
  }

  // Once the final spring-shoe bounce slows to near its apex, the worn-out shoes
  // pop off the feet and tumble away below the player. Purely cosmetic.
  handleSpringyDrop() {
    const p = this.player;
    if (!p.springyDropPending) return;
    // Hold the shoes on through the climb; release them once the upward speed
    // has decayed to near the apex (or the player is already descending).
    if (p.vy >= CONFIG.SPRINGY_DROP_VY) {
      this.gears.push(new DiscardedGear("shoes", p.x + p.w / 2, p.y + p.h, p.vx * 0.5, 120));
      p.springyDropPending = false;
    }
  }

  handlePowerups() {
    const p = this.player;
    // No stacking of FLIGHT power-ups: ignore them while one is already active.
    // Spring shoes are not flight (they don't set p.powerup / invincibility), so
    // this guard still lets you grab a jetpack/propeller while wearing them.
    if (p.invincible) return;
    for (const plat of this.platforms) {
      const it = plat.powerup;
      if (!it || it.dead) continue;
      if (it.hits(p)) {
        if (it.kind === "springy") {
          p.giveSpringyShoes();
          this.particles.burst(it.x + it.w / 2, it.y, "#e0457b", 12, 200);
        } else {
          p.startPowerUp(it.kind, it.speed, it.duration);
          this.particles.burst(it.x + it.w / 2, it.y, it.kind === "jetpack" ? "#ff8c1a" : "#8a5cff", 12, 200);
        }
        it.dead = true;
      }
    }
  }

  handleEnemies() {
    const p = this.player;
    const prevBottom = p.prevY + p.h;

    for (const e of this.enemies) {
      if (e.dead || e.dying > 0) continue;

      if (p.shielded) {
        if (e.shootable && (e.isStomp(p, prevBottom) || e.isLethalTouch(p))) {
          e.kill();
          this.particles.burst(e.cx, e.cy, "#fff", 12, 220);
          Sfx.hit();
        }
        continue; // black holes are simply passed over while shielded
      }

      if (e.isStomp(p, prevBottom)) {
        e.kill();
        p.y = e.y - p.h;
        p.bounce(CONFIG.STOMP_V);
        Sfx.stomp();
        this.particles.burst(e.cx, e.cy, "#fff", 12, 220);
        continue;
      }

      // Fatal contacts, each with its own death animation. Swept tests (see
      // Enemy) so a fast vertical pass can't slip through between frames.
      if (e.type === "blackhole") {
        if (e.isLethalTouch(p)) { this.die("blackhole", e); return; }
      } else if (e.type === "ufo") {
        if (e.beamHitSwept(p)) { this.die("abduct", e); return; }
        if (e.bodyHitSwept(p)) { this.die("bump", e); return; }
      } else { // monster
        if (e.bodyHitSwept(p)) { this.die("bump", e); return; }
      }
    }
  }

  handleBullets() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.hitByBullet(b)) {
          e.kill();
          b.dead = true;
          this.particles.burst(e.cx, e.cy, "#fff45a", 10, 200);
          Sfx.hit();
          break;
        }
      }
    }
  }

  updateYellow() {
    // A yellow platform begins reddening/exploding once the player has risen
    // above its top. If it was already jumped on (`used`), any rise above it
    // triggers the fade (so it can never give a second jump).
    //
    // For an UNUSED platform we suppress the fade only while the player is
    // genuinely dropping onto it to take their one jump: horizontally aligned
    // AND moving downward (vy >= 0). That covers the brief pre-landing frame
    // where the feet are above the top right before the landing snap.
    //
    // Every OTHER way of getting above it counts as passing it by and triggers
    // the fade — crucially including rising up THROUGH it while still aligned
    // (vy < 0), which is exactly what a jetpack / propeller / spring /
    // trampoline / springy-shoes launch does. The old check keyed off
    // horizontal overlap alone, so an aligned upward fly-through left `horiz`
    // true and the platform never disappeared.
    const p = this.player;
    const playerBottom = p.y + p.h;
    for (const plat of this.platforms) {
      if (plat.type !== PT.YELLOW || plat.disappearing || plat.dead) continue;
      if (playerBottom < plat.y) {
        const horiz = p.x + p.w > plat.x && p.x < plat.x + plat.w;
        const droppingOnto = horiz && p.vy >= 0; // falling in to land on it
        if (plat.used || !droppingOnto) plat.disappearing = true;
      }
    }
  }

  // Begin a death sequence. Types:
  //   "fall"      -> missed every platform; camera follows the doodle down
  //   "bump"      -> hit a monster / ufo side; dizzy, then falls
  //   "abduct"    -> caught in a ufo beam; sucked up into the saucer
  //   "blackhole" -> spiralled into a black hole
  die(type, enemy) {
    if (this.state !== "play") return;
    this.state = "dying";
    const p = this.player;
    this.death = { type, enemy, timer: 0, phase: (type === "bump" ? "dizzy" : "fall"), fallT: 0 };

    if (type === "abduct" || type === "blackhole") {
      p.renderMode = "shrink";
      const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      this.death.ang = Math.atan2(pcy - enemy.cy, pcx - enemy.cx);
      this.death.rad = Math.hypot(pcx - enemy.cx, pcy - enemy.cy);
      Sfx.die();
    } else if (type === "bump") {
      p.vy = -300;            // a little stunned pop
      p.renderMode = "dizzy";
      Sfx.hit();
    } else { // fall
      if (p.vy < 80) p.vy = 80;
      p.renderMode = "normal";
      Sfx.die();
    }

    // The camera pans downward during fall/bump deaths. Remove everything that
    // has already dropped below the visible screen so it can't scroll back into
    // view (platforms only ever leave via the bottom — they shouldn't return).
    if (type === "fall" || type === "bump") {
      const bottom = this.cameraY + CONFIG.H;
      // Keep a platform while it OR its booster/power-up is still on screen, so
      // a still-visible gadget isn't yanked away with its platform.
      this.platforms = this.platforms.filter((pl) => pl.topWithGadget < bottom);
      this.enemies = this.enemies.filter((e) => e.y < bottom);
      this.bullets = this.bullets.filter((b) => b.y < bottom);
    }

    if (this.score > this.high) {
      this.high = this.score;
      Store.set("dj_high", this.high);
    }
  }

  updateDying(dt) {
    const d = this.death, p = this.player;
    d.timer += dt;

    if (d.type === "abduct") {
      // pulled up into the saucer, shrinking
      const k = clamp(d.timer / 0.9, 0, 1);
      p.x = lerp(p.x, d.enemy.cx - p.w / 2, 0.18);
      p.y = lerp(p.y, d.enemy.cy - p.h / 2, 0.12);
      p.scale = lerp(1, 0.1, k);
      p.spin += dt * 5;
      if (d.timer > 0.95) this.finishDeath();
      return;
    }
    if (d.type === "blackhole") {
      // spiral inward, shrinking and spinning
      const k = clamp(d.timer / 1.0, 0, 1);
      const ang = d.ang + d.timer * 13;
      const rad = lerp(d.rad, 0, k);
      const e = d.enemy;
      p.x = e.cx + Math.cos(ang) * rad - p.w / 2;
      p.y = e.cy + Math.sin(ang) * rad - p.h / 2;
      p.scale = lerp(1, 0.05, k);
      p.spin += dt * 16;
      if (d.timer > 1.05) this.finishDeath();
      return;
    }

    // "bump": brief dizzy pop before the fall
    if (d.type === "bump" && d.phase === "dizzy") {
      p.vy += CONFIG.GRAVITY * dt;
      p.y += p.vy * dt;
      p.spin += dt * 11;
      if (d.timer > 0.6) d.phase = "fall";
      return;
    }

    // Falling: the doodle plummets while the camera smoothly pans down to chase
    // it (so platforms above scroll naturally up and off, rather than cutting).
    // After a beat the camera settles and the doodle drops out of the bottom.
    d.fallT += dt;
    p.vy += CONFIG.GRAVITY * dt;
    p.y += p.vy * dt;
    p.x += p.vx * dt;
    if (p.x + p.w < 0) p.x = CONFIG.W;
    else if (p.x > CONFIG.W) p.x = -p.w;
    if (d.type === "bump") p.spin += dt * 7; // keep wobbling while dizzy

    if (d.fallT < 1.3) {
      // ease the camera toward keeping the doodle ~45% down the screen
      const target = p.y - CONFIG.H * 0.45;
      this.cameraY += (target - this.cameraY) * clamp(7 * dt, 0, 1);
    } else if (p.y - this.cameraY > CONFIG.H + 80 || d.fallT > 3.0) {
      this.finishDeath();
    }
  }

  finishDeath() {
    this.state = "over";
    this.overTimer = 0.6;
    this.player.renderMode = "normal";
    this.player.spin = 0;
    this.player.scale = 1;
  }

  // ----- rendering --------------------------------------------------------
  render() {
    const ctx = this.ctx;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, CONFIG.H);
    sky.addColorStop(0, "#cfeffd");
    sky.addColorStop(1, "#eaf6ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);

    this.renderBackground(ctx);

    // The world is always drawn (also during death) so the camera pan reads
    // naturally — platforms scroll up and off as the camera chases the falling
    // doodle, leaving empty sky rather than cutting abruptly.
    for (const plat of this.platforms) plat.render(ctx, this.cameraY);
    for (const e of this.enemies) e.render(ctx, this.cameraY);
    for (const gr of this.gears) gr.render(ctx, this.cameraY);
    for (const b of this.bullets) b.render(ctx, this.cameraY);
    this.particles.render(ctx, this.cameraY);

    if (this.state !== "over") this.player.render(ctx, this.cameraY);

    this.renderHUD(ctx);
    if (this.state === "start") this.renderStart(ctx);
    if (this.state === "over") this.renderOver(ctx);
    if (this.paused && this.state === "play") this.renderPause(ctx);
  }

  // Soft clouds that scroll slower than the world, giving a parallax sense of
  // height. Placement is procedural and infinite: one cloud band every BAND
  // world-units, with a deterministic hash deciding each band's cloud, so the
  // pattern is stable as the camera pans without storing any state.
  renderBackground(ctx) {
    const factor = 0.35;            // < 1 -> clouds drift slower than platforms
    const BAND = 200;               // vertical spacing between cloud rows
    const off = this.cameraY * factor;
    const startBand = Math.floor((off - 60) / BAND);
    const endBand = Math.ceil((off + CONFIG.H + 60) / BAND);

    ctx.save();
    ctx.fillStyle = "#ffffff";
    for (let b = startBand; b <= endBand; b++) {
      const cx = hash01(b) * CONFIG.W;
      const cy = b * BAND - off;
      const scale = 0.7 + hash01(b * 7 + 1) * 0.7;
      ctx.globalAlpha = 0.28 + hash01(b * 13 + 5) * 0.18;
      this._cloud(ctx, cx, cy, scale);
    }
    ctx.restore();
  }

  // A puffy cloud built from a few overlapping circles, centred at (x, y).
  _cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, 26 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 22 * s, y + 4 * s, 16 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * s, y + 4 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4 * s, y - 10 * s, 15 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  renderHUD(ctx) {
    ctx.fillStyle = "#2b2b3a";
    ctx.font = "bold 26px Segoe UI, Arial";
    ctx.textAlign = "left";
    ctx.fillText(String(this.score), 14, 36);
    ctx.font = "13px Segoe UI, Arial";
    ctx.fillStyle = "rgba(40,40,60,0.6)";
    ctx.fillText("Best " + this.high, 14, 54);
  }

  _panel(ctx, title, lines) {
    ctx.fillStyle = "rgba(20,16,40,0.55)";
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px Segoe UI, Arial";
    ctx.fillText(title, CONFIG.W / 2, CONFIG.H / 2 - 70);
    ctx.font = "18px Segoe UI, Arial";
    let y = CONFIG.H / 2 - 20;
    for (const ln of lines) { ctx.fillText(ln, CONFIG.W / 2, y); y += 28; }
    ctx.textAlign = "left";
  }

  renderStart(ctx) {
    this._panel(ctx, "Doodle Jump", [
      "Reach as high as you can!",
      "← → / A D to move",
      "Space / Up / click to shoot",
      "P / Esc to pause",
      "",
      "Press Space or click to start",
    ]);
  }

  renderOver(ctx) {
    this._panel(ctx, "Game Over", [
      "Score: " + this.score,
      "Best: " + this.high,
      "",
      "Space or click to play again",
    ]);
  }

  renderPause(ctx) {
    this._panel(ctx, "Paused", [
      "Score: " + this.score,
      "",
      "Press P or Esc to resume",
    ]);
  }
}
