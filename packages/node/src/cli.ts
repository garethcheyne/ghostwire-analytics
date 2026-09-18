#!/usr/bin/env node
import { main } from './cli-main';

// exitCode rather than process.exit(): exiting while fetch connections close crashes Node on Windows.
main().then(
  code => {
    process.exitCode = code;
  },
  error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
