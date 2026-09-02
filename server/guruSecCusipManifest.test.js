import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  cusipsFromInformationTable,
  holdingsFromInformationTable,
  selectTopCommonLongHoldings
} from "../scripts/build-guru-sec-cusip-manifest.mjs";

test("SEC manifest parser extracts deterministic exact CUSIPs and source identity", () => {
  const xml = `
    <informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
      <infoTable>
        <nameOfIssuer>  Example   Holdings Inc. </nameOfIssuer>
        <titleOfClass>COM</titleOfClass>
        <cusip>123456789</cusip>
      </infoTable>
      <infoTable>
        <nameOfIssuer>Foreign Example PLC</nameOfIssuer>
        <titleOfClass>SPONSORED ADS</titleOfClass>
        <cusip>g12345678</cusip>
      </infoTable>
      <infoTable>
        <nameOfIssuer>Duplicate Row</nameOfIssuer>
        <titleOfClass>CALL</titleOfClass>
        <cusip>123456789</cusip>
      </infoTable>
    </informationTable>`;

  assert.deepEqual(cusipsFromInformationTable(xml), ["123456789", "G12345678"]);
  assert.deepEqual(holdingsFromInformationTable(xml).map(({ cusip, issuer }) => ({ cusip, issuer })), [
    { cusip: "123456789", issuer: "Duplicate Row" },
    { cusip: "123456789", issuer: "Example Holdings Inc." },
    { cusip: "G12345678", issuer: "Foreign Example PLC" }
  ]);
});

test("SEC manifest selection aggregates duplicate CUSIPs before top-N ranking", () => {
  const selected = selectTopCommonLongHoldings([
    { cusip: "111111111", issuer: "Alpha", title: "COM", putCall: "", shareType: "SH", reportedValue: 40 },
    { cusip: "111111111", issuer: "Alpha A", title: "COM", putCall: "", shareType: "SH", reportedValue: 35 },
    { cusip: "222222222", issuer: "Beta", title: "COM", putCall: "", shareType: "SH", reportedValue: 60 },
    { cusip: "333333333", issuer: "Gamma", title: "CALL", putCall: "CALL", shareType: "SH", reportedValue: 1000 },
    { cusip: "444444444", issuer: "Delta", title: "PRN", putCall: "", shareType: "PRN", reportedValue: 1000 }
  ], 1);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].cusip, "111111111");
  assert.equal(selected[0].reportedValue, 75);
  assert.deepEqual([...selected[0].issuerNames].sort(), ["Alpha", "Alpha A"]);
});

test("SEC manifest builder has no database or derived-cache input option", () => {
  const source = fs.readFileSync(
    new URL("../scripts/build-guru-sec-cusip-manifest.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /--(?:guru-)?db|sqlite3|readGuruBacktest|readGuruSnapshot/i);
  assert.match(source, /data\.sec\.gov\/submissions/);
  assert.match(source, /www\.sec\.gov\/Archives\/edgar\/data/);
});
