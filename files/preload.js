const electron = require('electron');

electron.contextBridge.exposeInMainWorld('ipc', {
    on: (name, event) => electron.ipcRenderer.on(name, event),
    once: (name, event) => electron.ipcRenderer.once(name, event),
    send: (name, ...args) => electron.ipcRenderer.send(name, ...args),
});
electron.contextBridge.exposeInMainWorld('FocusNotify', (id) => FocusNotify(parseInt(id)));
electron.contextBridge.exposeInMainWorld('DefocusNotify', (id) => DefocusNotify(parseInt(id)));

let _loaded = false;
let position = 1;
const focusedNotify = [];
const NotifyList = [];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

window.addEventListener('DOMContentLoaded', () => _loaded = true);


class Notify {
    constructor(notify, click) {
        const block = document.getElementById('block');

        const parent = document.createElement('div');
        parent.className = 'notify';
        parent.id = notify.id;
        if (click) {
            parent.className += ' clickActive';
        }
        if (block.children < 1 || position == 2 || position == 3) {
            block.appendChild(parent);
        } else {
            block.insertBefore(parent, block.children[0]);
        }

        const title = document.createElement('span');
        title.className = 'title';
        title.innerHTML = notify.title;
        parent.appendChild(title);

        const area = document.createElement('div');
        area.style = 'display: flex;';
        parent.appendChild(area);

        if (notify.image) {
            const img = document.createElement('img');
            img.src = notify.image;
            area.appendChild(img);
        }

        const body = document.createElement('p');
        body.innerHTML = notify.body;
        area.appendChild(body);


        this.notify = notify;
        this.parent = parent;
        this.hideActive = false;
        this.blockHide = false;
        this.globalLock = false;
        this.offsetX = 0;


        this.isFocus = false;
        try { this.isFocus = !(!(parent.querySelector('input, textarea'))); } catch { }


        this.onmousedown = this.mousedown.bind(this);
        this.onmouseup = this.mouseup.bind(this);
        this.onmousemove = this.mousemove.bind(this);
        this.onmouseenter = this.mouseenter.bind(this);
        this.onmouseleave = this.mouseleave.bind(this);
        this.onclick = this.click.bind(this);

        parent.addEventListener('mousedown', this.onmousedown, false);
        parent.addEventListener('mouseup', this.onmouseup, false);
        parent.addEventListener('mousemove', this.onmousemove, false);
        parent.addEventListener('mouseenter', this.onmouseenter, false);
        parent.addEventListener('mouseleave', this.onmouseleave, false);
        parent.addEventListener('click', this.onclick, false);

        NotifyList.push(this);

        setTimeout(() => {
            if (focusedNotify.some(x => x == notify.id)) {
                const interv = setInterval(() => {
                    if (focusedNotify.some(x => x == notify.id)) {
                        return;
                    }

                    clearInterval(interv);
                    this.destroy();
                }, 500);
                return;
            }

            this.destroy();
        }, notify.time * 1000);

        if (notify.sound) {
            const audio = document.querySelector('audio');
            audio.src = notify.sound.url;
            try {
                audio.volume = notify.sound.volume / 100;
            } catch {
                audio.volume = 0.5;
            }
            audio.play();
        }
    }

    destroy() {
        if (this.globalLock) {
            return;
        }
        if (!this.parent) {
            return;
        }

        this.hideActive = true;
        this.blockHide = true;
        this.globalLock = true;

        this.parent.id = '';
        this.parent.classList.add('hide');

        this.parent.removeEventListener('mousedown', this.onmousedown, false);
        this.parent.removeEventListener('mouseup', this.onmouseup, false);
        this.parent.removeEventListener('mousemove', this.onmousemove, false);
        this.parent.removeEventListener('mouseenter', this.onmouseenter, false);
        this.parent.removeEventListener('mouseleave', this.onmouseleave, false);
        this.parent.removeEventListener('click', this.onclick, false);

        const index = NotifyList.indexOf(this);
        if (index > -1) {
            NotifyList.splice(index, 1);
        }

        setTimeout(() => {
            try {
                setTimeout(() => this.parent.remove(), 100);
                this.parent.setAttribute('send-height', this.parent.clientHeight + 'px');
                this.parent.classList.add('del');
            } catch { }
            electron.ipcRenderer.send('notify-manager-destory', this.notify.id);
        }, 750);

        StopAudio(this.notify);

        try { DefocusNotify(this.notify.id); } catch { }
    }

