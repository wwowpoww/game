import { useLittleActiveTools, useLittleApp, useLittleEnter, useLittlePaused, useLittleTool } from "@kabletv/little-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ambient } from "./audio/ambient";
import { controls } from "./game/controls";
import { motion, transition } from "./game/motion";
import { createStore, currentTargetId, useGame, type Action, type GameState, type Store } from "./game/store";
import { world } from "./game/world";
import { hands, type HandStatus } from "./input/handTracker";
import { LEVELS, assets, assetsReady } from "./levels";
import { easeInOutCubic } from "./render/camera";
import { Corridor } from "./ui/Corridor";
import { Gameplay } from "./ui/Gameplay";
import { HomeOverlay, RulesModal } from "./ui/HomeOverlay";
import { SelectOverlay } from "./ui/SelectOverlay";
import { StageCanvas } from "./ui/StageCanvas";
import { SoundIcon } from "./ui/icons";
import { clientToStage } from "./ui/stageCoords";

const DONE: Partial<Record<GameState["screen"], Action["type"]>> = {
  toSelect: "descentDone",
  toHome: "ascentDone",
  entering: "enterDone",
  leaving: "leaveDone",
};

const TOOLS_BY_SCREEN: Record<GameState["screen"], string[]> = {
  home: ["play", "show_rules", "close_rules", "toggle_sound"],
  toSelect: [],
  select: ["next_window", "previous_window", "enter_window", "back_to_corridor", "toggle_sound"],
  toHome: [],
  entering: [],
  play: [
    "use_magnifying_glass", "put_away_magnifying_glass", "lock_in", "move_magnifier", "show_target", "continue", "try_again",
    "restart_level", "replay_level", "back_to_windows", "set_controls", "toggle_sound",
  ],
  leaving: [],
};

/** `?start=select` or `?start=play&level=1` jumps straight to a screen (handy while iterating on art). */
function initialState(): GameState {
  const base: GameState = { screen: "home", selected: 0, rulesOpen: false, play: null, inputMode: "pointer", soundOn: true };
  const q = new URLSearchParams(location.search);
  const selected = Math.max(0, Math.min(LEVELS.length - 1, Number(q.get("level") ?? 0) || 0));
  if (q.get("start") === "select") return { ...base, screen: "select", selected };
  if (q.get("start") === "play") {
    return {
      ...base,
      screen: "play",
      selected,
      play: { level: LEVELS[selected].id, targetIndex: 0, found: [], phase: "exploring", lensActive: false, cardOpen: true, lastResult: null, run: 1 },
    };
  }
  return base;
}

