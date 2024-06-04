'use strict';
const chatArea = document.getElementById('chat-area');
const msgInput = document.getElementById('input-text');
const submit = document.getElementById('submit');

chatArea.value = '';
const socket = new WebSocket(`ws://${location.host}`);
socket.addEventListener('open', ()=>
{
	submit.addEventListener('click', ()=>
	{
		if (msgInput.checkValidity())
		{
			socket.send(msgInput.value);
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
