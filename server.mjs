'use strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import * as crypto from 'node:crypto';

const UID_LENGTH = 64;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;
const files = new Map();

files.set('/index.html', { data: fs.readFileSync(path.join(__dirname, 'index.html')).toString().split('~%~'), contentType: 'text/html; charset=utf-8' });
files.set('/index.js', { data: fs.readFileSync(path.join(__dirname, 'index.js')), contentType: 'text/javascript; charset=utf-8' });
files.set('/index.css', { data: fs.readFileSync(path.join(__dirname, 'index.css')), contentType: 'text/css; charset=utf-8' });
files.set('/favicon.ico', { data: fs.readFileSync(path.join(__dirname, 'favicon.ico')), contentType: 'image/x-icon' });
files.set('/robots.txt', { data: fs.readFileSync(path.join(__dirname, 'robots.txt')), contentType: 'text/plain; charset=utf-8' });
files.set('/404.html', { data: fs.readFileSync(path.join(__dirname, '404.html')), contentType: 'text/html; charset=utf-8' });
files.set('/404.css', { data: fs.readFileSync(path.join(__dirname, '404.css')), contentType: 'text/css; charset=utf-8' });

let _lastReqTime = new Date(0);
let _lastIP = '';

const USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json')).toString());

const server = createServer(app);
const MAX_PAYLOAD = 100 * 1024 * 1024;
const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });
server.listen(PORT);

const clients = new Map();
const _users_session_ids = new Map(); //Пользователи, которые загрузили HTML, им выдан уникальный идентификатор.
const _users_online = new Set(); //Пользователи, которые подключились по web socket.

wss.on('connection', (ws) =>
{
	ws.on('error', console.error);
	ws.on('message', (data) =>
	{
		data = data.toString();
		const USER_SESSION_ID = data.slice(0, UID_LENGTH);
		if (_users_session_ids.has(USER_SESSION_ID))
		{
			if (!_users_online.has(USER_SESSION_ID))
			{
				_users_online.add(USER_SESSION_ID);
				clients.set(ws, USER_SESSION_ID);
			}
			data = data.slice(UID_LENGTH);
			if (data === '/list')
			{
				let list = [];
				for (let userSessionId of _users_online.values())
				{
					list.push(_users_session_ids.get(userSessionId));
				}
				sendMessageWithDateAndUserName(_users_session_ids.get(USER_SESSION_ID), `/list: ${list.join(', ')}`);
			}
			else
			{
				sendMessageWithDateAndUserName(_users_session_ids.get(USER_SESSION_ID), data);
			}
		}
		else
		{
			ws.close(1008, 'Authentication required.');
		}
	});
	ws.on('close', (code, reason) =>
	{
		const USER_SESSION_ID = clients.get(ws);
		if (USER_SESSION_ID)
		{
			const USER = _users_session_ids.get(USER_SESSION_ID);
			clients.delete(ws);
			_users_online.delete(USER_SESSION_ID);
			_users_session_ids.delete(USER_SESSION_ID);
			send(`Пользователь ${USER} вышел из чата. ${reason}`);
		}
	});
});

function sendMessageWithDateAndUserName(user, msg)
{
	const date = new Date().toLocaleString('ru-RU');
	send(`${date} ${user}: ${msg}`);
}

function send(data)
{
	for (let ws of clients.keys())
	{
		ws.send(data);
	}
}

function app(req, res)
{
	let now = new Date();
	let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
	if (now - _lastReqTime > 1000 || _lastIP !== ip) console.log(`*******${ip}, ${now.toLocaleString('ru-RU')} *******`);
	_lastReqTime = now;
	_lastIP = ip;
	const url = req.url.split('?');
	const urlPath = url[0];
	console.log('url: ' + urlPath);
	if (req.headers.authorization)
	{
		const data = req.headers.authorization.split(' ');
		if (data[0] !== 'Basic')
		{
			authForm();
		}
		else
		{
			const cred = Buffer.from(data[1], 'base64').toString().split(':');
			const user = cred[0];
			const password = cred[1];
			if (USERS[user])
			{
				const passwordInMd5 = Buffer.from(md5(Buffer.from(password))).toString('hex');
				if (USERS[user] === passwordInMd5)
				{
					normalWork(res, urlPath, user);
				}
				else
				{
					authForm();
				}
			}
			else
			{
				authForm();
			}
		}
	}
	else
	{
		authForm();
	}

	function authForm()
	{
		console.log('Authentication form');
		const msg = 'Authentication required.';
		res.writeHead(401,
			{
				'WWW-Authenticate': 'Basic realm="Please input correct username and password before viewing this page."',
				'Content-Length': msg.length,
				'Content-Type': 'text/plain'
			});
		res.end(msg);
	}

	function normalWork(res, urlPath, user)
	{
		if (urlPath === '/') urlPath = '/index.html';
		if (urlPath === '/index.html')
		{
			let USER_SESSION_ID = reverseGet(_users_session_ids, user);
			if (USER_SESSION_ID)
			{
				if (_users_online.has(USER_SESSION_ID)) //Пользователь уже имеет активный сокет.
				{
					const err = 'Данный пользователь уже авторизован. Параллельные сессии запрещены.';
					error409(err, res);
					return;
				}
			}
			else
			{
				USER_SESSION_ID = getUID(UID_LENGTH);
				_users_session_ids.set(USER_SESSION_ID, user);
			}
			const file = files.get(urlPath);
			const data = Buffer.from(file.data[0] + USER_SESSION_ID + file.data[1] + user + file.data[2]);
			sendData(res, data, file.contentType, 200, 'no-store');
		}
		else if (files.has(urlPath))
		{
			const file = files.get(urlPath);
			sendData(res, file.data, file.contentType, 200, 'max-age: 86400, immutable');
		}
		else
		{
			error404(urlPath, res);
		}
	}
}

