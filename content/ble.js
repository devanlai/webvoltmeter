function UUIDFactory(template) {
    function expand_uuid(short_uuid_16) {
        return template.toLowerCase().replace("xxxx", short_uuid_16.toString(16).padStart(4, "0"));
    }
    return expand_uuid;
}

class BaseBLEDevice {
    constructor(device) {
        this._device = device;
        this._server = null;
        this._disconnect_callbacks = [];
    }

    get connected() {
        return this._device.gatt.connected;
    }

    add_disconnect_callback(callback) {
        if (!this._disconnect_callbacks.includes(callback)) {
            this._disconnect_callbacks.push(callback);
        }
    }

    remove_disconnect_callback(callback) {
        const index = this._disconnect_callbacks.indexOf(callback);
        if (index > -1) {
            this._disconnect_callbacks.splice(index, 1);
        }
    }

    async initialize(on_disconnect_callback=null) {
        let server = await this._device.gatt.connect();
        let attempts = 0;
        let max_attempts = 2;
        while (attempts < max_attempts) {
            try {
                await this.read_handles(server);
                this._server = server;
                break;
            } catch (err) {
                if (err.code == DOMException.NETWORK_ERR) {
                    if ((attempts < max_attempts) && !server.connected) {
                        attempts++;
                        server = await this._device.gatt.connect();
                        continue;
                    } else {
                        throw err;
                    }
                } else {
                    throw err;
                }
            }
        }

        this._device.addEventListener("gattserverdisconnected", event => {
            this.handle_disconnect(event);
        });
    }

    async disconnect() {
        await this._device.gatt.disconnect();
    }

    handle_disconnect(event) {
        if (!event.target.gatt.connected && evt.target == this._device) {
            for (let callback of this._disconnect_callbacks) {
                await callback(this, event);
            }
        }
    }

    async read_handles(gatt_server) {
        // To be implemented by subclasses
    }
}

export {
    UUIDFactory,
    BaseBLEDevice
};