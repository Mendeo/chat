'use strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'node:crypto';
import login from './login.mjs';

const UID_LENGTH = 64;
const REFRESH_HTTP_SESSION_TIMEOUT = 3;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;
const files = new Map();

files.set('/index.html', { data: fs.readFileSync(path.join(__dirname, 'index.html')).toString().split('~%~'), contentType: 'text/html; charset=utf-8' });
files.set('/index.js', { data: fs.readFileSync(path.join(__dirname, 'index.js')), contentType: 'text/javascript; charset=utf-8' });
files.set('/index.css', { data: fs.readFileSync(path.join(__dirname, 'index.css')), contentType: 'text/css; charset=utf-8' });
files.set('/404.html', { data: fs.readFileSync(path.join(__dirname, '404.html')), contentType: 'text/html; charset=utf-8' });
files.set('/404.css', { data: fs.readFileSync(path.join(__dirname, '404.css')), contentType: 'text/css; charset=utf-8' });
let _hasOnMessage;

try
{
	fs.accessSync(path.join(__dirname, 'onmessage.mp3'));
	_hasOnMessage = true;
}
catch
{
	_hasOnMessage = false;
}

if (_hasOnMessage)
{
	files.set('/onmessage.mp3', { data: fs.readFileSync(path.join(__dirname, 'onmessage.mp3')), contentType: 'audio/mpeg' });
}

let _lastReqTime = new Date(0);
let _lastIP = '';

//const USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json')).toString());

const server = createServer(app);
const MAX_PAYLOAD = 100 * 1024 * 1024;
const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });
server.listen(PORT);

const clients = new Map();
const _users_session_ids = new Map(); //Пользователи, которые загрузили HTML, им выдан уникальный идентификатор.
const _users_online = new Set(); //Пользователи, которые подключились по web socket.

wss.on('connection', (ws) =>
{
	console.log(`${new Date().toLocaleString('ru-RU')}: New socket!`);
	ws.isAlive = true;
	ws.on('error', (err) =>
	{
		console.error(err);
		ws.inProgress = false;
	});
	ws.on('pong', () => ws.isAlive = true);
	ws.on('message', (data) =>
	{
		data = data.toString();
		const USER_SESSION_ID = data.slice(0, UID_LENGTH);
		if (_users_session_ids.has(USER_SESSION_ID))
		{
			const username = _users_session_ids.get(USER_SESSION_ID);
			if (!_users_online.has(USER_SESSION_ID))
			{
				_users_online.add(USER_SESSION_ID);
				clients.set(ws, USER_SESSION_ID);
				console.log(`${new Date().toLocaleString('ru-RU')}: User detected: ${username}`);
			}
			data = data.slice(UID_LENGTH);
			if (data === ':list')
			{
				let list = [];
				for (let userSessionId of _users_online.values())
				{
					list.push(_users_session_ids.get(userSessionId));
				}
				sendMessageWithDateAndUserName('<b>Server</b>', `${username} запросил list: ${list.join(', ')}`);
			}
			else if (data.startsWith(':sending-file:'))
			{
				const fileName = data.slice(14);
				sendMessageWithDateAndUserName(username, `Отправляет файл "${fileName}" и поэтому не сможет пока отвечать.`);
			}
			else if (data === ':typing')
			{
				send(`:typing${username}`, ws, false);
			}
			else
			{
				sendMessageWithDateAndUserName(username, data, ws);
			}
		}
		else
		{
			ws.close(1008, 'Authentication required.');
			console.log(`${new Date().toLocaleString('ru-RU')}: Socket closed: user not detected!`);
		}
	});
	ws.on('close', (code, reason) =>
	{
		const USER_SESSION_ID = clients.get(ws);
		if (USER_SESSION_ID)
		{
			const username = _users_session_ids.get(USER_SESSION_ID);
			clients.delete(ws);
			_users_online.delete(USER_SESSION_ID);
			_users_session_ids.delete(USER_SESSION_ID);
			sendMessageWithDateAndUserName('<b>Server</b>', `Пользователь ${username} вышел из чата.`);
			console.log(`${new Date().toLocaleString('ru-RU')}: Socket closed: user ${username} has left the chat. Code: ${code}, reason: ${reason}`);
		}
	});
});
watchDog();

function sendMessageWithDateAndUserName(username, msg, webSocket_doNotSend)
{
	const date = new Date().toLocaleString('ru-RU', { hour: 'numeric', minute: 'numeric', second: 'numeric' });
	send(`${date} ${username}: ${msg}`, webSocket_doNotSend, true);
}

function send(data, senderWebSocket, sendDeliveryStatus)
{
	let senderSessionId = senderWebSocket ? clients.get(senderWebSocket) : null;
	if (senderWebSocket && sendDeliveryStatus) senderWebSocket.send(':onserver');
	let deliveredCount = clients.size - 1;
	for (let c of clients)
	{
		const ws = c[0];
		const sid = c[1];
		if (sid !== senderSessionId)
		{
			ws.inProgress = true;
			ws.send(data, () =>
			{
				ws.inProgress = false;
				if (senderWebSocket && sendDeliveryStatus)
				{
					deliveredCount--;
					if (deliveredCount === 0) senderWebSocket.send(':onall');
				}
			});
		}
		else if (deliveredCount === 0 && sendDeliveryStatus)
		{
			senderWebSocket.send(':onall');
		}
	}
}

