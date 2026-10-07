import { describe, it, expect } from "vitest";
import { parseDevUrlParams } from "./devUrlParams";

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

  it("reads every parameter from one URL", () => {
    expect(parseDevUrlParams("?size=small&seed=1&cx=12&cz=13.9&dist=4.3")).toEqual({
      setupData: { mapSize: "small", mapSeed: 1 },
      cameraTarget: [12, 0, 13.9],
      cameraDistance: 4.3,
    });
  });
});
