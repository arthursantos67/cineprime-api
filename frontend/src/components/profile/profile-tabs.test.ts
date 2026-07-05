import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProfileTabHref,
  DEFAULT_PROFILE_TAB,
  getProfileTabFromSearchParams,
  isProfileTabValue,
} from "./profile-tabs";

test("getProfileTabFromSearchParams resolves known tabs", () => {
  assert.equal(
    getProfileTabFromSearchParams(new URLSearchParams("tab=carteira")),
    "carteira"
  );
  assert.equal(
    getProfileTabFromSearchParams(new URLSearchParams("tab=ingressos")),
    "ingressos"
  );
});

test("getProfileTabFromSearchParams falls back to the default tab", () => {
  assert.equal(
    getProfileTabFromSearchParams(new URLSearchParams("tab=unknown")),
    DEFAULT_PROFILE_TAB
  );
  assert.equal(getProfileTabFromSearchParams(new URLSearchParams()), DEFAULT_PROFILE_TAB);
  assert.equal(getProfileTabFromSearchParams(null), DEFAULT_PROFILE_TAB);
});

test("isProfileTabValue only accepts declared tab values", () => {
  assert.equal(isProfileTabValue("seguranca"), true);
  assert.equal(isProfileTabValue("conta"), true);
  assert.equal(isProfileTabValue("perfil"), false);
  assert.equal(isProfileTabValue(undefined), false);
});

test("buildProfileTabHref keeps extra params", () => {
  assert.equal(buildProfileTabHref("ingressos"), "/profile?tab=ingressos");
  assert.equal(
    buildProfileTabHref("ingressos", { type: "upcoming" }),
    "/profile?tab=ingressos&type=upcoming"
  );
});
