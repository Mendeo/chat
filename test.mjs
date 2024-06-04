'use strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import * as crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json')).toString());
console.log(USERS);
