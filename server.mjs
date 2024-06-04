'use strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;
const files = new Map();

files.set('/index.html', { data: fs.readFileSync(path.join(__dirname, 'index.html')), contentType: 'text/html; charset=utf-8' });
files.set('/index.js', { data: fs.readFileSync(path.join(__dirname, 'index.js')), contentType: 'text/javascript; charset=utf-8' });
files.set('/index.css', { data: fs.readFileSync(path.join(__dirname, 'index.css')), contentType: 'text/css; charset=utf-8' });
files.set('/favicon.ico', { data: fs.readFileSync(path.join(__dirname, 'favicon.ico')), contentType: 'image/x-icon' });
files.set('/robots.txt', { data: fs.readFileSync(path.join(__dirname, 'robots.txt')), contentType: 'text/plain; charset=utf-8' });
files.set('/404.html', { data: fs.readFileSync(path.join(__dirname, '404.html')), contentType: 'text/html; charset=utf-8' });
files.set('/404.css', { data: fs.readFileSync(path.join(__dirname, '404.css')), contentType: 'text/css; charset=utf-8' });

let _lastReqTime = new Date(0);
let _lastIP = '';

const USER = 'Themen';

const server = createServer(app);
const wss = new WebSocketServer({ server });
server.listen(PORT);

const clients = new Set();
wss.on('connection', (ws) =>
{
	clients.add(ws);
	ws.on('error', console.error);
	ws.on('message', (data) =>
	{
		send(data);
	});
	ws.on('close', (code, reason) =>
	{
		clients.delete(ws);
		send('Пользователь вышел из чата.' + reason);
	});
});

function send(data)
{
	for (let ws of clients)
	{
		ws.send(data.toString());
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
	sendFileByUrl(res, urlPath, 200);
}

//Поиск и сопоставление нужных путей
function sendFileByUrl(res, urlPath, code)
{
	if (urlPath === '/') urlPath = '/index.html';
	if (files.has(urlPath))
	{
		const file = files.get(urlPath);
		if (urlPath === '/index.html')
		{
			const fileArray = file.data.toString().split('~%~');
			file.data = Buffer.from(fileArray.join(USER));
		}
		res.writeHead((code && !isNaN(code)) ? code : 200,
			{
				'Content-Length': file.data.length,
				'Content-Type': file.contentType
			});
		res.end(file.data);
	}
	else
	{
		error(urlPath, res);
	}
}

function error(err, res)
{
	console.log('Not found: ' + err);
	sendFileByUrl(res, '/404.html', 404);
}
