#!/usr/bin/env node
/* eslint-disable node/no-path-concat */
import { runArgsInProcess } from '@comunica/runner-cli';

runArgsInProcess(`${__dirname}/../`, `${__dirname}/../config/config-default.json`);
