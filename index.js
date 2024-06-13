'use strict';
const chatArea = document.getElementById('chat-area');
const msgInput = document.getElementById('input-text');
const submit = document.getElementById('submit');
const errorElement = document.getElementById('max-payload-size-exceeded-error');
const dataElement = document.querySelector('[data-user-session-id]');
const USER_SESSION_ID = dataElement.getAttribute('data-user-session-id');
const USER_NAME = dataElement.getAttribute('data-user-name');
const onmessageAudio = document.getElementById('onmessage-audio');
const statusElement = document.querySelector('.status');
const filesList = document.querySelector('#files-list > ul');
const typingCheckbox = document.getElementById('send-typing');
const typingStatus = document.getElementById('typing-status');
const typingUsers = document.querySelector('#typing-status > span');

const MAX_PAYLOAD = 100 * 1024 * 1024;
const TITLE = 'Mendeo chat';
let _titleChanged = false;
const STATUS_NO_CONNECTED = 0;
const STATUS_IN_PROGRESS = 1;
const STATUS_DELIVERED_TO_SERVER = 2;
const STATUS_DELIVERED_TO_ALL = 3;

const TYPING_SEND_INTERVAL = 1500;
let _typingTimeoutId = null;
const INPUT_HISTORY_LENGTH = 30;
const TIME_FROM_PREVIOUS_MESSAGE_TO_NOTIFICATE = 30000;

let _current_input_history_size = 0;
let _histCount = -1; //Счётчик нажатия кнопки вверх или вниз.
let _lastMessageTime = Date.now();
let _lastTypingSend = Date.now();

const STORAGE_KEY_SEND_TYPING = 'send_typing';
if (sessionStorage.getItem(STORAGE_KEY_SEND_TYPING) === 'false')
{
	typingCheckbox.checked = false;
}

window.addEventListener('focus', onUserActive);
window.addEventListener('click', onUserActive);

function onUserActive()
{
	if (_titleChanged)
	{
		document.title = TITLE;
		_titleChanged = false;
	}
}

chatArea.innerText = '';
const socket = new WebSocket(`ws://${location.host}`);
socket.addEventListener('open', ()=>
{
	socket.send(USER_SESSION_ID + '+');
	setDeliveredStatus(STATUS_DELIVERED_TO_ALL);
	submit.addEventListener('click', ()=>
	{
		_histCount = -1; //Сбрасываем листатель истории, чтобы по стрелочке вверх ввелась предыдущая команда.
		if (msgInput.checkValidity())
		{
			const msg = USER_SESSION_ID + msgInput.value;
			const msgSize = new TextEncoder().encode(msg).length;
			if (msgSize <= MAX_PAYLOAD)
			{
				socket.send(msg);
				if (msgInput.value[0] !== ':')
				{
					showMessageWithDateAndUserName(msgInput.value);
					setDeliveredStatus(STATUS_IN_PROGRESS);
					queueSet(msgInput.value);
				}
				msgInput.value = '';
			}
			else
			{
				showError(errorElement, 3000);
			}
		}
	});
	const inputFiles = document.getElementById('add-files');
	inputFiles.addEventListener('change', () =>
	{
		for (let f of inputFiles.files)
		{
			const r = new FileReader();
			r.readAsDataURL(f);
			r.addEventListener('load', () =>
			{
				const msg = `${USER_SESSION_ID}file:${f.name};${r.result}`;
				const msgSize = new TextEncoder().encode(msg).length;
				if (msgSize <= MAX_PAYLOAD)
				{
					setDeliveredStatus(STATUS_IN_PROGRESS);
					socket.send(`${USER_SESSION_ID}:sending-file:${f.name}`);
					socket.send(msg);
					createFileLink(f.name, r.result);
				}
				else
				{
					showError(errorElement, 3000);
				}
			});
		}
		inputFiles.value = '';
	});
	msgInput.addEventListener('input', ()=>
	{
		if (msgInput.reportValidity() && typingCheckbox.checked)
		{
			const currentTime = Date.now();
			if (currentTime - _lastTypingSend > TYPING_SEND_INTERVAL)
			{
				setDeliveredStatus(STATUS_IN_PROGRESS);
				socket.send(`${USER_SESSION_ID}:typing`);
				_lastTypingSend = currentTime;
			}
		};
		_histCount = -1;
	});
});

