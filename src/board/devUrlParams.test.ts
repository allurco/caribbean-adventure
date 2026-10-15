import { describe, it, expect } from "vitest";
import { renderSwitches, parseDevUrlParams, seatCount, showsDebugPanel } from "./devUrlParams";

describe("parseDevUrlParams", () => {
  it("pins nothing for a bare URL", () => {
    expect(parseDevUrlParams("")).toEqual({});
    expect(parseDevUrlParams("?")).toEqual({});
  });

  it("pins the map to a known size and an integer seed", () => {
    expect(parseDevUrlParams("?size=small&seed=1")).toEqual({ setupData: { mapSize: "small", mapSeed: 1 } });
    expect(parseDevUrlParams("?size=large&seed=123456")).toEqual({ setupData: { mapSize: "large", mapSeed: 123456 } });
  });

  it("pins the size or the seed alone", () => {
    expect(parseDevUrlParams("?size=medium")).toEqual({ setupData: { mapSize: "medium" } });
    expect(parseDevUrlParams("?seed=7")).toEqual({ setupData: { mapSeed: 7 } });
  });

  it("drops an unknown size and a seed that is not an integer", () => {
    expect(parseDevUrlParams("?size=huge&seed=1")).toEqual({ setupData: { mapSeed: 1 } });
    expect(parseDevUrlParams("?size=small&seed=abc")).toEqual({ setupData: { mapSize: "small" } });
    expect(parseDevUrlParams("?seed=1.5")).toEqual({});
    expect(parseDevUrlParams("?seed=")).toEqual({});
    expect(parseDevUrlParams("?size=SMALL")).toEqual({});
  });

  it("takes a seed only as a plain decimal integer within int32, so the pin is exact", () => {
    // The generator folds the seed to int32, so anything else would alias
    // to another seed's map instead of failing.
    expect(parseDevUrlParams("?seed=2147483647")).toEqual({ setupData: { mapSeed: 2147483647 } });
    expect(parseDevUrlParams("?seed=-2147483648")).toEqual({ setupData: { mapSeed: -2147483648 } });
    expect(parseDevUrlParams("?seed=2147483648")).toEqual({});
    expect(parseDevUrlParams("?seed=4294967297")).toEqual({});
    expect(parseDevUrlParams("?seed=0x10")).toEqual({});
    expect(parseDevUrlParams("?seed=1e6")).toEqual({});
    expect(parseDevUrlParams("?seed=+5")).toEqual({});
  });

  it("pins the camera's target and distance", () => {
    expect(parseDevUrlParams("?cx=12&cz=13.9&dist=4.3")).toEqual({
      cameraTarget: [12, 0, 13.9],
      cameraDistance: 4.3,
    });
  });

  it("pins the target only with both coordinates, and the distance only when positive", () => {
    expect(parseDevUrlParams("?cx=12")).toEqual({});
    expect(parseDevUrlParams("?cz=13.9&dist=4.3")).toEqual({ cameraDistance: 4.3 });
    expect(parseDevUrlParams("?cx=-3&cz=0")).toEqual({ cameraTarget: [-3, 0, 0] });
    expect(parseDevUrlParams("?dist=0")).toEqual({});
    expect(parseDevUrlParams("?dist=-2")).toEqual({});
    expect(parseDevUrlParams("?cx=nope&cz=1&dist=Infinity")).toEqual({});
  });

  it("opens the prop viewer, close up on an entry when focus is an index", () => {
    expect(parseDevUrlParams("?view=props")).toEqual({ propViewer: {} });
    expect(parseDevUrlParams("?view=props&focus=3")).toEqual({ propViewer: { focus: 3 } });
    expect(parseDevUrlParams("?view=props&focus=-1")).toEqual({ propViewer: {} });
    expect(parseDevUrlParams("?view=props&focus=x")).toEqual({ propViewer: {} });
    expect(parseDevUrlParams("?view=other&focus=3")).toEqual({});
  });

  it("opens the sound lab", () => {
    expect(parseDevUrlParams("?view=sound")).toEqual({ soundLab: true });
    expect(parseDevUrlParams("?view=sounds")).toEqual({});
  });

  it("floats the sea surface buoys", () => {
    expect(parseDevUrlParams("?buoys=1")).toEqual({ seaBuoys: true });
    expect(parseDevUrlParams("?buoys=0")).toEqual({});
    expect(parseDevUrlParams("?buoys=yes")).toEqual({});
  });

  it("opens the seed gallery and takes a gallery shot (#161)", () => {
    expect(parseDevUrlParams("?seedGallery=1")).toEqual({ seedGallery: true });
    expect(parseDevUrlParams("?seedGallery=1&size=medium")).toEqual({ seedGallery: true, setupData: { mapSize: "medium" } });
    expect(parseDevUrlParams("?size=small&seed=7&cx=1&cz=2&dist=3.4&snapshot=1")).toEqual({
      setupData: { mapSize: "small", mapSeed: 7 },
      cameraTarget: [1, 0, 2],
      cameraDistance: 3.4,
      gallerySnapshot: true,
    });
    expect(parseDevUrlParams("?seedGallery=0&snapshot=yes")).toEqual({});
  });

  it("opens every seat on one page through the local transport (#110)", () => {
    expect(parseDevUrlParams("?seats=1")).toEqual({ localSeats: true });
    expect(parseDevUrlParams("?seats=1&size=small&seed=7")).toEqual({
      localSeats: true,
      setupData: { mapSize: "small", mapSeed: 7 },
    });
    expect(parseDevUrlParams("?seats=0")).toEqual({});
    expect(parseDevUrlParams("?seats=yes")).toEqual({});
  });

  it("sets the match's seats, 1 to 4, for a hotseat game (#278)", () => {
    expect(parseDevUrlParams("?players=2")).toEqual({ players: 2 });
    expect(parseDevUrlParams("?players=4&seats=1")).toEqual({ players: 4, localSeats: true });
    expect(parseDevUrlParams("?players=1")).toEqual({ players: 1 });
    for (const bad of ["0", "5", "2.5", "two", "", "02x"]) expect(parseDevUrlParams(`?players=${bad}`)).toEqual({});
  });

  it("shows the render stats overlay", () => {
    expect(parseDevUrlParams("?stats=1")).toEqual({ renderStats: true });
    expect(parseDevUrlParams("?stats=0")).toEqual({});
    expect(parseDevUrlParams("?stats=true")).toEqual({});
    expect(parseDevUrlParams("?stats")).toEqual({});
  });

  it("picks how the region borders are drawn: in the water or as a line (#239)", () => {
    expect(parseDevUrlParams("?regionBorder=water")).toEqual({ regionBorder: "water" });
    expect(parseDevUrlParams("?regionBorder=line")).toEqual({ regionBorder: "line" });
    expect(parseDevUrlParams("?regionBorder=dotted")).toEqual({});
    expect(parseDevUrlParams("?regionBorder=")).toEqual({});
  });

  it("turns parts of the picture off for an A/B check on a real GPU, in production builds too", () => {
    expect(parseDevUrlParams("?fx=0")).toEqual({ renderOff: { combatFx: true } });
    expect(parseDevUrlParams("?ink=0")).toEqual({ renderOff: { regionInk: true } });
    expect(parseDevUrlParams("?bloom=0")).toEqual({ renderOff: { bloom: true } });
    expect(parseDevUrlParams("?post=0")).toEqual({ renderOff: { postProcessing: true } });
    expect(parseDevUrlParams("?fx=0&ink=0&bloom=0")).toEqual({ renderOff: { combatFx: true, regionInk: true, bloom: true } });
    expect(parseDevUrlParams("?fx=1&ink=&bloom=no")).toEqual({});
  });

  it("turns parts of the base scene off too: shadows, multisampling, the ocean, the land", () => {
    expect(parseDevUrlParams("?shadows=0")).toEqual({ renderOff: { shadows: true } });
    expect(parseDevUrlParams("?aa=0")).toEqual({ renderOff: { msaa: true } });
    expect(parseDevUrlParams("?ocean=0")).toEqual({ renderOff: { ocean: true } });
    expect(parseDevUrlParams("?land=0")).toEqual({ renderOff: { land: true } });
    expect(parseDevUrlParams("?shadows=no&aa=1&ocean=&land=false")).toEqual({});
  });

  it("tries the bloom without its input sanitized, without its mipmap blur, or on full float buffers", () => {
    expect(parseDevUrlParams("?bloomsan=0")).toEqual({ renderOff: { bloomSanitize: true } });
    expect(parseDevUrlParams("?bloommip=0")).toEqual({ renderOff: { bloomMipmapBlur: true } });
    expect(parseDevUrlParams("?bloomhalf=0")).toEqual({ renderOff: { halfFloatBuffers: true } });
    expect(parseDevUrlParams("?bloomsan=1&bloommip=&bloomhalf=no")).toEqual({});
  });

  it("sets up the GL context for a check on a real GPU, and shows what it got, in production builds too", () => {
    expect(parseDevUrlParams("?dpr=1")).toEqual({ gpu: { dpr1: true } });
    expect(parseDevUrlParams("?power=low")).toEqual({ gpu: { lowPower: true } });
    expect(parseDevUrlParams("?pdb=1")).toEqual({ gpu: { preserveDrawingBuffer: true } });
    expect(parseDevUrlParams("?gpuinfo=1")).toEqual({ gpu: { info: true } });
    expect(parseDevUrlParams("?dpr=2&power=high&pdb=0&gpuinfo=yes")).toEqual({});
    expect(parseDevUrlParams("?gpuinfo=1&dpr=1&aa=0&fx=0")).toEqual({
      gpu: { info: true, dpr1: true },
      renderOff: { msaa: true, combatFx: true },
    });
  });

  it("writes the A/B switches in effect back out as the URL spells them, and nothing else", () => {
    const search = "?fx=0&ink=0&bloom=0&post=0&shadows=0&aa=0&ocean=0&land=0&bloomsan=0&bloommip=0&bloomhalf=0&dpr=1&power=low&pdb=1&gpuinfo=1";
    const { renderOff, gpu } = parseDevUrlParams(`${search}&seed=7&email=someone`);
    expect(renderSwitches(renderOff ?? {}, gpu ?? {})).toEqual(search.slice(1).split("&"));
    expect(parseDevUrlParams(`?${renderSwitches(renderOff ?? {}, gpu ?? {}).join("&")}`)).toEqual({ renderOff, gpu });
    expect(renderSwitches({}, {})).toEqual([]);
  });

  it("reads every parameter from one URL", () => {
    expect(parseDevUrlParams("?size=small&seed=1&cx=12&cz=13.9&dist=4.3&stats=1")).toEqual({
      setupData: { mapSize: "small", mapSeed: 1 },
      cameraTarget: [12, 0, 13.9],
      cameraDistance: 4.3,
      renderStats: true,
    });
  });
});

