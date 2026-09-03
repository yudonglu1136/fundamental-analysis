import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const hookPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".platform",
  "hooks",
  "postdeploy",
  "02-install-guru-price-repair.sh"
);
const nginxPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".platform",
  "nginx",
  "conf.d",
  "elasticbeanstalk",
  "00-deny-public-internal.conf"
);

test("postdeploy repair remains synchronous and marks success only through the dynamic full-curve gate", () => {
  const source = fs.readFileSync(hookPath, "utf8");
  assert.match(source, /umask 077/);
  assert.match(source, /GURU_PRICE_REPAIR_ENCRYPTED_SNAPSHOT_ID/);
  assert.match(source, /GuruPriceRepairRelease/);
  assert.match(source, /GuruPriceRepairSourceSnapshot/);
  assert.match(source, /latest\/meta-data\/instance-id/);
  assert.match(source, /describe-instances/);
  assert.match(source, /GURU_PREWARM_REFRESH_TIMEOUT_MS:-1500000/);
  assert.match(source, /--success-marker="\$\{success_marker\}"/);
  assert.equal(source.includes("nohup"), false);
  assert.equal(source.includes("touch \"${success_marker}\""), false);
  assert.ok(source.indexOf("scripts/prewarm-guru-curves.mjs") < source.indexOf("chmod 600 \"${prewarm_report}\" \"${success_marker}\""));
});

test("Elastic Beanstalk allows both 25-minute prewarm windows to finish", () => {
  const timeoutPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    ".ebextensions",
    "01-command-timeout.config"
  );
  assert.match(fs.readFileSync(timeoutPath, "utf8"), /Timeout:\s*3600/);
});

test("Elastic Beanstalk nginx rejects the complete public internal namespace", () => {
  const source = fs.readFileSync(nginxPath, "utf8");
  assert.match(source, /location ~\* \^\/api\/internal\(\?:\/\|\$\)\s*\{\s*return 404;/s);
});
