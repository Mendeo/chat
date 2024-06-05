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
});
socket.addEventListener('message', (e)=>
{
	chatArea.value += e.data + '\n';
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

const inputFiles = document.getElementById('add-files');
const filesList = document.querySelector('#files-list > ul');
inputFiles.addEventListener('change', () =>
{
	for (let f of inputFiles.files)
	{
		const li = document.createElement('li');
		const link = document.createElement('a');
		link.innerText = f.name;
		link.href = URL.createObjectURL(f);
		link.download = f.name;
		if (f.name.length > 20) link.title = f.name;
		li.append(link);
		filesList.append(li);
	}
});