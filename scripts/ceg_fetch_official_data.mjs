#!/usr/bin/env node
console.log(JSON.stringify({
  ticker: "CEG",
  status: "manual_source_present",
  sources: [
    "data/local/ceg/sec/companyfacts.json",
    "data/local/ceg/market/nasdaq_ceg_chart.json",
    "data/local/ceg/market/nasdaq_spy_chart.json"
  ],
  note: "CEG official source payloads were fetched into data/local before module build; re-fetch automation can be expanded later.",
}, null, 2));
