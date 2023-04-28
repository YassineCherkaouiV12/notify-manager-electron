const electron = require('electron');

let _loaded = false;
let position = 1;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

window.addEventListener('DOMContentLoaded', () => _loaded = true);

electron.ipcRenderer.once('load-position', async(_, _position) => {
    while(!_loaded) await delay(1000);
    document.body.className = 'position-' + _position;
    position = _position;
});

electron.ipcRenderer.once('custom-style', async(_, style) => {
    if(!style || `${style}`.length < 1) return;
    const element = document.createElement('style');
    element.innerHTML = style;
    document.head.appendChild(element);
});

electron.ipcRenderer.on('show', async(_, notify, click) => {
    //console.log(notify)
    while(!_loaded) await delay(1000);

    const block = document.getElementById('block');

    const parent = document.createElement('div');
    parent.className = 'notify';
    parent.id = notify.id;
    if(click) parent.className += ' clickActive';
    if(block.children < 1 || position == 2 || position == 3){
        block.appendChild(parent);
    }else{
        block.insertBefore(parent, block.children[0]);
    }
    
    const title = document.createElement('span');
    title.className = 'title';
    title.innerHTML = notify.title;
    parent.appendChild(title);
    
    const area = document.createElement('div');
    area.style = 'display: flex;';
    parent.appendChild(area);

    if(notify.image){
        const img = document.createElement('img');
        img.src = notify.image;
        area.appendChild(img);
    }
    const body = document.createElement('p');
    body.innerHTML = notify.body;
    area.appendChild(body);

    let hideActive = false;
    let blockHide = false;
    let globalLock = false;
    let offsetX = 0;
    parent.onmousedown = (ev) => {
        if(blockHide) return;
        hideActive = true;
        offsetX = parent.offsetLeft - ev.clientX;
    };
    parent.onmouseup = () => {
        if(globalLock) return;
        hideActive = false;
        offsetX = 0;
        blockHide = true;
        (async() => {
            const pos = parseInt(parent.style.left.replace('px', ''));
            if(pos < 1){
                parent.style.left = 0;
                blockHide = false;
                return;
            }
            const ms = (pos / 300 * 1000) / 50;
            const per = pos / 50;
            for (let i = 0; i < 50; i++) {
                parent.style.left = (pos - (per * i)) + 'px';
                await new Promise(res => setTimeout(() => res(), ms));
            }
            parent.style.left = 0;
            blockHide = false;
        })();
    };
    parent.onmousemove = (ev) => {
        if(!hideActive) return;
        const _px = (ev.clientX + offsetX);
        if(_px < 0 && (position == 1 || position == 2)) return;
        if(_px > 0 && (position == 3 || position == 4)) return;
        if(_px > 130 || _px < -130){
            hideActive = true;
            blockHide = true;
            globalLock = true;
            parent.id = '';
            parent.className += ' hide';
            setTimeout(() => {
                try{parent.outerHTML = '';}catch{}
                electron.ipcRenderer.send('notify-manager-destory', notify.id);
            }, 850);
            StopAudio(notify);
            return;
        }
        parent.style.left = _px + 'px';
    };

    parent.onmouseenter = () => {
        electron.ipcRenderer.send('notify-manager-set-visibly', true);
    };
    parent.onmouseleave = () => {
        electron.ipcRenderer.send('notify-manager-set-visibly', false);
    };
    parent.onclick = () => {
        electron.ipcRenderer.send('notify-manager-onclick', notify.id);
    };

    setTimeout(() => {
        if(globalLock) return;
        if(!parent) return;
        parent.id = '';
        parent.className += ' hide';
        setTimeout(() => {
            try{parent.outerHTML = '';}catch{}
        }, 850);
        StopAudio(notify);
    }, notify.time * 1000);

    if(notify.sound){
        const audio = document.querySelector('audio');
        audio.src = notify.sound.url;
        try{
            audio.volume = notify.sound.volume / 100;
        }catch{
            audio.volume = 0.5;
        }
        audio.play();
    }
});

electron.ipcRenderer.on('destroy', async(_, notify) => {
    const element = document.getElementById(notify.id);
    if(!element) return console.log('notify of id ' + notify.id + ' not found');
    element.id = '';
    element.className += ' hide';
    setTimeout(() => element.outerHTML = '', 850);
    StopAudio(notify);
});

function StopAudio(notify) {
    if(!notify) return;
    if(!notify.sound) return;
    const audio = document.querySelector('audio');
    if(!audio) return;
    setTimeout(() => {
        if(audio.src == notify.sound.url){
            audio.pause();
        }
    }, 900);
}