socket.addEventListener('message', (e)=>
{
	if (e.data === ':onserver')
	{
		setDeliveredStatus(STATUS_DELIVERED_TO_SERVER);
	}
	else if (e.data === ':onall')
	{
		setDeliveredStatus(STATUS_DELIVERED_TO_ALL);
	}
	else if (e.data.startsWith(':typing'))
	{
		if (_typingTimeoutId)
		{
			clearTimeout(_typingTimeoutId);
			_typingTimeoutId = null;
		}
		const username = e.data.slice(7);
		let users = '';
		if (typingStatus.hidden)
		{
			typingStatus.hidden = false;
			users = username;
		}
		else
		{
			users = `${typingUsers.innerText}, ${username}`;
		}
		typingUsers.innerText = users;
		_typingTimeoutId = setTimeout(() =>
		{
			typingStatus.hidden = true;
			typingUsers.innerText = '';
			_typingTimeoutId = null;
		}, TYPING_SEND_INTERVAL);
	}
	else
	{
		const fileStart = e.data.indexOf('file:');
		let linkStart = -1;
		if (fileStart !== -1) linkStart = e.data.indexOf(';data:', fileStart);
		if (linkStart !== -1)
		{
			const fileName = e.data.slice(fileStart + 5, linkStart);
			chatArea.innerText += `${e.data.slice(0, fileStart)}Отправлен файл "${fileName}".\n`;
			const href = e.data.slice(linkStart + 1);
			const mimeStart = e.data.indexOf(';', linkStart + 6);
			const mimeType = e.data.slice(linkStart + 6, mimeStart);
			createFileLink(fileName, href, mimeType);
		}
		else
		{
			chatArea.innerText += e.data + '\n';
		}
		chatArea.scrollTo(0, chatArea.scrollHeight);
		notificate();
	}
});
socket.addEventListener('error', (e)=>
{
	chatArea.innerText += 'Ошибка отправки сообщения! ' + e;
});
socket.addEventListener('close', (e)=>
{
	if (e.wasClean)
	{
		chatArea.innerText += `Соединение закрыто чисто, код=${e.code} причина=${e.reason}`;
	}
	else
	{
		chatArea.innerText += 'Соединение прервано';
	}
	setDeliveredStatus(STATUS_NO_CONNECTED);
	notificate();
});
msgInput.addEventListener('keydown', (e) =>
{
	if (e.code === 'Enter' || e.code === 'NumpadEnter')
	{
		submit.click();
	}
});
msgInput.addEventListener('keydown', (e) =>
{
	if (e.code === 'ArrowUp')
	{
		e.preventDefault();
		if (_histCount < _current_input_history_size - 1)
		{
			_histCount++;
			const hist = queueGet(_histCount);
			console.log(hist, _histCount, _current_input_history_size);
			if (hist) msgInput.value = hist;
		}
	}
	else if (e.code === 'ArrowDown')
	{
		e.preventDefault();
		if (_histCount > 0)
		{
			_histCount--;
			const hist = queueGet(_histCount);
			console.log(hist, _histCount, _current_input_history_size);
			if (hist) msgInput.value = hist;
		}
	}
});
typingCheckbox.addEventListener('change', () =>
{
	sessionStorage.setItem(STORAGE_KEY_SEND_TYPING, typingCheckbox.checked);
});

const commandsButtons = document.querySelectorAll('#commands > button');
const commands = [':list'];
for (let i = 0; i < commands.length; i++)
{
	const b = commandsButtons[i];
	const c = commands[i];
	b.addEventListener('click', () =>
	{
		msgInput.value = c;
		submit.click();
	});
}

function showError(errorElement, timeout)
{
	errorElement.classList.remove('invisible');
	setTimeout(() =>
	{
		errorElement.classList.add('invisible');
	}, timeout);
}

function notificate()
{
	const currentTime = Date.now();
	if (document.hidden || currentTime - _lastMessageTime > TIME_FROM_PREVIOUS_MESSAGE_TO_NOTIFICATE)
	{
		document.title = '***' + TITLE + '***';
		_titleChanged = true;
		if (onmessageAudio) onmessageAudio.play();
	}
	_lastMessageTime = currentTime;
}

function showMessageWithDateAndUserName(msg)
{
	const date = new Date().toLocaleString('ru-RU', { hour: 'numeric', minute: 'numeric', second: 'numeric' });
	chatArea.innerText += `${date} ${USER_NAME}: ${msg}\n`;
	chatArea.scrollTo(0, chatArea.scrollHeight);
}

function setDeliveredStatus(status)
{
	if (status === STATUS_IN_PROGRESS)
	{
		statusElement.classList.remove('status__delivered_to_server');
		statusElement.classList.remove('status__delivered_to_all');
		statusElement.classList.remove('status__no_connected');
		statusElement.classList.add('status__in_progress');
	}
	else if (status === STATUS_DELIVERED_TO_SERVER)
	{
		statusElement.classList.remove('status__in_progress');
		statusElement.classList.remove('status__delivered_to_all');
		statusElement.classList.remove('status__no_connected');
		statusElement.classList.add('status__delivered_to_server');
	}
	else if (status === STATUS_DELIVERED_TO_ALL)
	{
		statusElement.classList.remove('status__delivered_to_server');
		statusElement.classList.remove('status__in_progress');
		statusElement.classList.remove('status__no_connected');
		statusElement.classList.add('status__delivered_to_all');
	}
	else if (status === STATUS_NO_CONNECTED)
	{
		statusElement.classList.remove('status__delivered_to_server');
		statusElement.classList.remove('status__delivered_to_all');
		statusElement.classList.remove('status__in_progress');
		statusElement.classList.add('status__no_connected');
	}
}

function createFileLink(fileName, href, mimeType)
{
	const li = document.createElement('li');
	const link = document.createElement('a');
	link.innerText = fileName;
	link.href = href;
	link.target = '_blank';
	if (mimeType === 'application/octet-stream') link.download = fileName;
	if (fileName.length > 20) link.title = fileName;
	li.append(link);
	filesList.append(li);
}

const _queue = new Array(INPUT_HISTORY_LENGTH);
let _queueShift = 0;

function queueSet(data)
{
	if (queueHas(data)) return;
	_queue[_queueShift] = data;
	_queueShift++;
	if (_queueShift === _queue.length) _queueShift = 0;
	if (_current_input_history_size < INPUT_HISTORY_LENGTH) _current_input_history_size++;
}

function queueHas(data)
{
	for (let q of _queue)
	{
		if (q === data) return true;
	}
	return false;
}

function queueGet(index)
{
	let arrayIndex = _queueShift - 1 - index;
	if (arrayIndex < 0) arrayIndex = _queue.length + arrayIndex;
	return _queue[arrayIndex];
}
