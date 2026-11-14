// The core, full repo (everything present): today's behaviour with mail items. Cases in core-cases.mjs
import { coreTests } from './core-cases.mjs'; import { makeBox } from './helpers.mjs';
coreTests('full', makeBox);