function reverseGet(data, value) //Поиск по значению в Map
{
	for (let v of data)
	{
		if (value === v[1]) return v[0];
	}
	return null;
}

function getUID(size)
{
	const alpabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const bytes = new Uint8Array(crypto.randomBytes(size));
	let UID = '';
	for (let b of bytes)
	{
		UID += alpabet[b % alpabet.length];
	}
	return UID;
}

//Поиск и сопоставление нужных путей
function sendData(res, data, contentType, code, cacheControl)
{
	res.writeHead(code,
		{
			'Content-Length': data.length,
			'Content-Type': contentType,
			'Cache-Control': cacheControl
		});
	res.end(data);
}

function error404(err, res)
{
	console.log('Not found: ' + err);
	const file = files.get('/404.html');
	sendData(res, file.data, file.contentType, 404, 'max-age: 86400, immutable');
}

function error409(err, res)
{
	console.log('Already authorized: ' + err);
	const msgBytes = Buffer.from(err);
	res.writeHead(409,
		{
			'Content-Length': msgBytes.byteLength,
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'max-age: 86400, immutable'
		});
	res.end(msgBytes);
}

function md5(buffer)
{
	const data = new Uint8Array(buffer);
	const ABCD0 = new Uint32Array(4);
	ABCD0[0] = 0x67452301;
	ABCD0[1] = 0xefcdab89;
	ABCD0[2] = 0x98badcfe;
	ABCD0[3] = 0x10325476;

	const s1 = [7, 12, 17, 22];
	const s2 = [5, 9, 14, 20];
	const s3 = [4, 11, 16, 23];
	const s4 = [6, 10, 15, 21];
	const T = new Uint32Array([0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391]);

	//Считаем размер сообщения
	let originalMessageSize = new BigUint64Array(1);
	originalMessageSize[0] = BigInt(data.length) * 8n;
	originalMessageSize = new Uint8Array(originalMessageSize.buffer);

	//Выравниваем сообщение
	let addToMessageSize = 64 - (data.length + 8) % 64;
	if (addToMessageSize === 0) addToMessageSize = 1;
	const newData = new Uint8Array(data.length + addToMessageSize + 8);
	for (let i = 0; i < data.length; i++)
	{
		newData[i] = data[i];
	}
	newData[data.length] = 128;
	for (let i = data.length + 1; i < newData.length - 8; i++)
	{
		newData[i] = 0;
	}
	for (let i = newData.length - 8; i < newData.length; i++)
	{
		newData[i] = originalMessageSize[i - newData.length + 8];
	}

	//Работем с сообщением
	const chunk = new Uint8Array(64);
	const chunk32 = new Uint32Array(chunk.buffer);
	const ABCDF = new Uint32Array(5);
	for (let i = 0; i < newData.length / 64; i++)
	{
		for (let j = 0; j < 64; j++)
		{
			chunk[j] = newData[i * 64 + j];
		}
		for (let j = 0; j < 4; j++)
		{
			ABCDF[j] = ABCD0[j];
		}
		let g = 0;
		let s;
		for (let j = 0; j < 64; j++)
		{
			if (0 <= j && j <= 15)
			{
				ABCDF[4] = (ABCDF[1] & ABCDF[2]) | ((~ABCDF[1]) & ABCDF[3]);
				g = j;
				s = s1;
			}
			else if (16 <= j && j <= 31)
			{
				ABCDF[4] = (ABCDF[3] & ABCDF[1]) | ((~ABCDF[3]) & ABCDF[2]);
				g = (5 * j + 1) % 16;
				s = s2;
			}
			else if (32 <= j && j <= 47)
			{
				ABCDF[4] = ABCDF[1] ^ ABCDF[2] ^ ABCDF[3];
				g = (3 * j + 5) % 16;
				s = s3;
			}
			else
			{
				ABCDF[4] = ABCDF[2] ^ (ABCDF[1] | (~ABCDF[3]));
				g = (7 * j) % 16;
				s = s4;
			}
			ABCDF[4] += ABCDF[0] + T[j] + chunk32[g];
			ABCDF[0] = ABCDF[3];
			ABCDF[3] = ABCDF[2];
			ABCDF[2] = ABCDF[1];
			ABCDF[1] += cycleLeftShift(ABCDF[4], s[j % 4]);
		}
		for (let j = 0; j < 4; j++)
		{
			ABCD0[j] += ABCDF[j];
		}
	}
	return ABCD0.buffer;

	function cycleLeftShift(data, n)
	{
		return (data << n) | (data >>> 32 - n);
	}
}