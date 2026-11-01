import test from "node:test";
import assert from "node:assert/strict";
import { makeScene, dispose } from "../viewer/model.mjs";

test("animations resolve after geometry without permitting missing or duplicate references", () => {
  const action =
    "api.action('spin',{tracks:[{part:'body',property:'rotation.y',mode:'spin',value:1,seconds:2}]});";
  const geometry =
    "api.material('m',{color:'#ffffff'});api.part('body',{shape:'box',material:'m',action:'spin'});";
  const data = { actions: [{ id: "spin", label: "Spin" }] };
  for (const code of [action + geometry, geometry + action]) {
    const scene = makeScene({ ...data, code });
    assert.equal(
      scene.actions.get("spin").tracks[0].target,
      scene.parts.get("body").rotation,
    );
    dispose(scene);
  }
  assert.throws(
    () => makeScene({ ...data, code: action }),
    /Unknown animated part/,
  );
  assert.throws(
    () => makeScene({ ...data, code: action + action + geometry }),
    /Duplicate action/,
  );
});
