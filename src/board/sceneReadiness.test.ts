import { describe, expect, it } from "vitest";
import {
  READINESS_FRAMES,
  completeTask,
  createReadiness,
  failTask,
  frameRendered,
  pendingTasks,
  readinessView,
  timedOut,
  timeoutRemaining,
  READINESS_TIMEOUT_MS,
} from "./sceneReadiness";

const tasks = [
  { id: "model:/ships/sloop.glb", stage: "models" },
  { id: "model:/ships/frigate.glb", stage: "models" },
  { id: "font:Cinzel 500", stage: "fonts" },
  { id: "sound:ui-click", stage: "sounds" },
  { id: "world", stage: "world" },
  { id: "sky", stage: "sky" },
] as const;

const allLoaded = () => tasks.reduce((state, task) => completeTask(state, task.id), createReadiness(tasks));

describe("scene readiness", () => {
  it("starts at the first stage with nothing done", () => {
    const view = readinessView(createReadiness(tasks));
    expect(view.stage).toBe("models");
    expect(view.fraction).toBe(0);
    expect(view.ready).toBe(false);
    expect(view.compileShaders).toBe(false);
  });

  it("moves to the next stage once every task of a stage is done", () => {
    let state = createReadiness(tasks);
    state = completeTask(state, "model:/ships/sloop.glb");
    expect(readinessView(state).stage).toBe("models");
    state = completeTask(state, "model:/ships/frigate.glb");
    expect(readinessView(state).stage).toBe("fonts");
  });

  it("reports the stage of the earliest unfinished task even when later ones finished first", () => {
    const state = completeTask(createReadiness(tasks), "sky");
    expect(readinessView(state).stage).toBe("models");
  });

  it("asks for the shaders to be compiled only once every asset and the world are ready", () => {
    const view = readinessView(allLoaded());
    expect(view.stage).toBe("shaders");
    expect(view.compileShaders).toBe(true);
    expect(view.ready).toBe(false);
  });

  it("does not count frames before the shaders are compiled", () => {
    let state = allLoaded();
    for (let i = 0; i < READINESS_FRAMES; i++) state = frameRendered(state);
    expect(readinessView(state).ready).toBe(false);
  });

  it("is ready after the shaders compile and a few frames are drawn", () => {
    let state = completeTask(allLoaded(), "shaders");
    const compiled = readinessView(state);
    expect(compiled.stage).toBe("frames");
    expect(compiled.compileShaders).toBe(false);
    for (let i = 0; i < READINESS_FRAMES - 1; i++) state = frameRendered(state);
    expect(readinessView(state).ready).toBe(false);
    state = frameRendered(state);
    const view = readinessView(state);
    expect(view.ready).toBe(true);
    expect(view.fraction).toBe(1);
    expect(view.timedOut).toBe(false);
  });

  it("counts progress over every task, the shaders and the frames", () => {
    // 6 tasks + shaders + 3 frames = 10 steps
    const state = completeTask(completeTask(createReadiness(tasks), "sky"), "world");
    expect(readinessView(state).fraction).toBeCloseTo(2 / (tasks.length + 1 + READINESS_FRAMES));
  });

  it("ignores unknown and repeated task ids", () => {
    const once = completeTask(createReadiness(tasks), "sky");
    expect(completeTask(once, "sky")).toEqual(once);
    expect(completeTask(once, "nope")).toEqual(once);
  });

  it("lists what is still pending", () => {
    const state = completeTask(createReadiness(tasks), "sky");
    expect(pendingTasks(state)).toEqual([
      "model:/ships/sloop.glb",
      "model:/ships/frigate.glb",
      "font:Cinzel 500",
      "sound:ui-click",
      "world",
      "shaders",
      "frames",
    ]);
  });

  it("reveals the board after a timeout whatever is still loading", () => {
    const view = readinessView(timedOut(createReadiness(tasks)));
    expect(view.ready).toBe(true);
    expect(view.timedOut).toBe(true);
    expect(view.compileShaders).toBe(false);
  });

  it("labels each stage for the loading screen", () => {
    expect(readinessView(createReadiness(tasks)).label).toMatch(/\S/);
    expect(readinessView(allLoaded()).label).not.toBe(readinessView(createReadiness(tasks)).label);
  });

  it("counts a failed asset as settled, so the gate moves on without waiting for the timeout", () => {
    let state = failTask(createReadiness(tasks), "model:/ships/sloop.glb");
    state = completeTask(state, "model:/ships/frigate.glb");
    const view = readinessView(state);
    expect(view.stage).toBe("fonts");
    expect(view.failed).toEqual(["model:/ships/sloop.glb"]);
    expect(pendingTasks(state)).not.toContain("model:/ships/sloop.glb");
  });

  it("opens with failed assets once everything else is ready, and says it was not a timeout", () => {
    let state = tasks.reduce((s, task) => (task.id === "sky" ? failTask(s, task.id) : completeTask(s, task.id)), createReadiness(tasks));
    expect(readinessView(state).compileShaders).toBe(true);
    state = completeTask(state, "shaders");
    for (let i = 0; i < READINESS_FRAMES; i++) state = frameRendered(state);
    const view = readinessView(state);
    expect(view.ready).toBe(true);
    expect(view.timedOut).toBe(false);
    expect(view.failed).toEqual(["sky"]);
  });

  it("does not let a late success undo a failure, or a failure undo a success", () => {
    const failed = failTask(createReadiness(tasks), "sky");
    expect(readinessView(completeTask(failed, "sky")).failed).toEqual(["sky"]);
    const done = completeTask(createReadiness(tasks), "sky");
    expect(readinessView(failTask(done, "sky")).failed).toEqual([]);
  });

  it("times out a fixed time after page load, however late the board mounts", () => {
    expect(timeoutRemaining(0)).toBe(READINESS_TIMEOUT_MS);
    expect(timeoutRemaining(20_000)).toBe(READINESS_TIMEOUT_MS - 20_000);
    expect(timeoutRemaining(READINESS_TIMEOUT_MS + 5)).toBe(0);
  });
});
