'use strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import { randomBytes, createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_TIMEOUT = 600;
const USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json')).toString());
const sessions = new Map();
const loginExceptions = new Set();

const cachedFiles = new Map();
const loginErrorHtml = '<p class="error">Пользователя с таким именем и паролем не найдено. Попробуйте ещё раз.</p>';
cachedFiles.set('/login.html', { data: Buffer.from(fs.readFileSync(path.join(__dirname, 'login.html')).toString().replace('~%~', '')), contentType: 'text/html; charset=utf-8' });
cachedFiles.set('/login_error.html', { data: Buffer.from(fs.readFileSync(path.join(__dirname, 'login.html')).toString().replace('~%~', loginErrorHtml)), contentType: 'text/html; charset=utf-8' });
cachedFiles.set('/login.css', { data: fs.readFileSync(path.join(__dirname, 'login.css')), contentType: 'text/css; charset=utf-8' });
cachedFiles.set('/favicon.ico', { data: fs.readFileSync(path.join(__dirname, 'favicon.ico')), contentType: 'image/x-icon' });
cachedFiles.set('/robots.txt', { data: fs.readFileSync(path.join(__dirname, 'robots.txt')), contentType: 'text/plain; charset=utf-8' });

loginExceptions.add('/login.css');
loginExceptions.add('/favicon.ico');
loginExceptions.add('/robots.txt');