function watchDog()
{
	setInterval(() =>
	{
		for (let c of clients)
		{
			const ws = c[0];
			const userSessionId = c[1];
			if (!ws.isAlive)
			{
				const username = _users_session_ids.get(userSessionId);
				if (ws.inProgress) //|| ws._receiver._payloadLength
				{
					sendMessageWithDateAndUserName('<b>Server</b>', `Пользователь ${username} ещё не получил все данные, ожидаем...`);
				}
				else
				{
					clients.delete(ws);
					_users_online.delete(userSessionId);
					_users_session_ids.delete(userSessionId);
					ws.terminate();
					sendMessageWithDateAndUserName('<b>Server</b>', `Пользователь ${username} был отключён по таймауту.`);
					console.log(`${new Date().toLocaleString('ru-RU', { hour: 'numeric', minute: 'numeric', second: 'numeric' })}: User ${username} was  terminated by timeout.`);
				}
			}
			else
			{
				ws.isAlive = false;
				ws.ping();
			}
		}
	}, 29000);
}

function app(req, res)
{
	let now = new Date();
	let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
	if (now - _lastReqTime > 1000 || _lastIP !== ip) console.log(`*******${ip}, ${now.toLocaleString('ru-RU')} *******`);
	_lastReqTime = now;
	_lastIP = ip;
	const url = req.url.split('?');
	let urlPath = decodeURIComponent(url[0]);
	if (urlPath === '/') urlPath = '/index.html';
	console.log('url: ' + urlPath);

	//HTML логин
	const userdata = login(req, res, urlPath);
	if (userdata)
	{
		let cookie = null;
		if (now - userdata.timeStamp > REFRESH_HTTP_SESSION_TIMEOUT * 1000)
		{
			cookie = userdata.cookieForUpdateSessionTimeout();
		}
		normalWork(res, urlPath, userdata.username, cookie);
	}

	//Базовая аутентифакция
	// if (req.headers.authorization)
	// {
	// 	const data = req.headers.authorization.split(' ');
	// 	if (data[0] !== 'Basic')
	// 	{
	// 		authForm();
	// 	}
	// 	else
	// 	{
	// 		const cred = Buffer.from(data[1], 'base64').toString().split(':');
	// 		const username = cred[0];
	// 		const password = cred[1];
	// 		if (USERS[username])
	// 		{
	// 			const passwordInMd5 = Buffer.from(md5(Buffer.from(password))).toString('hex');
	// 			if (USERS[username] === passwordInMd5)
	// 			{
	// 				normalWork(res, urlPath, username);
	// 			}
	// 			else
	// 			{
	// 				authForm();
	// 			}
	// 		}
	// 		else
	// 		{
	// 			authForm();
	// 		}
	// 	}
	// }
	// else if (urlPath === '/robots.txt')
	// {
	// 	const file = files.get(urlPath);
	// 	sendData(res, file.data, file.contentType, 200, 'max-age: 31536000, immutable');
	// }
	// else
	// {
	// 	authForm();
	// }

	// function authForm()
	// {
	// 	console.log('Authentication form');
	// 	const msg = 'Authentication required.';
	// 	res.writeHead(401,
	// 		{
	// 			'WWW-Authenticate': 'Basic realm="Please input correct username and password before viewing this page."',
	// 			'Content-Length': msg.length,
	// 			'Content-Type': 'text/plain'
	// 		});
	// 	res.end(msg);
	// }

	function normalWork(res, urlPath, username, cookie)
	{
		if (urlPath === '/index.html')
		{
			let USER_SESSION_ID = reverseGet(_users_session_ids, username);
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
				_users_session_ids.set(USER_SESSION_ID, username);
			}
			const file = files.get(urlPath);
			let onmessageAudioTag = '';
			if (_hasOnMessage)
			{
				onmessageAudioTag = '\n\t<audio id="onmessage-audio" src="onmessage.mp3" preload="auto"></audio>';
			}
			const data = Buffer.from(file.data[0] + username + file.data[1] + USER_SESSION_ID + file.data[2] + username + file.data[3] + onmessageAudioTag + file.data[4]);
			sendData(res, data, file.contentType, 200, 'no-store', cookie);
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
	const bytes = new Uint8Array(randomBytes(size));
	let UID = '';
	for (let b of bytes)
	{
		UID += alpabet[b % alpabet.length];
	}
	return UID;
}

//Поиск и сопоставление нужных путей
function sendData(res, data, contentType, code, cacheControl, cookie)
{
	const headers =
	{
		'Content-Length': data.length,
		'Content-Type': contentType,
		'Cache-Control': cacheControl
	};
	if (cookie)
	{
		if (cookie?.length)
		{
			headers['Set-Cookie'] = cookie;
		}
	}
	res.writeHead(code, headers);
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