export default function App() {
  const store: Store = useMemo(() => createStore(initialState()), []);
  const state = useGame(store);
  const app = useLittleApp();
  const paused = useLittlePaused();
  const homeRef = useRef<HTMLDivElement>(null);
  const corridorRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [handStatus, setHandStatus] = useState<HandStatus>("off");
  const [notice, setNotice] = useState<string | null>(null);
  const [artReady, setArtReady] = useState(assets.loaded);
  useEffect(() => {
    let live = true;
    assetsReady
      .then(() => {
        if (!live) return;
        setArtReady(true);
        LEVELS.forEach((l) => world.request(l.id, "preview"));
        const s = store.get();
        if (s.play) world.request(s.play.level, "play");
      })
      .catch((e) => setNotice(`Some artwork failed to load (${String(e)}). Please reload.`));
    return () => {
      live = false;
    };
  }, [store]);

  useLittleEnter(() => undefined);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __veil: unknown }).__veil = { store, world, controls, clientToStage };
  }, [store]);

  /* ── Transition clock and layer choreography ── */
  useEffect(() => {
    let prev = store.get().screen;
    const unsub = store.subscribe(() => {
      const s = store.get();
      if (s.screen === prev) return;
      prev = s.screen;
      transition.begin(s.screen);
      if (s.screen === "toSelect" || s.screen === "entering") ambient.whoosh(false);
      if (s.screen === "toHome" || s.screen === "leaving") ambient.whoosh(true);
      if (s.screen === "entering" && s.play) {
        world.trimPlayCaches(s.play.level);
        world.request(s.play.level, "play");
      }
      ambient.setMood(s.screen === "play" || s.screen === "entering" ? s.play?.level ?? "home" : "home");
    });
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const s = store.get();
      const p = transition.progress(now);
      const H = world.height;
      let stageY = 0, stageOpacity = 1, homeY = 0, homeOpacity = 1;
      let corridorOn = false;
      if (s.screen === "home") {
        stageY = H;
        corridorOn = true;
      } else if (s.screen === "toSelect" || s.screen === "toHome") {
        corridorOn = true;
        const d = s.screen === "toSelect" ? p : 1 - p;
        if (motion.reduced) {
          stageOpacity = d;
          homeOpacity = 1 - d;
        } else {
          const e = easeInOutCubic(d);
          stageY = (1 - e) * H;
          homeY = -e * H;
          homeOpacity = 1 - Math.min(1, e * 1.6);
        }
      }
      if (stageRef.current) {
        stageRef.current.style.transform = `translate3d(0, ${stageY}px, 0)`;
        stageRef.current.style.opacity = String(stageOpacity);
        stageRef.current.style.visibility = s.screen === "home" ? "hidden" : "visible";
      }
      if (homeRef.current) {
        homeRef.current.style.transform = `translate3d(0, ${homeY}px, 0)`;
        homeRef.current.style.opacity = String(homeOpacity);
        homeRef.current.style.visibility = corridorOn ? "visible" : "hidden";
      }
      if (corridorRef.current) corridorRef.current.style.visibility = corridorOn ? "visible" : "hidden";
      const done = DONE[s.screen];
      if (done && transition.kind === s.screen && p >= 1) store.dispatch({ type: done } as Action);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, [store]);

  // Pre-build the gameplay cache for the window the player is looking at.
  useEffect(() => {
    if (state.screen !== "select") return;
    const id = LEVELS[state.selected].id;
    const t = window.setTimeout(() => {
      world.trimPlayCaches(id);
      world.request(id, "play");
    }, 700);
    return () => clearTimeout(t);
  }, [state.screen, state.selected]);

  /* ── Sound ── */
  useEffect(() => {
    ambient.setEnabled(state.soundOn && !paused);
  }, [state.soundOn, paused]);
  // Music plays by default. Where the browser blocks autoplay, it starts on the first key or tap.
  useEffect(() => {
    const unlock = () => ambient.resume();
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  /* ── Hand tracking ── */
  useEffect(() => hands.onStatus(setHandStatus), []);
  useEffect(() => {
    if (state.inputMode !== "hand") return;
    if (handStatus === "denied" || handStatus === "unsupported" || handStatus === "error") {
      setNotice(
        handStatus === "denied"
          ? "Camera access was declined, so Veil switched back to pointer controls. Everything still works."
          : "Hand tracking isn't available here, so Veil switched back to pointer controls.",
      );
      store.dispatch({ type: "inputMode", mode: "pointer" });
    }
  }, [handStatus, state.inputMode, store]);

  const chooseHand = useCallback(() => {
    store.dispatch({ type: "inputMode", mode: "hand" });
    const hostCam = app.can("media.camera") ? () => app.media.camera({ facing: "user", width: 640, height: 480 }) : undefined;
    void hands.start(hostCam);
  }, [app, store]);
  // Scenes are played with the camera by default; declining falls back to pointer controls.
  const lastScreen = useRef(store.get().screen);
  useEffect(() => {
    const prev = lastScreen.current;
    lastScreen.current = state.screen;
    if (state.screen === "play" && prev !== "play" && artReady && store.get().inputMode !== "hand") chooseHand();
  }, [state.screen, artReady, chooseHand, store]);

  const choosePointer = useCallback(() => {
    store.dispatch({ type: "inputMode", mode: "pointer" });
    hands.stop();
  }, [store]);

  // Release the camera and microphone when the television pauses the app.
  useEffect(() => {
    if (!paused) return;
    if (hands.status !== "off") choosePointer();
  }, [paused, choosePointer]);

  /* ── Keyboard and TV remote ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.get();
      const target = e.target as HTMLElement;
      const onButton = target && (target.tagName === "BUTTON" || target.tagName === "INPUT");
      if (s.rulesOpen) {
        if (e.key === "Escape") store.dispatch({ type: "rules", open: false });
        return;
      }
      switch (s.screen) {
        case "home": {
          if (e.key === "Escape") {
            void app.exit();
            return;
          }
          // D-pad: left/right between Play and Rules, up to the sound toggle, down back to Play.
          const main = [...document.querySelectorAll<HTMLButtonElement>(".home-buttons button")];
          const sound = document.querySelector<HTMLButtonElement>(".corner-btn.top-right");
          const i = main.indexOf(document.activeElement as HTMLButtonElement);
          let next: HTMLButtonElement | null | undefined = null;
          if (e.key === "ArrowLeft") next = main[Math.max(0, (i < 0 ? 0 : i) - 1)];
          else if (e.key === "ArrowRight") next = main[Math.min(main.length - 1, i < 0 ? 0 : i + 1)];
          else if (e.key === "ArrowUp") next = sound;
          else if (e.key === "ArrowDown") next = main[0];
          else if (e.key === "Enter" && !onButton) next = main[0];
          if (!next) return;
          e.preventDefault();
          next.focus({ preventScroll: true });
          if (e.key === "Enter") next.click();
          return;
        }
        case "select":
          if (e.key === "ArrowLeft") store.dispatch({ type: "select", index: s.selected - 1 });
          else if (e.key === "ArrowRight") store.dispatch({ type: "select", index: s.selected + 1 });
          else if (e.key === "Escape") store.dispatch({ type: "backHome" });
          else if (e.key === "Enter" && !onButton) store.dispatch({ type: "enter" });
          else return;
          e.preventDefault();
          return;
        case "play": {
          const p = s.play!;
          if (e.key === "Escape") {
            if (p.phase === "exploring" || p.phase === "complete") store.dispatch({ type: "leave" });
            e.preventDefault();
            return;
          }
          // Completion screen: left/right between its buttons, like the title screen.
          if (p.phase === "complete" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            const btns = [...document.querySelectorAll<HTMLButtonElement>(".complete-buttons button")];
            const i = btns.indexOf(document.activeElement as HTMLButtonElement);
            const next = e.key === "ArrowLeft" ? btns[Math.max(0, (i < 0 ? 0 : i) - 1)] : btns[Math.min(btns.length - 1, i < 0 ? 0 : i + 1)];
            next?.focus({ preventScroll: true });
            e.preventDefault();
            return;
          }
          // The D-pad only navigates the corridor and the windows; in a scene it does nothing.
          if (e.key.startsWith("Arrow")) {
            e.preventDefault();
            return;
          }
          if (e.key !== "Enter") return;
          e.preventDefault();
          // Select: first press raises the magnifier, then every press locks in.
          if (p.phase === "exploring") {
            if (!p.lensActive) controls.activateLens();
            else controls.lockIn();
          } else if (p.phase === "result") {
            store.dispatch({ type: p.lastResult?.correct ? "continue" : "retry" });
          } else if (p.phase === "complete") {
            const focused = onButton ? (target as HTMLButtonElement) : document.querySelector<HTMLButtonElement>(".complete-buttons button");
            focused?.click();
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app, store]);

  /* ── Little tools (names match public/little/manifest.json) ── */
  useLittleActiveTools(TOOLS_BY_SCREEN[state.screen]);
  const reject = (detail: string) => ({ ok: false as const, detail });
  useLittleTool("play", () => (store.dispatch({ type: "play" }) ? { say: "Let's find a window." } : reject("Play is only available on the title screen.")));
  useLittleTool("show_rules", () => (store.dispatch({ type: "rules", open: true }) ? undefined : reject("Rules can be opened from the title screen.")));
  useLittleTool("close_rules", () => (store.dispatch({ type: "rules", open: false }) ? undefined : reject("The rules aren't open.")));
  useLittleTool("next_window", () => (store.dispatch({ type: "select", index: store.get().selected + 1 }) ? { detail: LEVELS[store.get().selected].name } : reject("Not choosing a window right now.")));
  useLittleTool("previous_window", () => (store.dispatch({ type: "select", index: store.get().selected - 1 }) ? { detail: LEVELS[store.get().selected].name } : reject("Not choosing a window right now.")));
  useLittleTool<{ id?: string }>("enter_window", ({ id }) => {
    const index = id ? LEVELS.findIndex((l) => l.littleId === id) : store.get().selected;
    if (index < 0) return reject(`No window with id ${id}.`);
    return store.dispatch({ type: "enter", index }) ? undefined : reject("Windows can only be entered from the window carousel.");
  });
  useLittleTool("back_to_corridor", () => (store.dispatch({ type: "backHome" }) ? undefined : reject("Not on the window carousel.")));
  useLittleTool("use_magnifying_glass", () => (controls.activateLens() ? undefined : reject("The magnifying glass can only be raised while exploring a scene.")));
  useLittleTool("put_away_magnifying_glass", () => (store.dispatch({ type: "lens", on: false }) ? undefined : reject("The magnifying glass isn't raised.")));
  useLittleTool("lock_in", () => {
    const r = controls.lockIn();
    return r.ok ? { detail: "Submitted. The result is shown on screen.", spoke: true } : reject(r.reason ?? "Cannot lock in right now.");
  });
  useLittleTool<{ direction?: string; distance?: string }>("move_magnifier", ({ direction, distance }) => {
    const s = store.get();
    if (s.screen !== "play" || !s.play?.lensActive) return reject("Raise the magnifying glass first.");
    const step = distance === "large" ? 220 : distance === "small" ? 50 : 120;
    const d = String(direction ?? "").toLowerCase();
    const dx = d.includes("left") ? -step : d.includes("right") ? step : 0;
    const dy = d.includes("up") ? -step : d.includes("down") ? step : 0;
    if (!dx && !dy) return reject("Direction must be up, down, left or right.");
    controls.moveLens(dx, dy);
    return undefined;
  });
  useLittleTool("show_target", () => {
    const s = store.get();
    if (s.screen !== "play" || !s.play) return reject("Not in a scene.");
    const t = world.scene(s.play.level).targets.find((x) => x.id === currentTargetId(s.play!))!;
    return { detail: `Looking for: ${t.name}. Clue: ${t.clue}` };
  });
  useLittleTool("continue", () => (store.dispatch({ type: "continue" }) ? undefined : reject("Continue is available after a correct discovery.")));
  useLittleTool("try_again", () => (store.dispatch({ type: "retry" }) ? undefined : reject("Try again is available after an incorrect guess.")));
  useLittleTool("restart_level", () => (store.dispatch({ type: "restart" }) ? undefined : reject("Not in a scene, or a discovery is being checked.")));
  useLittleTool("replay_level", () => (store.dispatch({ type: "restart" }) ? undefined : reject("Not in a scene.")));
  useLittleTool("back_to_windows", () => (store.dispatch({ type: "leave" }) ? undefined : reject("Not in a scene, or a discovery is being checked.")));
  useLittleTool<{ mode?: string; id?: string }>("set_controls", ({ mode, id }) => {
    const m = mode ?? (id === "ctl_hand" ? "hand" : id === "ctl_pointer" ? "pointer" : undefined);
    if (m === "hand") chooseHand();
    else if (m === "pointer") choosePointer();
    else return reject("Mode must be hand or pointer.");
    return undefined;
  });
  useLittleTool<{ on?: boolean }>("toggle_sound", ({ on }) => {
    const next = typeof on === "boolean" ? on : !store.get().soundOn;
    store.dispatch({ type: "sound", on: next });
    return undefined;
  });

  const showSound = state.screen === "home" || state.screen === "select";

  return (
    <div className="app">
      <div ref={corridorRef} className="layer">
        <Corridor store={store} />
      </div>
      <div ref={homeRef} className="layer">
        <HomeOverlay store={store} state={state} />
      </div>
      <div ref={stageRef} className="layer stage-layer">
        <StageCanvas store={store} />
        {artReady && <SelectOverlay store={store} state={state} />}
        {artReady && state.play && (state.screen === "play" || state.screen === "leaving" || state.screen === "entering") && (
          <Gameplay
            store={store}
            state={state}
            onChooseHand={chooseHand}
            onChoosePointer={choosePointer}
            handStatus={handStatus}
          />
        )}
      </div>
      <RulesModal store={store} open={state.rulesOpen} />
      {showSound && (
        <button className="corner-btn top-right icon-only" aria-label={state.soundOn ? "Mute sound" : "Turn sound on"} aria-pressed={state.soundOn} onClick={() => store.dispatch({ type: "sound", on: !state.soundOn })} data-little="control" data-little-action="toggle_sound">
          <SoundIcon on={state.soundOn} /> <span className="sr">{state.soundOn ? "Sound on" : "Sound off"}</span>
        </button>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button className="link-btn" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
    </div>
  );
}