    mousedown(ev) {
        if (focusedNotify.some(x => x == this.notify.id)) {
            return;
        }
        if (this.blockHide) {
            return;
        }

        this.hideActive = true;
        this.offsetX = this.parent.offsetLeft - ev.clientX;
    };

    async mouseup() {
        if (this.globalLock) {
            return;
        }
        if (!this.hideActive) {
            return;
        }

        this.hideActive = false;
        this.offsetX = 0;
        this.blockHide = true;

        const pos = parseInt(this.parent.style.left.replace('px', ''));
        if (pos < 1) {
            this.parent.style.left = 0;
            this.blockHide = false;
            return;
        }
        const ms = (pos / 300 * 1000) / 50;
        const per = pos / 50;
        for (let i = 0; i < 50; i++) {
            this.parent.style.left = (pos - (per * i)) + 'px';
            await delay(ms);
        }
        this.parent.style.left = 0;
        this.blockHide = false;
    };

    mousemove(ev) {
        if (!this.hideActive) {
            return;
        }
        if (focusedNotify.some(x => x == this.notify.id)) {
            this.mouseup();
            this.hideActive = false;
            return;
        }

        const _px = (ev.clientX + this.offsetX);
        if (_px < 0 && (position == 1 || position == 2)) {
            return;
        }
        if (_px > 0 && (position == 3 || position == 4)) {
            return;
        }

        this.parent.style.left = _px + 'px';

        if (_px > 130 || _px < -130) {
            this.destroy();
        }
    };


    mouseenter() {
        electron.ipcRenderer.send('notify-manager-set-visibly', true, this.isFocus);
    };

    mouseleave() {
        electron.ipcRenderer.send('notify-manager-set-visibly', false);
    };

    click() {
        electron.ipcRenderer.send('notify-manager-onclick', this.notify.id);
    };
}


electron.ipcRenderer.once('load-position', async (_, _position) => {
    while (!_loaded) {
        await delay(1000);
    }

    document.body.className = 'position-' + _position;
    position = _position;
});


electron.ipcRenderer.once('custom-style', async (_, style) => {
    if (!style || typeof (style) != 'string' || style.length < 1) {
        return;
    }

    const element = document.createElement('style');
    element.innerHTML = style;
    document.head.appendChild(element);
});


const showFn = async (_, notify, click) => {
    while (!_loaded) {
        await delay(1000);
    }

    new Notify(notify, click);
};

const destroyFn = async (_, notify) => {
    const notifyObj = NotifyList.find(x => x.notify.id == notify.id);
    if (!notifyObj) {
        console.log('notify of id ' + notify.id + ' not found');
        return;
    }

    notifyObj.destroy();
};

electron.ipcRenderer.on('show', showFn);
electron.ipcRenderer.on('destroy', destroyFn);


function StopAudio(notify) {
    if (!notify) {
        return;
    }
    if (!notify.sound) {
        return;
    }

    const audio = document.querySelector('audio');
    if (!audio) {
        return;
    }

    if (audio.src == notify.sound.url) {
        audio.pause();
    }
}

function FocusNotify(id) {
    if (isNaN(id)) {
        return;
    }
    if (focusedNotify.indexOf(id) > -1) {
        return;
    }

    focusedNotify.push(id);
}
function DefocusNotify(id) {
    if (isNaN(id)) {
        return;
    }

    const index = focusedNotify.indexOf(id);
    if (0 > index) {
        return;
    }
    
    focusedNotify.splice(index, 1);
}

const onKeyDown = (e) => {
    if (e.code == 'F11') {
        e.preventDefault();
        return false;
    }
    if (e.altKey && e.code == 'F4') {
        e.preventDefault();
        return false;
    }
};
window.addEventListener('keydown', onKeyDown, false);