#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Public build metadata contains no environment values, account details or
// credentials. Consumers must match its SHA to main.dart.js before trusting it.
export function verifyWorkflowArtifact(output, expected) {
  if (expected !== 'true' && expected !== 'false') {
    throw new Error('Expected workflow flag must be true or false.');
  }
  const enabled = expected === 'true';
  const entry = fs.readFileSync(path.join(output, 'main.dart.js'));
  const source = entry.toString('utf8');
  const enabledMarker = 'thesisforge-workflow-enabled-v1';
  const disabledMarker = 'thesisforge-workflow-disabled-v1';
  if (!source.includes(enabled ? enabledMarker : disabledMarker)
      || source.includes(enabled ? disabledMarker : enabledMarker)) {
    throw new Error(`Compiled workflow branch does not match expected ${expected}; refusing the artifact.`);
  }
  const metadata = {
    schemaVersion: 1,
    investmentWorkflowEnabled: enabled,
    mainDartJsSha256: createHash('sha256').update(entry).digest('hex'),
  };
  fs.writeFileSync(path.join(output, 'thesisforge-build.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , output, expected] = process.argv;
    if (!output) throw new Error('An existing Flutter build output directory is required.');
    const metadata = verifyWorkflowArtifact(output, expected);
    process.stdout.write(`Verified compiled workflow=${metadata.investmentWorkflowEnabled}; main.dart.js SHA-256 ${metadata.mainDartJsSha256}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