export default function (req, res, urlPath)
{
	const sessionId = login(req, res, urlPath);
	if (sessionId)
	{
		const userdata = sessions.get(sessionId);
		return { username: userdata.username, cookieForUpdateSessionTimeout: () => updateSessionTimeout(sessionId, userdata) };
	}
	return null;

	function updateSessionTimeout(sessionId, userdata)
	{
		clearTimeout(userdata.timerId);
		userdata.timerId = setTimeout(() =>
		{
			sessions.delete(sessionId);
		}, SESSION_TIMEOUT * 1000);
		sessions.set(sessionId, userdata);
		const cookie = generateSessionCookie(sessionId, userdata.username);
		return cookie;
	}

	function login(req, res, urlPath)
	{
		const cookie = parseCookie(req.headers?.cookie);
		if (urlPath === '/credentials')
		{
			const contentType = req.headers['content-type']?.split(';')[0].trim();
			if (contentType === 'application/x-www-form-urlencoded')
			{
				getPostBody(req, (err, postBody) =>
				{
					if (err)
					{
						console.log(err.message);
						res.end('Error occured while handling request!');
						return null;
					}
					else
					{
						const reqPostData = parseRequest(postBody);
						//console.log(reqPostData);
						if (Object.prototype.hasOwnProperty.call(USERS, reqPostData?.username))
						{
							const username = reqPostData?.username;
							const passwordHash = USERS[username];
							if (passwordHash === createHash('sha256').update(reqPostData?.password).digest('hex'))
							{
								let reflink = '/index.html';
								if (cookie?.reflink) reflink = cookie.reflink;
								const sessionId = generateSessionId();
								const sessionCookie = generateSessionCookie(sessionId, username);
								if (cookie?.reflink) sessionCookie.push('reflink=/; path=/; max-age=0; samesite=strict');
								const timerId = setTimeout(() =>
								{
									sessions.delete(sessionId);
								}, SESSION_TIMEOUT * 1000);
								sessions.set(sessionId, { username, timerId, timeStamp: Date.now() });
								reload(res, reflink, sessionCookie);
							}
							else
							{
								reload(res, '/login_error.html');
							}
						}
						else
						{
							reload(res, '/login_error.html');
						}
					}
				});
				return null;
			}
			else
			{
				reload(res, '/login.html');
				return null;
			}
		}
		else
		{
			let sessionId = null;
			if (cookie?.sessionId && sessions.has(cookie.sessionId)) sessionId = cookie.sessionId;
			if (urlPath === '/login.html' || urlPath === '/login_error.html')
			{
				if (sessionId)
				{
					reload(res, '/index.html');
					return null;
				}
				else
				{
					sendFileByUrl(res, urlPath, 200);
					return null;
				}
			}
			else if (urlPath === '/logout')
			{
				if (sessionId)
				{
					const userdata = sessions.get(sessionId);
					const cookie = deleteSessionCookie(sessionId, userdata.username);
					clearTimeout(userdata.timerId);
					sessions.delete(sessionId);
					reload(res, '/login.html', cookie);
					return null;
				}
				reload(res, '/login.html');
				return null;
			}
			//Исключения
			else if (loginExceptions.has(urlPath))
			{
				sendFileByUrl(res, urlPath, 200);
				return null;
			}
			else
			{
				if (sessionId)
				{
					return sessionId;
				}
				else
				{
					reload(res, '/login.html', [`reflink=${encodeURI(urlPath)}; path=/; max-age=${SESSION_TIMEOUT}; samesite=strict`]);
					return null;
				}
			}
		}
	}

	function generateSessionCookie(sessionId) //, username)
	{
		const sessionCookie = [];
		sessionCookie.push(`sessionId=${sessionId}; path=/; max-age=${SESSION_TIMEOUT}; samesite=strict; httpOnly`);
		//sessionCookie.push(`username=${username}; path=/; max-age=${SESSION_TIMEOUT}; samesite=strict`);
		return sessionCookie;
	}

	function deleteSessionCookie(sessionId) //, username)
	{
		const sessionCookie = [];
		sessionCookie.push(`sessionId=${sessionId}; path=/; max-age=0; samesite=strict; httpOnly`);
		//sessionCookie.push(`username=${username}; path=/; max-age=0; samesite=strict`);
		return sessionCookie;
	}

	function reload(res, url, cookie)
	{
		const headers =
		{
			'Content-Security-Policy': 'default-src \'self\'',
			'Refresh': `0;url=${url}`
		};
		if (cookie)
		{
			if (cookie?.length)
			{
				headers['Set-Cookie'] = cookie;
			}
		}
		res.writeHead(200, headers);
		res.end();
	}

	function generateSessionId()
	{
		const size = 64;
		let key = Buffer.from(randomBytes(size)).toString('base64url');
		while (sessions.has(key))
		{
			key = Buffer.from(randomBytes(size)).toString('base64url');
		}
		return key;
	}

	function getPostBody(req, callback)
	{
		const size = Number(req.headers['content-length']);
		if (isNaN(size))
		{
			callback({ message: 'Content-Length header is invalid' });
		}
		else if (size > 10000)
		{
			callback({ message: 'Post body size is too big' });
		}
		else
		{
			let postChunks = [];
			let postLength = 0;
			req.on('data', (chunk) =>
			{
				postLength += chunk.byteLength;
				if (postLength > size)
				{
					req.destroy();
					console.log('The request was destroyed due to a size error.');
					return;
				}
				else
				{
					postChunks.push(chunk);
				}
			});
			req.on('error', (err) =>
			{
				console.log('An error occured while reading request!');
				console.log(err);
				req.destroy();
			});
			req.on('end', () =>
			{
				//console.log('all post data received');
				if (postLength !== size)
				{
					callback({ message: 'Not all data received' });
				}
				else if (postLength === 0)
				{
					callback({ message: 'Size of post data is 0' });
				}
				else
				{
					let postBody = Buffer.concat(postChunks);
					callback(null, postBody.toString());
				}
			});
		}
	}

	function parseCookie(cookie)
	{
		if (!cookie) return null;
		let cookieObj = {};
		for (let c of cookie.split(';'))
		{
			const aux = c.split('=');
			const key = aux[0].trim();
			const value = aux[1].trim();
			cookieObj[key] = value;
		}
		return cookieObj;
	}

	function parseRequest(str)
	{
		let params = null;
		if (str)
		{
			params = {};
			str = str.split('&');
			str.forEach((p) =>
			{
				let keyVal = p.split('=');
				params[decodeURIComponent(keyVal[0])] = decodeURIComponent(keyVal[1]);
			});
		}
		return params;
	}
}

function sendFileByUrl(res, urlPath, code, cookie)
{
	if (cachedFiles.has(urlPath))
	{
		const file = cachedFiles.get(urlPath);
		//'Cache-Control': 'max-age=86400'
		const headers =
		{
			'Content-Length': file.data.length,
			'Content-Type': file.contentType,
			'Cache-Control': 'max-age: 86400, immutable',
			'Content-Security-Policy': 'default-src \'self\''
		};
		if (cookie)
		{
			if (cookie?.length)
			{
				headers['Set-Cookie'] = cookie;
			}
		}
		res.writeHead((code && !isNaN(code)) ? code : 200, headers);
		res.end(file.data);
	}
	else
	{
		res.writeHead(404);
		res.end();
	}
}