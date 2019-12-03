/**
 * Factory function to generate helpers to convert short 16-bit UUIDs to the
 * equivalent fully qualified 128-bit UUID.
 * 
 * The template should be a fully formed UUID string, except the four digits
 * that are filled in with the 16-bit short UUID should have "xxxx" as a
 * placeholder.
 * 
 * @param {string} template - a template UUID string
 * @returns a function that accepts a 16-bit value and returns a UUID string
 */

function UUIDFactory(template) {
    function expand_uuid(short_uuid_16) {
        return template.toLowerCase().replace("xxxx", short_uuid_16.toString(16).padStart(4, "0"));
    }
    return expand_uuid;
}

class BaseBLEDevice {
    /**
     * Represents a simple wrapper around a native WebBluetooth object
     * 
     * @constructor
     * @param {WebBluetooth} device - the native WebBluetooth object to wrap
     */
    constructor(device) {
        this._device = device;
        this._server = null;
        this._disconnect_callbacks = [];
    }

    get connected() {
        return this._device.gatt.connected;
    }

    get name() {
        return this._device.name;
    }

    /**
     * Register a callback to run when the device connection is terminated.
     * The callback will be passed two arguments - this device and the
     * raw gattserverdisconnected event.
     * 
     * @param {*} callback 
     */
    add_disconnect_callback(callback) {
        if (!this._disconnect_callbacks.includes(callback)) {
            this._disconnect_callbacks.push(callback);
        }
    }

    /**
     * Unregister a previously registered disconnect callback.
     * 
     * @param {*} callback 
     */
    remove_disconnect_callback(callback) {
        const index = this._disconnect_callbacks.indexOf(callback);
        if (index > -1) {
            this._disconnect_callbacks.splice(index, 1);
        }
    }

    /**
     * Attempt to actually connect to the device and perform any
     * initial handle enumeration.
     *
     * This should be called before attempting to use the device.
     */
    async initialize() {
        let server = await this._device.gatt.connect();
        let attempts = 0;
        let max_attempts = 2;
        while (attempts < max_attempts) {
            try {
                await this.setup(server);
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

        this._device.addEventListener("gattserverdisconnected", async event => {
            await this.handle_disconnect(event);
        });
    }

    /**
     * Manually disconnect from the device.
     */
    async disconnect() {
        await this._device.gatt.disconnect();
    }

    /**
     * Internal handler for device disconnections
     * @param {gattserverdisconnected} event 
     */
    async handle_disconnect(event) {
        if (!event.target.gatt.connected && event.target == this._device) {
            for (let callback of this._disconnect_callbacks) {
                await callback(this, event);
            }
        }
    }

    /**
     * Perform internal initialization after connecting to a device for
     * the first time. At a minimum, finding and caching service/characteristic
     * handles.
     * 
     * @param {BluetoothRemoteGATTServer} gatt_server - the GATT server representing the remote device
     */
    async setup(gatt_server) {
        // To be implemented by subclasses
    }
}

export {
    UUIDFactory,
    BaseBLEDevice
};