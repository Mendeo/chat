'use strict';
const chatArea = document.getElementById('chat-area');
const msgInput = document.getElementById('input-text');
const submit = document.getElementById('submit');
const USER_SESSION_ID = document.querySelector('[data-user-session-id]').getAttribute('data-user-session-id');

chatArea.value = '';
const socket = new WebSocket(`ws://${location.host}`);
socket.addEventListener('open', ()=>
{
	socket.send(USER_SESSION_ID + '+');
	submit.addEventListener('click', ()=>
	{
		if (msgInput.checkValidity())
		{
			socket.send(USER_SESSION_ID + msgInput.value);
			msgInput.value = '';
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
				socket.send(`${USER_SESSION_ID}file:${f.name};${r.result}`);
			});
		}
	});
});

const filesList = document.querySelector('#files-list > ul');
socket.addEventListener('message', (e)=>
{
	const fileStart = e.data.indexOf('file:');
	let linkStart = -1;
	if (fileStart !== -1) linkStart = e.data.indexOf(';data:text/xml;base64,', fileStart);
	if (linkStart !== -1)
	{
		const fileName = e.data.slice(fileStart + 5, linkStart);
		chatArea.value += `${e.data.slice(0, fileStart)}Отправлен файл "${fileName}"\n`;
		const li = document.createElement('li');
		const link = document.createElement('a');
		link.innerText = fileName;
		link.href = e.data.slice(linkStart + 1);
		link.download = fileName;
		if (fileName.length > 20) link.title = fileName;
		li.append(link);
		filesList.append(li);
	}
	else
	{
		chatArea.value += e.data + '\n';
	}
});
socket.addEventListener('error', (e)=>
{
	chatArea.value += 'Ошибка отправки сообщения! ' + e;
});
socket.addEventListener('close', (e)=>
{
	if (e.wasClean)
	{
		chatArea.value += `Соединение закрыто чисто, код=${e.code} причина=${e.reason}`;
	}
	else
	{
		chatArea.value += 'Соединение прервано';
	}
});
msgInput.addEventListener('input', ()=>
{
	msgInput.reportValidity();
});
msgInput.addEventListener('keydown', (e) =>
{
	if (e.code === 'Enter' || e.code === 'NumpadEnter')
	{
		submit.click();
	}
});

const commandsButtons = document.querySelectorAll('#commands > button');
const commands = ['/list'];
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
