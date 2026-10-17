import { describe, expect, it } from "vitest";
import { compileForFrames, frameOutputFor } from "./shaderWarmUp";

interface FakeTarget {
  name: string;
  disposed: boolean;
}

/** A renderer's render-target switch that records the target each compile ran against. */
const fakeRenderer = (start: FakeTarget | null = null) => {
  let current = start;
  const compiledInto: (string | null)[] = [];
  return {
    renderer: {
      getRenderTarget: () => current,
      setRenderTarget: (target: FakeTarget | null) => {
        current = target;
      },
    },
    compile: () => {
      compiledInto.push(current?.name ?? null);
      return Promise.resolve();
    },
    compiledInto,
    current: () => current,
  };
};

const newTarget = () => {
  const made: FakeTarget[] = [];
  return {
    made,
    create: () => {
      const target = { name: "warm-up", disposed: false };
      made.push(target);
      return { ...target, dispose: () => (target.disposed = true) };
    },
  };
};

describe("compileForFrames (#135)", () => {
  it("compiles into a render target when the frames go through the composer, as they are drawn", async () => {
    const fake = fakeRenderer();
    const target = newTarget();
    await compileForFrames(fake.renderer, fake.compile, "composer", target.create);
    expect(fake.compiledInto).toEqual(["warm-up"]);
  });

  it("compiles to the screen, making no target, when the frames are drawn straight to it", async () => {
    const fake = fakeRenderer();
    const target = newTarget();
    await compileForFrames(fake.renderer, fake.compile, "screen", target.create);
    expect(fake.compiledInto).toEqual([null]);
    expect(target.made).toHaveLength(0);
  });

  it("puts the renderer's target back and disposes its own as soon as the compile is queued", () => {
    const before = { name: "before", disposed: false };
    const fake = fakeRenderer(before);
    const target = newTarget();
    void compileForFrames(fake.renderer, () => new Promise(() => {}), "composer", target.create);
    expect(fake.current()).toBe(before);
    expect(target.made[0].disposed).toBe(true);
  });

  it("puts the target back and rejects, never throws, when the compile throws", async () => {
    const fake = fakeRenderer();
    const target = newTarget();
    const compile = () => {
      throw new Error("no context");
    };
    await expect(compileForFrames(fake.renderer, compile, "composer", target.create)).rejects.toThrow("no context");
    expect(fake.current()).toBeNull();
    expect(target.made[0].disposed).toBe(true);
  });

  it("rejects, never throws, when the render target cannot be made, leaving the renderer's own", async () => {
    const before = { name: "before", disposed: false };
    const fake = fakeRenderer(before);
    const createTarget = (): FakeTarget & { dispose(): void } => {
      throw new Error("out of memory");
    };
    await expect(compileForFrames(fake.renderer, fake.compile, "composer", createTarget)).rejects.toThrow("out of memory");
    expect(fake.compiledInto).toEqual([]);
    expect(fake.current()).toBe(before);
  });
});

describe("frameOutputFor (#135)", () => {
  it("draws through the composer by default", () => {
    expect(frameOutputFor({})).toBe("composer");
  });

  it("draws straight to the screen with the post-processing off (?post=0)", () => {
    expect(frameOutputFor({ postProcessing: true })).toBe("screen");
  });

  it("still draws through the composer with only the bloom off", () => {
    expect(frameOutputFor({ bloom: true })).toBe("composer");
  });
});