describe("seatCount", () => {
  it("is solo unless the URL asks for more seats, and the seats on one page use the same count (#278)", () => {
    expect(seatCount(parseDevUrlParams(""))).toBe(1);
    expect(seatCount(parseDevUrlParams("?seats=1"))).toBe(1);
    expect(seatCount(parseDevUrlParams("?players=2"))).toBe(2);
    expect(seatCount(parseDevUrlParams("?seats=1&players=3"))).toBe(3);
    expect(seatCount(parseDevUrlParams("?players=9"))).toBe(1);
  });
});

describe("showsDebugPanel", () => {
  it("keeps boardgame.io's debug panel for the ordinary dev game", () => {
    expect(showsDebugPanel(parseDevUrlParams("?size=small&seed=1"))).toBe(true);
  });

  it("hides it for a gallery shot, so it covers nothing in the picture", () => {
    expect(showsDebugPanel(parseDevUrlParams("?size=small&seed=1&snapshot=1"))).toBe(false);
  });

  it("hides it for the seats on one page, so its tab does not cover End Turn or the turn bar (#110)", () => {
    expect(showsDebugPanel(parseDevUrlParams("?seats=1&size=small&seed=1"))).toBe(false);
    expect(showsDebugPanel(parseDevUrlParams("?seats=1&snapshot=1"))).toBe(false);
  });
});
